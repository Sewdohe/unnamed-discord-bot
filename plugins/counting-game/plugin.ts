/**
 * Counting Game Plugin
 *
 * A classic Discord counting game where users count sequentially in designated channels.
 *
 * Features:
 * - Multiple counting channels per server
 * - Configurable alternating accounts rule
 * - Optional non-counting message deletion
 * - Statistics tracking per user
 * - Leaderboards (users and channels)
 * - Milestone celebrations
 * - High score tracking
 */

import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import type { StatisticsAPI } from "../statistics/plugin";
import { createGameRepo, createStatsRepo } from "./db/repository";
import { createCountingCommand } from "./commands";
import { createMessageHandler } from "./events";

// ============ Configuration Schema ============

const configSchema = z.object({
  // Enable/disable the plugin
  enabled: z.boolean()
    .default(true)
    .describe("Enable or disable the counting game"),

  // Alternating accounts rule
  alternatingAccounts: z.boolean()
    .default(true)
    .describe("Require different users to alternate (same user can't count twice in a row)"),

  // Allow talking in counting channels
  allowTalking: z.boolean()
    .default(false)
    .describe("Allow non-counting messages in counting channels (if false, they will be deleted)"),

  // Reactions for correct/incorrect counts
  reactions: z.object({
    success: z.string().default("✅").describe("Reaction for correct counts"),
    failure: z.string().default("❌").describe("Reaction for incorrect counts"),
  }).default({}),

  // Reset on fail
  resetOnFail: z.boolean()
    .default(true)
    .describe("Reset the count to 0 when someone makes a mistake (if false, counting continues)"),

  // Milestone announcements
  milestones: z.object({
    enabled: z.boolean().default(true).describe("Announce milestone achievements"),
    interval: z.number().min(10).max(1000).default(100).describe("Milestone interval (e.g., every 100 counts)"),
  }).default({}),

  // Counting channels (managed via commands, but can be pre-configured)
  countingChannels: z.array(z.string()).default([]).describe("Pre-configured counting channel IDs"),
}).describe("Counting Game Configuration");

type CountingConfig = z.infer<typeof configSchema>;

// ============ Plugin Definition ============

// ============ Plugin State (for onUnload access) ============
let pluginCtx: PluginContext<CountingConfig> | null = null;
let pluginApi: CoreUtilsAPI | null = null;
let pluginGameRepo: ReturnType<typeof createGameRepo> | null = null;

