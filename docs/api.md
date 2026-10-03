# Kubernetes Network Planning API

## Overview

Production-ready REST API for generating optimized network configurations for Kubernetes deployments across EKS (AWS), GKE (Google Cloud), AKS (Azure), and self-hosted environments.

**Base URL:** `http://localhost:5000/api`  
**Version:** `2.0` (reported as `metadata.version` in every plan)

### Quick Example

```bash
# Get available deployment tiers (add ?provider=eks for the EKS layout, &networkMode=private for private networking)
curl http://localhost:5000/api/k8s/tiers

# Generate a production-ready network plan for AWS EKS
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "vpcCidr": "10.100.0.0/18"
  }'
```

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Address Space Separation](#address-space-separation)
3. [Endpoints](#endpoints)
4. [Deployment Tiers](#deployment-tiers)
5. [Providers](#providers)
6. [Request/Response Schemas](#requestresponse-schemas)
7. [Error Handling](#error-handling)
8. [Usage Examples](#usage-examples)
9. [Provider-Specific Configuration](#provider-specific-configuration)
10. [Integration Guides](#integration-guides)

---

## Quick Start

### 1. Browse Available Tiers

```bash
curl http://localhost:5000/api/k8s/tiers
```

**Response:** List of all deployment tiers (micro → hyperscale) with subnet configurations. Layouts differ by provider (EKS needs two AZs), so pass `?provider=eks|gke|aks|kubernetes|k8s` to see the layout a plan for that provider will use. Add `networkMode=private` for the [private network mode](#private-network-mode) layout.

**Alternative paths:** You can also use `/api/v1/k8s/tiers` if your infrastructure requires versioned endpoints.

### 2. Generate Your First Network Plan

```bash
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "standard",
    "provider": "kubernetes"
  }'
```

**Alternative paths:** You can also use `/api/v1/k8s/plan` for versioned endpoints.

**What This Does:**
- Generates a complete network topology for a 1-3 node Kubernetes cluster
- Auto-allocates a random `/18` VPC inside one RFC 1918 block (10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16), clear of `172.17.0.0/16`, when `vpcCidr` is omitted
- Provides separate, non-overlapping ranges for nodes, the control plane, pods, and services (see [Address Space Separation](#address-space-separation))
- Ready to use with Terraform, Pulumi, or cloud CLI tools

### 3. Export to YAML (Infrastructure as Code)

```bash
curl -X POST "http://localhost:5000/api/k8s/plan?format=yaml" \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "enterprise",
    "provider": "gke",
    "vpcCidr": "10.100.0.0/16",
    "deploymentName": "prod-gke-cluster"
  }' > network-plan.yaml
```

**Use Cases:**
- Import into Terraform/Pulumi configurations
- Share network plans with team members
- Document infrastructure designs
- Automate cluster provisioning

---

## Address Space Separation

Every plan, for every tier and provider, separates four kinds of address space. No two ranges in a plan overlap.

| Space | Plan field | Placement |
|-------|------------|-----------|
| Nodes | `subnets.private` | Inside the VPC |
| Control plane | `subnets.controlPlane` (type `control-plane`, names `control-plane-N`) | Inside the VPC: one network per cluster, always `/28` subnets (see below) |
| Pods | `pods.cidr` | Outside the VPC, in an RFC 1918 block the VPC does not use (`10.0.0.0/8` preferred) |
| Services (ClusterIP) | `services.cidr` | Outside the VPC, in a third RFC 1918 block (`192.168.0.0/16` preferred); `/20`, or `/18` for hyperscale |

Load-balancer subnets are also inside the VPC: public subnets (`subnets.public`, for internet-facing load balancers and NAT) in the default `public` network mode, or internal load-balancer subnets (`subnets.loadBalancer`) in [private network mode](#private-network-mode). The VPC, pods, and services each sit in a different RFC 1918 block.

**Layout inside the VPC (first-fit):** each subnet takes the lowest offset, aligned to its own size, that is still free. Load-balancer subnets (public, or internal in private mode) are placed first, then node subnets, then the control-plane network, which usually fills the alignment gap between the two. The control plane is placed as one aligned block and then split, so the two EKS `/28`s always form one contiguous `/27`. In the [example response](#response-json) below, the EKS control-plane subnets `10.100.1.0/28` and `10.100.1.16/28` (together `10.100.1.0/27`) sit between the public `/25`s and the first node `/23`.

**Control plane by provider:** the control plane is one network in every tier.

| Provider | Control-plane subnets | Use |
|----------|-------|-----|
| EKS | Exactly 2 (never 3), in two AZs, forming one contiguous `/27` | `aws_eks_cluster` `vpc_config.subnet_ids`. EKS requires subnets in at least two different AZs, and AWS advises naming only two subnets to control where the control-plane network interfaces land |
| GKE | 1 | `private_cluster_config.master_ipv4_cidr_block`, or a private endpoint subnetwork |
| AKS | 1 | API Server VNet Integration subnet |
| Kubernetes | 1 | Self-hosted control-plane nodes. One subnet lets a floating API server address (keepalived, kube-vip) move between control-plane nodes |

**Reserved range:** `172.17.0.0/16` is Docker's default bridge network, and AWS also reserves it for some services (Cloud9, SageMaker). Generated pod and service ranges never overlap it, so hyperscale pods for a VPC in `10.0.0.0/8` are `172.24.0.0/13` rather than `172.16.0.0/13`. A `vpcCidr` that overlaps it is accepted, and the plan carries a non-fatal `warnings` array (omitted when there are no warnings). For `{"deploymentSize":"micro","vpcCidr":"172.17.0.0/24"}`:

```json
"warnings": [
  "VPC 172.17.0.0/24 overlaps 172.17.0.0/16 (Docker's default bridge network; AWS also reserves it for some services (Cloud9, SageMaker)). Prefer a VPC outside it."
]
```

**When to use the overrides:**

- `podsCidr` and `servicesCidr`: run several clusters in one network without collisions (GKE secondary ranges in one network must not collide), keep an existing cluster's service CIDR (it cannot change after cluster creation), or give hyperscale a `/11` pod range for 5,000 nodes at a `/24` per node. If you pass only one, the other is generated clear of it.
- `availabilityZones`: EKS AZ letters vary by region and account (`ap-northeast-1` offers `a`, `c`, and `d` to new accounts), so the generated `{region}{letter}` names are only a starting point. Pass the zones your account has, for example the names from `data.aws_availability_zones`. EKS and generic Kubernetes only.

Second GKE cluster in the same network:

```bash
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "gke",
    "region": "us-central1",
    "vpcCidr": "10.1.0.0/16",
    "podsCidr": "172.16.64.0/18",
    "servicesCidr": "192.168.16.0/20"
  }'
```

The plan uses `pods.cidr` `172.16.64.0/18` and `services.cidr` `192.168.16.0/20` as given, with nodes in `10.1.2.0/23` and `10.1.4.0/23` and the control-plane range `10.1.1.0/28`.

### Private network mode

Set `"networkMode": "private"` for a cluster with no internet-facing subnets. The plan then has no public subnets (`subnets.public` is `[]`), and `subnets.loadBalancer` holds internal load-balancer subnets (type `load-balancer`, names `load-balancer-N`) at the tier's public subnet size: `/26` (micro), `/25` (standard, professional), `/24` (enterprise), `/23` (hyperscale). Egress is outside the address layout, so no subnet is allocated for it. Node, control-plane, pod, and service ranges are the same as in public mode, and so is `minVpcPrefix`. In the default `public` mode, `subnets.loadBalancer` is present but empty.

| Provider | Load-balancer subnets | Egress (no subnet allocated) | Notes |
|----------|-----------------------|------------------------------|-------|
| GKE | Exactly 1, regional (no zone) | Cloud NAT, configured per region on a Cloud Router; it serves GKE nodes without external IPs | Meant as the region's proxy-only subnet (`purpose` `REGIONAL_MANAGED_PROXY`), which powers regional internal and external Application Load Balancers, regional proxy Network Load Balancers, and cross-region internal Application Load Balancers. Only one `REGIONAL_MANAGED_PROXY` subnet can be active per region per VPC network, so clusters in the same region and network share it, and it can't be used for anything else (no VMs). Minimum `/26`; Google recommends starting with `/23`. Internal passthrough Network Load Balancers take IPs from the node subnet unless you choose another subnet |
| AKS | Exactly 1, regional (no zone) | `outbound_type` `managedNATGateway`, `userAssignedNATGateway`, or `userDefinedRouting` | For internal load balancer frontends: by default they take node-subnet IPs, so annotate services with `service.beta.kubernetes.io/azure-load-balancer-internal-subnet` |
| EKS | One per AZ, at least 2 | A public NAT gateway must sit in a public subnet, and a private NAT gateway reaches only other VPCs or on-premises networks, not the internet. Reach the internet through a transit gateway to a shared egress VPC, or run without internet access using VPC endpoints | Tag them `kubernetes.io/role/internal-elb`: the AWS Load Balancer Controller uses that tag to find subnets for internal load balancers. ALBs need subnets in at least two AZs, and the controller skips subnets with fewer than 8 free IPs |
| Kubernetes | One per zone (the tier's public subnet count) | Outside the plan | Internal load balancers or ingress |

Private GKE cluster (the same request as the `gke_private` example in Swagger UI):

```bash
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "enterprise",
    "provider": "gke",
    "region": "us-central1",
    "vpcCidr": "10.20.0.0/16",
    "networkMode": "private"
  }'
```

Response:

```json
{
  "deploymentSize": "enterprise",
  "provider": "gke",
  "networkMode": "private",
  "region": "us-central1",
  "vpc": {
    "cidr": "10.20.0.0/16"
  },
  "subnets": {
    "public": [],
    "private": [
      {
        "cidr": "10.20.8.0/21",
        "name": "private-1",
        "type": "private"
      },
      {
        "cidr": "10.20.16.0/21",
        "name": "private-2",
        "type": "private"
      },
      {
        "cidr": "10.20.24.0/21",
        "name": "private-3",
        "type": "private"
      }
    ],
    "loadBalancer": [
      {
        "cidr": "10.20.0.0/24",
        "name": "load-balancer-1",
        "type": "load-balancer"
      }
    ],
    "controlPlane": [
      {
        "cidr": "10.20.1.0/28",
        "name": "control-plane-1",
        "type": "control-plane"
      }
    ]
  },
  "pods": {
    "cidr": "172.16.0.0/16"
  },
  "services": {
    "cidr": "192.168.0.0/20"
  },
  "metadata": {
    "generatedAt": "2026-10-02T12:00:00.000Z",
    "version": "2.0"
  }
}
```

`load-balancer-1` (`10.20.0.0/24`) is the proxy-only subnet, placed first; the control-plane range `10.20.1.0/28` fills the gap before the first node `/21`. See the [GKE Terraform](#gke-google-cloud-configuration) for the proxy-only subnet and Cloud NAT. For EKS, `{"deploymentSize":"professional","provider":"eks","region":"us-east-1","vpcCidr":"10.30.0.0/16","networkMode":"private"}` (the `eks_private` example) gives internal load-balancer subnets `10.30.0.0/25` (`us-east-1a`) and `10.30.0.128/25` (`us-east-1b`), and control-plane subnets `10.30.1.0/28` (`us-east-1a`) and `10.30.1.16/28` (`us-east-1b`).

---

## Endpoints

### POST `/api/k8s/plan`

Generate a complete Kubernetes network plan with optimized subnet allocation.

**URL:** `POST /api/k8s/plan`  
**Content-Type:** `application/json`  
**Output Formats:** JSON (default), YAML (`?format=yaml`)

#### Request Body

```json
{
  "deploymentSize": "professional",
  "provider": "eks",
  "vpcCidr": "10.100.0.0/18",
  "deploymentName": "prod-us-east-1"
}
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `deploymentSize` | string | **Yes** | N/A | Tier: `micro`, `standard`, `professional`, `enterprise`, `hyperscale` (case-sensitive) |
| `provider` | string | No | `"kubernetes"` | Platform: `eks` (AWS), `gke` (Google), `aks` (Azure), `kubernetes` or `k8s` (generic) |
| `region` | string | No | Provider default: `us-east-1` (eks), `us-central1` (gke), `eastus` (aks), `region-1` (kubernetes) | Echoed in the response and used to name EKS availability zones (`{region}{letter}`). Lowercase letters, digits, and hyphens only (e.g., `us-west-2`, `europe-west1`, `westeurope`); max 64 characters |
| `vpcCidr` | string | No | Random `/18` aligned inside an RFC 1918 block, clear of `172.17.0.0/16` | VPC CIDR. The whole range must fall inside one RFC 1918 block (`10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`), so `10.0.0.0/7`, `172.16.0.0/11`, and `192.168.0.0/15` are rejected. Host bits are cleared (`10.1.2.3/16` becomes `10.1.0.0/16`). Must be at least the tier's `minVpcPrefix` for the provider. A VPC overlapping `172.17.0.0/16` is accepted with a `warnings` entry. Max 18 characters after trimming whitespace |
| `podsCidr` | string | No | Generated outside the VPC | Pod range. RFC 1918 or `100.64.0.0/10`, `/8` to `/24`. Must not overlap the VPC, `servicesCidr`, or `172.17.0.0/16`; host bits are cleared. Use it to keep several clusters in one network from overlapping, or for a `/11` hyperscale pod range. Max 18 characters |
| `servicesCidr` | string | No | Generated outside the VPC | Service (ClusterIP) range. RFC 1918 only, `/13` to `/24` (the intersection of EKS's `/12` to `/24` and AKS's "smaller than `/12`"). Must not overlap the VPC, `podsCidr`, or `172.17.0.0/16`; host bits are cleared. Pass an existing cluster's range to keep it, since it cannot change after creation. Max 18 characters |
| `availabilityZones` | string[] | No | EKS: `{region}a`, `{region}b`, ...; generic: `zone-1`, `zone-2`, `zone-3` | 1 to 6 unique zone names (pattern `^[a-z0-9]+(-[a-z0-9]+)*$`, max 64 characters each), assigned to each subnet type round-robin. EKS and generic Kubernetes only: EKS requires at least 2, and GKE and AKS reject the field because their subnets are regional |
| `networkMode` | string | No | `"public"` | `public`: public subnets for internet-facing load balancers and NAT, and an empty `subnets.loadBalancer`. `private`: no public subnets; internal load-balancer subnets in `subnets.loadBalancer` instead, with egress outside the layout (see [Private network mode](#private-network-mode)). Any other value returns `INVALID_REQUEST` |
| `deploymentName` | string | No | Omitted | Optional cluster identifier, echoed in the response; max 128 characters |

#### Response (JSON)

```json
{
  "deploymentSize": "professional",
  "provider": "eks",
  "networkMode": "public",
  "region": "us-east-1",
  "deploymentName": "prod-us-east-1",
  "vpc": {
    "cidr": "10.100.0.0/18"
  },
  "subnets": {
    "public": [
      {
        "cidr": "10.100.0.0/25",
        "name": "public-1",
        "type": "public",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.0.128/25",
        "name": "public-2",
        "type": "public",
        "availabilityZone": "us-east-1b"
      }
    ],
    "private": [
      {
        "cidr": "10.100.2.0/23",
        "name": "private-1",
        "type": "private",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.4.0/23",
        "name": "private-2",
        "type": "private",
        "availabilityZone": "us-east-1b"
      }
    ],
    "loadBalancer": [],
    "controlPlane": [
      {
        "cidr": "10.100.1.0/28",
        "name": "control-plane-1",
        "type": "control-plane",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.1.16/28",
        "name": "control-plane-2",
        "type": "control-plane",
        "availabilityZone": "us-east-1b"
      }
    ]
  },
  "pods": {
    "cidr": "172.16.0.0/18"
  },
  "services": {
    "cidr": "192.168.0.0/20"
  },
  "metadata": {
    "generatedAt": "2026-10-02T12:00:00.000Z",
    "version": "2.0"
  }
}
```

#### What You Get

- **Network Mode:** `networkMode` (after `provider`) echoes the requested mode, `public` by default
- **VPC CIDR:** Your primary network range (normalized to its network address)
- **Public Subnets:** For load balancers, NAT gateways, bastion hosts. Placed first, at the start of the VPC. Empty in private mode.
- **Private Subnets:** For worker nodes. Each takes the lowest free offset aligned to its own size, so every emitted CIDR is a canonical network address (no host bits).
- **Load-Balancer Subnets:** `subnets.loadBalancer`, internal load-balancer subnets in private mode, placed first in place of the public subnets; always present, and empty in public mode. See [Private network mode](#private-network-mode).
- **Control-Plane Subnets:** the control-plane network inside the VPC: one `/28`, or for EKS one `/27` split into two `/28`s in two AZs. Placed last in the lowest free aligned slot (usually the gap between the load-balancer and node subnets). See [Address Space Separation](#address-space-separation) for how each provider uses them.
- **Pod CIDR:** IP space for container networking (overlay CNI pool, GKE pod secondary range, AKS overlay `pod_cidr`), outside the VPC
- **Service CIDR:** ClusterIP range for Kubernetes services, outside the VPC
- **Multi-AZ Support:** EKS subnets carry `{region}{letter}` zones, with every subnet type in at least two AZs (the control plane in exactly two); generic Kubernetes subnets carry `zone-N`; GKE and AKS subnets are regional and carry no zone
- **Warnings:** a `warnings` array appears only when the request has a non-fatal issue (a VPC overlapping `172.17.0.0/16`)

**Pod and Service Placement:** pods and services each go in an RFC 1918 block the VPC does not use, so the VPC, pod, and service ranges never overlap:

| VPC inside | Pod CIDR | Service CIDR |
|------------|----------|--------------|
| `10.0.0.0/8` | `172.16.0.0/<podsPrefix>` (hyperscale: `172.24.0.0/13`) | `192.168.0.0/<servicesPrefix>` |
| `172.16.0.0/12` | `10.0.0.0/<podsPrefix>` | `192.168.0.0/<servicesPrefix>` |
| `192.168.0.0/16` | `10.0.0.0/<podsPrefix>` | `172.16.0.0/<servicesPrefix>` |

`podsPrefix` and `servicesPrefix` come from the deployment tier (see [Deployment Tiers](#deployment-tiers)). Hyperscale pods for a VPC in `10.0.0.0/8` skip to `172.24.0.0/13` because `172.16.0.0/13` contains the reserved `172.17.0.0/16`. A `podsCidr` or `servicesCidr` override replaces the generated range.

---

### GET `/api/k8s/tiers`

Get every deployment tier's layout as the generator applies it for one provider and network mode.

**URL:** `GET /api/k8s/tiers`  
**Output Formats:** JSON (default), YAML (`?format=yaml`)

#### Query Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `provider` | No | `kubernetes` | `eks`, `gke`, `aks`, `kubernetes`, or `k8s`. Any other value returns 400 `INVALID_REQUEST`, e.g. `Invalid request: provider: Invalid enum value. Expected 'eks' \| 'gke' \| 'aks' \| 'kubernetes' \| 'k8s', received 'foo'` |
| `networkMode` | No | `public` | `public` or `private` (see [Private network mode](#private-network-mode)). Any other value returns 400 `INVALID_REQUEST`, e.g. `Invalid request: networkMode: Invalid enum value. Expected 'public' \| 'private', received 'foo'` |
| `format` | No | `json` | `json` or `yaml` |

#### Response (default, generic Kubernetes)

```json
{
  "micro": {
    "networkMode": "public",
    "publicSubnets": 1,
    "loadBalancerSubnets": 0,
    "privateSubnets": 1,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 26,
    "loadBalancerSubnetSize": 26,
    "privateSubnetSize": 25,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 20,
    "servicesPrefix": 20,
    "minVpcPrefix": 24,
    "description": "Single Node: 1 node, minimal subnet allocation (proof of concept)"
  },
  "standard": {
    "networkMode": "public",
    "publicSubnets": 1,
    "loadBalancerSubnets": 0,
    "privateSubnets": 1,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 25,
    "loadBalancerSubnetSize": 25,
    "privateSubnetSize": 24,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 16,
    "servicesPrefix": 20,
    "minVpcPrefix": 23,
    "description": "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  "professional": {
    "networkMode": "public",
    "publicSubnets": 2,
    "loadBalancerSubnets": 0,
    "privateSubnets": 2,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 25,
    "loadBalancerSubnetSize": 25,
    "privateSubnetSize": 23,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 18,
    "servicesPrefix": 20,
    "minVpcPrefix": 21,
    "description": "Small Production: 3-10 nodes, dual AZ ready"
  },
  "enterprise": {
    "networkMode": "public",
    "publicSubnets": 3,
    "loadBalancerSubnets": 0,
    "privateSubnets": 3,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 24,
    "loadBalancerSubnetSize": 24,
    "privateSubnetSize": 21,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 16,
    "servicesPrefix": 20,
    "minVpcPrefix": 19,
    "description": "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  "hyperscale": {
    "networkMode": "public",
    "publicSubnets": 3,
    "loadBalancerSubnets": 0,
    "privateSubnets": 3,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 23,
    "loadBalancerSubnetSize": 23,
    "privateSubnetSize": 20,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 13,
    "servicesPrefix": 18,
    "minVpcPrefix": 18,
    "description": "Global Scale: 50-5,000 nodes across 3 AZs. The /13 pod range holds 2,048 nodes at a /24 per node (AKS overlay; GKE at 65-128 max pods per node). 5,000 nodes needs GKE max pods per node of 32 or fewer, or a /11 podsCidr"
  }
}
```

**Provider differences** (all other fields match the response above):

| `?provider=` | Differences |
|--------------|-------------|
| `eks` | Node and public subnets (load-balancer subnets in private mode) have at least 2 (two AZs): micro and standard return `publicSubnets` and `privateSubnets` of 2, with `minVpcPrefix` 23 (micro) and 22 (standard). `controlPlaneSubnets` is 2 in every tier (one `/27` split across two AZs) |
| `gke`, `aks` | None in public mode: `controlPlaneSubnets` is 1 in every tier (one regional control-plane range) |
| `kubernetes`, `k8s` | As above: one control-plane subnet in every tier |

**Network mode differences** (`?networkMode=private`): `publicSubnets` is 0 and `loadBalancerSubnets` takes its place: 1 in every tier for `gke` and `aks`; for `eks` and generic Kubernetes the public count (`eks`: 2, 2, 2, 3, 3; generic: 1, 1, 2, 3, 3, micro to hyperscale). `loadBalancerSubnetSize` always equals `publicSubnetSize`, and `minVpcPrefix`, node, and control-plane fields match public mode for every provider. Enterprise from `GET /api/k8s/tiers?provider=gke&networkMode=private`:

```json
{
  "enterprise": {
    "networkMode": "private",
    "publicSubnets": 0,
    "loadBalancerSubnets": 1,
    "privateSubnets": 3,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 24,
    "loadBalancerSubnetSize": 24,
    "privateSubnetSize": 21,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 16,
    "servicesPrefix": 20,
    "minVpcPrefix": 19,
    "description": "Large Production: 10-50 nodes, triple AZ ready with HA"
  }
}
```

---

### POST `/api/kubernetes/network-plan`

**Purpose:** Descriptive alias of `POST /api/k8s/plan` (also served at `/api/v1/kubernetes/network-plan` and `/api/v1/k8s/plan`). Request body, response, and errors are identical.

**Method:** `POST`  
**Content-Type:** `application/json`

#### Response Body

```typescript
{
  deploymentSize: string,           // Tier used for generation
  provider: string,                 // Normalized provider ("k8s" becomes "kubernetes")
  networkMode: "public" | "private", // Requested network mode ("public" by default)
  region: string,                   // Requested region or the provider default
  deploymentName?: string,          // Present only when sent in the request
  vpc: { cidr: string },
  subnets: {                        // All inside the VPC
    public: SubnetConfig[],         // Internet-facing load balancers, NAT; empty in private mode
    private: SubnetConfig[],        // Worker nodes
    loadBalancer: SubnetConfig[],   // Internal load balancers, private mode only; empty in public mode
    controlPlane: SubnetConfig[]    // The control-plane network: one /28 (EKS: two /28s forming one /27)
  },
  pods: { cidr: string },           // Outside the VPC
  services: { cidr: string },       // Outside the VPC and the pod range
  warnings?: string[],              // Present only when there are non-fatal issues
  metadata: {
    generatedAt: string,            // ISO 8601 timestamp
    version: string                 // Plan format and allocation rules version ("2.0")
  }
}
```

#### SubnetConfig Structure

```typescript
{
  cidr: string,                     // e.g., "10.0.0.0/24"
  name: string,                     // "public-N", "private-N", "load-balancer-N", or "control-plane-N"
  type: "public" | "private" | "load-balancer" | "control-plane",
  availabilityZone?: string         // EKS: "us-east-1a" or your availabilityZones; generic: "zone-1";
                                    // omitted for GKE and AKS (regional subnets)
}
```

#### Example Request

```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "vpcCidr": "10.100.0.0/18",
    "deploymentName": "prod-cluster-us-east-1"
  }'
```

#### Example Response

```json
{
  "deploymentSize": "professional",
  "provider": "eks",
  "networkMode": "public",
  "region": "us-east-1",
  "deploymentName": "prod-cluster-us-east-1",
  "vpc": {
    "cidr": "10.100.0.0/18"
  },
  "subnets": {
    "public": [
      {
        "cidr": "10.100.0.0/25",
        "name": "public-1",
        "type": "public",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.0.128/25",
        "name": "public-2",
        "type": "public",
        "availabilityZone": "us-east-1b"
      }
    ],
    "private": [
      {
        "cidr": "10.100.2.0/23",
        "name": "private-1",
        "type": "private",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.4.0/23",
        "name": "private-2",
        "type": "private",
        "availabilityZone": "us-east-1b"
      }
    ],
    "loadBalancer": [],
    "controlPlane": [
      {
        "cidr": "10.100.1.0/28",
        "name": "control-plane-1",
        "type": "control-plane",
        "availabilityZone": "us-east-1a"
      },
      {
        "cidr": "10.100.1.16/28",
        "name": "control-plane-2",
        "type": "control-plane",
        "availabilityZone": "us-east-1b"
      }
    ]
  },
  "pods": {
    "cidr": "172.16.0.0/18"
  },
  "services": {
    "cidr": "192.168.0.0/20"
  },
  "metadata": {
    "generatedAt": "2026-10-02T12:00:00.000Z",
    "version": "2.0"
  }
}
```

**HTTP Status Codes:**
- `200 OK` - Successfully generated network plan
- `400 Bad Request` - Invalid parameters, invalid or public VPC CIDR, or malformed JSON
- `413 Payload Too Large` - Request body larger than 16 KB
- `429 Too Many Requests` - Rate limit exceeded (see [Rate Limiting](#rate-limiting))
- `500 Internal Server Error` - Server error during generation

---

### GET `/api/kubernetes/tiers`

**Purpose:** Descriptive alias of `GET /api/k8s/tiers` (also served at `/api/v1/kubernetes/tiers` and `/api/v1/k8s/tiers`). Accepts the same `?provider=`, `?networkMode=`, and `?format=` query parameters.

**Method:** `GET`  
**Content-Type:** `application/json`

#### Response Body

```typescript
{
  micro: DeploymentTierConfig,
  standard: DeploymentTierConfig,
  professional: DeploymentTierConfig,
  enterprise: DeploymentTierConfig,
  hyperscale: DeploymentTierConfig
}
```

#### TierConfig Structure

```typescript
{
  networkMode: "public" | "private", // The ?networkMode= requested ("public" by default)
  publicSubnets: number,            // Count of public subnets (1-3; at least 2 for EKS; 0 in private mode)
  loadBalancerSubnets: number,      // Count of internal load-balancer subnets (0 in public mode; private:
                                    // 1 for GKE and AKS, otherwise the public count)
  privateSubnets: number,           // Count of private (node) subnets (1-3; at least 2 for EKS)
  controlPlaneSubnets: number,      // EKS: 2 (one /27 across two AZs); GKE, AKS, and generic: 1
  publicSubnetSize: number,         // Public subnet CIDR prefix (e.g., 23 for /23)
  loadBalancerSubnetSize: number,   // Internal load-balancer subnet prefix (same as publicSubnetSize)
  privateSubnetSize: number,        // Private subnet CIDR prefix (e.g., 20 for /20)
  controlPlaneSubnetSize: number,   // Always 28
  podsPrefix: number,               // Pod CIDR prefix (e.g., 16 for /16)
  servicesPrefix: number,           // Service CIDR prefix (20; 18 for hyperscale)
  minVpcPrefix: number,             // Smallest VPC that fits every subnet, computed from the
                                    // actual layout for this provider (e.g., 19 for /19)
  description: string               // Tier description
}
```

#### Example Request

```bash
curl http://localhost:5000/api/kubernetes/tiers
```

#### Example Response

```json
{
  "micro": {
    "networkMode": "public",
    "publicSubnets": 1,
    "loadBalancerSubnets": 0,
    "privateSubnets": 1,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 26,
    "loadBalancerSubnetSize": 26,
    "privateSubnetSize": 25,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 20,
    "servicesPrefix": 20,
    "minVpcPrefix": 24,
    "description": "Single Node: 1 node, minimal subnet allocation (proof of concept)"
  },
  "standard": {
    "networkMode": "public",
    "publicSubnets": 1,
    "loadBalancerSubnets": 0,
    "privateSubnets": 1,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 25,
    "loadBalancerSubnetSize": 25,
    "privateSubnetSize": 24,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 16,
    "servicesPrefix": 20,
    "minVpcPrefix": 23,
    "description": "Development/Testing: 1-3 nodes, minimal subnet allocation"
  },
  "professional": {
    "networkMode": "public",
    "publicSubnets": 2,
    "loadBalancerSubnets": 0,
    "privateSubnets": 2,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 25,
    "loadBalancerSubnetSize": 25,
    "privateSubnetSize": 23,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 18,
    "servicesPrefix": 20,
    "minVpcPrefix": 21,
    "description": "Small Production: 3-10 nodes, dual AZ ready"
  },
  "enterprise": {
    "networkMode": "public",
    "publicSubnets": 3,
    "loadBalancerSubnets": 0,
    "privateSubnets": 3,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 24,
    "loadBalancerSubnetSize": 24,
    "privateSubnetSize": 21,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 16,
    "servicesPrefix": 20,
    "minVpcPrefix": 19,
    "description": "Large Production: 10-50 nodes, triple AZ ready with HA"
  },
  "hyperscale": {
    "networkMode": "public",
    "publicSubnets": 3,
    "loadBalancerSubnets": 0,
    "privateSubnets": 3,
    "controlPlaneSubnets": 1,
    "publicSubnetSize": 23,
    "loadBalancerSubnetSize": 23,
    "privateSubnetSize": 20,
    "controlPlaneSubnetSize": 28,
    "podsPrefix": 13,
    "servicesPrefix": 18,
    "minVpcPrefix": 18,
    "description": "Global Scale: 50-5,000 nodes across 3 AZs. The /13 pod range holds 2,048 nodes at a /24 per node (AKS overlay; GKE at 65-128 max pods per node). 5,000 nodes needs GKE max pods per node of 32 or fewer, or a /11 podsCidr"
  }
}
```

**HTTP Status Codes:**
- `200 OK` - Successfully retrieved tier information
- `400 Bad Request` - Unknown `provider` or `networkMode` query value (`INVALID_REQUEST`)
- `429 Too Many Requests` - Rate limit exceeded (see [Rate Limiting](#rate-limiting))
- `500 Internal Server Error` - Server error during retrieval

---

## Deployment Tiers

All deployment tiers have been validated against real-world Kubernetes platform limits and are production-ready.

### Tier Summary

| Tier | Nodes | AZs | Public Subnet | Private Subnet | Pod CIDR | Services | Min VPC | Min VPC (EKS) | Use Case |
|------|-------|-----|---------------|----------------|----------|----------|---------|---------------|----------|
| **Micro** | 1 | 1 (EKS: 2) | /26 (64 IPs) | /25 (128 IPs) | /20 | /20 | /24 | /23 | POC, Development |
| **Standard** | 1-3 | 1 (EKS: 2) | /25 (128 IPs) | /24 (256 IPs) | /16 | /20 | /23 | /22 | Dev/Testing |
| **Professional** | 3-10 | 2 | /25 (128 IPs) | /23 (512 IPs) | /18 | /20 | /21 | /21 | Small Production |
| **Enterprise** | 10-50 | 3 | /24 (256 IPs) | /21 (2,048 IPs) | /16 | /20 | /19 | /19 | Large Production |
| **Hyperscale** | 50-5,000 | 3 | /23 (512 IPs) | /20 (4,096 IPs) | /13 | /18 | /18 | /18 | Global Scale |

Every tier also gets a control-plane network inside the VPC: one `/28` for generic Kubernetes, GKE, and AKS, and for EKS one `/27` split into two `/28`s in two AZs. "Min VPC" is `minVpcPrefix` from `GET /api/k8s/tiers` for generic Kubernetes, GKE, and AKS; "Min VPC (EKS)" is the same field with `?provider=eks`. Both are computed from the actual subnet layout, and both are the same in private network mode, where the "Public Subnet" size applies to the internal load-balancer subnets instead.

### Tier Validation Status

[PASS] **All configurations tested and validated** against:
- EKS maximum node limits (5,000 standard, 100,000+ with AWS support)
- GKE maximum node limits (5,000 Autopilot, 200,000 pod limit)
- AKS maximum node limits (5,000 nodes, 200,000 pods with CNI Overlay)
- Real-world pod density requirements
- Multi-AZ availability requirements
- Network performance best practices

| Tier | Nodes | AZs | Public Subnet | Private Subnet | Pods | Min VPC (EKS) | Use Case |
|------|-------|-----|---------------|----------------|------|---------------|----------|
| **Micro** | 1 | 1 (EKS: 2) | /26 (64 IPs) | /25 (128 IPs) | /20 | /24 (/23) | POC, Development |
| **Standard** | 1-3 | 1 (EKS: 2) | /25 (128 IPs) | /24 (256 IPs) | /16 | /23 (/22) | Development, Testing |
| **Professional** | 3-10 | 2 | /25 (128 IPs) | /23 (512 IPs) | /18 | /21 (/21) | Small Production (HA) |
| **Enterprise** | 10-50 | 3 | /24 (256 IPs) | /21 (2,048 IPs) | /16 | /19 (/19) | Large Production (Multi-AZ) |
| **Hyperscale** | 50-5,000 | 3 | /23 (512 IPs) | /20 (4,096 IPs) | /13 | /18 (/18) | Global Scale (3-AZ HA) |

### Tier Selection Guide

- **Micro**: Single-node clusters for testing and proof-of-concept (fits in a /24 VPC; EKS needs a /23 for two AZs)
- **Standard**: Development and testing environments with minimal infrastructure (fits in a /23 VPC; EKS needs a /22)
- **Professional**: Small production deployments requiring high availability (2 AZs, fits in a /21 VPC)
- **Enterprise**: Large production deployments with guaranteed multi-AZ deployment (3 AZs, fits in a /19 VPC)
- **Hyperscale**: Global-scale deployments supporting up to 5,000 nodes with realistic subnet sizing (3 AZs, fits in a /18 VPC). Its `/13` pod CIDR (524,288 IPs) is sized to GKE's 200,000 pods-per-cluster limit and holds 2,048 nodes at a `/24` per node. AKS CNI Overlay gives every node a fixed `/24` whatever its max pods, so on AKS the only way to 5,000 nodes is a larger pod range: pass a `/11` `podsCidr`. GKE sizes each node's range from its max pods per node (65-128 pods: `/24`; 17-32 pods: `/26`), so on GKE 5,000 nodes fit the `/13` at 32 or fewer max pods per node, or use a `/11` `podsCidr`.

### Design Rationale

**Why differentiated subnet sizes?**
- **Public subnets** only need IPs for: NAT Gateways (1/AZ), Load Balancers, Bastion hosts
- **Private subnets** need IPs for: Worker Nodes AND their Pod secondary IPs (EKS VPC CNI model)
- Real-world deployments use smaller public subnets (/23-/26) and larger private subnets (/20-/24)

---

## Providers

### Supported Kubernetes Platforms

| Provider | Status | Node Limit | Pod Limit | Use Case |
|----------|--------|-----------|----------|----------|
| **EKS** |  Supported | 5,000 (standard), 100,000+ (with support) | 250/node (prefix delegation) | AWS cloud |
| **GKE** |  Supported | 5,000 (Autopilot) | 200,000 cluster limit | Google Cloud |
| **AKS** |  Supported | 5,000 | 200,000 (CNI Overlay) | Azure cloud |
| **Kubernetes** |  Supported | Unlimited | Unlimited | Self-hosted, on-premises, alternative clouds |

---

## Region and Availability Zone Standards

### Overview

Each cloud provider uses different naming conventions for regions and availability zones. Our API applies the right model for the selected provider: EKS and generic Kubernetes subnets carry a zone, while GKE and AKS subnets are regional and carry none (their node pools choose zones).

### AWS (EKS)

**Region Format:** `{continent}-{direction}-{number}`
- Regions use hyphens to separate all components
- Examples: `us-east-1`, `us-west-2`, `eu-west-1`, `ap-southeast-1`

**Availability Zone Format:** `{region}{letter}`
- AZs append a letter directly to the region (no hyphen)
- Examples: `us-east-1a`, `us-east-1b`, `us-west-2c`, `eu-west-1a`
- EKS cluster subnets must be in at least two AZs, so every EKS plan puts every subnet type (public or internal load-balancer, private, control plane) in at least two AZs, in every tier. The control plane is always exactly two `/28`s in two AZs
- Which letters exist varies by region and account (`ap-northeast-1` offers `a`, `c`, and `d` to new accounts), so the generated `a`, `b`, `c` names are a starting point. Pass `availabilityZones` (for example the names from `data.aws_availability_zones`) to get exact names, assigned round-robin:

```bash
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "region": "ap-northeast-1",
    "vpcCidr": "10.10.0.0/16",
    "availabilityZones": ["ap-northeast-1a", "ap-northeast-1c"]
  }'
# public-1, private-1, control-plane-1 -> ap-northeast-1a
# public-2, private-2, control-plane-2 -> ap-northeast-1c
```

**Common AWS Regions:**

| Region Code | Location | AZ Count |
|-------------|----------|----------|
| `us-east-1` | N. Virginia | 6 |
| `us-east-2` | Ohio | 3 |
| `us-west-1` | N. California | 2 |
| `us-west-2` | Oregon | 4 |
| `eu-west-1` | Ireland | 3 |
| `eu-central-1` | Frankfurt | 3 |
| `ap-southeast-1` | Singapore | 3 |
| `ap-northeast-1` | Tokyo | 3 |

**Default Region:** `us-east-1` (if not specified)

### GCP (GKE)

**Region Format:** `{continent}-{direction}{number}` (NO hyphen before number)
- Key difference from AWS: no hyphen between direction and number
- Examples: `us-central1`, `us-east1`, `europe-west1`, `asia-east1`

**Zone Format:** `{region}-{letter}`
- Zones add a hyphen and letter after the region
- Examples: `us-central1-a`, `us-central1-b`, `europe-west1-c`
- GCP subnets are regional, so GKE plans carry no `availabilityZone`; choose zones on the cluster or node pool (for example `node_locations`). `availabilityZones` is rejected for GKE

**Common GCP Regions:**

| Region Code | Location | Zone Count |
|-------------|----------|------------|
| `us-central1` | Iowa | 4 |
| `us-east1` | South Carolina | 4 |
| `us-west1` | Oregon | 3 |
| `europe-west1` | Belgium | 3 |
| `europe-west4` | Netherlands | 3 |
| `asia-east1` | Taiwan | 3 |
| `asia-southeast1` | Singapore | 3 |
| `australia-southeast1` | Sydney | 3 |

**Default Region:** `us-central1` (if not specified)

### Azure (AKS)

**Region Format:** Lowercase concatenated (NO separators)
- Azure uses simple concatenated names without hyphens
- Examples: `eastus`, `westus2`, `northeurope`, `southeastasia`

**Availability Zones:** numeric (`1`, `2`, `3`)
- Azure uses numeric zone identifiers, set per node pool (`zones = ["1", "2", "3"]`)
- Azure subnets are regional, so AKS plans carry no `availabilityZone`, and `availabilityZones` is rejected for AKS
- Note: Zone numbers are logical (mapped per subscription)

**Common Azure Regions:**

| Region Code | Location | AZ Support |
|-------------|----------|------------|
| `eastus` | Virginia | Yes (1,2,3) |
| `eastus2` | Virginia | Yes (1,2,3) |
| `westus2` | Washington | Yes (1,2,3) |
| `westus3` | Arizona | Yes (1,2,3) |
| `centralus` | Iowa | Yes (1,2,3) |
| `northeurope` | Ireland | Yes (1,2,3) |
| `westeurope` | Netherlands | Yes (1,2,3) |
| `southeastasia` | Singapore | Yes (1,2,3) |
| `australiaeast` | Sydney | Yes (1,2,3) |

**Default Region:** `eastus` (if not specified)

### Generic Kubernetes

**Region Format:** User-defined or generic
- Default: `region-1`, `datacenter-1`

**Zone Format:** `zone-{number}`
- Default: `zone-1`, `zone-2`, `zone-3`

**Default Region:** `region-1` (if not specified)

### API Usage

**Specifying a Region:**

```bash
# AWS EKS with specific region
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "enterprise",
    "provider": "eks",
    "region": "us-west-2",
    "vpcCidr": "10.0.0.0/16"
  }'

# GCP GKE with specific region
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "enterprise",
    "provider": "gke",
    "region": "europe-west1",
    "vpcCidr": "10.0.0.0/16"
  }'

# Azure AKS with specific region
curl -X POST http://localhost:5000/api/k8s/plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "enterprise",
    "provider": "aks",
    "region": "westeurope",
    "vpcCidr": "10.0.0.0/16"
  }'
```

**Example Response (EKS us-west-2):**

```json
{
  "deploymentSize": "enterprise",
  "provider": "eks",
  "networkMode": "public",
  "region": "us-west-2",
  "subnets": {
    "public": [
      { "cidr": "10.0.0.0/24", "name": "public-1", "type": "public", "availabilityZone": "us-west-2a" },
      { "cidr": "10.0.1.0/24", "name": "public-2", "type": "public", "availabilityZone": "us-west-2b" },
      { "cidr": "10.0.2.0/24", "name": "public-3", "type": "public", "availabilityZone": "us-west-2c" }
    ],
    "private": [
      { "cidr": "10.0.8.0/21", "name": "private-1", "type": "private", "availabilityZone": "us-west-2a" },
      { "cidr": "10.0.16.0/21", "name": "private-2", "type": "private", "availabilityZone": "us-west-2b" },
      { "cidr": "10.0.24.0/21", "name": "private-3", "type": "private", "availabilityZone": "us-west-2c" }
    ],
    "loadBalancer": [],
    "controlPlane": [
      { "cidr": "10.0.3.0/28", "name": "control-plane-1", "type": "control-plane", "availabilityZone": "us-west-2a" },
      { "cidr": "10.0.3.16/28", "name": "control-plane-2", "type": "control-plane", "availabilityZone": "us-west-2b" }
    ]
  }
}
```

**Example Response (GKE europe-west1):** subnets are regional, so there is no `availabilityZone` and one control-plane range.

```json
{
  "deploymentSize": "enterprise",
  "provider": "gke",
  "networkMode": "public",
  "region": "europe-west1",
  "subnets": {
    "public": [
      { "cidr": "10.0.0.0/24", "name": "public-1", "type": "public" },
      { "cidr": "10.0.1.0/24", "name": "public-2", "type": "public" },
      { "cidr": "10.0.2.0/24", "name": "public-3", "type": "public" }
    ],
    "private": [
      { "cidr": "10.0.8.0/21", "name": "private-1", "type": "private" },
      { "cidr": "10.0.16.0/21", "name": "private-2", "type": "private" },
      { "cidr": "10.0.24.0/21", "name": "private-3", "type": "private" }
    ],
    "loadBalancer": [],
    "controlPlane": [
      { "cidr": "10.0.3.0/28", "name": "control-plane-1", "type": "control-plane" }
    ]
  }
}
```

**Example Response (AKS westeurope):** the same layout as GKE: regional subnets and one API server subnet.

```json
{
  "deploymentSize": "enterprise",
  "provider": "aks",
  "networkMode": "public",
  "region": "westeurope",
  "subnets": {
    "public": [
      { "cidr": "10.0.0.0/24", "name": "public-1", "type": "public" },
      { "cidr": "10.0.1.0/24", "name": "public-2", "type": "public" },
      { "cidr": "10.0.2.0/24", "name": "public-3", "type": "public" }
    ],
    "private": [
      { "cidr": "10.0.8.0/21", "name": "private-1", "type": "private" },
      { "cidr": "10.0.16.0/21", "name": "private-2", "type": "private" },
      { "cidr": "10.0.24.0/21", "name": "private-3", "type": "private" }
    ],
    "loadBalancer": [],
    "controlPlane": [
      { "cidr": "10.0.3.0/28", "name": "control-plane-1", "type": "control-plane" }
    ]
  }
}
```

All three plans use `pods.cidr` `172.16.0.0/16` and `services.cidr` `192.168.0.0/20` (VPC `10.0.0.0/16`).

### Naming Convention Summary

| Provider | Region Example | Zone in Plan | Key Difference |
|----------|----------------|--------------|----------------|
| **AWS (EKS)** | `us-east-1` | `us-east-1a` (or your `availabilityZones`) | Hyphens everywhere, letter suffix |
| **GCP (GKE)** | `us-central1` | None (regional subnets; zones such as `us-central1-a` go on node pools) | No hyphen before number |
| **Azure (AKS)** | `eastus` | None (regional subnets; node pools use zones `1`, `2`, `3`) | No separators, numeric zones |
| **Kubernetes** | `region-1` | `zone-1` (or your `availabilityZones`) | Generic naming |

---

### Provider-Specific Features

**EKS (AWS)**
- VPC CNI with IP prefix delegation
- Every subnet type in at least two AZs, in every tier
- Two `/28` control-plane subnets in two AZs (one contiguous `/27`), for `vpc_config.subnet_ids`
- Private mode: internal load-balancer subnets per AZ, tagged `kubernetes.io/role/internal-elb`
- Nitro instance support for 250 pods/node

**GKE (Google Cloud)**
- Alias IP ranges (automatic management)
- GKE Autopilot support (5,000 node limit)
- Regional subnets (no zone per subnet)
- One `/28` control-plane range for `master_ipv4_cidr_block` or a private endpoint subnetwork
- Private mode: one proxy-only subnet for the region, egress through Cloud NAT

**AKS (Azure)**
- Azure CNI Overlay support
- Multi-node pool strategy (max 1,000 nodes/pool)
- Token bucket rate limiting considerations
- Regional subnets, plus one `/28` subnet for API Server VNet Integration
- Private mode: one internal load-balancer subnet, egress through a NAT gateway or user-defined routing

**Kubernetes (Generic)**
- Works with any CNI plugin (Calico, Flannel, Weave, etc.)
- On-premises deployments
- Self-hosted clusters
- Alternative cloud providers
- One `/28` control-plane subnet, so a floating API server address (keepalived, kube-vip) can move between control-plane nodes

---

## Security & Private IP Enforcement

### Private IP Requirement (ENFORCED)

**All Kubernetes VPC CIDRs MUST use private RFC 1918 IP ranges.** Public IPs are rejected by the API with clear security guidance.

**Why This Matters:**
- **Security Best Practice**: Kubernetes nodes must use private IPs. Exposing nodes with public IPs creates critical vulnerabilities.
- **Managed Service Requirement**: EKS, GKE, and AKS all require private node IPs.
- **Network Architecture**: Load balancers and ingress controllers use public IPs (or, in [private network mode](#private-network-mode), private IPs from `subnets.loadBalancer`); worker nodes always use private IPs.

### RFC 1918 Private Ranges (ACCEPTED)

| Range | CIDR | Addresses | Typical Use |
|-------|------|-----------|-------------|
| **Class A Private** | `10.0.0.0/8` | 16,777,216 | Large enterprise networks, multi-region deployments |
| **Class B Private** | `172.16.0.0/12` | 1,048,576 | Medium networks (172.16.0.0 - 172.31.255.255) |
| **Class C Private** | `192.168.0.0/16` | 65,536 | Small networks, development environments |

**Examples of Accepted CIDRs:**
```bash
# Class A private range
"vpcCidr": "10.0.0.0/16"
"vpcCidr": "10.50.0.0/16"
"vpcCidr": "10.100.0.0/16"

# Class B private range (172.16-31 only)
"vpcCidr": "172.16.0.0/16"
"vpcCidr": "172.20.0.0/16"
"vpcCidr": "172.31.0.0/16"

# Class C private range
"vpcCidr": "192.168.0.0/16"
"vpcCidr": "192.168.64.0/18"
```

### Public IP Rejection (SECURITY ANTI-PATTERN)

The API **rejects all public IP ranges** with HTTP 400 and security guidance. The check covers the entire range, not just the first address: every address must fall inside a single RFC 1918 block.

**Rejected IP Ranges:**
- Public Class A: 1-9, 11-126 (e.g., `8.8.8.0/16`, `1.1.1.0/16`)
- Public Class B: 128-191 except `172.16.0.0/12` (e.g., `172.100.0.0/16`, `130.0.0.0/16`)
- Public Class C: 192-223 except 192.168 (e.g., `200.0.0.0/16`, `203.0.113.0/24`)
- Multicast Class D: 224-239 (e.g., `224.0.0.0/4`)
- Reserved Class E: 240-255 (e.g., `240.0.0.0/4`)
- Ranges that start in private space but extend past it (e.g., `10.0.0.0/7`, `172.16.0.0/11`, `192.168.0.0/15`)

**Example Error Response:**
```bash
# Request with public IP
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"professional","vpcCidr":"8.8.8.0/16"}'

# Response (400 Bad Request)
{
  "error": "VPC CIDR \"8.8.8.0/16\" uses public IP space. The entire range must fall within a private RFC 1918 block: 10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16. Public IPs expose nodes to the internet (critical security risk). Use private subnets for Kubernetes nodes and public subnets only for load balancers/ingress controllers.",
  "code": "NETWORK_GENERATION_ERROR"
}
```

### Auto-Generated VPCs (Always Private)

If you don't provide a `vpcCidr`, the API picks a random RFC 1918 block and generates a random `/18` (16,384 addresses, enough for every tier and provider) aligned to a `/18` boundary inside it and clear of `172.17.0.0/16`. Pods and services are then placed in the other two RFC 1918 blocks, as in any other request:

```bash
# Request without vpcCidr
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize":"standard"}'

# Response includes randomly generated private CIDR
{
  "vpc": {
    "cidr": "10.18.128.0/18"  // Always a /18 inside one RFC 1918 block
  },
  ...
}
```

Because the VPC is random, omit `vpcCidr` only for exploration. Send an explicit `vpcCidr` for repeatable output.

---

## Request/Response Schemas

### Validation Rules

**VPC CIDR:**
- Optional. If omitted, a random `/18` aligned inside an RFC 1918 block is generated
- If provided, the **entire range** must fall inside one RFC 1918 block (enforced): `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`
- Ranges that extend past a private block are rejected (e.g., `10.0.0.0/7`, `172.16.0.0/11`, `192.168.0.0/15`), as are public IPs (see Security section above)
- Host bits are cleared (e.g., `10.1.2.3/16` → `10.1.0.0/16`)
- Max 18 characters after surrounding whitespace is trimmed
- Must be large enough for the tier and provider (see `minVpcPrefix` in [Deployment Tiers](#deployment-tiers), or `GET /api/k8s/tiers?provider=...`); a VPC that is too small returns `NETWORK_GENERATION_ERROR` naming the minimum
- May overlap `172.17.0.0/16`, but the plan then includes a `warnings` entry

**Pods CIDR (`podsCidr`):**
- Optional. If omitted, a range of the tier's `podsPrefix` is generated outside the VPC
- Must fall entirely within `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, or `100.64.0.0/10`
- Prefix `/8` to `/24`; host bits are cleared
- Must not overlap the VPC, `servicesCidr`, or `172.17.0.0/16`
- Max 18 characters after trimming

**Services CIDR (`servicesCidr`):**
- Optional. If omitted, a range of the tier's `servicesPrefix` (`/20`, or `/18` for hyperscale) is generated outside the VPC
- Must fall entirely within `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16` (EKS requires RFC 1918 service ranges)
- Prefix `/13` to `/24`: the intersection of EKS (`/12` to `/24`) and AKS (smaller than `/12`); host bits are cleared
- Must not overlap the VPC, `podsCidr`, or `172.17.0.0/16`
- Max 18 characters after trimming

**Availability Zones (`availabilityZones`):**
- Optional array of 1 to 6 unique zone names, each matching `^[a-z0-9]+(-[a-z0-9]+)*$` (max 64 characters)
- Assigned round-robin within each subnet type (public or load-balancer, private, control plane), so `public-1` (`load-balancer-1` in private mode), `private-1`, and `control-plane-1` share the first zone. The EKS control plane uses only the first two zones
- EKS: at least 2 required. Generic Kubernetes: any count. GKE and AKS: rejected (regional subnets)
- Schema problems (pattern, count, repeats) return `INVALID_REQUEST`; provider problems (GKE/AKS, one EKS zone) return `NETWORK_GENERATION_ERROR`

**Deployment Size:**
- Must be one of: `micro`, `standard`, `professional`, `enterprise`, `hyperscale`
- Case-sensitive
- Any other value returns `INVALID_REQUEST`

**Provider:**
- Must be one of: `eks`, `gke`, `aks`, `kubernetes`, `k8s`
- Case-sensitive
- Defaults to `kubernetes` if omitted
- Note: `k8s` is an alias for `kubernetes` (normalized in response)

**Region:**
- Optional; defaults to `us-east-1` (eks), `us-central1` (gke), `eastus` (aks), or `region-1` (kubernetes)
- Lowercase letters, digits, and hyphens only, e.g., `us-west-2`, `europe-west1`, `westeurope` (pattern `^[a-z0-9]+(-[a-z0-9]+)*$`)
- Max 64 characters
- Zone names: EKS `{region}{letter}` (`us-east-1a`), generic Kubernetes `zone-{1..3}` (the region is echoed in the response but not used in zone names); GKE and AKS subnets carry no zone. `availabilityZones` overrides the EKS and generic names

**Network Mode (`networkMode`):**
- Optional; `public` (default) or `private`, case-sensitive
- Any other value returns `INVALID_REQUEST`, e.g. `Invalid request: networkMode: Invalid enum value. Expected 'public' | 'private', received 'isolated'`
- Echoed as `networkMode` in every plan. `private` empties `subnets.public` and fills `subnets.loadBalancer`; `public` leaves `subnets.loadBalancer` empty (see [Private network mode](#private-network-mode))

**Deployment Name:**
- Optional string for tracking
- Max 128 characters
- Recommended format: `{environment}-{region}-{number}` (e.g., `prod-us-east-1`)

---

## Error Handling

### HTTP Status Codes

| Status | Meaning | Example |
|--------|---------|---------|
| 200 | Success | Plan generated successfully |
| 400 | Bad Request | Invalid `deploymentSize`, malformed, public, or too-small VPC CIDR, invalid `podsCidr`/`servicesCidr`/`availabilityZones`/`networkMode`, unknown tiers `provider` or `networkMode`, malformed JSON |
| 413 | Payload Too Large | Request body larger than 16 KB |
| 429 | Too Many Requests | More than 100 `/api` requests per minute from one IP |
| 500 | Server Error | Unexpected error during generation |

### Error Response Format

```json
{
  "error": "Error message describing the issue",
  "code": "ERROR_CODE"
}
```

### Error Codes

| Code | Status | Cause | Example |
|------|--------|-------|---------|
| `INVALID_REQUEST` | 400 / 413 | Request failed schema validation (missing or unknown `deploymentSize`, unknown `provider` or `networkMode` in the body or the tiers `?provider=`/`?networkMode=` query, bad `region`, `availabilityZones` with a bad name, repeats, or outside 1-6 entries, field too long), body is not valid JSON, or body is over 16 KB | `{ "error": "Invalid request: deploymentSize: Required", "code": "INVALID_REQUEST" }` |
| `NETWORK_GENERATION_ERROR` | 400 | VPC CIDR is malformed, not entirely private RFC 1918 space, or too small for the tier; `podsCidr`/`servicesCidr` malformed, outside the allowed blocks or sizes, or overlapping the VPC, each other, or `172.17.0.0/16`; `availabilityZones` sent for GKE/AKS or with one zone for EKS | `{ "error": "Invalid VPC CIDR \"999.999.999.999/16\": Invalid IP octet: 999", "code": "NETWORK_GENERATION_ERROR" }` |
| `RATE_LIMITED` | 429 | More than 100 `/api` requests per minute from one IP | `{ "error": "Too many requests. Please wait a minute and try again.", "code": "RATE_LIMITED" }` |
| `INTERNAL_ERROR` | 500 | Server-side error | `{ "error": "Failed to generate network plan", "code": "INTERNAL_ERROR" }` |

Validation messages have the form `Invalid request: <field>: <message>`, with multiple problems joined by `; `.

### Common Error Scenarios

**Missing Required Field:**
```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{}'
```
Response (400):
```json
{
  "error": "Invalid request: deploymentSize: Required",
  "code": "INVALID_REQUEST"
}
```

**Invalid Deployment Size:**
```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize": "invalid"}'
```
Response (400):
```json
{
  "error": "Invalid request: deploymentSize: Invalid enum value. Expected 'micro' | 'standard' | 'professional' | 'enterprise' | 'hyperscale', received 'invalid'",
  "code": "INVALID_REQUEST"
}
```

**Invalid CIDR Format:**
```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize": "standard", "vpcCidr": "999.999.999.999/16"}'
```
Response (400):
```json
{
  "error": "Invalid VPC CIDR \"999.999.999.999/16\": Invalid IP octet: 999",
  "code": "NETWORK_GENERATION_ERROR"
}
```

**VPC Too Small:** the message names the minimum prefix for the tier and provider.
```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{"deploymentSize": "micro", "provider": "eks", "vpcCidr": "10.0.0.0/24"}'
```
Response (400):
```json
{
  "error": "VPC 10.0.0.0/24 is too small for a eks micro plan: its subnets need 416 addresses (a /23 or larger), but a /24 provides 256. Use a larger VPC CIDR (smaller prefix number).",
  "code": "NETWORK_GENERATION_ERROR"
}
```

**Invalid Overrides:** examples of `NETWORK_GENERATION_ERROR` messages for `podsCidr`, `servicesCidr`, and `availabilityZones` (VPC `10.0.0.0/24`, micro):

| Request field | `error` |
|---------------|---------|
| `"podsCidr": "10.0.0.0/16"` | `podsCidr 10.0.0.0/16 overlaps the VPC 10.0.0.0/24.` |
| `"podsCidr": "172.17.0.0/16"` | `podsCidr "172.17.0.0/16" overlaps 172.17.0.0/16 (Docker's default bridge network; AWS also reserves it for some services (Cloud9, SageMaker)).` |
| `"servicesCidr": "172.16.0.0/12"` | `servicesCidr "172.16.0.0/12" must be between /13 and /24; got /12.` |
| `"provider": "gke", "availabilityZones": ["us-central1-a", "us-central1-b"]` | `availabilityZones applies to eks and kubernetes only: GKE subnets are regional, and node pools choose their zones.` |
| `"provider": "eks", "availabilityZones": ["us-east-1a"]` (VPC `10.0.0.0/23`) | `EKS needs subnets in at least two availability zones; pass two or more availabilityZones.` |

**Malformed JSON:**

A body that is not valid JSON returns 400 with code `INVALID_REQUEST` and the JSON parser's message in `error`.

### Rate Limiting

- All `/api` routes are limited to **100 requests per minute per client IP**.
- Health endpoints are exempt so load balancer and Kubernetes probes are never throttled: `/api/v1/health`, `/api/v1/health/ready`, `/api/v1/health/live`, and the unprefixed `/health`, `/health/ready`, `/health/live`.
- Responses include the standard `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers (legacy `X-RateLimit-*` headers are not sent).
- Exceeding the limit returns `429`:
  ```json
  {
    "error": "Too many requests. Please wait a minute and try again.",
    "code": "RATE_LIMITED"
  }
  ```
- Clients are identified by IP. Behind a reverse proxy, set `TRUST_PROXY` (e.g., `TRUST_PROXY=1`) so the real client IP is used; the default (`false`) uses the socket address.
- Request bodies are capped at 16 KB; larger bodies return `413` with code `INVALID_REQUEST`.
- In production, the web app's SPA fallback (GET/HEAD requests for unknown routes without a file extension) is separately limited to 30 requests per 15 minutes per IP.

---

## Usage Examples

### Example 1: Development Cluster on AWS EKS

```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "standard",
    "provider": "eks",
    "deploymentName": "dev-cluster"
  }'
```

### Example 2: Production Cluster on Google Cloud

```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "enterprise",
    "provider": "gke",
    "vpcCidr": "10.100.0.0/16",
    "deploymentName": "prod-us-central1"
  }'
```

### Example 3: Global-Scale Kubernetes (Realistic Hyperscale)

```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "hyperscale",
    "provider": "eks",
    "vpcCidr": "10.42.192.0/18",
    "deploymentName": "prod-us-east-1"
  }'
```

**This generates:**
- 3 public subnets at /23 (512 IPs each) for NAT/LB: `10.42.192.0/23`, `10.42.194.0/23`, `10.42.196.0/23`
- 3 private subnets at /20 (4,096 IPs each) for nodes: `10.42.208.0/20`, `10.42.224.0/20`, `10.42.240.0/20`
- 2 control-plane subnets at /28 in `us-east-1a` and `us-east-1b`, together one /27 (for `vpc_config.subnet_ids`): `10.42.198.0/28`, `10.42.198.16/28`, in the gap before the first /20
- Pods `172.24.0.0/13` and services `192.168.0.0/18` (the VPC is in `10.0.0.0/8`; `172.16.0.0/13` would contain the reserved `172.17.0.0/16`)
- Total: 13,856 subnet IPs. The private subnets start on the next /20 boundary after the public subnets, so the layout spans the full /18 VPC (`minVpcPrefix` 18)

### Example 4: Multi-Region Deployment

Generate separate network plans for each region:

```bash
# Region 1: US-East
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "region": "us-east-1",
    "vpcCidr": "10.0.0.0/16",
    "deploymentName": "prod-us-east-1"
  }'

# Region 2: EU-West
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks",
    "region": "eu-west-1",
    "vpcCidr": "10.1.0.0/16",
    "deploymentName": "prod-eu-west-1"
  }'
```

Both plans get the same pod (`172.16.0.0/18`) and service (`192.168.0.0/20`) ranges, because generated placement depends only on which RFC 1918 block the VPC is in. That is fine for independent clusters. If pod or service ranges must be unique across connected clusters, pass `podsCidr` and `servicesCidr` for each cluster (for example `172.16.0.0/18` and `192.168.0.0/20` for the first, `172.16.64.0/18` and `192.168.16.0/20` for the second); see [Address Space Separation](#address-space-separation).

---

## Provider-Specific Configuration

### EKS (AWS) Configuration

#### CRITICAL: Pod Networking Model

**Our API generates pod ranges for an overlay CNI (Calico or Cilium), NOT default AWS VPC CNI, and `pods.cidr` cannot be used as a secondary VPC CIDR (see Model 2).**

**EKS Pod IP Allocation - Two Models:**

**Model 1: AWS VPC CNI (Default)**
- Pods share VPC subnet IPs with nodes (no separate pod CIDR)
- High IP exhaustion risk for large clusters
- Simpler setup, no custom CNI required
- **Our API output does NOT support this model directly**

**Model 2: Custom CNI or Secondary CIDR (Our API)**
- Pods use separate CIDR range (our API's `pods.cidr` field)
- No VPC IP exhaustion
- `pods.cidr` is an **overlay** range: use it as the IP pool of an overlay CNI (Calico or Cilium in VXLAN/IP-in-IP mode)
- **Our API generates configurations for this model**

WARNING: `pods.cidr` cannot be added to the VPC as a secondary CIDR. The API always places it in a different RFC 1918 block than the VPC, and AWS refuses to associate a CIDR from a different RFC 1918 block than the VPC's existing ranges; secondary blocks must also be /16 to /28 ([AWS: IPv4 CIDR block association restrictions](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-cidr-blocks.html#add-cidr-block-restrictions)). For VPC CNI custom networking, use a secondary block from `100.64.0.0/10` that you choose (Option B below).

**Recommended Settings:**
- Use `professional` or `enterprise` tier for production
- Enable IP prefix delegation for large clusters (1000+ nodes)
- Pod CIDR `/13` supports up to 200,000 pods per cluster
- Choose Model 2 for clusters >1000 nodes or >100 pods/node

**Terraform Integration (Model 2 - Custom CNI):**
```hcl
locals {
  network_plan = jsondecode(file("${path.module}/eks-network.json"))
}

resource "aws_vpc" "main" {
  cidr_block = local.network_plan.vpc.cidr
  tags = {
    Name = local.network_plan.deploymentName
  }
}

# Request the plan with "availabilityZones" set to names from
# data.aws_availability_zones, so every availabilityZone below exists in your account.

# Worker nodes (node groups)
resource "aws_subnet" "private" {
  count             = length(local.network_plan.subnets.private)
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.network_plan.subnets.private[count.index].cidr
  availability_zone = local.network_plan.subnets.private[count.index].availabilityZone
}

# Cluster subnets for the EKS control plane ENIs: exactly two /28s in two AZs,
# together one /27 (EKS requires two AZs; naming only two controls where the ENIs land)
resource "aws_subnet" "control_plane" {
  count             = length(local.network_plan.subnets.controlPlane)
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.network_plan.subnets.controlPlane[count.index].cidr
  availability_zone = local.network_plan.subnets.controlPlane[count.index].availabilityZone
}

# Option A: Use Custom CNI Plugin (Calico)
resource "null_resource" "install_calico" {
  provisioner "local-exec" {
    command = <<-EOT
      kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml
      kubectl set env daemonset/calico-node -n kube-system CALICO_IPV4POOL_CIDR=${local.network_plan.pods.cidr}
    EOT
  }
  depends_on = [aws_eks_cluster.main]
}

# Option B: VPC CNI custom networking with a secondary VPC CIDR
# Do NOT use local.network_plan.pods.cidr here: AWS refuses to associate a CIDR
# from a different RFC 1918 block than the VPC's, and secondary blocks must be
# /16 to /28. Use a block from 100.64.0.0/10 instead (not generated by this API).
resource "aws_vpc_ipv4_cidr_block_association" "pods" {
  vpc_id     = aws_vpc.main.id
  cidr_block = "100.64.0.0/16"
}

resource "aws_subnet" "pod_subnets" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet("100.64.0.0/16", 2, count.index) # 3 x /18
  availability_zone = data.aws_availability_zones.available.names[count.index]

  # VPC CNI custom networking selects these subnets through one ENIConfig per AZ,
  # not through a subnet tag.
  depends_on = [aws_vpc_ipv4_cidr_block_association.pods]
}

# If using default AWS VPC CNI (Model 1)
# Remove pod CIDR configuration - pods use VPC subnet IPs directly
resource "aws_eks_addon" "vpc_cni" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "vpc-cni"
  addon_version               = "v1.14.1-eksbuild.1"
  resolve_conflicts_on_create = "OVERWRITE"
  service_account_role_arn    = aws_iam_role.vpc_cni.arn
  
  # For Model 1: No custom pod CIDR needed
  # For Model 2: Configure custom networking
}
```

**Private network mode** (plan requested with `"networkMode": "private"`): `subnets.public` is empty, so there is no public subnet for a NAT gateway or internet-facing load balancer. Create the internal load-balancer subnets instead:

```hcl
# Internal load-balancer subnets, one per AZ (at least two). The AWS Load Balancer
# Controller picks subnets with this tag for internal load balancers.
resource "aws_subnet" "internal_lb" {
  count             = length(local.network_plan.subnets.loadBalancer)
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.network_plan.subnets.loadBalancer[count.index].cidr
  availability_zone = local.network_plan.subnets.loadBalancer[count.index].availabilityZone

  tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}
```

Egress is outside the plan: a public NAT gateway must sit in a public subnet, and a private NAT gateway reaches only other VPCs or on-premises networks, not the internet. Reach the internet through a transit gateway to a shared egress VPC, or run without internet access using VPC endpoints.

**Configuration Guide:**
1. Enable IP prefix delegation for large clusters (1000+ nodes)
2. Configure warm prefix target for proactive scaling
3. Use Nitro-based instance types for optimal pod density
4. Monitor subnet CIDR fragmentation

#### EKS Service IPv4 CIDR Configuration

**Terraform Configuration** (`service_ipv4_cidr` - Cluster Creation Only):
```hcl
resource "aws_eks_cluster" "main" {
  name     = local.network_plan.deploymentName
  role_arn = aws_iam_role.eks_cluster.arn

  vpc_config {
    # Cluster subnets: the plan's two /28 control-plane subnets (two AZs, one /27)
    subnet_ids = aws_subnet.control_plane[*].id
  }

  kubernetes_network_config {
    service_ipv4_cidr = local.network_plan.services.cidr  # Must be set at creation
  }
}

# Worker nodes go in the plan's private subnets
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "default"
  node_role_arn   = aws_iam_role.eks_node.arn
  subnet_ids      = aws_subnet.private[*].id

  scaling_config {
    desired_size = 3
    max_size     = 6
    min_size     = 3
  }
}
```

**Requirements:**
- **RFC 1918 Private IPs Only**: Must use `10.0.0.0/8`, `172.16.0.0/12`, or `192.168.0.0/16`
- **Prefix Range**: `/24` to `/12` (inclusive)
- **Non-Overlapping**: Cannot overlap with VPC CIDR, Pod CIDR, or connected networks
- **Immutable**: Can only be set during cluster creation (changing forces cluster replacement)

**Default Behavior** (if not specified):
- EKS auto-assigns `10.100.0.0/16` (preferred) or `172.20.0.0/16` (fallback)
- Our API places the service CIDR in an RFC 1918 block not used by the VPC or pods: `192.168.0.0/<servicesPrefix>` when the VPC is in `10.0.0.0/8` or `172.16.0.0/12`, otherwise `172.16.0.0/<servicesPrefix>`. Neither overlaps the AWS defaults above

**Our Implementation:**
- Micro through enterprise: a `/20` (4,096 ClusterIPs), the same size GKE uses by default
- Hyperscale: a `/18` (16,384 ClusterIPs), above Kubernetes' tested limit of 10,000 services
- Earlier versions used a `/16`, which consumed all of `192.168.0.0/16`
- To keep an existing cluster's range, pass it as `servicesCidr` (`/13` to `/24`, RFC 1918)

**Validation Example** (Terraform):
```hcl
variable "service_ipv4_cidr" {
  type        = string
  default     = "192.168.0.0/20"  # services.cidr returned for a VPC in 10.0.0.0/8 (e.g., 10.100.0.0/18 above)
  description = "Service IPv4 CIDR (must be /24 to /12, RFC 1918, no overlap)"
  
  validation {
    condition     = can(regex("^(10\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.|192\\.168\\.)", var.service_ipv4_cidr))
    error_message = "Service CIDR must use RFC 1918 private IP ranges."
  }
  
  validation {
    condition     = tonumber(regex("/([0-9]+)$", var.service_ipv4_cidr)[0]) >= 12 && tonumber(regex("/([0-9]+)$", var.service_ipv4_cidr)[0]) <= 24
    error_message = "Service CIDR prefix must be between /12 and /24."
  }
}
```

**Migration Note**: Changing service CIDR requires cluster recreation. Plan blue-green deployments for zero-downtime migrations.

**Reference**: See [EKS Compliance Audit](../docs/compliance/EKS_COMPLIANCE_AUDIT.md#41-eks-service-ipv4-cidr-configuration) for detailed analysis.

### GKE (Google Cloud) Configuration

**Recommended Settings:**
- Use `professional` or `enterprise` tier for production
- GKE automatically manages pod CIDR (alias ranges)
- Pod CIDR `/13` supports up to 200,000 pods per cluster (2,048 nodes at 65-128 max pods per node, since each node then takes a `/24`; 5,000 nodes needs 32 or fewer max pods per node, or a `/11` `podsCidr`)
- Subnets are regional: one node subnet (`subnets.private[0]`) serves every zone

**Terraform Integration:**
```hcl
locals {
  network_plan = jsondecode(file("${path.module}/gke-network.json"))
}

# Node subnet with secondary ranges for pods and services
resource "google_compute_subnetwork" "nodes" {
  name          = "${local.network_plan.deploymentName}-nodes"
  region        = local.network_plan.region
  network       = google_compute_network.main.id
  ip_cidr_range = local.network_plan.subnets.private[0].cidr

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = local.network_plan.pods.cidr
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = local.network_plan.services.cidr
  }
}

resource "google_container_cluster" "main" {
  name       = local.network_plan.deploymentName
  location   = local.network_plan.region
  network    = google_compute_network.main.id
  subnetwork = google_compute_subnetwork.nodes.id

  remove_default_node_pool = true
  initial_node_count       = 1

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  private_cluster_config {
    enable_private_nodes   = true
    # The plan's /28 control-plane range. Do not create a subnet for it:
    # it must not overlap any other range in use in the network.
    master_ipv4_cidr_block = local.network_plan.subnets.controlPlane[0].cidr
  }
}
```

To provision the control-plane endpoint in a subnetwork instead, create a `google_compute_subnetwork` from `subnets.controlPlane[0].cidr` and set `private_endpoint_subnetwork` to it in place of `master_ipv4_cidr_block`.

**Private network mode** (plan requested with `"networkMode": "private"`): `subnets.public` is empty and `subnets.loadBalancer[0]` is meant as the region's proxy-only subnet. Only one `REGIONAL_MANAGED_PROXY` subnet can be active per region per VPC network, so if another cluster in the same region and network already created one, share it and skip that resource. Egress for nodes without external IPs goes through Cloud NAT, which takes no subnet:

```hcl
# Proxy-only subnet for regional Envoy-based load balancers (no VMs can use it)
resource "google_compute_subnetwork" "proxy_only" {
  name          = "${local.network_plan.deploymentName}-proxy-only"
  region        = local.network_plan.region
  network       = google_compute_network.main.id
  ip_cidr_range = local.network_plan.subnets.loadBalancer[0].cidr
  purpose       = "REGIONAL_MANAGED_PROXY"
  role          = "ACTIVE"
}

# Cloud NAT is configured per region on a Cloud Router
resource "google_compute_router" "nat" {
  name    = "${local.network_plan.deploymentName}-router"
  region  = local.network_plan.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "nat" {
  name                               = "${local.network_plan.deploymentName}-nat"
  router                             = google_compute_router.nat.name
  region                             = google_compute_router.nat.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}
```

**gcloud Configuration:**
```bash
gcloud container clusters create prod-cluster \
  --enable-ip-alias \
  --network "default" \
  --cluster-secondary-range-name pods \
  --services-secondary-range-name services \
  --zone us-central1-a \
  --num-nodes 10
```

**Configuration Guide:**
1. Always enable IP alias for production clusters
2. Use VPC-native networking
3. Configure cluster secondary ranges for pods and services
4. Enable Workload Identity for security

### AKS (Azure) Configuration

**Recommended Settings:**
- Use `professional` or `enterprise` tier for production
- Use Azure CNI Overlay (`network_plugin_mode = "overlay"`): `pods.cidr` is an overlay range outside the VNet
- CNI Overlay gives every node a fixed `/24` from the pod CIDR, whatever its max pods (up to 250 pods per node, 5,000 nodes), so the hyperscale `/13` holds 2,048 nodes; for 5,000 nodes pass a `/11` `podsCidr`
- Subnets are regional: node pools choose zones, and the plan carries no `availabilityZone`

**Terraform Integration:**
```hcl
locals {
  network_plan = jsondecode(file("${path.module}/aks-network.json"))
}

resource "azurerm_virtual_network" "main" {
  name                = "${local.network_plan.deploymentName}-vnet"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = [local.network_plan.vpc.cidr]
}

# Node subnet
resource "azurerm_subnet" "nodes" {
  name                 = "nodes"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [local.network_plan.subnets.private[0].cidr]
}

# API Server VNet Integration subnet: the plan's /28 control-plane subnet,
# delegated to AKS and used for nothing else
resource "azurerm_subnet" "apiserver" {
  name                 = "apiserver"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [local.network_plan.subnets.controlPlane[0].cidr]

  delegation {
    name = "aks-apiserver"
    service_delegation {
      name = "Microsoft.ContainerService/managedClusters"
    }
  }
}

resource "azurerm_kubernetes_cluster" "main" {
  name                = local.network_plan.deploymentName
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = local.network_plan.deploymentName

  # The cluster identity needs permissions (Network Contributor) on both subnets
  # before creation; use a user-assigned identity with role assignments.

  default_node_pool {
    name           = "default"
    node_count     = 3
    vm_size        = "Standard_D2s_v3"
    vnet_subnet_id = azurerm_subnet.nodes.id
    zones          = ["1", "2", "3"]  # Only in regions with availability zones
  }

  api_server_access_profile {
    virtual_network_integration_enabled = true
    subnet_id                           = azurerm_subnet.apiserver.id
  }

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    network_policy      = "azure"
    pod_cidr            = local.network_plan.pods.cidr
    service_cidr        = local.network_plan.services.cidr
    # Inside service_cidr and not its first address
    dns_service_ip      = cidrhost(local.network_plan.services.cidr, 10)
  }
}
```

`docker_bridge_cidr` no longer exists in the `azurerm` provider; do not set it. `pod_cidr` is accepted only with `network_plugin_mode = "overlay"` (or `kubenet`).

**Configuration Guide:**
1. Scale in batches of 500-700 nodes
2. Wait 2-5 minutes between scaling operations to avoid throttling
3. Cannot upgrade cluster when at 5,000 nodes (scale down first)
4. Enable Azure CNI Overlay for large deployments

### Kubernetes (Generic/Self-Hosted)

**Recommended Settings:**
- Use your preferred CNI plugin (Calico, Flannel, Weave, etc.)
- Pod CIDR must not overlap with VPC CIDR
- Service CIDR must not overlap with pod or VPC CIDRs
- Run control-plane nodes in the single `subnets.controlPlane` subnet (one `/28`, so a floating API server address from keepalived or kube-vip can move between them) and workers in `subnets.private`

**kubeadm Initialization:**
```bash
# Values from an enterprise plan for VPC 10.0.0.0/16 (provider "kubernetes"):
# pods.cidr = 172.16.0.0/16, services.cidr = 192.168.0.0/20,
# control plane nodes in control-plane-1 (10.0.3.0/28, zone-1, the only control-plane subnet);
# worker nodes in private-1..3 (10.0.8.0/21, 10.0.16.0/21, 10.0.24.0/21)
kubeadm init \
  --pod-network-cidr=172.16.0.0/16 \
  --service-cidr=192.168.0.0/20 \
  --apiserver-advertise-address=10.0.3.10
```

**Configuration Guide:**
1. Ensure non-overlapping CIDR ranges
2. Deploy CNI plugin after cluster initialization
3. Scale horizontally as needed (no hard limits)
4. Monitor cluster capacity regularly

---

## Integration Guides

### Terraform Integration

**1. Save API response to file:**
```bash
curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentSize": "professional",
    "provider": "eks"
  }' > network-plan.json
```

**2. Use in Terraform:**
```hcl
locals {
  network_plan = jsondecode(file("${path.module}/network-plan.json"))
}

resource "aws_vpc" "main" {
  cidr_block = local.network_plan.vpc.cidr
}
```

### Ansible Integration

**Playbook Example:**
```yaml
- name: Generate Kubernetes network plan
  hosts: localhost
  vars:
    api_url: "http://localhost:5000/api/kubernetes/network-plan"
    cluster_config:
      deploymentSize: professional
      provider: eks
      deploymentName: "{{ environment }}-cluster"
  
  tasks:
    - name: Call API for network plan
      uri:
        url: "{{ api_url }}"
        method: POST
        body_format: json
        body: "{{ cluster_config }}"
      register: network_plan
    
    - name: Save plan to file
      copy:
        content: "{{ network_plan.json | to_nice_json }}"
        dest: "/tmp/network-{{ environment }}.json"
```

### Python Integration

```python
import requests
import json

def generate_k8s_network_plan(
    deployment_size: str,
    provider: str = "kubernetes",
    vpc_cidr: str = None,
    deployment_name: str = None
) -> dict:
    """Generate a Kubernetes network plan via API."""
    
    url = "http://localhost:5000/api/kubernetes/network-plan"
    
    payload = {
        "deploymentSize": deployment_size,
        "provider": provider,
        "vpcCidr": vpc_cidr,
        "deploymentName": deployment_name
    }
    
    # Remove None values
    payload = {k: v for k, v in payload.items() if v is not None}
    
    response = requests.post(url, json=payload)
    response.raise_for_status()
    
    return response.json()

# Usage
plan = generate_k8s_network_plan(
    deployment_size="professional",
    provider="eks",
    vpc_cidr="10.0.0.0/16",
    deployment_name="prod-us-east-1"
)

print(json.dumps(plan, indent=2))
```

### Shell Script Integration

```bash
#!/bin/bash
# generate-network-plan.sh

DEPLOYMENT_SIZE="${1:-standard}"
PROVIDER="${2:-kubernetes}"
VPC_CIDR="${3:-}"
DEPLOYMENT_NAME="${4:-}"

PAYLOAD=$(cat <<EOF
{
  "deploymentSize": "$DEPLOYMENT_SIZE",
  "provider": "$PROVIDER"
EOF
)

if [ -n "$VPC_CIDR" ]; then
  PAYLOAD="$PAYLOAD,\"vpcCidr\": \"$VPC_CIDR\""
fi

if [ -n "$DEPLOYMENT_NAME" ]; then
  PAYLOAD="$PAYLOAD,\"deploymentName\": \"$DEPLOYMENT_NAME\""
fi

PAYLOAD="$PAYLOAD}"

curl -X POST http://localhost:5000/api/kubernetes/network-plan \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | jq .

# Usage: ./generate-network-plan.sh professional eks "10.0.0.0/16" "prod-cluster"
```

---

## Support & Documentation

- **API Documentation**: This file (api.md)
- **Compliance Audits**: 
  - [GKE Compliance Audit](./compliance/GKE_COMPLIANCE_AUDIT.md)
  - [EKS Compliance Audit](./compliance/EKS_COMPLIANCE_AUDIT.md)
  - [AKS Compliance Audit](./compliance/AKS_COMPLIANCE_AUDIT.md)
- **Project README**: [README.md](../README.md)
- **Developer Guidelines**: [.github/copilot-instructions.md](../.github/copilot-instructions.md)

---

## Changelog

### Version 2.0 (Current)
- Four separated address spaces in every plan: nodes and new `/28` control-plane subnets (`subnets.controlPlane`) inside the VPC; pods and services outside it, each in its own RFC 1918 block
- The control plane is one network: one `/28` for GKE, AKS, and generic Kubernetes in every tier; for EKS exactly two `/28`s in two AZs, forming one contiguous `/27`
- First-fit subnet layout; existing public and private positions are unchanged
- New optional request field `networkMode` (`public` by default, or `private`: no public subnets, internal load-balancer subnets instead); every plan now includes `networkMode` and `subnets.loadBalancer` (empty in public mode), and subnet `type` adds `load-balancer`
- EKS: every subnet type in at least two AZs in every tier (micro and standard EKS now need `/23` and `/22` VPCs)
- GKE and AKS subnets carry no `availabilityZone` (regional subnets)
- Services are `/20` (`/18` for hyperscale) instead of `/16`
- Generated pods and services avoid `172.17.0.0/16`; a VPC overlapping it adds a `warnings` entry (hyperscale pods for a `10.x` VPC moved to `172.24.0.0/13`)
- New optional request fields `podsCidr`, `servicesCidr`, and `availabilityZones`
- `minVpcPrefix` computed from the real layout per provider (enterprise is `/19`); `GET /api/k8s/tiers?provider=` and `?networkMode=`, and new tier fields `networkMode`, `loadBalancerSubnets`, `controlPlaneSubnets`, `loadBalancerSubnetSize`, and `controlPlaneSubnetSize`
- "VPC too small" errors name the minimum prefix
- `metadata.version` is `"2.0"`

### Version 1.0
-  POST `/api/kubernetes/network-plan` - Generate network plans
-  GET `/api/kubernetes/tiers` - Retrieve tier information
-  Support for EKS, GKE, AKS, and generic Kubernetes
-  All 5 deployment tiers (Micro → Hyperscale)
-  RFC 1918 private address support
-  214+ integration and unit tests

---

**Last Updated:** October 2, 2026  
**API Status:**  Production Ready  
**Tests:** 528 passing (`npm test -- --run`); no coverage tool is configured  
**Vulnerabilities:** 0
