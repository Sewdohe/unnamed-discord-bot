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

import { ButtonStyle, EmbedBuilder, MessageFlags, SelectMenuOptionBuilder } from "discord.js";
import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import { createTicketsRepo } from "./db/repository";
import { ticketsAdminCommand } from "./commands";

// ============ Configuration Schema ============

/**
 * Define your plugin's configuration using Zod
 * This will auto-generate a YAML config file in config/template-plugin.yaml
 */
const configSchema = z.object({
  // Enable/disable the plugin
  enabled: z.boolean().default(true).describe("Enable or disable the tickets plugin"),

  categories: z.array(z.object({
    name: z.string().describe("Name for the category"),
    channelID: z.string().describe("Discord Channel ID for the category. This is where tickets will be created under."),
  })).default([
    { name: "General Support", channelID: "" },
    { name: "Billing", channelID: "" },
    { name: "Technical Issues", channelID: "" },
  ]).describe("Configurable ticket categories"),

  // Nested configuration example
  features: z.object({
    enableThis: z.boolean().default(true),
    enableThat: z.boolean().default(true),
  }).default({
    enableThis: true,
    enableThat: true,
  }),
}).describe("Tickets & Support Plugin Configuration");

// Infer TypeScript type from schema
export type TicketsPluginConfig = z.infer<typeof configSchema>;

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  // ============ Manifest ============
  manifest: {
    name: "tickets-plugin",
    version: "1.0.0",
    description: "Allows users to create support tickets via commands and buttons",
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
      categories: [
        { name: "General Support", channelID: "" },
        { name: "Billing", channelID: "" },
        { name: "Technical Issues", channelID: "" },
      ],
      features: {
        enableThis: true,
        enableThat: true,
      },
    },
  },

  // ============ Load Handler ============
  async onLoad(ctx: PluginContext<TicketsPluginConfig>) {
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

    // create repository
    // mongodb will create the database/collections on first use
    const itemRepo = createTicketsRepo(ctx, api);

    // ============ Define UI Components ============
    api.components.define(ctx, {
      id: "ticket-category-select",
      scope: "global",
      components: [{
        customId: "ticket-category-select",
        placeholder: "Where would you like to generate a tickets panel?",
        minValues: 1,
        maxValues: 1,
        options: ctx.config.categories.map(cat => ({
          label: cat.name,
          value: cat.name,
        })),
        disabled: false,
      }],
      async handler(pluginCtx, interaction) {
        ctx.logger.info(`Ineraction looks like this for select menu: ${interaction.valueOf()}`);
        await interaction.reply({ content: `You selected: ${interaction.valueOf()}`, flags: MessageFlags.Ephemeral } );
      }
    });

    // ============ Register Commands ============
    ctx.registerCommand(ticketsAdminCommand(ctx, api, itemRepo));


    // ============ Plugin Loaded ============
    ctx.logger.info("Tickets plugin loaded successfully!");
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
