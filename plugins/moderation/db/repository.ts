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

  // New fields for enhanced moderation
  category?: string;              // Warning category (e.g., "spam", "toxicity")
  expires_at?: Date;              // For tempbans - when to auto-unban
  threshold_triggered?: boolean;  // Whether this case triggered a threshold action
  guild_id?: string;              // Guild ID for tempban processing
}

export type CaseType = "kick" | "ban" | "unban" | "timeout" | "warn" | "purge" | "lock" | "unlock" | "automod_filter" | "automod_invite" | "tempban";

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
    duration: number | null = null,
    options?: {
      category?: string;
      expiresAt?: Date;
      thresholdTriggered?: boolean;
      guildId?: string;
    }
  ): Promise<string> {
    const caseData: OptionalId<ModCase> = {
      type,
      user_id: userId,
      user_tag: userTag,
      moderator_id: moderatorId,
      moderator_tag: moderatorTag,
      reason,
      duration,
      created_at: new Date(),
    };

    // Add optional fields if provided
    if (options?.category) caseData.category = options.category;
    if (options?.expiresAt) caseData.expires_at = options.expiresAt;
    if (options?.thresholdTriggered) caseData.threshold_triggered = options.thresholdTriggered;
    if (options?.guildId) caseData.guild_id = options.guildId;

    const result = await this.collection.insertOne(caseData);

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

  /**
   * Get active warnings for a user (considering time decay)
   * @param userId User ID to check
   * @param decayDays Number of days after which warnings don't count (0 = no decay)
   * @param category Optional category filter
   */
  async getActiveWarnings(userId: string, decayDays: number = 0, category?: string): Promise<ModCase[]> {
    let query = this.query()
      .where('user_id', '=', userId)
      .where('type', '=', 'warn');

    // Apply time decay filter if enabled
    if (decayDays > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - decayDays);
      query = query.where('created_at', '>', cutoffDate);
    }

    // Apply category filter if specified
    if (category) {
      query = query.where('category', '=', category);
    }

    return await query.orderBy('created_at', 'DESC').all();
  }

  /**
   * Get warning counts grouped by category for a user
   * @param userId User ID to check
   * @param decayDays Number of days after which warnings don't count (0 = no decay)
   */
  async getWarningCountsByCategory(userId: string, decayDays: number = 0): Promise<Map<string, number>> {
    const warnings = await this.getActiveWarnings(userId, decayDays);
    const counts = new Map<string, number>();

    for (const warning of warnings) {
      const category = warning.category || 'general';
      counts.set(category, (counts.get(category) || 0) + 1);
    }

    return counts;
  }

  /**
   * Get expired tempbans ready to be processed
   */
  async getExpiredTempbans(): Promise<ModCase[]> {
    return await this.query()
      .where('type', '=', 'tempban')
      .where('expires_at', '<=', new Date())
      .all();
  }

  /**
   * Get punishment cases (excludes utility actions like purge/lock/unlock)
   */
  async getPunishmentCases(userId: string): Promise<ModCase[]> {
    const utilityTypes: CaseType[] = ['purge', 'lock', 'unlock'];

    return await this.query()
      .where('user_id', '=', userId)
      .where('type', 'NOT IN', utilityTypes)
      .orderBy('created_at', 'DESC')
      .all();
  }

  /**
   * Get utility action cases (purge/lock/unlock only)
   */
  async getUtilityActions(userId?: string): Promise<ModCase[]> {
    const utilityTypes: CaseType[] = ['purge', 'lock', 'unlock'];
    let query = this.query();

    if (userId) {
      query = query.where('user_id', '=', userId);
    }

    return await query
      .where('type', 'IN', utilityTypes)
      .orderBy('created_at', 'DESC')
      .all();
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

  // Create indexes for performance
  collection.createIndex({ user_id: 1, created_at: -1 }).catch(() => {});
  collection.createIndex({ type: 1 }).catch(() => {});
  collection.createIndex({ expires_at: 1 }).catch(() => {}); // For tempban expiry checks
  collection.createIndex({ user_id: 1, type: 1, created_at: -1 }).catch(() => {}); // For warning queries
  collection.createIndex({ user_id: 1, category: 1 }).catch(() => {}); // For category-based queries

  return new ModerationRepository(collection);
}

// ============ Database Initialization ============

// NO LONGER NEEDED - MongoDB creates collections automatically!
export async function initDatabase(ctx: PluginContext): Promise<void> {
  ctx.logger.debug("MongoDB auto-creates collections - no initialization needed");
}
