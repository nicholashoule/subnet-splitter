// drizzle.config.ts
//
// Documentation:
// This file is a placeholder for Drizzle Kit configuration (database migrations).
//
// Note: Not implemented in this project. The subnet calculator currently uses in-memory storage only.
// Reason: No persistent database is required for the current application features.
// If database support is added in the future, this file can be updated and enabled.
//
// To remove: You may safely delete this file if you do not plan to add a database backend.

import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
