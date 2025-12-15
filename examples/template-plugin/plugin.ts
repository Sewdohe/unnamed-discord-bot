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
import type { CoreUtilsAPI } from "../../plugins/core-utils/plugin";
import { createItemRepo, initDatabase } from "./db/repository";
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
  maxItemsPerUser: z.number()
    .min(1)
    .max(1000)
    .default(50)
    .describe("Maximum number of items a user can have"),

  // Default quantity when adding items
  defaultQuantity: z.number()
    .min(1)
    .max(999)
    .default(1)
    .describe("Default quantity when adding new items"),

  // Enable notifications
  enableNotifications: z.boolean()
    .default(true)
    .describe("Send notifications for item events"),

  // Nested configuration example
  features: z.object({
    enableTransfers: z.boolean().default(true),
    enableStats: z.boolean().default(true),
  }).default({}),
}).describe("Template Plugin Configuration");

// Infer TypeScript type from schema
type TemplateConfig = z.infer<typeof configSchema>;

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
      maxItemsPerUser: 50,
      defaultQuantity: 1,
      enableNotifications: true,
      features: {
        enableTransfers: true,
        enableStats: true,
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

    // Initialize database and create repository
    await initDatabase(ctx);
    const itemRepo = createItemRepo(ctx, api);

    // ============ Register Commands ============
    ctx.registerCommand(createItemCommand(ctx, api, itemRepo));

    // ============ Register UI Components ============
    // Example: Interactive buttons for item actions
    api.components.define(ctx, {
      id: "item-actions",
      scope: "message", // Scoped to specific messages
      components: [
        { customId: "view", label: "View", style: ButtonStyle.Primary },
        { customId: "delete", label: "Delete", style: ButtonStyle.Danger },
        { customId: "stats", label: "Stats", style: ButtonStyle.Secondary },
      ],
      handler: async (pluginCtx, interaction, meta) => {
        const action = meta.componentId;

        switch (action) {
          case "view":
            const items = await itemRepo.getUserItems(interaction.user.id);
            const embed = api.embeds.info(
              items.length > 0
                ? items.map(i => `**${i.name}** (×${i.quantity})`).join("\n")
                : "No items found!",
              "Your Items"
            );
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            break;

          case "delete":
            await interaction.reply({
              content: "Use `/items delete <name>` to delete an item",
              flags: MessageFlags.Ephemeral,
            });
            break;

          case "stats":
            const count = await itemRepo.countUserItems(interaction.user.id);
            const total = await itemRepo.getTotalQuantity(interaction.user.id);
            const statsEmbed = api.embeds.primary(
              `**Total Items:** ${count}\n**Total Quantity:** ${total}`,
              "📊 Statistics"
            );
            await interaction.reply({ embeds: [statsEmbed], flags: MessageFlags.Ephemeral });
            break;
        }
      },
    });

    // ============ Register Event Handlers ============

    // Example: Log when plugin is ready
    ctx.registerEvent({
      name: "clientReady",
      once: true,
      async execute(ctx, client) {
        ctx.logger.info(`Template plugin ready on ${client.guilds.cache.size} guilds`);
      },
    });

    // Example: Welcome new members with item info
    if (ctx.config.enableNotifications) {
      ctx.registerEvent({
        name: "guildMemberAdd",
        async execute(ctx, member) {
          if (member.user.bot) return;

          ctx.logger.info(`New member joined: ${member.user.tag}`);

          // You could send them a welcome DM here
          // try {
          //   await member.send(`Welcome to the server! Use \`/items add\` to get started.`);
          // } catch (error) {
          //   ctx.logger.debug("Could not send DM to new member");
          // }
        },
      });
    }

    // Example: Log item-related messages (demonstration only)
    ctx.registerEvent({
      name: "messageCreate",
      async execute(ctx, message) {
        if (message.author.bot) return;

        // Example: React to messages containing "item"
        if (message.content.toLowerCase().includes("!items")) {
          await message.reply("💡 Use `/items` to manage your items!");
        }
      },
    });

    // ============ Plugin Loaded ============
    ctx.logger.info("Template plugin loaded successfully!");
    ctx.logger.info(`Configuration: ${ctx.config.maxItemsPerUser} max items per user`);
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

/**
 * HOW TO USE THIS TEMPLATE:
 *
 * 1. Copy this entire directory to `plugins/your-plugin-name/`
 * 2. Update the manifest (name, version, description, author)
 * 3. Define your data types in db/repository.ts
 * 4. Create your repository methods
 * 5. Define your configuration schema
 * 6. Create your commands in commands/index.ts
 * 7. Add any event handlers you need
 * 8. Test your plugin!
 *
 * BEST PRACTICES:
 *
 * - Always use the repository pattern for database access
 * - Use async/await for all database operations
 * - Validate user input with Zod schemas
 * - Handle errors gracefully with try/catch
 * - Use the core-utils API for embeds, confirmations, and pagination
 * - Create database indexes for frequently queried fields
 * - Log important events with ctx.logger
 * - Use TypeScript types for everything
 * - Document your functions with JSDoc comments
 * - Keep your code organized in separate files
 *
 * COMMON PATTERNS:
 *
 * - Repository pattern: db/repository.ts
 * - Command handlers: commands/index.ts
 * - Configuration: Zod schema + YAML file
 * - UI components: core-utils api.components
 * - Pagination: api.paginate()
 * - Confirmations: api.confirm()
 * - Embeds: api.embeds.*
 */
