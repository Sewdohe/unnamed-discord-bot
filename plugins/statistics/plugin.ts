/**
 * Statistics Plugin
 *
 * A plugin that collects and displays bot statistics in an auto-updating embed.
 *
 * Features:
 * - Provider pattern for plugins to submit statistics
 * - Auto-updating pinned message
 * - Default bot statistics via core-utils
 * - Configurable update interval
 * - Admin commands for setup and management
 *
 * Usage:
 * 1. Set up with `/statistics setup #channel`
 * 2. Other plugins can register stat providers via the exposed API
 * 3. Statistics auto-update based on configured interval
 */

import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import { createStatCollector, type StatProvider } from "./collector";
import { createEmbedManager } from "./embed-manager";
import { createStatisticsCommand } from "./commands";

// ============ Configuration Schema ============

const configSchema = z.object({
  enabled: z.boolean()
    .default(true)
    .describe("Enable or disable the statistics plugin"),

  updateInterval: z.number()
    .min(60000)  // Minimum 1 minute
    .max(3600000) // Maximum 1 hour
    .default(300000) // Default 5 minutes
    .describe("Update interval in milliseconds"),

  statisticsChannelId: z.string()
    .optional()
    .describe("Pre-configured channel ID for statistics display"),

  embedColor: z.number()
    .default(0x5865f2)
    .describe("Embed color (hex number)"),
});

type StatisticsConfig = z.infer<typeof configSchema>;

// ============ API Definition ============

export interface StatisticsAPI {
  /**
   * Register a stat provider
   * @param provider - Stat provider to register
   */
  registerProvider(provider: StatProvider): void;

  /**
   * Unregister a stat provider
   * @param id - Provider ID to remove
   */
  unregisterProvider(id: string): boolean;

  /**
   * Force an immediate update of the statistics display
   */
  forceUpdate(): Promise<void>;
}

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> & { api?: StatisticsAPI } = {
  manifest: {
    name: "statistics",
    version: "1.0.0",
    description: "Bot statistics collection and display system",
    author: "System",
    dependencies: {
      hard: ["core-utils"],
      soft: [],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
      updateInterval: 10000, // 5 minutes
      statisticsChannelId: "1449924841732837386",
      embedColor: 0x5865f2,
    },
  },

  api: null as unknown as StatisticsAPI,

  async onLoad(ctx: PluginContext<StatisticsConfig>) {
    if (!ctx.config.enabled) {
      ctx.logger.warn("Statistics plugin is disabled in config");
      return;
    }

    // Get core-utils API
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.error("core-utils plugin is required but not available");
      throw new Error("core-utils plugin required");
    }
    const api = coreUtils.api;


    // Create collector and embed manager
    const collector = createStatCollector(ctx);
    const embedManager = createEmbedManager(ctx, ctx.config.embedColor);

    // set channel if pre-configured
    if (ctx.config.statisticsChannelId) {
      embedManager.setChannel(ctx.config.statisticsChannelId);
    }

    // ============ Register Default Stats Provider ============
    if (api.getDefaultStats) {
      collector.registerProvider({
        id: "core-utils-default",
        category: "Bot Statistics",
        priority: 100, // High priority to show first
        collect: () => {
          const stats = api.getDefaultStats!();
          return {
            "Uptime": stats.uptime,
            "Messages": stats.messageCount.toLocaleString(),
            "Commands": stats.commandCount.toLocaleString(),
            "Active Users (24h)": stats.activeUsers24h.toLocaleString(),
            "Total Members": stats.totalMembers.toLocaleString(),
            "Total Channels": stats.totalChannels.toLocaleString(),
            "Guilds": stats.totalGuilds.toLocaleString(),
          };
        },
      });
      ctx.logger.info("Registered default stats provider");
    }

    // ============ Update Function ============
    const updateStats = async () => {
      try {
        const stats = await collector.collectAll();
        const success = await embedManager.update(stats);

        if (success) {
          ctx.logger.debug("Statistics updated successfully");
        }
      } catch (error) {
        ctx.logger.error("Failed to update statistics:", error);
      }
    };

    // ============ Schedule Auto-Updates ============
    api.scheduler.interval(
      "statistics-update",
      ctx.config.updateInterval,
      updateStats
    );
    ctx.logger.info(`Scheduled statistics updates every ${ctx.config.updateInterval / 60000} minutes`);

    // ============ Register Commands ============
    ctx.registerCommand(createStatisticsCommand(ctx, collector, embedManager, updateStats));

    // ============ Expose API ============
    const statisticsAPI: StatisticsAPI = {
      registerProvider(provider: StatProvider): void {
        collector.registerProvider(provider);
      },

      unregisterProvider(id: string): boolean {
        return collector.unregisterProvider(id);
      },

      async forceUpdate(): Promise<void> {
        await updateStats();
      },
    };

    (this as any).api = statisticsAPI;

    // ============ Ready Event ============
    ctx.registerEvent({
      name: "clientReady",
      once: true,
      async execute(pluginCtx, client) {
        ctx.logger.info("Statistics plugin ready!");
        ctx.logger.info(`Registered ${collector.getProviderCount()} stat provider(s)`);
      },
    });

    ctx.logger.info("Statistics plugin loaded successfully!");
  },

  async onUnload() {
    // Cleanup handled by scheduler in core-utils
  },
};

export default plugin;

/**
 * USAGE GUIDE:
 *
 * SETUP:
 * 1. Use `/statistics setup #channel` to set up the display channel
 * 2. Statistics will auto-update based on configured interval
 *
 * COMMANDS:
 * - `/statistics setup #channel` - Set up statistics display (Admin)
 * - `/statistics refresh` - Manually refresh statistics (Admin)
 * - `/statistics status` - View plugin status (Admin)
 *
 * FOR PLUGIN DEVELOPERS:
 * Register your own stat providers:
 *
 * ```typescript
 * const stats = ctx.getPlugin<{ api: StatisticsAPI }>("statistics");
 * if (stats?.api) {
 *   stats.api.registerProvider({
 *     id: "my-plugin-stats",
 *     category: "My Plugin",
 *     priority: 50,
 *     collect: async () => ({
 *       "Active Games": gameCount,
 *       "Total Players": playerCount,
 *     }),
 *   });
 * }
 * ```
 *
 * CONFIGURATION (config/statistics.yaml):
 * - enabled: Enable/disable the plugin
 * - channelId: Pre-configured channel ID for display
 * - updateInterval: Update interval in milliseconds (default: 300000 = 5 minutes)
 * - embedColor: Embed color as hex number (default: 0x5865f2)
 */
