# GKE Compliance Audit - Kubernetes Network Planning API

> **Plan format 2.1**: GKE plans carry no `availabilityZone` (GCP subnets are regional; node pools choose zones), include one `/28` control-plane range (`subnets.controlPlane[0]`) for `master_ipv4_cidr_block` or a private endpoint subnetwork, and use a `/20` service range (`/18` for hyperscale). Generated ranges avoid `172.17.0.0/16`, and `podsCidr`/`servicesCidr` let several clusters share one network. `"networkMode": "private"` replaces the public subnets with one proxy-only-sized load-balancer subnet (see [Private Network Mode](#private-network-mode)). A `vpcCidr` may be no larger than `/16` (a project standard for every provider, not a Google limit), and a GKE `servicesCidr` must be `/16` to `/24`. Hyperscale gets one `/19` node subnet (8,188 nodes) and a `/11` pod range. See [api.md](../api.md#address-space-separation).

**Document:** GKE Requirements vs. Implementation Analysis  
**Scope:** CIDR Subnet Calculator - Kubernetes Network Planning API  

---

## Executive Summary

**COMPLIANT** - The Kubernetes Network Planning API meets GKE's requirements for VPC-native clusters, including hyperscale's 5,000-node target (one `/19` node subnet holding 8,188 nodes, see [Hyperscale node subnet](#hyperscale-node-subnet); a `/11` pod range holding 8,192 nodes at 110 pods per node). The implementation applies GKE's IP allocation formulas. The one caveat is Autopilot at 256 max pods per node: the default `/11` holds 4,096 such nodes, and 5,000 need a `/10` `podsCidr`.

**Key Findings:**
-  Correct Pod CIDR calculation using GKE algorithms
-  Proper Service range sizing per GKE recommendations
-  RFC 1918 compliance for all tiers
-  **Regional subnets**: GCP subnets are regional, so plans carry no zone per subnet; node pools choose zones (e.g., `us-central1-a`, `us-central1-b`, `us-central1-c`)
-  **Control-plane range**: one `/28` (the size GKE requires for `master_ipv4_cidr_block`) inside the VPC, clear of every other range
- WARNING - Pod density: the hyperscale `/11` pod range holds 8,192 nodes at Standard's default of 110 max pods per node, and 4,096 to 131,072 on Autopilot, where GKE chooses 8 to 256; 5,000 Autopilot nodes at 256 need a `/10` `podsCidr` (see [Pod & Container Limits](#pod--container-limits))
-  Hyperscale's one `/19` node subnet holds 8,188 nodes, covering the 5,000-node tier ceiling (see [Primary Subnet (Node) Range](#primary-subnet-node-range))
-  **Subnet overlap validation** guarantees non-conflicting IP ranges

---

## 0.1. GCP Region and Zone Naming Standards

### Region Naming Convention

GCP regions follow the pattern: `<continent>-<direction><number>`

**Format**: `{continent}-{direction}{number}`
- **continent**: Geographic area (us, europe, asia, australia, southamerica, northamerica, me, africa)
- **direction**: Cardinal direction or city identifier (central, east, west, north, south, northeast, southeast, southwest)
- **number**: Distinguisher when multiple regions exist in same area (1, 2, 3...)

**Key Difference from AWS**: GCP uses NO hyphen before the number (e.g., `us-central1` vs AWS's `us-central-1`)

For the current list of regions and zones, see [Google Cloud: regions and zones](https://cloud.google.com/compute/docs/regions-zones), or run `gcloud compute zones list --filter=region:<region>`.

### Zone Naming Convention

GCP zones follow the pattern: `<region>-<letter>`

**Format**: `{region}-{zone-letter}`
- **region**: Full region code (e.g., `us-central1`)
- **zone-letter**: Lowercase letter suffix (a, b, c, d, f)

**Examples**:
- `us-central1-a` - First zone in US Central (Iowa)
- `us-central1-b` - Second zone in US Central (Iowa)
- `europe-west1-c` - Third zone in Europe West (Belgium)

**Important Notes**:
1. **Zones are consistent across accounts**: Unlike AWS, `us-central1-a` is the same physical zone for all users
2. **Most regions have 3 zones**: Standard is a, b, c (some regions add d or f)
3. **Zone letters may not be sequential**: Some regions skip letters (e.g., `us-central1` has a, b, c, f but no d or e)
4. **AI Zones**: Special zones for AI/ML workloads use extended naming (e.g., `us-west4-ai2b`)

### API Implementation

GCP subnets are regional, so GKE plans assign no zone to any subnet (the `availabilityZone` field is omitted, and the `availabilityZones` request field is rejected for GKE). Zones are chosen on the cluster or node pool (for example `node_locations`):

```typescript
// Default region for GKE
const region = "us-central1";

// Enterprise plan: regional subnets, no zone per subnet
private-1, private-2, private-3 -> region us-central1 (one subnet is enough for every zone)
public-1, public-2, public-3    -> region us-central1
control-plane-1                 -> /28 for private_cluster_config.master_ipv4_cidr_block
```

**Reference**: [GCP Regions and Zones](https://cloud.google.com/compute/docs/regions-zones)

---

## 0. IPv4 Address Consumption Model (GKE Alias IP)

### Network Architecture Overview

Google GKE uses **Alias IP ranges** for pod networking, where **Pods use automatic secondary ranges separate from the Node subnet**. This is fundamentally different from EKS (where Pods and Nodes share VPC CIDR) and similar to AKS (overlay network).

**CRITICAL INSIGHT**:  Pods do NOT consume Node subnet IPs - Google automatically manages alias IP ranges as secondary ranges.

### IP Allocation by Component

#### 1. Node IP Allocation

**Source**: VPC primary subnet (private subnets from our API)

**Allocation Method**:
- Each Node gets **1 primary IP address** from the VPC subnet
- Node subnet only needs to accommodate Node count (NOT Pods)
- Primary IPs used for Node-to-Node communication

**Subnet Sizing Impact**:
- Node subnet sizing is simple: Just accommodate the number of Nodes
- Example: `/24` subnet (256 IPs) can support 252 Nodes (after reserved IPs)
- **NO COMPETITION**: Pod IPs do NOT consume Node subnet space

#### 2. Pod IP Allocation

**Source**: Alias IP ranges (automatic secondary ranges managed by Google)

**Allocation Method**:
- Each Node gets an alias IP range from the Pod CIDR sized by its max pods per node: `/24` (256 addresses) at 65-128 pods; 8 pods `/28`, 9-16 `/27`, 17-32 `/26`, 33-64 `/25`, 129-256 `/23`, 257-512 `/22` (Standard only)
- **Google-Managed**: Alias ranges automatically allocated by GKE
- Pods get IPs from their Node's alias range
- **Does NOT consume Node subnet**: Pod IPs come from separate secondary range

**GKE Pod CIDR Formula**:
```
Given:
  Q = Max pods per node (Standard: 110 by default, up to 512; Autopilot: GKE chooses 8 to 256)
  DS = Pod subnet prefix size (e.g., /11 for hyperscale)

Calculation:
  M = 31 - ⌈log₂(Q)⌉  (netmask size for node's pod range)
  HM = 32 - M         (host bits for node pod range)
  HD = 32 - DS        (host bits for pod subnet)
  MN = 2^(HD - HM)    (maximum nodes)
  MP = MN × Q         (maximum pods)

Example (Hyperscale, 110 pods/node):
  M = 31 - ⌈log₂(110)⌉ = 24
  HM = 8
  HD = 21 (for /11)
  MN = 2^(21-8) = 8,192 nodes
  MP = 8,192 × 110 = 901,120 pods
```

**Node Capacity Calculation**:
```
At 65-128 max pods per node (Standard's default is 110), each node gets a
/24 alias IP range (256 addresses) from the pod subnet.
Max nodes = 2^(32 - DS - 8)

Example (Hyperscale /11 Pod CIDR):
  Max nodes = 2^(32-11-8) = 2^13 = 8,192 nodes
```

**Key Configuration**:
- Max pods per node depends on the GKE cluster mode ([Google: configure maximum Pods per node](https://cloud.google.com/kubernetes-engine/docs/how-to/flexible-pod-cidr))
- **GKE Standard**: 110 pods/node by default, configurable up to 512 (a `/22` per node at 257-512)
- **GKE Autopilot**: GKE chooses 8 to 256 pods/node from the expected workload Pod density; users cannot set it. Each node takes a `/28` to a `/23`, so the hyperscale `/11` holds 4,096 to 131,072 Autopilot nodes

#### 3. Service IP Allocation

**Source**: Separate virtual IP range (our API provides a `/20` Service CIDR, `/18` for hyperscale)

**Allocation Method**:
- ClusterIP services get IPs from Service CIDR (e.g., `192.168.0.0/20`, which the API returns for a non-hyperscale VPC in `10.0.0.0/8`)
- **NOT routable outside cluster**: Internal routing managed by kube-proxy
- **Does NOT overlap with VPC CIDR or Pod CIDR**: Completely separate range
- **Does NOT consume VPC subnet space**: Virtual IPs only

**Key Point**: Service CIDR is NOT part of the VPC CIDR and does NOT contribute to IP exhaustion.

#### 4. LoadBalancer IP Allocation

**Source**: Depends on the load balancer type

**Allocation Method**:
- **External load balancers**: Google-managed IP addresses; no node-subnet IPs
- **Internal passthrough Network Load Balancers**: one IP from the node subnet, unless another subnet is chosen
- **Proxy-based load balancers** (Application Load Balancers, proxy Network Load Balancers): their proxies use the region's proxy-only subnet (see [Private Network Mode](#private-network-mode))
- LoadBalancers target Node IPs or Pod IPs (depending on configuration)

**Key Point**: External load balancers do not use VPC subnet IPs; internal passthrough Network Load Balancers do (the node subnet by default), and proxy-based load balancers need a proxy-only subnet.

### IP Exhaustion Risk Analysis

 **LOW RISK**: Google manages alias IP ranges automatically. Node subnet only needs Node IPs, not Pod IPs.

**Why GKE is Better Than EKS**:
```
VPC Subnet: 10.0.0.0/24 (256 IPs for Nodes)
Pod CIDR: 100.64.0.0/11 (2M IPs for Pods - separate alias range)

- 252 Nodes: 252 Node IPs used from VPC subnet
- 110 Pods/Node: 27,720 Pod IPs used from Pod CIDR (alias ranges)
- Result: NO IP EXHAUSTION - Pods don't compete with Nodes
```

**Comparison to EKS**:
- **EKS**: Pods and Nodes share VPC CIDR (IP exhaustion risk)
- **GKE**: Pods use alias ranges (Google manages, no exhaustion risk)

### Comparison to Other Platforms

| Component | GKE (Google) | EKS (AWS) | AKS (Azure) |
|-----------|--------------|-----------|-------------|
| **Node IPs** | VPC primary subnet | VPC primary subnet | VNet primary subnet |
| **Pod IPs** | Alias IP ranges (automatic secondary) | VPC CIDR (secondary IPs from Node ENI) | Overlay CIDR (separate from VNet) |
| **Pods & Nodes Share Pool?** | NO (alias ranges) | **YES** (IP exhaustion risk) | NO (overlay) |
| **IP Exhaustion Risk** | LOW (Google manages) | **HIGH** (small subnets) | **NONE** (overlay decoupled) |

### Key Takeaways for GKE

1.  **Pods do NOT consume Node subnet space** (alias ranges are separate)
2.  **Google automatically manages alias IP allocation** (no manual configuration)
3.  **Each Node gets a `/24` alias range at 65-128 max pods** (256 Pod IPs per Node; a `/26` at 17-32 max pods)
4.  **Service CIDR is separate** (does not consume VPC space)
5.  **Load balancer IPs depend on type** (external: Google-managed IPs; internal passthrough: node subnet unless another subnet is chosen; proxy-based: proxy-only subnet)
6.  **Pod density assumptions**: 110 pods/node (Standard's default; Standard allows up to 512); on Autopilot GKE chooses 8 to 256
7.  **Node subnet sizing is simple**: Just accommodate Node count

**Cross-Reference**: See the [compliance overview](README.md) for the cross-provider comparison.

---

## 0.1. Cloud NAT & Outbound Internet Connectivity

### Overview

**Cloud NAT (Network Address Translation)** provides outbound internet connectivity for private GKE nodes and pods without exposing them to inbound internet traffic.

### SNAT Port Allocation Formula

**From [Google Cloud Best Practices](https://cloud.google.com/blog/products/networking/6-best-practices-for-running-cloud-nat)**:
```
External IPs needed = ((# of instances) × (Ports / Instance)) / 64,512
```

**Port Limits** ([Quotas Reference](https://cloud.google.com/nat/quota)):
- **Total ports per IP**: 64,512 ephemeral ports (1024-65535)
- **Default allocation**: 64 ports per VM
- **Configurable**: 64, 1024, 2048, 4096, 8192, 16384, 32768, or 64512 ports/VM

### Hyperscale Tier Examples (5,000 Nodes)

**Scenario 1: Default (64 ports/VM)**
```
5,000 nodes × 64 ports = 320,000 ports
320,000 / 64,512 = 5 External IPs required
```

**Scenario 2: High Connections (1024 ports/VM)**
```
5,000 nodes × 1,024 ports = 5,120,000 ports
5,120,000 / 64,512 = 80 External IPs required
```

**Scenario 3: Maximum (64,512 ports/VM)**
```
5,000 nodes × 64,512 ports = 322,560,000 ports
322,560,000 / 64,512 = 5,000 External IPs (1 IP per VM)
```

Scenario 3's 5,000 NAT IP addresses exceed what one gateway can hold (see the limits below).

### Cloud NAT Quotas

Limits from [Google: Cloud NAT quotas and limits](https://cloud.google.com/nat/quota):

| Resource | Limit | Notes |
|----------|-------|-------|
| NAT gateways per Cloud Router | 50 | |
| NAT gateways per region per VPC network | 250 | 50 per Cloud Router, 5 Cloud Routers per region |
| NAT IP addresses per gateway | 300 manually assigned, or 2,500 auto-allocated | |
| Ports per NAT IP address | 64,512 | |
| Ports/VM | 64 default, up to 64,512 | Powers of 2 |

Google documents no limit on VMs per gateway; the VMs a gateway can serve follow from its NAT IP addresses and ports per VM (formula above).

### Load Balancer IP Consumption

| LB Type | IP Consumption | VPC Impact |
|---------|----------------|------------|
| **External Load Balancer** | Google-managed public IP | [FAIL] NO |
| **Internal Load Balancer** | 1 IP from VPC subnet | [PASS] YES |
| **Global HTTP(S)** | 1 global anycast IP | [FAIL] NO |

**Hyperscale Estimate** (5,000 nodes):
- External LBs: ~20 services = 20 Google IPs (no VPC impact)
- Internal LBs: ~10 services = 10 VPC IPs consumed
- **Total VPC IPs**: 5,000 (nodes) + 10 (internal LBs) = **5,010 IPs**, within the cluster's one `/19` node subnet (8,188; see [Hyperscale node subnet](#hyperscale-node-subnet))

### Private Network Mode

With `"networkMode": "private"` the plan has no public subnets (`subnets.public` is empty). Egress goes through Cloud NAT, which is configured per region on a Cloud Router, serves GKE nodes without external IPs, and takes no subnet in the plan.

`subnets.loadBalancer` holds exactly one regional subnet (no zone), at the tier's public subnet size (`/26` micro to `/23` hyperscale), meant as the region's proxy-only subnet (`purpose` `REGIONAL_MANAGED_PROXY`). `REGIONAL_MANAGED_PROXY` subnets power regional internal and external Application Load Balancers and regional internal and external proxy Network Load Balancers. Cross-region internal Application Load Balancers and cross-region internal proxy Network Load Balancers use a separate `GLOBAL_MANAGED_PROXY` subnet, which the plan does not include ([Google: proxy-only subnets](https://cloud.google.com/load-balancing/docs/proxy-only-subnets)). The minimum is `/26`, and Google recommends starting with `/23`. Only one `REGIONAL_MANAGED_PROXY` subnet can be active per region per VPC network, so clusters in the same region and network share it, and it can't be used for anything else (no VMs). Internal passthrough Network Load Balancers, like the internal load balancer row above, take IPs from the node subnet unless another subnet is chosen.

An enterprise plan for VPC `10.20.0.0/16` puts the proxy-only subnet at `10.20.0.0/24`, the control-plane range at `10.20.1.0/28`, and nodes at `10.20.8.0/21`, `10.20.16.0/21`, and `10.20.24.0/21`; node, pod, and service ranges and the minimum VPC size are the same as in public mode. The control-plane range is the same `/28` but its position follows the first-fit layout: with only one load-balancer subnet ahead of it, it sits at `10.20.1.0/28` instead of the public-mode `10.20.3.0/28`. This happens from the professional tier up, where public mode has more than one public subnet. See [api.md](../api.md#private-network-mode).

---

## 1. Subnet Overlap Validation

### Non-Overlapping Subnet Guarantee

 **VALIDATED** - The API guarantees that public, private (node), and control-plane subnets never overlap within the VPC CIDR, and that the pod and service ranges sit outside the VPC: services in another RFC 1918 block, pods in another RFC 1918 block or, when none has room, in `100.64.0.0/10` (a valid GCP subnet range, RFC 6598).

**Implementation** (first-fit):
- Each subnet takes the lowest offset, aligned to its own size, that is still free
- Public subnets (the proxy-only subnet in private mode) are placed first (at the VPC base), then private subnets, then the single `/28` control-plane range, which usually fills the alignment gap between the two
- Every emitted CIDR is a canonical network address (no host bits)

**Example (Enterprise tier, provider `gke`, VPC 10.0.0.0/16, /24 public, /21 private, /28 control plane)**:
```
Public subnets (start at VPC base):
  public-1:  10.0.0.0/24  (10.0.0.0 - 10.0.0.255)
  public-2:  10.0.1.0/24  (10.0.1.0 - 10.0.1.255)
  public-3:  10.0.2.0/24  (10.0.2.0 - 10.0.2.255)

Private subnets (lowest free /21 slots):
  private-1: 10.0.8.0/21  (10.0.8.0 - 10.0.15.255)   [PASS] No overlap
  private-2: 10.0.16.0/21 (10.0.16.0 - 10.0.23.255)  [PASS] No overlap
  private-3: 10.0.24.0/21 (10.0.24.0 - 10.0.31.255)  [PASS] No overlap

Control-plane range (fills the gap after the public subnets):
  control-plane-1: 10.0.3.0/28 (10.0.3.0 - 10.0.3.15)  [PASS] No overlap

Pods (secondary range):     172.16.0.0/16
Services (secondary range): 192.168.0.0/20
```

**Test Coverage**:
- [PASS] Unit test: `should ensure public and private subnets do not overlap`
- [PASS] Unit test: `should validate all subnets fit within VPC CIDR`
- [PASS] Unit test: `should leave GKE subnets regional (no zone) with one control-plane range`
- [PASS] `tests/unit/network-separation.test.ts`: every tier and provider keeps nodes, control plane, pods, and services separated
- [PASS] `tests/unit/network-separation.test.ts` ("Control plane is one network", "Private network mode"): GKE gets a single `/28` in both network modes, and in private mode exactly one regional load-balancer subnet between `/26` and `/23`
- Validated across all 5 deployment tiers

**GKE Relevance**: Critical for VPC-native clusters where alias IP ranges for pods must not conflict with primary subnet addresses. Prevents Google Cloud Router configuration errors.

---

## 2. GKE Quotas & Limits Compliance

### GKE Cluster Size Limits

**GKE Documentation:** 
- **GKE Standard:** Up to 65,000 nodes per cluster (with Private Service Connect and DPv2)
- **GKE Autopilot:** Up to 5,000 nodes per cluster
- **Node pools:** Up to 1,000 nodes per node pool per zone ([Google: GKE quotas and limits](https://cloud.google.com/kubernetes-engine/quotas))
- **Our Implementation:** Hyperscale tier targets 50-5,000 nodes; its one `/19` node subnet holds 8,188

**Status:**  **COMPLIANT** (see [Hyperscale node subnet](#hyperscale-node-subnet))

The hyperscale tier's 5,000-node target equals the GKE Autopilot maximum and is below the Standard maximum. GKE Standard's 65,000-node capability requires specific configuration (Private Service Connect + Dataplane V2). A GKE cluster takes its nodes from one default subnet, and hyperscale's `/19` holds 8,188 nodes, so the plan reaches 5,000.

---

### Pod & Container Limits

**GKE Documentation:**
- **Pods per cluster:** 200,000 (both Standard and Autopilot)
- **Pods per node:** Standard 110 by default, configurable up to 512; Autopilot 8 to 256, chosen by GKE from the expected workload Pod density and not user-configurable ([Google: configure maximum Pods per node](https://cloud.google.com/kubernetes-engine/docs/how-to/flexible-pod-cidr))
- **Containers per cluster:** 400,000

**Our Tier Verification:**

| Tier | Max Nodes | Pods/Node (assumed) | Max Pods | Limit | Status |
|------|-----------|-------------------|----------|-------|--------|
| Micro | 1 | 110 | 110 | 200K |  |
| Standard | 3 | 110 | 330 | 200K |  |
| Professional | 10 | 110 | 1,100 | 200K |  |
| Enterprise | 50 | 110 | 5,500 | 200K |  |
| Hyperscale | 5,000 | 110 | 550,000 | 200K | WARNING - Can exceed |

**Analysis:** 5,000 nodes at 110 pods/node would mean 550K pods, which exceeds the GKE 200K pod limit. The hyperscale `/11` pod range (2,097,152 addresses) covers 8,192 nodes at a `/24` per node. However:
- Real deployments rarely hit pod limits (they hit IP exhaustion first)
- GKE Autopilot chooses max pods per node (8 to 256) from the expected workload Pod density
- Pod CIDR sizing (`/11`) is sufficient for the 200K pod limit
- On Standard, the `/11` holds 5,000 nodes at the default 110 max pods per node
- On Autopilot, GKE may choose 256 max pods per node (a `/23` per node), so the `/11` holds as few as 4,096 nodes; 5,000 Autopilot nodes at 256 need a `/10` `podsCidr` (8,192 nodes)

**Status:**  **COMPLIANT** (with documentation note)

**Recommendation:** Add documentation note that production hyperscale deployments should monitor pod density and may need to reduce pods-per-node or increase number of clusters to stay under GKE's 200K pod limit.

---

## 2. GKE IP Address Allocation Formulas

### Pod CIDR Calculation

**GKE Documentation Formula:**

```
Key Variables:
Q = max pods per node
DS = Pod subnet CIDR prefix size (e.g., /16)
M = Netmask size for each node's pod range
HM = Host bits for node's pod range = 32 - M
HD = Host bits for pod subnet = 32 - DS
MN = Maximum nodes = 2^(HD - HM)
MP = Maximum pods = MN * Q

Steps:
1. M = 31 - ⌈log₂(Q)⌉
2. HM = 32 - M
3. HD = 32 - DS
4. MN = 2^(HD - HM)
5. MP = MN * Q
```

**Our Implementation Verification:**

Let's verify each tier using GKE's formula (110 max pods per node, Standard's default; for Autopilot, the 8 to 256 range GKE chooses from):

#### Hyperscale Tier (Most Critical)
- **Config:** Pods prefix = `/11`, Assume 110 pods/node for Standard; 8 to 256 (chosen by GKE) for Autopilot
- **GKE Calculation (110 pods/node):**
  - M = 31 - ⌈log₂(110)⌉ = 31 - 7 = 24
  - HM = 32 - 24 = 8
  - HD = 32 - 11 = 21
  - MN = 2^(21-8) = 2^13 = 8,192 nodes
  - MP = 8,192 × 110 = 901,120 pods

- **GKE Calculation (Autopilot, 256 pods/node, the most GKE chooses):**
  - M = 31 - ⌈log₂(256)⌉ = 31 - 8 = 23
  - HM = 32 - 23 = 9
  - HD = 32 - 11 = 21
  - MN = 2^(21-9) = 2^12 = 4,096 nodes
  - MP = 4,096 × 256 = 1,048,576 pods

- **GKE Calculation (Autopilot, 8 pods/node, the least GKE chooses):**
  - M = 31 - ⌈log₂(8)⌉ = 31 - 3 = 28
  - HM = 32 - 28 = 4
  - HD = 32 - 11 = 21
  - MN = 2^(21-4) = 2^17 = 131,072 nodes
  - MP = 131,072 × 8 = 1,048,576 pods

 **Our `/11` pod CIDR supports:**
- 8,192 nodes at 110 pods/node (Standard default) -> 901,120 pod addresses
- 4,096 to 131,072 nodes on Autopilot, depending on the max pods per node GKE chooses (256 down to 8) -> 1,048,576 pod addresses

Pod addresses cover GKE's 200K pod limit at every density, and node capacity reaches 5,000 at Standard's default. On Autopilot at 256 pods/node the `/11` holds 4,096 nodes; 5,000 Autopilot nodes at that density need a `/10` pod range (8,192 nodes).

**Status:**  **COMPLIANT** (Autopilot at 256 pods/node holds 4,096 nodes; see [Autopilot pod density](#autopilot-pod-density))

---

#### Enterprise Tier
- **Config:** Pods prefix = `/16`, Assume 110 pods/node
- **GKE Calculation:**
  - M = 31 - ⌈log₂(110)⌉ = 24
  - HM = 32 - 24 = 8
  - HD = 32 - 16 = 16
  - MN = 2^(16-8) = 2^8 = 256 nodes
  - MP = 256 × 110 = 28,160 pods

 **Our `/16` supports 256 nodes with 28K pods** - more than enough for the 50-node enterprise tier.

**Status:**  **COMPLIANT**

---

### Node Capacity Limits

**GKE Documentation:**

At 65-128 max pods per node (Standard's default is 110), each node gets a `/24` alias IP range (256 addresses) from the pod subnet. The number of nodes supported depends on the pod CIDR prefix:

```
If pod CIDR = /DS:
  Host bits available for nodes = 32 - DS - 8 (since /24 per node)
  Max nodes = 2^(32 - DS - 8)
```

**Verification:**

| Tier | Pod Prefix | Available Bits | Max Nodes | Our Tier Range | Status |
|------|-----------|----------------|-----------|-----------------|--------|
| Hyperscale | /11 | 32-11-8=13 | 2^13=8,192 | 50-5,000 |  |
| Enterprise | /16 | 32-16-8=8 | 2^8=256 | 10-50 |  |
| Professional | /18 | 32-18-8=6 | 2^6=64 | 3-10 |  |
| Standard | /16 | 32-16-8=8 | 2^8=256 | 1-3 |  |
| Micro | /20 | 32-20-8=4 | 2^4=16 | 1 |  |

**Status:**  **COMPLIANT** (Hyperscale with a pod density note)

Micro through Enterprise provide sufficient node capacity. Micro tier with `/20` supports up to 16 nodes, far exceeding the 1-node specification. Hyperscale's `/11` covers 8,192 nodes at 110 max pods per node (`/24` per node); on Autopilot GKE chooses max pods per node (8 to 256), and at 256 the `/11` holds 4,096 nodes.

---

### Primary Subnet (Node) Range

**GKE Documentation Formula:**

```
N = Maximum nodes in primary range
Formula: N = 2^(32-S) - 4
Where S = primary subnet prefix

Example: For a 5,000-node cluster:
S = 32 - ⌈log₂(5000 + 4)⌉ = 32 - ⌈log₂(5004)⌉ = 32 - 13 = /19

Verification: 2^(32-19) - 4 = 2^13 - 4 = 8,192 - 4 = 8,188 nodes 
```

**Our Implementation:**

We allocate one `/19` node subnet for hyperscale (8,192 addresses). Using GKE formula:
- Available nodes = 2^(32-19) - 4 = 8,192 - 4 = 8,188 nodes (GCP reserves 4 addresses in every subnet's primary range: network, gateway, second-to-last, broadcast; [Google: subnets](https://cloud.google.com/vpc/docs/subnets))

A GKE cluster takes its nodes, pods, and services from one default subnet (the [api.md](../api.md#gke-google-cloud-configuration) Terraform uses `subnets.private[0]`), so the single `/19` covers 5,000 nodes.

**Status:**  **COMPLIANT** (8,188 nodes from one `/19` node subnet)

---

## 3. Service Range Compliance

**GKE Documentation:**

- **Minimum Service range:** `/28` (16 services)
- **GKE-managed default:** `/20` (4,096 services) for modern clusters
- **Recommendation:** `/20` or larger for production

**Our Implementation:**

| Tier | Services Prefix | Max Services | GKE Recommendation | Status |
|------|-----------------|--------------|-------------------|--------|
| Hyperscale | /18 | 16,384 | /20 (4,096) |  Above Kubernetes' 10,000-service tested limit |
| Enterprise | /20 | 4,096 | /20 (4,096) |  Matches GKE default |
| Professional | /20 | 4,096 | /20 (4,096) |  Matches GKE default |
| Standard | /20 | 4,096 | /20 (4,096) |  Matches GKE default |
| Micro | /20 | 4,096 | /20 (4,096) |  Matches GKE default |

**Status:**  **COMPLIANT**

Micro through enterprise use GKE's own default services size (`/20`); hyperscale uses `/18` (16,384), above Kubernetes' tested limit of 10,000 services. Earlier versions used `/16` for every tier, which consumed all of `192.168.0.0/16` and left no room for a second cluster's service range in the same network. Several clusters can share a network by passing distinct `podsCidr` and `servicesCidr` values, since GKE secondary ranges in one network must not collide.

A GKE `servicesCidr` must be `/16` to `/24`: Google allows a user-managed Services range of `/28` up to `/16` ([Google: VPC-native clusters](https://cloud.google.com/kubernetes-engine/docs/concepts/alias-ips)), and the API's own floor for every provider is `/24`. The API also caps every `vpcCidr` at `/16`; for GKE that cap is this project's standard, not a Google limit.

---

## 4. VPC-Native & RFC 1918 Compliance

**GKE Documentation Requirements:**

1.  VPC-native clusters use alias IP ranges (not routes-based)
2.  RFC 1918 private ranges recommended
3.  Pod, Service, and Node ranges must not overlap
4.  Ranges must be valid Google Cloud subnets

**Our Implementation:**

```
Example: Hyperscale with VPC CIDR "10.0.0.0/16" (provider "gke")

VPC/Nodes:     10.0.0.0/16   (Primary subnet - node IPs)
  ├─ Public:        10.0.0.0/23, 10.0.2.0/23, 10.0.4.0/23     (3 × /23, regional)
  ├─ Private:       10.0.32.0/19                              (1 × /19, regional)
  └─ Control plane: 10.0.6.0/28                               (master_ipv4_cidr_block)

Pods:          100.64.0.0/11   (Secondary range - pod IPs, RFC 6598; a /11 doesn't fit in 172.16.0.0/12)
Services:      192.168.0.0/18  (Secondary range - service IPs, RFC 1918 192.168.0.0/16)

 Non-overlapping: VPC, pods, and services each use a different address block
 Private space: VPC and services in RFC 1918, pods in RFC 6598
 VPC-native: Uses secondary ranges (alias IPs)
```

**Status:**  **COMPLIANT**

---

## 5. Subnet Allocation & Regional Subnets

**GCP behavior:** Subnets are regional ([Google: subnets](https://cloud.google.com/vpc/docs/subnets)). Zones are chosen on the cluster or node pool (for example `node_locations`), not on the subnet.

**Our Implementation:**

| Tier | Public | Private | Control Plane | Min VPC | Status |
|------|--------|---------|---------------|---------|--------|
| Hyperscale | 3 | 1 | 1 × /28 | /18 |  |
| Enterprise | 3 | 3 | 1 × /28 | /19 |  |
| Professional | 2 | 2 | 1 × /28 | /21 |  |
| Standard | 1 | 1 | 1 × /28 | /23 |  |
| Micro | 1 | 1 | 1 × /28 | /24 |  |

GCP subnets are regional, so the subnet counts do not pin zones: a single node subnet serves node pools in every zone of the region, and the plan carries no `availabilityZone`.

**Status:**  **COMPLIANT**

---

## 6. GKE-Specific Algorithms Implementation

###  Implemented Correctly

1. **Pod range calculation** - Uses GKE's `/24 per node` alias IP model 
2. **Node limiting** - Primary range sized to support node count 
3. **Service range allocation** - `/20` (4,096 service IPs, GKE's default size); `/18` (16,384) for hyperscale 
4. **RFC 1918 support** - All tiers use private ranges 
5. **VPC-native design** - Secondary ranges for pods/services 

### WARNING - Needs Documentation

1. **Pod-per-node density** - Formula assumes 110 pods/node (Standard's default; Standard allows up to 512), but on Autopilot GKE chooses 8 to 256, so the hyperscale `/11` holds 4,096 to 131,072 Autopilot nodes
2. **IP exhaustion warnings** - Hyperscale pod space supports 200K+ pods but GKE limits to 200K total

---

## 7. GKE Autopilot vs. Standard Tier Differences

**Key Differences Our Implementation Should Account For:**

| Aspect | Standard | Autopilot | Our Impl | Status |
|--------|----------|-----------|---------|--------|
| Max nodes | 65,000 | 5,000 | Hyperscale targets 5,000; its one `/19` node subnet holds 8,188 |  |
| Pod density | 110 by default, configurable up to 512 | GKE chooses 8 to 256; not user-configurable | Uses 110 assumption | WARNING - at 256, the `/11` holds 4,096 Autopilot nodes |
| Node allocation | Manual | Automatic | Configurable |  |
| Pod CIDR sizing | Custom | Auto | Configurable |  |
| Service range | User-managed or GKE-managed | GKE-managed | User configurable |  |

**Recommendation:** Document that max pods per node differs between GKE modes: the `/24 per node` assumption matches Standard's default of 110, while Autopilot nodes take a `/28` to a `/23` (GKE chooses 8 to 256 pods per node), so 5,000 Autopilot nodes need a `/10` pod range in the worst case.

---

## 8. Compliance Checklist

### Critical Requirements (GKE Docs)

-  **VPC-native cluster support** - Uses alias IP ranges
-  **RFC 1918 compliance** - All ranges are private
-  **Pod CIDR formula** - Implements GKE's calculation correctly
-  **Service range sizing** - `/20` matches GKE's default; `/18` for hyperscale
-  **Control-plane range** - one `/28` for `master_ipv4_cidr_block`, clear of all other ranges
-  **Non-overlapping ranges** - All ranges distinct and routable
-  **Max cluster size** - the one `/19` node subnet (8,188 nodes) and the `/11` pod range (8,192 nodes at 110 pods per node) hold 5,000 nodes; Autopilot at 256 pods per node needs a `/10` pod range
-  **Max pods** - Supports 200K+ pod IP space
-  **Regional subnets** - GCP subnets are regional; node pools choose zones, so one node subnet serves every zone in the region

### Advanced Features (GKE Best Practices)

-  **Zonal spread** - Node pools choose zones (`node_locations`); regional subnets need no per-zone copies
-  **Multi-region** - A plan covers one `region`; GCP subnets are regional, so each additional region needs its own plan and subnets
-  **IP exhaustion prevention** - Proper range sizing
- WARNING - **Pod density optimization** - Documented but formula assumes fixed value
-  **Dataplane V2 compatible** - Network design supports DPv2

---

## 9. Open Findings

### Hyperscale node subnet

**Status:**  **COMPLIANT** - hyperscale gets one `/19` node subnet, which holds 8,188 nodes, covering the tier's 5,000.

GKE subnets are regional and a cluster uses one default subnet for nodes, pods, and services, so the plan lists a single `/19` private subnet that serves node pools in every zone of the region.

### Autopilot pod density

Plans assume 110 max pods per node (Standard's default, a `/24` per node). Autopilot chooses 8 to 256 itself, so each node takes a `/28` to a `/23`, and the hyperscale `/11` holds 4,096 to 131,072 nodes depending on the density GKE picks. To plan for the worst case (256 pods, `M = 23`), 5,000 nodes need a `/10` pod range ([Google: configure maximum Pods per node](https://cloud.google.com/kubernetes-engine/docs/how-to/flexible-pod-cidr)). The formula is in [kubernetes.md](../kubernetes.md#gke-alias-ranges).

---

## Optional Enhancements

These optional configurations can improve scalability and observability for large-scale GKE deployments:

### Cloud NAT Scaling Considerations

**Cloud NAT Specifications** (Google Cloud documentation):
- **SNAT Port Allocation**: 64,512 ports per NAT IP address; each VM takes its configured ports per VM from that pool
- **Port Allocation Method**: Dynamic or Static port allocation
- **Min Ports per VM**: 64 (default: 64, recommended: 128-1024 for high-traffic workloads)
- **Max Ports per VM**: 64,512
- **Documentation**: [Cloud NAT quotas and limits](https://cloud.google.com/nat/quota)

**Scaling Recommendations**:
1. **Hyperscale Tier (5,000 nodes @ 110 pods/node)**:
   - **Cloud NAT Configuration**:
     - Min ports per VM: 1024 (high pod density)
     - NAT IP addresses: Scale dynamically with node count
     - Enable dynamic port allocation for efficiency
   - **Monitoring**: Cloud Monitoring NAT metrics
     ```bash
     gcloud compute routers nats describe <nat-name> \
       --router=<router-name> --region=<region>
     ```

2. **Enterprise Tier (50 nodes)**:
   - Default Cloud NAT settings sufficient
   - Min ports per VM: 64-128
   - Single Cloud Router per region

3. **Monitoring**:
   - Cloud Logging filter: `resource.type="nat_gateway"`
   - Metric: `router.googleapis.com/nat/allocated_ports`
   - Alert on port exhaustion: `allocated_ports / max_ports > 0.8`

### Google Cloud Load Balancing Integration

**GKE Load Balancer Options**:
- **Global HTTP(S) Load Balancer**: Layer 7, Ingress controller
- **Regional Network Load Balancer**: Layer 4, Service type LoadBalancer
- **Internal Load Balancer**: Private subnet traffic only

**Subnet Requirements** (from GKE documentation):
- **Primary Subnet (Nodes)**: Must support all node IPs
- **Secondary Range (Pods)**: Alias IP ranges, automatically routed
- **Secondary Range (Services)**: ClusterIP range for service discovery
- **Load Balancer IPs**: Allocated from primary subnet or ephemeral

**GKE VPC-Native Clusters** (recommended):
- Alias IP ranges for pods (no manual routing required)
- Automatic subnet secondary range configuration
- Direct VPC routing for pod-to-pod communication
- Better integration with Google Cloud services

### Official Documentation References

**GKE Networking**:
- [GKE VPC-Native Clusters](https://cloud.google.com/kubernetes-engine/docs/concepts/alias-ips)
- [GKE Network Planning](https://cloud.google.com/kubernetes-engine/docs/concepts/network-overview)
- [IP Address Management](https://cloud.google.com/kubernetes-engine/docs/how-to/flexible-pod-cidr)

**Google Cloud VPC**:
- [Cloud NAT Overview](https://cloud.google.com/nat/docs/overview)
- [Cloud NAT Best Practices](https://cloud.google.com/nat/docs/ports-and-addresses)
- [VPC Quotas and Limits](https://cloud.google.com/compute/quotas)

**GKE Best Practices**:
- [Google Cloud Architecture Center - GKE Networking](https://cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke)
- [GKE Security Best Practices](https://cloud.google.com/kubernetes-engine/docs/how-to/hardening-your-cluster)

---

## Conclusion

**The Kubernetes Network Planning API is GKE-compliant:** hyperscale's one `/19` node subnet holds 8,188 nodes, covering the tier's 5,000 (see [Hyperscale node subnet](#hyperscale-node-subnet)). It applies GKE's IP allocation formulas; the hyperscale `/11` pod range holds 8,192 nodes at Standard's default of 110 pods per node and 4,096 to 131,072 on Autopilot, so only 5,000 Autopilot nodes at 256 max pods per node need a larger (`/10`) `podsCidr`.

**Current GKE Tier Configuration Summary** (`GET /api/k8s/tiers?provider=gke`; every tier also has one `/28` control-plane range):
- **Micro**: 1 × /26 public, 1 × /25 private, /24 min VPC, /20 pods, /20 services
- **Standard**: 1 × /25 public, 1 × /24 private, /23 min VPC, /16 pods, /20 services
- **Professional**: 2 × /25 public, 2 × /23 private, /21 min VPC, /18 pods, /20 services
- **Enterprise**: 3 × /24 public, 3 × /21 private, /19 min VPC, /16 pods, /20 services
- **Hyperscale**: 3 × /23 public, 1 × /19 private, /18 min VPC, /11 pods, /18 services
