/**
 * server/routes.ts
 * 
 * API route registration. Centralized location for all Express route definitions.
 * 
 * All routes should:
 * - Be prefixed with /api
 * - Use the storage instance for data operations
 * - Return appropriate HTTP status codes and error responses
 * - Include input validation using Zod schemas from shared/schema.ts
 */

import type { Express } from "express";
import type { Server } from "http";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  return httpServer;
}
