/**
 * Economy Plugin
 *
 * A comprehensive economy system where users earn coins by sending messages.
 * Features a full API for other plugins to hook into.
 *
 * Features:
 * - Earn coins per message (configurable amount and cooldown)
 * - Per-guild economy (separate balances for each server)
 * - Transfer coins between users
 * - Leaderboard with pagination
 * - Transaction history tracking
 * - Admin commands (give, set, remove, reset)
 * - Comprehensive API for other plugins
 */

import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import type { EconomyTransaction } from "./db/repository";
import { createUserRepository, createTransactionRepository } from "./db/repository";
import { createMessageEarnEvent } from "./events/message-earn";
import { createEconomyCommand } from "./commands";

// ============ Configuration Schema ============

const configSchema = z.object({
  enabled: z.boolean().default(true).describe("Enable/disable the economy plugin"),

  // Earning settings
  earnAmount: z.number().min(1).max(1000).default(2).describe("Coins earned per message"),
  cooldownSeconds: z.number().min(0).max(3600).default(60).describe("Cooldown between earnings (seconds)"),

  // User settings
  startingBalance: z.number().min(0).default(0).describe("Starting balance for new users"),
  minTransferAmount: z.number().min(1).default(1).describe("Minimum coins to transfer"),

  // Display settings
  currencyName: z.string().default("coins").describe("Currency name (e.g., 'coins', 'points')"),
  currencyEmoji: z.string().default("💰").describe("Currency emoji"),

  // Features
  enableTransactionHistory: z.boolean().default(true).describe("Track transaction history"),
  leaderboardPageSize: z.number().min(5).max(25).default(10).describe("Users per leaderboard page"),
}).describe("Economy Plugin Configuration");

type EconomyConfig = z.infer<typeof configSchema>;

// ============ API Interface ============

export interface EconomyAPI {
  // Balance operations
  getBalance(guildId: string, userId: string): Promise<number>;
  addBalance(guildId: string, userId: string, amount: number, logTransaction?: boolean): Promise<number>;
  removeBalance(guildId: string, userId: string, amount: number, logTransaction?: boolean): Promise<number | null>;
  setBalance(guildId: string, userId: string, amount: number, logTransaction?: boolean): Promise<void>;

  // Transfer with validation
  transfer(guildId: string, fromUserId: string, toUserId: string, amount: number): Promise<{ success: boolean; reason?: string }>;

  // Queries
  getLeaderboard(guildId: string, limit?: number, offset?: number): Promise<Array<{ userId: string; balance: number; rank: number }>>;
  getUserRank(guildId: string, userId: string): Promise<number | null>;

  // Transaction history
  getTransactionHistory(guildId: string, userId: string, limit?: number, offset?: number): Promise<EconomyTransaction[]>;

  // Admin
  resetGuildEconomy(guildId: string): Promise<number>;

