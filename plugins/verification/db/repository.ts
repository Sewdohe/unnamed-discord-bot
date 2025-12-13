import { sql } from "drizzle-orm";
import type { PluginContext } from "@types";

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

// ============ Database Initialization ============

export async function initDatabase(ctx: PluginContext): Promise<void> {
  const table = `${ctx.dbPrefix}verifications`;

  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      verified INTEGER DEFAULT 0,
      joined_at TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, guild_id)
    )
  `));

  ctx.logger.debug(`Initialized verification table: ${table}`);
}

// ============ Repository Functions ============

export function createVerificationRepo(ctx: PluginContext) {
  const table = `${ctx.dbPrefix}verifications`;

  return {
    /**
     * Create a new verification record for a user
     */
    create(userId: string, guildId: string): void {
      const now = new Date().toISOString();
      ctx.db.run(sql.raw(`
        INSERT OR IGNORE INTO ${table} (user_id, guild_id, verified, joined_at)
        VALUES ('${userId}', '${guildId}', 0, '${now}')
      `));
    },

    /**
     * Mark a user as verified
     */
    verify(userId: string, guildId: string): void {
      const now = new Date().toISOString();
      ctx.db.run(sql.raw(`
        UPDATE ${table}
        SET verified = 1, verified_at = '${now}'
        WHERE user_id = '${userId}' AND guild_id = '${guildId}'
      `));
    },

    /**
     * Mark a user as unverified
     */
    unverify(userId: string, guildId: string): void {
      ctx.db.run(sql.raw(`
        UPDATE ${table}
        SET verified = 0, verified_at = NULL
        WHERE user_id = '${userId}' AND guild_id = '${guildId}'
      `));
    },

    /**
     * Get verification record for a user
     */
    get(userId: string, guildId: string): VerificationRecord | null {
      return ctx.db.get<VerificationRecord>(
        sql.raw(`SELECT * FROM ${table} WHERE user_id = '${userId}' AND guild_id = '${guildId}'`)
      ) ?? null;
    },

    /**
     * Check if a user is verified
     */
    isVerified(userId: string, guildId: string): boolean {
      const record = this.get(userId, guildId);
      return record?.verified === 1;
    },

    /**
     * Get all unverified users in a guild
     */
    getUnverified(guildId: string): VerificationRecord[] {
      return ctx.db.all<VerificationRecord>(
        sql.raw(`SELECT * FROM ${table} WHERE guild_id = '${guildId}' AND verified = 0 ORDER BY joined_at DESC`)
      ) ?? [];
    },

    /**
     * Get all verified users in a guild
     */
    getVerified(guildId: string): VerificationRecord[] {
      return ctx.db.all<VerificationRecord>(
        sql.raw(`SELECT * FROM ${table} WHERE guild_id = '${guildId}' AND verified = 1 ORDER BY verified_at DESC`)
      ) ?? [];
    },

    /**
     * Delete a verification record
     */
    delete(userId: string, guildId: string): void {
      ctx.db.run(sql.raw(`
        DELETE FROM ${table}
        WHERE user_id = '${userId}' AND guild_id = '${guildId}'
      `));
    },

    /**
     * Get users who joined before a certain time and are still unverified
     */
    getUnverifiedBefore(guildId: string, beforeTimestamp: string): VerificationRecord[] {
      return ctx.db.all<VerificationRecord>(
        sql.raw(`
          SELECT * FROM ${table}
          WHERE guild_id = '${guildId}'
            AND verified = 0
            AND joined_at < '${beforeTimestamp}'
          ORDER BY joined_at ASC
        `)
      ) ?? [];
    },

    /**
     * Get verification statistics for a guild
     */
    getStats(guildId: string): { total: number; verified: number; unverified: number } {
      const result = ctx.db.get<{ total: number; verified: number }>(
        sql.raw(`
          SELECT
            COUNT(*) as total,
            SUM(verified) as verified
          FROM ${table}
          WHERE guild_id = '${guildId}'
        `)
      );

      if (!result) {
        return { total: 0, verified: 0, unverified: 0 };
      }

      return {
        total: Number(result.total) || 0,
        verified: Number(result.verified) || 0,
        unverified: (Number(result.total) || 0) - (Number(result.verified) || 0),
      };
    },
  };
}
