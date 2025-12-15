import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { ModerationRepository } from "../db/repository";
import { logToModLog, formatDuration, parseDuration } from "../utils/modlog";
import { checkWarningThresholds, applyThresholdAction } from "../utils/warnings";

// Import config type from main plugin
type ModConfig = {
  modLog: {
    enabled: boolean;
    channelId?: string;
  };
  dmUsers: {
    onWarn: boolean;
    onTimeout: boolean;
    onKick: boolean;
    onBan: boolean;
  };
  requireReason: boolean;
  deleteMessagesOnBan: number;
  autoMod: {
    messageFilter: {
      enabled: boolean;
      words: string[];
      actions: string[];
      timeoutDuration: string;
      exemptRoles: string[];
      exemptChannels: string[];
    };
    inviteFilter: {
      enabled: boolean;
      actions: string[];
      timeoutDuration: string;
      allowedInvites: string[];
      exemptRoles: string[];
      exemptChannels: string[];
    };
  };
  warnings: {
    globalThresholds: Array<{
      count: number;
      action: "timeout" | "kick" | "ban";
      duration?: string;
    }>;
    decay: {
      enabled: boolean;
      days: number;
    };
    categories: Array<{
      id: string;
      name: string;
      thresholds: Array<{
        count: number;
        action: "timeout" | "kick" | "ban";
        duration?: string;
      }>;
    }>;
    dmOnThresholdAction: boolean;
  };
};

// ============ Kick Command ============

