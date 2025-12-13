import { sql } from "drizzle-orm";
import type { PluginContext } from "@types";
import type { User } from "discord.js";

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

// ============ Repository Functions ============

export function createCase(
  ctx: PluginContext,
  type: CaseType,
  user: User,
  moderator: User,
  reason: string,
  duration: number | null = null
): number {
  const table = `${ctx.dbPrefix}cases`;

  ctx.db.run(sql.raw(`
    INSERT INTO ${table} (type, user_id, user_tag, moderator_id, moderator_tag, reason, duration)
    VALUES (
      '${type}',
      '${user.id}',
      '${user.tag.replace(/'/g, "''")}',
      '${moderator.id}',
      '${moderator.tag.replace(/'/g, "''")}',
      '${reason.replace(/'/g, "''")}',
      ${duration}
    )
  `));

  const result = ctx.db.get<{ id: number }>(
    sql.raw(`SELECT last_insert_rowid() as id`)
  );

  return result?.id ?? 0;
}

export function getCase(ctx: PluginContext, caseId: number): ModCase | null {
  const table = `${ctx.dbPrefix}cases`;

  return ctx.db.get<ModCase>(
    sql.raw(`SELECT * FROM ${table} WHERE id = ${caseId}`)
  ) ?? null;
}

export function getUserCases(ctx: PluginContext, userId: string): ModCase[] {
  const table = `${ctx.dbPrefix}cases`;

  return ctx.db.all<ModCase>(
    sql.raw(`SELECT * FROM ${table} WHERE user_id = '${userId}' ORDER BY created_at DESC`)
  ) ?? [];
}

export function updateCaseReason(ctx: PluginContext, caseId: number, newReason: string): boolean {
  const table = `${ctx.dbPrefix}cases`;

  const existingCase = getCase(ctx, caseId);
  if (!existingCase) return false;

  ctx.db.run(sql.raw(`
    UPDATE ${table}
    SET reason = '${newReason.replace(/'/g, "''")}'
    WHERE id = ${caseId}
  `));

  return true;
}
