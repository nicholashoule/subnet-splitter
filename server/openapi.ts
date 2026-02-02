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
    description: "REST API for subnet calculations and Kubernetes network planning"
  },
  servers: [
    {
      url: "/api/v1",
      description: "API v1"
    }
  ],
  tags: [
    {
      name: "Health",
      description: "Health check endpoints for monitoring"
    },
    {
      name: "Kubernetes",
      description: "Kubernetes network planning operations"
    }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description: "Check if the service is healthy and operational",
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
    "/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness check",
        description: "Check if the service is ready to accept requests",
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
    "/health/live": {
      get: {
        tags: ["Health"],
        summary: "Liveness check",
        description: "Check if the service process is alive",
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
    "/kubernetes/network-plan": {
      post: {
        tags: ["Kubernetes"],
        summary: "Generate Kubernetes network plan",
        description: "Generate optimized network configuration for EKS, GKE, AKS, or generic Kubernetes deployments",
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
                    enum: ["eks", "gke", "aks", "kubernetes"],
                    default: "kubernetes",
                    description: "Cloud provider or generic Kubernetes"
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
    "/kubernetes/tiers": {
      get: {
        tags: ["Kubernetes"],
        summary: "Get deployment tier information",
        description: "Retrieve details about all available deployment tiers",
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
          availabilityZone: { type: "string" }
        }
      },
      TierInfo: {
        type: "object",
        properties: {
          publicSubnets: { type: "integer" },
          privateSubnets: { type: "integer" },
          subnetSize: { type: "integer" },
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
