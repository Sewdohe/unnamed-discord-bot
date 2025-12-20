import { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } from "discord.js";
import type { Command, PluginContext } from "@types";
import type { EconomyAPI } from "../plugin";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

export function createHistoryCommand<T>(
  ctx: PluginContext<T extends { currencyName: string; currencyEmoji: string } ? T : any>,
  economyAPI: EconomyAPI,
  coreUtilsAPI: CoreUtilsAPI
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("history")
      .setDescription("View transaction history")
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user").setDescription("User to view history for (admin only)").setRequired(false)
      )
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

      const requestedUser = interaction.options.getUser("user");
      const page = interaction.options.getInteger("page") || 1;
      const config = ctx.config as any;

      // Determine target user
      let targetUser = interaction.user;
      if (requestedUser) {
        // Check if user has permission to view other users' history
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({
            content: "❌ You need Manage Server permission to view other users' transaction history!",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        targetUser = requestedUser;
      }

      try {
        const pageSize = 10;
        const offset = (page - 1) * pageSize;

        // Get transaction history
        const transactions = await economyAPI.getTransactionHistory(
          interaction.guildId,
          targetUser.id,
          pageSize,
          offset
        );

        if (transactions.length === 0) {
          await interaction.reply({
            content: page === 1
              ? `No transaction history found for ${targetUser.username}.`
              : "No more transactions found on this page.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Format transactions
        const formattedTransactions = await Promise.all(
          transactions.map(async (tx) => {
            const date = tx.created_at.toLocaleDateString();
            const emoji = config.currencyEmoji;
            let description = "";

            switch (tx.type) {
              case "earn":
                description = `${emoji} **+${tx.amount}** - Earned from messages`;
                break;

              case "transfer":
                if (tx.from_user_id === targetUser.id) {
                  // Sent transfer
                  let toUsername = "Unknown User";
                  try {
                    const toUser = await ctx.client.users.fetch(tx.to_user_id!);
                    toUsername = toUser.username;
                  } catch (error) {
                    // User not found
                  }
                  description = `${emoji} **-${tx.amount}** - Sent to ${toUsername}`;
                } else {
                  // Received transfer
                  let fromUsername = "Unknown User";
                  try {
                    const fromUser = await ctx.client.users.fetch(tx.from_user_id!);
                    fromUsername = fromUser.username;
                  } catch (error) {
                    // User not found
                  }
                  description = `${emoji} **+${tx.amount}** - Received from ${fromUsername}`;
                }
                break;

              case "admin_give":
                description = `${emoji} **+${tx.amount}** - Admin grant${tx.description ? `: ${tx.description}` : ""}`;
                break;

              case "admin_set":
                description = `${emoji} **Set to ${tx.amount}** - Admin adjustment${tx.description ? `: ${tx.description}` : ""}`;
                break;

              case "admin_remove":
                description = `${emoji} **-${tx.amount}** - Admin removal${tx.description ? `: ${tx.description}` : ""}`;
                break;

              default:
                description = `${emoji} ${tx.amount} - ${tx.type}`;
            }

            return `\`${date}\` ${description}`;
          })
        );

        // Build embed
        const embed = new EmbedBuilder()
          .setTitle(`${config.currencyEmoji} Transaction History`)
          .setDescription(
            `**${targetUser.username}**'s recent transactions:\n\n` +
            formattedTransactions.join("\n")
          )
          .setColor(0x5865f2)
          .setFooter({ text: `Page ${page}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } catch (error) {
        ctx.logger.error("Error in history command:", error);
        await interaction.reply({
          content: "An error occurred while fetching transaction history. Please try again.",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  };
}
