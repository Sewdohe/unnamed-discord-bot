import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  TextChannel,
  ChatInputCommandInteraction,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import { createVerificationRepo } from "../db/repository";

// Config type
type VerificationConfig = {
  enabled: boolean;
  verifiedRoleId: string;
  unverifiedRoleId: string;
  verificationChannelId: string;
  logChannelId: string;
  welcomeMessage: {
    enabled: boolean;
    channelId: string;
    message: string;
  };
  verificationPanel: {
    title: string;
    description: string;
    buttonLabel: string;
    color: number;
  };
  kickUnverified: {
    enabled: boolean;
    timeout: number;
  };
};

export function verifyCommand(ctx: PluginContext<VerificationConfig>, api: CoreUtilsAPI): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("verify")
      .setDescription("Verification system commands")
      .addSubcommand(sub =>
        sub.setName("panel")
          .setDescription("Send the verification panel (Admin only)")
          .addChannelOption(opt =>
            opt.setName("channel")
              .setDescription("Channel to send the panel to (defaults to current channel)")
              .setRequired(false)
          )
      )
      .addSubcommand(sub =>
        sub.setName("user")
          .setDescription("Manually verify a user")
          .addUserOption(opt =>
            opt.setName("user")
              .setDescription("User to verify")
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName("unverify")
          .setDescription("Manually unverify a user")
          .addUserOption(opt =>
            opt.setName("user")
              .setDescription("User to unverify")
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName("stats")
          .setDescription("View verification statistics")
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .setDMPermission(false),

    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "panel":
          await handlePanel(ctx, api, interaction);
          break;
        case "user":
          await handleVerifyUser(ctx, api, interaction);
          break;
        case "unverify":
          await handleUnverifyUser(ctx, api, interaction);
          break;
        case "stats":
          await handleStats(ctx, api, interaction);
          break;
      }
    },
  };
}

// ============ Handler: Panel ============