const plugin: Plugin<typeof configSchema> = {
  // ============ Manifest ============
  manifest: {
    name: "counting-game",
    version: "1.0.0",
    description: "A classic counting game with statistics and leaderboards",
    author: "Discord Bot",
    dependencies: {
      hard: ["core-utils"],
      soft: ["statistics"],
    },
  },

  // ============ Configuration ============
  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
      alternatingAccounts: true,
      allowTalking: false,
      reactions: {
        success: "✅",
        failure: "❌",
      },
      resetOnFail: true,
      milestones: {
        enabled: true,
        interval: 100,
      },
      countingChannels: [],
    },
  },

  // ============ Load Handler ============
  async onLoad(ctx: PluginContext<CountingConfig>) {
    // Check if plugin is enabled
    if (!ctx.config.enabled) {
      ctx.logger.warn("Counting game plugin is disabled in config");
      return;
    }

    // Get core-utils plugin
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.error("core-utils plugin is required but not available");
      throw new Error("core-utils plugin required");
    }
    const api = coreUtils.api;

    // Create repositories
    const gameRepo = createGameRepo(ctx, api);
    const statsRepo = createStatsRepo(ctx, api);

    // Store references for onUnload
    pluginCtx = ctx;
    pluginApi = api;
    pluginGameRepo = gameRepo;

    // ============ Register Commands ============
    ctx.registerCommand(createCountingCommand(ctx, api, gameRepo, statsRepo));

    // ============ Register Event Handlers ============
    ctx.registerEvent(createMessageHandler(ctx, api, gameRepo, statsRepo));

    // ============ Ready Event ============
    ctx.registerEvent({
      name: "clientReady",
      once: true,
      async execute(ctx, client) {
        ctx.logger.info("Counting game plugin ready!");
        ctx.logger.info(`Rules: Alternating=${ctx.config.alternatingAccounts}, AllowTalking=${ctx.config.allowTalking}, ResetOnFail=${ctx.config.resetOnFail}`);

        // Send "Back Online" Status to All Counting Channels
        try {
          const allGames = await gameRepo.all();
          ctx.logger.info(`Sending "back online" status to ${allGames.length} counting channels`);

          for (const game of allGames) {
            try {
              const channel = await client.channels.fetch(game.channel_id);
              if (channel?.isTextBased() && !channel.isDMBased()) {
                const embed = api.embeds.success(
                  `🟢 **Navi Bot is back online!**\n\nCounting has resumed. Continue from **${game.current_count}**.`,
                  "Counting Resumed"
                );
                await channel.send({ embeds: [embed] });
                ctx.logger.debug(`Sent "back online" status to channel ${game.channel_id}`);
              }
            } catch (error) {
              ctx.logger.error(`Failed to send "back online" status to channel ${game.channel_id}:`, error);
            }
          }
        } catch (error) {
          ctx.logger.error("Failed to send 'back online' status embeds:", error);
        }
      },
    });

    // Register statistics provider
    const statisticsPlugin = ctx.getPlugin<{ api: StatisticsAPI }>("statistics");
    if (statisticsPlugin?.api) {
      statisticsPlugin.api.registerProvider({
        id: "counting-game-stats",
        category: "Counting Game",
        priority: 70,
        collect: async () => {
          // Get all games
          const allGames = await gameRepo.all();

          // Calculate aggregate stats
          const totalGames = allGames.length;
          const totalCounts = allGames.reduce((sum, g) => sum + g.total_counts, 0);
          const totalFails = allGames.reduce((sum, g) => sum + g.total_fails, 0);
          const highestScore = Math.max(0, ...allGames.map(g => g.high_score));
          const activeGames = allGames.filter(g => g.current_count > 0).length;

          return {
            "Active Games": activeGames.toLocaleString(),
            "Total Channels": totalGames.toLocaleString(),
            "Total Counts": totalCounts.toLocaleString(),
            "Total Fails": totalFails.toLocaleString(),
            "Highest Score": highestScore.toLocaleString(),
          };
        },
      });
      ctx.logger.info("Registered counting-game statistics provider");
    }

    ctx.logger.info("Counting game plugin loaded successfully!");
  },

  // ============ Unload Handler ============
  async onUnload() {
    if (!pluginCtx || !pluginApi || !pluginGameRepo) {
      return; // Plugin wasn't fully loaded
    }

    try {
      pluginCtx.logger.debug("Starting counting game unload...");
      const allGames = await pluginGameRepo.all();

      if (allGames.length === 0) {
        pluginCtx.logger.debug("No counting channels to notify");
        return;
      }

      pluginCtx.logger.info(`Sending "going offline" status to ${allGames.length} counting channels`);

      const sendPromises: Promise<void>[] = [];

      for (const game of allGames) {
        const sendPromise = (async () => {
          try {
            const channel = await pluginCtx!.client.channels.fetch(game.channel_id);
            if (channel?.isTextBased() && !channel.isDMBased()) {
              const embed = pluginApi!.embeds.warning(
                `🔴 **Navi Bot is going offline. No messages will be counted.**\n\nCounting is currently at **${game.current_count}**. It will resume when Navi Bot comes back online.`,
                "Counting Paused"
              );
              await channel.send({ embeds: [embed] });
              pluginCtx!.logger.debug(`Sent "going offline" status to channel ${game.channel_id}`);
            }
          } catch (error) {
            pluginCtx!.logger.error(`Failed to send "going offline" status to channel ${game.channel_id}:`, error);
          }
        })();

        sendPromises.push(sendPromise);
      }

      // Wait for all messages to send (with timeout)
      await Promise.race([
        Promise.all(sendPromises),
        new Promise(resolve => setTimeout(resolve, 2000)) // 2 second max wait
      ]);

      pluginCtx.logger.info("Counting game cleanup complete");
    } catch (error) {
      pluginCtx?.logger.error("Failed to send 'going offline' status embeds:", error);
    }
  },
};

export default plugin;

/**
 * USAGE GUIDE:
 *
 * SETUP:
 * 1. Use `/counting setup #channel` to create a counting channel
 * 2. Start counting from 1 in that channel
 * 3. Users count sequentially: 1, 2, 3, 4, ...
 *
 * RULES:
 * - Count must be sequential (if current is 5, next must be 6)
 * - If alternatingAccounts is true, users must alternate
 * - If allowTalking is false, non-counting messages are deleted
 * - If resetOnFail is true, count resets to 0 on mistakes
 *
 * COMMANDS:
 * - `/counting setup #channel` - Set up a counting channel (Admin)
 * - `/counting remove #channel` - Remove a counting channel (Admin)
 * - `/counting status [#channel]` - View current count and stats
 * - `/counting reset [#channel]` - Reset the count to 0 (Admin)
 * - `/counting leaderboard [type]` - View leaderboards
 * - `/counting stats [user]` - View user statistics
 *
 * CONFIGURATION (config/counting-game.yaml):
 * - enabled: Enable/disable the plugin
 * - alternatingAccounts: Require users to alternate
 * - allowTalking: Allow non-counting messages
 * - reactions.success: Emoji for correct counts (default: ✅)
 * - reactions.failure: Emoji for incorrect counts (default: ❌)
 * - resetOnFail: Reset count on mistakes
 * - milestones.enabled: Announce milestones
 * - milestones.interval: Milestone interval (default: 100)
 *
 * TIPS:
 * - Set up dedicated counting channels for best experience
 * - Use alternatingAccounts=true for more challenging gameplay
 * - Set allowTalking=false to keep counting channels clean
 * - Check leaderboards to see top counters!
 */
