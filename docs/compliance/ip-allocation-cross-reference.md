# Cloud Provider IPv4 Allocation Cross-Reference

> **Note**: Tier configurations updated February 8, 2026. See [api.md](../api.md) for current subnet sizes and VPC requirements.
>
> **Updated**: October 2, 2026 (plan format 2.0). Services are `/20` (`/18` for hyperscale), every plan adds a control-plane network inside the VPC (one `/28`; for EKS one `/27` split into two `/28`s in two AZs), and generated pod and service ranges avoid `172.17.0.0/16`. `"networkMode": "private"` replaces public subnets with internal load-balancer subnets. See [api.md](../api.md#address-space-separation).

**Last Updated**: October 2, 2026  
**Purpose**: Comprehensive comparison of how IPv4 addresses are consumed across EKS, GKE, and AKS

---

## Executive Summary

This document provides a detailed cross-reference of IPv4 address allocation patterns across the three major managed Kubernetes platforms. Understanding these differences is critical for proper subnet sizing and capacity planning.

**Key Insight**: Each platform has a fundamentally different approach to Pod IP allocation:
- **EKS**: Pods and Nodes share VPC CIDR (secondary IPs from ENI)
- **GKE**: Pods use separate alias IP ranges (automatic secondary ranges)
- **AKS**: Pods use overlay CIDR (completely separate from VNet)

---

## IPv4 Address Consumption Comparison

### IP Allocation Model Matrix

| Component | EKS (AWS) | GKE (Google Cloud) | AKS (Azure) |
|-----------|-----------|-------------------|-------------|
| **Node IPs** | VPC primary subnet | VPC primary subnet | VNet primary subnet |
| **Pod IPs** | VPC CIDR (secondary IPs from Node ENI) | Alias IP ranges (automatic secondary range) | Overlay CIDR (separate from VNet) |
| **Service IPs** | Separate virtual range (ClusterIP) | Separate virtual range (ClusterIP) | Separate virtual range (ClusterIP) |
| **LoadBalancer IPs** | ALB/NLB network interfaces take private IPs from their subnets; internet-facing ones also get AWS-managed public IPs | Internal passthrough LBs take a node-subnet IP; proxy-based regional LBs need a proxy-only subnet; external LB IPs are Google-managed | Internal LBs take a frontend IP from their subnet; external LB public IPs are Azure-managed |
| **Pods & Nodes Share Pool?** | **YES** (IP exhaustion risk) | NO (alias ranges automatic) | NO (overlay is separate) |
| **IP Exhaustion Risk** | **HIGH** (small subnets) | LOW (Google manages) | **NONE** (overlay decoupled) |

---

## Detailed IP Consumption by Provider

### 1. AWS EKS - VPC CNI Model

#### Network Architecture

**Primary Characteristic**: Pods and Nodes draw from the **same VPC CIDR space**

#### IP Allocation Details

**Node IPs**:
- **Source**: Primary VPC subnet (public or private subnets from our API)
- **Method**: Each Node gets 1 primary IP from VPC subnet
- **ENI**: Primary Elastic Network Interface per Node
- **Subnet Sizing**: Must accommodate both Nodes AND Pod secondary IPs

**Pod IPs**:
- **Source**: Same VPC CIDR as Nodes (secondary IPs from Node ENI)
- **Method**: Each Pod gets a secondary private IP address from the Node's ENI
- **NO SHARING**: Pods do NOT share the Node's IP (each gets unique secondary IP)
- **Exception**: Pods with `hostNetwork: true` share the Node's primary IP
- **Scaling Method**:
  - **Traditional**: Individual secondary IPs (how many depends on the instance type's ENIs and IPv4 addresses per ENI)
  - **Modern (IP Prefix Delegation)**: `/28` blocks (16 IPs per prefix, Nitro instances only)
  - **Max Pods/Node**: without prefix delegation, ENIs × (IPv4 addresses per ENI - 1) + 2 (c5.large: 3 × (10 - 1) + 2 = 29). Managed node groups cap it at 110 on instances with fewer than 30 vCPUs and 250 on larger ones ([AWS: choosing an Amazon EC2 instance type](https://docs.aws.amazon.com/eks/latest/userguide/choosing-instance-type.html))

**Service IPs**:
- **Source**: Separate virtual IP range (our API provides a `/20` Service CIDR, `/18` for hyperscale)
- **Method**: kube-apiserver allocates ClusterIPs from the Service CIDR; kube-proxy programs the forwarding on each node
- **Routing**: Internal routing only (not routable outside cluster)
- **Does NOT overlap**: Service CIDR is completely separate from VPC CIDR

**LoadBalancer IPs**:
- **Source**: The load balancer's subnets (public subnets for internet-facing, private or internal load-balancer subnets for internal)
- **Method**: An ALB or NLB creates a network interface with a private IP in each of its subnets, and an ALB adds more as it scales; each ALB subnet needs at least a `/27` with 8 free IPs ([AWS: Application Load Balancers](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)). An internet-facing load balancer also has public IPs that AWS manages, outside the VPC CIDR, reached through its DNS name
- **Consumes VPC CIDR**: Yes, private IPs from the load balancer's subnets
- **Integration**: Targets Node IPs or Pod IPs (depending on configuration)

#### IP Exhaustion Risk

 **CRITICAL RISK**: Small VPC subnets can run out of IPs because Pods and Nodes compete for the same pool

**Example Problem Scenario**:
- VPC Subnet: `10.0.0.0/24` (256 IPs)
- 10 Nodes: 10 IPs used
- 110 Pods/Node: 1,100 Pod IPs needed
- **Total Required**: 1,110 IPs
- **Available**: 256 IPs
- **Result**:  IP EXHAUSTION - Cluster cannot scale

**Solution**: With the default VPC CNI, pods share the node subnets, so those subnets bound pod capacity. Our Hyperscale tier's 3 × `/20` private subnets (4,091 usable IPs per subnet, since AWS reserves 5 per subnet; 3 subnets across 3 AZs) hold 12,273 addresses, about 108 nodes at 110 pods per node. The plan's `/13` pod CIDR is an overlay CNI's pool (Calico, Cilium), outside the VPC; the VPC CNI does not use it. For more VPC CNI pods, use custom networking with a `100.64.0.0/10` secondary CIDR (see [EKS Recommendations](#eks-recommendations))

#### IP Prefix Delegation (EKS-Specific)

**What It Is**: Modern AWS VPC CNI feature for Nitro-based instances

**How It Works**:
- Instead of individual secondary IPs, Nodes request `/28` CIDR blocks
- Each `/28` block provides 16 IP addresses
- Nodes can hold multiple prefixes (up to instance type limit)
- **Max Pods/Node**: Each IPv4 slot on an ENI holds 16 addresses instead of 1, so an instance holds far more pod addresses than without prefix delegation; managed node groups still cap max pods at 110 on instances with fewer than 30 vCPUs and 250 on larger ones

**Requirements**:
- Nitro-based EC2 instances (c5+, m5+, r5+, t3+, etc.)
- Subnets must have contiguous `/28` blocks available

---

## Pod CIDR Sizing Recommendations

### Formula for Right-Sizing Pod Networks

**Formula**:
```
Total IPs Needed = (Max Pods per Node × Max Nodes) + Buffer
```

**Two allocation models** (each number below says which it uses):
- **Per-address**: the formula above. It fits IPAM that hands out addresses in small blocks as nodes need them, such as Calico's.
- **A fixed `/24` per node**: GKE gives each node an alias range sized by its max pods (a `/24` at 65-128), and AKS CNI Overlay gives every node a `/24` whatever its max pods. A pod range then holds `2^(24 - prefix)` nodes (its address count / 256), however few pods each runs.

**Standard Practice**: Use 100.64.0.0/10 (RFC 6598 shared address space, "CG-NAT") to avoid conflicts with corporate RFC 1918 networks (10.x, 172.16.x, 192.168.x). EKS, GKE, and AKS overlay all accept it for pods. Do not use 198.19.0.0/16 (part of the RFC 2544 benchmarking block 198.18.0.0/15): AWS refuses to associate it with a VPC whose CIDRs are RFC 1918 ([AWS: IPv4 CIDR block association restrictions](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html#add-cidr-block-restrictions)), and this API rejects it as `podsCidr`.

**Minimums**: You typically need at least a /28 per subnet (16 IPs), but this is too small for practical Pod subnets.

**Realistic Example**: A /16 (65,536 IPs) is usually plenty for large clusters. If you have 3 AZs, you could assign a /18 (16,384 IPs) to each AZ's subnet, which supports thousands of Pods per zone.

### CIDR Size Comparison Table

| CIDR | Total IPs | Nodes at 110 pods/node (per-address) | Nodes at a `/24` per node | Suitability |
|------|-----------|--------------------------------------|---------------------------|-------------|
| **/13** | 524,288 | 4,766 | 2,048 | **OVERKILL** (Unless running hyper-scale clusters near the 200,000-pod limit). Wastes IP space. |
| **/16** | 65,536 | 595 | 256 | **IDEAL** (Standard for large enterprise clusters). |
| **/18** | 16,384 | 148 | 64 | **GOOD** (Sufficient for mid-sized clusters). |
| **/20** | 4,096 | 37 | 16 | **TIGHT** (Okay for small, fixed-size clusters). |
| **/22** | 1,024 | 9 | 4 | **MINIMAL** (Dev/test only). |

### Real-World Sizing Examples

#### Example 1: Standard Production Cluster (50 nodes)
```
Max Nodes: 50
Max Pods per Node: 110 (Kubernetes' tested per-node limit; GKE Standard default)
Total Pods: 50 × 110 = 5,500 pods
With 50% Buffer: 5,500 × 1.5 = 8,250 IPs needed

Per-address:     /18 (16,384 IPs), or /16 (65,536 IPs) for growth
A /24 per node:  50 × 256 = 12,800 addresses: /18 (64 nodes);
                 /17 (128 nodes) with the 50% buffer (75 nodes)
```

#### Example 2: Large Enterprise Cluster (500 nodes)
```
Max Nodes: 500
Max Pods per Node: 110
Total Pods: 500 × 110 = 55,000 pods
With 20% Buffer: 55,000 × 1.2 = 66,000 IPs needed

Per-address:     /16 (65,536 IPs) holds the 55,000 pods but not the
                 66,000 with buffer; /15 (131,072 IPs) holds both
A /24 per node:  500 × 256 = 128,000 addresses: /15 (512 nodes);
                 /14 (1,024 nodes) with the 20% buffer (600 nodes)
```

#### Example 3: Hyper-Scale Cluster (5,000 nodes)
```
Max Nodes: 5,000
Max Pods per Node: 110
Total Pods: 5,000 × 110 = 550,000 pods
With 20% Buffer: 550,000 × 1.2 = 660,000 IPs needed

Per-address:     /12 (1,048,576 IPs), the smallest block that holds
                 660,000; /13 (524,288 IPs) is smaller than 550,000,
                 so it cannot hold 5,000 nodes × 110 pods even before
                 the buffer
A /24 per node:  5,000 × 256 = 1,280,000 addresses: /11 (8,192 nodes),
                 which also covers the 20% buffer (6,000 nodes).
                 Alternative: GKE Standard with max pods per node
                 lowered to 32 (a /26 per node, 160,000 pods at 5,000
                 nodes) fits in a /13 (8,192 nodes)
```

### Our API Tier Configurations (Updated February 8, 2026)

| Tier | Max Nodes | Pod CIDR | Total IPs | Rationale |
|------|-----------|----------|-----------|------------|
| **Micro** | 1 | /20 | 4,096 | Small dev/test (16 nodes capacity at a /24 per node) |
| **Standard** | 1-3 | /16 | 65,536 | Development/testing with generous headroom |
| **Professional** | 3-10 | /18 | 16,384 | Small production (64 nodes capacity at a /24 per node) |
| **Enterprise** | 10-50 | /16 | 65,536 | **IDEAL** - Large production (256 nodes capacity at a /24 per node) |
| **Hyperscale** | 50-5000 | /13 | 524,288 | Global scale, sized to GKE's 200,000 pods-per-cluster limit. At a /24 per node (AKS overlay always; GKE at 65-128 max pods) /13 covers 2,048 nodes. 5,000 nodes needs GKE Standard max pods per node of 32 or fewer (/26 per node), or a /11 `podsCidr` (the only option on AKS) |

### Alternative: CG-NAT Ranges for Pod Networks

**Problem**: Corporate networks often use RFC 1918 ranges (10.x, 172.16.x, 192.168.x) extensively, creating VPN/peering conflicts.

**Solution**: Use **CG-NAT (Carrier-Grade NAT)** ranges for Pod networks:

**Non-RFC 1918 Range**:
- **100.64.0.0/10** (RFC 6598 shared address space, "CG-NAT"): 4,194,304 IPs (perfect for massive clusters). Microsoft supports it for AKS overlay pod CIDRs, it is a valid GCP subnet range, and AWS lets a VPC add a secondary block from it
- **198.19.0.0/16** (RFC 2544 benchmarking space): **not supported**. AWS refuses to associate it with an RFC 1918 VPC, and the API rejects it as `podsCidr` (pods must be RFC 1918 or `100.64.0.0/10`)

**In this API**: pass a `100.64.0.0/10` range as `podsCidr` (`/10` to `/24`; the API accepts `/8` to `/24` overall, but inside `100.64.0.0/10` the largest is the `/10` itself) to use it for pods. Generated pods also fall back to `100.64.0.0/10` when no RFC 1918 block outside the VPC (and outside a `servicesCidr` you pass) has room, as for AKS hyperscale on a `10.x` VNet (`100.64.0.0/13`). `servicesCidr` must stay RFC 1918, since EKS requires an RFC 1918 service range.

**Benefits**:
- No conflicts with corporate RFC 1918 networks
- Large contiguous address space
- Reserved by RFC 6598 for shared (carrier-grade NAT) use, so it is not routed on the public internet
- Kubernetes CNI plugins support it

**Example**:
```yaml
# EKS with Custom CNI (Calico)
apiVersion: operator.tigera.io/v1
kind: Installation
metadata:
  name: default
spec:
  calicoNetwork:
    ipPools:
    - cidr: 100.64.0.0/16  # CG-NAT range for pods
      encapsulation: VXLAN
```

### Best Practices Summary

1. **Use /16 for most production clusters** (65,536 IPs)
2. **Use /18 for mid-sized clusters** (16,384 IPs) - good balance
3. **Use /20 for small dev/test** (4,096 IPs) - minimum practical size
4. **Use /13 only for very large clusters** (524,288 IPs): it holds 2,048 nodes at a `/24` per node, or about 4,766 at 110 pods per node per-address. It cannot hold 5,000 nodes × 110 pods: that needs a /12 (per-address) or a /11 (a `/24` per node)
5. **Consider 100.64.0.0/10** (RFC 6598, CG-NAT) for pods to avoid RFC 1918 conflicts; not 198.19.0.0/16, which AWS refuses for RFC 1918 VPCs and this API rejects
6. **Plan for 20-50% buffer** beyond current needs for growth
7. **Use per-AZ /18 subnets** when distributing /16 across 3 availability zones
- Enable via: `kubectl set env daemonset aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true`

**Fragmentation Risk**: If subnets have scattered secondary IPs, prefix allocation can fail

---

### 2. Google GKE - Alias IP Model

#### Network Architecture

**Primary Characteristic**: Pods use **alias IP ranges** (automatic secondary ranges separate from Node subnet)

#### IP Allocation Details

**Node IPs**:
- **Source**: VPC primary subnet (private subnets from our API)
- **Method**: Each Node gets 1 primary IP from VPC subnet
- **Sizing**: Node subnet only needs to accommodate Node count (NOT Pods)

**Pod IPs**:
- **Source**: Alias IP ranges (automatic secondary ranges)
- **Method**: Each Node gets an alias IP range from the Pod CIDR sized by max pods per node: 8 pods `/28`, 9-16 `/27`, 17-32 `/26`, 33-64 `/25`, 65-128 `/24` (256 addresses), 129-256 `/23`, 257-512 `/22`
- **Google-Managed**: Alias ranges automatically allocated by GKE
- **Does NOT consume Node subnet**: Pod IPs come from separate secondary range
- **Max Pods/Node**: Standard: 110 by default, configurable up to 512. Autopilot: GKE chooses 8 to 256 by expected Pod density, and it cannot be set ([GKE: configure maximum Pods per node](https://cloud.google.com/kubernetes-engine/docs/how-to/flexible-pod-cidr))

**GKE Pod CIDR Formula**:
```
Given:
  Q = Max pods per node (Standard: 110 default, up to 512;
      Autopilot: 8 to 256, chosen by GKE)
  DS = Pod subnet prefix size (e.g., /13)

Calculation:
  M = 31 - ⌈log₂(Q)⌉  (netmask size for node's pod range)
  HM = 32 - M         (host bits for node pod range)
  HD = 32 - DS        (host bits for pod subnet)
  MN = 2^(HD - HM)    (maximum nodes)
  MP = MN × Q         (maximum pods)

Example (Hyperscale, 110 pods/node):
  M = 31 - ⌈log₂(110)⌉ = 24
  HM = 8
  HD = 19 (for /13)
  MN = 2^(19-8) = 2,048 nodes
  MP = 2,048 × 110 = 225,280 pods
```

**Service IPs**:
- **Source**: Separate virtual IP range (our API provides a `/20` Service CIDR, `/18` for hyperscale)
- **Method**: kube-apiserver allocates ClusterIPs from the Service CIDR; kube-proxy programs the forwarding on each node
- **Does NOT overlap**: Service CIDR is separate from VPC CIDR and Pod CIDR

**LoadBalancer IPs**:
- **Internal passthrough Network LB** (internal Service `type: LoadBalancer`): takes one IP from the node subnet
- **Proxy-based regional LBs** (internal Application LB, as used by `gce-internal` Ingress; regional external Application LB): the proxies take IPs from a proxy-only subnet in the region (the plan's load-balancer subnet in private mode)
- **External LBs**: the external IP is Google-managed and does not come from the VPC

#### IP Exhaustion Risk

 **LOW RISK**: Google manages alias IP ranges automatically. Node subnet only needs Node IPs, not Pod IPs

**Why It's Better Than EKS**:
- Node subnet doesn't need Pod IP space
- Pod CIDR is separate and automatically managed
- No fragmentation issues (Google handles allocation)
- Easier capacity planning

---

### 3. Azure AKS - CNI Overlay Model

#### Network Architecture

**Primary Characteristic**: Pods use **overlay CIDR** (completely decoupled from VNet)

#### IP Allocation Details

**Node IPs**:
- **Source**: VNet primary subnet (private subnets from our API)
- **Method**: Each Node gets 1 primary IP from VNet subnet
- **Sizing**: Node subnet only needs to accommodate Node count (NOT Pods)

**Pod IPs**:
- **Source**: Overlay CIDR (completely separate from VNet)
- **Method**: Each Node gets a fixed `/24` from the overlay CIDR, whatever its max pods; each Pod gets an IP from its node's `/24` (no VNet consumption)
- **Azure-Managed**: Overlay network automatically configured by AKS
- **Does NOT consume VNet**: Pod IPs never touch VNet address space
- **Max Pods/Node**: 250, the CNI Overlay default and maximum ([Microsoft: Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay)); this document plans with 110
- **Max Pods/Cluster**: 200,000 pods (CNI Overlay limit)

**Azure CNI Overlay Formula**:
```
With Azure CNI Overlay:
  Pod_Capacity = Overlay_CIDR_Size - Reserved
  
  Example: /13 overlay CIDR
  Addresses = 2^(32-13) = 524,288
  Pod_Capacity = 524,288 / 1.1 (overhead) = ~477,000 pods
  
  Actual AKS Limit: 200,000 pods per cluster
```

**Service IPs**:
- **Source**: Separate virtual IP range (our API provides a `/20` Service CIDR, `/18` for hyperscale)
- **Method**: kube-apiserver allocates ClusterIPs from the Service CIDR; kube-proxy programs the forwarding on each node
- **Does NOT overlap**: Service CIDR is separate from VNet and Overlay CIDR

**LoadBalancer IPs**:
- **Internal LB**: each frontend takes a private IP from a VNet subnet (the plan's internal load-balancer subnet in private mode)
- **External LB**: frontends are public IPs that Azure manages, outside the VNet CIDR

#### IP Exhaustion Risk

 **NO RISK**: Overlay CIDR is completely decoupled from VNet. Infinite flexibility for pod IP allocation.

**Why It's the Best Model**:
- VNet subnet only needs Node IPs
- Pod IPs never compete with Node IPs
- No VNet IP pressure regardless of pod count
- Simplest capacity planning

**Comparison to Azure CNI (Direct)**:
- **Azure CNI (Direct)**: Pods get VNet IPs directly (similar to EKS model, IP exhaustion risk)
- **Azure CNI Overlay**: Pods use overlay (Microsoft's recommended approach for large clusters)

---

## IP Consumption Formulas by Tier

### Hyperscale Tier Example (5,000 nodes, 110 pods/node)

| Provider | Node IPs Required | Pod IPs Required | Service IPs | LoadBalancer IPs | Total VPC/VNet Impact |
|----------|------------------|------------------|-------------|------------------|---------------------|
| **EKS** | 5,000 (VPC) | 550,000 (VPC secondary) | 16,384 (separate, /18) | Private IPs in the LB subnets ([below](#hyperscale-tier-load-balancer-ip-consumption-5000-nodes)) | **555,000 VPC IPs needed**, plus load balancers |
| **GKE** | 5,000 (VPC) | 225,280 (alias range) | 16,384 (separate, /18) | Internal LBs only | **5,000 VPC IPs needed**, plus internal load balancers |
| **AKS** | 5,000 (VNet) | 200,000 (overlay) | 16,384 (separate, /18) | Internal LBs only | **5,000 VNet IPs needed**, plus internal load balancers |

**Key Insight**: 
- **EKS**: Needs 555K VPC IPs (Nodes + Pods compete)
- **GKE**: Needs 5K VPC IPs (alias ranges separate)
- **AKS**: Needs 5K VNet IPs (overlay completely separate)

**Pod range note**: The GKE row's 225,280 pods is the most our hyperscale `/13` pod range holds at 110 max pods per node: GKE (65-128 max pods) and AKS overlay (always) reserve a `/24` per node, so `/13` covers 2,048 nodes. Running 5,000 nodes on `/13` requires GKE Standard max pods per node <= 32 (`/26` per node). On AKS, lowering max pods does not shrink the `/24`, so pass a `/11` `podsCidr` instead.

---

## Subnet Sizing Recommendations

### EKS Recommendations

**Problem**: Pods and Nodes share VPC CIDR space

**Hyperscale Tier (5,000 nodes, 110 pods/node)**:
- **Private Subnets**: 3 × `/20` (4,091 usable IPs per subnet = 12,273 IPs total; AWS reserves 5 per subnet)
- **Public Subnets**: 3 × `/23` (507 usable IPs per subnet for load balancers and NAT gateways, which take private IPs from them)
- **Why**: Private subnets for Nodes, public for ingress. Under the default VPC CNI the node subnets also hold every pod, and 12,273 addresses fit about 108 nodes at 110 pods per node (each takes at least 111), nowhere near 5,000
- **Distribution**: 3 subnets across 3 AZs
- **Pod CIDR**: `/13` (524K IPs), for an overlay CNI (Calico, Cilium); the default VPC CNI does not use it. It is less than the 550,000 pods of 5,000 nodes × 110, so plan fewer pods per node at full scale
- **VPC CNI at this scale**: use custom networking, with pods in subnets of a secondary VPC CIDR from `100.64.0.0/10` (pass it as `podsCidr`). A secondary block is at most `/16`, about 590 nodes at 110 pods, so 5,000 nodes needs several blocks (AWS allows 5 IPv4 CIDR blocks per VPC by default, a quota you can raise)
- **IP Prefix Delegation**: REQUIRED for high-density (>100 pods/node)
- **Control plane**: 2 × `/28` cluster subnets in two AZs, forming one `/27`, for `vpc_config.subnet_ids` (exactly two in every EKS tier)

### GKE Recommendations

**Advantage**: Node subnet only needs Node IPs

**Hyperscale Tier (5,000 nodes)**:
- **Private Subnets**: 3 × `/20` (4,092 usable IPs per subnet; GCP reserves 4) - for Nodes only. A cluster takes its nodes from one default subnet, so one `/20` holds 4,092 nodes; 5,000 needs a `/19` or [additional subnets](https://cloud.google.com/kubernetes-engine/docs/how-to/multi-subnet-cluster) for new node pools
- **Public Subnets**: 3 × `/23` (508 usable IPs per subnet for load balancers)
- **Why**: Google manages alias ranges automatically; smaller subnets are practical
- **Pod CIDR**: `/13` (524K IPs via alias ranges). At 65-128 max pods GKE reserves a `/24` per node, so this covers 2,048 nodes; 5,000 nodes requires GKE Standard max pods per node <= 32 (`/26` per node) or a `/11` `podsCidr`
- **Control plane**: one `/28` range for `master_ipv4_cidr_block`; subnets are regional (no zone)
- **No fragmentation**: Google handles allocation

### AKS Recommendations

**Advantage**: Overlay CIDR is completely decoupled

**Hyperscale Tier (5,000 nodes)**:
- **Private Subnets**: 3 × `/20` (4,091 usable IPs per subnet; Azure reserves 5) - for Nodes only
- **Public Subnets**: 3 × `/23` (507 usable IPs per subnet for load balancers)
- **Why**: Pods use overlay network (no VNet pressure); smaller subnets practical
- **Overlay CIDR**: `/13` (524K IPs) - separate overlay network. CNI Overlay gives every node a fixed `/24` whatever its max pods, so this covers 2,048 nodes; 5,000 nodes requires a larger pod CIDR, such as a `/11` `podsCidr`
- **Control plane**: one `/28` API Server VNet Integration subnet; subnets are regional (no zone)
- **Max Pods**: 200,000 cluster limit (AKS constraint)

---

## Common Misconceptions

### Misconception 1: "Pods share Node IPs"

 **FALSE** for all three platforms:
- **EKS**: Pods get unique secondary IPs from Node ENI (NOT shared)
- **GKE**: Pods get unique alias IPs from the Node's alias range (a `/24` at 65-128 max pods) (NOT shared)
- **AKS**: Pods get unique overlay IPs (NOT shared)

**Exception**: Pods with `hostNetwork: true` DO share the Node's IP (all platforms)

### Misconception 2: "Service CIDR consumes VPC/VNet space"

 **FALSE** for all three platforms:
- Service CIDR is a virtual IP range for ClusterIP services
- Allocated by kube-apiserver; kube-proxy programs forwarding for in-cluster traffic only
- Does NOT overlap with VPC/VNet CIDR
- Not routable outside the cluster

### Misconception 3: "LoadBalancers never consume VPC/VNet IPs"

 **FALSE** for all three platforms:
- **EKS**: Every ALB and NLB, internal or internet-facing, takes private IPs from its subnets (an ALB subnet needs at least a `/27` with 8 free IPs); AWS NAT gateways also take a private IP from their subnet. Only the public IPs of internet-facing load balancers are AWS-managed and outside the VPC
- **GKE**: Internal passthrough load balancers take a node-subnet IP, and proxy-based regional load balancers need a proxy-only subnet. External load balancers' IPs are Google-managed and outside the VPC
- **AKS**: Internal load balancers take a frontend IP from their subnet. External load balancers' public IPs are Azure-managed and outside the VNet
- Size load-balancer subnets for these addresses; see [Load Balancer IP Consumption Comparison](#load-balancer-ip-consumption-comparison)

### Misconception 4: "All platforms have IP exhaustion risk"

 **PARTIALLY FALSE**:
-  **EKS**: HIGH RISK (Pods and Nodes share VPC CIDR)
-  **GKE**: LOW RISK (Google manages alias ranges)
-  **AKS**: NO RISK (overlay is completely decoupled)

---

## Summary Table: IPv4 Consumption at a Glance

| Aspect | EKS | GKE | AKS |
|--------|-----|-----|-----|
| **Pods share Node subnet?** |  YES (secondary IPs) |  NO (alias ranges) |  NO (overlay) |
| **IP exhaustion risk?** |  HIGH |  LOW | [FAIL] NONE |
| **Subnet sizing complexity** | High (must account for Pods) | Medium (Google helps) | Low (just Nodes) |
| **Prefix delegation needed?** |  YES (Nitro instances) | [FAIL] NO (automatic) | [FAIL] NO (overlay) |
| **Fragmentation risk?** |  YES (prefix allocation) | [FAIL] NO (Google manages) | [FAIL] NO (overlay) |
| **Best for large clusters?** | WARNING With careful planning |  YES |  YES |

---

## NAT Gateway & Outbound Connectivity Comparison

### SNAT Port Exhaustion Formula

**Universal Formula** (from [Google Cloud Best Practices](https://cloud.google.com/blog/products/networking/6-best-practices-for-running-cloud-nat)):
```
External IPs needed = ((# of instances) × (Ports / Instance)) / Ports per IP
```

### NAT Gateway Models by Provider

| Aspect | EKS (AWS NAT Gateway) | GKE (Cloud NAT) | AKS (Azure NAT Gateway) |
|--------|----------------------|----------------|------------------------|
| **Ports per IP** | 64,512 (1024-65535) | 64,512 (1024-65535) | 64,512 SNAT ports |
| **Default ports/VM** | Dynamic | 64 | Dynamic |
| **Max ports/VM** | 64,512 | 64,512 | 64,512 per public IP (allocated on demand) |
| **Max IPs per gateway** | 8 IPv4 addresses (Elastic IPs: 2 by default quota) | 300 manually assigned, or 2,500 auto-allocated | 16 |
| **Connection limit** | 55,000 per IP to each unique destination | No specific limit | 50,000 concurrent per public IP to the same destination; 2 million active connections |
| **Bandwidth** | 100 Gbps | No limit | 50 Gbps (Standard) |
| **IP allocation model** | Up to 8 IPs per gateway, each with an Elastic IP and a private IP from the gateway's subnet | Multiple IPs per gateway | Multiple IPs per gateway |
| **Scaling strategy** | Add IPs (up to 8), then more gateways | Add IPs to gateway | Add IPs (up to 16); a subnet takes only one NAT gateway, so more gateways need more subnets |

Sources: [AWS: NAT gateway basics](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-basics.html), [Google Cloud: Cloud NAT quotas and limits](https://cloud.google.com/nat/quota), [Google Cloud: tune NAT configuration](https://cloud.google.com/nat/docs/tune-nat-configuration), [Microsoft: Azure NAT Gateway resource](https://learn.microsoft.com/en-us/azure/nat-gateway/nat-gateway-resource).

### Hyperscale Tier NAT Gateway Calculations (5,000 Nodes)

#### Scenario 1: Low Connection Density (64-128 ports/node)

| Provider | Calculation | Result |
|----------|-------------|--------|
| **EKS** | 5,000 × 64 = 320,000 ports<br>320,000 / 64,512 = 5 IPs<br>1 NAT Gateway (up to 8 IPs) | **1 NAT Gateway** (3 for one per AZ)<br>**5 Elastic IPs** |
| **GKE** | 5,000 × 64 = 320,000 ports<br>320,000 / 64,512 = 5 IPs<br>1 Cloud NAT gateway | **1 Cloud NAT gateway**<br>**5 External IPs** |
| **AKS** | 5,000 × 128 = 640,000 ports<br>640,000 / 64,512 = 10 IPs<br>1 NAT Gateway (up to 16 IPs) on the node subnets | **1 NAT Gateway**<br>**10 Public IPs** |

#### Scenario 2: High Connection Density (1,024 ports/node)

| Provider | Calculation | Result |
|----------|-------------|--------|
| **EKS** | 5,000 × 1,024 = 5,120,000 ports<br>5,120,000 / 64,512 = 80 IPs<br>80 / 8 IPs per gateway = 10 NAT Gateways | **10 NAT Gateways**<br>**80 Elastic IPs**<br>WARNING HIGH COST |
| **GKE** | 5,000 × 1,024 = 5,120,000 ports<br>5,120,000 / 64,512 = 80 IPs<br>1 Cloud NAT gateway | **1 Cloud NAT gateway**<br>**80 External IPs** |
| **AKS** | 5,000 × 1,024 = 5,120,000 ports<br>5,120,000 / 64,512 = 80 IPs<br>16 IPs per gateway, one gateway per subnet: the plan's 3 node subnets allow 3 gateways, 48 IPs (3,096,576 ports, about 619 per node) | **3 NAT Gateways at most**<br>**48 Public IPs**<br>WARNING 80 IPs need at least 5 node subnets (5 × 16), or fewer ports per node |

Each Elastic IP past 2 on an AWS NAT gateway needs a quota increase. One NAT gateway per AZ (typically 3, for HA) spreads these IPs across the gateways.

### NAT Gateway Quota Limits

| Resource | EKS (AWS) | GKE (Google Cloud) | AKS (Azure) |
|----------|-----------|-------------------|-------------|
| **NAT Gateways per region** | 5 per AZ (soft) | 50 per Cloud Router; up to 250 per region per VPC network (5 Cloud Routers per region) | At most one per subnet (the resource page states no per-region count) |
| **IPs per gateway** | 8 max (Elastic IPs: 2 by default quota) | 300 manually assigned, or 2,500 auto-allocated | 16 max (hard limit) |
| **Max VMs per gateway** | No limit | No documented limit (NAT IPs × 64,512 ports / ports per VM bounds it) | No specific limit |
| **Idle timeout** | 350s TCP (fixed) | 1,200s TCP established (configurable) | 4-120 min (configurable) |

### Best Practices Summary

**EKS**:
- [PASS] Deploy NAT Gateway per AZ (typically 3 for HA)
- [PASS] Monitor connection limits (55,000 per IP to each unique destination)
- WARNING Cost scales with gateway count
- [PASS] Use VPC Endpoints for AWS services to reduce NAT traffic

**GKE**:
- [PASS] A single Cloud NAT gateway holds 300 manually assigned or 2,500 auto-allocated NAT IPs
- [PASS] Start with 64 ports/VM, increase to 1024+ for API-heavy workloads
- [PASS] Use multiple NAT gateways for isolation (per node pool)
- [PASS] Monitor `nat/sent_packets_count` and `nat/dropped_sent_packets_count`

**AKS**:
- [PASS] Single NAT Gateway supports up to 1,032,192 SNAT ports (16 IPs × 64,512)
- WARNING Each subnet takes at most one NAT gateway, so the hyperscale plan's 3 node subnets allow 3 (48 IPs, about 619 ports per node at 5,000 nodes); more needs more node subnets
- [PASS] Use Azure Private Link for Azure services
- WARNING Be aware of token bucket API throttling for large scale operations

---

## Load Balancer IP Consumption Comparison

### Load Balancer Types & IP Sources

| LB Type | EKS (AWS) | GKE (Google Cloud) | AKS (Azure) |
|---------|-----------|-------------------|-------------|
| **External (Internet-facing)** | ALB/NLB<br>AWS-managed public IPs<br>[PASS] Private IPs from its public subnets (at least 1 per subnet) | Passthrough Network LB or global external Application LB<br>Google-managed IPs<br>[FAIL] No VPC impact (a regional external Application LB needs a proxy-only subnet) | Azure LB (Standard)<br>Azure-managed public IPs<br>[FAIL] No VNet impact |
| **Internal (Private)** | Internal ALB/NLB<br>[PASS] NLB: 1 IP per subnet; ALB: 1 or more per subnet as it scales | Internal passthrough Network LB<br>[PASS] 1 IP from the node subnet | Internal LB (Standard)<br>[PASS] 1 IP from VNet subnet |
| **Layer 7 (HTTP/HTTPS)** | ALB<br>[PASS] Private IPs from its subnets (each a `/27` or larger with 8 free IPs) | Global external Application LB: Google-managed IP, no VPC impact<br>Internal Application LB: [PASS] proxy-only subnet | Application Gateway<br>[PASS] Dedicated /24 subnet |

### Kubernetes Service Integration

**Service Type: LoadBalancer (External)**

| Provider | Result | IP Consumption |
|----------|--------|----------------|
| **EKS** | Provisions NLB or CLB<br>DNS name and AWS-managed public IPs | [PASS] Private IPs from its public subnets (NLB: 1 per subnet, 3 in a 3-AZ cluster) |
| **GKE** | Provisions Regional Network LB<br>Google external IP | [FAIL] No VPC IPs |
| **AKS** | Provisions Azure LB (Standard)<br>Azure public IP | [FAIL] No VNet IPs |

**Service Type: LoadBalancer (Internal)**

| Provider | Result | IP Consumption |
|----------|--------|----------------|
| **EKS** | Internal NLB<br>1 IP per AZ | [PASS] 3 IPs (3-AZ cluster) |
| **GKE** | Internal TCP/UDP LB<br>1 IP per LB | [PASS] 1 IP |
| **AKS** | Internal LB (Standard)<br>1 IP per LB | [PASS] 1 IP |

### Hyperscale Tier Load Balancer IP Consumption (5,000 Nodes)

**Estimated Services**: 20 external, 10 internal

| Provider | External LBs | Internal LBs | VPC/VNet IP Impact |
|----------|-------------|-------------|-------------------|
| **EKS** | 20 ALB/NLB<br>20 × 3 AZs = 60+ private IPs (ALBs add more as they scale); public IPs AWS-managed | 10 Internal NLB<br>10 × 3 AZs = 30 IPs | **90+ VPC IPs consumed** |
| **GKE** | 20 External LB<br>Google IPs | 10 Internal LB<br>10 × 1 IP = 10 IPs | **10 VPC IPs consumed** |
| **AKS** | 20 Azure LB<br>Azure IPs | 10 Internal LB<br>10 × 1 IP = 10 IPs | **10 VNet IPs consumed** |

### Ingress Controller IP Consumption

| Provider | Ingress Type | IP Consumption |
|----------|-------------|----------------|
| **EKS** | AWS Load Balancer Controller<br>(provisions an ALB per Ingress, or per IngressGroup) | [PASS] Private IPs from its subnets: at least 1 per subnet (3 in 3 AZs), more as it scales; each subnet a `/27` or larger with 8 free IPs<br>Internet-facing: public IPs AWS-managed |
| **GKE** | GKE Ingress<br>(provisions GCP Load Balancer) | External: 1 global anycast IP (no VPC impact)<br>Internal: 1 IP per Ingress, plus the region's proxy-only subnet |
| **AKS** | Application Gateway Ingress<br>(AGIC, provisions App Gateway) | [PASS] Requires dedicated /24 subnet<br>256 IPs per App Gateway |

### Total VPC/VNet IP Consumption Summary (Hyperscale Tier)

| Component | EKS | GKE | AKS |
|-----------|-----|-----|-----|
| **Nodes** | 5,000 IPs | 5,000 IPs | 5,000 IPs |
| **Pods** | [PASS] Shared with Nodes<br>(VPC CIDR competition) | [FAIL] Alias ranges<br>(separate, auto-managed) | [FAIL] Overlay CIDR<br>(separate, the plan's `pods.cidr`) |
| **Internal Load Balancers** | 30 IPs (10 LBs × 3 AZs) | 10 IPs | 10 IPs |
| **External Load Balancers** | 60+ IPs (20 LBs × 3 AZs, in the public subnets; public IPs AWS-managed) | 0 (Google-managed IPs) | 0 (Azure-managed public IPs) |
| **Application Gateways** | N/A | N/A | 512 IPs (2 × /24 subnets) |
| **NAT Gateways** | [PASS] 1 private IP per gateway address, in its public subnet (5 to 80 in the NAT scenarios above)<br>Elastic IPs are AWS-managed | [FAIL] External IPs<br>(external resource) | [FAIL] Public IPs<br>(external resource) |
| **Total VPC/VNet IPs** | **~5,095+ IPs**<br>+ Pod secondary IPs | **~5,010 IPs** | **~5,522 IPs** |

**Critical Differences**:
- **EKS**: Pods consume IPs from VPC CIDR (shared with Nodes), requires larger subnets
- **GKE**: Pods use separate alias ranges (Google-managed), minimal VPC impact
- **AKS**: Pods use overlay CIDR (completely separate), Application Gateway needs dedicated subnets

### Recommended Subnet Sizing (Hyperscale Tier)

| Provider | Private Subnets | Public Subnets | Rationale |
|----------|----------------|----------------|-----------|
| **EKS** | 3 × **/20** (4,091 usable each) | 3 × **/23** (507 usable each) | Private for Nodes + Pods, public for LBs<br>Pod secondary IPs from private subnet space |
| **GKE** | 3 × **/20** (4,092 usable each; nodes come from one) | 3 × **/23** (508 usable each) | Nodes only (Pods use alias ranges)<br>Smaller subnets practical with Google IP management |
| **AKS** | 3 × **/20** (4,091 usable each)<br>+ **/24** per App Gateway | 3 × **/23** (507 usable each) | Nodes only (Pods use overlay)<br>Separate subnets for App Gateways |

---

## References

- **EKS VPC CNI**: [AWS VPC CNI Documentation](https://docs.aws.amazon.com/eks/latest/userguide/pod-networking.html)
- **EKS NAT Gateway**: [AWS NAT Gateway Quotas](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-quotas.html)
- **GKE Alias IP**: [GKE VPC-native Clusters](https://cloud.google.com/kubernetes-engine/docs/concepts/alias-ips)
- **GKE Cloud NAT**: [Cloud NAT Best Practices](https://cloud.google.com/blog/products/networking/6-best-practices-for-running-cloud-nat)
- **GKE Cloud NAT Quotas**: [Cloud NAT Limits](https://docs.cloud.google.com/nat/quota#limits)
- **AKS CNI Overlay**: [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
- **AKS NAT Gateway**: [Azure NAT Gateway Limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#nat-gateway-limits)

---

**Last Updated**: October 2, 2026  
**Maintained By**: CIDR Subnet Calculator Team
