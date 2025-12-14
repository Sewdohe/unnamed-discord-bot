import { BaseRepository } from "../../../src/core/repository";
import type { SchemaValidator, PluginContext } from "@types";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import { z } from "zod";
import { sql } from "drizzle-orm";

// ============ Types ============

export interface VerificationRecord {
  id: number;
  user_id: string;
  guild_id: string;
  verified: number; // SQLite boolean (0 or 1)
  joined_at: string;
  verified_at: string | null;
  created_at: string;
}

// ============ Repository ============

export class VerificationRepository extends BaseRepository<VerificationRecord> {
  constructor(
    db: BunSQLiteDatabase,
    tableName: string,
    primaryKey: string,
    validator?: SchemaValidator<VerificationRecord>
  ) {
    super(db, tableName, primaryKey, validator);
  }

  /**
   * Create a new verification record for a user in a guild
   * Uses INSERT OR IGNORE to avoid errors if record already exists
   */
  createRecord(userId: string, guildId: string): void {
    const now = new Date().toISOString();

    // Use raw SQL for INSERT OR IGNORE (not supported by query builder)
    const query = sql`INSERT OR IGNORE INTO ${sql.raw(this.tableName)} (user_id, guild_id, verified, joined_at) VALUES (${userId}, ${guildId}, ${0}, ${now})`;
    this.db.run(query);
  }

  /**
   * Mark a user as verified in a guild
   */
  verify(userId: string, guildId: string): void {
    const now = new Date().toISOString();
    this.query()
      .where('user_id', '=', userId)
      .where('guild_id', '=', guildId)
      .update({ verified: 1, verified_at: now })
      .execute();
  }

  /**
   * Mark a user as unverified in a guild
   */
  unverify(userId: string, guildId: string): void {
    this.query()
      .where('user_id', '=', userId)
      .where('guild_id', '=', guildId)
      .update({ verified: 0, verified_at: null })
      .execute();
  }

  /**
   * Get a verification record for a user in a guild
   */
  get(userId: string, guildId: string): VerificationRecord | null {
    return this.query()
      .where('user_id', '=', userId)
      .where('guild_id', '=', guildId)
      .first();
  }

  /**
   * Check if a user is verified in a guild
   */
  isVerified(userId: string, guildId: string): boolean {
    const record = this.get(userId, guildId);
    return record?.verified === 1;
  }

  /**
   * Get all unverified users in a guild
   */
  getUnverified(guildId: string): VerificationRecord[] {
    return this.query()
      .where('guild_id', '=', guildId)
      .where('verified', '=', 0)
      .orderBy('joined_at', 'DESC')
      .all();
  }

  /**
   * Get all verified users in a guild
   */
  getVerified(guildId: string): VerificationRecord[] {
    return this.query()
      .where('guild_id', '=', guildId)
      .where('verified', '=', 1)
      .orderBy('verified_at', 'DESC')
      .all();
  }

  /**
   * Delete a verification record
   */
  deleteRecord(userId: string, guildId: string): boolean {
    const exists = this.get(userId, guildId) !== null;
    if (!exists) return false;

    this.query()
      .where('user_id', '=', userId)
      .where('guild_id', '=', guildId)
      .delete()
      .execute();

    return true;
  }

  /**
   * Get all unverified users who joined before a certain timestamp
   */
  getUnverifiedBefore(guildId: string, beforeTimestamp: string): VerificationRecord[] {
    return this.query()
      .where('guild_id', '=', guildId)
      .where('verified', '=', 0)
      .where('joined_at', '<', beforeTimestamp)
      .orderBy('joined_at', 'ASC')
      .all();
  }

  /**
   * Get verification statistics for a guild
   */
  getStats(guildId: string): { total: number; verified: number; unverified: number } {
    const allRecords = this.query()
      .where('guild_id', '=', guildId)
      .all();

    const total = allRecords.length;
    const verified = allRecords.filter(r => r.verified === 1).length;

    return { total, verified, unverified: total - verified };
  }
}

// ============ Factory Function ============

/**
 * Create a verification repository with schema validation
 */
export function createVerificationRepo(
  ctx: PluginContext,
  api: CoreUtilsAPI
): VerificationRepository {
  // Create schema validator
  const validator = api.database.createValidator(
    z.object({
      id: z.number(),
      user_id: api.database.schemas.discordId,
      guild_id: api.database.schemas.discordId,
      verified: api.database.schemas.boolean,
      joined_at: api.database.schemas.timestamp,
      verified_at: api.database.schemas.timestamp.nullable(),
      created_at: api.database.schemas.timestamp,
    })
  );

  // Create repository instance directly
  const tableName = `${ctx.dbPrefix}verifications`;
  return new VerificationRepository(ctx.db, tableName, 'id', validator);
}

// ============ Database Initialization ============

export async function initDatabase(ctx: PluginContext): Promise<void> {
  const table = `${ctx.dbPrefix}verifications`;

  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, guild_id)
    )
  `));

  ctx.logger.debug(`Initialized table: ${table}`);
}
