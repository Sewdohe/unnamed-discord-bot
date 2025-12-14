import { sql } from "drizzle-orm";
import type { PluginContext } from "@types";

// ============ Types ============

export interface PlayerProfile {
    id: number;
    discord_id: string;
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
            discord_id TEXT NOT NULL,
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

    // Perform simple migration checks for missing columns. SQLite's ALTER TABLE can only add columns.
    try {
        const columns = ctx.db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${table});`));
        const colNames = new Set(columns.map(c => c.name));
        const expected: { name: string; def: string }[] = [
            { name: "discord_id", def: "TEXT DEFAULT ''" },
            { name: "name", def: "TEXT DEFAULT ''" },
            { name: "level", def: "INTEGER DEFAULT 1" },
            { name: "health", def: "INTEGER DEFAULT 100" },
            { name: "experience", def: "INTEGER DEFAULT 0" },
            { name: "rpgClass", def: "TEXT DEFAULT ''" },
            { name: "strength", def: "INTEGER DEFAULT 1" },
            { name: "agility", def: "INTEGER DEFAULT 1" },
            { name: "intelligence", def: "INTEGER DEFAULT 1" },
            { name: "vitality", def: "INTEGER DEFAULT 1" },
            { name: "created_at", def: "DATETIME DEFAULT CURRENT_TIMESTAMP" },
            { name: "updated_at", def: "DATETIME DEFAULT CURRENT_TIMESTAMP" },
        ];
        for (const col of expected) {
            if (!colNames.has(col.name)) {
                ctx.db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.def};`));
                ctx.logger.debug(`Added missing column ${col.name} on ${table}`);
            }
        }
    } catch (e) {
        // Ignore migrations when running in environments that don't allow PRAGMA or if something else fails
    }
}

// ============ Repository Functions ============

export function createUser(
    ctx: PluginContext,
    userData: Omit<PlayerProfile, 'id' | 'created_at' | 'updated_at'>,
): number {
    const table = `${ctx.dbPrefix}rpg_profiles`;

    // Use parameterized query via drizzle `sql` template strings to avoid SQL injection and incorrect quoting
    ctx.db.run(sql`INSERT INTO ${sql.raw(table)} (discord_id, name, level, health, experience, rpgClass, strength, agility, intelligence, vitality)
    VALUES (${userData.discord_id}, ${userData.name}, ${userData.level}, ${userData.health}, ${userData.experience}, ${userData.rpgClass}, ${userData.strength}, ${userData.agility}, ${userData.intelligence}, ${userData.vitality})`);

    const result = ctx.db.get<{ id: number }>(
        sql.raw(`SELECT last_insert_rowid() as id`)
    );

    return result?.id ?? 0;
}

export function getUserProfile(ctx: PluginContext, userId: number): PlayerProfile | null {
    const table = `${ctx.dbPrefix}rpg_profiles`;

    return ctx.db.get<PlayerProfile>(
        sql`SELECT * FROM ${sql.raw(table)} WHERE id = ${userId}`
    ) ?? null;
}

export function getUserProfiles(ctx: PluginContext, userId: string): PlayerProfile[] {
    const table = `${ctx.dbPrefix}rpg_profiles`;

    return ctx.db.all<PlayerProfile>(
        sql`SELECT * FROM ${sql.raw(table)} WHERE discord_id = ${userId} ORDER BY created_at DESC`
    ) ?? [];
}

export function updatePlayerProfile(ctx: PluginContext, userId: number, newProfile: Partial<PlayerProfile>): boolean {
    const table = `${ctx.dbPrefix}rpg_profiles`;

    const oldProfileData = getUserProfile(ctx, userId);
    if (!oldProfileData) return false;

        // Parameterized update
        ctx.db.run(sql`UPDATE ${sql.raw(table)}
        SET
            name = ${newProfile.name ?? oldProfileData.name},
            level = ${newProfile.level ?? oldProfileData.level},
            health = ${newProfile.health ?? oldProfileData.health},
            experience = ${newProfile.experience ?? oldProfileData.experience},
            rpgClass = ${newProfile.rpgClass ?? oldProfileData.rpgClass},
            strength = ${newProfile.strength ?? oldProfileData.strength},
            agility = ${newProfile.agility ?? oldProfileData.agility},
            intelligence = ${newProfile.intelligence ?? oldProfileData.intelligence},
            vitality = ${newProfile.vitality ?? oldProfileData.vitality},
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${userId}`);

    return true;
}
