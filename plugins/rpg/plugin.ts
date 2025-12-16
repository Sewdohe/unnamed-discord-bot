/**
 * Template Plugin
 *
 * A comprehensive example plugin demonstrating best practices for:
 * - MongoDB database usage with repository pattern
 * - Configuration with Zod schemas
 * - Slash commands with subcommands
 * - Event handlers
 * - UI components (buttons)
 * - Cross-plugin communication
 * - Error handling
 * - TypeScript types
 *
 * Use this as a starting point for your own plugins!
 */

import { ButtonStyle, MessageFlags } from "discord.js";
import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import { createRPGProfileRepository, initDatabase } from "./db/repository";
import { rpgMenuCommand } from "./commands";
import { StatisticsAPI } from "plugins/statistics/plugin";

// ============ Configuration Schema ============

/**
 * Define your plugin's configuration using Zod
 * This will auto-generate a YAML config file in config/template-plugin.yaml
 */
const configSchema = z.object({
  // Enable/disable the plugin
  enabled: z.boolean().default(true).describe("Enable or disable the template plugin"),
  // Nested configuration example
  // features: z.object({
  //   enableTransfers: z.boolean().default(true),
  //   enableStats: z.boolean().default(true),
  // }).default({}),
}).describe("RPG Plugin Configuration");

// Infer TypeScript type from schema
type RPGConfig = z.infer<typeof configSchema>;

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  // ============ Manifest ============
  manifest: {
    name: "rpg",
    version: "1.0.0",
    description: "A fun plugin that allows players to level up and battle each other.",
    author: "Sewdohe",
    dependencies: {
      // Hard dependencies - bot fails to start if missing
      hard: ["core-utils"],
      // Soft dependencies - loaded first if present, ignored if missing
      soft: ["statistics"],
    },
  },

  // ============ Configuration ============
  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
    },
  },

  // ============ Load Handler ============
  async onLoad(ctx: PluginContext<RPGConfig>) {
    // Check if plugin is enabled
    if (!ctx.config.enabled) {
      ctx.logger.warn("Plugin is disabled in config");
      return;
    }

    // Get core-utils plugin for database and UI helpers
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.error("core-utils plugin is required but not available");
      throw new Error("core-utils plugin required");
    }
    const api = coreUtils.api;

    // Initialize database and create repository
    await initDatabase(ctx);
    const rpgProfileRepo = createRPGProfileRepository(ctx, api);

    // ============ Register Commands ============
    ctx.registerCommand(rpgMenuCommand(ctx, api, rpgProfileRepo));

    // ============ Register UI Components ============
    // Example: Interactive buttons for item actions
    api.components.define(ctx, {
      id: "manage-profile",
      scope: "message", // Scoped to specific messages
      components: [
        { customId: "choose-class", label: "Choose Class", style: ButtonStyle.Primary },
        { customId: "list-profiles", label: "List Profiles", style: ButtonStyle.Primary },
      ],
      handler: async (pluginCtx, interaction, meta) => {
        const action = meta.componentId;

        switch (action) {
          case "list-profiles":
            const profiles = await rpgProfileRepo.getUserRPGProfiles(interaction.user.id);
            const embed = api.embeds.info(
              profiles.length > 0
                ? profiles.map(p => `**${p.name}** (Level ${p.level})`).join("\n")
                : "No profiles found!",
              "Your RPG Profiles"
            );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            break;
        }
      },
    });

    const statisticsPlugin = ctx.getPlugin<{ api: StatisticsAPI }>("statistics");
    if (statisticsPlugin?.api) {
      statisticsPlugin.api.registerProvider({
        id: "rpg-stats",
        category: "RPG",
        priority: 60,
        collect: async () => {
          const repo = rpgProfileRepo

          // Get all records
          const allRecords = await repo.all();
          const totalRecords = allRecords.length;

          return {
            "Total Players": totalRecords.toLocaleString(),
          };
        },
      });
      ctx.logger.info("Registered RPG statistics provider");
    }

    // ============ Plugin Loaded ============
    ctx.logger.info("RPG plugin loaded successfully!");
  },

  // ============ Unload Handler ============
  async onUnload() {
    // Clean up resources when plugin is unloaded
    // - Close database connections (if not using shared connection)
    // - Clear intervals/timeouts
    // - Remove event listeners
    // - etc.
  },
};

// ============ Export ============
export default plugin;
