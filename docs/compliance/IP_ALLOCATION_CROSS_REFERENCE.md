# Cloud Provider IPv4 Allocation Cross-Reference

**Date**: February 2, 2026  
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
| **LoadBalancer IPs** | External (ALB/NLB separate IPs/DNS) | External (GCP LB separate IPs) | External (Azure LB separate IPs) |
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
  - **Traditional**: Individual secondary IPs (~50 per Node)
  - **Modern (IP Prefix Delegation)**: `/28` blocks (16 IPs per prefix, Nitro instances only)
  - **Max Pods/Node**: 110 default, 250 with prefix delegation

**Service IPs**:
- **Source**: Separate virtual IP range (our API provides `/16` Service CIDR)
- **Method**: ClusterIP allocation managed by kube-proxy
- **Routing**: Internal routing only (not routable outside cluster)
- **Does NOT overlap**: Service CIDR is completely separate from VPC CIDR

**LoadBalancer IPs**:
- **Source**: External AWS resources (ALB or NLB)
- **Method**: AWS provisions public/private IPs or DNS names
- **Does NOT consume VPC CIDR**: LoadBalancers have their own IP allocation
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

**Solution**: Our Hyperscale tier uses `/18` subnets (16,384 IPs) to accommodate high pod density

#### IP Prefix Delegation (EKS-Specific)

**What It Is**: Modern AWS VPC CNI feature for Nitro-based instances

**How It Works**:
- Instead of individual secondary IPs, Nodes request `/28` CIDR blocks
- Each `/28` block provides 16 IP addresses
- Nodes can hold multiple prefixes (up to instance type limit)
- **Max Pods/Node**: 250 (vs 110 without prefix delegation)

**Requirements**:
- Nitro-based EC2 instances (c5+, m5+, r5+, t3+, etc.)
- Subnets must have contiguous `/28` blocks available
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
- **Method**: Each Node gets a `/24` alias IP range (256 addresses) from Pod CIDR
- **Google-Managed**: Alias ranges automatically allocated by GKE
- **Does NOT consume Node subnet**: Pod IPs come from separate secondary range
- **Max Pods/Node**: 110 default (Standard), 32 default (Autopilot)

