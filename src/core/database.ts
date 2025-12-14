import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { createLogger } from "./logger";

const logger = createLogger("database");

const DB_PATH = join(process.cwd(), "data", "bot.db");

export function initDatabase() {
  // Ensure data directory exists
  const dataDir = join(process.cwd(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  logger.info(`Initializing database at ${DB_PATH}`);

  const sqlite = new Database(DB_PATH);
  
  // Enable WAL mode for better concurrent access
  sqlite.exec("PRAGMA journal_mode = WAL");

  const db = drizzle(sqlite);

  return db;
}

/**
 * Helper to create a prefixed table name for plugins
 */
export function prefixTable(pluginName: string, tableName: string): string {
  const prefix = pluginName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `${prefix}_${tableName}`;
}
