import { EmbedBuilder, MessageFlags, TextChannel } from "discord.js";
import type { PluginContext, Event } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import { createVerificationRepo } from "../db/repository";

// Import config type from main plugin
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

// ============ Member Join Handler ============

export function guildMemberAddHandler(ctx: PluginContext<VerificationConfig>, api: CoreUtilsAPI): Event<"guildMemberAdd"> {
  return {
    name: "guildMemberAdd",

    async execute(pluginCtx, member) {
      // Skip if verification is disabled
      if (!ctx.config.enabled) return;

      const repo = createVerificationRepo(ctx);

      // Create verification record
      repo.create(member.id, member.guild.id);

      ctx.logger.info(`New member joined: ${member.user.tag} (${member.id})`);

      // Assign unverified role if configured
      if (ctx.config.unverifiedRoleId && ctx.config.unverifiedRoleId !== "") {
        try {
          await member.roles.add(ctx.config.unverifiedRoleId);
          ctx.logger.debug(`Assigned unverified role to ${member.user.tag}`);
        } catch (error) {
          ctx.logger.error("Failed to assign unverified role:", error);
        }
      }

      // Schedule kick if enabled
      if (ctx.config.kickUnverified.enabled && ctx.config.kickUnverified.timeout > 0) {
        const timeout = ctx.config.kickUnverified.timeout * 60 * 1000; // Convert to milliseconds

        setTimeout(async () => {
          // Check if still unverified
          if (!repo.isVerified(member.id, member.guild.id)) {
            try {
              await member.kick("Failed to verify within the timeout period");
              ctx.logger.info(`Kicked ${member.user.tag} for not verifying`);

              // Log kick
              if (ctx.config.logChannelId && ctx.config.logChannelId !== "") {
                const logChannel = await member.guild.channels.fetch(ctx.config.logChannelId) as TextChannel;
                if (logChannel?.isTextBased()) {
                  const embed = api.embeds.warning(
                    `**User:** ${member.user.tag} (${member.id})\n**Reason:** Failed to verify within ${ctx.config.kickUnverified.timeout} minutes`,
                    "⚠️ User Kicked (Unverified)"
                  ) ?? new EmbedBuilder()
                    .setTitle("⚠️ User Kicked (Unverified)")
                    .setDescription(`${member.user.tag} was kicked for not verifying`)
                    .setColor(0xfee75c)
                    .setTimestamp();

                  await logChannel.send({ embeds: [embed] });
                }
              }
            } catch (error) {
              ctx.logger.error(`Failed to kick ${member.user.tag}:`, error);
            }
          }
        }, timeout);
      }
    },
  };
}
