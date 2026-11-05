# Provider Compliance

How EKS, GKE, and AKS consume IPv4 addresses, side by side, for sizing subnets and pod ranges. Each provider's audit checks the API's plans against that provider's documented requirements; this page compares the providers and links to each audit's details:

| Topic | EKS | GKE | AKS |
|-------|-----|-----|-----|
| IP consumption model | [VPC CNI](EKS_COMPLIANCE_AUDIT.md#11-ipv4-address-consumption-model-eks-vpc-cni) | [Alias IP](GKE_COMPLIANCE_AUDIT.md#0-ipv4-address-consumption-model-gke-alias-ip) | [CNI Overlay](AKS_COMPLIANCE_AUDIT.md#0-ipv4-address-consumption-model-azure-cni-overlay) |
| IP exhaustion risk | [Analysis](EKS_COMPLIANCE_AUDIT.md#ip-exhaustion-risk-analysis) | [Analysis](GKE_COMPLIANCE_AUDIT.md#ip-exhaustion-risk-analysis) | [Analysis](AKS_COMPLIANCE_AUDIT.md#ip-exhaustion-risk-analysis) |
| NAT and outbound ports | [NAT Gateway](EKS_COMPLIANCE_AUDIT.md#21-nat-gateway--outbound-internet-connectivity) | [Cloud NAT](GKE_COMPLIANCE_AUDIT.md#01-cloud-nat--outbound-internet-connectivity) | [NAT Gateway](AKS_COMPLIANCE_AUDIT.md#21-azure-nat-gateway--outbound-connectivity) |
| Load balancer IPs | [EKS](EKS_COMPLIANCE_AUDIT.md#load-balancer-ip-consumption) | [GKE](GKE_COMPLIANCE_AUDIT.md#load-balancer-ip-consumption) | [AKS](AKS_COMPLIANCE_AUDIT.md#load-balancer-ip-consumption) |
| Pod range formula | [Prefix delegation](EKS_COMPLIANCE_AUDIT.md#ip-prefix-delegation-aws-specific) | [Alias range per node](GKE_COMPLIANCE_AUDIT.md#0-ipv4-address-consumption-model-gke-alias-ip) | [Overlay formula](AKS_COMPLIANCE_AUDIT.md#ip-allocation-formula---azure-cni-overlay) |

Tier sizes, address space separation, and private network mode are in [api.md](../api.md#address-space-separation); the layout rules and sizing formulas are in [kubernetes.md](../kubernetes.md).

## IP allocation models

| Component | EKS (VPC CNI) | GKE (VPC-native) | AKS (CNI Overlay) |
|-----------|---------------|------------------|-------------------|
| **Node IPs** | VPC subnet | VPC subnet | VNet subnet |
| **Pod IPs** | Secondary IPs on node ENIs, from the node subnets | Alias range per node, from a secondary range | A `/24` per node from the overlay CIDR, outside the VNet |
| **Service IPs** | Virtual ClusterIP range, outside the VPC | Virtual ClusterIP range | Virtual ClusterIP range |
| **Load balancer IPs** | Every ALB/NLB takes private IPs in its subnets; internet-facing public IPs are AWS-managed | Internal passthrough LBs take a node-subnet IP; proxy-based regional LBs need a proxy-only subnet; external IPs are Google-managed | Internal LBs take a frontend IP from their subnet; external public IPs are Azure-managed |
| **Pods share the node pool?** | **Yes**: exhaustion risk | No | No |
| **IP exhaustion risk** | **High** | Low | None in the VNet |

Under every model, pods get their own IPs rather than sharing the node's (except pods with `hostNetwork: true`), and service ClusterIPs are virtual: they take no VPC or VNet addresses and are not routable outside the cluster. Load balancers, by contrast, do take addresses on all three, so size load-balancer subnets for them.

On EKS the plan's `pods.cidr` is for an overlay CNI (Calico, Cilium). With the default VPC CNI, pods take node-subnet addresses: hyperscale's 3 × `/20` hold 12,273 usable IPs, about 108 nodes at 110 pods. See [EKS pod networking models](EKS_COMPLIANCE_AUDIT.md#critical-eks-pod-networking-models).

## Pod CIDR sizing

```
Total IPs needed = (max pods per node x max nodes) + buffer
```

Two allocation models give different capacities for the same range:

- **Per address**: the formula above. It fits IPAM that hands out small blocks as nodes need them, such as Calico's.
- **A fixed `/24` per node**: GKE sizes each node's alias range by max pods (a `/24` at 65-128), and AKS CNI Overlay gives every node a `/24` whatever its max pods. A range then holds `2^(24 - prefix)` nodes, however few pods each runs.

| CIDR | Addresses | Nodes at 110 pods (per address) | Nodes at a `/24` each  | Fit |
|------|-----------|---------------------------------|------------------------|-----|
| `/11` | 2,097,152 | 19,065 | 8,192 | Hyperscale (5,000 nodes) |
| `/13` | 524,288 | 4,766 | 2,048 | Up to about 2,000 nodes |
| `/16` | 65,536 | 595 | 256 | Large production |
| `/18` | 16,384 | 148 | 64 | Mid-sized clusters |
| `/20` | 4,096 | 37 | 16 | Small, fixed-size clusters |
| `/22` | 1,024 | 9 | 4 | Dev and test |

| Cluster | Pods at 110 per node, plus buffer | Per address | A `/24` per node |
|---------|-----------------------------------|-------------|------------------|
| 50 nodes | 5,500 + 50% = 8,250 | `/18` | `/18` (64 nodes); `/17` with the buffer |
| 500 nodes | 55,000 + 20% = 66,000 | `/15` (`/16` holds the pods, not the buffer) | `/15` (512 nodes); `/14` with the buffer |
| 5,000 nodes | 550,000 + 20% = 660,000 | `/12` (a `/13` is too small even before the buffer) | `/11` (8,192 nodes) |

That is why the hyperscale tier generates a `/11`: it fits 5,000 nodes under either model, including AKS, where lowering max pods does not shrink a node's `/24`.

**Address space for pods:** `100.64.0.0/10` (RFC 6598 shared address space) avoids clashes with corporate RFC 1918 networks, and EKS, GKE, and AKS overlay all accept it for pods. Pass it as `podsCidr`; the API also falls back to it when no RFC 1918 block outside the VPC has room (hyperscale on a `10.x` VPC gets `100.64.0.0/11`). Do not use `198.19.0.0/16`: AWS refuses to associate it with an RFC 1918 VPC ([AWS: CIDR block association restrictions](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html#add-cidr-block-restrictions)), and the API rejects it. Services must stay RFC 1918, since EKS requires it.

## Hyperscale tier compared (5,000 nodes, 110 pods per node)

| Provider | Node IPs | Pod IPs | Service IPs | VPC/VNet addresses needed |
|----------|----------|---------|-------------|---------------------------|
| **EKS** (VPC CNI) | 5,000 | 550,000 from the VPC | `/18`, virtual | **About 555,000**, plus load balancers |
| **GKE** | 5,000 | `/11` alias range (8,192 nodes at a `/24` each) | `/18`, virtual | **About 5,000**, plus internal load balancers |
| **AKS** | 5,000 | Up to 200,000 in the overlay (cluster scale target) | `/18`, virtual | **About 5,000**, plus internal load balancers and Application Gateway subnets |

EKS and AKS get 3 × `/20` node subnets (4,091 usable each; AWS and Azure reserve 5 per subnet), and GKE one `/19` (8,188 usable; GCP reserves 4), since a GKE cluster takes its nodes from one subnet. Every provider gets 3 × `/23` public subnets.

## Outbound NAT compared

The port arithmetic is the same everywhere: `NAT IPs needed = (nodes x ports per node) / 64,512`. At 5,000 nodes, 64 ports per node needs 5 IPs and 1,024 ports per node needs 80. What differs is how many IPs a gateway holds:

| | EKS (NAT Gateway) | GKE (Cloud NAT) | AKS (NAT Gateway) |
|-|-------------------|-----------------|-------------------|
| **IPs per gateway** | 8 (Elastic IPs: 2 by default quota) | 300 manual, or 2,500 auto-allocated | 16 |
| **Connections** | 55,000 per IP to each destination | No specific limit | 50,000 per IP to one destination |
| **80 IPs needs** | 10 gateways | 1 gateway | 5 gateways, and each subnet takes only one, so 5 node subnets (the plan has 3) |
| **Takes VPC addresses?** | 1 private IP per gateway address | No | No |

Sources: [AWS: NAT gateway basics](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html), [Google Cloud: Cloud NAT quotas](https://cloud.google.com/nat/quota), [Microsoft: Azure NAT Gateway resource](https://learn.microsoft.com/en-us/azure/nat-gateway/nat-gateway-resource). Each audit works through its provider's scenarios and quotas.

## Load balancer addresses compared

| Load balancer | EKS | GKE | AKS |
|---------------|-----|-----|-----|
| **External** | Private IPs in its public subnets (at least 1 per subnet) | None (Google-managed IP); a regional external Application LB needs a proxy-only subnet | None (Azure-managed public IP) |
| **Internal** | NLB: 1 IP per subnet; ALB: 1 or more per subnet as it scales | 1 node-subnet IP | 1 IP from its subnet |
| **Layer 7** | ALB: subnets of `/27` or larger with 8 free IPs | Internal Application LB: the proxy-only subnet | Application Gateway: a dedicated `/24` subnet |

With 20 external and 10 internal load balancers across 3 AZs, EKS uses about 90 VPC addresses, GKE and AKS about 10 each, and AKS adds a `/24` per Application Gateway.

## References

- [AWS: EKS pod networking (VPC CNI)](https://docs.aws.amazon.com/eks/latest/userguide/pod-networking.html)
- [Google Cloud: VPC-native clusters](https://cloud.google.com/kubernetes-engine/docs/concepts/alias-ips)
- [Microsoft: Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
