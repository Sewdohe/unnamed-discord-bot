import type { PluginContext, Event } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { GuildMember, User } from "discord.js";
import type { ModerationRepository, CaseType } from "../db/repository";
import { logToModLog, parseDuration } from "../utils/modlog";
import { trackMessage, checkForSpam, clearUserHistory } from "../utils/spam-detector";

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
    spamFilter: {
      enabled: boolean;
      similarityThreshold: number;
      messageThreshold: number;
      timeWindow: number;
      actions: string[];
      timeoutDuration: string;
      exemptRoles: string[];
      exemptChannels: string[];
    };
  };
};

// ============ Auto-Moderation Event ============

export function autoModEvent(ctx: PluginContext<ModConfig>, api: CoreUtilsAPI, repo: ModerationRepository): Event<"messageCreate"> {
  return {
    name: "messageCreate",
    async execute(pluginCtx, message) {
      // Ignore bots
      if (message.author.bot) return;

      // Ignore DMs
      if (!message.guild) return;

      const member = message.member as GuildMember;
      if (!member) return;

      // Check spam filter first (before tracking message)
      if (ctx.config.autoMod.spamFilter.enabled) {
        const spamResult = await checkSpamFilter(ctx, api, repo, message, member);
        if (spamResult) return; // Message was spam and handled
      }

      // Track message for spam detection (after checks, so we only track non-spam messages)
      if (ctx.config.autoMod.spamFilter.enabled) {
        trackMessage(message.guild.id, message.author.id, message.id, message.content);
      }

      // Check message filter
      if (ctx.config.autoMod.messageFilter.enabled) {
        const filterResult = await checkMessageFilter(ctx, api, repo, message, member);
        if (filterResult) return; // Message was handled
      }

      // Check invite filter
      if (ctx.config.autoMod.inviteFilter.enabled) {
        await checkInviteFilter(ctx, api, repo, message, member);
      }
    },
  };
}

// ============ Message Filter ============

async function checkMessageFilter(
  ctx: PluginContext<ModConfig>,
  api: CoreUtilsAPI,
  repo: ModerationRepository,
  message: any,
  member: GuildMember
): Promise<boolean> {
  const config = ctx.config.autoMod.messageFilter;

  // Check exemptions
  if (config.exemptChannels.includes(message.channel.id)) return false;
  if (config.exemptRoles.some(roleId => member.roles.cache.has(roleId))) return false;

  // Check for filtered words
  const content = message.content.toLowerCase();
  const foundWord = config.words.find(word => content.includes(word.toLowerCase()));

  if (!foundWord) return false;

  // Delete message
  try {
    await message.delete();
  } catch (error) {
    ctx.logger.error("Failed to delete message:", error);
    return false;
  }

  // Take actions
  const caseId = await takeAutoModAction(
    ctx,
    api,
    repo,
    member,
    message.author,
    config.actions,
    config.timeoutDuration,
    `AutoMod: Used filtered word "${foundWord}"`,
    "automod_filter"
  );

  // Notify user (ephemeral-like via DM)
  try {
    const actionsList = config.actions.join(", ");
    await message.author.send({
      embeds: [api.embeds.warning(
        `Your message in **${message.guild.name}** was removed by auto-moderation.\n\n**Reason:** Contained filtered word\n**Actions:** ${actionsList}`,
        "Message Removed"
      )],
    });
  } catch {
    // User has DMs disabled
  }

  return true;
}

// ============ Invite Filter ============

async function checkInviteFilter(
  ctx: PluginContext<ModConfig>,
  api: CoreUtilsAPI,
  repo: ModerationRepository,
  message: any,
  member: GuildMember
): Promise<boolean> {
  const config = ctx.config.autoMod.inviteFilter;

  // Check exemptions
  if (config.exemptChannels.includes(message.channel.id)) return false;
  if (config.exemptRoles.some(roleId => member.roles.cache.has(roleId))) return false;

  // Check for invite links
  const inviteRegex = /discord(?:\.gg|app\.com\/invite)\/([a-zA-Z0-9-]+)/gi;
  const matches = message.content.match(inviteRegex);

  if (!matches) return false;

  // Check if any invites are not in the allowed list
  const hasDisallowedInvite = matches.some((invite: string) => {
    const code = invite.split('/').pop();
    return !config.allowedInvites.includes(code || '');
  });

  if (!hasDisallowedInvite) return false;

  // Delete message
  try {
    await message.delete();
  } catch (error) {
    ctx.logger.error("Failed to delete message:", error);
    return false;
  }

  // Take actions
  const caseId = await takeAutoModAction(
    ctx,
    api,
    repo,
    member,
    message.author,
    config.actions,
    config.timeoutDuration,
    "AutoMod: Posted unauthorized Discord invite",
    "automod_invite"
  );

  // Notify user
  try {
    const actionsList = config.actions.join(", ");
    await message.author.send({
      embeds: [api.embeds.warning(
        `Your message in **${message.guild.name}** was removed by auto-moderation.\n\n**Reason:** Unauthorized Discord invite\n**Actions:** ${actionsList}`,
        "Message Removed"
      )],
    });
  } catch {
    // User has DMs disabled
  }

  return true;
}

