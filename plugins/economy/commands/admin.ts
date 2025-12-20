import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ButtonStyle } from "discord.js";
import type { Command, PluginContext } from "@types";
import type { EconomyAPI } from "../plugin";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { UserRepository } from "../db/repository";

export function createAdminCommand<T>(
  ctx: PluginContext<T extends { currencyName: string; currencyEmoji: string; startingBalance: number } ? T : any>,
  economyAPI: EconomyAPI,
  coreUtilsAPI: CoreUtilsAPI,
  userRepo: UserRepository
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("admin-economy")
      .setDescription("Economy admin commands")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setDMPermission(false)
      .addSubcommand(sub =>
        sub
          .setName("give")
          .setDescription("Give coins to a user")
          .addUserOption(opt =>
            opt.setName("user").setDescription("User to give coins to").setRequired(true)
          )
          .addIntegerOption(opt =>
            opt.setName("amount").setDescription("Amount to give").setRequired(true).setMinValue(1)
          )
          .addStringOption(opt =>
            opt.setName("reason").setDescription("Reason for transaction").setRequired(false).setMaxLength(100)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName("set")
          .setDescription("Set a user's balance directly")
          .addUserOption(opt =>
            opt.setName("user").setDescription("User to set balance for").setRequired(true)
          )
          .addIntegerOption(opt =>
            opt.setName("amount").setDescription("New balance").setRequired(true).setMinValue(0)
          )
          .addStringOption(opt =>
            opt.setName("reason").setDescription("Reason for change").setRequired(false).setMaxLength(100)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName("remove")
          .setDescription("Remove coins from a user")
          .addUserOption(opt =>
            opt.setName("user").setDescription("User to remove coins from").setRequired(true)
          )
          .addIntegerOption(opt =>
            opt.setName("amount").setDescription("Amount to remove").setRequired(true).setMinValue(1)
          )
          .addStringOption(opt =>
            opt.setName("reason").setDescription("Reason for removal").setRequired(false).setMaxLength(100)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName("reset")
          .setDescription("Reset the entire server economy (DANGEROUS)")
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
      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
          case "give": {
            const targetUser = interaction.options.getUser("user", true);
            const amount = interaction.options.getInteger("amount", true);
            const reason = interaction.options.getString("reason");

            // Ensure user exists
            await userRepo.ensureUser(interaction.guildId, targetUser.id, config.startingBalance);

            // Get old balance
            const oldBalance = await economyAPI.getBalance(interaction.guildId, targetUser.id);

            // Add balance
            const newBalance = await economyAPI.addBalance(interaction.guildId, targetUser.id, amount, true);

            await interaction.reply({
              content:
                `✅ Gave ${config.currencyEmoji} **${amount.toLocaleString()}** ${config.currencyName} to ${targetUser}!\n\n` +
                `Old balance: ${config.currencyEmoji} ${oldBalance.toLocaleString()}\n` +
                `New balance: ${config.currencyEmoji} ${newBalance.toLocaleString()}` +
                (reason ? `\n\nReason: ${reason}` : ""),
              flags: MessageFlags.Ephemeral,
            });

            ctx.logger.info(
              `[Admin] ${interaction.user.tag} gave ${amount} ${config.currencyName} to ${targetUser.tag}` +
              (reason ? ` (Reason: ${reason})` : "")
            );
            break;
          }

          case "set": {
            const targetUser = interaction.options.getUser("user", true);
            const amount = interaction.options.getInteger("amount", true);
            const reason = interaction.options.getString("reason");

            // Ensure user exists
            await userRepo.ensureUser(interaction.guildId, targetUser.id, config.startingBalance);

            // Get old balance
            const oldBalance = await economyAPI.getBalance(interaction.guildId, targetUser.id);

            // Set balance
            await economyAPI.setBalance(interaction.guildId, targetUser.id, amount, true);

            await interaction.reply({
              content:
                `✅ Set ${targetUser}'s balance to ${config.currencyEmoji} **${amount.toLocaleString()}** ${config.currencyName}!\n\n` +
                `Old balance: ${config.currencyEmoji} ${oldBalance.toLocaleString()}\n` +
                `New balance: ${config.currencyEmoji} ${amount.toLocaleString()}` +
                (reason ? `\n\nReason: ${reason}` : ""),
              flags: MessageFlags.Ephemeral,
            });

            ctx.logger.info(
              `[Admin] ${interaction.user.tag} set ${targetUser.tag}'s balance to ${amount} ${config.currencyName}` +
              (reason ? ` (Reason: ${reason})` : "")
            );
            break;
          }

          case "remove": {
            const targetUser = interaction.options.getUser("user", true);
            const amount = interaction.options.getInteger("amount", true);
            const reason = interaction.options.getString("reason");

            // Ensure user exists
            await userRepo.ensureUser(interaction.guildId, targetUser.id, config.startingBalance);

            // Get old balance
            const oldBalance = await economyAPI.getBalance(interaction.guildId, targetUser.id);

            // Remove balance
            const newBalance = await economyAPI.removeBalance(interaction.guildId, targetUser.id, amount, true);

            if (newBalance === null) {
              await interaction.reply({
                content: `❌ ${targetUser} doesn't have enough ${config.currencyName}! (Balance: ${config.currencyEmoji} ${oldBalance.toLocaleString()})`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            await interaction.reply({
              content:
                `✅ Removed ${config.currencyEmoji} **${amount.toLocaleString()}** ${config.currencyName} from ${targetUser}!\n\n` +
                `Old balance: ${config.currencyEmoji} ${oldBalance.toLocaleString()}\n` +
                `New balance: ${config.currencyEmoji} ${newBalance.toLocaleString()}` +
                (reason ? `\n\nReason: ${reason}` : ""),
              flags: MessageFlags.Ephemeral,
            });

            ctx.logger.info(
              `[Admin] ${interaction.user.tag} removed ${amount} ${config.currencyName} from ${targetUser.tag}` +
              (reason ? ` (Reason: ${reason})` : "")
            );
            break;
          }

          case "reset": {
            // Get current user count
            const totalUsers = await userRepo.getTotalUsers(interaction.guildId);

            if (totalUsers === 0) {
              await interaction.reply({
                content: "There are no users in the economy to reset.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Use core-utils confirm function
            const confirmed = await coreUtilsAPI.confirm(interaction, {
              title: "⚠️ Reset Economy",
              description:
                `Are you sure you want to reset the **entire server economy**?\n\n` +
                `This will delete **${totalUsers.toLocaleString()} user(s)** and all their balances.\n\n` +
                `**This action cannot be undone!**`,
              confirmLabel: "Reset Economy",
              cancelLabel: "Cancel",
              confirmStyle: ButtonStyle.Danger,
              timeout: 30000,
            });

            if (!confirmed) {
              await interaction.editReply({
                content: "Economy reset cancelled.",
                components: [],
              });
              return;
            }

            // Reset economy
            const deleted = await economyAPI.resetGuildEconomy(interaction.guildId);

            await interaction.editReply({
              content: `✅ Successfully reset the server economy! Deleted **${deleted.toLocaleString()}** user(s).`,
              components: [],
            });

            ctx.logger.warn(
              `[Admin] ${interaction.user.tag} reset the economy for ${interaction.guild?.name} (${deleted} users deleted)`
            );
            break;
          }
        }
      } catch (error) {
        ctx.logger.error("Error in admin-economy command:", error);
        await interaction.reply({
          content: "An error occurred while processing the admin command. Please try again.",
          flags: MessageFlags.Ephemeral,
        });
      }
    },
  };
}
