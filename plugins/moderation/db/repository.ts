import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { User } from "discord.js";
import { sql } from "drizzle-orm";

// ============ Types ============

export interface ModCase {
  id: number;
  type: string;
  user_id: string;
  user_tag: string;
  moderator_id: string;
  moderator_tag: string;
  reason: string;
  duration: number | null;
  created_at: string;
}

export type CaseType = "kick" | "ban" | "unban" | "timeout" | "warn" | "purge" | "lock" | "unlock" | "automod_filter" | "automod_invite";

// ============ Repository ============

export class ModerationRepository extends BaseRepository<ModCase> {
  constructor(db: BunSQLiteDatabase, tableName: string) {
    super(db, tableName, 'id');
  }

  /**
   * Create a new moderation case
   */
  createCase(
    type: CaseType,
    userId: string,
    userTag: string,
    moderatorId: string,
    moderatorTag: string,
    reason: string,
    duration: number | null = null
  ): number {
    const query = sql`INSERT INTO ${sql.raw(this.tableName)} (type, user_id, user_tag, moderator_id, moderator_tag, reason, duration) VALUES (${type}, ${userId}, ${userTag}, ${moderatorId}, ${moderatorTag}, ${reason}, ${duration})`;
    this.db.run(query);

    const result = this.db.get<{ id: number }>(sql.raw('SELECT last_insert_rowid() as id'));
    return result?.id ?? 0;
  }

  /**
   * Get a case by ID
   */
  getCase(caseId: number): ModCase | null {
    return this.find(caseId);
  }

  /**
   * Get all cases for a user
   */
  getUserCases(userId: string): ModCase[] {
    return this.query()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'DESC')
      .all();
  }

  /**
   * Update the reason for a case
   */
  updateCaseReason(caseId: number, newReason: string): boolean {
    return this.update(caseId, { reason: newReason });
  }
}

// ============ Factory Function ============

/**
 * Create a moderation repository
 */
export function createModerationRepo(
  ctx: PluginContext,
  api: CoreUtilsAPI
): ModerationRepository {
  const tableName = `${ctx.dbPrefix}cases`;
  return new ModerationRepository(ctx.db, tableName);
}

// ============ Database Initialization ============

export async function initDatabase(ctx: PluginContext): Promise<void> {
  const table = `${ctx.dbPrefix}cases`;

  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      moderator_tag TEXT NOT NULL,
      reason TEXT NOT NULL,
      duration INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `));

  ctx.logger.debug(`Initialized table: ${table}`);
}
