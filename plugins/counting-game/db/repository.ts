import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { Collection, Document, ObjectId, OptionalId } from "mongodb";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

// ============ Data Types ============

/**
 * Game state for a counting channel
 */
export interface CountingGame extends Document {
  _id?: ObjectId;
  guild_id: string;
  channel_id: string;
  current_count: number;
  high_score: number;
  last_user_id: string | null;
  last_message_id: string | null;
  total_counts: number;
  total_fails: number;
  created_at: Date;
  updated_at: Date;
}

/**
 * User statistics for the counting game
 */
export interface UserStats extends Document {
  _id?: ObjectId;
  guild_id: string;
  user_id: string;
  successful_counts: number;
  failed_counts: number;
  highest_contribution: number; // Highest count they've reached
  created_at: Date;
  updated_at: Date;
}

// ============ Game Repository ============

export class CountingGameRepository extends BaseRepository<CountingGame> {
  constructor(collection: Collection<CountingGame>) {
    super(collection);
  }

  /**
   * Get or create a game for a specific channel
   */
  async getOrCreateGame(guildId: string, channelId: string): Promise<CountingGame> {
    let game = await this.collection.findOne({
      guild_id: guildId,
      channel_id: channelId,
    });

    if (!game) {
      const result = await this.collection.insertOne({
        guild_id: guildId,
        channel_id: channelId,
        current_count: 0,
        high_score: 0,
        last_user_id: null,
        last_message_id: null,
        total_counts: 0,
        total_fails: 0,
        created_at: new Date(),
        updated_at: new Date(),
      } as OptionalId<CountingGame>);

      game = (await this.collection.findOne({ _id: result.insertedId }))!;
    }

    return game;
  }

  /**
   * Get game state for a channel
   */
  async getGame(guildId: string, channelId: string): Promise<CountingGame | null> {
    return await this.collection.findOne({
      guild_id: guildId,
      channel_id: channelId,
    });
  }

  /**
   * Increment the count (successful count)
   */
  async incrementCount(
    guildId: string,
    channelId: string,
    userId: string,
    messageId: string
  ): Promise<CountingGame> {
    const game = await this.getOrCreateGame(guildId, channelId);
    const newCount = game.current_count + 1;

    await this.collection.updateOne(
      { guild_id: guildId, channel_id: channelId },
      {
        $set: {
          current_count: newCount,
          high_score: Math.max(newCount, game.high_score),
          last_user_id: userId,
          last_message_id: messageId,
          updated_at: new Date(),
        },
        $inc: {
          total_counts: 1,
        },
      }
    );

    return (await this.getGame(guildId, channelId))!;
  }

  /**
   * Reset the count (failed count)
   */
  async resetCount(guildId: string, channelId: string): Promise<CountingGame> {
    await this.collection.updateOne(
      { guild_id: guildId, channel_id: channelId },
      {
        $set: {
          current_count: 0,
          last_user_id: null,
          last_message_id: null,
          updated_at: new Date(),
        },
        $inc: {
          total_fails: 1,
        },
      }
    );

    return (await this.getGame(guildId, channelId))!;
  }

  /**
   * Get all active games for a guild
   */
  async getGuildGames(guildId: string): Promise<CountingGame[]> {
    return await this.collection.find({ guild_id: guildId }).toArray();
  }

  /**
   * Get leaderboard (top games by high score)
   */
  async getLeaderboard(guildId: string, limit: number = 10): Promise<CountingGame[]> {
    return await this.collection
      .find({ guild_id: guildId })
      .sort({ high_score: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Delete a game
   */
  async deleteGame(guildId: string, channelId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({
      guild_id: guildId,
      channel_id: channelId,
    });
    return result.deletedCount > 0;
  }
}

// ============ User Stats Repository ============

export class UserStatsRepository extends BaseRepository<UserStats> {
  constructor(collection: Collection<UserStats>) {
    super(collection);
  }

  /**
   * Get or create user stats
   */
  async getOrCreateStats(guildId: string, userId: string): Promise<UserStats> {
    let stats = await this.collection.findOne({
      guild_id: guildId,
      user_id: userId,
    });

    if (!stats) {
      const result = await this.collection.insertOne({
        guild_id: guildId,
        user_id: userId,
        successful_counts: 0,
        failed_counts: 0,
        highest_contribution: 0,
        created_at: new Date(),
        updated_at: new Date(),
      } as OptionalId<UserStats>);

      stats = (await this.collection.findOne({ _id: result.insertedId }))!;
    }

    return stats;
  }

  /**
   * Record a successful count
   */
  async recordSuccess(guildId: string, userId: string, count: number): Promise<void> {
    const stats = await this.getOrCreateStats(guildId, userId);

    await this.collection.updateOne(
      { guild_id: guildId, user_id: userId },
      {
        $inc: { successful_counts: 1 },
        $set: {
          highest_contribution: Math.max(count, stats.highest_contribution),
          updated_at: new Date(),
        },
      }
    );
  }

  /**
   * Record a failed count
   */
  async recordFailure(guildId: string, userId: string): Promise<void> {
    await this.getOrCreateStats(guildId, userId);

    await this.collection.updateOne(
      { guild_id: guildId, user_id: userId },
      {
        $inc: { failed_counts: 1 },
        $set: { updated_at: new Date() },
      }
    );
  }

  /**
   * Get user stats
   */
  async getUserStats(guildId: string, userId: string): Promise<UserStats | null> {
    return await this.collection.findOne({
      guild_id: guildId,
      user_id: userId,
    });
  }

  /**
   * Get leaderboard (top users by successful counts)
   */
  async getLeaderboard(guildId: string, limit: number = 10): Promise<UserStats[]> {
    return await this.collection
      .find({ guild_id: guildId })
      .sort({ successful_counts: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Get leaderboard by highest contribution
   */
  async getHighestContributionLeaderboard(guildId: string, limit: number = 10): Promise<UserStats[]> {
    return await this.collection
      .find({ guild_id: guildId })
      .sort({ highest_contribution: -1 })
      .limit(limit)
      .toArray();
  }
}

// ============ Factory Functions ============

export function createGameRepo(ctx: PluginContext, api: CoreUtilsAPI): CountingGameRepository {
  const collection = api.database.getCollection<CountingGame>(ctx, 'games');

  // Create indexes
  collection.createIndex(
    { guild_id: 1, channel_id: 1 },
    { unique: true }
  ).catch(() => {});

  collection.createIndex(
    { guild_id: 1, high_score: -1 }
  ).catch(() => {});

  return new CountingGameRepository(collection);
}

export function createStatsRepo(ctx: PluginContext, api: CoreUtilsAPI): UserStatsRepository {
  const collection = api.database.getCollection<UserStats>(ctx, 'user_stats');

  // Create indexes
  collection.createIndex(
    { guild_id: 1, user_id: 1 },
    { unique: true }
  ).catch(() => {});

  collection.createIndex(
    { guild_id: 1, successful_counts: -1 }
  ).catch(() => {});

  collection.createIndex(
    { guild_id: 1, highest_contribution: -1 }
  ).catch(() => {});

  return new UserStatsRepository(collection);
}
