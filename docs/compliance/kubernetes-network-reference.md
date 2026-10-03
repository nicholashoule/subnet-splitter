# Kubernetes Network Reference

Detailed provider compliance formulas, IP calculation algorithms, and deployment tier specifications for the Kubernetes Network Planning API. See [api.md](../api.md) for endpoint documentation.

## Deployment Tiers

Generic Kubernetes, GKE, and AKS layout (`GET /api/k8s/tiers`). EKS raises micro and standard to 2 public and 2 private subnets (min VPC `/23` and `/22`), and uses 2 control-plane subnets (one `/27` in two AZs) in every tier.

| Tier | Nodes | Public Subnets | Private Subnets | Public Size | Private Size | Control Plane | Pod Space | Services | Min VPC |
|------|-------|---|---|---|---|---|---|---|---|
| **Micro** | 1 | 1 | 1 | /26 | /25 | 1 x /28 | /20 | /20 | /24 |
| **Standard** | 1-3 | 1 | 1 | /25 | /24 | 1 x /28 | /16 | /20 | /23 |
| **Professional** | 3-10 | 2 | 2 | /25 | /23 | 1 x /28 | /18 | /20 | /21 |
| **Enterprise** | 10-50 | 3 | 3 | /24 | /21 | 1 x /28 | /16 | /20 | /19 |
| **Hyperscale** | 50-5000 | 3 | 3 | /23 | /20 | 1 x /28 | /13 | /18 | /18 |

With `?networkMode=private` the public subnets become internal load-balancer subnets of the same size (GKE and AKS: 1 in every tier); every other column, including Min VPC, is unchanged.

### Address Space Separation

