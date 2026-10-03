# AKS Compliance Audit - Kubernetes Network Planning API

> **Updated**: February 4, 2026. Tier configurations now use differentiated subnet sizes with 3 AZs for production tiers. See [api.md](../api.md) for current tier values.
>
> **Updated**: October 2, 2026 (plan format 2.0). AKS plans now carry no `availabilityZone` (Azure subnets are regional; node pools choose zones 1, 2, 3), include one `/28` subnet (`subnets.controlPlane[0]`) for API Server VNet Integration, and use a `/20` service range (`/18` for hyperscale). Generated ranges avoid `172.17.0.0/16`, and for AKS also `172.30.0.0/16` and `172.31.0.0/16`, which AKS reserves; a VNet, `podsCidr`, or `servicesCidr` overlapping those two is rejected, and hyperscale pods for a VNet in `10.0.0.0/8` are `100.64.0.0/13` (see [RFC 1918 Private Address Space Compliance](#8-rfc-1918-private-address-space-compliance)). A `vpcCidr` larger than `/16` is rejected (a project standard for every provider; Azure VNets may be larger). CNI Overlay gives every node a fixed `/24`, so 5,000 nodes needs a `/11` `podsCidr`. `"networkMode": "private"` replaces the public subnets with one internal load-balancer subnet (see [Private Network Mode](#private-network-mode)). See [api.md](../api.md#address-space-separation).

**Date**: February 1, 2026  
**Scope**: Azure Kubernetes Service (AKS)  
**Status**:  **COMPLIANT, with one WARNING**: the default hyperscale pod range (`/13`) holds 2,048 nodes at CNI Overlay's fixed `/24` per node; a 5,000-node cluster needs a `/11` `podsCidr`

---

## 1. Executive Summary

The Kubernetes Network Planning API has been validated against Microsoft Azure Kubernetes Service (AKS) best practices and requirements. All five deployment tiers (Micro, Standard, Professional, Enterprise, Hyperscale) are compliant with AKS constraints and recommended configurations, with one WARNING for hyperscale at full scale (below).

**Key Findings**:
-  WARNING: Hyperscale's node subnets hold 12,273 node IPs (enough for 5,000 nodes), but its default `/13` pod range holds 2,048 nodes, because CNI Overlay gives every node a fixed `/24`. A 5,000-node cluster (the AKS maximum) needs a `/11` `podsCidr`. 200,000 pods is the AKS control-plane scale target with CNI Overlay
-  Azure CNI Overlay compatibility verified for all configurations
-  Token bucket throttling algorithm documented
-  Azure Resource Manager (ARM) quota system compatible
-  **Regional subnets**: Azure subnets are regional, so plans carry no zone per subnet; node pools choose zones (`1`, `2`, `3`)
-  **API server subnet**: one `/28` (the minimum API Server VNet Integration subnet size) inside the VNet, clear of every other range
-  Multi-node pool scaling patterns supported
-  Control plane tier support (Free, Standard, Premium) documented
-  RFC 1918 private addressing enforced

**Compliance Level**: **PRODUCTION READY**

---

## 0.1. Azure Region and Availability Zone Naming Standards

### Region Naming Convention

Azure regions follow a simplified naming pattern: `<location><direction?><number?>`

**Format**: `{location}{direction}{number}` (no separators)
- **location**: Geographic area or city (east, west, central, north, south, australia, brazil, canada, etc.)
- **direction**: Optional cardinal direction (east, west, central, etc.)
- **number**: Optional distinguisher (2, 3, etc.)

**Key Differences from AWS/GCP**:
- **No hyphens or underscores**: Region names are lowercase without separators
- **Uses programmatic names**: `eastus` not `East US`
- **Human-readable display names**: Separate from programmatic names

### Azure Regions by Geography (Programmatic Names)

| Geography | Region Code | Display Name | Physical Location | AZ Support |
|-----------|-------------|--------------|-------------------|------------|
| **United States** | | | | |
| | `eastus` | East US | Virginia | Yes |
| | `eastus2` | East US 2 | Virginia | Yes |
| | `centralus` | Central US | Iowa | Yes |
| | `northcentralus` | North Central US | Illinois | No |
| | `southcentralus` | South Central US | Texas | Yes |
| | `westcentralus` | West Central US | Wyoming | No |
| | `westus` | West US | California | No |
| | `westus2` | West US 2 | Washington | Yes |
| | `westus3` | West US 3 | Arizona | Yes |
| **Canada** | | | | |
| | `canadacentral` | Canada Central | Toronto | Yes |
| | `canadaeast` | Canada East | Quebec | No |
| **Europe** | | | | |
| | `northeurope` | North Europe | Ireland | Yes |
| | `westeurope` | West Europe | Netherlands | Yes |
| | `uksouth` | UK South | London | Yes |
| | `ukwest` | UK West | Cardiff | No |
| | `francecentral` | France Central | Paris | Yes |
| | `francesouth` | France South | Marseille | No |
| | `germanywestcentral` | Germany West Central | Frankfurt | Yes |
| | `germanynorth` | Germany North | Berlin | No |
| | `switzerlandnorth` | Switzerland North | Zurich | Yes |
| | `switzerlandwest` | Switzerland West | Geneva | No |
| | `norwayeast` | Norway East | Oslo | Yes |
| | `norwaywest` | Norway West | Stavanger | No |
| | `swedencentral` | Sweden Central | Gävle | Yes |
| | `polandcentral` | Poland Central | Warsaw | Yes |
| | `italynorth` | Italy North | Milan | Yes |
| | `spaincentral` | Spain Central | Madrid | Yes |
| **Asia Pacific** | | | | |
| | `eastasia` | East Asia | Hong Kong | Yes |
| | `southeastasia` | Southeast Asia | Singapore | Yes |
| | `japaneast` | Japan East | Tokyo | Yes |
| | `japanwest` | Japan West | Osaka | Yes |
| | `koreacentral` | Korea Central | Seoul | Yes |
| | `koreasouth` | Korea South | Busan | No |
| | `centralindia` | Central India | Pune | Yes |
| | `southindia` | South India | Chennai | No |
| | `westindia` | West India | Mumbai | No |
| | `australiaeast` | Australia East | Sydney | Yes |
| | `australiasoutheast` | Australia Southeast | Melbourne | No |
| | `australiacentral` | Australia Central | Canberra | No |
| | `indonesiacentral` | Indonesia Central | Jakarta | Yes |
| | `malaysiawest` | Malaysia West | Kuala Lumpur | Yes |
| | `newzealandnorth` | New Zealand North | Auckland | Yes |
| **South America** | | | | |
| | `brazilsouth` | Brazil South | São Paulo | Yes |
| | `brazilsoutheast` | Brazil Southeast | Rio | No |
| | `chilecentral` | Chile Central | Santiago | Yes |
| **Middle East & Africa** | | | | |
| | `uaenorth` | UAE North | Dubai | Yes |
| | `uaecentral` | UAE Central | Abu Dhabi | No |
| | `qatarcentral` | Qatar Central | Doha | Yes |
| | `israelcentral` | Israel Central | Tel Aviv | Yes |
| | `southafricanorth` | South Africa North | Johannesburg | Yes |
| | `southafricawest` | South Africa West | Cape Town | No |

### Availability Zone Naming Convention

Azure AZs use **numeric identifiers** (NOT letters like AWS/GCP):

**Format**: a zone number (`1`, `2`, `3`) within a region, set per node pool (e.g., `zones = ["1", "2", "3"]` for a node pool in `eastus`)
- **region**: Programmatic region code (e.g., `eastus`)
- **zone-number**: Numeric zone identifier (1, 2, 3)

Azure subnets are regional, so the API attaches no zone to AKS subnets (earlier versions emitted labels such as `eastus-1`, which are not Azure zone names).

**Important Notes**:

1. **Logical-to-Physical Mapping**: Azure maps logical zone numbers (1, 2, 3) to physical zones per subscription
   - Zone 1 in Subscription A may map to a different physical zone than Zone 1 in Subscription B
   - This provides balanced distribution across physical infrastructure

2. **Zone Redundant Services**: Some Azure services are "zone-redundant" (automatically replicated)
   - Storage accounts, SQL Database, etc.
   - No need to specify individual zones

3. **Maximum 3 Zones**: Azure regions that support AZs have exactly 3 zones (1, 2, 3)
   - Unlike AWS (up to 6) or GCP (variable)

4. **Not All Regions Support AZs**: Check the AZ Support column
   - Use zone-redundant services in non-AZ regions for HA

### Retrieving Region Names Programmatically

```bash
# Azure CLI
az account list-locations --output table

# Azure PowerShell
Get-AzLocation | Select-Object DisplayName, Location

# Example output:
# DisplayName          Location
# East US              eastus
# East US 2            eastus2
# West US              westus
# Central US           centralus
```

### API Implementation

Azure subnets are regional, so AKS plans assign no zone to any subnet (the `availabilityZone` field is omitted, and the `availabilityZones` request field is rejected for AKS). Zones are set per node pool (`zones = ["1", "2", "3"]` in Terraform):

```typescript
// Default region for AKS
const region = "eastus";

// Enterprise plan: regional subnets, no zone per subnet
private-1, private-2, private-3 -> region eastus (node pools set zones 1, 2, 3)
public-1, public-2, public-3    -> region eastus
control-plane-1                 -> /28 API Server VNet Integration subnet
```

**Reference**: [Azure Regions List](https://learn.microsoft.com/en-us/azure/reliability/regions-list)

---

## 0. IPv4 Address Consumption Model (Azure CNI Overlay)

### Network Architecture Overview

Azure Kubernetes Service uses **Azure CNI Overlay** mode for pod networking, which **separates pod IP allocation from the VNet address space**. This is fundamentally different from EKS's shared model and similar to GKE's alias IP model, but simpler:

**Critical Insight**: **Pods use a separate overlay CIDR that does NOT consume VNet subnet space.** Nodes get IPs from VNet subnets, Pods get IPs from overlay CIDR. Pods therefore never exhaust the VNet; the pod CIDR instead caps the node count, because each node takes a fixed `/24` from it.

### IPv4 Allocation by Component

#### 1. Node IP Allocation (Primary VNet Subnet)

**Source**: VNet subnet (e.g., 3 × `/20` = 4,096 IPs each for Hyperscale, inside a `/18` VNet)  
**Consumption**: 1 IP per Node from primary VNet subnet  
**Calculation**: Same as EKS/GKE - simple node count

```
Node_Capacity = 2^(32 - subnet_prefix) - 5
Example: /20 subnet = 2^12 - 5 = 4,091 nodes capacity
```

Azure reserves 5 addresses in every subnet, the first four and the last ([Microsoft: Azure CNI Overlay IP address planning](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay#cluster-nodes): a `/24` leaves 251 usable addresses).

**For Hyperscale Tier**:
- Primary subnets: 3 × `/20` = 12,288 IPs (node pools can each use their own subnet)
- Actual nodes: 5,000 (supports AKS 5,000-node limit)
- Node capacity: 3 × 4,091 = 12,273 nodes (sufficient for all tiers)

#### 2. Pod IP Allocation (Overlay CIDR)

**Source**: Overlay CIDR (e.g., `/13` = 524,288 IPs for Hyperscale)  
**Consumption**: Pods use overlay IPs **separate from VNet subnet**  
**Calculation**: Simple pod capacity calculation

```
With Azure CNI Overlay:
Pod_Addresses = 2^(32 - pod_prefix)

Example (Hyperscale with /13 Pod CIDR):
Pod_Addresses = 2^(32 - 13) = 524,288 IPs
Node capacity: 2^(24 - 13) = 2,048 nodes (a fixed /24 per node)
AKS scale target: 200,000 pods per cluster (performance degrades past it; not a hard limit)
```

**Key Differences from EKS/GKE**:
- **EKS**: Pods use secondary IPs from VNet subnet (competes with Nodes) -> HIGH exhaustion risk
- **GKE**: Pods use alias IP ranges (Google manages automatically) -> LOW exhaustion risk
- **AKS**: Pods use overlay CIDR (completely separate from VNet) -> **no VNet exhaustion from pods** (the pod CIDR caps the node count at a `/24` per node)

**Azure CNI Overlay Benefits**:
- No VNet IP consumption for pods
- No subnet fragmentation issues
- No secondary IP allocation complexity
- Scales to 200,000 pods per cluster (Microsoft's control-plane scale target)
- Simple subnet sizing (only Node count matters)

#### 3. Service IP Allocation (Service CIDR)

**Source**: Service CIDR (e.g., `/20` = 4,096 IPs; `/18` = 16,384 IPs for hyperscale)  
**Consumption**: Virtual IPs allocated by kube-apiserver; kube-proxy (or Cilium) programs the forwarding  
**Does NOT consume VNet subnet space**

```
Service_IPs = 2^(32 - service_prefix)
Example: /20 = 4,096 ClusterIP addresses (AKS requires a service CIDR smaller than /12)
```

**Important**: Services use virtual IPs that exist only within the cluster. They are **not routable outside** the cluster and do **not** consume VNet IP space. This is identical to EKS and GKE.

#### 4. LoadBalancer IP Allocation (External Azure Resources)

**Source**: Azure Load Balancer (external resource)  
**Consumption**: Azure assigns IPs from its own pool  
**Does NOT consume VNet subnet space**

**Azure LoadBalancer Types**:
- **Internal LoadBalancer**: Uses private IP from VNet (the node subnet by default, or another subnet named by annotation)
- **External LoadBalancer**: Uses Azure public IP (external resource)

**Important**: An internal load balancer takes its frontend IP from the cluster's (node) subnet by default. To place it elsewhere, set the `service.beta.kubernetes.io/azure-load-balancer-internal-subnet` annotation to the name of another subnet in the same VNet, such as the plan's `subnets.loadBalancer` subnet in private mode ([Microsoft: internal load balancer](https://learn.microsoft.com/en-us/azure/aks/internal-lb)).

### IP Exhaustion Risk Analysis

**AKS pods cause no VNet IP exhaustion** due to the overlay CIDR model; the pod CIDR caps the node count instead (a fixed `/24` per node: 2,048 nodes on the default hyperscale `/13`):

**Problem Scenario (Theoretical - Does NOT Apply to AKS)**:
- If AKS used EKS's model: `/24` subnet (256 IPs) exhausted by 10 Nodes + 1,100 Pods = 1,110 IPs needed -> FAIL

**AKS Reality (Overlay CIDR)**:
- Node subnet: `/24` = 251 usable IPs for Nodes
- Pod overlay: `/16` = 65,536 IPs for Pods (separate CIDR)
- **No competition**: Nodes and Pods use different IP spaces
- **Result**: `/24` Node subnet + `/16` Pod CIDR = 10 Nodes + 1,100 Pods (110 each) -> SUCCESS. The same pair scales to 251 nodes: the `/24` node subnet has 251 usable IPs, and the `/16` pod CIDR holds 256 nodes at a `/24` each

**Hyperscale Tier IP Exhaustion Risk (AKS)**:
- Node subnets: 3 × `/20` = 12,273 usable IPs for Nodes
- Pod overlay: `/13` = 524,288 IPs for Pods (AKS scale target: 200,000 pods)
- CNI Overlay gives every node a fixed `/24` from the pod CIDR, whatever its max pods (up to 250), so `/13` covers 2,048 nodes. Lowering max pods per node does not help on AKS; 5,000 nodes needs a larger pod CIDR, such as a `/11` passed as `podsCidr`
- Pod overlay can scale independently of VNet

### Comparison to EKS and GKE

| Component | EKS (VPC CNI) | GKE (Alias IP) | AKS (CNI Overlay) |
|---|---|---|---|
| **Node IPs** | VPC subnet (1 IP/node) | VPC subnet (1 IP/node) | VNet subnet (1 IP/node) |
| **Pod IPs** | Same VPC subnet (secondary IPs) | Alias ranges (Google-managed) | Overlay CIDR (separate) |
| **Service IPs** | Separate virtual range | Separate virtual range | Separate virtual range |
| **LoadBalancer IPs** | External AWS resources | External Google Cloud LB | External Azure LB |
| **IP Exhaustion Risk** | **HIGH** (Pods compete with Nodes) | **LOW** (Google manages) | **No VNet exhaustion from pods**; the pod CIDR caps nodes (2,048 on the default `/13`) |
| **VNet IP Consumption** | 5K Nodes + 550K Pods = 555K IPs | 5K Nodes = 5K IPs (Pods separate) | 5K Nodes = 5K IPs (Pods separate) |

### Key Takeaways for AKS

1. **No VNet Exhaustion from Pods**: Overlay CIDR keeps pods out of the VNet; the pod CIDR caps the node count instead (a fixed `/24` per node: 2,048 nodes on the default `/13`, so 5,000 nodes need a `/11`)
2. **Simple Node Subnet Sizing**: Only need to account for Node count (1 IP per Node)
3. **Independent Pod Scaling**: Pod CIDR can be sized independently of VNet
4. **200K Pod Scale Target**: Microsoft's control-plane scale target is 200,000 pods per cluster with CNI Overlay; crossing it degrades performance but doesn't immediately fail the cluster ([Microsoft: large workloads](https://learn.microsoft.com/en-us/azure/aks/best-practices-performance-scale-large))
5. **Multi-Node Pool Support**: 5,000 nodes require 5-10 node pools (1,000 nodes per pool max)
6. **Service CIDR**: Virtual IPs only, do NOT consume VNet space
7. **LoadBalancers**: Public load balancers use Azure public IPs, not VNet space; internal load balancers take a VNet IP from the node subnet unless annotated with another subnet

**Cross-Reference**: For detailed comparison of IPv4 allocation across all three platforms, see [ip-allocation-cross-reference.md](ip-allocation-cross-reference.md).

---

## 2. Subnet Overlap Validation

### Non-Overlapping Subnet Guarantee

 **VALIDATED** - The API guarantees that public, private (node), and API server (control-plane) subnets never overlap within the VNet CIDR, and that the pod and service ranges sit outside the VNet, clear of the AKS-reserved `172.30.0.0/16` and `172.31.0.0/16`: services in another RFC 1918 block, pods in another RFC 1918 block or, when none has room, in `100.64.0.0/10`.

**Implementation** (first-fit):
- Each subnet takes the lowest offset, aligned to its own size, that is still free
- Public subnets (the internal load-balancer subnet in private mode) are placed first (at the VNet base), then private subnets, then the single `/28` control-plane subnet, which usually fills the alignment gap between the two
- Every emitted CIDR is a canonical network address (no host bits)

**Example (Hyperscale tier, provider `aks`, VNet 10.0.0.0/18, differentiated sizes)**:
```
Public subnets (start at VNet base, /23 each):
  public-1: 10.0.0.0/23   (10.0.0.0 - 10.0.1.255)   [512 IPs]
  public-2: 10.0.2.0/23   (10.0.2.0 - 10.0.3.255)   [512 IPs]
  public-3: 10.0.4.0/23   (10.0.4.0 - 10.0.5.255)   [512 IPs]

Private subnets (lowest free /20 slots):
  private-1: 10.0.16.0/20  (10.0.16.0 - 10.0.31.255)  [4,096 IPs] [PASS] No overlap
  private-2: 10.0.32.0/20  (10.0.32.0 - 10.0.47.255)  [4,096 IPs] [PASS] No overlap
  private-3: 10.0.48.0/20  (10.0.48.0 - 10.0.63.255)  [4,096 IPs] [PASS] No overlap

API server subnet (fills the gap after the public subnets):
  control-plane-1: 10.0.6.0/28  (10.0.6.0 - 10.0.6.15)  [16 IPs] [PASS] No overlap

Pod overlay: 100.64.0.0/13   Service CIDR: 192.168.0.0/18   (outside the VNet)
(Every /13 left in 172.16.0.0/12 holds 172.17.0.0/16 or the AKS-reserved
172.30.0.0/16 and 172.31.0.0/16, so the pods fall back to RFC 6598 space.)
```

**Test Coverage**:
- [PASS] Unit test: `should ensure public and private subnets do not overlap`
- [PASS] Unit test: `should validate all subnets fit within VPC CIDR`
- [PASS] `tests/unit/network-separation.test.ts`: every tier and provider keeps nodes, control plane, pods, and services separated, and AKS subnets carry no zone
- [PASS] `tests/unit/network-separation.test.ts` ("Control plane is one network", "Private network mode"): AKS gets a single `/28` in both network modes, and in private mode exactly one regional internal load-balancer subnet and no public subnets
- Validated across all 5 deployment tiers

**AKS Relevance**: Prevents Azure CNI Overlay routing conflicts where pod CIDR and node subnet overlap would break cluster networking. Critical for 5,000-node hyperscale deployments.

---

## 3. AKS Cluster Scalability Limits

Based on Microsoft Azure AKS documentation:

### Documented Limits (Per AKS Quotas & Best Practices)

| Aspect | Azure Limit | Our Hyperscale | Status |
|--------|-----------|----------------|--------|
| **Max Nodes per Cluster** | 5,000 nodes | 5,000 node IPs (3 × `/20`), but the default `/13` pod range holds 2,048 nodes at a `/24` each |  WARNING: pass a `/11` `podsCidr` for 5,000 nodes |
| **Max Pods per Cluster** | 200,000 pods (CNI Overlay scale target, not a hard limit) | ~225,000 pods at this doc's planning assumption of 110 pods per node (not the AKS default): the `/13` holds 2,048 nodes at a `/24` each |  Over-provisioned |
| **Max Nodes per Node Pool** | 1,000 nodes | 1,000 nodes (suggest 5 pools for 5K) |  Supported |
| **Max Node Pools** | 100 pools | Supports multiple pools |  Compliant |
| **Max Pods per Node** | 250 pods (max), 10 (min) with CNI Overlay | CNI Overlay default 250; this doc's pod figures assume 110 ([Microsoft: CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay)) |  Supported |
| **Primary Subnet** | VNet subnet required | /20 × 3 hyperscale |  Compliant |
| **Pod CIDR** | CNI secondary range | /13 hyperscale |  Compliant |
| **Service CIDR** | Smaller than /12 | /20 (/18 hyperscale) |  Compliant |
| **API Server Subnet** | /28 minimum, delegated to `Microsoft.ContainerService/managedClusters` | /28 (`subnets.controlPlane[0]`) |  Compliant |

### Scaling Guidance from Microsoft

**Recommended Planning**:
- **Up to 1,000 nodes**: any tier (the Free tier supports up to 1,000)
- **1,000-5,000 nodes**: the Standard or Premium tier, which support up to 5,000 ([Microsoft: AKS pricing tiers](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers)); follow Microsoft's large-cluster guidance ([best-practices-performance-scale-large](https://learn.microsoft.com/en-us/azure/aks/best-practices-performance-scale-large))
- **More than 5,000 nodes**: not supported in one cluster

**Control Plane Tiers**:
- **Free Tier**: Recommended node limit of 10 nodes (not for production)
- **Standard Tier**: Up to 5,000 nodes with auto-scaling control plane
- **Premium Tier**: Up to 5,000 nodes with guaranteed SLAs

**Our Tier Distribution**:

| Tier | Node Range | Pod Capacity (at this doc's planning assumption of 110 pods per node; the CNI Overlay default is 250) | Control Plane Tier |
|------|-----------|--------------|-------------------|
| Micro | 1 | ~110 | Free/Standard |
| Standard | 1-3 | ~110-330 | Standard |
| Professional | 3-10 | ~330-1,100 | Standard |
| Enterprise | 10-50 | ~1,100-5,500 | Standard |
| Hyperscale | 50-5000 | ~5,500-225,000 (the `/13` pod range holds 2,048 nodes; WARNING: 5,000 nodes need a `/11` `podsCidr`) | Standard/Premium |

---

## 2.1. Azure NAT Gateway & Outbound Connectivity

### Overview

**Azure NAT Gateway** provides outbound internet connectivity for private AKS nodes and pods without exposing them to inbound traffic.

### SNAT Port Allocation Formula

**Adapted for Azure**:
```
NAT Gateway IPs needed = ((# of instances) × (Ports / Instance)) / 64,512
```

NAT Gateway allocates SNAT ports on demand to every instance in the attached subnets (no per-instance preallocation, and no per-IP port setting), so `Ports / Instance` is an estimate of peak demand, not a configuration value.

**Azure NAT Gateway Limits** ([Microsoft: NAT gateway resource](https://learn.microsoft.com/en-us/azure/nat-gateway/nat-gateway-resource)):
- **64,512 SNAT ports per public IP**, allocated on demand
- **16 public IPs max per NAT Gateway**
- **1,032,192 total ports** per gateway (16 × 64,512)
- **Throughput**: up to 50 Gbps per Standard NAT gateway (StandardV2: up to 100 Gbps)
- **Connections**: up to 2 million active connections per NAT gateway
- **One NAT gateway per subnet**: a subnet can't have more than one; one NAT gateway can serve several subnets in the same VNet

### Hyperscale Tier Examples (5,000 Nodes)

**Scenario 1: Standard Workload (128 ports/node)**
```
5,000 nodes × 128 ports = 640,000 ports
640,000 / 64,512 = 9.9 -> 10 IPs
1 NAT Gateway (below 16 IP limit)
```

**Scenario 2: High Connections (1,024 ports/node)**
```
5,000 nodes × 1,024 ports = 5,120,000 ports
5,120,000 / 64,512 = 79.4 -> 80 IPs
80 / 16 = 5 NAT Gateways, but each subnet takes at most one NAT gateway, so
this needs at least 5 node subnets. The hyperscale plan has 3, which cap
egress at 3 NAT gateways × 1,032,192 = 3,096,576 ports.
```

**Scenario 3: Maximum Single Gateway**
```
16 IPs × 64,512 ports = 1,032,192 ports total
1,032,192 / 128 = 8,064 nodes (standard workload; AKS stops at 5,000)
1,032,192 / 1,024 = 1,008 nodes (high-connection workload)
```

### Token Bucket Throttling (API Rate Limiting)

**Critical for 5,000-node clusters**:
```
PUT ManagedCluster: 20 burst, 1 req/min sustained
PUT AgentPool:      20 burst, 1 req/min sustained

Error: HTTP 429 (Too Many Requests)
Header: Retry-After: <seconds>
```

**Scaling Best Practice**: Scale in batches of 500-700 nodes, wait 2-5 min between operations.

### Azure NAT Gateway Quotas

| Resource | Limit | Notes |
|----------|-------|-------|
| IPs/NAT Gateway | 16 | Hard limit |
| SNAT ports/IP | 64,512 | Allocated on demand; not configurable |
| NAT Gateways/subnet | 1 | A subnet can't have more than one |
| Idle timeout | 4-120 min | Configurable |

### Load Balancer IP Consumption

| LB Type | IP Consumption | VNet Impact |
|---------|----------------|-------------|
| **Azure LB (Public)** | Azure-managed public IP | [FAIL] NO |
| **Azure LB (Internal)** | 1 IP from VNet subnet | [PASS] YES |
| **Application Gateway** | 1 public + dedicated subnet | [PASS] YES (/24) |

**Hyperscale Estimate** (5,000 nodes):
- NAT Gateways: 1-3 gateways (at most one per node subnet; the plan has 3) × up to 16 IPs = up to 48 Azure public IPs (no VNet impact)
- Public Load Balancers: ~20 services = Azure IPs (no VNet impact)
- Internal Load Balancers: ~10 services = 10 VNet IPs
- Application Gateways: ~2 × 256 IPs = 512 VNet IPs (dedicated subnets)
- **Total VNet IPs**: 5,000 (nodes) + 522 (LBs+AppGW) = **~5,522 IPs**

**Note**: Pods use the overlay CIDR (the plan's `pods.cidr`), no VNet consumption.

### Private Network Mode

With `"networkMode": "private"` the plan has no public subnets (`subnets.public` is empty). `subnets.loadBalancer` holds exactly one regional subnet (no zone) for internal load balancer frontends, at the tier's public subnet size (`/26` micro to `/23` hyperscale). Egress takes no subnet in the plan. The plan is for a bring-your-own VNet (you create it from `vpc.cidr`), so set the cluster's `outbound_type` to `userAssignedNATGateway` (create a NAT gateway before the cluster and attach it to the node subnets) or `userDefinedRouting` (a route table on the node subnets with a `0.0.0.0/0` route to a gateway or network virtual appliance). `managedNATGateway` and `managedNATGatewayV2` (preview) apply only to AKS-managed VNets ([Microsoft: outbound types](https://learn.microsoft.com/en-us/azure/aks/egress-outboundtype)). The `azurerm` values are `loadBalancer`, `userDefinedRouting`, `managedNATGateway`, `userAssignedNATGateway`, and `none`. An enterprise plan for VNet `10.20.0.0/16` puts the load-balancer subnet at `10.20.0.0/24` and the API server subnet at `10.20.1.0/28`; node, pod, and service ranges and the minimum VNet size are the same as in public mode. The API server subnet is the same `/28` but its position follows the first-fit layout: with only one load-balancer subnet ahead of it, it sits at `10.20.1.0/28` instead of the public-mode `10.20.3.0/28`. This happens from the professional tier up, where public mode has more than one public subnet. See [api.md](../api.md#private-network-mode).

---

## 3. Azure CNI Architecture

### Networking Models Supported

**1. Azure CNI (Direct IP Allocation)**
- Each pod gets a direct VNet IP address
- Native VNet integration
- Maximum 50,000 pods per cluster
- Better for direct pod-to-pod communication

**2. Azure CNI Overlay** (Recommended for AKS)
- Pods get IPs from overlay network
- Overlays VNet subnets
- Maximum 200,000 pods per cluster
- Better pod density
- Reduced VNet IP pressure

**3. Kubenet** (Deprecated for new clusters)
- Simple bridge networking
- Limited scalability
- Not recommended for production

### IP Allocation Formula - Azure CNI Overlay

**Formula for Pod CIDR Capacity**:
```
With Azure CNI Overlay (each node takes a fixed /24 from the pod CIDR):
Pod_Addresses = 2^(32 - pod_prefix)
Node_Capacity = 2^(24 - pod_prefix)
Overlay_CIDR = Secondary range (e.g., /13)

Example: /13 overlay CIDR
Addresses = 2^(32-13) = 524,288
Nodes     = 2^(24-13) = 2,048
AKS scale target: 200,000 pods per cluster (performance degrades past it; not a hard limit)
```

Max pods per node (10 to 250, default 250) and max nodes are independent limits; Microsoft says not to multiply them to get a supported cluster pod count ([Microsoft: CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay)).

**Advantages Over Direct Azure CNI**:
- More pod addresses available
- Doesn't consume VNet address space
- Better scaling for large clusters
- Recommended by Microsoft for large clusters (up to 5,000 nodes and 200,000 pods)

### Node Capacity Per Pool Formula

**Formula**:
```
Node_Capacity_Per_Pool = 1,000 nodes maximum per pool
Cluster_Node_Capacity = Number_of_Pools × 1,000

For 5,000 nodes: Need minimum 5 node pools
(5 × 1,000 = 5,000)
```

---

## 4. Azure Throttling Algorithm

### Token Bucket Throttling

Microsoft Azure uses a **token bucket** throttling algorithm for AKS resource provider APIs:

**Algorithm**:
```
Tokens = Fixed Size (Burst Rate)
Refill Rate = Sustained Rate (tokens/second)

When request arrives:
- If tokens > 0: Accept request, decrement tokens
- If tokens = 0: Reject with HTTP 429 (Too Many Requests)
- Tokens refill at fixed rate over time
```

### AKS Resource Provider Throttling Limits

| API | Burst Rate | Sustained Rate | Scope |
|-----|-----------|----------------|-------|
| LIST ManagedClusters | 500 requests | 1 request/1 sec | Subscription |
| LIST ManagedClusters | 60 requests | 1 request/1 sec | ResourceGroup |
| PUT AgentPool | 20 requests | 1 request/1 min | AgentPool |
| PUT ManagedCluster | 20 requests | 1 request/1 min | ManagedCluster |
| GET ManagedCluster | 60 requests | 1 request/1 sec | Cluster |
| GET Operation Status | 200 requests | 2 requests/1 sec | Subscription |
| All Other APIs | 60 requests | 1 request/1 sec | Subscription |

**Error Response**:
```
HTTP 429 (Too Many Requests)
Error Code: Throttled
Header: Retry-After: <delay-seconds>
```

### Comparison: Token Bucket vs Rate Limiting

| Aspect | Token Bucket (Azure) | Per-IP Limiting (AWS/others) |
|--------|-------------------|--------------------------|
| **Fairness** | Account/scope based | IP-based (can be spoofed) |
| **Burst Support** | Yes (token savings) | Limited |
| **Multi-client** | Shared bucket | Per IP |
| **Scale** | Better for multi-cluster | Better for single client |

---

## 5. Tier-by-Tier AKS Compliance Analysis

### Micro Tier (Development/PoC)

**Configuration**:
- Primary Subnet: `/25` (128 addresses)
- Pod CIDR: `/20` (4,096 addresses)
- Service CIDR: `/20` (4,096 addresses)
- Nodes: 1
- Node Pools: 1
- Pod Limit: ~110

**AKS Compliance**:
-  Free Tier sufficient (single node)
-  Pod CIDR over-provisioned (safe for overlay network)
-  No node pool scaling concerns
-  No Azure CNI overlay pressure
-  Subnet prefix contiguity: Not an issue

**Control Plane**:
- Free Tier recommended for learning
- Not suitable for production

**Recommendation**: Appropriate for PoC and learning. Consider upgrading to Standard tier for any persistent workloads.

---

### Standard Tier (Development/Testing)

**Configuration**:
- Primary Subnet: `/24` (256 addresses)
- Pod CIDR: `/16` (65,536 addresses)
- Service CIDR: `/20` (4,096 addresses)
- Nodes: 1-3
- Node Pools: 1
- Pod Limit: ~110-330 (110 pods per node)

**AKS Compliance**:
-  Standard Tier recommended (auto-scaling control plane)
-  Pod CIDR sufficient with CNI overlay
-  Single node pool supports 1-3 nodes
-  No pod address exhaustion
-  Subnet space adequate for temporary scaling

**Azure CNI Overlay**:
- Enabled by default in newer AKS clusters
- IPs from overlay secondary range
- No VNet IP pressure

**Recommendation**: Good for development and testing. Use Standard tier control plane for reliability.

---

### Professional Tier (Small Production)

**Configuration**:
- Primary Subnet: `/23` (512 addresses)
- Pod CIDR: `/18` (16,384 addresses)
- Service CIDR: `/20` (4,096 addresses)
- Nodes: 3-10
- Node Pools: 1-2 (recommended 1 for 3-10 nodes)
- Pod Limit: ~330-1,100 (110 pods per node)

**AKS Compliance**:
-  Standard Tier recommended for production
-  `/23` subnet supports 10-node cluster
-  Single node pool sufficient (< 1000 nodes)
-  Pod CIDR with overlay supports full capacity
-  Availability zones supported
-  Multi-AZ deployment ready

**Control Plane Scaling**:
- Automatic at this scale
- Monitor API server latency
- Recommended by Microsoft for production

**Azure Throttling**:
- No throttling concerns at this scale
- API calls well within burst rates

**Recommendation**: Production-grade with HA support. Requires Standard tier control plane. Good for 3-10 node enterprise clusters.

---

### Enterprise Tier (Large Production)

**Configuration**:
- Primary Subnet: `/21` (2,048 addresses)
- Pod CIDR: `/16` (65,536 addresses)
- Service CIDR: `/20` (4,096 addresses)
- Nodes: 10-50
- Node Pools: 1-2 (recommended 1)
- Pod Limit: ~1,100-5,500 (110 pods per node)

**AKS Compliance**:
-  Standard Tier with control plane auto-scaling
-  `/21` primary supports up to 50 nodes per pool
-  Single node pool sufficient (< 1000 nodes)
-  Pod CIDR overlay holds 256 nodes at a `/24` each, well above the tier's 50 nodes (~5,500 pods)
-  Multi-AZ deployment recommended (3+ zones)
-  Full production support

**Control Plane Considerations**:
- Standard tier auto-scales at 10-50 node range
- Monitor control plane metrics critical
- Azure Monitor integration recommended

**Network Policies**:
- Azure NPM supports up to 250 nodes (note limitation)
- For > 250 nodes, consider Azure CNI with Cilium
- Application-level routing with Istio also option

**Cluster Upgrade**:
- Max surge: 10-20% recommended (5-10 nodes)
- Plan scaling operations carefully
- Azure handles temporary infrastructure

**Recommendation**: Production-grade with zone redundancy. Requires Standard tier. Supports enterprise SLAs.

---

### Hyperscale Tier (Global/Extreme Scale)

**Configuration**:
- Primary Subnets: 3 × `/20` (4,096 addresses each)
- API Server Subnet: 1 × `/28`
- Pod CIDR: `/13` (524,288 addresses)
- Service CIDR: `/18` (16,384 addresses)
- Nodes: 50-5,000
- Node Pools: 5 minimum (5 × 1,000 = 5,000 nodes)
- Pod Limit: 5,500-225,000 at this doc's planning assumption of 110 pods per node, not the AKS default of 250 (the `/13` holds 2,048 nodes at a `/24` each; AKS scale target: 200,000 pods with CNI Overlay)

**AKS Compliance**:
-  Standard or Premium Tier control plane
-  3 × `/20` primaries (12,273 node IPs) support a full 5,000-node cluster
-  Multiple node pools required (5-10 pools for 5K nodes)
-  Azure CNI Overlay mandatory for 200K pods
-  Pod CIDR `/13` supports 200K+ pod addresses, but CNI Overlay gives every node a fixed `/24` whatever its max pods, so `/13` covers 2,048 nodes. A 5,000-node cluster needs a larger pod CIDR: pass a `/11` `podsCidr` (lowering max pods per node does not shrink the per-node `/24`)
-  Service CIDR `/18` provides 16,384 ClusterIPs (above Kubernetes' tested limit of 10,000 services)
-  WARNING: The maximum AKS scale (5,000 nodes) needs a `/11` `podsCidr`; with the default `/13` pod range the cluster stops at 2,048 nodes

**Multi-Node Pool Strategy**:
```
Example 5,000 node configuration (the AKS maximum; needs a /11 podsCidr):
- System pool: 2 nodes (for kube-system)
- User pool 1: 1,000 nodes (application workloads)
- User pool 2: 1,000 nodes (application workloads)
- User pool 3: 1,000 nodes (application workloads)
- User pool 4: 1,000 nodes (application workloads)
- User pool 5: 998 nodes (application workloads)
Total: 5,000 nodes
```

**Azure CNI Overlay Requirements**:
- **MANDATORY** for 200K+ pods
- Reduces VNet IP pressure
- Enables true cluster-level pod scaling
- Configuration: `--network-plugin azure --network-plugin-mode overlay --pod-cidr 100.64.0.0/13 --service-cidr 192.168.0.0/18 --dns-service-ip 192.168.0.10` (the API's `pods.cidr` and `services.cidr` for a hyperscale VNet in `10.0.0.0/8`; `--dns-service-ip` must be inside the service CIDR and not its first address). Without `--network-plugin-mode overlay`, `--network-plugin azure` uses node-subnet mode, not the overlay
- API Server VNet Integration: `--enable-apiserver-vnet-integration --apiserver-subnet-id <subnet id>` with the plan's `/28` `subnets.controlPlane[0]`, delegated to `Microsoft.ContainerService/managedClusters`; nodes use `--vnet-subnet-id <subnet id>` from `subnets.private`

**Scaling Thresholds**:
- **1,000+ nodes**: the Standard or Premium tier (Free supports up to 1,000); monitor API latency
- **5,000 nodes**: the per-cluster maximum on Standard and Premium ([Microsoft: AKS pricing tiers](https://learn.microsoft.com/en-us/azure/aks/free-standard-pricing-tiers))
- **More than 5,000 nodes**: not supported in one cluster

**Control Plane Tiers**:
- **Standard Tier**: Supports up to 5,000 nodes with auto-scaling
- **Premium Tier**: Recommended for guaranteed SLAs
- Both support maximum 200K pods with CNI Overlay

**Cluster Services Scaling**:
- coredns: Scale to 10+ replicas
- kube-proxy: Runs on all nodes (auto-scales)
- Azure CNI: DaemonSet on all nodes
- Azure NPM: Not suitable > 250 nodes (use Cilium instead)

**Network Configuration**:
```
Primary VNet: 10.0.0.0/16 (65,536 addresses)
├─ Public Subnets (3, regional):
│  ├─ 10.0.0.0/23   (512 addresses)
│  ├─ 10.0.2.0/23   (512 addresses)
│  └─ 10.0.4.0/23   (512 addresses)
├─ Node Subnets (3, regional; node pools set zones 1, 2, 3):
│  ├─ 10.0.16.0/20  (4,096 addresses)
│  ├─ 10.0.32.0/20  (4,096 addresses)
│  └─ 10.0.48.0/20  (4,096 addresses)
├─ API Server Subnet:
│  └─ 10.0.6.0/28   (16 addresses, API Server VNet Integration)
├─ Outside the VNet:
│  ├─ Pod CIDR:     100.64.0.0/13   (524,288 addresses; overlay, RFC 6598, clear of the AKS-reserved 172.30-31.0.0/16)
│  └─ Service CIDR: 192.168.0.0/18  (16,384 addresses)
└─ Managed Infrastructure:
   ├─ Public IPs (NAT Gateway)
   ├─ Load Balancers
   └─ Storage accounts
```

**Azure Throttling at Scale**:
- Subscription-level limits apply
- Multiple clusters share API quotas
- Recommendation: 20-40 clusters per subscription-region
- Token bucket ensures fair queuing

**Monitoring Requirements**:
- Control plane metrics (Azure Managed Prometheus)
- API server latency tracking
- etcd size monitoring
- Pod churn rate tracking
- Network saturation monitoring

**Cluster Upgrade at Scale**:
- **Constraint**: Cannot upgrade at 5,000 nodes (no surge capacity)
- **Solution**: Scale down to <3,000 nodes before upgrade
- **Limitation**: Blocks cluster upgrades at max scale

**Production Requirements**:
1. **Multi-AZ Deployment**: Distribute across 3+ availability zones
2. **Multiple Node Pools**: At least 5 pools for 5,000 nodes
3. **CNI Overlay Networking**: Required for 200K pods
4. **Premium Control Plane**: Recommended for SLA guarantees
5. **Azure Monitor Integration**: Essential for visibility
6. **Network Policy**: Use Cilium (replaces NPM for >250 nodes)
7. **Planned Maintenance**: Scale down during upgrades

**Recommendation**: Enterprise-grade hyperscale configuration for large organizations. Requires deep Azure expertise and support engagement. Primary use cases: large AI/ML workloads, big data processing, multi-tenant platforms.

---

## 6. Azure Networking Model

### VNet Integration

**Primary Subnet** (Node IPs):
- Nodes get IPs directly from VNet subnet
- ENIs attached to primary VNet subnet
- Requires contiguous IP space
- Formula: `2^(32-prefix) - 5` (Azure reserves the first four addresses and the last)

**Secondary Ranges** (Pod/Service IPs):
- Defined in AKS cluster configuration
- Can be separate VNet prefixes
- Used by Azure CNI plugin
- Pod IPs with overlay don't consume VNet IPs

### Azure CNI Overlay Model

**Architecture**:
```
VNet Subnet: 10.0.0.0/24 (256 addresses)
└─ Node IPs: 10.0.0.4-10.0.0.254 (251 usable; Azure reserves .0-.3 and .255)

Secondary Ranges (overlay, hyperscale values for a VNet in 10.0.0.0/8):
├─ Pod CIDR:     100.64.0.0/13   (managed by Azure CNI, not from VNet; a fixed /24 per node)
└─ Service CIDR: 192.168.0.0/18  (managed by Kubernetes, not from VNet)
```

**Benefits**:
- Pod IPs don't consume VNet addresses
- Enables 200,000 pods per cluster
- Better scaling than direct CNI (limited to 50K pods)
- Reduced operator complexity

### Managed VNet vs Custom VNet

**Managed VNet**:
- AKS creates the VNet and its subnets automatically and picks their address ranges
- The plan's VNet, node subnets, API server subnet, and internal load-balancer subnet can't be used
- Allows the `managedNATGateway` and `managedNATGatewayV2` outbound types
- Suits clusters that don't need a planned address layout

**Custom (bring-your-own) VNet** (Recommended with these plans):
- You create the VNet from the plan's `vpc.cidr` and its subnets from `subnets`
- Nodes join with `--vnet-subnet-id` (`subnets.private`); API Server VNet Integration uses `--apiserver-subnet-id` (`subnets.controlPlane[0]`)
- Egress through `userAssignedNATGateway` or `userDefinedRouting` ([Microsoft: outbound types](https://learn.microsoft.com/en-us/azure/aks/egress-outboundtype))
- Required to use the plan's address layout, at every tier

---

## 7. AKS Resource Quotas

### Subscription-Level Quotas

| Item | Enterprise Agreement | CSP/Pay-As-You-Go | Free Trial |
|------|-------------------|-------------------|-----------|
| **Max Clusters** (default for new subscriptions) | 100 per region | 10 per region | 3 per region ([Microsoft: AKS quotas](https://learn.microsoft.com/en-us/azure/aks/quotas-skus-regions)) |
| **Max Subscriptions** | N/A | N/A | 1 |
| **Quota Request** | Can request increase | Can request increase | Cannot increase |

### Cluster-Level Quotas

| Limit | Value | Notes |
|-------|-------|-------|
| Clusters per subscription globally | 5,000 | Soft limit |
| Nodes per cluster (with VMSS) | 5,000 | Hard limit |
| Nodes per node pool (VMSS) | 1,000 | Hard limit |
| Node pools per cluster | 100 | Hard limit |
| Pods per node (max) | 250 | With Azure CNI |
| Pods per cluster (with CNI Overlay) | 200,000 | Scale target: performance degrades past it, but the cluster doesn't immediately fail |
| Load-balanced services (Standard LB) | 300 | Per cluster |

### Quota Enforcement

AKS enforces the managed cluster quota per subscription per region ([Microsoft: AKS quotas](https://learn.microsoft.com/en-us/azure/aks/quotas-skus-regions)):
- Exceeding it fails with `ManagedClusterCountExceedsQuotaLimit`; request more on the Azure portal Quotas page (self-service up to 1,000 clusters per region for Enterprise Agreement and 100 for pay-as-you-go and CSP; Free Trial and Azure for Students can't be increased)
- Defaults for new subscriptions may be lower in regions with capacity constraints
- Node VMs also need subscription vCPU quota, and an upgrade temporarily uses extra

---

## 8. RFC 1918 Private Address Space Compliance

The API puts the VNet and the service range in RFC 1918 space, and the pod range in RFC 1918 or RFC 6598 (`100.64.0.0/10`) space, the two kinds of pod CIDR Microsoft supports ([Microsoft: Azure CNI Overlay IP address planning](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay#ip-address-planning)).

AKS also reserves `169.254.0.0/16`, `192.0.2.0/24`, `172.30.0.0/16`, and `172.31.0.0/16` for the cluster's service, pod, and virtual network ranges, and rejects ranges that overlap them ([Microsoft: AKS CNI networking prerequisites](https://learn.microsoft.com/en-us/azure/aks/concepts-network-cni-overview#aks-cni-networking-prerequisites)). The first two are outside every range the API accepts. The last two are inside `172.16.0.0/12`, so with `"provider": "aks"` the API rejects a VNet, `podsCidr`, or `servicesCidr` that overlaps them, and never generates or randomly picks them.

### Supported Ranges

| Range | Size | Our Primary Usage |
|-----------|------|------------------|
| **10.0.0.0/8** | 16.7M | Primary VNet (e.g., 10.0.0.0/18), or pods when the VNet is in another block |
| **172.16.0.0/12** | 1.0M | Pods for a VNet in 10.0.0.0/8 below hyperscale (e.g., 172.16.0.0/16 for enterprise), clear of 172.17.0.0/16, 172.30.0.0/16, and 172.31.0.0/16 |
| **192.168.0.0/16** | 65.5K | Service CIDR (192.168.0.0/18 for Hyperscale, 192.168.0.0/20 otherwise) |
| **100.64.0.0/10** (RFC 6598) | 4.2M | Hyperscale pods for a VNet in 10.0.0.0/8 (100.64.0.0/13): every /13 left in 172.16.0.0/12 holds a reserved range |

Generated pods and services go in blocks the VNet does not use, and never overlap `172.17.0.0/16` (Docker's default bridge network) or the AKS-reserved ranges. For a VNet in `10.0.0.0/8` the API uses `172.16.0.0/<podsPrefix>` (hyperscale: `100.64.0.0/13`) and `192.168.0.0/<servicesPrefix>`; for a VNet in `172.16.0.0/12`, `10.0.0.0/<podsPrefix>` and `192.168.0.0/<servicesPrefix>`; for a VNet in `192.168.0.0/16`, `10.0.0.0/<podsPrefix>` and `172.16.0.0/<servicesPrefix>`. `podsCidr` and `servicesCidr` override either range (for example, a `/11` `podsCidr` for 5,000 nodes, or an existing cluster's service CIDR).

### Allocation Strategy (Example)

```
Hyperscale Tier Allocation (provider "aks"):
VNet: 10.0.0.0/18 (16,384 addresses)
├─ Public Subnets: 3 × /23 (1,536 total for LBs, NAT gateways)
├─ Node Subnets: 3 × /20 (12,288 addresses, 12,273 usable; regional, node pools set zones 1, 2, 3)
├─ API Server Subnet: 10.0.6.0/28 (API Server VNet Integration)
├─ Pod Overlay: 100.64.0.0/13 (524,288 addresses, RFC 6598, outside the VNet)
└─ Service CIDR: 192.168.0.0/18 (16,384 addresses, outside the VNet)
```

### Azure Compliance

-  VNet must use RFC 1918 and stay clear of `172.30.0.0/16` and `172.31.0.0/16` (enforced by the API)
-  Pod range in RFC 1918 or `100.64.0.0/10`; service range in RFC 1918; both clear of the AKS-reserved ranges (enforced by the API)
-  No public IP addresses for pod/service CIDRs (enforced by the API)
-  No overlap between ranges (enforced by the API and by Azure)

---

## 9. Multi-Availability Zone Deployment

### AZs and Cluster Tiers

**Free Tier**: Single AZ
- Not recommended for production
- No HA guarantees

**Standard/Premium Tiers**: Multi-AZ Ready

| Tier | Recommended AZ Distribution |
|------|----------------------------|
| Micro | Single AZ (acceptable for dev) |
| Standard | 1-2 AZs (dual HA) |
| Professional | 2-3 AZs (zone redundancy) |
| Enterprise | 3 AZs (maximum redundancy) |
| Hyperscale | 3 AZs (zone redundancy) |

### Node Pool Distribution

Azure subnets are regional, so a plan's node subnets are not tied to zones and carry no `availabilityZone`; each node pool sets its own zones (`zones = ["1", "2", "3"]`).

**Hyperscale with 3 AZs**:
```
Zone 1: System pool (2 nodes) + User pool 1 (1,000 nodes)
Zone 2: User pool 2 (1,000 nodes) + User pool 3 (1,000 nodes)
Zone 3: User pool 4 (1,000 nodes) + User pool 5 (998 nodes)
Total: 5,000 nodes across 3 zones (the AKS maximum; needs a /11 podsCidr)
```

### AZ Considerations

- **Pod Affinity**: Control plane distributes pods across zones
- **Node Affinity**: Workloads can target specific zones
- **Failure Isolation**: Zone failure only affects pods in that zone
- **Cost**: No subnet cost from zones. A VNet and its subnets span every zone in the region at no extra cost for zone redundancy, and node pools, not subnets, choose zones ([Microsoft: Virtual Network reliability](https://learn.microsoft.com/en-us/azure/reliability/reliability-virtual-network))

---

## 10. Comparison: AKS vs EKS vs GKE

### Network Architecture

| Aspect | AKS | EKS | GKE |
|--------|-----|-----|-----|
| **Model** | VNet + Azure CNI | VPC + EC2 ENI | VPC + Alias IPs |
| **Pod IP Source** | Overlay or VNet | Secondary IPs | Alias ranges |
| **Max Pods** | 200K (Overlay) | 250/node × nodes | 110/node × nodes |
| **IP Calculation** | `/24` per node from the pod CIDR (fixed, CNI Overlay) | `ENIs × IPs × prefixes` | `/24` per node |
| **Configuration** | Azure CLI/Portal | Terraform/AWS CLI | `gcloud` |

### Throttling/Scaling

| Aspect | AKS | EKS | GKE |
|--------|-----|-----|-----|
| **Throttling** | Token bucket (ARM) | Per-IP rate limiting | Automatic (managed) |
| **Max Nodes** | 5,000 | 100,000 (with support) | 5,000 (Autopilot) |
| **Max Pods** | 200,000 | Unlimited (node limit) | 200,000 (GKE limit) |
| **Node Pools** | 100 max | Unlimited | Unlimited |
| **Nodes/Pool** | 1,000 max | Unlimited | 1,000 per zone (Standard clusters; [GKE quotas](https://cloud.google.com/kubernetes-engine/quotas)) |

### Our Implementation Strategy

**AKS Focus**: Custom (bring-your-own) VNet integration, CNI overlay, token bucket awareness
**EKS Focus**: ENI prefix delegation, Nitro instances, per-IP rate limiting  
**GKE Focus**: Automatic alias IPs, pod density formulas

**All Three Covered**:
-  Tier configurations support all three
-  Default settings work for all
-  Over-provisioning makes tuning optional
-  Documentation addresses platform-specific details

---

## 11. Recommended Best Practices for AKS

### Cluster Configuration

1. **Use Azure CNI Overlay** (default for new clusters)
   - Enables 200K pods per cluster
   - Recommended by Microsoft for scalability
   - No VNet IP pressure

2. **Standard Tier Control Plane** (minimum for production)
   - Auto-scales with cluster size
   - Better API server capacity
   - Recommended for all production workloads

3. **Multiple Node Pools** (for >1000 nodes)
   - Maximum 1,000 nodes per pool
   - Distribute across 5 pools for 5,000 nodes
   - Enables zone distribution

4. **NAT Gateway** (for cluster egress)
   - With the plan's custom VNet: `outbound_type = userAssignedNATGateway`, with a NAT gateway you create first and attach to the node subnets, or `userDefinedRouting`; `managedNATGateway` and `managedNATGatewayV2` apply only to AKS-managed VNets ([Microsoft: outbound types](https://learn.microsoft.com/en-us/azure/aks/egress-outboundtype))
   - At least 2 public IPs on the NAT gateway for large clusters
   - Proper outbound scaling
   - Better than load balancer for egress

### Scaling Operations

1. **Scale in Batches**
   - For >1000 nodes: scale 500-700 at a time
   - 2-5 minute wait between operations
   - Prevents Azure API throttling

2. **Monitor During Scale**
   - API server latency tracking
   - Control plane resource usage
   - Pod scheduling metrics

3. **Upgrade Considerations**
   - Cannot upgrade at 5,000 nodes (no surge capacity)
   - Scale down to <3,000 nodes before upgrade
   - Plan maintenance windows carefully

### Network Configuration

1. **Use a Custom (bring-your-own) VNet** built from the plan
   - Create the VNet from `vpc.cidr` and its subnets from `subnets`
   - An AKS-managed VNet picks its own ranges, so the plan's VNet, node subnets, and API server subnet can't be used
   - Applies to every tier, Hyperscale included

2. **Network Policy** (for security)
   - Azure NPM: Up to 250 nodes only
   - For larger clusters: Use Cilium or network segmentation
   - Plan policy early

3. **Multi-AZ Deployment** (production minimum)
   - Zone redundancy
   - Automatic pod redistribution
   - HA guarantees

---

## 12. Tier Compliance Checklist

### All Tiers

- [x] RFC 1918 private addressing (pods may also use RFC 6598 `100.64.0.0/10`); AKS-reserved `172.30.0.0/16` and `172.31.0.0/16` avoided
- [x] Azure CNI compatible
- [x] Service CIDR defined (/20; /18 for hyperscale)
- [x] API Server VNet Integration subnet defined (/28)
- [x] Pod CIDR defined (varies by tier)
- [x] Node pools supported
- [x] Node quota calculation verified
- [x] AKS quota system compatible
- [x] Azure Monitor integration ready

### Professional & Above (Production)

- [x] Standard tier control plane recommended
- [x] Multi-AZ capable (2-3 zones)
- [x] Load-balanced service limits understood (<300)
- [x] Network policy considerations noted
- [x] Azure throttling limits understood
- [x] Scaling batch recommendations included

### Enterprise & Hyperscale (Large Scale)

- [x] Multiple node pools required
- [x] Token bucket throttling accounted for
- [x] Node pool distribution strategy documented
- [x] Premium tier control plane recommended (Hyperscale)
- [x] Azure CNI Overlay mandatory (Hyperscale)
- [x] Cluster upgrade limitations noted
- [x] Monitoring requirements specified
- [x] Cluster services scaling guidelines provided

---

## 13. AKS-Specific Algorithms

### 1. Token Bucket Throttling

**Algorithm**:
```
bucket_size = burst_rate
refill_rate = sustained_rate

on_request():
  if bucket_size > 0:
    bucket_size -= 1
    return ACCEPT
  else:
    return REJECT_429

on_tick(time):
  if bucket_size < initial_size:
    bucket_size += refill_rate * elapsed_time
```

**Applied to PUT ManagedCluster**:
- Burst: 20 requests initially allowed
- Sustained: 1 request per minute refill
- Scope: Per managed cluster

### 2. Node IP Allocation

**Formula**:
```
Node_Capacity = 2^(32 - subnet_prefix) - 5   (Azure reserves 5 addresses per subnet)

Examples:
/26 = 2^6 - 5 = 59 nodes (micro public)
/25 = 2^7 - 5 = 123 nodes (micro private)
/24 = 2^8 - 5 = 251 nodes (standard private)
/23 = 2^9 - 5 = 507 nodes (professional private)
/21 = 2^11 - 5 = 2,043 nodes (enterprise private)
/20 = 2^12 - 5 = 4,091 nodes (hyperscale private)
```

### 3. Pod CIDR Space (Overlay Model)

**Formula**:
```
Pod_Addresses = 2^(32 - pod_prefix)
Node_Capacity = 2^(24 - pod_prefix)   (a fixed /24 per node)

Examples:
/18 = 2^14 = 16,384 addresses (64 nodes)
/16 = 2^16 = 65,536 addresses (256 nodes)
/13 = 2^19 = 524,288 addresses (2,048 nodes)
/11 = 2^21 = 2,097,152 addresses (8,192 nodes; covers 5,000)
AKS scale target: 200,000 pods per cluster (not a hard limit)
```

### 4. Service CIDR Allocation

**Formula**:
```
Service_Addresses = 2^(32 - service_prefix)
Max_LoadBalancer_Services = 300 per cluster (type LoadBalancer, Standard
    Load Balancer); ClusterIP services are bounded by the service CIDR size

/20 (our default, micro through enterprise) = 4,096 addresses
/18 (our hyperscale default) = 16,384 addresses (above Kubernetes' tested
    limit of 10,000 services)
AKS requires a service CIDR smaller than /12
```

---

## 14. Recommended Next Steps

### Priority 1 (Ready to Implement)

1. **Add AKS-Specific Algorithms to Docs**
   - Token bucket explanation with examples
   - Node IP formula: `2^(32-prefix) - 5`
   - Pod CIDR overlay calculations
   - Service CIDR allocation

2. **Document Azure CNI Overlay Benefits**
   - Comparison table: Overlay vs Direct CNI vs Kubenet
   - 200K pod support explanation
   - VNet IP pressure reduction

3. **Add Scaling Batch Guidance**
   - Examples of batch sizes (500-700 nodes)
   - Timing recommendations (2-5 minute waits)
   - API throttling prevention

### Priority 2 (Future Enhancement)

1. **Add Multi-Node Pool Calculator**
   - Accept node count, suggest pool distribution
   - Zone distribution recommendations
   - AZ affinity suggestions

2. **Create Azure Quota Planning Tool**
   - Calculate cluster quota requirements
   - VM SKU quota calculations
   - Multi-cluster subscription planning

3. **Add Cluster Upgrade Analyzer**
   - Detect when cluster is at max nodes
   - Recommend scale-down before upgrade
   - Estimate upgrade impact

### Priority 3 (Extended Features)

1. **Azure Cost Calculator Integration**
   - Estimate NAT gateway costs
   - Load balancer cost impact
   - Multi-AZ premium costs

2. **Network Policy Recommendation Engine**
   - Suggest NPM (up to 250 nodes) vs Cilium
   - Policy complexity estimation
   - Performance impact warnings

3. **Multi-Region AKS Planner**
   - Distribute clusters across regions
   - Handle Azure quota limits per region
   - Global network topology planning

---

## 15. Summary & Verification

### Compliance Summary

**Status**:  **COMPLIANT** with Azure AKS best practices, with one WARNING: the default hyperscale pod range (`/13`) holds 2,048 nodes at CNI Overlay's fixed `/24` per node, so a 5,000-node cluster needs a `/11` `podsCidr`

**Verified Against**:
- Microsoft Azure AKS Best Practices for Large Workloads
- Azure AKS Quotas, SKUs, and Regions documentation
- Azure CNI Overlay networking guide
- Azure Resource Manager throttling limits
- Token bucket algorithm (standard)

### Test Coverage

`npm run test -- --run` runs every unit and integration test; the [test inventory](../test-suite-analysis.md#test-inventory) says what each file covers.

**Unit Tests** (`tests/unit/`):
- Subnet calculation verification
- CIDR allocation correctness, including the AKS-reserved ranges and the `100.64.0.0/10` pod fallback (`network-separation.test.ts`)
- Provider formulas (`ip-calculation-compliance.test.ts`)

**Integration Tests** (`tests/integration/`):
- RFC 1918 compliance
- Tier scaling characteristics

### Production Readiness

-  All tier configurations production-ready
-  Documentation comprehensive
-  Token bucket throttling explained
-  Azure CNI Overlay support documented
-  Multi-node pool strategy included
-  Scaling guidelines provided
-  Upgrade limitations noted

### Configuration Notes

The tier defaults need one change for the largest AKS clusters:
- Hyperscale's 3 × `/20` private subnets hold 12,273 node IPs, enough for 5,000 nodes
- WARNING: Pod CIDR `/13` holds 524,288 pod addresses but, at a fixed `/24` per node, only 2,048 nodes; pass a `/11` `podsCidr` for 5,000 nodes
- Service CIDR `/20` (`/18` for hyperscale)
- All tier configurations validated for Azure compatibility

**Current AKS Tier Configuration Summary** (`GET /api/k8s/tiers?provider=aks`; every tier also has one `/28` API server subnet):
- **Micro**: 1 × /26 public, 1 × /25 private, /24 min VPC, /20 pods, /20 services
- **Standard**: 1 × /25 public, 1 × /24 private, /23 min VPC, /16 pods, /20 services
- **Professional**: 2 × /25 public, 2 × /23 private, /21 min VPC, /18 pods, /20 services
- **Enterprise**: 3 × /24 public, 3 × /21 private, /19 min VPC, /16 pods, /20 services
- **Hyperscale**: 3 × /23 public, 3 × /20 private, /18 min VPC, /13 pods, /18 services

---

## 16. Files Modified

**Documentation Files Created/Updated**:

1. **AKS_COMPLIANCE_AUDIT.md** (UPDATED February 4, 2026)
   - This comprehensive audit document
   - 16 sections covering all aspects
   - Updated with differentiated public/private subnet sizes
   - Ready for reference in Azure documentation

2. **[kubernetes-network-reference.md](kubernetes-network-reference.md#aks-compliance--ip-formulas)** (DONE; `.github/copilot-instructions.md` is now a short index of `.github/instructions/`, so the formulas live in this reference)
   - "AKS Compliance & IP Formulas" section
   - Document token bucket algorithm
   - Include Azure CNI Overlay architecture
   - Add multi-node pool strategies
   - Include throttling prevention guidelines

3. **shared/kubernetes-schema.ts** (UPDATED)
   - `PROVIDER_RESERVED_RANGES.aks` lists `172.30.0.0/16` and `172.31.0.0/16`: the generator never allocates them, and a caller's VNet, `podsCidr`, or `servicesCidr` that overlaps them is rejected
   - AKS subnets carry no `availabilityZone` (Azure subnets are regional), and every AKS plan has one `/28` control-plane subnet (`CONTROL_PLANE_SUBNET_PREFIX`), the API server subnet
   - A caller's `servicesCidr` must be `/13` to `/24`, inside AKS's smaller-than-`/12` rule
   - Tier descriptions note CNI Overlay's fixed `/24` per node (the hyperscale `/13` pod range holds 2,048 nodes)

---

## Optional Enhancements

These optional configurations can improve scalability and observability for large-scale AKS deployments:

### Azure NAT Gateway Scaling Considerations

**Azure NAT Gateway Specifications** (Azure documentation):
- **SNAT Port Allocation**: 64,512 ports per public IP address
- **Port Allocation**: Dynamic, shared across all VMs in subnet
- **Public IPs per NAT Gateway**: 1-16 public IPs (1,032,192 total ports max)
- **Connection Limit**: up to 2 million active connections per NAT Gateway
- **Throughput**: up to 50 Gbps per Standard NAT Gateway (StandardV2: up to 100 Gbps)
- **Subnets**: each subnet can have at most one NAT Gateway
- **Documentation**: [Azure NAT Gateway resource limits](https://learn.microsoft.com/en-us/azure/nat-gateway/nat-gateway-resource)

**Scaling Recommendations**:
1. **Hyperscale Tier (5000 nodes @ 200K pods)**:
   - **NAT Gateway Configuration**:
     - Attach NAT Gateway to all private subnets (3 subnets)
     - Allocate 4-8 public IPs per NAT Gateway (258,048-516,096 ports)
     - Monitor SNAT port usage with Azure Monitor
   - **Monitoring**:
     ```bash
     az monitor metrics list \
       --resource <nat-gateway-resource-id> \
       --metric "SNATConnectionCount" \
       --aggregation Average
     ```

2. **Enterprise Tier (50 nodes)**:
   - Single public IP per NAT Gateway sufficient
   - 64,512 SNAT ports, and up to 50,000 concurrent connections per public IP to the same destination endpoint
   - Standard SKU (default)

3. **Monitoring**:
   - Metric: `SNATConnectionCount` (active connections)
   - Metric: `ByteCount` (throughput)
   - Alert on: `SNATConnectionCount > 50000` (port exhaustion warning)

### Azure Load Balancer Integration

**AKS Load Balancer Options**:
- **Azure Load Balancer Standard**: Layer 4, Service type LoadBalancer
- **Azure Application Gateway**: Layer 7, Ingress controller (AGIC)
- **Internal Load Balancer**: Private subnet traffic only

**Subnet Requirements** (from AKS documentation):
- **Primary Subnet (Nodes)**: Must support all node IPs
- **Pod Overlay CIDR**: Separate range (10.244.0.0/16 default for kubenet)
- **Service CIDR**: 10.0.0.0/16 default (internal cluster networking)
- **Load Balancer IPs**: Allocated from Azure public IP pool or private subnet

**Azure CNI Overlay** (recommended for large clusters):
- Separates pod IPs from VNet (no VNet IP exhaustion)
- Supports 200,000 pods per cluster (vs 50K for direct CNI)
- Nodes use VNet IPs, pods use overlay network
- Better scalability for hyperscale deployments

### Official Documentation References

**AKS Networking**:
- [AKS Network Concepts](https://learn.microsoft.com/en-us/azure/aks/concepts-network)
- [Azure CNI Overlay](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
- [AKS Network Planning](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni)

**Azure Virtual Network**:
- [Azure NAT Gateway](https://learn.microsoft.com/en-us/azure/nat-gateway/nat-overview)
- [NAT Gateway Metrics and Alerts](https://learn.microsoft.com/en-us/azure/nat-gateway/nat-metrics)
- [VNet Quotas and Limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#networking-limits)

**AKS Best Practices**:
- [AKS Baseline Architecture](https://learn.microsoft.com/en-us/azure/architecture/reference-architectures/containers/aks/baseline-aks)
- [AKS Network Best Practices](https://learn.microsoft.com/en-us/azure/aks/operator-best-practices-network)
- [Azure Well-Architected Framework - AKS](https://learn.microsoft.com/en-us/azure/well-architected/service-guides/azure-kubernetes-service)

---

## References

**Microsoft Azure Documentation**:
- [Best Practices for Performance and Scaling for Large Workloads in AKS](https://learn.microsoft.com/en-us/azure/aks/best-practices-performance-scale-large)
- [Quotas, SKUs, and Regions in AKS](https://learn.microsoft.com/en-us/azure/aks/quotas-skus-regions)
- [Azure CNI Overlay Networking](https://learn.microsoft.com/en-us/azure/aks/azure-cni-overlay)
- [Configure Azure CNI Networking](https://learn.microsoft.com/en-us/azure/aks/configure-azure-cni-dynamic-ip-allocation)
- [AKS at Scale Troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-kubernetes/aks-at-scale-troubleshoot-guide)

**Related Audit Documents**:
- [GKE_COMPLIANCE_AUDIT.md](./GKE_COMPLIANCE_AUDIT.md) - Google Kubernetes Engine compliance
- [EKS_COMPLIANCE_AUDIT.md](./EKS_COMPLIANCE_AUDIT.md) - AWS Elastic Kubernetes Service compliance

---

**Document Status**: Complete and ready for reference  
**Last Updated**: February 4, 2026  
**Compliance Level**: Production Ready 
