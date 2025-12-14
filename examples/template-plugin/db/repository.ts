import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { CoreUtilsAPI } from "../../../plugins/core-utils/plugin";
import { sql } from "drizzle-orm";
import { z } from "zod";

// ============ Types ============

export interface Item {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
}

// ============ Repository ============

export class ItemRepository extends BaseRepository<Item> {
  constructor(
    db: BunSQLiteDatabase,
    tableName: string,
    primaryKey: string
  ) {
    super(db, tableName, primaryKey);
  }

  /**
   * Create a new item for a user
   */
  createItem(userId: string, name: string): number {
    const query = sql`INSERT INTO ${sql.raw(this.tableName)} (user_id, name) VALUES (${userId}, ${name})`;
    this.db.run(query);

    const result = this.db.get<{ id: number }>(sql.raw('SELECT last_insert_rowid() as id'));
    return result?.id ?? 0;
  }

  /**
   * Get an item by ID
   */
  getItem(itemId: number): Item | null {
    return this.find(itemId);
  }

  /**
   * Get all items for a user
   */
  getUserItems(userId: string): Item[] {
    return this.query()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'DESC')
      .all();
  }

  /**
   * Delete an item
   */
  deleteItem(itemId: number): boolean {
    return this.delete(itemId);
  }

  /**
   * Transfer item to another user
   */
  transferItem(itemId: number, newUserId: string): boolean {
    return this.update(itemId, { user_id: newUserId });
  }

  /**
   * Count items for a user
   */
  countUserItems(userId: string): number {
    return this.query()
      .where('user_id', '=', userId)
      .count();
  }
}

// ============ Factory Function ============

/**
 * Create an item repository with optional validation
 */
export function createItemRepo(
  ctx: PluginContext,
  api: CoreUtilsAPI
): ItemRepository {
  // Optional: Create schema validator for runtime validation
  const validator = api.database.createValidator(
    z.object({
      id: z.number(),
      user_id: api.database.schemas.discordId,
      name: z.string().min(1).max(100),
      created_at: api.database.schemas.timestamp,
    })
  );

  const tableName = `${ctx.dbPrefix}items`;
  return new ItemRepository(ctx.db, tableName, 'id');
}

// ============ Database Initialization ============

export async function initDatabase(ctx: PluginContext): Promise<void> {
  const table = `${ctx.dbPrefix}items`;

  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `));

  // Create index for faster user queries
  ctx.db.run(sql.raw(`
    CREATE INDEX IF NOT EXISTS idx_${ctx.dbPrefix}items_user_id
    ON ${table}(user_id)
  `));

  ctx.logger.debug(`Initialized table: ${table}`);
}
