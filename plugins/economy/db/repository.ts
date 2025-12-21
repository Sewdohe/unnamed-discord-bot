import { Collection, Document, ObjectId, OptionalId } from "mongodb";
import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

// ============ Document Interfaces ============

export interface EconomyUser extends Document {
  _id?: ObjectId;
  guild_id: string;
  user_id: string;
  balance: number;
  last_earned_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type TransactionType = 'earn' | 'transfer' | 'admin_give' | 'admin_set' | 'admin_remove';

export interface EconomyTransaction extends Document {
  _id?: ObjectId;
  guild_id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  amount: number;
  type: TransactionType;
  description?: string;
  created_at: Date;
}

// ============ User Repository ============

export class UserRepository extends BaseRepository<EconomyUser> {
  constructor(collection: Collection<EconomyUser>) {
    super(collection);
  }

  /**
   * Find a user by Discord ID and guild ID
   */
  async findByDiscordId(guildId: string, userId: string): Promise<EconomyUser | null> {
    return await this.query()
      .where('guild_id', '=', guildId)
      .where('user_id', '=', userId)
      .first();
  }

  /**
   * Create a new user with starting balance
   */
  async createUser(guildId: string, userId: string, startingBalance: number): Promise<string> {
    const result = await this.collection.insertOne({
      guild_id: guildId,
      user_id: userId,
      balance: startingBalance,
      last_earned_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    } as OptionalId<EconomyUser>);

    return result.insertedId.toString();
  }

  /**
   * Get user or create if doesn't exist (upsert pattern)
   */
  async ensureUser(guildId: string, userId: string, startingBalance: number): Promise<EconomyUser> {
    let user = await this.findByDiscordId(guildId, userId);

    if (!user) {
      await this.createUser(guildId, userId, startingBalance);
      user = await this.findByDiscordId(guildId, userId);
    }

    return user!;
  }

  /**
   * Atomically increment user balance
   * Returns the new balance
   */
  async incrementBalance(guildId: string, userId: string, amount: number): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { guild_id: guildId, user_id: userId },
      {
        $inc: { balance: amount },
        $set: { updated_at: new Date() },
      },
      { returnDocument: 'after' }
    );

