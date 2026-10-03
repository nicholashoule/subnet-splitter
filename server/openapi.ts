/**
 * server/openapi.ts
 * 
 * OpenAPI 3.0 specification for CIDR Subnet Calculator API.
 * Provides interactive API documentation via Swagger UI.
 * 
 * Security: Minimal implementation, no authentication required
 * (API endpoints are stateless and perform only calculations)
 *
 * Request/response examples are produced by the real generator at startup, so
 * they can never drift from what the API returns.
 */

import { version as APP_VERSION } from "../package.json";
import { buildKubernetesNetworkPlan, getDeploymentTierInfo } from "../client/src/lib/kubernetes-network-generator";

const EXAMPLE_TIME = new Date("2026-10-02T12:00:00.000Z");

/** Example requests shown in Swagger UI; responses are generated from them */
const PLAN_EXAMPLES: Record<string, { summary: string; request: Record<string, unknown> }> = {
  eks_enterprise: {
    summary: "AWS EKS Enterprise (us-east-1)",
    request: { deploymentSize: "enterprise", provider: "eks", region: "us-east-1", vpcCidr: "10.100.0.0/18", deploymentName: "prod-eks-us-east-1" },
  },
  gke_enterprise: {
    summary: "GCP GKE Enterprise (us-central1)",
    request: { deploymentSize: "enterprise", provider: "gke", region: "us-central1", vpcCidr: "10.100.0.0/18", deploymentName: "prod-gke-us-central1" },
  },
  aks_enterprise: {
    summary: "Azure AKS Enterprise (eastus)",
    request: { deploymentSize: "enterprise", provider: "aks", region: "eastus", vpcCidr: "10.100.0.0/18", deploymentName: "prod-aks-eastus" },
  },
  eks_micro: {
    summary: "AWS EKS Micro (two AZs, as EKS requires)",
    request: { deploymentSize: "micro", provider: "eks", region: "us-west-2", vpcCidr: "10.0.0.0/23" },
  },
  eks_explicit_zones: {
    summary: "AWS EKS with explicit zones (ap-northeast-1 has no 1b for new accounts)",
    request: { deploymentSize: "professional", provider: "eks", region: "ap-northeast-1", vpcCidr: "10.10.0.0/16", availabilityZones: ["ap-northeast-1a", "ap-northeast-1c"] },
  },
  gke_private: {
    summary: "GKE private network (no public subnets; Cloud NAT egress, proxy-only subnet for internal LBs)",
    request: { deploymentSize: "enterprise", provider: "gke", region: "us-central1", vpcCidr: "10.20.0.0/16", networkMode: "private" },
  },
  eks_private: {
    summary: "EKS private network (internal-elb subnets per AZ, no public subnets)",
    request: { deploymentSize: "professional", provider: "eks", region: "us-east-1", vpcCidr: "10.30.0.0/16", networkMode: "private" },
  },
  second_cluster: {
    summary: "Second GKE cluster in the same network (explicit, non-overlapping pods/services)",
    request: { deploymentSize: "professional", provider: "gke", region: "us-central1", vpcCidr: "10.1.0.0/16", podsCidr: "172.16.64.0/18", servicesCidr: "192.168.16.0/20" },
  },
};

const exampleEntries = <T>(build: (example: { summary: string; request: Record<string, unknown> }) => T) =>
  Object.fromEntries(Object.entries(PLAN_EXAMPLES).map(([key, example]) => [key, { summary: example.summary, value: build(example) }]));

// Validation and planning errors from the plan and tiers routes follow ?format= (JSON by
// default, YAML with format=yaml). Malformed, oversized or wrongly encoded bodies (400,
// 413, 415), unknown API paths (404) and rate limiting (429) are always JSON.
const errorContent = {
  "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  "application/yaml": { schema: { $ref: "#/components/schemas/Error" } },
};

// /api routes other than health checks share a per-IP limit (createApiRateLimiter in server/routes.ts)
const rateLimitedResponse = {
  description: "Too many requests: more than 100 requests in a minute from this IP",
  headers: {
    "RateLimit-Limit": { description: "Requests allowed per window", schema: { type: "integer", example: 100 } },
    "RateLimit-Remaining": { description: "Requests left in the current window", schema: { type: "integer", example: 0 } },
    "RateLimit-Reset": { description: "Seconds until the window resets", schema: { type: "integer", example: 42 } },
    "RateLimit-Policy": { description: "The limit and window in seconds", schema: { type: "string", example: "100;w=60" } },
    "Retry-After": { description: "Seconds to wait before retrying", schema: { type: "integer", example: 42 } },
  },
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
      example: { error: "Too many requests. Please wait a minute and try again.", code: "RATE_LIMITED" },
    },
  },
};

