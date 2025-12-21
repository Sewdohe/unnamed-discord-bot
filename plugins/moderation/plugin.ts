import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import type { StatisticsAPI } from "../statistics/plugin";
import { initDatabase, createModerationRepo } from "./db/repository";
import {
  kickCommand,
  banCommand,
  unbanCommand,
  timeoutCommand,
  warnCommand,
  tempbanCommand,
  purgeCommand,
  lockCommand,
  unlockCommand,
  caseCommand,
  historyCommand,
  editCaseCommand,
  actionlogCommand,
} from "./commands";
import { autoModEvent } from "./events";
import { initTempbanScheduler } from "./utils/tempbans";

// ============ Configuration ============

const configSchema = z.object({
  modLog: z.object({
    enabled: z.boolean().default(true).describe("Enable logging moderation actions to a channel"),
    channelId: z.string().optional().describe("Channel ID where moderation actions are logged"),
  }).default({}).describe("Moderation log settings"),
  dmUsers: z.object({
    onWarn: z.boolean().default(true).describe("DM users when they are warned"),
    onTimeout: z.boolean().default(true).describe("DM users when they are timed out"),
    onKick: z.boolean().default(true).describe("DM users when they are kicked"),
    onBan: z.boolean().default(true).describe("DM users when they are banned"),
  }).default({}).describe("Control DM notifications to users"),
  requireReason: z.boolean().default(false).describe("Require a reason for all moderation actions"),
  deleteMessagesOnBan: z.number().min(0).max(7).default(1).describe("Days of messages to delete when banning (0-7)"),
  autoMod: z.object({
    messageFilter: z.object({
      enabled: z.boolean().default(false).describe("Enable message content filtering"),
      words: z.array(z.string()).default([]).describe("List of words/phrases to filter (case-insensitive)"),
      actions: z.array(z.enum(["delete", "warn", "timeout", "kick"])).default(["delete"]).describe("Actions to take (can specify multiple): delete, warn, timeout, kick"),
      timeoutDuration: z.string().default("10m").describe("Duration for timeout action (e.g., 10m, 1h, 1d)"),
      exemptRoles: z.array(z.string()).default([]).describe("Role IDs that bypass the message filter"),
      exemptChannels: z.array(z.string()).default([]).describe("Channel IDs where the filter doesn't apply"),
    }).default({}).describe("Filter messages containing banned words"),
    inviteFilter: z.object({
      enabled: z.boolean().default(false).describe("Enable Discord invite link filtering"),
      actions: z.array(z.enum(["delete", "warn", "timeout", "kick"])).default(["delete"]).describe("Actions to take (can specify multiple): delete, warn, timeout, kick"),
      timeoutDuration: z.string().default("10m").describe("Duration for timeout action (e.g., 10m, 1h, 1d)"),
      allowedInvites: z.array(z.string()).default([]).describe("Invite codes that are allowed (e.g., ['abc123'])"),
      exemptRoles: z.array(z.string()).default([]).describe("Role IDs that can post invite links"),
      exemptChannels: z.array(z.string()).default([]).describe("Channel IDs where invites are allowed"),
    }).default({}).describe("Filter unauthorized Discord invite links"),
    spamFilter: z.object({
      enabled: z.boolean().default(false).describe("Enable spam detection (similar repeated messages)"),
      similarityThreshold: z.number().min(0).max(100).default(80).describe("Percentage similarity required to consider messages as spam (0-100)"),
      messageThreshold: z.number().min(2).max(20).default(5).describe("Number of similar messages to trigger spam detection"),
      timeWindow: z.number().min(1).max(300).default(30).describe("Time window in seconds to check for spam"),
      actions: z.array(z.enum(["delete", "warn", "timeout", "kick"])).default(["delete", "timeout"]).describe("Actions to take (can specify multiple): delete, warn, timeout, kick"),
      timeoutDuration: z.string().default("10m").describe("Duration for timeout action (e.g., 10m, 1h, 1d)"),
      exemptRoles: z.array(z.string()).default([]).describe("Role IDs that bypass spam detection"),
      exemptChannels: z.array(z.string()).default([]).describe("Channel IDs where spam detection doesn't apply"),
    }).default({}).describe("Detect and prevent spam (similar repeated messages)"),
  }).default({}).describe("Automatic moderation settings"),
  warnings: z.object({
    globalThresholds: z.array(z.object({
      count: z.number().min(1).describe("Number of warnings required"),
      action: z.enum(["timeout", "kick", "ban"]).describe("Action to take when threshold is reached"),
      duration: z.string().optional().describe("Duration for timeout action (e.g., 1h, 1d)"),
    })).default([]).describe("Global warning thresholds that apply to all warnings"),
    decay: z.object({
      enabled: z.boolean().default(true).describe("Enable time-based warning decay"),
      days: z.number().min(1).default(30).describe("Days after which warnings no longer count toward thresholds"),
    }).default({}).describe("Warning decay settings"),
    categories: z.array(z.object({
      id: z.string().describe("Internal category ID (e.g., 'spam', 'toxicity')"),
      name: z.string().describe("Display name for the category"),
      thresholds: z.array(z.object({
        count: z.number().min(1).describe("Number of warnings in this category required"),
        action: z.enum(["timeout", "kick", "ban"]).describe("Action to take"),
        duration: z.string().optional().describe("Duration for timeout action"),
      })).default([]).describe("Category-specific thresholds (override global)"),
    })).default([]).describe("Warning categories with specific thresholds"),
    dmOnThresholdAction: z.boolean().default(true).describe("DM users when a threshold action is triggered"),
  }).default({
    globalThresholds: [{
      count: 3,
      action: "timeout",
      duration: "1h",
    }, {
      count: 5,
      action: "kick",
    }, {
      count: 7,
      action: "ban",
    }],
    decay: {
      enabled: true,
      days: 30,
    },
    categories: [
      {
        id: "spam",
        name: "Spam",
        thresholds: [{
          count: 2,
          action: "timeout",
          duration: "30m",
        }],
      }],
    dmOnThresholdAction: true,
  }).describe("Warning threshold and escalation settings"),
}).describe("Moderation plugin configuration");

