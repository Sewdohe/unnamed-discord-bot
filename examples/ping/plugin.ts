import { SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import type { Plugin, PluginContext, Command } from "@types";

// Define config schema
const configSchema = z.object({
  responseMessage: z.string().default("Pong!"),
  showLatency: z.boolean().default(true),
}).describe("Configuration for the Ping plugin");

type PingConfig = z.infer<typeof configSchema>;

// Define the plugin
const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "ping",
    version: "1.0.0",
    description: "Simple ping command to test bot latency",
    author: "Sewdohe",
  },

  config: {
    schema: configSchema,
    defaults: {
      responseMessage: "Pong!",
      showLatency: true,
    },
  },

  async onLoad(ctx: PluginContext<PingConfig>) {
    // Register the ping command
    ctx.registerCommand(pingCommand(ctx));

    ctx.logger.info("Ping plugin ready!");
  },
};

// Command factory - creates command with access to config
function pingCommand(ctx: PluginContext<PingConfig>): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Replies with pong and latency info"),

    async execute(interaction) {
      const { responseMessage, showLatency } = ctx.config;

      if (!showLatency) {
        await interaction.reply(responseMessage);
        return;
      }

      const { resource } = await interaction.reply({
        content: "Pinging...",
        withResponse: true,
      });

      const latency = resource!.message!.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = interaction.client.ws.ping;

      await interaction.editReply(
        `🏓 ${responseMessage} | Latency: ${latency}ms | API: ${apiLatency}ms`
      );
    },
  };
}

export default plugin;
