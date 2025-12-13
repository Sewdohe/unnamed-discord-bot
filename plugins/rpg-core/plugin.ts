import { Embed, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Plugin, PluginContext, Command } from "@types";
import { z } from "zod";
import { CoreUtilsAPI } from "plugins/core-utils/plugin";

// Define the configuration schema using Zod
const configSchema = z.object({
    greeting: z.string().default("Hello"),
    maxUses: z.number().min(1).max(100).default(10),
    features: z.object({
        enableFoo: z.boolean().default(true),
        enableBar: z.boolean().default(false),
    }).default({}),
}).describe("RPG Plugin Configuration");  // This becomes a comment in the YAML

// Infer the TypeScript type from the schema
type RpgConfig = z.infer<typeof configSchema>;

const plugin: Plugin<typeof configSchema> = {
    manifest: {
        name: "RPG Core",
        version: "1.0.0",
        description: "Allows member to select RPG classes and manage their stats.",
        dependencies: {
            soft: ["core"],
        },
    },

    // Provide the schema and defaults
    config: {
        schema: configSchema,
        defaults: {
            greeting: "Hello",
            maxUses: 10,
            features: {
                enableFoo: true,
                enableBar: false,
            },
        },
    },

    async onLoad(ctx: PluginContext<RpgConfig>) {
        const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");

        // Head daddy slash command for RPG plugin
        ctx.registerCommand({
            data: new SlashCommandBuilder()
                .setName("rpg")
                .setDescription("rpg core plugin commands")
                .addSubcommand(sub =>
                    sub.setName("choose-class")
                        .setDescription("Choose your RPG class")
                ),

            async execute(interaction) {
                const subcommand = interaction.options.getSubcommand();

                switch (subcommand) {
                    case "choose-class":
                        let rpg_menu_embed = coreUtils?.api.embeds.create().setTitle("Choose Your RPG Class").setDescription("Select a class to start your adventure!");

                        // send embed
                        await interaction.reply({ embeds: [rpg_menu_embed], flags: MessageFlags.Ephemeral });
                        break;
                }
            },
        });

        ctx.logger.info("RPG Core plugin loaded!");
    },
};

export default plugin;