/**
 * server/storage.ts
 * 
 * Storage abstraction layer providing a standard interface for data persistence.
 * Currently implements in-memory storage (MemStorage) suitable for stateless calculations.
 *
 * A database-backed storage class can be added here to implement IStorage
 * if persistence is ever required.
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
