# Kubernetes Network Reference

Detailed provider compliance formulas, IP calculation algorithms, and deployment tier specifications for the Kubernetes Network Planning API. See [API.md](API.md) for endpoint documentation.

## Deployment Tiers

| Tier | Nodes | Public Subnets | Private Subnets | Public Size | Private Size | Pod Space | Services |
|------|-------|---|---|---|---|---|---|
| **Micro** | 1 | 1 | 1 | /26 | /25 | /18 | /16 |
| **Standard** | 1-3 | 1 | 1 | /25 | /24 | /16 | /16 |
| **Professional** | 3-10 | 2 | 2 | /25 | /23 | /16 | /16 |
| **Enterprise** | 10-50 | 3 | 3 | /24 | /21 | /16 | /16 |
| **Hyperscale** | 50-5000 | 3 | 3 | /23 | /20 | /13 | /16 |

## GKE Compliance & IP Formulas

### Pod CIDR Formula

Each node receives a `/24` alias IP range:

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
N = 2^(32-S) - 4    (S = primary subnet prefix)

For 5,000 nodes: S = /20, N = 4,092 per subnet, 3 subnets = 12,276 capacity
```

### GKE Compliance Matrix

| Aspect | Requirement | Status |
|--------|------------|--------|
| VPC-native | Yes, secondary ranges | [PASS] |
| RFC 1918 | All tiers | [PASS] |
| Max cluster | 5,000 nodes | [PASS] |
| Pod limits | 200,000 max | [PASS] |
| Service range | /20 recommended | /16 provided |
| Multi-AZ | Multiple subnets | [PASS] |

Formulas assume 110 pods/node (Standard). Autopilot uses 32 default (over-provisions safely).

## EKS Compliance & IP Formulas

### Network Model

- Nodes get IPs from primary VPC subnet
- Pods get IPs via AWS VPC CNI (secondary ranges)
- IP prefix delegation (Nitro instances): `/28` blocks per pod batch
- Maximum pods per node: 250 (with prefix delegation)

### Pod CIDR Formula

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

| Tier | Private | Pod CIDR | Node Cap | Actual Nodes |
|------|---------|----------|----------|--------------|
| Micro | /25 | /18 | 124 | 1 |
| Standard | /24 | /16 | 252 | 1-3 |
| Professional | /23 | /16 | 508 | 3-10 |
| Enterprise | /21 | /16 | 2,044 | 10-50 |
| Hyperscale | /20 | /13 | 4,092 | 50-5000 |

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
- RFC 1918 required

### Pod CIDR Capacity (Overlay)

```
Pod_Addresses = 2^(32 - pod_prefix)
  /18 = 16,384 | /16 = 65,536 | /13 = 524,288
Actual limit: min(calculated, 200,000)
```

### AKS Scalability Thresholds

| Scale | Nodes | Pods | Action |
|-------|-------|------|--------|
| Small | <300 | <10K | Standard tier |
| Medium | 300-1K | 10K-50K | Monitor |
| Large | 1K-5K | 50K-200K | Contact Azure |
| At Limit | 5K | 200K | No upgrade capacity |

### AKS Tier Compliance

| Tier | Private | Pod CIDR | Node Cap | Node Pools |
|------|---------|----------|----------|------------|
| Micro | /25 | /18 | 124 | 1 |
| Standard | /24 | /16 | 252 | 1 |
| Professional | /23 | /16 | 508 | 1 |
| Enterprise | /21 | /16 | 2,044 | 1-2 |
| Hyperscale | /20 | /13 | 4,092 | 5-10 |

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
| Pod model | ENI + secondary IPs | Alias IP ranges | CNI Overlay |
| Config | Manual prefix delegation | Auto-managed | Overlay vs direct |
| Max pods/node | 250 (prefix) | 110 (Standard) | 250 (overlay) |
| Fragmentation risk | Yes | No | No |
| Max nodes | 100K (with support) | 5K (Autopilot) | 5K |

Our implementation supports all providers with single tier configuration. Pod CIDR `/13` supports EKS (5K nodes at 250 pods) and GKE (2K nodes at 110 pods).

## Implementation Files

| File | Purpose |
|------|---------|
| `shared/kubernetes-schema.ts` | Zod schemas and TypeScript types |
| `client/src/lib/kubernetes-network-generator.ts` | Generation logic |
| `server/routes.ts` | API endpoints |
| `tests/unit/kubernetes-network-generator.test.ts` | Unit tests (57 tests) |
| `tests/integration/kubernetes-network-api.test.ts` | Integration tests (33 tests) |

Key features: deterministic generation, random RFC 1918 CIDR, automatic normalization, Zod validation, provider-agnostic.
