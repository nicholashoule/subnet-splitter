# Kubernetes Network Planning

How the API lays out a cluster's network, how big each range is, and the formulas behind the sizes. The [API reference](api.md) documents the request and response fields; the [cross-provider comparison](compliance/README.md) sets EKS, GKE, and AKS side by side; and each provider's audit ([EKS](compliance/EKS_COMPLIANCE_AUDIT.md), [GKE](compliance/GKE_COMPLIANCE_AUDIT.md), [AKS](compliance/AKS_COMPLIANCE_AUDIT.md)) checks the plans against that provider's documented requirements.

## How a plan is laid out

A plan keeps four address spaces apart, and no two ranges overlap:

| Space | Where | Plan field |
|-------|-------|------------|
| Nodes | Subnets inside the VPC | `subnets.private` |
| Control plane | One network inside the VPC | `subnets.controlPlane` |
| Load balancers | Public subnets, or internal load-balancer subnets in private mode, inside the VPC | `subnets.public`, `subnets.loadBalancer` |
| Pods | Outside the VPC, in an RFC 1918 block of their own, or `100.64.0.0/10` when none has room | `pods.cidr` |
| Services | Outside the VPC, in an RFC 1918 block used by neither the VPC nor the pods | `services.cidr` |

Subnets are placed first-fit, each at the lowest free offset aligned to its size: load-balancer subnets first, then node subnets, then the control plane, which usually fills the alignment gap between them. Generated pods prefer `10.0.0.0/8` and services `192.168.0.0/16`, and neither ever overlaps `172.17.0.0/16` (Docker's default bridge) or, for AKS, `172.30.0.0/16` and `172.31.0.0/16`. Every `vpcCidr` must be private and `/16` or smaller. The [API reference](api.md#address-space-separation) gives the full placement rules, overrides (`podsCidr`, `servicesCidr`), and warnings.

### Control plane

The control plane is one network in every tier, sized for what each provider needs:

| Provider | Control-plane subnets | Used for |
|----------|-----------------------|----------|
| EKS | 2 x `/28` in two AZs, one contiguous `/27` | `vpc_config.subnet_ids`: EKS requires two AZs, and naming only two subnets controls where its network interfaces land |
| GKE | 1 x `/28` | `master_ipv4_cidr_block`, or a private endpoint subnetwork |
| AKS | 1 x `/28` | API Server VNet Integration |
| Kubernetes | 1 x `/28` | Control-plane nodes; one subnet lets a floating API address (keepalived, kube-vip) move between them |

### Private network mode

`"networkMode": "private"` drops the public subnets for internal load-balancer subnets of the same size, and egress goes outside the layout:

| Provider | Load-balancer subnets | Egress |
|----------|-----------------------|--------|
| EKS | One per AZ (at least 2), tagged `kubernetes.io/role/internal-elb` | Transit gateway to an egress VPC, or VPC endpoints with no internet |
| GKE | 1 regional: the region's proxy-only subnet | Cloud NAT on a Cloud Router |
| AKS | 1 regional, for internal load balancer frontends | `userAssignedNATGateway` or `userDefinedRouting` |
| Kubernetes | One per zone | Your network's own NAT |

The [API reference](api.md#private-network-mode) explains each provider's choices and gives Terraform for them.

## Deployment tiers

The generic, GKE, and AKS layout, from `GET /api/k8s/tiers`:

| Tier | Nodes | Public | Private | Public size | Private size | Pods | Services | Min VPC |
|------|-------|--------|---------|-------------|--------------|------|----------|---------|
| **Micro** | 1 | 1 | 1 | /26 | /25 | /20 | /20 | /24 |
| **Standard** | 1-3 | 1 | 1 | /25 | /24 | /16 | /20 | /23 |
| **Professional** | 3-10 | 2 | 2 | /25 | /23 | /18 | /20 | /21 |
| **Enterprise** | 10-50 | 3 | 3 | /24 | /21 | /16 | /20 | /19 |
| **Hyperscale** | 50-5,000 | 3 | 3 | /23 | /20 | /11 | /18 | /18 |

Provider adjustments: EKS raises every subnet type to at least two (micro and standard then need a `/23` and `/22` VPC) and gives professional `/22` node subnets (a `/20` VPC) so they also hold VPC CNI pods; GKE hyperscale gets one `/19` node subnet, since a GKE cluster takes its nodes from one subnet. In private mode GKE and AKS get a single load-balancer subnet; every other column, including Min VPC, is unchanged. See [Deployment Tiers](api.md#deployment-tiers) for how to choose one.

## Sizing formulas

### Node subnets

```
Usable addresses = 2^(32 - prefix) - reserved
  reserved = 5 on AWS and Azure, 4 on GCP
  /20: 4,091 (AWS, Azure) or 4,092 (GCP)
```

### Pod ranges

A pod range's node capacity depends on how the provider hands out addresses:

```
Per address (Calico-style IPAM):  nodes = 2^(32 - prefix) / max pods per node
A fixed /24 per node (GKE at 65-128 max pods, AKS always, kube-controller-manager by default):  nodes = 2^(24 - prefix)
  /16: 256 nodes   /11: 8,192 nodes
```

The hyperscale `/11` therefore holds 8,192 nodes at a `/24` each, above the 5,000 that Kubernetes is tested to and AKS allows. The [cross-provider comparison](compliance/README.md#pod-cidr-sizing) has capacity tables and worked examples.

### GKE alias ranges

Each node gets an alias range sized by its max pods: 8 pods `/28`, 9-16 `/27`, 17-32 `/26`, 33-64 `/25`, 65-128 `/24`, 129-256 `/23`, 257-512 `/22`.

```
Q  = max pods per node (Standard: 110 default, up to 512; Autopilot: 8-256, chosen by GKE)
DS = pod range prefix
M  = 31 - ceil(log2(Q))     node pod range prefix
MN = 2^((32 - DS) - (32 - M))   maximum nodes
MP = MN * Q                 maximum pods
Hyperscale, 110 pods/node: M = 24, MN = 8,192, MP = 901,120 (the cluster limit is 200,000 pods)
```

A GKE cluster takes its nodes from one subnet, so hyperscale gets one `/19` node subnet (8,188 nodes). Past that, [add subnets](https://cloud.google.com/kubernetes-engine/docs/how-to/multi-subnet-cluster) for new node pools.

### EKS pods per node (VPC CNI)

```
Without prefix delegation: max pods = ENIs * (IPv4 per ENI - 1) + 2    (c5.large: 29)
With prefix delegation (Nitro): each IPv4 slot holds a /28 (16 addresses)
Managed node groups cap max pods at 110 (under 30 vCPUs) or 250
```

### AKS overlay

Every node gets a fixed `/24` from the overlay range, whatever its max pods, so node capacity is `2^(24 - prefix)` and lowering max pods does not help. 200,000 pods is the cluster's control-plane scale target.

## Provider notes

| | EKS | GKE | AKS |
|-|-----|-----|-----|
| **Pod model** | VPC CNI: secondary IPs from the node subnets; overlay CNI: `pods.cidr` | Alias ranges from the pod secondary range | CNI Overlay: `pods.cidr`, outside the VNet |
| **Max pods per node** | 110 or 250 (managed node groups) | 110 default, up to 512 (Standard); 8-256 (Autopilot) | 250 |
| **Max nodes** | No per-cluster quota; Kubernetes is tested to 5,000 | 65,000 (Standard), 5,000 (Autopilot) | 5,000 (Standard and Premium), 1,000 (Free) |
| **Details** | [EKS audit](compliance/EKS_COMPLIANCE_AUDIT.md) | [GKE audit](compliance/GKE_COMPLIANCE_AUDIT.md) | [AKS audit](compliance/AKS_COMPLIANCE_AUDIT.md) |

### EKS tier compliance

With the default VPC CNI, `pods.cidr` goes unused and pods take addresses from the node subnets, so those subnets bound pod capacity. A node running P pods takes at least P + 1 addresses, so at 110 pods per node each subnet holds at most `floor(usable / 111)` nodes:

| Tier | Node subnets | Usable per subnet | VPC CNI: nodes at 110 pods | Tier nodes |
|------|--------------|-------------------|----------------------------|------------|
| Micro | 2 x /25 | 123 | 2 | 1 |
| Standard | 2 x /24 | 251 | 4 | 1-3 |
| Professional | 2 x /22 | 1,019 | 18 | 3-10 |
| Enterprise | 3 x /21 | 2,043 | 54 | 10-50 |
| Hyperscale | 3 x /20 | 4,091 | 108 | 50-5,000 |

Hyperscale past about 100 nodes doesn't fit inside a `/16` VPC at 110 pods per node. Use an overlay CNI with `pods.cidr`, VPC CNI custom networking with a `100.64.0.0/10` `podsCidr` (a generated `pods.cidr` cannot be a secondary VPC CIDR), or fewer pods per node. The [EKS audit](compliance/EKS_COMPLIANCE_AUDIT.md#critical-eks-pod-networking-models) explains each option.

## Implementation

The generator is `client/src/lib/kubernetes-network-generator.ts`, the schemas and tier table are in `shared/kubernetes-schema.ts`, and `server/routes.ts` serves them. `tests/unit/network-separation.test.ts` checks the separation rules above for every tier, provider, and network mode; [tests/README.md](../tests/README.md#test-organization) lists what each test covers.