async function handlePanel(ctx: PluginContext<VerificationConfig>, api: CoreUtilsAPI, interaction: ChatInputCommandInteraction) {
  const targetChannel = (interaction.options.getChannel("channel") as TextChannel) || interaction.channel as TextChannel;

  if (!targetChannel || !targetChannel.isTextBased()) {
    const embed = api.embeds.error(
      "Invalid channel! Please select a text channel.",
      "Error"
    ) ?? new EmbedBuilder()
      .setDescription("Invalid channel")
      .setColor(0xed4245);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Create verification panel embed
  const panelEmbed = new EmbedBuilder()
    .setTitle(ctx.config.verificationPanel.title)
    .setDescription(ctx.config.verificationPanel.description)
    .setColor(ctx.config.verificationPanel.color)
    .setTimestamp();

  // Build verification button components using the UI framework
  const components = api.components.build(ctx, "verification-panel");

  // Send panel
  try {
    await targetChannel.send({
      embeds: [panelEmbed],
      components,
    });

    const successEmbed = api.embeds.success(
      `Verification panel sent to ${targetChannel}!`,
      "Panel Sent"
    ) ?? new EmbedBuilder()
      .setDescription(`Panel sent to ${targetChannel}`)
      .setColor(0x57f287);

    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    ctx.logger.error("Failed to send verification panel:", error);

    const errorEmbed = api.embeds.error(
      "Failed to send verification panel. Make sure I have permission to send messages in that channel!",
      "Error"
    ) ?? new EmbedBuilder()
      .setDescription("Failed to send panel")
      .setColor(0xed4245);

    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
  }
}

// ============ Handler: Verify User ============

async function handleVerifyUser(ctx: PluginContext<VerificationConfig>, api: CoreUtilsAPI, interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("user", true);
  const member = await interaction.guild?.members.fetch(user.id);

  if (!member) {
    const embed = api.embeds.error(
      "User not found in this server!",
      "Error"
    ) ?? new EmbedBuilder()
      .setDescription("User not found")
      .setColor(0xed4245);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const repo = createVerificationRepo(ctx);

  // Check if already verified
  if (repo.isVerified(user.id, interaction.guildId!)) {
    const embed = api.embeds.warning(
      `${user} is already verified!`,
      "Already Verified"
    ) ?? new EmbedBuilder()
      .setDescription(`${user} is already verified`)
      .setColor(0xfee75c);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Add to database if not exists
  repo.create(user.id, interaction.guildId!);

  // Mark as verified
  repo.verify(user.id, interaction.guildId!);

  // Assign/remove roles
  try {
    if (ctx.config.verifiedRoleId) {
      await member.roles.add(ctx.config.verifiedRoleId);
    }
    if (ctx.config.unverifiedRoleId) {
      await member.roles.remove(ctx.config.unverifiedRoleId);
    }

    const embed = api.embeds.success(
      `Successfully verified ${user}!`,
      "User Verified"
    ) ?? new EmbedBuilder()
      .setDescription(`Verified ${user}`)
      .setColor(0x57f287);

    await interaction.reply({ embeds: [embed] });

    // Log verification
    if (ctx.config.logChannelId) {
      const logChannel = await interaction.guild?.channels.fetch(ctx.config.logChannelId) as TextChannel;
      if (logChannel?.isTextBased()) {
        const logEmbed = api.embeds.info(
          `**User:** ${user} (${user.id})\n**Verified by:** ${interaction.user}\n**Method:** Manual`,
          "✅ User Verified"
        ) ?? new EmbedBuilder()
          .setTitle("✅ User Verified")
          .setDescription(`${user} verified by ${interaction.user}`)
          .setColor(0x3ba55d)
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    }
  } catch (error) {
    ctx.logger.error("Failed to assign roles:", error);

    const embed = api.embeds.error(
      "Failed to assign roles! Make sure I have the Manage Roles permission and my role is above the verification roles.",
      "Error"
    ) ?? new EmbedBuilder()
      .setDescription("Failed to assign roles")
      .setColor(0xed4245);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// ============ Handler: Unverify User ============

async function handleUnverifyUser(ctx: PluginContext<VerificationConfig>, api: CoreUtilsAPI, interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser("user", true);
  const member = await interaction.guild?.members.fetch(user.id);

  if (!member) {
    const embed = api.embeds.error(
      "User not found in this server!",
      "Error"
    ) ?? new EmbedBuilder()
      .setDescription("User not found")
      .setColor(0xed4245);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const repo = createVerificationRepo(ctx);

  // Check if verified
  if (!repo.isVerified(user.id, interaction.guildId!)) {
    const embed = api.embeds.warning(
      `${user} is not verified!`,
      "Not Verified"
    ) ?? new EmbedBuilder()
      .setDescription(`${user} is not verified`)
      .setColor(0xfee75c);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Mark as unverified
  repo.unverify(user.id, interaction.guildId!);

  // Remove/add roles
  try {
    if (ctx.config.verifiedRoleId) {
      await member.roles.remove(ctx.config.verifiedRoleId);
    }
    if (ctx.config.unverifiedRoleId) {
      await member.roles.add(ctx.config.unverifiedRoleId);
    }

    const embed = api.embeds.success(
      `Successfully unverified ${user}!`,
      "User Unverified"
    ) ?? new EmbedBuilder()
      .setDescription(`Unverified ${user}`)
      .setColor(0x57f287);

    await interaction.reply({ embeds: [embed] });

    // Log unverification
    if (ctx.config.logChannelId) {
      const logChannel = await interaction.guild?.channels.fetch(ctx.config.logChannelId) as TextChannel;
      if (logChannel?.isTextBased()) {
        const logEmbed = api.embeds.warning(
          `**User:** ${user} (${user.id})\n**Unverified by:** ${interaction.user}`,
          "⚠️ User Unverified"
        ) ?? new EmbedBuilder()
          .setTitle("⚠️ User Unverified")
          .setDescription(`${user} unverified by ${interaction.user}`)
          .setColor(0xfee75c)
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    }
  } catch (error) {
    ctx.logger.error("Failed to remove roles:", error);

    const embed = api.embeds.error(
      "Failed to remove roles! Make sure I have the Manage Roles permission.",
      "Error"
    ) ?? new EmbedBuilder()
      .setDescription("Failed to remove roles")
      .setColor(0xed4245);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

// ============ Handler: Stats ============

async function handleStats(ctx: PluginContext<VerificationConfig>, api: CoreUtilsAPI, interaction: ChatInputCommandInteraction) {
  const repo = createVerificationRepo(ctx);
  const stats = repo.getStats(interaction.guildId!);

  const embed = api.embeds.create()
    .setTitle("📊 Verification Statistics")
    .setColor(0x5865f2)
    .addFields(
      { name: "Total Members Tracked", value: stats.total.toString(), inline: true },
      { name: "✅ Verified", value: stats.verified.toString(), inline: true },
      { name: "⏳ Unverified", value: stats.unverified.toString(), inline: true }
    )
    .setTimestamp()
  ?? new EmbedBuilder()
    .setTitle("📊 Verification Statistics")
    .setDescription(`Total: ${stats.total}\nVerified: ${stats.verified}\nUnverified: ${stats.unverified}`)
    .setColor(0x5865f2);

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
