import { SlashCommandBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits, ButtonStyle } from "discord.js";
import type { Command, PluginContext } from "@types";
import type { EconomyAPI } from "./plugin";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import type { UserRepository } from "./db/repository";

export function createEconomyCommand<T>(
  ctx: PluginContext<T extends {
    currencyName: string;
    currencyEmoji: string;
    leaderboardPageSize: number;
    minTransferAmount: number;
    startingBalance: number;
  } ? T : any>,
  economyAPI: EconomyAPI,
  coreUtilsAPI: CoreUtilsAPI,
  userRepo: UserRepository
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("eco")
      .setDescription("Economy commands")
      .setDMPermission(false)
      // User commands
      .addSubcommand(sub =>
        sub
          .setName("balance")
          .setDescription("Check your balance or another user's balance")
          .addUserOption(opt =>
            opt.setName("user").setDescription("User to check balance for (default: you)").setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName("leaderboard")
          .setDescription("View the server's richest users")
          .addIntegerOption(opt =>
            opt.setName("page").setDescription("Page number (default: 1)").setRequired(false).setMinValue(1)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName("transfer")
          .setDescription("Transfer coins to another user")
          .addUserOption(opt =>
            opt.setName("user").setDescription("User to send coins to").setRequired(true)
          )
          .addIntegerOption(opt =>
            opt.setName("amount").setDescription("Amount to transfer").setRequired(true).setMinValue(1)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName("history")
          .setDescription("View transaction history")
          .addUserOption(opt =>
            opt.setName("user").setDescription("User to view history for (admin only)").setRequired(false)
          )
          .addIntegerOption(opt =>
            opt.setName("page").setDescription("Page number (default: 1)").setRequired(false).setMinValue(1)
          )
      )
      // Admin commands
      .addSubcommandGroup(group =>
        group
          .setName("admin")
          .setDescription("Economy admin commands")
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
          )
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
      const subcommandGroup = interaction.options.getSubcommandGroup(false);
      const subcommand = interaction.options.getSubcommand();

      try {
        // Handle admin subcommands
        if (subcommandGroup === "admin") {
          // Check permissions
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({
              content: "❌ You need Manage Server permission to use admin commands!",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await handleAdminCommands(subcommand, interaction, ctx, economyAPI, coreUtilsAPI, userRepo, config);
          return;
        }

        // Handle user subcommands
        switch (subcommand) {
          case "balance":
            await handleBalance(interaction, ctx, economyAPI, config);
            break;

          case "leaderboard":
            await handleLeaderboard(interaction, ctx, economyAPI, userRepo, config);
            break;

          case "transfer":
            await handleTransfer(interaction, ctx, economyAPI, config);
            break;

          case "history":
            await handleHistory(interaction, ctx, economyAPI, config);
            break;
        }
      } catch (error) {
        ctx.logger.error("Error in eco command:", error);
        const errorMessage = "An error occurred while processing your request. Please try again.";

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      }
    },
  };
}

// ============ User Command Handlers ============

async function handleBalance(interaction: any, ctx: any, economyAPI: EconomyAPI, config: any) {
  const targetUser = interaction.options.getUser("user") || interaction.user;

  const balance = await economyAPI.getBalance(interaction.guildId, targetUser.id);
  const rank = await economyAPI.getUserRank(interaction.guildId, targetUser.id);

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
}

async function handleLeaderboard(interaction: any, ctx: any, economyAPI: EconomyAPI, userRepo: UserRepository, config: any) {
  const pageSize = config.leaderboardPageSize;
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

  const leaderboard = await economyAPI.getLeaderboard(interaction.guildId, pageSize, offset);

  if (leaderboard.length === 0) {
    await interaction.reply({
      content: "No users found on this page.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const description = await Promise.all(
    leaderboard.map(async (entry, index) => {
      const rank = offset + index + 1;
      const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**${rank}.**`;

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

  const embed = new EmbedBuilder()
    .setTitle(`${config.currencyEmoji} ${interaction.guild?.name} Leaderboard`)
    .setDescription(description.join("\n"))
    .setColor(0xffd700)
    .setFooter({ text: `Page ${page} of ${totalPages} • ${totalUsers.toLocaleString()} total users` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleTransfer(interaction: any, ctx: any, economyAPI: EconomyAPI, config: any) {
  const targetUser = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

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

  const senderBalance = await economyAPI.getBalance(interaction.guildId, interaction.user.id);
  const receiverBalance = await economyAPI.getBalance(interaction.guildId, targetUser.id);

  await interaction.reply({
    content:
      `✅ Successfully transferred ${config.currencyEmoji} **${amount.toLocaleString()}** ${config.currencyName} to ${targetUser}!\n\n` +
      `Your balance: ${config.currencyEmoji} ${senderBalance.toLocaleString()} ${config.currencyName}\n` +
      `${targetUser.username}'s balance: ${config.currencyEmoji} ${receiverBalance.toLocaleString()} ${config.currencyName}`,
  });
}

async function handleHistory(interaction: any, ctx: any, economyAPI: EconomyAPI, config: any) {
  const requestedUser = interaction.options.getUser("user");
  const page = interaction.options.getInteger("page") || 1;

  let targetUser = interaction.user;
  if (requestedUser) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "❌ You need Manage Server permission to view other users' transaction history!",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    targetUser = requestedUser;
  }

  const pageSize = 10;
  const offset = (page - 1) * pageSize;

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
            let toUsername = "Unknown User";
            try {
              const toUser = await ctx.client.users.fetch(tx.to_user_id!);
              toUsername = toUser.username;
            } catch (error) {
              // User not found
            }
            description = `${emoji} **-${tx.amount}** - Sent to ${toUsername}`;
          } else {
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
}

// ============ Admin Command Handlers ============

async function handleAdminCommands(
  subcommand: string,
  interaction: any,
  ctx: any,
  economyAPI: EconomyAPI,
  coreUtilsAPI: CoreUtilsAPI,
  userRepo: UserRepository,
  config: any
) {
  switch (subcommand) {
    case "give": {
      const targetUser = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      const reason = interaction.options.getString("reason");

      await userRepo.ensureUser(interaction.guildId, targetUser.id, config.startingBalance);
      const oldBalance = await economyAPI.getBalance(interaction.guildId, targetUser.id);
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

      await userRepo.ensureUser(interaction.guildId, targetUser.id, config.startingBalance);
      const oldBalance = await economyAPI.getBalance(interaction.guildId, targetUser.id);
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

      await userRepo.ensureUser(interaction.guildId, targetUser.id, config.startingBalance);
      const oldBalance = await economyAPI.getBalance(interaction.guildId, targetUser.id);
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
      const totalUsers = await userRepo.getTotalUsers(interaction.guildId);

      if (totalUsers === 0) {
        await interaction.reply({
          content: "There are no users in the economy to reset.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

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
}