**GKE Pod CIDR Formula**:
```
Given:
  Q = Max pods per node (110 for Standard, 32 for Autopilot)
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
- **Source**: Separate virtual IP range (our API provides `/16` Service CIDR)
- **Method**: ClusterIP allocation managed by kube-proxy
- **Does NOT overlap**: Service CIDR is separate from VPC CIDR and Pod CIDR

**LoadBalancer IPs**:
- **Source**: External Google Cloud Load Balancer
- **Method**: Google Cloud provisions public/private IPs
- **Does NOT consume VPC CIDR**: LoadBalancers have their own IP allocation

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
- **Method**: Each Pod gets an IP from overlay network (no VNet consumption)
- **Azure-Managed**: Overlay network automatically configured by AKS
- **Does NOT consume VNet**: Pod IPs never touch VNet address space
- **Max Pods/Node**: 250 pods max
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
- **Source**: Separate virtual IP range (our API provides `/16` Service CIDR)
- **Method**: ClusterIP allocation managed by kube-proxy
- **Does NOT overlap**: Service CIDR is separate from VNet and Overlay CIDR

**LoadBalancer IPs**:
- **Source**: External Azure Load Balancer
- **Method**: Azure provisions public/private IPs
- **Does NOT consume VNet CIDR**: LoadBalancers have their own IP allocation

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
| **EKS** | 5,000 (VPC) | 550,000 (VPC secondary) | 65,536 (separate) | External | **555,000 VPC IPs needed** |
| **GKE** | 5,000 (VPC) | 225,280 (alias range) | 65,536 (separate) | External | **5,000 VPC IPs needed** |
| **AKS** | 5,000 (VNet) | 200,000 (overlay) | 65,536 (separate) | External | **5,000 VNet IPs needed** |

**Key Insight**: 
- **EKS**: Needs 555K VPC IPs (Nodes + Pods compete)
- **GKE**: Needs 5K VPC IPs (alias ranges separate)
- **AKS**: Needs 5K VNet IPs (overlay completely separate)

---

## Subnet Sizing Recommendations

### EKS Recommendations

**Problem**: Pods and Nodes share VPC CIDR space

**Hyperscale Tier (5,000 nodes, 110 pods/node)**:
- **Primary Subnet**: `/18` (16,384 IPs per subnet)
- **Why**: Must accommodate both Nodes (5K) and Pod secondary IPs (550K potential)
- **Multiple Subnets**: Use 8 subnets across 3 AZs for distribution
- **Pod CIDR**: `/13` (524K IPs) - separate configuration for VPC CNI
- **IP Prefix Delegation**: REQUIRED for high-density (>100 pods/node)

### GKE Recommendations

**Advantage**: Node subnet only needs Node IPs

**Hyperscale Tier (5,000 nodes)**:
- **Primary Subnet**: `/18` (16,384 IPs per subnet) - for Nodes only
- **Why**: Google manages alias ranges automatically
- **Pod CIDR**: `/13` (524K IPs via alias ranges)
- **No fragmentation**: Google handles allocation

### AKS Recommendations

**Advantage**: Overlay CIDR is completely decoupled

**Hyperscale Tier (5,000 nodes)**:
- **Primary Subnet**: `/18` (16,384 IPs per subnet) - for Nodes only
- **Why**: Pods use overlay network (no VNet pressure)
- **Overlay CIDR**: `/13` (524K IPs) - separate overlay network
- **Max Pods**: 200,000 cluster limit (AKS constraint)

---

## Common Misconceptions

### Misconception 1: "Pods share Node IPs"

 **FALSE** for all three platforms:
- **EKS**: Pods get unique secondary IPs from Node ENI (NOT shared)
- **GKE**: Pods get unique alias IPs from Node's `/24` range (NOT shared)
- **AKS**: Pods get unique overlay IPs (NOT shared)

**Exception**: Pods with `hostNetwork: true` DO share the Node's IP (all platforms)

### Misconception 2: "Service CIDR consumes VPC/VNet space"

 **FALSE** for all three platforms:
- Service CIDR is a virtual IP range for ClusterIP services
- Managed by kube-proxy for internal routing only
- Does NOT overlap with VPC/VNet CIDR
- Not routable outside the cluster

### Misconception 3: "LoadBalancers consume VPC/VNet IPs"

 **FALSE** for all three platforms:
- LoadBalancers are external resources with their own IP pools
- **EKS**: AWS ALB/NLB provisions separate IPs or DNS names
- **GKE**: Google Cloud Load Balancer provisions separate IPs
- **AKS**: Azure Load Balancer provisions separate IPs
- They target Node/Pod IPs but do NOT consume VPC/VNet space

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
| **IP exhaustion risk?** |  HIGH |  LOW | ❌ NONE |
| **Subnet sizing complexity** | High (must account for Pods) | Medium (Google helps) | Low (just Nodes) |
| **Prefix delegation needed?** |  YES (Nitro instances) | ❌ NO (automatic) | ❌ NO (overlay) |
| **Fragmentation risk?** |  YES (prefix allocation) | ❌ NO (Google manages) | ❌ NO (overlay) |
| **Best for large clusters?** | ⚠️ With careful planning |  YES |  YES |

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
| **Ports per IP** | 64,512 (1024-65535) | 64,512 (1024-65535) | 64,000 (configurable 1,024-64,000) |
| **Default ports/VM** | Dynamic | 64 | Dynamic |
| **Max ports/VM** | 64,512 | 64,512 | 64,000 |
| **Max IPs per gateway** | 1 (per gateway) | 350 | 16 |
| **Connection limit** | 55,000/destination | No specific limit | No specific limit |
| **Bandwidth** | 100 Gbps | No limit | No limit |
| **IP allocation model** | 1 EIP per NAT Gateway | Multiple IPs per gateway | Multiple IPs per gateway |
| **Scaling strategy** | Deploy more gateways | Add IPs to gateway | Add IPs to gateway or more gateways |

### Hyperscale Tier NAT Gateway Calculations (5,000 Nodes)

#### Scenario 1: Low Connection Density (64-128 ports/node)

| Provider | Calculation | Result |
|----------|-------------|--------|
| **EKS** | 5,000 × 64 = 320,000 ports<br>320,000 / 64,512 = 5 IPs<br>5 NAT Gateways (1 IP each) | **5 NAT Gateways**<br>**5 Elastic IPs** |
| **GKE** | 5,000 × 64 = 320,000 ports<br>320,000 / 64,512 = 5 IPs<br>1 Cloud NAT gateway | **1 Cloud NAT gateway**<br>**5 External IPs** |
| **AKS** | 5,000 × 128 = 640,000 ports<br>640,000 / 64,000 = 10 IPs<br>1 NAT Gateway | **1 NAT Gateway**<br>**10 Public IPs** |

#### Scenario 2: High Connection Density (1,024 ports/node)

| Provider | Calculation | Result |
|----------|-------------|--------|
| **EKS** | 5,000 × 1,024 = 5,120,000 ports<br>5,120,000 / 64,512 = 80 IPs<br>80 NAT Gateways | **80 NAT Gateways**<br>**80 Elastic IPs**<br>⚠️ HIGH COST |
| **GKE** | 5,000 × 1,024 = 5,120,000 ports<br>5,120,000 / 64,512 = 80 IPs<br>1 Cloud NAT gateway | **1 Cloud NAT gateway**<br>**80 External IPs** |
| **AKS** | 5,000 × 1,024 = 5,120,000 ports<br>5,120,000 / 64,000 = 80 IPs<br>5 NAT Gateways (16 IPs each) | **5 NAT Gateways**<br>**80 Public IPs**<br>⚠️ EXCEEDS SINGLE GATEWAY LIMIT |

### NAT Gateway Quota Limits

| Resource | EKS (AWS) | GKE (Google Cloud) | AKS (Azure) |
|----------|-----------|-------------------|-------------|
| **NAT Gateways per region** | 5 per AZ (soft) | 10 default, 100 max | 1,000 per subscription |
| **IPs per gateway** | 1 (fixed) | 2 default, 350 max | 16 max (hard limit) |
| **Max VMs per gateway** | No limit | 8,000 default, 32,000 max | No specific limit |
| **Idle timeout** | 350s TCP (fixed) | 600s TCP (configurable) | 4-120 min (configurable) |

### Best Practices Summary

**EKS**:
- ✅ Deploy NAT Gateway per AZ (typically 3 for HA)
- ✅ Monitor connection limits (55K per destination)
- ⚠️ Cost scales with gateway count
- ✅ Use VPC Endpoints for AWS services to reduce NAT traffic

**GKE**:
- ✅ Single Cloud NAT gateway can handle 350 IPs
- ✅ Start with 64 ports/VM, increase to 1024+ for API-heavy workloads
- ✅ Use multiple NAT gateways for isolation (per node pool)
- ✅ Monitor `nat/sent_packets_count` and `nat/dropped_sent_packets_count`

**AKS**:
- ✅ Single NAT Gateway supports up to 1,024,000 ports (16 IPs × 64K)
- ⚠️ For 5,000 nodes with high connections, deploy 3-5 NAT Gateways
- ✅ Use Azure Private Link for Azure services
- ⚠️ Be aware of token bucket API throttling for large scale operations

---

## Load Balancer IP Consumption Comparison

### Load Balancer Types & IP Sources

| LB Type | EKS (AWS) | GKE (Google Cloud) | AKS (Azure) |
|---------|-----------|-------------------|-------------|
| **External (Internet-facing)** | ALB/NLB<br>AWS-managed IPs<br>❌ No VPC impact | Global/Regional LB<br>Google-managed IPs<br>❌ No VPC impact | Azure LB (Standard)<br>Azure-managed IPs<br>❌ No VNet impact |
| **Internal (Private)** | Internal ALB/NLB<br>✅ 1 IP/AZ from VPC subnet | Internal TCP/UDP LB<br>✅ 1 IP from VPC subnet | Internal LB (Standard)<br>✅ 1 IP from VNet subnet |
| **Layer 7 (HTTP/HTTPS)** | ALB<br>AWS-managed | Global HTTP(S) LB<br>Google-managed | Application Gateway<br>✅ Dedicated /24 subnet |

### Kubernetes Service Integration

**Service Type: LoadBalancer (External)**

| Provider | Result | IP Consumption |
|----------|--------|----------------|
| **EKS** | Provisions NLB or CLB<br>DNS name or AWS IP | ❌ No VPC IPs |
| **GKE** | Provisions Regional Network LB<br>Google external IP | ❌ No VPC IPs |
| **AKS** | Provisions Azure LB (Standard)<br>Azure public IP | ❌ No VNet IPs |

**Service Type: LoadBalancer (Internal)**

| Provider | Result | IP Consumption |
|----------|--------|----------------|
| **EKS** | Internal NLB<br>1 IP per AZ | ✅ 3 IPs (3-AZ cluster) |
| **GKE** | Internal TCP/UDP LB<br>1 IP per LB | ✅ 1 IP |
| **AKS** | Internal LB (Standard)<br>1 IP per LB | ✅ 1 IP |

### Hyperscale Tier Load Balancer IP Consumption (5,000 Nodes)

**Estimated Services**: 20 external, 10 internal

| Provider | External LBs | Internal LBs | VPC/VNet IP Impact |
|----------|-------------|-------------|-------------------|
| **EKS** | 20 ALB/NLB<br>AWS IPs | 10 Internal NLB<br>10 × 3 AZs = 30 IPs | **30 VPC IPs consumed** |
| **GKE** | 20 External LB<br>Google IPs | 10 Internal LB<br>10 × 1 IP = 10 IPs | **10 VPC IPs consumed** |
| **AKS** | 20 Azure LB<br>Azure IPs | 10 Internal LB<br>10 × 1 IP = 10 IPs | **10 VNet IPs consumed** |

### Ingress Controller IP Consumption

| Provider | Ingress Type | IP Consumption |
|----------|-------------|----------------|
| **EKS** | AWS ALB Ingress Controller<br>(provisions ALB per Ingress) | AWS-managed IPs (no VPC impact)<br>Internal: 3 IPs per ALB (per AZ) |
| **GKE** | GKE Ingress<br>(provisions GCP Load Balancer) | 1 global anycast IP (no VPC impact)<br>Internal: 1 IP per Ingress |
| **AKS** | Application Gateway Ingress<br>(AGIC, provisions App Gateway) | ✅ Requires dedicated /24 subnet<br>256 IPs per App Gateway |

### Total VPC/VNet IP Consumption Summary (Hyperscale Tier)

| Component | EKS | GKE | AKS |
|-----------|-----|-----|-----|
| **Nodes** | 5,000 IPs | 5,000 IPs | 5,000 IPs |
| **Pods** | ✅ Shared with Nodes<br>(VPC CIDR competition) | ❌ Alias ranges<br>(separate, auto-managed) | ❌ Overlay CIDR<br>(separate, 10.244.0.0/16) |
| **Internal Load Balancers** | 30 IPs (10 LBs × 3 AZs) | 10 IPs | 10 IPs |
| **Application Gateways** | N/A | N/A | 512 IPs (2 × /24 subnets) |
| **NAT Gateways** | ❌ Elastic IPs<br>(external resource) | ❌ External IPs<br>(external resource) | ❌ Public IPs<br>(external resource) |
| **Total VPC/VNet IPs** | **~5,030 IPs**<br>+ Pod secondary IPs | **~5,010 IPs** | **~5,522 IPs** |

**Critical Differences**:
- **EKS**: Pods consume IPs from VPC CIDR (shared with Nodes), requires larger subnets
- **GKE**: Pods use separate alias ranges (Google-managed), minimal VPC impact
- **AKS**: Pods use overlay CIDR (completely separate), Application Gateway needs dedicated subnets

### Recommended Subnet Sizing (Hyperscale Tier)

| Provider | Primary Subnet | Rationale |
|----------|---------------|-----------|
| **EKS** | **/18 (16,384 IPs)** per subnet<br>or **/17 (32,768 IPs)** for growth | Pods and Nodes share VPC CIDR<br>Need headroom for prefix delegation |
| **GKE** | **/18 (16,384 IPs)** per subnet | Nodes only (Pods use alias ranges)<br>Internal LBs minimal impact |
| **AKS** | **/18 (16,384 IPs)** for node subnets<br>+ **/24 (256 IPs)** per App Gateway | Nodes only (Pods use overlay)<br>Separate subnets for App Gateways |

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

**Last Updated**: February 4, 2026  
**Maintained By**: CIDR Subnet Calculator Team
