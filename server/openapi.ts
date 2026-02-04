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
                    description: "Cloud region/location. Provider-specific: AWS (us-east-1), GCP (us-central1), Azure (eastus). Uses provider default if omitted.",
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
        properties: {
          deploymentSize: { type: "string" },
          provider: { type: "string" },
          region: { type: "string", description: "Cloud region/location", example: "us-east-1" },
          deploymentName: { type: "string" },
          vpc: {
            type: "object",
            properties: {
              cidr: { type: "string", example: "10.0.0.0/16" }
            }
          },
          subnets: {
            type: "object",
            properties: {
              public: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/Subnet"
                }
              },
              private: {
                type: "array",
                items: {
                  $ref: "#/components/schemas/Subnet"
                }
              }
            }
          },
          pods: {
            type: "object",
            properties: {
              cidr: { type: "string", example: "10.1.0.0/16" }
            }
          },
          services: {
            type: "object",
            properties: {
              cidr: { type: "string", example: "10.2.0.0/16" }
            }
          },
          metadata: {
            type: "object",
            properties: {
              generatedAt: { type: "string", format: "date-time" },
              version: { type: "string" }
            }
          }
        }
      },
      Subnet: {
        type: "object",
        properties: {
          cidr: { type: "string", example: "10.0.0.0/24" },
          name: { type: "string", example: "public-1" },
          type: { type: "string", enum: ["public", "private"] },
          availabilityZone: { type: "string", example: "us-east-1a" }
        }
      },
      TierInfo: {
        type: "object",
        properties: {
          publicSubnets: { type: "integer" },
          privateSubnets: { type: "integer" },
          publicSubnetSize: { type: "integer", description: "CIDR prefix for public subnets (e.g., 24 for /24)" },
          privateSubnetSize: { type: "integer", description: "CIDR prefix for private subnets (e.g., 20 for /20)" },
          minVpcPrefix: { type: "integer", description: "Minimum VPC prefix required" },
          podsPrefix: { type: "integer" },
          servicesPrefix: { type: "integer" },
          description: { type: "string" }
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
