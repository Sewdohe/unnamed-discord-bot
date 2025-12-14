import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import { sql } from "drizzle-orm";

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

// ============ Repository ============

export class RPGRepository extends BaseRepository<PlayerProfile> {
  constructor(
    db: BunSQLiteDatabase,
    tableName: string
  ) {
    super(db, tableName, 'id');
  }

  /**
   * Create a new player profile
   */
  createProfile(userData: Omit<PlayerProfile, 'id' | 'created_at' | 'updated_at'>): number {
    const query = sql`INSERT INTO ${sql.raw(this.tableName)} (discord_id, name, level, health, experience, rpgClass, strength, agility, intelligence, vitality)
    VALUES (${userData.discord_id}, ${userData.name}, ${userData.level}, ${userData.health}, ${userData.experience}, ${userData.rpgClass}, ${userData.strength}, ${userData.agility}, ${userData.intelligence}, ${userData.vitality})`;

    this.db.run(query);

    const result = this.db.get<{ id: number }>(sql.raw('SELECT last_insert_rowid() as id'));
    return result?.id ?? 0;
  }

  /**
   * Get a player profile by ID
   */
  getProfile(userId: number): PlayerProfile | null {
    return this.find(userId);
  }

  /**
   * Get all profiles for a Discord user
   */
  getProfilesByDiscordId(discordId: string): PlayerProfile[] {
    return this.query()
      .where('discord_id', '=', discordId)
      .orderBy('created_at', 'DESC')
      .all();
  }

  /**
   * Update a player profile
   */
  updateProfile(userId: number, newProfile: Partial<PlayerProfile>): boolean {
    const oldProfile = this.getProfile(userId);
    if (!oldProfile) return false;

    // Build update data with merged values
    const updateData: Partial<PlayerProfile> = {};

    if (newProfile.name !== undefined) updateData.name = newProfile.name;
    if (newProfile.level !== undefined) updateData.level = newProfile.level;
    if (newProfile.health !== undefined) updateData.health = newProfile.health;
    if (newProfile.experience !== undefined) updateData.experience = newProfile.experience;
    if (newProfile.rpgClass !== undefined) updateData.rpgClass = newProfile.rpgClass;
    if (newProfile.strength !== undefined) updateData.strength = newProfile.strength;
    if (newProfile.agility !== undefined) updateData.agility = newProfile.agility;
    if (newProfile.intelligence !== undefined) updateData.intelligence = newProfile.intelligence;
    if (newProfile.vitality !== undefined) updateData.vitality = newProfile.vitality;

    // Use query builder for safe update
    this.query()
      .where('id', '=', userId)
      .update(updateData)
      .execute();

    // Update the updated_at timestamp separately (not part of the partial data)
    this.db.run(sql`UPDATE ${sql.raw(this.tableName)} SET updated_at = CURRENT_TIMESTAMP WHERE id = ${userId}`);

    return true;
  }
}

// ============ Factory Function ============

/**
 * Create an RPG repository
 */
export function createRPGRepo(
  ctx: PluginContext,
  api: CoreUtilsAPI
): RPGRepository {
  const tableName = `${ctx.dbPrefix}rpg_profiles`;
  return new RPGRepository(ctx.db, tableName);
}

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
