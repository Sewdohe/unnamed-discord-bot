import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import type { Command, PluginContext } from "@types";
import type { EconomyAPI } from "../plugin";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { UserRepository } from "../db/repository";

export function createLeaderboardCommand<T>(
  ctx: PluginContext<T extends { currencyName: string; currencyEmoji: string; leaderboardPageSize: number } ? T : any>,
  economyAPI: EconomyAPI,
  coreUtilsAPI: CoreUtilsAPI,
  userRepo: UserRepository
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription("View the server's richest users")
      .setDMPermission(false)
      .addIntegerOption(opt =>
        opt.setName("page").setDescription("Page number (default: 1)").setRequired(false).setMinValue(1)
      ),

    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "This command can only be used in servers!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const config = ctx.config as any;
      const pageSize = config.leaderboardPageSize;

      try {
        // Get total users for pagination calculation
        const totalUsers = await userRepo.getTotalUsers(interaction.guildId);

        if (totalUsers === 0) {
          await interaction.reply({
            content: `No one has earned any ${config.currencyName} yet! Start chatting to earn some!`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const totalPages = Math.ceil(totalUsers / pageSize);
        const requestedPage = interaction.options.getInteger("page") || 1;
        const page = Math.max(1, Math.min(requestedPage, totalPages));
        const offset = (page - 1) * pageSize;

        // Get leaderboard data
        const leaderboard = await economyAPI.getLeaderboard(interaction.guildId, pageSize, offset);

        if (leaderboard.length === 0) {
          await interaction.reply({
            content: "No users found on this page.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Build leaderboard description
        const description = await Promise.all(
          leaderboard.map(async (entry, index) => {
            const rank = offset + index + 1;
            const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**${rank}.**`;

            // Fetch user from Discord
            let username = "Unknown User";
            try {
              const user = await ctx.client.users.fetch(entry.userId);
              username = user.username;
            } catch (error) {
              ctx.logger.debug(`Failed to fetch user ${entry.userId}:`, error);
            }

            return `${medal} **${username}** - ${config.currencyEmoji} ${entry.balance.toLocaleString()} ${config.currencyName}`;
          })
        );

        // Build embed
        const embed = new EmbedBuilder()
          .setTitle(`${config.currencyEmoji} ${interaction.guild?.name} Leaderboard`)
          .setDescription(description.join("\n"))
          .setColor(0xffd700)
          .setFooter({ text: `Page ${page} of ${totalPages} • ${totalUsers.toLocaleString()} total users` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        ctx.logger.error("Error in leaderboard command:", error);
        await interaction.reply({
          content: "An error occurred while fetching the leaderboard. Please try again.",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  };
}
