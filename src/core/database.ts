import { MongoClient, Db } from "mongodb";
import { createLogger } from "./logger";

const logger = createLogger("database");

let mongoClient: MongoClient;
let database: Db;

/**
 * Initialize MongoDB connection
 */
export async function initDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DATABASE || "navi-bot";

  logger.info(`Connecting to MongoDB at ${uri.split('@')[1] || 'localhost'}`);

  mongoClient = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    logger.info(`Successfully connected to MongoDB (database: ${dbName})`);

    return database;
  } catch (error) {
    logger.error("Failed to connect to MongoDB:", error);
    throw error;
  }
}

/**
 * Get the initialized database instance
 */
export function getDatabase(): Db {
  if (!database) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return database;
}

/**
 * Close MongoDB connection
 */
export async function closeDatabase(): Promise<void> {
  if (mongoClient) {
    await mongoClient.close();
    logger.info("MongoDB connection closed");
  }
}

/**
 * Helper to create a prefixed collection name for plugins
 * Replaces prefixTable from SQLite version
 */
export function prefixCollection(pluginName: string, collectionName: string): string {
  const prefix = pluginName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `${prefix}_${collectionName}`;
}

// Keep old function name for backward compatibility during migration
export const prefixTable = prefixCollection;
