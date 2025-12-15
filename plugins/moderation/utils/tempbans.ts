import type { PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { ModerationRepository } from "../db/repository";
import { logToModLog } from "./modlog";

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

/**
 * Initialize the tempban scheduler to automatically unban users
 * when their temporary ban expires
 */
export function initTempbanScheduler(
  ctx: PluginContext<ModConfig>,
  api: CoreUtilsAPI,
  repo: ModerationRepository
): void {
  // Run every 60 seconds to check for expired tempbans
  api.scheduler.interval("moderation-tempban-checker", 60000, async () => {
    await processTempbans(ctx, api, repo);
  });

  ctx.logger.info("Tempban scheduler initialized (checking every 60 seconds)");
}

/**
 * Process expired temporary bans
 * - Finds all tempbans that have expired
 * - Unbans the users
 * - Creates unban cases
 * - Logs to modlog
 */
async function processTempbans(
  ctx: PluginContext<ModConfig>,
  api: CoreUtilsAPI,
  repo: ModerationRepository
): Promise<void> {
  try {
    const expiredTempbans = await repo.getExpiredTempbans();

    if (expiredTempbans.length === 0) {
      return; // Nothing to process
    }

    ctx.logger.debug(`Processing ${expiredTempbans.length} expired tempban(s)`);

    for (const tempban of expiredTempbans) {
      try {
        // Get guild
        const guild = await ctx.client.guilds.fetch(tempban.guild_id!).catch(() => null);
        if (!guild) {
          ctx.logger.warn(`Cannot process tempban for ${tempban.user_tag} - guild not found (${tempban.guild_id})`);
          continue;
        }

        // Check if user is still banned
        const bans = await guild.bans.fetch();
        const isBanned = bans.has(tempban.user_id);

        if (!isBanned) {
          ctx.logger.debug(`User ${tempban.user_tag} is no longer banned - skipping`);
          continue;
        }

        // Unban user
        await guild.members.unban(tempban.user_id, "Temporary ban expired");

        // Create unban case
        const botUser = ctx.client.user!;
        const caseId = await repo.createCase(
          "unban",
          tempban.user_id,
          tempban.user_tag,
          botUser.id,
          botUser.tag,
          "Temporary ban expired",
          null,
          { guildId: guild.id }
        );

        // Log to modlog
        if (ctx.config.modLog.enabled) {
          const modCase = await repo.getCase(caseId);
          if (modCase) {
            await logToModLog(ctx, api, caseId, modCase, ctx.config.modLog.channelId);
          }
        }

        ctx.logger.info(`Automatically unbanned ${tempban.user_tag} (tempban expired) - Case #${caseId}`);
      } catch (error) {
        ctx.logger.error(`Failed to process tempban for ${tempban.user_tag}:`, error);
      }
    }
  } catch (error) {
    ctx.logger.error("Error processing tempbans:", error);
  }
}
