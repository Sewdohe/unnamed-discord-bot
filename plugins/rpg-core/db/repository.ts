import { Collection, Document, ObjectId, OptionalId } from "mongodb";
import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

// ============ Types ============

export interface PlayerProfile extends Document {
  _id?: ObjectId;
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
  created_at: Date;
  updated_at: Date;
}

export type RPGClass = "Warrior" | "Rogue" | "Mage" | "Healer";

// ============ Repository ============

export class RPGRepository extends BaseRepository<PlayerProfile> {
  constructor(collection: Collection<PlayerProfile>) {
    super(collection);
  }

  /**
   * Create a new player profile
   */
  async createProfile(userData: Omit<PlayerProfile, '_id' | 'created_at' | 'updated_at'>): Promise<string> {
    const result = await this.collection.insertOne({
      ...userData,
      created_at: new Date(),
      updated_at: new Date(),
    } as OptionalId<PlayerProfile>);

    return result.insertedId.toString();
  }

  /**
   * Get a player profile by Discord ID
   */
  async getProfileByDiscordId(discordId: string): Promise<PlayerProfile | null> {
    return await this.collection.findOne({ discord_id: discordId });
  }

  /**
   * Get a player profile by MongoDB ID
   */
  async getProfile(userId: string): Promise<PlayerProfile | null> {
    return await this.find(userId);
  }

  /**
   * Update a player profile
   */
  async updateProfile(discordId: string, newProfile: Partial<PlayerProfile>): Promise<boolean> {
    const result = await this.collection.updateOne(
      { discord_id: discordId },
      {
        $set: {
          ...newProfile,
          updated_at: new Date(),  // Automatic timestamp!
        }
      }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Get top players by level
   */
  async getTopPlayers(limit: number = 10): Promise<PlayerProfile[]> {
    return await this.query()
      .orderBy('level', 'DESC')
      .limit(limit)
      .all();
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
  const collection = api.database.getCollection<PlayerProfile>(ctx, 'rpg_profiles');

  // Create indexes
  collection.createIndex({ discord_id: 1 }, { unique: true }).catch(() => {});
  collection.createIndex({ level: -1 }).catch(() => {});

  return new RPGRepository(collection);
}

// ============ Database Initialization ============

// NO LONGER NEEDED - MongoDB creates collections automatically!
// No more manual migration logic needed - just add fields to the interface!
export async function initDatabase(ctx: PluginContext): Promise<void> {
  ctx.logger.debug("MongoDB auto-creates collections - no initialization needed");
}
