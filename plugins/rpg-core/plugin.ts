import { EmbedBuilder, MessageFlags, SlashCommandBuilder, ButtonStyle, ChatInputCommandInteraction } from "discord.js";
import type { Plugin, PluginContext, Event } from "@types";
import { z } from "zod";
import { CoreUtilsAPI } from "plugins/core-utils/plugin";
import { initDatabase, createRPGRepo } from "./db/repository";

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
        // Get core-utils
        const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
        if (!coreUtils?.api) {
            ctx.logger.error("core-utils is required but missing - aborting rpg-core load");
            throw new Error("core-utils plugin required");
        }
        const api = coreUtils.api;

        // Initialize database
        await initDatabase(ctx);

        // Create repository
        const rpgRepo = createRPGRepo(ctx, api);

        // Define UI group for class selection (message scoped)
        api.components.define(ctx, {
            id: "choose-class",
            scope: "message",
            components: [
                { customId: "warrior", label: "Warrior", style: ButtonStyle.Primary },
                { customId: "mage", label: "Mage", style: ButtonStyle.Primary },
                { customId: "rogue", label: "Rogue", style: ButtonStyle.Primary },
            ],
            handler: async (pluginCtx, interaction, meta) => {
                // meta.componentId will be the un-namespaced id ('warrior', 'mage', 'rogue')
                ctx.logger.info(`User ${interaction.user.username} selected class: ${meta.componentId}`);
                const classKey = meta.componentId;
                try {
                    const profiles = rpgRepo.getProfilesByDiscordId(interaction.user.id);
                    const rpgClass = classKey.charAt(0).toUpperCase() + classKey.slice(1).toLowerCase();
                    if (!profiles || profiles.length === 0) {
                        // Create minimal profile (id will be auto-assigned by DB)
                        rpgRepo.createProfile({
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
                        rpgRepo.updateProfile(profiles[0].id, { rpgClass: rpgClass as any, name: interaction.user.username });
                    }
                } catch (err) {
                    try { pluginCtx.logger.warn("Failed to persist RPG class selection:", err); } catch {}
                }

                const resultEmbed = api.embeds.success(`You chose ${classKey}. Your adventure awaits!`, "Class Selected");
                try {
                    await interaction.update({ embeds: [resultEmbed], components: [] });
                } catch (err) {
                    await interaction.reply({ embeds: [resultEmbed], flags: MessageFlags.Ephemeral });
                }
            },
        });

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
                        const rpg_menu_embed = api.embeds.create().setTitle("Choose Your RPG Class").setDescription("Select a class to start your adventure!");
                        await api.components.sendWithHandlers(ctx, interaction, {
                            groupId: "choose-class",
                            content: undefined,
                            embeds: [rpg_menu_embed],
                            ephemeral: true,
                        });
                        break;
                }
            },
        });

        // UI is handled by the `sendWithHandlers` flow above and the grouped handler registered via `api.components.define`.

        ctx.logger.info("RPG Core plugin loaded!");
    },
};

export default plugin;