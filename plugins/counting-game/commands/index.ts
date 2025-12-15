import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { CountingGameRepository, UserStatsRepository } from "../db/repository";

// ============ Configuration Type ============

export type CountingGameConfig = {
  enabled: boolean;
  countingChannels: string[];
  alternatingAccounts: boolean;
  allowTalking: boolean;
  reactions: {
    success: string;
    failure: string;
  };
  resetOnFail: boolean;
};

// ============ Main Command ============

export function createCountingCommand(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  statsRepo: UserStatsRepository
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("counting")
      .setDescription("Counting game management")
      .addSubcommand(sub =>
        sub.setName("setup")
          .setDescription("Set up a counting channel (Admin only)")
          .addChannelOption(opt =>
            opt.setName("channel")
              .setDescription("Channel to use for counting")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName("remove")
          .setDescription("Remove a counting channel (Admin only)")
          .addChannelOption(opt =>
            opt.setName("channel")
              .setDescription("Channel to remove")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName("status")
          .setDescription("View current count and stats")
          .addChannelOption(opt =>
            opt.setName("channel")
              .setDescription("Channel to check (defaults to current)")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub.setName("reset")
          .setDescription("Reset the count to 0 (Admin only)")
          .addChannelOption(opt =>
            opt.setName("channel")
              .setDescription("Channel to reset (defaults to current)")
              .addChannelTypes(ChannelType.GuildText)
              .setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub.setName("leaderboard")
          .setDescription("View counting leaderboards")
          .addStringOption(opt =>
            opt.setName("type")
              .setDescription("Leaderboard type")
              .setRequired(false)
              .addChoices(
                { name: "Most Successful Counts", value: "counts" },
                { name: "Highest Contribution", value: "highest" },
                { name: "Channel High Scores", value: "channels" }
              )
          )
      )
      .addSubcommand(sub =>
        sub.setName("stats")
          .setDescription("View your counting statistics")
          .addUserOption(opt =>
            opt.setName("user")
              .setDescription("User to check (defaults to you)")
              .setRequired(false)
          )
      )
      .setDefaultMemberPermissions(null),

    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "setup":
          await handleSetup(ctx, api, gameRepo, interaction);
          break;
        case "remove":
          await handleRemove(ctx, api, gameRepo, interaction);
          break;
        case "status":
          await handleStatus(ctx, api, gameRepo, interaction);
          break;
        case "reset":
          await handleReset(ctx, api, gameRepo, interaction);
          break;
        case "leaderboard":
          await handleLeaderboard(ctx, api, gameRepo, statsRepo, interaction);
          break;
        case "stats":
          await handleStats(ctx, api, statsRepo, interaction);
          break;
      }
    },
  };
}

// ============ Command Handlers ============

async function handleSetup(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  interaction: ChatInputCommandInteraction
) {
  // Check permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    const embed = api.embeds.error("You need the Manage Channels permission to use this command.", "Permission Denied");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);

  // Check if already configured
  const existingGame = await gameRepo.getGame(interaction.guildId!, channel.id);
  if (existingGame) {
    const embed = api.embeds.warning(`${channel} is already set up as a counting channel!`, "Already Configured");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Create the game
  await gameRepo.getOrCreateGame(interaction.guildId!, channel.id);

  const embed = api.embeds.success(
    `${channel} has been set up as a counting channel!\n\n` +
    `**Rules:**\n` +
    `• Count sequentially starting from 1\n` +
    `• ${ctx.config.alternatingAccounts ? "Users must alternate (same user can't count twice in a row)" : "Any user can count multiple times in a row"}\n` +
    `• ${ctx.config.allowTalking ? "Talking in the channel is allowed" : "Only counting messages are allowed"}\n` +
    `• ${ctx.config.resetOnFail ? "Count resets to 0 on mistakes" : "Continue counting after mistakes"}\n\n` +
    `Start counting by sending **1** in ${channel}!`,
    "✅ Counting Channel Created"
  );

  await interaction.reply({ embeds: [embed] });

  ctx.logger.info(`${interaction.user.tag} set up counting channel: ${channel.id}`);
}

async function handleRemove(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  interaction: ChatInputCommandInteraction
) {
  // Check permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    const embed = api.embeds.error("You need the Manage Channels permission to use this command.", "Permission Denied");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.options.getChannel("channel", true);

  // Check if configured
  const game = await gameRepo.getGame(interaction.guildId!, channel.id);
  if (!game) {
    const embed = api.embeds.error(`${channel} is not a counting channel!`, "Not Found");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Confirm deletion
  const confirmed = await api.confirm(interaction, {
    message: `Remove ${channel} as a counting channel?\n\nCurrent: ${game.current_count} | High Score: ${game.high_score}`,
    title: "⚠️ Confirm Removal",
  });

  if (!confirmed) {
    const embed = api.embeds.info("Removal cancelled.", "Cancelled");
    await interaction.followUp({ embeds: [embed] });
    return;
  }

  await gameRepo.deleteGame(interaction.guildId!, channel.id);

  const embed = api.embeds.success(`${channel} has been removed as a counting channel.`, "🗑️ Channel Removed");
  await interaction.followUp({ embeds: [embed] });

  ctx.logger.info(`${interaction.user.tag} removed counting channel: ${channel.id}`);
}

async function handleStatus(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  interaction: ChatInputCommandInteraction
) {
  const channel = interaction.options.getChannel("channel") || interaction.channel;
  if (!channel) {
    const embed = api.embeds.error("Could not determine channel.", "Error");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const game = await gameRepo.getGame(interaction.guildId!, channel.id);
  if (!game) {
    const embed = api.embeds.error(`${channel} is not a counting channel!`, "Not Found");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const lastUser = game.last_user_id ? `<@${game.last_user_id}>` : "None";
  const accuracy = game.total_counts > 0
    ? ((game.total_counts / (game.total_counts + game.total_fails)) * 100).toFixed(1)
    : "0.0";

  const embed = api.embeds.create()
    .setTitle(`🔢 Counting Status - ${channel.name}`)
    .addFields(
      { name: "Current Count", value: game.current_count.toString(), inline: true },
      { name: "High Score", value: game.high_score.toString(), inline: true },
      { name: "Last Counter", value: lastUser, inline: true },
      { name: "Total Counts", value: game.total_counts.toString(), inline: true },
      { name: "Total Fails", value: game.total_fails.toString(), inline: true },
      { name: "Accuracy", value: `${accuracy}%`, inline: true }
    )
    .setColor(0x5865f2)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleReset(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  interaction: ChatInputCommandInteraction
) {
  // Check permissions
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    const embed = api.embeds.error("You need the Manage Channels permission to use this command.", "Permission Denied");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.options.getChannel("channel") || interaction.channel;
  if (!channel) {
    const embed = api.embeds.error("Could not determine channel.", "Error");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const game = await gameRepo.getGame(interaction.guildId!, channel.id);
  if (!game) {
    const embed = api.embeds.error(`${channel} is not a counting channel!`, "Not Found");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Confirm reset
  const confirmed = await api.confirm(interaction, {
    message: `Reset the count in ${channel}?\n\nCurrent: ${game.current_count} | High Score: ${game.high_score}`,
    title: "⚠️ Confirm Reset",
  });

  if (!confirmed) {
    const embed = api.embeds.info("Reset cancelled.", "Cancelled");
    await interaction.followUp({ embeds: [embed] });
    return;
  }

  await gameRepo.resetCount(interaction.guildId!, channel.id);

  const embed = api.embeds.success(
    `The count has been reset in ${channel}!\n\nStart counting from **1** again.`,
    "🔄 Count Reset"
  );
  await interaction.followUp({ embeds: [embed] });

  ctx.logger.info(`${interaction.user.tag} reset counting in channel: ${channel.id}`);
}

async function handleLeaderboard(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  statsRepo: UserStatsRepository,
  interaction: ChatInputCommandInteraction
) {
  const type = interaction.options.getString("type") || "counts";

  if (type === "channels") {
    // Channel leaderboard
    const games = await gameRepo.getLeaderboard(interaction.guildId!, 10);

    if (games.length === 0) {
      const embed = api.embeds.info("No counting channels set up yet!", "No Data");
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const description = games
      .map((game, i) => {
        return `**${i + 1}.** <#${game.channel_id}>\n` +
               `   Current: ${game.current_count} | High Score: ${game.high_score}`;
      })
      .join("\n\n");

    const embed = api.embeds.create()
      .setTitle("🏆 Channel Leaderboard")
      .setDescription(description)
      .setColor(0xffd700)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else if (type === "highest") {
    // Highest contribution leaderboard
    const users = await statsRepo.getHighestContributionLeaderboard(interaction.guildId!, 10);

    if (users.length === 0) {
      const embed = api.embeds.info("No statistics yet!", "No Data");
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const description = users
      .map((user, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
        return `${medal} <@${user.user_id}> - Highest: **${user.highest_contribution}**`;
      })
      .join("\n");

    const embed = api.embeds.create()
      .setTitle("🏆 Highest Contribution Leaderboard")
      .setDescription(description)
      .setColor(0xffd700)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else {
    // User count leaderboard
    const users = await statsRepo.getLeaderboard(interaction.guildId!, 10);

    if (users.length === 0) {
      const embed = api.embeds.info("No statistics yet!", "No Data");
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const description = users
      .map((user, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
        return `${medal} <@${user.user_id}> - **${user.successful_counts}** successful counts`;
      })
      .join("\n");

    const embed = api.embeds.create()
      .setTitle("🏆 User Leaderboard")
      .setDescription(description)
      .setColor(0xffd700)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}

async function handleStats(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  statsRepo: UserStatsRepository,
  interaction: ChatInputCommandInteraction
) {
  const user = interaction.options.getUser("user") || interaction.user;

  const stats = await statsRepo.getUserStats(interaction.guildId!, user.id);

  if (!stats || stats.successful_counts === 0) {
    const embed = api.embeds.info(
      `${user} hasn't participated in counting yet!`,
      "No Statistics"
    );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const totalCounts = stats.successful_counts + stats.failed_counts;
  const accuracy = totalCounts > 0
    ? ((stats.successful_counts / totalCounts) * 100).toFixed(1)
    : "0.0";

  const embed = api.embeds.create()
    .setTitle(`📊 Counting Statistics - ${user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: "Successful Counts", value: stats.successful_counts.toString(), inline: true },
      { name: "Failed Counts", value: stats.failed_counts.toString(), inline: true },
      { name: "Accuracy", value: `${accuracy}%`, inline: true },
      { name: "Highest Contribution", value: stats.highest_contribution.toString(), inline: true }
    )
    .setColor(0x5865f2)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