    return result?.balance ?? 0;
  }

  /**
   * Atomically decrement user balance
   * Returns new balance on success, null if insufficient balance
   */
  async decrementBalance(guildId: string, userId: string, amount: number): Promise<number | null> {
    // First check if user has enough balance
    const user = await this.findByDiscordId(guildId, userId);
    if (!user || user.balance < amount) {
      return null;
    }

    const result = await this.collection.findOneAndUpdate(
      {
        guild_id: guildId,
        user_id: userId,
        balance: { $gte: amount }, // Safety: only decrement if balance is sufficient
      },
      {
        $inc: { balance: -amount },
        $set: { updated_at: new Date() },
      },
      { returnDocument: 'after' }
    );

    return result?.balance ?? null;
  }

  /**
   * Set user balance to a specific amount
   */
  async setBalance(guildId: string, userId: string, balance: number): Promise<void> {
    await this.collection.updateOne(
      { guild_id: guildId, user_id: userId },
      {
        $set: {
          balance: balance,
          updated_at: new Date(),
        },
      }
    );
  }

  /**
   * Check if user can earn from message (cooldown check)
   */
  async canEarn(guildId: string, userId: string, cooldownMs: number): Promise<boolean> {
    const user = await this.findByDiscordId(guildId, userId);

    if (!user || !user.last_earned_at) {
      return true; // Never earned or doesn't exist yet
    }

    const timeSinceLastEarn = Date.now() - user.last_earned_at.getTime();
    return timeSinceLastEarn >= cooldownMs;
  }

  /**
   * Update last_earned_at timestamp
   */
  async updateLastEarned(guildId: string, userId: string): Promise<void> {
    await this.collection.updateOne(
      { guild_id: guildId, user_id: userId },
      {
        $set: {
          last_earned_at: new Date(),
          updated_at: new Date(),
        },
      }
    );
  }

  /**
   * Atomically award message earning with cooldown check
   * Returns new balance on success, null if on cooldown
   */
  async awardMessageEarning(guildId: string, userId: string, earnAmount: number, cooldownMs: number): Promise<number | null> {
    const cooldownDate = new Date(Date.now() - cooldownMs);

    const result = await this.collection.findOneAndUpdate(
      {
        guild_id: guildId,
        user_id: userId,
        $or: [
          { last_earned_at: null },
          { last_earned_at: { $lt: cooldownDate } },
        ],
      },
      {
        $inc: { balance: earnAmount }, // $inc creates field with value if it doesn't exist
        $set: {
          last_earned_at: new Date(),
          updated_at: new Date(),
        },
        $setOnInsert: {
          guild_id: guildId,
          user_id: userId,
          // Don't set balance here - let $inc handle it
          created_at: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    // If result is null, user is on cooldown
    return result?.balance ?? null;
  }

  /**
   * Get leaderboard (top users by balance)
   */
  async getLeaderboard(guildId: string, limit: number, offset: number): Promise<EconomyUser[]> {
    return await this.collection
      .find({ guild_id: guildId })
      .sort({ balance: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();
  }

  /**
   * Get user's rank in the guild
   * Returns rank (1-indexed) or null if user not found
   */
  async getUserRank(guildId: string, userId: string): Promise<number | null> {
    const user = await this.findByDiscordId(guildId, userId);
    if (!user) return null;

    // Count users with higher balance
    const higherCount = await this.collection.countDocuments({
      guild_id: guildId,
      balance: { $gt: user.balance },
    });

    return higherCount + 1;
  }

  /**
   * Get total number of users in guild
   */
  async getTotalUsers(guildId: string): Promise<number> {
    return await this.collection.countDocuments({ guild_id: guildId });
  }

  /**
   * Reset entire guild economy (delete all users)
   * Returns number of users deleted
   */
  async resetGuildEconomy(guildId: string): Promise<number> {
    const result = await this.collection.deleteMany({ guild_id: guildId });
    return result.deletedCount;
  }
}

// ============ Transaction Repository ============

export class TransactionRepository extends BaseRepository<EconomyTransaction> {
  constructor(collection: Collection<EconomyTransaction>) {
    super(collection);
  }

  /**
   * Log a message earning transaction
   */
  async logEarn(guildId: string, userId: string, amount: number): Promise<void> {
    await this.collection.insertOne({
      guild_id: guildId,
      from_user_id: null,
      to_user_id: userId,
      amount,
      type: 'earn',
      created_at: new Date(),
    } as OptionalId<EconomyTransaction>);
  }

  /**
   * Log a transfer transaction
   */
  async logTransfer(guildId: string, fromUserId: string, toUserId: string, amount: number): Promise<void> {
    await this.collection.insertOne({
      guild_id: guildId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
      amount,
      type: 'transfer',
      created_at: new Date(),
    } as OptionalId<EconomyTransaction>);
  }

  /**
   * Log an admin action
   */
  async logAdminAction(
    guildId: string,
    userId: string,
    amount: number,
    type: 'admin_give' | 'admin_set' | 'admin_remove',
    description?: string
  ): Promise<void> {
    const transaction: OptionalId<EconomyTransaction> = {
      guild_id: guildId,
      from_user_id: null,
      to_user_id: type === 'admin_remove' ? null : userId,
      amount,
      type,
      description,
      created_at: new Date(),
    };

    // For remove, set to_user_id to userId (target)
    if (type === 'admin_remove') {
      transaction.to_user_id = userId;
      transaction.from_user_id = userId;
    }

    await this.collection.insertOne(transaction);
  }

  /**
   * Get user's transaction history
   */
  async getUserHistory(guildId: string, userId: string, limit: number, offset: number): Promise<EconomyTransaction[]> {
    return await this.collection
      .find({
        guild_id: guildId,
        $or: [
          { from_user_id: userId },
          { to_user_id: userId },
        ],
      })
      .sort({ created_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();
  }

  /**
   * Get recent transactions for guild
   */
  async getRecentTransactions(guildId: string, limit: number): Promise<EconomyTransaction[]> {
    return await this.collection
      .find({ guild_id: guildId })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
  }
}

// ============ Factory Functions ============

export function createUserRepository(ctx: PluginContext, api: CoreUtilsAPI): UserRepository {
  const collection = api.database.getCollection<EconomyUser>(ctx, 'users');

  // Create indexes
  collection.createIndex({ guild_id: 1, user_id: 1 }, { unique: true }).catch(() => {});
  collection.createIndex({ guild_id: 1, balance: -1 }).catch(() => {});

  return new UserRepository(collection);
}

export function createTransactionRepository(ctx: PluginContext, api: CoreUtilsAPI): TransactionRepository {
  const collection = api.database.getCollection<EconomyTransaction>(ctx, 'transactions');

  // Create indexes
  collection.createIndex({ guild_id: 1, created_at: -1 }).catch(() => {});
  collection.createIndex({ guild_id: 1, to_user_id: 1, created_at: -1 }).catch(() => {});
  collection.createIndex({ guild_id: 1, from_user_id: 1, created_at: -1 }).catch(() => {});

  return new TransactionRepository(collection);
}
