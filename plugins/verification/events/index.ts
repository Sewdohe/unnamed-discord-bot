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

// ============ Button Interaction Handler ============

export function interactionCreateHandler(ctx: PluginContext<VerificationConfig>, api: CoreUtilsAPI): Event<"interactionCreate"> {
  return {
    name: "interactionCreate",

    async execute(pluginCtx, interaction) {
      // Only handle button interactions
      if (!interaction.isButton()) return;

      // Only handle verification buttons
      if (!interaction.customId.startsWith("verification:")) return;

      const action = interaction.customId.split(":")[1];

      if (action === "verify") {
        await handleVerifyButton(ctx, api, interaction);
      }
    },
  };
}

// ============ Verify Button Handler ============

async function handleVerifyButton(ctx: PluginContext<VerificationConfig>, api: CoreUtilsAPI, interaction: any) {
  const member = interaction.member;
  const repo = createVerificationRepo(ctx);

  // Check if already verified
  if (repo.isVerified(interaction.user.id, interaction.guildId)) {
    const embed = api.embeds.info(
      "You are already verified!",
      "Already Verified"
    ) ?? new EmbedBuilder()
      .setDescription("You are already verified!")
      .setColor(0x3ba55d);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Create record if doesn't exist
  repo.create(interaction.user.id, interaction.guildId);

  // Mark as verified
  repo.verify(interaction.user.id, interaction.guildId);

  // Assign/remove roles
  try {
    if (ctx.config.verifiedRoleId && ctx.config.verifiedRoleId !== "") {
      await member.roles.add(ctx.config.verifiedRoleId);
    }
    if (ctx.config.unverifiedRoleId && ctx.config.unverifiedRoleId !== "") {
      await member.roles.remove(ctx.config.unverifiedRoleId);
    }

    ctx.logger.info(`User verified: ${interaction.user.tag} (${interaction.user.id})`);

    // Send success message
    const successEmbed = api.embeds.success(
      "You have been verified! Welcome to the server!",
      "✅ Verified"
    ) ?? new EmbedBuilder()
      .setTitle("✅ Verified")
      .setDescription("You have been verified!")
      .setColor(0x57f287);

    await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });

    // Send welcome message if enabled
    if (ctx.config.welcomeMessage.enabled) {
      const welcomeChannelId = ctx.config.welcomeMessage.channelId || ctx.config.verificationChannelId;

      if (welcomeChannelId && welcomeChannelId !== "") {
        const welcomeChannel = await interaction.guild.channels.fetch(welcomeChannelId) as TextChannel;

        if (welcomeChannel?.isTextBased()) {
          const message = ctx.config.welcomeMessage.message
            .replace("{user}", `<@${interaction.user.id}>`)
            .replace("{username}", interaction.user.username)
            .replace("{server}", interaction.guild.name);

          const welcomeEmbed = api.embeds.primary(
            message,
            "Welcome!"
          ) ?? new EmbedBuilder()
            .setDescription(message)
            .setColor(0x5865f2);

          await welcomeChannel.send({ embeds: [welcomeEmbed] });
        }
      }
    }

    // Log verification
    if (ctx.config.logChannelId && ctx.config.logChannelId !== "") {
      const logChannel = await interaction.guild.channels.fetch(ctx.config.logChannelId) as TextChannel;

      if (logChannel?.isTextBased()) {
        const logEmbed = api.embeds.info(
          `**User:** ${interaction.user} (${interaction.user.id})\n**Method:** Button Click`,
          "✅ User Verified"
        ) ?? new EmbedBuilder()
          .setTitle("✅ User Verified")
          .setDescription(`${interaction.user.tag} verified via button`)
          .setColor(0x3ba55d)
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      }
    }
  } catch (error) {
    ctx.logger.error("Failed to verify user:", error);

    const errorEmbed = api.embeds.error(
      "Failed to verify you! Please contact an administrator.",
      "Error"
    ) ?? new EmbedBuilder()
      .setDescription("Failed to verify")
      .setColor(0xed4245);

    await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
  }
}
