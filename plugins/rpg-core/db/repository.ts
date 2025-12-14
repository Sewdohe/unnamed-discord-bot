import { sql } from "drizzle-orm";
import type { PluginContext } from "@types";

// ============ Types ============

export interface PlayerProfile {
    id: number;
    name: string;
    level: number;
    health: number;
    experience: number;
    rpgClass: RPGClass;
    strength: number;
    agility: number;
    intelligence: number;
    vitality: number;
    created_at: string;
    updated_at: string;
}

export type RPGClass = "Warrior" | "Rogue" | "Mage" | "Healer";

// ============ Database Initialization ============

export async function initDatabase(ctx: PluginContext): Promise<void> {
    const table = `${ctx.dbPrefix}rpg_profiles`;

    ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      health INTEGER NOT NULL DEFAULT 100,
      experience INTEGER NOT NULL DEFAULT 0,
      rpgClass TEXT NOT NULL,
      strength INTEGER NOT NULL DEFAULT 1,
      agility INTEGER NOT NULL DEFAULT 1,
      intelligence INTEGER NOT NULL DEFAULT 1,
      vitality INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));

    ctx.logger.debug(`Initialized table: ${table}`);
}

// ============ Repository Functions ============

export function createUser(
    ctx: PluginContext,
    userData: PlayerProfile,
): number {
    const table = `${ctx.dbPrefix}cases`;

    ctx.db.run(sql.raw(`
    INSERT INTO ${table} (id, name, level, health, experience, rpgClass, strength, agility, intelligence, vitality)
    VALUES (
        ${userData.id},
        '${userData.name}',
        ${userData.level},
        ${userData.health},
        ${userData.experience},
        ${userData.rpgClass},
        ${userData.strength},
        ${userData.agility},
        ${userData.intelligence},
        ${userData.vitality}
    )
  `));

    const result = ctx.db.get<{ id: number }>(
        sql.raw(`SELECT last_insert_rowid() as id`)
    );

    return result?.id ?? 0;
}

export function getUserProfile(ctx: PluginContext, userId: number): PlayerProfile | null {
    const table = `${ctx.dbPrefix}cases`;

    return ctx.db.get<PlayerProfile>(
        sql.raw(`SELECT * FROM ${table} WHERE id = ${userId}`)
    ) ?? null;
}

export function getUserProfiles(ctx: PluginContext, userId: string): PlayerProfile[] {
    const table = `${ctx.dbPrefix}cases`;

    return ctx.db.all<PlayerProfile>(
        sql.raw(`SELECT * FROM ${table} WHERE id = '${userId}' ORDER BY created_at DESC`)
    ) ?? [];
}

export function updatePlayerProfile(ctx: PluginContext, userId: number, newProfile: Partial<PlayerProfile>): boolean {
    const table = `${ctx.dbPrefix}rpg_profiles`;

    const oldProfileData = getUserProfile(ctx, userId);
    if (!oldProfileData) return false;

    ctx.db.run(sql.raw(`
    UPDATE ${table}
    SET
      name = '${newProfile.name ?? oldProfileData.name}',
      level = ${newProfile.level ?? oldProfileData.level},
      health = ${newProfile.health ?? oldProfileData.health},
      experience = ${newProfile.experience ?? oldProfileData.experience},
      rpgClass = '${newProfile.rpgClass ?? oldProfileData.rpgClass}',
      strength = ${newProfile.strength ?? oldProfileData.strength},
      agility = ${newProfile.agility ?? oldProfileData.agility},
      intelligence = ${newProfile.intelligence ?? oldProfileData.intelligence},
      vitality = ${newProfile.vitality ?? oldProfileData.vitality},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${userId}
  `));

    return true;
}