export function kickCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Kick a user from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to kick")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for kick")
          .setRequired(ctx.config.requireReason)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          embeds: [api.embeds.error("User not found in this server!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check if bot can kick
      if (!member.kickable) {
        await interaction.reply({
          embeds: [api.embeds.error("I cannot kick this user (higher role or insufficient permissions)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // DM user if enabled
      if (ctx.config.dmUsers.onKick) {
        try {
          await user.send({
            embeds: [api.embeds.warning(
              `You have been kicked from **${interaction.guild.name}**\n\n**Reason:** ${reason}`,
              "Kicked"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Kick user
      await member.kick(reason);

      // Create case
      const caseId = await repo.createCase("kick", user.id, user.tag, interaction.user.id, interaction.user.tag, reason);

      // Log to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${user.tag}** has been kicked\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Kicked"
        )],
      });
    },
  };
}

// ============ Ban Command ============

export function banCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Ban a user from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to ban")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for ban")
          .setRequired(ctx.config.requireReason)
      )
      .addIntegerOption(opt =>
        opt.setName("delete-days")
          .setDescription("Days of messages to delete (0-7)")
          .setMinValue(0)
          .setMaxValue(7)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const deleteDays = interaction.options.getInteger("delete-days") ?? ctx.config.deleteMessagesOnBan;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      // Check if bot can ban
      if (member && !member.bannable) {
        await interaction.reply({
          embeds: [api.embeds.error("I cannot ban this user (higher role or insufficient permissions)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // DM user if enabled
      if (ctx.config.dmUsers.onBan && member) {
        try {
          await user.send({
            embeds: [api.embeds.error(
              `You have been banned from **${interaction.guild.name}**\n\n**Reason:** ${reason}`,
              "Banned"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Ban user
      await interaction.guild.members.ban(user, {
        reason,
        deleteMessageSeconds: deleteDays * 86400,
      });

      // Create case
      const caseId = await repo.createCase("ban", user.id, user.tag, interaction.user.id, interaction.user.tag, reason);

      // Log to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${user.tag}** has been banned\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Banned"
        )],
      });
    },
  };
}

// ============ Unban Command ============

export function unbanCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("unban")
      .setDescription("Unban a user from the server")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .setDMPermission(false)
      .addStringOption(opt =>
        opt.setName("user-id")
          .setDescription("ID of user to unban")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for unban")
          .setRequired(ctx.config.requireReason)
      ),

    async execute(interaction: any) {
      const userId = interaction.options.getString("user-id", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";

      // Check if user is banned
      const bans = await interaction.guild.bans.fetch();
      const ban = bans.get(userId);

      if (!ban) {
        await interaction.reply({
          embeds: [api.embeds.error("User is not banned!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Unban user
      await interaction.guild.members.unban(userId, reason);

      // Create case
      const caseId = await repo.createCase("unban", ban.user.id, ban.user.tag, interaction.user.id, interaction.user.tag, reason);

      // Log to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${ban.user.tag}** has been unbanned\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Unbanned"
        )],
      });
    },
  };
}

// ============ Timeout Command ============

export function timeoutCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("timeout")
      .setDescription("Timeout a user (mute them temporarily)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to timeout")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("duration")
          .setDescription("Duration (e.g., 10m, 1h, 1d)")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for timeout")
          .setRequired(ctx.config.requireReason)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const durationStr = interaction.options.getString("duration", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      if (!member) {
        await interaction.reply({
          embeds: [api.embeds.error("User not found in this server!")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const duration = parseDuration(durationStr);
      if (!duration || duration < 60 || duration > 2419200) {
        await interaction.reply({
          embeds: [api.embeds.error("Invalid duration! Must be between 60s and 28d (e.g., 10m, 1h, 1d)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check if bot can timeout
      if (!member.moderatable) {
        await interaction.reply({
          embeds: [api.embeds.error("I cannot timeout this user (higher role or insufficient permissions)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // DM user if enabled
      if (ctx.config.dmUsers.onTimeout) {
        try {
          await user.send({
            embeds: [api.embeds.warning(
              `You have been timed out in **${interaction.guild.name}** for ${formatDuration(duration)}\n\n**Reason:** ${reason}`,
              "Timed Out"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Timeout user
      await member.timeout(duration * 1000, reason);

      // Create case
      const caseId = await repo.createCase("timeout", user.id, user.tag, interaction.user.id, interaction.user.tag, reason, duration);

      // Log to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${user.tag}** has been timed out for ${formatDuration(duration)}\n\n**Reason:** ${reason}\n**Case:** #${caseId}`,
          "User Timed Out"
        )],
      });
    },
  };
}

// ============ Warn Command ============

export function warnCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  const commandBuilder = new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User to warn")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true)
    );

  // Add category options from config
  if (ctx.config.warnings.categories.length > 0) {
    commandBuilder.addStringOption(opt => {
      const option = opt.setName("category")
        .setDescription("Warning category")
        .setRequired(false);

      for (const category of ctx.config.warnings.categories) {
        option.addChoices({ name: category.name, value: category.id });
      }

      return option;
    });
  }

  return {
    data: commandBuilder,

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason", true);
      const category = interaction.options.getString("category");

      // DM user if enabled
      if (ctx.config.dmUsers.onWarn) {
        try {
          await user.send({
            embeds: [api.embeds.warning(
              `You have been warned in **${interaction.guild.name}**\n\n**Reason:** ${reason}${category ? `\n**Category:** ${ctx.config.warnings.categories.find(c => c.id === category)?.name}` : ""}`,
              "Warning"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Create case
      const caseId = await repo.createCase("warn", user.id, user.tag, interaction.user.id, interaction.user.tag, reason, null, {
        category: category || undefined,
      });

      // Check warning thresholds
      const thresholdAction = await checkWarningThresholds(ctx, repo, user.id, category || undefined);

      let thresholdCaseId: string | undefined;
      if (thresholdAction) {
        // Apply threshold action
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        thresholdCaseId = await applyThresholdAction(ctx, api, repo, member, user, thresholdAction);

        // Log threshold action to modlog
        if (ctx.config.modLog.enabled) {
          const thresholdCase = await repo.getCase(thresholdCaseId);
          if (thresholdCase) {
            await logToModLog(ctx, api, thresholdCaseId, thresholdCase, ctx.config.modLog.channelId);
          }
        }
      }

      // Get updated warning count (considering decay)
      const decayDays = ctx.config.warnings.decay.enabled ? ctx.config.warnings.decay.days : 0;
      const activeWarnings = await repo.getActiveWarnings(user.id, decayDays, category || undefined);

      // Log warning case to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      // Build response message
      let message = `**${user.tag}** has been warned (${activeWarnings.length} active warnings${category ? ` in ${ctx.config.warnings.categories.find(c => c.id === category)?.name}` : ""})\n\n**Reason:** ${reason}\n**Case:** #${caseId}`;

      if (thresholdAction && thresholdCaseId) {
        message += `\n\n**⚠️ Threshold Reached**\n**Action:** ${thresholdAction.action.toUpperCase()}${thresholdAction.duration ? ` (${formatDuration(thresholdAction.duration)})` : ""}\n**Case:** #${thresholdCaseId}`;
      }

      await interaction.reply({
        embeds: [api.embeds.warning(message, "User Warned")],
      });
    },
  };
}

// ============ Tempban Command ============

export function tempbanCommand(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("tempban")
      .setDescription("Temporarily ban a user (auto-unbans after duration)")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .setDMPermission(false)
      .addUserOption(opt =>
        opt.setName("user")
          .setDescription("User to temporarily ban")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("duration")
          .setDescription("Ban duration (e.g., 1h, 3d, 1w)")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("reason")
          .setDescription("Reason for temporary ban")
          .setRequired(ctx.config.requireReason)
      )
      .addIntegerOption(opt =>
        opt.setName("delete-days")
          .setDescription("Days of messages to delete (0-7)")
          .setMinValue(0)
          .setMaxValue(7)
      ),

    async execute(interaction: any) {
      const user = interaction.options.getUser("user", true);
      const durationStr = interaction.options.getString("duration", true);
      const reason = interaction.options.getString("reason") ?? "No reason provided";
      const deleteDays = interaction.options.getInteger("delete-days") ?? ctx.config.deleteMessagesOnBan;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);

      // Parse duration
      const duration = parseDuration(durationStr);
      if (!duration || duration < 60) {
        await interaction.reply({
          embeds: [api.embeds.error("Invalid duration! Must be at least 60 seconds (e.g., 1h, 3d, 1w)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Check if bot can ban
      if (member && !member.bannable) {
        await interaction.reply({
          embeds: [api.embeds.error("I cannot ban this user (higher role or insufficient permissions)")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Calculate expiration date
      const expiresAt = new Date(Date.now() + duration * 1000);

      // DM user if enabled
      if (ctx.config.dmUsers.onBan && member) {
        try {
          await user.send({
            embeds: [api.embeds.error(
              `You have been temporarily banned from **${interaction.guild.name}** for ${formatDuration(duration)}\n\n**Reason:** ${reason}\n**Expires:** ${expiresAt.toLocaleString()}`,
              "Temporarily Banned"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      // Ban user
      await interaction.guild.members.ban(user, {
        reason: `[TEMPBAN ${formatDuration(duration)}] ${reason}`,
        deleteMessageSeconds: deleteDays * 86400,
      });

      // Create case
      const caseId = await repo.createCase(
        "tempban",
        user.id,
        user.tag,
        interaction.user.id,
        interaction.user.tag,
        reason,
        duration,
        {
          expiresAt,
          guildId: interaction.guild.id,
        }
      );

      // Log to modlog
      const modCase = await repo.getCase(caseId);
      if (modCase && ctx.config.modLog.enabled) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }

      await interaction.reply({
        embeds: [api.embeds.success(
          `**${user.tag}** has been temporarily banned for ${formatDuration(duration)}\n\n**Reason:** ${reason}\n**Expires:** ${expiresAt.toLocaleString()}\n**Case:** #${caseId}`,
          "User Temporarily Banned"
        )],
      });
    },
  };
}
