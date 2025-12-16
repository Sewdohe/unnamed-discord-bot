import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { Collection, Document, ObjectId, OptionalId } from "mongodb";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import { z } from "zod";

// ============ Data Types ============

/**
 * RPG profile interface - extends Document for MongoDB compatibility
 */
export interface RPGPlayer extends Document {
  _id?: ObjectId;
  user_id: string;
  name: string;
  rpgClass: RPGClass;
  level: number;
  experience: number;
  health: number;
  maxHealth: number;
  mana: number;
  strength: number;
  agility: number;
  intelligence: number;
  vitality: number;
  created_at: Date;
  updated_at: Date;
}

export interface RPGClass {
  name: string;
  description: string;
  baseHealth: number;
  baseMana: number;
  baseStrength: number;
  baseAgility: number;
  baseIntelligence: number;
  baseVitality: number;
  spells: Spell[];
}

export interface Spell {
  _id?: ObjectId;
  name: string;
  description: string;
  mana_cost: number;
  damage: number;
  effects: string;
  created_at: Date;
  updated_at: Date;
}

const WarriorClass: RPGClass = {
  name: "Warrior",
  description: "A strong melee fighter with high health and strength.",
  baseHealth: 150,
  baseMana: 50,
  baseStrength: 10,
  baseAgility: 5,
  baseIntelligence: 3,
  baseVitality: 8,
  spells: [],
};

const MageClass: RPGClass = {
  name: "Mage",
  description: "A powerful spellcaster with high intelligence and mana.",
  baseHealth: 100,
  baseMana: 150,
  baseStrength: 3,
  baseAgility: 5,
  baseIntelligence: 10,
  baseVitality: 5,
  spells: [],
};

const RogueClass: RPGClass = {
  name: "Rogue",
  description: "A stealthy fighter with high agility and critical strikes.",
  baseHealth: 120,
  baseMana: 80,
  baseStrength: 7,
  baseAgility: 10,
  baseIntelligence: 5,
  baseVitality: 6,
  spells: [],
};

const ClericClass: RPGClass = {
  name: "Cleric",
  description: "A holy healer with balanced stats and supportive spells.",
  baseHealth: 130,
  baseMana: 120,
  baseStrength: 5,
  baseAgility: 5,
  baseIntelligence: 7,
  baseVitality: 7,
  spells: [],
};

const HumanClass: RPGClass = {
  name: "Human",
  description: "The default class with balanced attributes.",
  baseHealth: 100,
  baseMana: 100,
  baseStrength: 0,
  baseAgility: 0,
  baseIntelligence: 0,
  baseVitality: 0,
  spells: [],
};  

export const RPGClasses = {
  Warrior: WarriorClass,
  Mage: MageClass,
  Rogue: RogueClass,
  Cleric: ClericClass,
  Human: HumanClass,
};

// ============ Repository ============

/**
 * repository with common CRUD operations
 * Demonstrates MongoDB usage with the repository pattern
 */
export class RPGPlayerRepository extends BaseRepository<RPGPlayer> {
  constructor(collection: Collection<RPGPlayer>) {
    super(collection);
  }

  /**
   * Create a new RPG profile for a user
   */
  async createRPGProfile(profile: RPGPlayer): Promise<string> {
    const result = await this.collection.insertOne({
      ...profile,
      created_at: new Date(),
      updated_at: new Date(),
    } as OptionalId<RPGPlayer>);

    return result.insertedId.toString();
  }

  /**
   * Get an player by MongoDB ObjectId
   */
  async getRPGProfile(user_id: string): Promise<RPGPlayer | null> {
    return await this.find(user_id);
  }

  async getRPGProfileByDiscordID(discord_id: string): Promise<RPGPlayer | null> {
    return await this.findBy("discord_id", discord_id);
  }

  /**
   * Get all RPG players for a user
   */
  async getUserRPGProfiles(userId: string): Promise<RPGPlayer[]> {
    return await this.query()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'DESC')
      .all();
  }

  /**
   * Find RPG profiles by name (case-insensitive)
   */
  async findRPGProfilesByName(userId: string, searchTerm: string): Promise<RPGPlayer[]> {
    return await this.collection.find({
      user_id: userId,
      name: { $regex: searchTerm, $options: 'i' }
    }).toArray();
  }

  /**
   * Update player experience
   */
  async updatePlayerExperience(playerId: string, experience: number): Promise<boolean> {
    return await this.update(playerId, {
      experience,
      updated_at: new Date()
    } as any);
  }

  async updatePlayerClass(playerId: ObjectId, rpgClass: RPGClass): Promise<boolean> {
    return await this.update(playerId, {
      rpgClass,
      updated_at: new Date()
    } as any);
  }

  async updatePlayer(docId: ObjectId, player: Partial<RPGPlayer>): Promise<boolean> {
    return await this.update(docId, {
      ...player,
      updated_at: new Date()
    } as any);
  }

  async updatePlayerHealth(playerId: string, health: number): Promise<boolean> {
    return await this.update(playerId, {
      health,
      updated_at: new Date()
    } as any);
  }

  /**
   * Transfer item to another user
   */
  // async transferItem(itemId: string, newUserId: string): Promise<boolean> {
  //   return await this.update(itemId, {
  //     user_id: newUserId,
  //     updated_at: new Date()
  //   } as any);
  // }

  /**
   * Count items for a user
   */
  // async countUserItems(userId: string): Promise<number> {
  //   return await this.query()
  //     .where('user_id', '=', userId)
  //     .count();
  // }
}

// ============ Factory Function ============

/**
 * Initialize the database collection and create repository instance
 * This is the recommended pattern for setting up your plugin's database
 */
export function createRPGProfileRepository(
  ctx: PluginContext,
  api: CoreUtilsAPI
): RPGPlayerRepository {
  // Get MongoDB collection (automatically created on first insert)
  const collection = api.database.getCollection<RPGPlayer>(ctx, 'rpg_profiles');

  // Create indexes for better query performance
  // Unique index prevents duplicate item names per user
  collection.createIndex(
    { user_id: 1, name: 1 },
    { unique: true }
  ).catch(() => { });

  // Index for sorting by creation date
  collection.createIndex(
    { user_id: 1, created_at: -1 }
  ).catch(() => { });

  // Optional: Create schema validator for runtime validation
  const validator = api.database.createValidator(
    z.object({
      user_id: z.string(),
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      quantity: z.number().int().min(0),
      created_at: z.date(),
      updated_at: z.date(),
    })
  );

  // Return repository instance
  return new RPGPlayerRepository(collection);
}

/**
 * Initialize database (MongoDB collections are auto-created, so this is optional)
 * You can use this function to set up any initial data or perform migrations
 */
export async function initDatabase(ctx: PluginContext): Promise<void> {
  ctx.logger.debug("MongoDB collections auto-created - no initialization needed");

  // Example: You could seed initial data here
  // const collection = api.database.getCollection<Item>(ctx, 'items');
  // await collection.insertOne({ ... });
}
