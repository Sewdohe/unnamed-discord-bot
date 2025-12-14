import { Collection, Document, ObjectId, OptionalId } from "mongodb";
import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

// ============ Types ============

export interface ModCase extends Document {
  _id?: ObjectId;
  type: CaseType;
  user_id: string;
  user_tag: string;
  moderator_id: string;
  moderator_tag: string;
  reason: string;
  duration: number | null;
  created_at: Date;
}

export type CaseType = "kick" | "ban" | "unban" | "timeout" | "warn" | "purge" | "lock" | "unlock" | "automod_filter" | "automod_invite";

// ============ Repository ============

export class ModerationRepository extends BaseRepository<ModCase> {
  constructor(collection: Collection<ModCase>) {
    super(collection);
  }

  /**
   * Create a new moderation case
   */
  async createCase(
    type: CaseType,
    userId: string,
    userTag: string,
    moderatorId: string,
    moderatorTag: string,
    reason: string,
    duration: number | null = null
  ): Promise<string> {
    const result = await this.collection.insertOne({
      type,
      user_id: userId,
      user_tag: userTag,
      moderator_id: moderatorId,
      moderator_tag: moderatorTag,
      reason,
      duration,
      created_at: new Date(),
    } as OptionalId<ModCase>);

    return result.insertedId.toString();
  }

  /**
   * Get a case by ID
   */
  async getCase(caseId: string): Promise<ModCase | null> {
    return await this.find(caseId);
  }

  /**
   * Get all cases for a user
   */
  async getUserCases(userId: string): Promise<ModCase[]> {
    return await this.query()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'DESC')
      .all();
  }

  /**
   * Update the reason for a case
   */
  async updateCaseReason(caseId: string, newReason: string): Promise<boolean> {
    return await this.update(caseId, { reason: newReason });
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
  const collection = api.database.getCollection<ModCase>(ctx, 'cases');

  // Create indexes
  collection.createIndex({ user_id: 1, created_at: -1 }).catch(() => {});
  collection.createIndex({ type: 1 }).catch(() => {});

  return new ModerationRepository(collection);
}

// ============ Database Initialization ============

// NO LONGER NEEDED - MongoDB creates collections automatically!
export async function initDatabase(ctx: PluginContext): Promise<void> {
  ctx.logger.debug("MongoDB auto-creates collections - no initialization needed");
}