type ModConfig = z.infer<typeof configSchema>;

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "moderation",
    version: "1.0.0",
    description: "Comprehensive moderation tools",
    author: "System",
    commandGroup: {
      name: "mod",
      description: "Moderation commands",
    },
    dependencies: {
      hard: ["core-utils"],
      soft: ["statistics"],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      modLog: {
        enabled: true,
      },
      dmUsers: {
        onWarn: true,
        onTimeout: true,
        onKick: true,
        onBan: true,
      },
      requireReason: false,
      deleteMessagesOnBan: 1,
      autoMod: {
        messageFilter: {
          enabled: false,
          words: [],
          actions: ["delete"],
          timeoutDuration: "10m",
          exemptRoles: [],
          exemptChannels: [],
        },
        inviteFilter: {
          enabled: false,
          actions: ["delete"],
          timeoutDuration: "10m",
          allowedInvites: [],
          exemptRoles: [],
          exemptChannels: [],
        },
        spamFilter: {
          enabled: false,
          similarityThreshold: 80,
          messageThreshold: 5,
          timeWindow: 30,
          actions: ["delete", "timeout"],
          timeoutDuration: "10m",
          exemptRoles: [],
          exemptChannels: [],
        },
      },
      warnings: {
        globalThresholds: [],
        decay: {
          enabled: true,
          days: 30,
        },
        categories: [],
        dmOnThresholdAction: true,
      },
    },
  },

  async onLoad(ctx: PluginContext<ModConfig>) {
    // Get core-utils
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.warn("core-utils not available - moderation plugin may have reduced functionality");
      return;
    }
    const api = coreUtils.api;

    // Initialize database
    await initDatabase(ctx);

    // Create repository
    const moderationRepo = createModerationRepo(ctx, api);

    // Register commands
    ctx.registerCommand(kickCommand(ctx, api, moderationRepo));
    ctx.registerCommand(banCommand(ctx, api, moderationRepo));
    ctx.registerCommand(unbanCommand(ctx, api, moderationRepo));
    ctx.registerCommand(timeoutCommand(ctx, api, moderationRepo));
    ctx.registerCommand(warnCommand(ctx, api, moderationRepo));
    ctx.registerCommand(tempbanCommand(ctx, api, moderationRepo));
    ctx.registerCommand(purgeCommand(ctx, api, moderationRepo));
    ctx.registerCommand(lockCommand(ctx, api, moderationRepo));
    ctx.registerCommand(unlockCommand(ctx, api, moderationRepo));
    ctx.registerCommand(caseCommand(ctx, api, moderationRepo));
    ctx.registerCommand(historyCommand(ctx, api, moderationRepo));
    ctx.registerCommand(editCaseCommand(ctx, api, moderationRepo));
    ctx.registerCommand(actionlogCommand(ctx, api, moderationRepo));

    // Initialize tempban scheduler
    initTempbanScheduler(ctx, api, moderationRepo);

    // Register auto-mod event handlers
    if (ctx.config.autoMod.messageFilter.enabled || ctx.config.autoMod.inviteFilter.enabled || ctx.config.autoMod.spamFilter.enabled) {
      ctx.registerEvent(autoModEvent(ctx, api, moderationRepo));
    }

    // Register statistics provider
    const statisticsPlugin = ctx.getPlugin<{ api: StatisticsAPI }>("statistics");
    if (statisticsPlugin?.api) {
      statisticsPlugin.api.registerProvider({
        id: "moderation-stats",
        category: "Moderation Statistics",
        priority: 80,
        collect: async () => {
          // Get total cases
          const allCases = await moderationRepo.all();
          const totalCases = allCases.length;

          // Count by type
          const bans = allCases.filter(c => c.type === "ban").length;
          const kicks = allCases.filter(c => c.type === "kick").length;
          const warns = allCases.filter(c => c.type === "warn").length;
          const timeouts = allCases.filter(c => c.type === "timeout").length;

          // Count recent activity (last 24 hours)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const recentCases = allCases.filter(c => c.created_at >= oneDayAgo).length;

          return {
            "Total Cases": totalCases.toLocaleString(),
            "Bans": bans.toLocaleString(),
            "Kicks": kicks.toLocaleString(),
            "Warnings": warns.toLocaleString(),
            "Timeouts": timeouts.toLocaleString(),
            "Cases (24h)": recentCases.toLocaleString(),
          };
        },
      });
      ctx.logger.info("Registered moderation statistics provider");
    }

    ctx.logger.info("Moderation plugin loaded!");
  },
};

export default plugin;