const payloadTooLargeResponse = {
  description: "Request body larger than 16 KB (always JSON)",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
      example: { error: "Request body is larger than 16 KB", code: "INVALID_REQUEST" },
    },
  },
};

const unsupportedMediaTypeResponse = {
  description: "Request body in a charset other than UTF-8, or with an unsupported Content-Encoding (always JSON)",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
      example: { error: "Unsupported charset in Content-Type; send UTF-8 JSON", code: "INVALID_REQUEST" },
    },
  },
};

export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "CIDR Subnet Calculator API",
    version: APP_VERSION,
    description: "REST API for subnet calculations and Kubernetes network planning. Generate optimized network configurations for EKS, GKE, AKS, and self-hosted Kubernetes clusters: separate node, control-plane, pod and service ranges that never overlap."
  },
  servers: [
    {
      url: "/api",
      description: "Primary API (concise routes)"
    }
  ],
  tags: [
    {
      name: "Health",
      description: "Health check endpoints for Kubernetes probes and monitoring"
    },
    {
      name: "Kubernetes",
      description: "Kubernetes network planning - generate VPC subnets, pod CIDRs, and service ranges for EKS, GKE, AKS, and self-hosted clusters"
    }
  ],
  paths: {
    "/v1/health": {
      get: {
        tags: ["Health"],
        operationId: "getHealth",
        summary: "Health check",
        description: "Check if the service is healthy and operational. Use for Kubernetes readiness/liveness probes.",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "healthy" },
                    timestamp: { type: "string", format: "date-time" },
                    uptime: { type: "number", description: "Server uptime in seconds" },
                    version: { type: "string", example: APP_VERSION }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/health/ready": {
      get: {
        tags: ["Health"],
        operationId: "getReadiness",
        summary: "Readiness check",
        description: "Kubernetes readiness probe - returns 200 when service can accept traffic",
        responses: {
          "200": {
            description: "Service is ready",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ready" },
                    timestamp: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/v1/health/live": {
      get: {
        tags: ["Health"],
        operationId: "getLiveness",
        summary: "Liveness check",
        description: "Kubernetes liveness probe - returns 200 when service process is alive",
        responses: {
          "200": {
            description: "Service is alive",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "alive" },
                    timestamp: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/k8s/plan": {
      post: {
        tags: ["Kubernetes"],
        operationId: "generateNetworkPlan",
        summary: "Generate Kubernetes network plan",
        description: "Generate a VPC layout for a Kubernetes cluster with nodes, control plane, pods, and services each in separate, non-overlapping ranges. Load-balancer (public, or internal in private mode), node, and control-plane subnets sit inside the VPC; generated pods and services sit outside it, each in its own block (RFC 1918, or 100.64.0.0/10 for pods when no RFC 1918 block has room), clear of 172.17.0.0/16 and, for AKS, of 172.30.0.0/16 and 172.31.0.0/16. EKS plans spread every subnet type across at least two AZs; GKE and AKS subnets are regional (no zone). Supports tiers from micro (1 node) to hyperscale. The VPC must be private RFC 1918 space, /16 or smaller (for AKS also clear of 172.30.0.0/16 and 172.31.0.0/16).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["deploymentSize"],
                properties: {
                  deploymentSize: {
                    type: "string",
                    enum: ["micro", "standard", "professional", "enterprise", "hyperscale"],
                    description: "Deployment tier based on cluster size"
                  },
                  provider: {
                    type: "string",
                    enum: ["eks", "gke", "aks", "kubernetes", "k8s"],
                    default: "kubernetes",
                    description: "Cloud provider (k8s is alias for kubernetes)"
                  },
                  region: {
                    type: "string",
                    pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
                    maxLength: 64,
                    description: "Cloud region/location (provider-specific naming). AWS: {continent}-{direction}-{number} (e.g., us-east-1, eu-west-2). GCP: {continent}-{direction}{number} - NO hyphen before number (e.g., us-central1, europe-west1). Azure: lowercase concatenated (e.g., eastus, westeurope, northcentralus). Uses provider default if omitted.",
                    example: "us-east-1"
                  },
                  vpcCidr: {
                    type: "string",
                    pattern: "^\\d{1,3}(\\.\\d{1,3}){3}/\\d{1,2}$",
                    maxLength: 18,
                    example: "10.100.0.0/18",
                    description: "Private RFC 1918 CIDR. The entire range must fall within 10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16; host bits are cleared. /16 or smaller for every provider (AWS limits VPCs to /16 to /28; for GKE, AKS and generic Kubernetes the /16 cap is this project's standard). AKS: clear of 172.30.0.0/16 and 172.31.0.0/16, which AKS reserves. A random /18 is generated if omitted; a blank value is rejected."
                  },
                  podsCidr: {
                    type: "string",
                    pattern: "^\\d{1,3}(\\.\\d{1,3}){3}/\\d{1,2}$",
                    maxLength: 18,
                    example: "172.16.64.0/18",
                    description: "Optional pod range, e.g. so several clusters in one network don't overlap. RFC 1918 or 100.64.0.0/10, /8 to /24; must not overlap the VPC, servicesCidr, or 172.17.0.0/16 (for AKS also 172.30.0.0/16 and 172.31.0.0/16). Generated if omitted; a blank value is rejected."
                  },
                  servicesCidr: {
                    type: "string",
                    pattern: "^\\d{1,3}(\\.\\d{1,3}){3}/\\d{1,2}$",
                    maxLength: 18,
                    example: "192.168.16.0/20",
                    description: "Optional service (ClusterIP) range. RFC 1918, /13 to /24 (EKS allows /12-/24, AKS requires smaller than /12); for GKE /16 to /24 (Google caps user-managed Services ranges at /16). Must not overlap the VPC, podsCidr, or 172.17.0.0/16 (for AKS also 172.30.0.0/16 and 172.31.0.0/16). Generated if omitted; a blank value is rejected. Pass your current range to keep it stable: it cannot change after cluster creation."
                  },
                  availabilityZones: {
                    type: "array",
                    minItems: 1,
                    maxItems: 6,
                    uniqueItems: true,
                    items: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", maxLength: 64 },
                    example: ["ap-northeast-1a", "ap-northeast-1c"],
                    description: "Optional zone names, assigned round-robin (EKS and generic Kubernetes; EKS needs at least two). Rejected for GKE and AKS, whose subnets are regional. Generated EKS names follow {region}{letter}, but available letters vary by region and account, so pass the zones your account has (e.g. from data.aws_availability_zones). EKS refuses cluster subnets in AZ IDs use1-az3, usw1-az2 and cac1-az3; exclude them."
                  },
                  networkMode: {
                    type: "string",
                    enum: ["public", "private"],
                    default: "public",
                    description: "public: public subnets for internet-facing load balancers and NAT. private: no public subnets; internal load-balancer subnets instead (GKE: the region's proxy-only subnet; AKS: one internal LB subnet; EKS: internal-elb subnets in each AZ), with egress outside the layout (Cloud NAT, an Azure NAT gateway, or for EKS a transit gateway to an egress VPC or VPC endpoints)."
                  },
                  deploymentName: {
                    type: "string",
                    maxLength: 128,
                    example: "prod-us-east-1",
                    description: "Optional reference name for deployment"
                  }
                }
              },
              examples: exampleEntries((example) => example.request)
            }
          }
        },
        parameters: [
          {
            name: "format",
            in: "query",
            description: "Output format",
            schema: {
              type: "string",
              enum: ["json", "yaml"],
              default: "json"
            }
          }
        ],
        responses: {
          "200": {
            description: "Network plan generated successfully",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/NetworkPlan"
                },
                examples: exampleEntries((example) => buildKubernetesNetworkPlan(example.request, EXAMPLE_TIME))
              },
              "application/yaml": {
                schema: {
                  $ref: "#/components/schemas/NetworkPlan"
                }
              }
            }
          },
          "400": {
            description: "Invalid request parameters (follows ?format=), or a malformed JSON body (always JSON)",
            content: errorContent
          },
          "413": payloadTooLargeResponse,
          "415": unsupportedMediaTypeResponse,
          "429": rateLimitedResponse,
          "500": {
            description: "Internal server error",
            content: errorContent
          }
        }
      }
    },
    "/k8s/tiers": {
      get: {
        tags: ["Kubernetes"],
        operationId: "getDeploymentTiers",
        summary: "Get deployment tier information",
        description: "Retrieve every deployment tier's layout (micro, standard, professional, enterprise, hyperscale) as the generator applies it for a provider: subnet counts and sizes (public, node, control plane), pod and service prefixes, and the exact minimum VPC prefix that fits them",
        parameters: [
          {
            name: "provider",
            in: "query",
            description: "Provider whose layout to return. EKS raises every subnet type to at least two (two AZs); GKE and AKS use one regional control-plane range.",
            schema: {
              type: "string",
              enum: ["eks", "gke", "aks", "kubernetes", "k8s"],
              default: "kubernetes"
            }
          },
          {
            name: "networkMode",
            in: "query",
            description: "public (default) or private: private replaces public subnets with internal load-balancer subnets.",
            schema: {
              type: "string",
              enum: ["public", "private"],
              default: "public"
            }
          },
          {
            name: "format",
            in: "query",
            description: "Output format",
            schema: {
              type: "string",
              enum: ["json", "yaml"],
              default: "json"
            }
          }
        ],
        responses: {
          "200": {
            description: "Tier information retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: {
                    $ref: "#/components/schemas/TierInfo"
                  }
                },
                examples: {
                  generic: { summary: "Generic Kubernetes (default)", value: getDeploymentTierInfo() },
                  eks: { summary: "EKS (?provider=eks): public and node subnets in at least two AZs, a two-subnet control plane", value: getDeploymentTierInfo(undefined, "eks") },
                  gke_private: { summary: "GKE private (?provider=gke&networkMode=private)", value: getDeploymentTierInfo(undefined, "gke", "private") }
                }
              }
            }
          },
          "400": {
            description: "Invalid provider or networkMode",
            content: errorContent
          },
          "429": rateLimitedResponse,
          "500": {
            description: "Internal server error",
            content: errorContent
          }
        }
      }
    }
  },
  components: {
    schemas: {
      NetworkPlan: {
        type: "object",
        description: "Complete Kubernetes network layout. Public or internal load-balancer, node (private), and control-plane subnets sit inside the VPC; pods and services sit outside it. No two ranges overlap.",
        properties: {
          deploymentSize: { type: "string", enum: ["micro", "standard", "professional", "enterprise", "hyperscale"], example: "enterprise" },
          provider: { type: "string", enum: ["eks", "gke", "aks", "kubernetes"], example: "eks" },
          networkMode: { type: "string", enum: ["public", "private"], example: "public" },
          region: { type: "string", description: "Cloud region/location (provider-specific format)", example: "us-east-1" },
          deploymentName: { type: "string", description: "Optional deployment reference name", example: "prod-eks-us-east-1" },
          vpc: {
            type: "object",
            description: "VPC/VNet configuration",
            properties: {
              cidr: { type: "string", example: "10.100.0.0/18", description: "VPC CIDR block (RFC 1918 private range)" }
            }
          },
          subnets: {
            type: "object",
            description: "Subnets inside the VPC, placed first-fit at aligned offsets",
            properties: {
              public: {
                type: "array",
                description: "Public subnets for internet-facing load balancers, NAT gateways, bastion hosts. Empty in private mode.",
                items: { $ref: "#/components/schemas/Subnet" }
              },
              private: {
                type: "array",
                description: "Private subnets for Kubernetes worker nodes",
                items: { $ref: "#/components/schemas/Subnet" }
              },
              loadBalancer: {
                type: "array",
                description: "Internal load-balancer subnets, private mode only (empty in public mode). GKE: one regional proxy-only subnet (purpose REGIONAL_MANAGED_PROXY) for internal Application Load Balancers and Gateway; only one can be active per region and network. AKS: one subnet for internal load balancer frontends. EKS: one per AZ (at least two), tagged kubernetes.io/role/internal-elb. Generic: one per zone.",
                items: { $ref: "#/components/schemas/Subnet" }
              },
              controlPlane: {
                type: "array",
                description: "The control-plane network. GKE: one /28 for private_cluster_config.master_ipv4_cidr_block (or a private_endpoint_subnetwork). AKS: one /28 for API Server VNet Integration. Generic: one /28 for control-plane nodes and a floating API server address. EKS: one /27 split into two /28s in two AZs (EKS requires two) for vpc_config.subnet_ids.",
                items: { $ref: "#/components/schemas/Subnet" }
              }
            }
          },
          pods: {
            type: "object",
            description: "Pod network, outside the VPC. GKE: the pod secondary range. AKS: the CNI Overlay pod_cidr (each node takes a fixed /24). EKS: an overlay CNI pool (Calico, Cilium); a generated range in another RFC 1918 block cannot be a VPC secondary CIDR, because AWS refuses CIDRs from a different RFC 1918 block than the VPC's (VPC CNI custom networking needs a /16-to-/28 podsCidr AWS can associate with the VPC: 100.64.0.0/10 (recommended) or another range in the VPC's own RFC 1918 block).",
            properties: {
              cidr: {
                type: "string",
                example: "172.16.0.0/16",
                description: "Pod CIDR. Unless podsCidr was supplied, generated in an RFC 1918 block used by neither the VPC nor a supplied servicesCidr (preferring 10.0.0.0/8), or in 100.64.0.0/10 when none has room (AKS hyperscale on a 10.x VNet), clear of 172.17.0.0/16 and, for AKS, 172.30.0.0/16 and 172.31.0.0/16."
              }
            }
          },
          services: {
            type: "object",
            description: "Kubernetes service (ClusterIP) network, outside the VPC and the pod range. Immutable after cluster creation.",
            properties: {
              cidr: {
                type: "string",
                example: "192.168.0.0/20",
                description: "Service CIDR: /20 (4,096 ClusterIPs), /18 for hyperscale. Generated in an RFC 1918 block used by neither the VPC nor the pods (preferring 192.168.0.0/16), unless servicesCidr was supplied. Meets EKS (RFC 1918, /12-/24), AKS (smaller than /12) and GKE (/16 or smaller) rules.",
                pattern: "^(10\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.|192\\.168\\.).+/(1[3-9]|2[0-4])$"
              }
            }
          },
          warnings: {
            type: "array",
            items: { type: "string" },
            description: "Non-fatal issues with the requested ranges, such as a VPC that overlaps 172.17.0.0/16. Omitted when there are none."
          },
          metadata: {
            type: "object",
            description: "Generation metadata",
            properties: {
              generatedAt: { type: "string", format: "date-time", example: "2026-10-02T12:00:00.000Z" },
              version: { type: "string", example: "2.0", description: "Plan format and allocation rules version" }
            }
          }
        }
      },
      Subnet: {
        type: "object",
        description: "Individual subnet within the VPC",
        properties: {
          cidr: { type: "string", example: "10.0.0.0/24", description: "Subnet CIDR block" },
          name: { type: "string", example: "public-1", description: "Subnet identifier (public-N, private-N, load-balancer-N, or control-plane-N)" },
          type: { type: "string", enum: ["public", "private", "load-balancer", "control-plane"], description: "Public (internet-facing), private (nodes), load-balancer (internal, private mode), or control-plane" },
          availabilityZone: {
            type: "string",
            description: "Zone for this subnet. EKS: {region}{letter} (e.g. us-east-1a) or the caller's availabilityZones. Generic: zone-N. Omitted for GKE and AKS, whose subnets are regional.",
            example: "us-east-1a"
          }
        },
        example: {
          cidr: "10.0.0.0/24",
          name: "public-1",
          type: "public",
          availabilityZone: "us-east-1a"
        }
      },
      TierInfo: {
        type: "object",
        properties: {
          networkMode: { type: "string", enum: ["public", "private"], example: "public" },
          publicSubnets: { type: "integer", example: 3, description: "Number of public subnets (0 in private mode)" },
          loadBalancerSubnets: { type: "integer", example: 0, description: "Number of internal load-balancer subnets (private mode only)" },
          privateSubnets: { type: "integer", example: 3, description: "Number of private subnets (for worker nodes)" },
          controlPlaneSubnets: { type: "integer", example: 2, description: "Number of control-plane subnets: 2 for EKS (one /27 across two AZs), 1 otherwise" },
          publicSubnetSize: { type: "integer", example: 24, description: "CIDR prefix for public subnets (e.g., 24 = /24)" },
          privateSubnetSize: { type: "integer", example: 21, description: "CIDR prefix for private subnets (e.g., 21 = /21)" },
          loadBalancerSubnetSize: { type: "integer", example: 24, description: "CIDR prefix for internal load-balancer subnets (same as publicSubnetSize)" },
          controlPlaneSubnetSize: { type: "integer", example: 28, description: "CIDR prefix for control-plane subnets (always 28)" },
          podsPrefix: { type: "integer", example: 16, description: "CIDR prefix for the pod network (node capacity at a /24 per node: 2^(24 - podsPrefix))" },
          servicesPrefix: { type: "integer", example: 20, description: "CIDR prefix for Kubernetes services (ClusterIP range)" },
          minVpcPrefix: { type: "integer", example: 19, description: "Largest VPC prefix (smallest VPC) that fits every subnet, computed from the actual layout" },
          description: { type: "string", example: "Large Production: 10-50 nodes, triple AZ ready with HA" }
        }
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string", enum: ["INVALID_REQUEST", "NETWORK_GENERATION_ERROR", "NOT_FOUND", "RATE_LIMITED", "INTERNAL_ERROR"] }
        }
      }
    }
  }
};
