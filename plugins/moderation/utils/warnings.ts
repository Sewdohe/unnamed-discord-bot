import type { GuildMember, User } from "discord.js";
import type { PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { ModerationRepository } from "../db/repository";
import { parseDuration, formatDuration } from "./modlog";

// Configuration type
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

export interface ThresholdAction {
  action: "timeout" | "kick" | "ban";
  duration?: number; // Parsed duration in seconds
  reason: string;
  thresholdCount: number;
}

/**
 * Check if a user has reached any warning thresholds
 * @param ctx Plugin context
 * @param repo Moderation repository
 * @param userId User ID to check
 * @param category Optional warning category
 * @returns Threshold action to take, or null if no threshold reached
 */
export async function checkWarningThresholds(
  ctx: PluginContext<ModConfig>,
  repo: ModerationRepository,
  userId: string,
  category?: string
): Promise<ThresholdAction | null> {
  const config = ctx.config.warnings;

  // Get decay days (0 = disabled)
  const decayDays = config.decay.enabled ? config.decay.days : 0;

  // If category is specified, check category-specific thresholds first
  if (category) {
    const categoryConfig = config.categories.find(c => c.id === category);
    if (categoryConfig && categoryConfig.thresholds.length > 0) {
      const activeWarnings = await repo.getActiveWarnings(userId, decayDays, category);
      const warningCount = activeWarnings.length;

      // Find the highest threshold that has been reached
      const triggeredThreshold = categoryConfig.thresholds
        .filter(t => warningCount >= t.count)
        .sort((a, b) => b.count - a.count)[0]; // Highest count first

      if (triggeredThreshold) {
        const parsedDuration = triggeredThreshold.duration ? parseDuration(triggeredThreshold.duration) : null;
        const duration = parsedDuration !== null ? parsedDuration : undefined;
        return {
          action: triggeredThreshold.action,
          duration,
          reason: `Reached ${warningCount} warnings in category "${categoryConfig.name}"`,
          thresholdCount: triggeredThreshold.count,
        };
      }
    }
  }

  // Check global thresholds
  if (config.globalThresholds.length > 0) {
    const activeWarnings = await repo.getActiveWarnings(userId, decayDays);
    const warningCount = activeWarnings.length;

    // Find the highest threshold that has been reached
    const triggeredThreshold = config.globalThresholds
      .filter(t => warningCount >= t.count)
      .sort((a, b) => b.count - a.count)[0]; // Highest count first

    if (triggeredThreshold) {
      const parsedDuration = triggeredThreshold.duration ? parseDuration(triggeredThreshold.duration) : null;
      const duration = parsedDuration !== null ? parsedDuration : undefined;
      return {
        action: triggeredThreshold.action,
        duration,
        reason: `Reached ${warningCount} total warnings`,
        thresholdCount: triggeredThreshold.count,
      };
    }
  }

  return null; // No threshold reached
}

/**
 * Apply a threshold action (timeout, kick, or ban)
 * @param ctx Plugin context
 * @param api Core utils API
 * @param repo Moderation repository
 * @param member Guild member to apply action to
 * @param user User object
 * @param thresholdAction Action to apply
 * @returns Case ID of the created case
 */
export async function applyThresholdAction(
  ctx: PluginContext<ModConfig>,
  api: CoreUtilsAPI,
  repo: ModerationRepository,
  member: GuildMember | null,
  user: User,
  thresholdAction: ThresholdAction
): Promise<string> {
  const { action, duration, reason, thresholdCount } = thresholdAction;
  const botUser = ctx.client.user!;
  const fullReason = `Auto-escalation: ${reason}`;

  let caseId: string;

  switch (action) {
    case "timeout":
      if (!member || !member.moderatable) {
        ctx.logger.warn(`Cannot timeout ${user.tag} - not moderatable`);
        // Create case anyway to track the attempt
        caseId = await repo.createCase(
          "timeout",
          user.id,
          user.tag,
          botUser.id,
          botUser.tag,
          `${fullReason} (Failed: user not moderatable)`,
          duration ?? 600,
          { thresholdTriggered: true }
        );
        return caseId;
      }

      const timeoutDuration = duration ?? 600; // Default 10 minutes
      await member.timeout(timeoutDuration * 1000, fullReason);

      // DM user if enabled
      if (ctx.config.warnings.dmOnThresholdAction) {
        try {
          await user.send({
            embeds: [api.embeds.warning(
              `You have been automatically timed out in **${member.guild.name}** for ${formatDuration(timeoutDuration)}\n\n**Reason:** ${fullReason}`,
              "Automatic Timeout"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      caseId = await repo.createCase(
        "timeout",
        user.id,
        user.tag,
        botUser.id,
        botUser.tag,
        fullReason,
        timeoutDuration,
        { thresholdTriggered: true }
      );
      break;

    case "kick":
      if (!member || !member.kickable) {
        ctx.logger.warn(`Cannot kick ${user.tag} - not kickable`);
        // Create case anyway to track the attempt
        caseId = await repo.createCase(
          "kick",
          user.id,
          user.tag,
          botUser.id,
          botUser.tag,
          `${fullReason} (Failed: user not kickable)`,
          null,
          { thresholdTriggered: true }
        );
        return caseId;
      }

      // DM user if enabled
      if (ctx.config.warnings.dmOnThresholdAction) {
        try {
          await user.send({
            embeds: [api.embeds.error(
              `You have been automatically kicked from **${member.guild.name}**\n\n**Reason:** ${fullReason}`,
              "Automatic Kick"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      await member.kick(fullReason);

      caseId = await repo.createCase(
        "kick",
        user.id,
        user.tag,
        botUser.id,
        botUser.tag,
        fullReason,
        null,
        { thresholdTriggered: true }
      );
      break;

    case "ban":
      if (member && !member.bannable) {
        ctx.logger.warn(`Cannot ban ${user.tag} - not bannable`);
        // Create case anyway to track the attempt
        caseId = await repo.createCase(
          "ban",
          user.id,
          user.tag,
          botUser.id,
          botUser.tag,
          `${fullReason} (Failed: user not bannable)`,
          null,
          { thresholdTriggered: true }
        );
        return caseId;
      }

      // DM user if enabled
      if (ctx.config.warnings.dmOnThresholdAction && member) {
        try {
          await user.send({
            embeds: [api.embeds.error(
              `You have been automatically banned from **${member.guild.name}**\n\n**Reason:** ${fullReason}`,
              "Automatic Ban"
            )],
          });
        } catch {
          // User has DMs disabled
        }
      }

      await member!.guild.members.ban(user, {
        reason: fullReason,
        deleteMessageSeconds: ctx.config.deleteMessagesOnBan * 86400,
      });

      caseId = await repo.createCase(
        "ban",
        user.id,
        user.tag,
        botUser.id,
        botUser.tag,
        fullReason,
        null,
        { thresholdTriggered: true }
      );
      break;
  }

  return caseId;
}
