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

import { TextChannel, SlashCommandBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SelectMenuOptionBuilder, StringSelectMenuInteraction, Message } from "discord.js";
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
    channelID: z.string().describe("Discord Channel ID where the ticket panel will be created."),
    categoryID: z.string().describe("Discord Category ID where tickets will be created."),
  })).default([
    { name: "General Support", channelID: "1450874566166712350", categoryID: "1451402044358266981" },
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
        { name: "General Support", channelID: "1450874566166712350", categoryID: "1451402044358266981" },
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
    api.components.defineSelectMenuGroup(ctx, {
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
        const categoryName = interaction.values[0];
        const category = ctx.config.categories.find(c => c.name === categoryName);

        if (!category || !category.channelID) {
            await interaction.reply({ content: "This category is not configured correctly. Please contact an admin.", flags: MessageFlags.Ephemeral });
            return;
        }

        try {
            const channel = await ctx.client.channels.fetch(category.channelID);
            if (!channel || !channel.isTextBased()) {
                await interaction.reply({ content: "The configured channel for this category could not be found or is not a text channel.", flags: MessageFlags.Ephemeral });
                return;
            }

            const panelEmbed = new EmbedBuilder()
                .setTitle("Support Tickets")
                .setDescription(`To open a ticket in the **${category.name}** category, please click the button below.`)
                .setColor("Blue");

            const actionBar = api.components.build(ctx, "ticket-action-bar");

            await (channel as TextChannel).send({
                embeds: [panelEmbed],
                components: actionBar,
            });

            await interaction.reply({ content: `Ticket panel for '${category.name}' has been sent to ${channel}.`, flags: MessageFlags.Ephemeral });

        } catch (error) {
            ctx.logger.error(`Failed to send ticket panel for category ${categoryName}:`, error);
            await interaction.reply({ content: "An error occurred while trying to send the ticket panel. Please check my permissions.", flags: MessageFlags.Ephemeral });
        }
      }
    });

    // Define a sample modal for creating tickets
    const createTicketModal = api.components.defineModal(ctx, {
      id: "create-ticket-modal",
      title: "Create New Ticket",
      components: [
        {
          customId: "ticket-subject",
          label: "Subject",
          style: "Short",
          required: true,
          placeholder: "Briefly describe the purpose of your ticket.",
        },
        {
          customId: "ticket-description",
          label: "Description",
          style: "Paragraph",
          required: false,
          placeholder: "Provide more details here (optional).",
        },
      ],
      async handler(pluginCtx, interaction) {
        const subject = interaction.fields.getTextInputValue("ticket-subject");
        const description = interaction.fields.getTextInputValue("ticket-description");

        ctx.logger.info(`New ticket created by ${interaction.user.tag}. Subject: ${subject}, Description: ${description}`);

        // In a real scenario, you'd create a new ticket channel, log to DB, etc.
        await interaction.reply({
          content: `Your ticket for "${subject}" has been submitted! We'll get back to you shortly.`,
          flags: MessageFlags.Ephemeral,
        });
      },
    });

    // Define the action bar for the ticket panel
    api.components.defineButtonGroup(ctx, {
        id: "ticket-action-bar",
        scope: "global",
        components: [
            {
                customId: "create-ticket",
                label: "Create Ticket",
                style: ButtonStyle.Success,
                emoji: "➕",
            },
        ],
        async handler(pluginCtx, interaction) {
            // Show the modal when the "Create Ticket" button is clicked
            await interaction.showModal(createTicketModal);
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