Every plan keeps four address spaces apart: nodes (`subnets.private`) and control plane (`subnets.controlPlane`: one network, a `/28`, or for EKS a `/27` split into two `/28`s) inside the VPC; pods and services outside it. Generated services go in an RFC 1918 block used by neither the VPC nor the pods (`192.168.0.0/16` preferred); generated pods go in an RFC 1918 block used by neither the VPC nor a caller's `servicesCidr` (`10.0.0.0/8` preferred), or in `100.64.0.0/10` (RFC 6598) when none has room. Public subnets, or internal load-balancer subnets (`subnets.loadBalancer`) in private network mode, are also inside the VPC. Subnets are placed first-fit (lowest free offset aligned to the subnet's size: public or load-balancer, then private, then control plane). Generated pod and service ranges never overlap `172.17.0.0/16`, and for AKS never overlap `172.30.0.0/16` or `172.31.0.0/16`, which AKS reserves (a VNet, `podsCidr`, or `servicesCidr` overlapping those is rejected; AKS hyperscale on a `10.x` VNet gets pods `100.64.0.0/13`). Every `vpcCidr` must be `/16` or smaller (EKS: AWS's VPC limit; other providers: a project standard), and a GKE `servicesCidr` must be `/16` to `/24`. See [api.md](../api.md#address-space-separation).

On EKS the separate pod range is for an overlay CNI (Calico, Cilium). With the default AWS VPC CNI, pods take addresses from the node subnets and `pods.cidr` goes unused; those subnets hold far fewer pods (see [EKS](#eks-compliance--ip-formulas)).

## GKE Compliance & IP Formulas

### Pod CIDR Formula

Each node receives an alias IP range sized by its max pods per node (65-128 pods: `/24`; 17-32 pods: `/26`; 8 pods `/28`, 9-16 `/27`, 33-64 `/25`, 129-256 `/23`):

```
Q = Maximum pods per node (110 Standard, 32 Autopilot)
DS = Pod subnet prefix (e.g., /13 for hyperscale)

M = 31 - ceil(log2(Q))   (netmask for node's pod range)
HM = 32 - M              (host bits for node pod range)
HD = 32 - DS              (host bits for pod subnet)
MN = 2^(HD - HM)         (maximum nodes)
MP = MN * Q              (maximum pods)

Example (Hyperscale, 110 pods/node):
  M = 24, MN = 2048 nodes, MP = 225,280 pods
```

### Node Primary Subnet Formula

```
N = 2^(32-S) - 4    (S = primary subnet prefix; GCP reserves 4 addresses per subnet)

Hyperscale: S = /20, N = 4,092 nodes
For 5,000 nodes: S = /19, N = 8,188
```

A GKE cluster takes its nodes, pods, and services from one default subnet, so the plan's other `/20` private subnets add no node capacity on their own. Past 4,092 nodes, use a `/19` node subnet (not generated) or [add subnets to the cluster](https://cloud.google.com/kubernetes-engine/docs/how-to/multi-subnet-cluster) for new node pools (GKE 1.30.3-gke.1211000 or later, up to eight, each with its own pod secondary range).

### GKE Compliance Matrix

| Aspect | Requirement | Status |
|--------|------------|--------|
| VPC-native | Yes, secondary ranges | [PASS] |
| Private address space | VPC and Services in RFC 1918; pods in RFC 1918, or `100.64.0.0/10` (RFC 6598, which GKE supports) when no RFC 1918 block has room | [PASS] |
| Max cluster | 5,000 nodes | WARNING - one `/20` node subnet holds 4,092 |
| Pod limits | 200,000 max | [PASS] |
| Service range | /20 recommended | /20 provided (/18 hyperscale) |
| Control-plane range | /28 `master_ipv4_cidr_block` | [PASS] 1 x /28 |
| Zones | Regional subnets | [PASS] No zone per subnet |
| Multi-AZ | Multiple subnets | [PASS] |

Formulas assume 110 pods/node (Standard). Autopilot uses 32 default (over-provisions safely).

## EKS Compliance & IP Formulas

### Network Model

- Nodes get IPs from the node subnets (`subnets.private`)
- **Overlay CNI (Calico, Cilium):** pods get IPs from `pods.cidr`, outside the VPC. This is what the plan's pod range is for
- **AWS VPC CNI (the EKS default):** pods get secondary IPs, or `/28` prefixes with prefix delegation, on the node's network interfaces, taken from the node subnets. `pods.cidr` goes unused, and the node subnets bound pod capacity as well as node capacity (see [EKS Tier Compliance](#eks-tier-compliance))
- **VPC CNI custom networking:** pods use subnets in a secondary VPC CIDR. A generated `pods.cidr` can't be one (AWS refuses a different RFC 1918 block than the VPC's, and secondary blocks are `/16` to `/28`); pass a `podsCidr` from `100.64.0.0/10` of `/16` or smaller, associate it with the VPC, and create one pod subnet per AZ in it
- Maximum pods per node: 250 (with prefix delegation)

### Pods per Node (VPC CNI)

```
With prefix delegation (Nitro):
  Pod_Capacity = ENIs * Prefixes_Per_ENI * 16_IPs_Per_Prefix
  Max: 250 pods/node

Without prefix delegation:
  Pod_Capacity = Secondary_IPs_Available
  Max: 50-110 pods/node (instance dependent)
```

### EKS Scalability Thresholds

| Scale | Nodes | Pods | Action |
|-------|-------|------|--------|
| Small | <300 | <10K | Standard |
| Medium | 300-1K | 10K-50K | Monitor control plane |
| Large | 1K-5K | 50K-200K | Contact AWS |
| Extreme | 5K-100K | 200K+ | AWS onboarding required |

### EKS Tier Compliance

Node capacity per private subnet is `2^(32 - prefix) - 5`: AWS reserves 5 addresses in every subnet ([AWS: subnet CIDR blocks](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html)).

| Tier | Node subnets | Node Cap per subnet | `pods.cidr` (overlay CNI) | VPC CNI: nodes at 110 pods | Tier nodes |
|------|--------------|---------------------|---------------------------|----------------------------|------------|
| Micro | 2 x /25 | 123 | /20 | 2 | 1 |
| Standard | 2 x /24 | 251 | /16 | 4 | 1-3 |
| Professional | 2 x /23 | 507 | /18 | 8 | 3-10 |
| Enterprise | 3 x /21 | 2,043 | /16 | 54 | 10-50 |
| Hyperscale | 3 x /20 | 4,091 | /13 | 108 | 50-5000 |

With the default VPC CNI, a node running P pods takes at least P + 1 addresses from its subnet (more with warm IP pools and additional network interfaces), so the VPC CNI column is an upper bound: `floor(usable / 111)` per node subnet, summed. Professional at 10 nodes and hyperscale past about 100 nodes don't fit at 110 pods per node. Use an overlay CNI with `pods.cidr`, VPC CNI custom networking with a `100.64.0.0/10` `podsCidr`, or fewer pods per node.

### Prefix Delegation Notes

- Requires Nitro instances (c5+, m5+, r5+, t3+)
- Enable: `kubectl set env ds aws-node -n kube-system ENABLE_PREFIX_DELEGATION=true`
- Fragmentation risk: use new subnets or CIDR reservations
- Set `WARM_PREFIX_TARGET=1` for proactive scaling

## AKS Compliance & IP Formulas

### Network Model

- Nodes from primary VNet subnet
- Pods from overlay CIDR (Azure CNI Overlay) or VNet (direct CNI)
- Token bucket API throttling
- Pod CIDR in RFC 1918 or RFC 6598 (`100.64.0.0/10`) space; `172.30.0.0/16` and `172.31.0.0/16` reserved for the VNet, pod, and service ranges ([Microsoft: AKS CNI networking prerequisites](https://learn.microsoft.com/en-us/azure/aks/concepts-network-cni-overview#aks-cni-networking-prerequisites))

### Pod CIDR Capacity (Overlay)

```
Pod_Addresses = 2^(32 - pod_prefix)
  /18 = 16,384 | /16 = 65,536 | /13 = 524,288
Actual limit: min(calculated, 200,000)

Node capacity: every node gets a fixed /24, whatever its max pods
  Max_Nodes = 2^(24 - pod_prefix)   (/13 = 2,048 nodes; /11 = 8,192 nodes)
  5,000 nodes needs a /11 podsCidr (lowering max pods does not help)
```

### AKS Scalability Thresholds

| Scale | Nodes | Pods | Action |
|-------|-------|------|--------|
| Small | <300 | <10K | Standard tier |
| Medium | 300-1K | 10K-50K | Monitor |
| Large | 1K-5K | 50K-200K | Contact Azure |
| At Limit | 5K | 200K | No upgrade capacity |

### AKS Tier Compliance

Node capacity per private subnet is `2^(32 - prefix) - 5`: Azure reserves the first four addresses and the last in every subnet ([Microsoft: Azure CNI Overlay IP address planning](https://learn.microsoft.com/en-us/azure/aks/concepts-network-azure-cni-overlay#cluster-nodes)).

| Tier | Private | Pod CIDR | Node Cap | Node Pools |
|------|---------|----------|----------|------------|
| Micro | /25 | /20 | 123 | 1 |
| Standard | /24 | /16 | 251 | 1 |
| Professional | /23 | /18 | 507 | 1 |
| Enterprise | /21 | /16 | 2,043 | 1-2 |
| Hyperscale | /20 | /13 (`100.64.0.0/13` for a `10.x` VNet) | 4,091 | 5-10 |

### API Throttling (Token Bucket)

```
PUT ManagedCluster:    20 burst, 1/min sustained
PUT AgentPool:         20 burst, 1/min sustained
LIST ManagedClusters:  60 burst, 1/sec sustained
GET ManagedCluster:    60 burst, 1/sec sustained
Error: HTTP 429, Header: Retry-After
```

### AKS Notes

- Scale in batches of 500-700 nodes (2-5 min between)
- Cannot upgrade at 5,000 nodes (no surge capacity) -- scale down to <3,000 first
- Multi-node pools: AKS limit 1,000 nodes/pool, so 5 pools for 5K nodes
- Use Azure CNI Overlay for >1,000 nodes (200K pod limit vs 50K direct)

## Provider Comparison

| Aspect | EKS | GKE | AKS |
|--------|-----|-----|-----|
| Pod model | VPC CNI: ENI secondary IPs from the node subnets; overlay CNI: `pods.cidr` | Alias IP ranges | CNI Overlay |
| Config | Manual prefix delegation | Auto-managed | Overlay vs direct |
| Max pods/node | 250 (prefix) | 110 (Standard) | 250 (overlay) |
| Fragmentation risk | Yes | No | No |
| Max nodes | 100K (with support) | 5K (Autopilot) | 5K |

Our implementation supports all providers with single tier configuration, adjusted per provider (EKS: at least two subnets of each type and exactly two control-plane subnets; GKE and AKS: regional subnets). Pod CIDR `/13` (524,288 addresses) is sized to GKE's 200,000 pods-per-cluster limit. At a `/24` per node (AKS overlay always; GKE at 65-128 max pods) `/13` covers 2,048 nodes; 5,000 nodes needs GKE max pods per node <= 32 (`/26` per node), or a `/11` `podsCidr`, which is the only option on AKS.

| Provider | Control-plane subnets | Use |
|----------|-----------------------|-----|
| EKS | 2 x `/28` in two AZs (never 3), one contiguous `/27` | `aws_eks_cluster` `vpc_config.subnet_ids`: EKS requires two AZs, and AWS advises naming only two subnets to control where the control-plane network interfaces land |
| GKE | 1 x `/28` | `master_ipv4_cidr_block` or a private endpoint subnetwork |
| AKS | 1 x `/28` | API Server VNet Integration subnet |
| Kubernetes | 1 x `/28` | Self-hosted control-plane nodes; one subnet lets a floating API server address (keepalived, kube-vip) move between them |

Private network mode (`"networkMode": "private"`): no public subnets; internal load-balancer subnets in `subnets.loadBalancer` instead, and egress outside the layout.

| Provider | Load-balancer subnets | Egress (no subnet allocated) |
|----------|-----------------------|------------------------------|
| EKS | One per AZ (at least 2), tagged `kubernetes.io/role/internal-elb` | Transit gateway to a shared egress VPC, or no internet with VPC endpoints (a public NAT gateway needs a public subnet; a private NAT gateway cannot reach the internet) |
| GKE | 1 regional, the region's proxy-only subnet (`REGIONAL_MANAGED_PROXY`, one active per region and network, shared by clusters there; cross-region internal load balancers need a separate `GLOBAL_MANAGED_PROXY` subnet, not in the plan) | Cloud NAT on a Cloud Router |
| AKS | 1 regional, for internal load balancer frontends | `outbound_type` `managedNATGateway`, `userAssignedNATGateway`, or `userDefinedRouting` |
| Kubernetes | One per zone | Outside the plan |

## Implementation Files

| File | Purpose |
|------|---------|
| `shared/kubernetes-schema.ts` | Zod schemas and TypeScript types |
| `client/src/lib/kubernetes-network-generator.ts` | Generation logic |
| `server/routes.ts` | API endpoints |
| `tests/unit/kubernetes-network-generator.test.ts` | Unit tests |
| `tests/unit/network-separation.test.ts` | Separation invariants for every tier, provider, and network mode; one-network control plane; private mode; overrides, zones, warnings; provider address rules |
| `tests/integration/kubernetes-network-api.test.ts` | Plan generation called directly, no HTTP |

The [test inventory](../test-suite-analysis.md#test-inventory) says what each test file covers.

Key features: deterministic generation, random RFC 1918 CIDR, automatic normalization, Zod validation, provider-agnostic.
