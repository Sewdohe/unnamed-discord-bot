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
import { createExamplePluginDataRepo } from "./db/repository";
import { createItemCommand } from "./commands";

// ============ Configuration Schema ============

/**
 * Define your plugin's configuration using Zod
 * This will auto-generate a YAML config file in config/template-plugin.yaml
 */
const configSchema = z.object({
  // Enable/disable the plugin
  enabled: z.boolean().default(true).describe("Enable or disable the template plugin"),

  // Maximum items per user
  someNumberConfig: z.number()
    .min(1)
    .max(1000)
    .default(50)
    .describe("Maximum number of items a user can have"),

  // Nested configuration example
  features: z.object({
    enableThis: z.boolean().default(true),
    enableThat: z.boolean().default(true),
  }).default({
    enableThis: true,
    enableThat: true,
  }),
}).describe("Template Plugin Configuration");

// Infer TypeScript type from schema
export type TemplateConfig = z.infer<typeof configSchema>;

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  // ============ Manifest ============
  manifest: {
    name: "template-plugin",
    version: "1.0.0",
    description: "A comprehensive template plugin demonstrating best practices",
    author: "Your Name",
    dependencies: {
      // Hard dependencies - bot fails to start if missing
      hard: ["core-utils"],
      // Soft dependencies - loaded first if present, ignored if missing
      soft: [],
    },
  },

  // ============ Configuration ============
  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
      someNumberConfig: 50,
      features: {
        enableThis: true,
        enableThat: true,
      },
    },
  },

  // ============ Load Handler ============
  async onLoad(ctx: PluginContext<TemplateConfig>) {
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
    const itemRepo = createExamplePluginDataRepo(ctx, api);

    // ============ Register Commands ============
    ctx.registerCommand(createItemCommand(ctx, api, itemRepo));


    // ============ Plugin Loaded ============
    ctx.logger.info("Template plugin loaded successfully!");
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
