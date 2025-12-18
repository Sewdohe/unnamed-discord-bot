import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { TicketsRepository } from "../db/repository";
import { TicketsPluginConfig } from "../plugin";

// ============ Main Command ============
export function ticketsAdminCommand(
  ctx: PluginContext<TicketsPluginConfig>,
  api: CoreUtilsAPI,
  itemRepo: TicketsRepository
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("tickets-admin")
      .setDescription("Manage your guilds' support tickets")
      .addSubcommand(sub =>
        sub.setName("send-ticket-panel")
          // NOTE: how to add options to commands based on data
          //       I don't need it here now, select menu will handle it
          // .addStringOption(option =>
          //   option.setName("category")
          //     .setDescription("The ticket category to send the panel for")
          //     .setRequired(true)
          //     .addChoices(
          //       ...ctx.config.categories.map(cat => ({ name: cat.name, value: cat.name }))
          //     )
          // )
          .setDescription("Send a ticket panel to a category channel")
      ),

    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "send-ticket-panel":
          await handleSendTicketPanel(ctx, api, itemRepo, interaction);
          break;
      }
    },
  };
}

// ============ Subcommand Handlers ============

/**
 * List all items with pagination
 */
async function handleSendTicketPanel(
  ctx: PluginContext<TicketsPluginConfig>,
  api: CoreUtilsAPI,
  ticketsRepo: TicketsRepository,
  interaction: ChatInputCommandInteraction
) {

  // Acknowledge the command
  // await interaction.deferReply({ ephemeral: true });

  // Create embed
  const embed = new EmbedBuilder()
    .setTitle("Support Ticket Panel Generation")
    .setDescription("Use the select menu below to choose a ticket category.");

  let categorySelectMenuOptions = ctx.config.categories.map(cat => ({
    label: cat.name,
    value: cat.name,
  }));

  const ticketCategorySelectMenu = api.components.build(ctx, "ticket-category-select");

  await interaction.reply({ embeds: [embed], components: ticketCategorySelectMenu, flags: MessageFlags.Ephemeral });
  return;
}
