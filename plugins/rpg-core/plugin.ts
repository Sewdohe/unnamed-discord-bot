import { EmbedBuilder, MessageFlags, SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { Plugin, PluginContext, Event } from "@types";
import { z } from "zod";
import { CoreUtilsAPI } from "plugins/core-utils/plugin";
import { initDatabase, createUser, getUserProfiles, updatePlayerProfile } from "./db/repository";

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

        // After you get `api` from core-utils in onLoad:
        // ctx.registerCommand({...}) // existing command already
        // Register the event below to handle button interactions

        ctx.registerEvent({
            name: "interactionCreate",
            async execute(pluginCtx, interaction) {
                // only handle button clicks
                if (!interaction.isButton()) return;

                // make sure it's a button for RPG selection
                if (!interaction.customId.startsWith("rpg_choose_")) return;

                // extract the class key: e.g. "rpg_choose_warrior" -> "warrior"
                const classKey = interaction.customId.replace("rpg_choose_", "");

                // Persist the choice to the database via the repo
                try {
                    const profiles = getUserProfiles(pluginCtx, interaction.user.id);
                    const rpgClass = classKey.charAt(0).toUpperCase() + classKey.slice(1).toLowerCase();
                    if (!profiles || profiles.length === 0) {
                        // Create minimal profile (id will be auto-assigned by DB)
                        await createUser(pluginCtx, {
                            discord_id: interaction.user.id,
                            name: interaction.user.username,
                            level: 1,
                            health: 100,
                            experience: 0,
                            rpgClass: rpgClass as any,
                            strength: 1,
                            agility: 1,
                            intelligence: 1,
                            vitality: 1,
                        });
                    } else {
                        // Update first profile's class (if multiple records exist, update the first one)
                        await updatePlayerProfile(pluginCtx, profiles[0].id, { rpgClass: rpgClass as any });
                    }
                } catch (err) {
                    // Don't block flow if database operations fail - just log
                    try { pluginCtx.logger.warn("Failed to persist RPG class selection:", err); } catch {};
                }

                // Build a response embed
                const resultEmbed = api.embeds.success(
                    `You chose ${classKey}. Your adventure awaits!`,
                    "Class Selected"
                );

                // Build a fresh action row (same as the one used in the command) so we can disable it via helper
                const originalRow = api.components.actionRow([
                    { customId: "rpg_choose_warrior", label: "Warrior", style: ButtonStyle.Primary },
                    { customId: "rpg_choose_mage", label: "Mage", style: ButtonStyle.Primary },
                    { customId: "rpg_choose_rogue", label: "Rogue", style: ButtonStyle.Primary },
                ]);

                const [disabledRow] = api.components.disableAll(originalRow);

                // Update the originating message that contained the buttons and embed
                try {
                    await interaction.update({
                        embeds: [resultEmbed],
                        components: [disabledRow],
                    });
                } catch (err) {
                    // if update fails (message might be ephemeral or different), fallback to ephemeral reply
                    await interaction.reply({
                        embeds: [resultEmbed],
                        flags: MessageFlags.Ephemeral,
                    });
                }
            },
        });

        ctx.logger.info("RPG Core plugin loaded!");
    },
};

export default plugin;