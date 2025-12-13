import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import { initDatabase } from "./db/repository";
import { verifyCommand } from "./commands";
import { guildMemberAddHandler, interactionCreateHandler } from "./events";

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
      soft: ["core-utils"],
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
      ctx.logger.warn("core-utils not available, some features may be limited");
    }
    const api = coreUtils?.api;

    // Check if enabled
    if (!ctx.config.enabled) {
      ctx.logger.warn("Verification plugin is disabled in config");
      return;
    }

    // Initialize database
    await initDatabase(ctx);

    // Register commands
    ctx.registerCommand(verifyCommand(ctx, api));

    // Register events
    ctx.registerEvent(guildMemberAddHandler(ctx, api));
    ctx.registerEvent(interactionCreateHandler(ctx, api));

    ctx.logger.info("Verification plugin loaded!");
  },
};

export default plugin;
