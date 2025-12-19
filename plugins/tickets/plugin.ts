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

import { TextChannel, SlashCommandBuilder, ButtonStyle, EmbedBuilder, MessageFlags, SelectMenuOptionBuilder, StringSelectMenuInteraction, Message, TextInputStyle } from "discord.js";
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
    questions: z.array(z.object({
      label: z.string().describe("Question label"),
      style: z.enum(["Short", "Paragraph"]).default("Short").describe("Input style (Short or Paragraph)"),
      required: z.boolean().default(true).describe("Whether the question is required"),
      placeholder: z.string().optional().describe("Placeholder text"),
      maxLength: z.number().optional().describe("Maximum length for the input"),
    })).min(1).max(5).describe("Questions to ask in the ticket form (1-5 questions)"),
  })).default([
    {
      name: "General Support",
      channelID: "1450874566166712350",
      categoryID: "1451402044358266981",
      questions: [
        { label: "Subject", style: "Short" as const, required: true, placeholder: "Brief description of your issue" },
        { label: "Description", style: "Paragraph" as const, required: true, placeholder: "Detailed information about your issue" },
      ],
    },
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
        {
          name: "General Support",
          channelID: "1450874566166712350",
          categoryID: "1451402044358266981",
          questions: [
            { label: "Subject", style: "Short" as const, required: true, placeholder: "Brief description of your issue" },
            { label: "Description", style: "Paragraph" as const, required: true, placeholder: "Detailed information about your issue" },
          ],
        },
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
            // Find which category this button was clicked in
            const buttonChannelId = interaction.channelId;
            const category = ctx.config.categories.find(cat => cat.channelID === buttonChannelId);

            if (!category) {
                await interaction.reply({
                    content: "Could not determine ticket category. Please contact an admin.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            // Build modal dynamically based on category's questions
            const modalComponents = category.questions.map((q, index) => ({
                customId: `question-${index}`,
                label: q.label,
                style: q.style === "Short" ? TextInputStyle.Short : TextInputStyle.Paragraph,
                required: q.required,
                placeholder: q.placeholder,
                maxLength: q.maxLength,
            }));

            const modal = api.components.modal({
                customId: `create-ticket:${category.name}`,
                title: `${category.name} Ticket`,
                components: modalComponents,
            });

            await interaction.showModal(modal);
        }
    });

    // Handle ticket modal submissions
    ctx.registerEvent({
        name: "interactionCreate",
        async execute(pluginCtx, interaction) {
            if (!interaction.isModalSubmit()) return;
            if (!interaction.customId.startsWith("create-ticket:")) return;

            // Extract category name from customId
            const categoryName = interaction.customId.split(":")[1];
            const category = ctx.config.categories.find(cat => cat.name === categoryName);

            if (!category) {
                await interaction.reply({
                    content: "Could not find ticket category configuration.",
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                // Collect answers from the modal
                const answers: Record<string, string> = {};
                category.questions.forEach((q, index) => {
                    answers[q.label] = interaction.fields.getTextInputValue(`question-${index}`);
                });

                // Create ticket channel in the Discord category
                const ticketNumber = Date.now().toString().slice(-6);
                const ticketChannelName = `ticket-${interaction.user.username}-${ticketNumber}`;

                const ticketChannel = await interaction.guild!.channels.create({
                    name: ticketChannelName,
                    parent: category.categoryID,
                    topic: `Support ticket from ${interaction.user.tag} | Category: ${category.name}`,
                    permissionOverwrites: [
                        {
                            id: interaction.guild!.id, // @everyone
                            deny: ["ViewChannel"],
                        },
                        {
                            id: interaction.user.id, // Ticket creator
                            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"],
                        },
                        {
                            id: ctx.client.user!.id, // Bot
                            allow: ["ViewChannel", "SendMessages", "ManageChannels"],
                        },
                    ],
                });

                // Save ticket to database
                const ticketId = await itemRepo.createTicket(
                    interaction.user.id,
                    answers[category.questions[0].label], // First question as name/subject
                    category.name,
                    JSON.stringify(answers) // Store all answers as JSON
                );

                // Send ticket details to the channel
                const ticketEmbed = new EmbedBuilder()
                    .setTitle(`Support Ticket: ${category.name}`)
                    .setDescription(Object.entries(answers).map(([key, value]) => `**${key}:**\n${value}`).join("\n\n"))
                    .addFields(
                        { name: "Ticket ID", value: ticketId, inline: true },
                        { name: "Category", value: category.name, inline: true },
                        { name: "Status", value: "🟢 Open", inline: true }
                    )
                    .setColor(0x5865f2)
                    .setTimestamp()
                    .setFooter({ text: `Created by ${interaction.user.tag}` });

                await ticketChannel.send({
                    content: `${interaction.user}, your support ticket has been created! A staff member will assist you shortly.`,
                    embeds: [ticketEmbed],
                });

                // Confirm to user
                await interaction.editReply({
                    content: `✅ Your ticket has been created! Please head to ${ticketChannel} to discuss your issue.`,
                });

                ctx.logger.info(`Ticket created: ${ticketChannelName} (ID: ${ticketId}) by ${interaction.user.tag}`);
            } catch (error) {
                ctx.logger.error("Error creating ticket:", error);
                try {
                    if (interaction.deferred) {
                        await interaction.editReply({
                            content: "An error occurred while creating your ticket. Please try again or contact an admin.",
                        });
                    } else {
                        await interaction.reply({
                            content: "An error occurred while creating your ticket. Please try again or contact an admin.",
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                } catch (replyError) {
                    ctx.logger.error("Failed to send error reply:", replyError);
                }
            }
        },
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
