import { Collection, Document, ObjectId, OptionalId } from "mongodb";
import { BaseRepository } from "../../../src/core/repository";
import type { SchemaValidator, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import { z } from "zod";

// ============ Types ============

export interface VerificationRecord extends Document {
  _id?: ObjectId;
  user_id: string;
  guild_id: string;
  verified: boolean;
  joined_at: Date;
  verified_at?: Date | null;
  created_at: Date;
}

// ============ Repository ============

export class VerificationRepository extends BaseRepository<VerificationRecord> {
  constructor(
    collection: Collection<VerificationRecord>,
    validator?: SchemaValidator<VerificationRecord>
  ) {
    super(collection, validator);
  }

  /**
   * Create a new verification record for a user in a guild
   * Uses upsert to avoid errors if record already exists
   */
  async createRecord(userId: string, guildId: string): Promise<void> {
    await this.collection.updateOne(
      { user_id: userId, guild_id: guildId },
      {
        $setOnInsert: {
          verified: false,
          joined_at: new Date(),
          created_at: new Date(),
        }
      },
      { upsert: true }
    );
  }

  /**
   * Mark a user as verified in a guild
   */
  async verify(userId: string, guildId: string): Promise<void> {
    await this.collection.updateOne(
      { user_id: userId, guild_id: guildId },
      {
        $set: {
          verified: true,
          verified_at: new Date(),
        }
      }
    );
  }

  /**
   * Mark a user as unverified in a guild
   */
  async unverify(userId: string, guildId: string): Promise<void> {
    await this.collection.updateOne(
      { user_id: userId, guild_id: guildId },
      {
        $set: {
          verified: false,
          verified_at: null,
        }
      }
    );
  }

  /**
   * Get a verification record for a user in a guild
   */
  async get(userId: string, guildId: string): Promise<VerificationRecord | null> {
    return await this.collection.findOne({ user_id: userId, guild_id: guildId });
  }

  /**
   * Check if a user is verified in a guild
   */
  async isVerified(userId: string, guildId: string): Promise<boolean> {
    const record = await this.get(userId, guildId);
    return record?.verified === true;
  }

  /**
   * Get all unverified users in a guild
   */
  async getUnverified(guildId: string): Promise<VerificationRecord[]> {
    return await this.query()
      .where('guild_id', '=', guildId)
      .where('verified', '=', false)
      .orderBy('joined_at', 'DESC')
      .all();
  }

  /**
   * Get all verified users in a guild
   */
  async getVerified(guildId: string): Promise<VerificationRecord[]> {
    return await this.query()
      .where('guild_id', '=', guildId)
      .where('verified', '=', true)
      .orderBy('verified_at', 'DESC')
      .all();
  }

  /**
   * Delete a verification record
   */
  async deleteRecord(userId: string, guildId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ user_id: userId, guild_id: guildId });
    return result.deletedCount > 0;
  }

  /**
   * Get all unverified users who joined before a certain date
   */
  async getUnverifiedBefore(guildId: string, beforeDate: Date): Promise<VerificationRecord[]> {
    return await this.query()
      .where('guild_id', '=', guildId)
      .where('verified', '=', false)
      .where('joined_at', '<', beforeDate)
      .orderBy('joined_at', 'ASC')
      .all();
  }

  /**
   * Get verification statistics for a guild
   */
  async getStats(guildId: string): Promise<{ total: number; verified: number; unverified: number }> {
    const [total, verified] = await Promise.all([
      this.collection.countDocuments({ guild_id: guildId }),
      this.collection.countDocuments({ guild_id: guildId, verified: true })
    ]);

    return {
      total,
      verified,
      unverified: total - verified
    };
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
      _id: z.instanceof(ObjectId).optional(),
      user_id: api.database.schemas.discordId,
      guild_id: api.database.schemas.discordId,
      verified: z.boolean(),
      joined_at: z.date(),
      verified_at: z.date().nullable().optional(),
      created_at: z.date(),
    })
  );

  // Get MongoDB collection
  const collection = api.database.getCollection<VerificationRecord>(ctx, 'verifications');

  // Create indexes for performance
  collection.createIndex({ user_id: 1, guild_id: 1 }, { unique: true }).catch(() => {});
  collection.createIndex({ guild_id: 1, verified: 1 }).catch(() => {});
  collection.createIndex({ guild_id: 1, joined_at: 1 }).catch(() => {});

  return new VerificationRepository(collection, validator);
}

// ============ Database Initialization ============

// NO LONGER NEEDED - MongoDB creates collections automatically!
// Kept for backward compatibility during migration - can be removed later
export async function initDatabase(ctx: PluginContext): Promise<void> {
  ctx.logger.debug("MongoDB auto-creates collections - no initialization needed");
}