// ============ Spam Filter ============

async function checkSpamFilter(
  ctx: PluginContext<ModConfig>,
  api: CoreUtilsAPI,
  repo: ModerationRepository,
  message: any,
  member: GuildMember
): Promise<boolean> {
  const config = ctx.config.autoMod.spamFilter;

  // Check exemptions
  if (config.exemptChannels.includes(message.channel.id)) return false;
  if (config.exemptRoles.some(roleId => member.roles.cache.has(roleId))) return false;

  // Skip very short messages (less than 5 characters) - unlikely to be meaningful spam
  if (message.content.length < 5) return false;

  // Check for spam
  const spamCheck = checkForSpam(
    message.guild.id,
    message.author.id,
    message.content,
    {
      similarityThreshold: config.similarityThreshold,
      messageThreshold: config.messageThreshold,
      timeWindow: config.timeWindow,
    }
  );

  if (!spamCheck.isSpam) return false;

  ctx.logger.debug(
    `Spam detected: ${message.author.tag} sent ${spamCheck.similarMessages} similar messages in ${config.timeWindow}s`
  );

  // Delete the current message
  try {
    await message.delete();
  } catch (error) {
    ctx.logger.error("Failed to delete spam message:", error);
  }

  // Delete matched spam messages
  try {
    const channel = message.channel;
    if (channel.isTextBased()) {
      for (const msgId of spamCheck.matchedMessages) {
        try {
          const msg = await channel.messages.fetch(msgId);
          await msg.delete();
        } catch {
          // Message might already be deleted or not accessible
        }
      }
    }
  } catch (error) {
    ctx.logger.error("Failed to delete spam messages:", error);
  }

  // Clear user's message history to prevent repeated triggers
  clearUserHistory(message.guild.id, message.author.id);

  // Take actions
  const caseId = await takeAutoModAction(
    ctx,
    api,
    repo,
    member,
    message.author,
    config.actions,
    config.timeoutDuration,
    `AutoMod: Spam detected (${spamCheck.similarMessages} similar messages in ${config.timeWindow}s)`,
    "automod_spam"
  );

  // Notify user
  try {
    const actionsList = config.actions.join(", ");
    await message.author.send({
      embeds: [api.embeds.warning(
        `Your messages in **${message.guild.name}** were removed by auto-moderation.\n\n**Reason:** Spam detected (${spamCheck.similarMessages} similar messages)\n**Actions:** ${actionsList}`,
        "Spam Detected"
      )],
    });
  } catch {
    // User has DMs disabled
  }

  return true;
}

// ============ Auto-Mod Actions ============

async function takeAutoModAction(
  ctx: PluginContext<ModConfig>,
  api: CoreUtilsAPI,
  repo: ModerationRepository,
  member: GuildMember,
  user: User,
  actions: string[],
  timeoutDuration: string,
  reason: string,
  caseType: CaseType
): Promise<string> {
  let caseId = "";

  try {
    // Process each action
    for (const action of actions) {
      switch (action) {
        case "delete":
          // Just delete (already done), create case if not already created
          if (!caseId) {
            const botUser = ctx.client.user!;
            caseId = await repo.createCase(caseType, user.id, user.tag, botUser.id, botUser.tag, reason);
          }
          break;

        case "warn":
          // Create case if not already created
          if (!caseId) {
            const botUser = ctx.client.user!;
            caseId = await repo.createCase(caseType, user.id, user.tag, botUser.id, botUser.tag, reason);
          }
          // Send DM
          try {
            await user.send({
              embeds: [api.embeds.warning(reason, "Warning")],
            });
          } catch {
            // User has DMs disabled
          }
          break;

        case "timeout":
          const duration = parseDuration(timeoutDuration);
          if (duration && member.moderatable) {
            await member.timeout(duration * 1000, reason);
            if (!caseId) {
              const botUser = ctx.client.user!;
              caseId = await repo.createCase(caseType, user.id, user.tag, botUser.id, botUser.tag, reason, duration);
            }
          }
          break;

        case "kick":
          if (member.kickable) {
            await member.kick(reason);
            if (!caseId) {
              const botUser = ctx.client.user!;
              caseId = await repo.createCase(caseType, user.id, user.tag, botUser.id, botUser.tag, reason);
            }
          }
          break;
      }
    }

    // Log to modlog
    if (caseId && ctx.config.modLog.enabled) {
      const modCase = await repo.getCase(caseId);
      if (modCase) {
        await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
      }
    }
  } catch (error) {
    ctx.logger.error("Auto-mod action failed:", error);
  }

  return caseId;
}
