/**
 * server/storage.ts
 * 
 * Storage abstraction layer providing a standard interface for data persistence.
 * Currently implements in-memory storage (MemStorage) suitable for stateless calculations.
 * 
 * Future PostgreSQL support:
 * - The shared/schema.ts file contains Drizzle ORM setup for PostgreSQL
 * - A PostgresStorage class can be added here to implement IStorage interface
 * - Add methods to IStorage as needed when database integration is required
 */

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // Add storage methods here as needed
}

export class MemStorage implements IStorage {
  constructor() {
    // Initialize storage
  }
}

export const storage = new MemStorage();
