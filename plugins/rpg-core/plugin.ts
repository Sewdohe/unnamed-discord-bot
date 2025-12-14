import { EmbedBuilder, MessageFlags, SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { Plugin, PluginContext, Command } from "@types";
import { z } from "zod";
import { CoreUtilsAPI } from "plugins/core-utils/plugin";
import { initDatabase, createUser } from "./db/repository";

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
            hard: ["core-utils"],
            soft: [],
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
        // Initialize database
        await initDatabase(ctx);
        const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
        if (!coreUtils?.api) {
            ctx.logger.error("core-utils is required but missing - aborting rpg-core load");
            throw new Error("core-utils plugin required");
        }
        const api = coreUtils.api;

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

                        // Use core-utils embed and components helpers
                        let rpg_menu_embed = api.embeds.create().setTitle("Choose Your RPG Class").setDescription("Select a class to start your adventure!");

                        const row = api.components.actionRow([
                            { customId: "rpg_choose_warrior", label: "Warrior", style: ButtonStyle.Primary },
                            { customId: "rpg_choose_mage", label: "Mage", style: ButtonStyle.Primary },
                            { customId: "rpg_choose_rogue", label: "Rogue", style: ButtonStyle.Primary },
                        ]);

                        // send embed and action row
                        await interaction.reply({ embeds: [rpg_menu_embed], components: row ? [row] : [], flags: MessageFlags.Ephemeral });
                        break;
                }
            },
        });

        ctx.logger.info("RPG Core plugin loaded!");
    },
};

export default plugin;