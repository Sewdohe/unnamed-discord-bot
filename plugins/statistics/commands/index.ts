/**
 * Statistics Commands
 *
 * Admin commands for managing the statistics plugin
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { Command, PluginContext } from "@types";
import type { StatCollector } from "../collector";
import type { EmbedManager } from "../embed-manager";

interface StatisticsConfig {
  enabled: boolean;
  channelId?: string;
  updateInterval: number;
  embedColor: number;
}

/**
 * Create the /statistics command with subcommands
 */
export function createStatisticsCommand(
  ctx: PluginContext<StatisticsConfig>,
  collector: StatCollector,
  embedManager: EmbedManager,
  forceUpdateCallback: () => Promise<void>
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("statistics")
      .setDescription("Manage bot statistics")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setDMPermission(false)
      .addSubcommand(sub =>
        sub
          .setName("setup")
          .setDescription("Set up statistics display in a channel")
          .addChannelOption(opt =>
            opt
              .setName("channel")
              .setDescription("Channel to display statistics in")
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildText)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName("refresh")
          .setDescription("Manually refresh statistics display")
      )
      .addSubcommand(sub =>
        sub
          .setName("status")
          .setDescription("View statistics plugin status")
      ),

    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "setup":
          await handleSetup(interaction, ctx, embedManager, forceUpdateCallback);
          break;

        case "refresh":
          await handleRefresh(interaction, ctx, forceUpdateCallback);
          break;

        case "status":
          await handleStatus(interaction, ctx, collector, embedManager);
          break;

        default:
          await interaction.reply({
            content: "Unknown subcommand",
            ephemeral: true,
          });
      }
    },
  };
}

/**
 * Handle /statistics setup
 */
async function handleSetup(
  interaction: any,
  ctx: PluginContext<StatisticsConfig>,
  embedManager: EmbedManager,
  forceUpdateCallback: () => Promise<void>
): Promise<void> {
  const channel = interaction.options.getChannel("channel", true);

  // Update config (this will be saved on next bot restart)
  // For now, just update the embed manager
  embedManager.setChannel(channel.id);

  await interaction.reply({
    content: `Statistics display set up in <#${channel.id}>!\nStatistics will update every ${Math.floor(ctx.config.updateInterval / 60000)} minutes.`,
    ephemeral: true,
  });

  // Force an immediate update
  ctx.logger.info(`Setting up statistics in channel: ${channel.id}`);
  await forceUpdateCallback();
}

/**
 * Handle /statistics refresh
 */
async function handleRefresh(
  interaction: any,
  ctx: PluginContext<StatisticsConfig>,
  forceUpdateCallback: () => Promise<void>
): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    await forceUpdateCallback();
    await interaction.editReply("Statistics refreshed successfully!");
  } catch (error) {
    ctx.logger.error("Failed to refresh statistics:", error);
    await interaction.editReply("Failed to refresh statistics. Check logs for details.");
  }
}

/**
 * Handle /statistics status
 */
async function handleStatus(
  interaction: any,
  ctx: PluginContext<StatisticsConfig>,
  collector: StatCollector,
  embedManager: EmbedManager
): Promise<void> {
  const channelId = embedManager.getChannelId();
  const providerCount = collector.getProviderCount();
  const updateIntervalMinutes = Math.floor(ctx.config.updateInterval / 60000);

  const lines: string[] = [
    `**Status:** ${ctx.config.enabled ? "Enabled" : "Disabled"}`,
    `**Channel:** ${channelId ? `<#${channelId}>` : "Not configured"}`,
    `**Update Interval:** ${updateIntervalMinutes} minute${updateIntervalMinutes !== 1 ? "s" : ""}`,
    `**Registered Providers:** ${providerCount}`,
  ];

  if (providerCount > 0) {
    const providerIds = collector.getProviderIds();
    lines.push("");
    lines.push("**Providers:**");
    lines.push(providerIds.map(id => `- ${id}`).join("\n"));
  }

  await interaction.reply({
    content: lines.join("\n"),
    ephemeral: true,
  });
}
