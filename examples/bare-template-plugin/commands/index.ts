import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { PluginDataRepository } from "../db/repository";
import { TemplateConfig } from "../plugin";

// ============ Main Command ============
export function createItemCommand(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: PluginDataRepository
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("items")
      .setDescription("Manage your items")
      .addSubcommand(sub =>
        sub.setName("list")
          .setDescription("View all your items")
      ),

    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "list":
          await handleList(ctx, api, itemRepo, interaction);
          break;
      }
    },
  };
}

// ============ Subcommand Handlers ============

/**
 * List all items with pagination
 */
async function handleList(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: PluginDataRepository,
  interaction: ChatInputCommandInteraction
) {
  const items = await itemRepo.getUserItems(interaction.user.id);

  if (items.length === 0) {
    const embed = api.embeds.info("You don't have any items yet!\nUse `/items add` to create one.", "No Items");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Use pagination helper for long lists
  await api.paginate(interaction, {
    items,
    formatPage: (pageItems, page, totalPages) => {
      const description = pageItems
        .map((item, i) => {
          const index = page * 10 + i + 1;
          const desc = item.description ? `\n  *${item.description}*` : '';
          return `**${index}.** ${item.name} (×${item.quantity})${desc}`;
        })
        .join("\n\n");

      return api.embeds.primary(description, "📦 Your Items")
        .setFooter({ text: `Page ${page + 1}/${totalPages} • ${items.length} total items` })
        .setTimestamp();
    },
    itemsPerPage: 10,
  });
}