  // Internal (message earning)
  canEarnFromMessage(guildId: string, userId: string): Promise<boolean>;
  awardMessageEarning(guildId: string, userId: string): Promise<number>;
}

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> & { api?: EconomyAPI } = {
  manifest: {
    name: "economy",
    version: "1.0.0",
    description: "Comprehensive economy system with message earning and full API",
    author: "Sewdohe",
    dependencies: {
      hard: ["core-utils"],
      soft: [],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
      earnAmount: 2,
      cooldownSeconds: 60,
      startingBalance: 0,
      minTransferAmount: 1,
      currencyName: "coins",
      currencyEmoji: "💰",
      enableTransactionHistory: true,
      leaderboardPageSize: 10,
    },
  },

  // API will be initialized in onLoad
  api: null as unknown as EconomyAPI,

  async onLoad(ctx: PluginContext<EconomyConfig>) {
    if (!ctx.config.enabled) {
      ctx.logger.warn("Economy plugin is disabled in config");
      return;
    }

    // Get core-utils dependency
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.error("core-utils plugin is required but not available");
      throw new Error("core-utils plugin required for economy plugin");
    }
    const api = coreUtils.api;

    // Initialize repositories
    const userRepo = createUserRepository(ctx, api);
    const transactionRepo = ctx.config.enableTransactionHistory
      ? createTransactionRepository(ctx, api)
      : null;

    // Create Economy API
    const economyAPI: EconomyAPI = {
      async getBalance(guildId: string, userId: string): Promise<number> {
        const user = await userRepo.findByDiscordId(guildId, userId);
        return user?.balance ?? ctx.config.startingBalance;
      },

      async addBalance(guildId: string, userId: string, amount: number, logTransaction: boolean = false): Promise<number> {
        await userRepo.ensureUser(guildId, userId, ctx.config.startingBalance);
        const newBalance = await userRepo.incrementBalance(guildId, userId, amount);

        if (logTransaction && transactionRepo) {
          transactionRepo.logAdminAction(guildId, userId, amount, 'admin_give').catch((err) => {
            ctx.logger.error("Failed to log transaction:", err);
          });
        }

        return newBalance;
      },

      async removeBalance(guildId: string, userId: string, amount: number, logTransaction: boolean = false): Promise<number | null> {
        await userRepo.ensureUser(guildId, userId, ctx.config.startingBalance);
        const newBalance = await userRepo.decrementBalance(guildId, userId, amount);

        if (newBalance !== null && logTransaction && transactionRepo) {
          transactionRepo.logAdminAction(guildId, userId, amount, 'admin_remove').catch((err) => {
            ctx.logger.error("Failed to log transaction:", err);
          });
        }

        return newBalance;
      },

      async setBalance(guildId: string, userId: string, amount: number, logTransaction: boolean = false): Promise<void> {
        await userRepo.ensureUser(guildId, userId, ctx.config.startingBalance);
        await userRepo.setBalance(guildId, userId, amount);

        if (logTransaction && transactionRepo) {
          transactionRepo.logAdminAction(guildId, userId, amount, 'admin_set').catch((err) => {
            ctx.logger.error("Failed to log transaction:", err);
          });
        }
      },

      async transfer(guildId: string, fromUserId: string, toUserId: string, amount: number): Promise<{ success: boolean; reason?: string }> {
        // Ensure both users exist
        await userRepo.ensureUser(guildId, fromUserId, ctx.config.startingBalance);
        await userRepo.ensureUser(guildId, toUserId, ctx.config.startingBalance);

        // Check sender balance
        const senderBalance = await this.getBalance(guildId, fromUserId);
        if (senderBalance < amount) {
          return {
            success: false,
            reason: `You don't have enough ${ctx.config.currencyName}! (Balance: ${ctx.config.currencyEmoji} ${senderBalance.toLocaleString()})`,
          };
        }

        // Perform transfer (atomic operations)
        const newSenderBalance = await userRepo.decrementBalance(guildId, fromUserId, amount);
        if (newSenderBalance === null) {
          return { success: false, reason: "Failed to deduct coins from sender" };
        }

        await userRepo.incrementBalance(guildId, toUserId, amount);

        // Log transaction
        if (transactionRepo) {
          transactionRepo.logTransfer(guildId, fromUserId, toUserId, amount).catch((err) => {
            ctx.logger.error("Failed to log transfer:", err);
          });
        }

        return { success: true };
      },

      async getLeaderboard(guildId: string, limit: number = 10, offset: number = 0): Promise<Array<{ userId: string; balance: number; rank: number }>> {
        const users = await userRepo.getLeaderboard(guildId, limit, offset);
        return users.map((user, index) => ({
          userId: user.user_id,
          balance: user.balance,
          rank: offset + index + 1,
        }));
      },

      async getUserRank(guildId: string, userId: string): Promise<number | null> {
        return await userRepo.getUserRank(guildId, userId);
      },

      async getTransactionHistory(guildId: string, userId: string, limit: number = 10, offset: number = 0): Promise<EconomyTransaction[]> {
        if (!transactionRepo) return [];
        return await transactionRepo.getUserHistory(guildId, userId, limit, offset);
      },

      async resetGuildEconomy(guildId: string): Promise<number> {
        return await userRepo.resetGuildEconomy(guildId);
      },

      async canEarnFromMessage(guildId: string, userId: string): Promise<boolean> {
        const cooldownMs = ctx.config.cooldownSeconds * 1000;
        return await userRepo.canEarn(guildId, userId, cooldownMs);
      },

      async awardMessageEarning(guildId: string, userId: string): Promise<number> {
        const cooldownMs = ctx.config.cooldownSeconds * 1000;
        const newBalance = await userRepo.awardMessageEarning(guildId, userId, ctx.config.earnAmount, cooldownMs);

        // Log transaction (don't await, run in background)
        if (newBalance !== null && transactionRepo) {
          transactionRepo.logEarn(guildId, userId, ctx.config.earnAmount).catch((err) => {
            ctx.logger.error("Failed to log earning:", err);
          });
        }

        return newBalance ?? 0;
      },
    };

    // Attach API to plugin
    (this as any).api = economyAPI;

    // Register event handlers
    ctx.registerEvent(createMessageEarnEvent(ctx, economyAPI));

    // Register commands
    ctx.registerCommand(createEconomyCommand(ctx, economyAPI, api, userRepo));

    ctx.logger.info("Economy plugin loaded successfully!");
  },

  async onUnload() {
    // Cleanup if needed
  },
};

export default plugin;
