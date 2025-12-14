import { z } from "zod";
import { ButtonStyle, EmbedBuilder, MessageFlags, TextChannel } from "discord.js";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import { initDatabase, createVerificationRepo } from "./db/repository";
import { verifyCommand } from "./commands";
import { guildMemberAddHandler } from "./events";

// ============ Configuration Schema ============

const configSchema = z.object({
  enabled: z.boolean().default(true)
    .describe("Enable the verification system"),

  verifiedRoleId: z.string().default("")
    .describe("Role ID to assign when users verify (right-click role > Copy ID)"),

  unverifiedRoleId: z.string().default("")
    .describe("Role ID to assign when users join, removed after verification (right-click role > Copy ID)"),

  verificationChannelId: z.string().default("")
    .describe("Channel ID where verification panel is sent (right-click channel > Copy ID)"),

  logChannelId: z.string().default("")
    .describe("Channel ID for verification logs - leave empty to disable logging (right-click channel > Copy ID)"),

  welcomeMessage: z.object({
    enabled: z.boolean().default(true)
      .describe("Send welcome message after verification"),

    channelId: z.string().default("")
      .describe("Channel ID to send welcome message - leave empty to send in verification channel (right-click channel > Copy ID)"),

    message: z.string().default("Welcome to the server, {user}!")
      .describe("Welcome message content (use {user} for mention, {username} for name, {server} for server name)"),
  }).default({})
    .describe("Welcome message settings"),

  verificationPanel: z.object({
    title: z.string().default("✅ Server Verification")
      .describe("Title of the verification panel embed"),

    description: z.string().default("Click the button below to verify and gain access to the server!")
      .describe("Description text in the verification panel"),

    buttonLabel: z.string().default("Verify")
      .describe("Label for the verification button"),

    color: z.number().default(0x5865f2)
      .describe("Embed color (hex color as decimal number)"),
  }).default({})
    .describe("Verification panel customization"),

  kickUnverified: z.object({
    enabled: z.boolean().default(false)
      .describe("Kick users who don't verify within the timeout period"),

    timeout: z.number().min(1).max(1440).default(60)
      .describe("Minutes to wait before kicking unverified users"),
  }).default({})
    .describe("Auto-kick unverified users settings"),
}).describe("Verification system configuration");

type VerificationConfig = z.infer<typeof configSchema>;

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "verification",
    version: "1.0.0",
    description: "Server verification system with button-based verification",
    author: "Sewdohe",
    dependencies: {
      hard: ["core-utils"],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
      verifiedRoleId: "",
      unverifiedRoleId: "",
      verificationChannelId: "",
      logChannelId: "",
      welcomeMessage: {
        enabled: true,
        channelId: "",
        message: "Welcome to the server, {user}!",
      },
      verificationPanel: {
        title: "✅ Server Verification",
        description: "Click the button below to verify and gain access to the server!",
        buttonLabel: "Verify",
        color: 0x5865f2,
      },
      kickUnverified: {
        enabled: false,
        timeout: 60,
      },
    },
  },

  async onLoad(ctx: PluginContext<VerificationConfig>) {
    // Get core-utils
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.error("core-utils is required and missing - aborting verification plugin load");
      throw new Error("core-utils plugin required");
    }
    const api = coreUtils.api;

    // Check if enabled
    if (!ctx.config.enabled) {
      ctx.logger.warn("Verification plugin is disabled in config");
      return;
    }

    // Initialize database
    await initDatabase(ctx);

    // Define verification button UI (global scope - persists across restarts)
    api.components.define(ctx, {
      id: "verification-panel",
      scope: "global",
      components: [
        {
          customId: "verify",
          label: ctx.config.verificationPanel.buttonLabel,
          style: ButtonStyle.Success,
          emoji: "✅",
        },
      ],
      async handler(pluginCtx, interaction) {
        const repo = createVerificationRepo(pluginCtx);

        // Check if already verified
        if (repo.isVerified(interaction.user.id, interaction.guildId!)) {
          await interaction.reply({
            embeds: [api.embeds.info("You are already verified!", "Already Verified")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Get member
        const member = await interaction.guild!.members.fetch(interaction.user.id);
        if (!member) {
          await interaction.reply({
            embeds: [api.embeds.error("Failed to fetch your member data!", "Error")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Create record if doesn't exist
        repo.create(interaction.user.id, interaction.guildId!);

        // Mark as verified
        repo.verify(interaction.user.id, interaction.guildId!);

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
          await interaction.reply({
            embeds: [api.embeds.success("You have been verified! Welcome to the server!", "✅ Verified")],
            flags: MessageFlags.Ephemeral,
          });

          // Send welcome message if enabled
          if (ctx.config.welcomeMessage.enabled) {
            const welcomeChannelId = ctx.config.welcomeMessage.channelId || ctx.config.verificationChannelId;

            if (welcomeChannelId && welcomeChannelId !== "") {
              const welcomeChannel = await interaction.guild!.channels.fetch(welcomeChannelId) as TextChannel;

              if (welcomeChannel?.isTextBased()) {
                const message = ctx.config.welcomeMessage.message
                  .replace("{user}", `<@${interaction.user.id}>`)
                  .replace("{username}", interaction.user.username)
                  .replace("{server}", interaction.guild!.name);

                await welcomeChannel.send({
                  embeds: [api.embeds.primary(message, "Welcome!")],
                });
              }
            }
          }

          // Log verification
          if (ctx.config.logChannelId && ctx.config.logChannelId !== "") {
            const logChannel = await interaction.guild!.channels.fetch(ctx.config.logChannelId) as TextChannel;

            if (logChannel?.isTextBased()) {
              const logEmbed = api.embeds.info(
                `**User:** ${interaction.user} (${interaction.user.id})\n**Method:** Button Click`,
                "✅ User Verified"
              );

              await logChannel.send({ embeds: [logEmbed] });
            }
          }
        } catch (error) {
          ctx.logger.error("Failed to verify user:", error);
          await interaction.reply({
            embeds: [api.embeds.error("Failed to verify you! Please contact an administrator.", "Error")],
            flags: MessageFlags.Ephemeral,
          });
        }
      },
    });

    // Register commands
    ctx.registerCommand(verifyCommand(ctx, api));

    // Register events
    ctx.registerEvent(guildMemberAddHandler(ctx, api));

    ctx.logger.info("Verification plugin loaded!");
  },
};

export default plugin;
