/**
 * server/openapi.ts
 * 
 * OpenAPI 3.0 specification for CIDR Subnet Calculator API.
 * Provides interactive API documentation via Swagger UI.
 * 
 * Security: Minimal implementation, no authentication required
 * (API endpoints are stateless and perform only calculations)
 */

export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "CIDR Subnet Calculator API",
    version: "1.0.0",
    description: "REST API for subnet calculations and Kubernetes network planning. Generate optimized network configurations for EKS, GKE, AKS, and self-hosted Kubernetes clusters with battle-tested subnet allocations."
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
                    version: { type: "string", example: "1.0.0" }
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
        summary: "Generate Kubernetes network plan",
        description: "Generate optimized VPC and subnet configuration for Kubernetes clusters. Supports deployment tiers from micro (1 node) to hyperscale (5000 nodes). All VPC CIDRs must use private RFC 1918 ranges.",
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
                    description: "Cloud region/location (provider-specific naming). AWS: {continent}-{direction}-{number} (e.g., us-east-1, eu-west-2). GCP: {continent}-{direction}{number} - NO hyphen before number (e.g., us-central1, europe-west1). Azure: lowercase concatenated (e.g., eastus, westeurope, northcentralus). Uses provider default if omitted.",
                    examples: {
                      eks: "us-east-1",
                      gke: "us-central1",
                      aks: "eastus"
                    }
                  },
                  vpcCidr: {
                    type: "string",
                    pattern: "^(10|172\\.1[6-9]|172\\.2[0-9]|172\\.3[0-1]|192\\.168)\\.",
                    example: "10.0.0.0/16",
                    description: "Private RFC 1918 CIDR (auto-generated if omitted)"
                  },
                  deploymentName: {
                    type: "string",
                    example: "prod-us-east-1",
                    description: "Optional reference name for deployment"
                  }
                }
              },
              examples: {
                eks_production: {
                  summary: "AWS EKS Production (us-east-1)",
                  value: {
                    deploymentSize: "enterprise",
                    provider: "eks",
                    region: "us-east-1",
                    vpcCidr: "10.0.0.0/16",
                    deploymentName: "prod-eks-us-east-1"
                  }
                },
                gke_production: {
                  summary: "GCP GKE Production (us-central1)",
                  value: {
                    deploymentSize: "enterprise",
                    provider: "gke",
                    region: "us-central1",
                    vpcCidr: "10.0.0.0/16",
                    deploymentName: "prod-gke-us-central1"
                  }
                },
                aks_production: {
                  summary: "Azure AKS Production (eastus)",
                  value: {
                    deploymentSize: "enterprise",
                    provider: "aks",
                    region: "eastus",
                    vpcCidr: "10.0.0.0/16",
                    deploymentName: "prod-aks-eastus"
                  }
                },
                hyperscale: {
                  summary: "Hyperscale deployment (500+ nodes)",
                  value: {
                    deploymentSize: "hyperscale",
                    provider: "eks",
                    region: "us-west-2",
                    vpcCidr: "10.100.0.0/16",
                    deploymentName: "hyperscale-eks-us-west-2"
                  }
                }
              }
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
                examples: {
                  eks_enterprise: {
                    summary: "AWS EKS Enterprise Response",
                    value: {
                      deploymentSize: "enterprise",
                      provider: "eks",
                      region: "us-east-1",
                      deploymentName: "prod-eks-us-east-1",
                      vpc: { cidr: "10.0.0.0/16" },
                      subnets: {
                        public: [
                          { cidr: "10.0.0.0/24", name: "public-1", type: "public", availabilityZone: "us-east-1a" },
                          { cidr: "10.0.1.0/24", name: "public-2", type: "public", availabilityZone: "us-east-1b" },
                          { cidr: "10.0.2.0/24", name: "public-3", type: "public", availabilityZone: "us-east-1c" }
                        ],
                        private: [
                          { cidr: "10.0.8.0/21", name: "private-1", type: "private", availabilityZone: "us-east-1a" },
                          { cidr: "10.0.16.0/21", name: "private-2", type: "private", availabilityZone: "us-east-1b" },
                          { cidr: "10.0.24.0/21", name: "private-3", type: "private", availabilityZone: "us-east-1c" }
                        ]
                      },
                      pods: { cidr: "10.1.0.0/16" },
                      services: { cidr: "10.2.0.0/16" },
                      metadata: { generatedAt: "2026-02-04T12:00:00.000Z", version: "1.0" }
                    }
                  },
                  gke_enterprise: {
                    summary: "GCP GKE Enterprise Response",
                    value: {
                      deploymentSize: "enterprise",
                      provider: "gke",
                      region: "us-central1",
                      deploymentName: "prod-gke-us-central1",
                      vpc: { cidr: "10.0.0.0/16" },
                      subnets: {
                        public: [
                          { cidr: "10.0.0.0/24", name: "public-1", type: "public", availabilityZone: "us-central1-a" },
                          { cidr: "10.0.1.0/24", name: "public-2", type: "public", availabilityZone: "us-central1-b" },
                          { cidr: "10.0.2.0/24", name: "public-3", type: "public", availabilityZone: "us-central1-c" }
                        ],
                        private: [
                          { cidr: "10.0.8.0/21", name: "private-1", type: "private", availabilityZone: "us-central1-a" },
                          { cidr: "10.0.16.0/21", name: "private-2", type: "private", availabilityZone: "us-central1-b" },
                          { cidr: "10.0.24.0/21", name: "private-3", type: "private", availabilityZone: "us-central1-c" }
                        ]
                      },
                      pods: { cidr: "10.1.0.0/16" },
                      services: { cidr: "10.2.0.0/16" },
                      metadata: { generatedAt: "2026-02-04T12:00:00.000Z", version: "1.0" }
                    }
                  },
                  aks_enterprise: {
                    summary: "Azure AKS Enterprise Response",
                    value: {
                      deploymentSize: "enterprise",
                      provider: "aks",
                      region: "eastus",
                      deploymentName: "prod-aks-eastus",
                      vpc: { cidr: "10.0.0.0/16" },
                      subnets: {
                        public: [
                          { cidr: "10.0.0.0/24", name: "public-1", type: "public", availabilityZone: "eastus-1" },
                          { cidr: "10.0.1.0/24", name: "public-2", type: "public", availabilityZone: "eastus-2" },
                          { cidr: "10.0.2.0/24", name: "public-3", type: "public", availabilityZone: "eastus-3" }
                        ],
                        private: [
                          { cidr: "10.0.8.0/21", name: "private-1", type: "private", availabilityZone: "eastus-1" },
                          { cidr: "10.0.16.0/21", name: "private-2", type: "private", availabilityZone: "eastus-2" },
                          { cidr: "10.0.24.0/21", name: "private-3", type: "private", availabilityZone: "eastus-3" }
                        ]
                      },
                      pods: { cidr: "10.1.0.0/16" },
                      services: { cidr: "10.2.0.0/16" },
                      metadata: { generatedAt: "2026-02-04T12:00:00.000Z", version: "1.0" }
                    }
                  },
                  micro_minimal: {
                    summary: "Micro Tier (Single Node POC)",
                    value: {
                      deploymentSize: "micro",
                      provider: "kubernetes",
                      region: "default",
                      vpc: { cidr: "10.0.0.0/24" },
                      subnets: {
                        public: [
                          { cidr: "10.0.0.0/26", name: "public-1", type: "public", availabilityZone: "default-a" }
                        ],
                        private: [
                          { cidr: "10.0.0.128/25", name: "private-1", type: "private", availabilityZone: "default-a" }
                        ]
                      },
                      pods: { cidr: "10.1.0.0/18" },
                      services: { cidr: "10.2.0.0/16" },
                      metadata: { generatedAt: "2026-02-04T12:00:00.000Z", version: "1.0" }
                    }
                  }
                }
              },
              "application/yaml": {
                schema: {
                  $ref: "#/components/schemas/NetworkPlan"
                }
              }
            }
          },
          "400": {
            description: "Invalid request parameters",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error"
                }
              }
            }
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/k8s/tiers": {
      get: {
        tags: ["Kubernetes"],
        summary: "Get deployment tier information",
        description: "Retrieve details about all deployment tiers (micro, standard, professional, enterprise, hyperscale) including node counts, subnet sizes, and pod/service CIDR allocations",
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
            description: "Tier information retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: {
                    $ref: "#/components/schemas/TierInfo"
                  }
                },
                example: {
                  micro: {
                    publicSubnets: 1,
                    privateSubnets: 1,
                    publicSubnetSize: 26,
                    privateSubnetSize: 25,
                    minVpcPrefix: 24,
                    podsPrefix: 18,
                    servicesPrefix: 16,
                    description: "Single Node: 1 node, minimal subnet allocation (proof of concept)"
                  },
                  standard: {
                    publicSubnets: 1,
                    privateSubnets: 1,
                    publicSubnetSize: 25,
                    privateSubnetSize: 24,
                    minVpcPrefix: 23,
                    podsPrefix: 16,
                    servicesPrefix: 16,
                    description: "Development/Testing: 1-3 nodes, minimal subnet allocation"
                  },
                  professional: {
                    publicSubnets: 2,
                    privateSubnets: 2,
                    publicSubnetSize: 25,
                    privateSubnetSize: 23,
                    minVpcPrefix: 21,
                    podsPrefix: 16,
                    servicesPrefix: 16,
                    description: "Small Production: 3-10 nodes, dual AZ ready"
                  },
                  enterprise: {
                    publicSubnets: 3,
                    privateSubnets: 3,
                    publicSubnetSize: 24,
                    privateSubnetSize: 21,
                    minVpcPrefix: 18,
                    podsPrefix: 16,
                    servicesPrefix: 16,
                    description: "Large Production: 10-50 nodes, triple AZ ready with HA"
                  },
                  hyperscale: {
                    publicSubnets: 3,
                    privateSubnets: 3,
                    publicSubnetSize: 23,
                    privateSubnetSize: 20,
                    minVpcPrefix: 18,
                    podsPrefix: 13,
                    servicesPrefix: 16,
                    description: "Global Scale: 50-5000 nodes, multi-region ready (EKS/GKE max)"
                  }
                }
              }
            }
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      NetworkPlan: {
        type: "object",
        description: "Complete Kubernetes network configuration including VPC, subnets, pod CIDR, and service CIDR",
        properties: {
          deploymentSize: { type: "string", enum: ["micro", "standard", "professional", "enterprise", "hyperscale"], example: "enterprise" },
          provider: { type: "string", enum: ["eks", "gke", "aks", "kubernetes"], example: "eks" },
          region: { type: "string", description: "Cloud region/location (provider-specific format)", example: "us-east-1" },
          deploymentName: { type: "string", description: "Optional deployment reference name", example: "prod-eks-us-east-1" },
          vpc: {
            type: "object",
            description: "VPC/VNet configuration",
            properties: {
              cidr: { type: "string", example: "10.0.0.0/16", description: "VPC CIDR block (RFC 1918 private range)" }
            }
          },
          subnets: {
            type: "object",
            description: "Public and private subnet allocations across availability zones",
            properties: {
              public: {
                type: "array",
                description: "Public subnets for load balancers, NAT gateways, bastion hosts",
                items: {
                  $ref: "#/components/schemas/Subnet"
                }
              },
              private: {
                type: "array",
                description: "Private subnets for Kubernetes worker nodes",
                items: {
                  $ref: "#/components/schemas/Subnet"
                }
              }
            }
          },
          pods: {
            type: "object",
            description: "Pod network configuration. **EKS Note**: This represents a SEPARATE pod CIDR (Model 2 - Custom CNI or Secondary VPC CIDR), NOT default AWS VPC CNI where pods share VPC subnet IPs. Requires custom CNI plugin (Calico, Cilium) or secondary VPC CIDR blocks.",
            properties: {
              cidr: { 
                type: "string", 
                example: "10.1.0.0/16", 
                description: "CIDR for pod IPs. For EKS: Use with custom CNI (Calico, Cilium, Weave) or secondary VPC CIDR blocks. For GKE/AKS: Always separate from VPC/VNet." 
              }
            }
          },
          services: {
            type: "object",
            description: "Kubernetes service network configuration. **EKS-specific**: Must be RFC 1918 private IP, /24 to /12 prefix, no overlap with VPC/Pod CIDR. Can only be set at cluster creation (immutable).",
            properties: {
              cidr: { 
                type: "string", 
                example: "10.2.0.0/16", 
                description: "Service IPv4 CIDR for Kubernetes ClusterIP services. Defaults: EKS auto-assigns 10.100.0.0/16 or 172.20.0.0/16 if not specified. Our API uses 10.2.0.0/16 to avoid conflicts. **Requirements**: RFC 1918 private IPs only, prefix between /24 and /12, must not overlap with VPC CIDR. **Critical**: Cannot be changed after cluster creation.",
                pattern: "^(10\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.|192\\.168\\.).+/(1[2-9]|2[0-4])$"
              }
            }
          },
          metadata: {
            type: "object",
            description: "Generation metadata",
            properties: {
              generatedAt: { type: "string", format: "date-time", example: "2026-02-04T12:00:00.000Z" },
              version: { type: "string", example: "1.0" }
            }
          }
        },
        example: {
          deploymentSize: "enterprise",
          provider: "eks",
          region: "us-east-1",
          deploymentName: "prod-eks-us-east-1",
          vpc: { cidr: "10.0.0.0/16" },
          subnets: {
            public: [
              { cidr: "10.0.0.0/24", name: "public-1", type: "public", availabilityZone: "us-east-1a" },
              { cidr: "10.0.1.0/24", name: "public-2", type: "public", availabilityZone: "us-east-1b" },
              { cidr: "10.0.2.0/24", name: "public-3", type: "public", availabilityZone: "us-east-1c" }
            ],
            private: [
              { cidr: "10.0.8.0/21", name: "private-1", type: "private", availabilityZone: "us-east-1a" },
              { cidr: "10.0.16.0/21", name: "private-2", type: "private", availabilityZone: "us-east-1b" },
              { cidr: "10.0.24.0/21", name: "private-3", type: "private", availabilityZone: "us-east-1c" }
            ]
          },
          pods: { cidr: "10.1.0.0/16" },
          services: { cidr: "10.2.0.0/16" },
          metadata: { generatedAt: "2026-02-04T12:00:00.000Z", version: "1.0" }
        }
      },
      Subnet: {
        type: "object",
        description: "Individual subnet configuration within the VPC",
        properties: {
          cidr: { type: "string", example: "10.0.0.0/24", description: "Subnet CIDR block" },
          name: { type: "string", example: "public-1", description: "Subnet identifier (public-N or private-N)" },
          type: { type: "string", enum: ["public", "private"], description: "Public (internet-facing) or private (internal only)" },
          availabilityZone: { 
            type: "string", 
            description: "Availability Zone (provider-specific format). AWS: {region}{letter} (e.g., us-east-1a). GCP: {region}-{letter} (e.g., us-central1-a). Azure: {region}-{number} (e.g., eastus-1).",
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
          publicSubnets: { type: "integer", example: 3, description: "Number of public subnets (for load balancers, NAT gateways)" },
          privateSubnets: { type: "integer", example: 3, description: "Number of private subnets (for worker nodes)" },
          publicSubnetSize: { type: "integer", example: 24, description: "CIDR prefix for public subnets (e.g., 24 = /24 = 254 usable IPs)" },
          privateSubnetSize: { type: "integer", example: 21, description: "CIDR prefix for private subnets (e.g., 21 = /21 = 2,046 usable IPs)" },
          minVpcPrefix: { type: "integer", example: 18, description: "Minimum VPC prefix required to fit all subnets" },
          podsPrefix: { type: "integer", example: 16, description: "CIDR prefix for pod network (CNI plugin IP range)" },
          servicesPrefix: { type: "integer", example: 16, description: "CIDR prefix for Kubernetes services (ClusterIP range)" },
          description: { type: "string", example: "Large Production: 10-50 nodes, triple AZ ready with HA" }
        },
        example: {
          publicSubnets: 3,
          privateSubnets: 3,
          publicSubnetSize: 24,
          privateSubnetSize: 21,
          minVpcPrefix: 18,
          podsPrefix: 16,
          servicesPrefix: 16,
          description: "Large Production: 10-50 nodes, triple AZ ready with HA"
        }
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string" }
        }
      }
    }
  }
};
