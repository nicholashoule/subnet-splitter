# GKE Compliance Audit - Kubernetes Network Planning API

> **Updated**: February 4, 2026. Tier configurations now use differentiated subnet sizes with 3 AZs for production tiers. See [api.md](../api.md) for current tier values.
>
> **Updated**: October 2, 2026 (plan format 2.0). GKE plans now carry no `availabilityZone` (GCP subnets are regional; node pools choose zones), include one `/28` control-plane range (`subnets.controlPlane[0]`) for `master_ipv4_cidr_block` or a private endpoint subnetwork, and use a `/20` service range (`/18` for hyperscale). Generated ranges avoid `172.17.0.0/16`, and `podsCidr`/`servicesCidr` let several clusters share one network. `"networkMode": "private"` replaces the public subnets with one proxy-only-sized load-balancer subnet (see [Private Network Mode](#private-network-mode)). A `vpcCidr` may be no larger than `/16` (a project standard for every provider, not a Google limit), and a GKE `servicesCidr` must be `/16` to `/24`. See [api.md](../api.md#address-space-separation).

**Audit Date:** February 1, 2026  
**Document:** GKE Requirements vs. Implementation Analysis  
**Scope:** CIDR Subnet Calculator - Kubernetes Network Planning API  

---

## Executive Summary

**COMPLIANT, with one documented gap** - The Kubernetes Network Planning API meets GKE's requirements for VPC-native clusters, except that hyperscale's node subnet holds 4,092 nodes, short of the tier's 5,000 (see [Recommendation 1.1](#recommendation-11-primary-subnet-sizing-for-hyperscale)). The implementation applies GKE's IP allocation formulas.

**Key Findings:**
-  Correct Pod CIDR calculation using GKE algorithms
-  Proper Service range sizing per GKE recommendations
-  RFC 1918 compliance for all tiers
-  **Regional subnets**: GCP subnets are regional, so plans carry no zone per subnet; node pools choose zones (e.g., `us-central1-a`, `us-central1-b`, `us-central1-c`)
-  **Control-plane range**: one `/28` (the size GKE requires for `master_ipv4_cidr_block`) inside the VPC, clear of every other range
- WARNING - Pod density: the hyperscale `/13` pod range holds 2,048 nodes at Standard's default of 110 max pods per node, and 1,024 to 32,768 on Autopilot, where GKE chooses 8 to 256 (see [Pod & Container Limits](#pod--container-limits))
- WARNING - Hyperscale holds 4,092 nodes in the cluster's one `/20` node subnet, short of the 5,000-node tier ceiling (see [Primary Subnet (Node) Range](#primary-subnet-node-range))
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

### GCP Regions by Geography

| Geography | Region Code | Location | Typical Zones |
|-----------|-------------|----------|---------------|
| **North America** | | | |
| | `us-central1` | Council Bluffs, Iowa | us-central1-a, us-central1-b, us-central1-c, us-central1-f |
| | `us-east1` | Moncks Corner, South Carolina | us-east1-b, us-east1-c, us-east1-d |
| | `us-east4` | Ashburn, Virginia | us-east4-a, us-east4-b, us-east4-c |
| | `us-east5` | Columbus, Ohio | us-east5-a, us-east5-b, us-east5-c |
| | `us-south1` | Dallas, Texas | us-south1-a, us-south1-b, us-south1-c |
| | `us-west1` | The Dalles, Oregon | us-west1-a, us-west1-b, us-west1-c |
| | `us-west2` | Los Angeles, California | us-west2-a, us-west2-b, us-west2-c |
| | `us-west3` | Salt Lake City, Utah | us-west3-a, us-west3-b, us-west3-c |
| | `us-west4` | Las Vegas, Nevada | us-west4-a, us-west4-b, us-west4-c |
| | `northamerica-northeast1` | Montréal, Québec | northamerica-northeast1-a, northamerica-northeast1-b, northamerica-northeast1-c |
| | `northamerica-northeast2` | Toronto, Ontario | northamerica-northeast2-a, northamerica-northeast2-b, northamerica-northeast2-c |
| | `northamerica-south1` | Querétaro, Mexico | northamerica-south1-a, northamerica-south1-b, northamerica-south1-c |
| **Europe** | | | |
| | `europe-west1` | St. Ghislain, Belgium | europe-west1-b, europe-west1-c, europe-west1-d |
| | `europe-west2` | London, England | europe-west2-a, europe-west2-b, europe-west2-c |
| | `europe-west3` | Frankfurt, Germany | europe-west3-a, europe-west3-b, europe-west3-c |
| | `europe-west4` | Eemshaven, Netherlands | europe-west4-a, europe-west4-b, europe-west4-c |
| | `europe-west6` | Zurich, Switzerland | europe-west6-a, europe-west6-b, europe-west6-c |
| | `europe-west8` | Milan, Italy | europe-west8-a, europe-west8-b, europe-west8-c |
| | `europe-west9` | Paris, France | europe-west9-a, europe-west9-b, europe-west9-c |
| | `europe-west10` | Berlin, Germany | europe-west10-a, europe-west10-b, europe-west10-c |
| | `europe-west12` | Turin, Italy | europe-west12-a, europe-west12-b, europe-west12-c |
| | `europe-north1` | Hamina, Finland | europe-north1-a, europe-north1-b, europe-north1-c |
| | `europe-north2` | Stockholm, Sweden | europe-north2-a, europe-north2-b, europe-north2-c |
| | `europe-central2` | Warsaw, Poland | europe-central2-a, europe-central2-b, europe-central2-c |
| | `europe-southwest1` | Madrid, Spain | europe-southwest1-a, europe-southwest1-b, europe-southwest1-c |
| **Asia Pacific** | | | |
| | `asia-east1` | Changhua County, Taiwan | asia-east1-a, asia-east1-b, asia-east1-c |
| | `asia-east2` | Hong Kong | asia-east2-a, asia-east2-b, asia-east2-c |
| | `asia-northeast1` | Tokyo, Japan | asia-northeast1-a, asia-northeast1-b, asia-northeast1-c |
| | `asia-northeast2` | Osaka, Japan | asia-northeast2-a, asia-northeast2-b, asia-northeast2-c |
| | `asia-northeast3` | Seoul, South Korea | asia-northeast3-a, asia-northeast3-b, asia-northeast3-c |
| | `asia-south1` | Mumbai, India | asia-south1-a, asia-south1-b, asia-south1-c |
| | `asia-south2` | Delhi, India | asia-south2-a, asia-south2-b, asia-south2-c |
| | `asia-southeast1` | Singapore | asia-southeast1-a, asia-southeast1-b, asia-southeast1-c |
| | `asia-southeast2` | Jakarta, Indonesia | asia-southeast2-a, asia-southeast2-b, asia-southeast2-c |
| | `asia-southeast3` | Bangkok, Thailand | asia-southeast3-a, asia-southeast3-b, asia-southeast3-c |
| | `australia-southeast1` | Sydney, Australia | australia-southeast1-a, australia-southeast1-b, australia-southeast1-c |
| | `australia-southeast2` | Melbourne, Australia | australia-southeast2-a, australia-southeast2-b, australia-southeast2-c |
| **South America** | | | |
| | `southamerica-east1` | São Paulo, Brazil | southamerica-east1-a, southamerica-east1-b, southamerica-east1-c |
| | `southamerica-west1` | Santiago, Chile | southamerica-west1-a, southamerica-west1-b, southamerica-west1-c |
| **Middle East** | | | |
| | `me-west1` | Tel Aviv, Israel | me-west1-a, me-west1-b, me-west1-c |
| | `me-central1` | Doha, Qatar | me-central1-a, me-central1-b, me-central1-c |
| | `me-central2` | Dammam, Saudi Arabia | me-central2-a, me-central2-b, me-central2-c |
| **Africa** | | | |
| | `africa-south1` | Johannesburg, South Africa | africa-south1-a, africa-south1-b, africa-south1-c |

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
  DS = Pod subnet prefix size (e.g., /13 for hyperscale)

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

**Node Capacity Calculation**:
```
At 65-128 max pods per node (Standard's default is 110), each node gets a
/24 alias IP range (256 addresses) from the pod subnet.
Max nodes = 2^(32 - DS - 8)

Example (Hyperscale /13 Pod CIDR):
  Max nodes = 2^(32-13-8) = 2^11 = 2,048 nodes
```

**Key Configuration**:
- Max pods per node depends on the GKE cluster mode ([Google: configure maximum Pods per node](https://cloud.google.com/kubernetes-engine/docs/how-to/flexible-pod-cidr))
- **GKE Standard**: 110 pods/node by default, configurable up to 512 (a `/22` per node at 257-512)
- **GKE Autopilot**: GKE chooses 8 to 256 pods/node from the expected workload Pod density; users cannot set it. Each node takes a `/28` to a `/23`, so the hyperscale `/13` holds 1,024 to 32,768 Autopilot nodes

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
Pod CIDR: 172.24.0.0/13 (524K IPs for Pods - separate alias range)

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

**Cross-Reference**: See `docs/compliance/ip-allocation-cross-reference.md` for detailed cross-provider comparison.

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
- **Total VPC IPs**: 5,000 (nodes) + 10 (internal LBs) = **5,010 IPs**, more than the cluster's one `/20` node subnet holds (4,092; see [Recommendation 1.1](#recommendation-11-primary-subnet-sizing-for-hyperscale))

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
- **Our Implementation:** Hyperscale tier targets 50-5,000 nodes, but its one `/20` node subnet holds 4,092

**Status:** WARNING - **PARTIAL** (see [Recommendation 1.1](#recommendation-11-primary-subnet-sizing-for-hyperscale))

The hyperscale tier's 5,000-node target equals the GKE Autopilot maximum and is below the Standard maximum. GKE Standard's 65,000-node capability requires specific configuration (Private Service Connect + Dataplane V2). A GKE cluster takes its nodes from one default subnet, and hyperscale's `/20` holds 4,092 nodes, so the plan as generated does not reach 5,000.

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

**Analysis:** 5,000 nodes at 110 pods/node would mean 550K pods, which exceeds the GKE 200K pod limit and also the hyperscale `/13` pod range (524,288 addresses; with a `/24` per node it covers 2,048 nodes). However:
- Real deployments rarely hit pod limits (they hit IP exhaustion first)
- GKE Autopilot chooses max pods per node (8 to 256) from the expected workload Pod density
- Pod CIDR sizing (`/13`) is sufficient for the 200K pod limit
- On Standard, reaching 5,000 nodes on `/13` requires max pods per node <= 32 (`/26` per node), or pass a `/11` `podsCidr`
- On Autopilot, GKE may choose 256 max pods per node (a `/23` per node), so the `/13` holds as few as 1,024 nodes; 5,000 Autopilot nodes at 256 need a `/10` `podsCidr` (8,192 nodes)

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
- **Config:** Pods prefix = `/13`, Assume 110 pods/node for Standard; 8 to 256 (chosen by GKE) for Autopilot
- **GKE Calculation (110 pods/node):**
  - M = 31 - ⌈log₂(110)⌉ = 31 - 7 = 24
  - HM = 32 - 24 = 8
  - HD = 32 - 13 = 19
  - MN = 2^(19-8) = 2^11 = 2,048 nodes
  - MP = 2,048 × 110 = 225,280 pods

- **GKE Calculation (Autopilot, 256 pods/node, the most GKE chooses):**
  - M = 31 - ⌈log₂(256)⌉ = 31 - 8 = 23
  - HM = 32 - 23 = 9
  - HD = 32 - 13 = 19
  - MN = 2^(19-9) = 2^10 = 1,024 nodes
  - MP = 1,024 × 256 = 262,144 pods

- **GKE Calculation (Autopilot, 8 pods/node, the least GKE chooses):**
  - M = 31 - ⌈log₂(8)⌉ = 31 - 3 = 28
  - HM = 32 - 28 = 4
  - HD = 32 - 13 = 19
  - MN = 2^(19-4) = 2^15 = 32,768 nodes
  - MP = 32,768 × 8 = 262,144 pods

 **Our `/13` pod CIDR supports:**
- 2,048 nodes at 110 pods/node (Standard default) -> 225K pods
- 1,024 to 32,768 nodes on Autopilot, depending on the max pods per node GKE chooses (256 down to 8) -> 262K pods

Pod addresses cover GKE's 200K pod limit at every density, but node capacity does not reach 5,000: 2,048 at Standard's default and as few as 1,024 on Autopilot. 5,000 Autopilot nodes at 256 pods/node need a `/10` pod range (8,192 nodes).

**Status:** WARNING - **PARTIAL** (pod IPs sufficient; node capacity below 5,000 at 110 pods/node and at Autopilot's 256)

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
| Hyperscale | /13 | 32-13-8=11 | 2^11=2,048 | 50-5,000 | WARNING - 2,048 at 110 pods/node |
| Enterprise | /16 | 32-16-8=8 | 2^8=256 | 10-50 |  |
| Professional | /18 | 32-18-8=6 | 2^6=64 | 3-10 |  |
| Standard | /16 | 32-16-8=8 | 2^8=256 | 1-3 |  |
| Micro | /20 | 32-20-8=4 | 2^4=16 | 1 |  |

**Status:**  **COMPLIANT** (Hyperscale with a pod density note)

Micro through Enterprise provide sufficient node capacity. Micro tier with `/20` supports up to 16 nodes, far exceeding the 1-node specification. Hyperscale's `/13` covers 2,048 nodes at 110 max pods per node (`/24` per node); 5,000 nodes requires max pods per node <= 32 (`/26` per node, 8,192 nodes), which Standard clusters can set; on Autopilot GKE chooses it (8 to 256), and at 256 the `/13` holds 1,024 nodes.

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

We allocate `/20` subnets for hyperscale (4,096 addresses). Using GKE formula:
- Available nodes = 2^(32-20) - 4 = 4,096 - 4 = 4,092 nodes (GCP reserves 4 addresses in every subnet's primary range: network, gateway, second-to-last, broadcast; [Google: subnets](https://cloud.google.com/vpc/docs/subnets))

This is short of 5,000 nodes. A GKE cluster takes its nodes, pods, and services from one default subnet, so the plan's other `/20` private subnets do not add node capacity on their own (the [api.md](../api.md#gke-google-cloud-configuration) Terraform uses `subnets.private[0]`). To go past 4,092 nodes, either use a `/19` node subnet (8,188 nodes; this API does not generate one), or add subnets to the cluster for new node pools: GKE 1.30.3-gke.1211000 or later, VPC-native, up to eight additional subnets, each with its own pod secondary range, which this plan does not generate ([Google: add subnets to clusters](https://cloud.google.com/kubernetes-engine/docs/how-to/multi-subnet-cluster)).

**Status:** WARNING - **PARTIAL** (4,092 nodes from one `/20` node subnet; 5,000 needs a `/19` or additional subnets)

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
  ├─ Private:       10.0.16.0/20, 10.0.32.0/20, 10.0.48.0/20  (3 × /20, regional)
  └─ Control plane: 10.0.6.0/28                               (master_ipv4_cidr_block)

Pods:          172.24.0.0/13   (Secondary range - pod IPs, RFC 1918 172.16.0.0/12, clear of 172.17.0.0/16)
Services:      192.168.0.0/18  (Secondary range - service IPs, RFC 1918 192.168.0.0/16)

 Non-overlapping: VPC, pods, and services each use a different RFC 1918 block
 RFC 1918: All ranges within private space
 VPC-native: Uses secondary ranges (alias IPs)
```

**Status:**  **COMPLIANT**

---

## 5. Subnet Allocation & Regional Subnets

**GCP behavior:** Subnets are regional ([Google: subnets](https://cloud.google.com/vpc/docs/subnets)). Zones are chosen on the cluster or node pool (for example `node_locations`), not on the subnet.

**Our Implementation:**

| Tier | Public | Private | Control Plane | Min VPC | Status |
|------|--------|---------|---------------|---------|--------|
| Hyperscale | 3 | 3 | 1 × /28 | /18 |  |
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

1. **Pod-per-node density** - Formula assumes 110 pods/node (Standard's default; Standard allows up to 512), but on Autopilot GKE chooses 8 to 256, so the hyperscale `/13` holds 1,024 to 32,768 Autopilot nodes
2. **IP exhaustion warnings** - Hyperscale pod space supports 200K+ pods but GKE limits to 200K total
3. **Primary subnet sizing** - Hyperscale using `/20` supports 4,092 nodes, recommending `/19` for 5,000

---

## 7. GKE Autopilot vs. Standard Tier Differences

**Key Differences Our Implementation Should Account For:**

| Aspect | Standard | Autopilot | Our Impl | Status |
|--------|----------|-----------|---------|--------|
| Max nodes | 65,000 | 5,000 | Hyperscale targets 5,000; its one `/20` node subnet holds 4,092 | WARNING - see [Recommendation 1.1](#recommendation-11-primary-subnet-sizing-for-hyperscale) |
| Pod density | 110 by default, configurable up to 512 | GKE chooses 8 to 256; not user-configurable | Uses 110 assumption | WARNING - at 256, the `/13` holds 1,024 Autopilot nodes |
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
- WARNING - **Max cluster size** - 5,000 nodes needs more than the one `/20` node subnet (4,092 nodes) and, on the `/13` pod range, max pods per node <= 32 (Standard) or a larger pod range (Autopilot at 256 pods per node needs a `/10`)
-  **Max pods** - Supports 200K+ pod IP space
-  **Regional subnets** - GCP subnets are regional; node pools choose zones, so one node subnet serves every zone in the region

### Advanced Features (GKE Best Practices)

-  **Zonal spread** - Node pools choose zones (`node_locations`); regional subnets need no per-zone copies
-  **Multi-region** - A plan covers one `region`; GCP subnets are regional, so each additional region needs its own plan and subnets
-  **IP exhaustion prevention** - Proper range sizing
- WARNING - **Pod density optimization** - Documented but formula assumes fixed value
-  **Dataplane V2 compatible** - Network design supports DPv2

---

## 9. Recommendations & Improvements

### Priority 1: Critical Updates

#### Recommendation 1.1: Primary Subnet Sizing for Hyperscale

**Current:** `/20` private subnets (4,092 nodes per subnet)  
**Status:** WARNING - **OPEN** - a GKE cluster's nodes come from its one default subnet, so hyperscale holds 4,092 nodes, not 5,000

**Rationale:** The plan lists 3 × `/20` private subnets, but GKE subnets are regional and a cluster uses one default subnet for nodes, pods, and services. The other two `/20`s add node capacity only as additional subnets for new node pools (GKE 1.30.3-gke.1211000 or later, up to eight per cluster), and each additional subnet then needs its own pod secondary range, which the plan does not generate ([Google: add subnets to clusters](https://cloud.google.com/kubernetes-engine/docs/how-to/multi-subnet-cluster)). Options:
- A `/19` node subnet for GKE hyperscale (8,188 nodes)
- Or document the additional-subnet setup and generate a pod range per additional subnet

#### Recommendation 1.2: Document Pod Density Variation

**Add to API documentation:**

```markdown
### Pod Density Assumptions

- **GKE Standard clusters:** 110 max pods per node by default, configurable up to 512
- **GKE Autopilot clusters:** GKE chooses 8 to 256 max pods per node from the
  expected workload Pod density; users cannot set it
- **Our calculation:** Uses 110 pods/node (Standard's default), a /24 per node

On Autopilot each node takes a /28 (8 max pods) to a /23 (256 max pods), so the
hyperscale /13 holds 1,024 to 32,768 nodes, depending on the density GKE chooses.

To plan for Autopilot, size for the worst case (256 max pods per node):
- Use the GKE formula: MN = 2^(HD - HM) where M = 31 - ⌈log₂(256)⌉ = 23 (HM = 9)
- 5,000 nodes need MN >= 5,000, so HD - 9 >= 13: a /10 pod range (8,192 nodes)
```

Source: [Google: configure maximum Pods per node](https://cloud.google.com/kubernetes-engine/docs/how-to/flexible-pod-cidr).

### Priority 2: Documentation Enhancements

#### Recommendation 2.1: Add GKE-Specific Calculation Examples

**Add to [kubernetes-network-reference.md](kubernetes-network-reference.md#gke-compliance--ip-formulas)** (`.github/copilot-instructions.md` is now a short index, capped at 10 lines by CI):

```markdown
### GKE Pod CIDR Calculation Examples

Example: Enterprise tier with GKE Standard cluster

Given:
- Pod CIDR: /16
- Max pods/node: 110
- Cluster size: 50 nodes

Calculation:
- M = 31 - ⌈log₂(110)⌉ = 24
- HM = 32 - 24 = 8  
- HD = 32 - 16 = 16
- Max nodes possible: 2^(16-8) = 256 
- Max pods: 256 × 110 = 28,160 

Result: /16 provides 28K pod IPs, sufficient for 50-node cluster
```

#### Recommendation 2.2: Add Quota Warnings

**Status:** Partially in place. Plans now carry an optional `warnings` array of strings (omitted when empty); today it reports a VPC that overlaps `172.17.0.0/16`. A GKE quota warning would be another entry in that array:

```typescript
// Proposed entry when generating a hyperscale GKE plan (not implemented)
{
  "subnets": { /* ... */ },
  "warnings": [
    "GKE cluster pod limit is 200,000 pods total. This /13 pod range supports up to 225K pod IPs. Monitor pod density if scaling beyond 200K pods."
  ]
}
```

### Priority 3: Extended Features (Future)

#### Recommendation 3.1: Custom Pod Density Parameter

```typescript
// Future enhancement
KubernetesNetworkPlanRequest {
  deploymentSize: "hyperscale",
  provider: "gke",
  gkeMode?: "standard" | "autopilot",  // Affects pod density assumptions
  customPodDensity?: 32,  // Override default 110 pods/node
}
```

#### Recommendation 3.2: IP Exhaustion Calculator

```typescript
// Future endpoint
GET /api/kubernetes/ip-capacity
{
  deploymentSize: "enterprise",
  maxNodes: 50,
  maxPodsPerNode: 110,
  maxServices: 500
}
Response: {
  // Enterprise: /16 pod range at a /24 per node (110 pods), /20 Services range
  capacity: { nodes: 256, pods: 28160, services: 4096 },
  available: { nodes: 206, pods: 22660, services: 3596 },
  utilization: { nodes: 19.5%, pods: 19.5%, services: 12.2% },
  warnings: []
}
```

---

## 10. Test Recommendations

### Add Validation Tests

**Status**: Partly covered by `tests/unit/ip-calculation-compliance.test.ts`: "GKE Pod CIDR Formula Validation" checks node and pod counts at 110 pods per node, and its "GKE Autopilot" group checks that the hyperscale `/13` holds 1,024 to 32,768 nodes; "Node Subnet Capacity" checks that hyperscale's one `/20` node subnet holds 4,092 nodes ("GKE-Specific Compliance" holds only a zone test). There is no separate `gke-compliance.test.ts`, and nothing tests the sketch's `/19` (8,188-node) primary-range case; the API does not generate a `/19`. The sketch below is kept for reference.

```typescript
// tests/unit/gke-compliance.test.ts

describe("GKE Compliance", () => {
  describe("Pod CIDR Formulas", () => {
    it("should calculate pod capacity correctly for GKE Standard (110 pods/node)", () => {
      const podCapacity = calculatePodCapacity({
        podPrefix: 13,      // /13 for hyperscale
        podsPerNode: 110,   // GKE Standard default
      });
      
      // M = 31 - ⌈log₂(110)⌉ = 24
      // HM = 8, HD = 19
      // MN = 2^11 = 2048 nodes
      // MP = 2048 * 110 = 225,280 pods
      
      expect(podCapacity.maxNodes).toBe(2048);
      expect(podCapacity.maxPods).toBe(225280);
      expect(podCapacity.maxPods).toBeGreaterThan(200000); // GKE limit
    });

    it("should calculate pod capacity for GKE Autopilot at 256 pods/node (worst case)", () => {
      const podCapacity = calculatePodCapacity({
        podPrefix: 13,
        podsPerNode: 256,   // the most GKE Autopilot chooses (range 8-256)
      });
      
      // M = 31 - ⌈log₂(256)⌉ = 23
      // HM = 9, HD = 19
      // MN = 2^10 = 1024 nodes
      // MP = 1024 * 256 = 262,144 pods
      
      expect(podCapacity.maxNodes).toBe(1024);
      expect(podCapacity.maxPods).toBe(262144);
    });
  });

  describe("Node Primary Range", () => {
    it("should size primary subnet correctly for node count", () => {
      // 5000 nodes requires: S = 32 - ⌈log₂(5004)⌉ = /19
      const result = calculatePrimarySubnetSize(5000);
      expect(result).toBe(19);  // /19
      
      // /19 supports 2^(32-19) - 4 = 8188 nodes 
    });
  });
});
```

---

## 11. Current Implementation Assessment

| Category | Requirement | Implementation | Status |
|----------|------------|-----------------|--------|
| **Core Networking** | VPC-native | Yes, uses secondary ranges |  |
| **IP Ranges** | RFC 1918 | Yes, all tiers |  |
| **Pod Calculation** | GKE formula | Correctly implemented |  |
| **Node Sizing** | Primary range | One `/20` default node subnet for hyperscale (4,092 nodes) | WARNING - 5,000 needs a `/19` or additional subnets |
| **Service Range** | `/20` recommended | Uses `/20` (`/18` for hyperscale) |  |
| **Control-Plane Range** | `/28` for `master_ipv4_cidr_block` | One `/28` per plan, not used by any other range |  |
| **Cluster Size** | Max 65,000 nodes (Standard), 5,000 (Autopilot) | Hyperscale tier targets 50-5,000; its one `/20` node subnet holds 4,092 | WARNING - see [Recommendation 1.1](#recommendation-11-primary-subnet-sizing-for-hyperscale) |
| **Pod Limit** | 200,000 max | Supported with documentation |  |
| **Zones** | Regional subnets | Subnets are regional (no `availabilityZone`); node pools choose zones |  |
| **Documentation** | GKE algorithms | Fully documented |  |

---

## 12. Summary & Action Items

###  Passing Compliance Areas

1. **VPC-native architecture** - Correctly implements GKE's alias IP model
2. **IP range allocation** - All ranges properly non-overlapping
3. **RFC 1918 usage** - All private addresses RFC 1918 compliant
4. **Pod CIDR sizing** - Implements GKE's mathematical formulas correctly
5. **Service scaling** - `/20` (GKE's default size), `/18` for hyperscale
6. **Cluster tier sizes** - Micro through enterprise node counts fit their node subnets and pod ranges; hyperscale is listed under Areas Requiring Attention
7. **Zonal spread** - GCP subnets are regional, so node pools can span the region's zones from one node subnet; plans carry no `availabilityZone`

### WARNING - Areas Requiring Attention

1. **Hyperscale primary subnet** - **OPEN**: the cluster's one `/20` default node subnet holds 4,092 nodes; 5,000 needs a `/19` or additional subnets for new node pools (see [Recommendation 1.1](#recommendation-11-primary-subnet-sizing-for-hyperscale))
2. ~~**Pod density documentation**~~ - **RESOLVED**: [kubernetes-network-reference.md](kubernetes-network-reference.md#gke-compliance--ip-formulas) gives Standard's 110 pods/node default (configurable up to 512) and Autopilot's 8 to 256, chosen by GKE
3. **API response warnings** - Consider adding GKE quota warnings
4. ~~**Test coverage**~~ - **RESOLVED**: `tests/unit/ip-calculation-compliance.test.ts` covers the pod CIDR formula ("GKE Pod CIDR Formula Validation", including its "GKE Autopilot" group) and the 4,092-node hyperscale node subnet ("Node Subnet Capacity"); the `/19` sketch in [Section 10](#10-test-recommendations) is not tested

### Recommended Updates

**High Priority (Open):**
1. Hyperscale node subnet: **OPEN** (see [Recommendation 1.1](#recommendation-11-primary-subnet-sizing-for-hyperscale)); the cluster's one `/20` default node subnet holds 4,092 nodes, short of 5,000

**High Priority (Completed):**
1.  Pod density documentation in [kubernetes-network-reference.md](kubernetes-network-reference.md#gke-compliance--ip-formulas) (Standard 110 pods/node by default, up to 512; Autopilot 8 to 256, chosen by GKE)
2.  Tier configurations use differentiated public/private sizes
3.  GKE formula and compliance tests in `tests/unit/ip-calculation-compliance.test.ts`
4.  GKE pod CIDR and primary subnet formulas in [kubernetes-network-reference.md](kubernetes-network-reference.md#gke-compliance--ip-formulas)

**Medium Priority (3-5 days):**
1. Add quota warnings to API responses (the plan's `warnings` field reports only reserved-range overlaps today)

**Low Priority (Future):**
1. Custom pod density parameter in API
2. IP exhaustion calculator endpoint
3. GKE Autopilot mode detection

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
1. **Hyperscale Tier (2048 nodes @ 110 pods/node)**:
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

**The Kubernetes Network Planning API is GKE-compliant, with one documented gap:** hyperscale's one `/20` node subnet holds 4,092 nodes, short of the tier's 5,000 (see [Recommendation 1.1](#recommendation-11-primary-subnet-sizing-for-hyperscale)). It applies GKE's IP allocation formulas; the hyperscale `/13` pod range holds 2,048 nodes at Standard's default of 110 pods per node and 1,024 to 32,768 on Autopilot, so 5,000 nodes may also need a larger `podsCidr`.

**Current GKE Tier Configuration Summary** (`GET /api/k8s/tiers?provider=gke`; every tier also has one `/28` control-plane range):
- **Micro**: 1 × /26 public, 1 × /25 private, /24 min VPC, /20 pods, /20 services
- **Standard**: 1 × /25 public, 1 × /24 private, /23 min VPC, /16 pods, /20 services
- **Professional**: 2 × /25 public, 2 × /23 private, /21 min VPC, /18 pods, /20 services
- **Enterprise**: 3 × /24 public, 3 × /21 private, /19 min VPC, /16 pods, /20 services
- **Hyperscale**: 3 × /23 public, 3 × /20 private, /18 min VPC, /13 pods, /18 services

**Next Steps:**
1.  Review this audit
2.  Tier configurations updated with differentiated sizes
3.  Re-run test suite to validate changes
4.  Update API documentation with GKE examples

---

**Document Version:** 1.0  
**Status:** Ready for Implementation  
**Approval:** Pending Review
