import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import type { Command, PluginContext } from "@types";
import type { EconomyAPI } from "../plugin";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

export function createBalanceCommand<T>(
  ctx: PluginContext<T extends { currencyName: string; currencyEmoji: string } ? T : any>,
  economyAPI: EconomyAPI,
  coreUtilsAPI: CoreUtilsAPI
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("balance")
      .setDescription("Check your balance or another user's balance")
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user").setDescription("User to check balance for (default: you)").setRequired(false)
      ),

    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "This command can only be used in servers!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const targetUser = interaction.options.getUser("user") || interaction.user;
      const config = ctx.config as any;

      try {
        // Get balance and rank
        const balance = await economyAPI.getBalance(interaction.guildId, targetUser.id);
        const rank = await economyAPI.getUserRank(interaction.guildId, targetUser.id);

        // Build embed
        const embed = new EmbedBuilder()
          .setTitle(`${config.currencyEmoji} Balance`)
          .setDescription(
            `**${targetUser.username}**'s balance:\n` +
            `${config.currencyEmoji} **${balance.toLocaleString()}** ${config.currencyName}`
          )
          .setColor(0x5865f2)
          .setThumbnail(targetUser.displayAvatarURL())
          .setTimestamp();

        if (rank !== null) {
          embed.addFields({
            name: "Rank",
            value: `#${rank.toLocaleString()}`,
            inline: true,
          });
        }

        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        ctx.logger.error("Error in balance command:", error);
        await interaction.reply({
          content: "An error occurred while fetching the balance. Please try again.",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  };
}
