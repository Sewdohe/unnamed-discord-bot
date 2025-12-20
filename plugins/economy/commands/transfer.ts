import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command, PluginContext } from "@types";
import type { EconomyAPI } from "../plugin";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

export function createTransferCommand<T>(
  ctx: PluginContext<T extends { currencyName: string; currencyEmoji: string; minTransferAmount: number } ? T : any>,
  economyAPI: EconomyAPI,
  coreUtilsAPI: CoreUtilsAPI
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("transfer")
      .setDescription("Transfer coins to another user")
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user").setDescription("User to send coins to").setRequired(true)
      )
      .addIntegerOption(opt =>
        opt.setName("amount").setDescription("Amount to transfer").setRequired(true).setMinValue(1)
      ),

    async execute(interaction) {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "This command can only be used in servers!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const targetUser = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      const config = ctx.config as any;

      // Validation: Cannot transfer to self
      if (targetUser.id === interaction.user.id) {
        await interaction.reply({
          content: `❌ You cannot transfer ${config.currencyName} to yourself!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Validation: Cannot transfer to bots
      if (targetUser.bot) {
        await interaction.reply({
          content: `❌ You cannot transfer ${config.currencyName} to bots!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Validation: Check minimum transfer amount
      if (amount < config.minTransferAmount) {
        await interaction.reply({
          content: `❌ Minimum transfer amount is ${config.minTransferAmount} ${config.currencyName}!`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        // Attempt transfer
        const result = await economyAPI.transfer(
          interaction.guildId,
          interaction.user.id,
          targetUser.id,
          amount
        );

        if (!result.success) {
          await interaction.reply({
            content: `❌ ${result.reason || "Transfer failed"}`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Get updated balances
        const senderBalance = await economyAPI.getBalance(interaction.guildId, interaction.user.id);
        const receiverBalance = await economyAPI.getBalance(interaction.guildId, targetUser.id);

        await interaction.reply({
          content:
            `✅ Successfully transferred ${config.currencyEmoji} **${amount.toLocaleString()}** ${config.currencyName} to ${targetUser}!\n\n` +
            `Your balance: ${config.currencyEmoji} ${senderBalance.toLocaleString()} ${config.currencyName}\n` +
            `${targetUser.username}'s balance: ${config.currencyEmoji} ${receiverBalance.toLocaleString()} ${config.currencyName}`,
        });
      } catch (error) {
        ctx.logger.error("Error in transfer command:", error);
        await interaction.reply({
          content: "An error occurred while processing the transfer. Please try again.",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  };
}
