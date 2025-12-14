import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import type { Plugin, PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../plugins/core-utils/plugin";
import { z } from "zod";
import { initDatabase, createItemRepo } from "./db/repository";

// ============ Configuration Schema ============

const configSchema = z.object({
  enabled: z.boolean().default(true)
    .describe("Enable/disable the plugin"),

  maxItemsPerUser: z.number().min(1).max(100).default(10)
    .describe("Maximum items a user can have"),

  features: z.object({
    allowTrading: z.boolean().default(false)
      .describe("Allow users to trade items"),

    allowGifts: z.boolean().default(true)
      .describe("Allow users to gift items"),
  }).default({})
    .describe("Feature toggles"),
}).describe("Template Plugin Configuration");

type TemplateConfig = z.infer<typeof configSchema>;

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "template-plugin",
    version: "1.0.0",
    description: "A template plugin demonstrating best practices",
    author: "Your Name",
    dependencies: {
      hard: ["core-utils"], // Required dependency
      soft: [], // Optional dependencies
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
      maxItemsPerUser: 10,
      features: {
        allowTrading: false,
        allowGifts: true,
      },
    },
  },

  async onLoad(ctx: PluginContext<TemplateConfig>) {
    // Get core-utils API
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.error("core-utils is required - aborting load");
      throw new Error("core-utils plugin required");
    }
    const api = coreUtils.api;

    // Check if enabled
    if (!ctx.config.enabled) {
      ctx.logger.warn("Plugin is disabled in config");
      return;
    }

    // Initialize database
    await initDatabase(ctx);

    // Create repository
    const itemRepo = createItemRepo(ctx, api);

    // Register commands
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("item")
        .setDescription("Manage your items")
        .addSubcommand(sub =>
          sub.setName("list")
            .setDescription("List all your items")
        )
        .addSubcommand(sub =>
          sub.setName("add")
            .setDescription("Add a new item")
            .addStringOption(opt =>
              opt.setName("name")
                .setDescription("Item name")
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub.setName("remove")
            .setDescription("Remove an item")
            .addIntegerOption(opt =>
              opt.setName("id")
                .setDescription("Item ID")
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub.setName("gift")
            .setDescription("Gift an item to another user")
            .addIntegerOption(opt =>
              opt.setName("id")
                .setDescription("Item ID")
                .setRequired(true)
            )
            .addUserOption(opt =>
              opt.setName("user")
                .setDescription("User to gift to")
                .setRequired(true)
            )
        ),

      async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
          case "list": {
            const items = itemRepo.getUserItems(interaction.user.id);

            if (items.length === 0) {
              await interaction.reply({
                embeds: [api.embeds.info("You don't have any items yet!", "No Items")],
                ephemeral: true,
              });
              return;
            }

            const description = items
              .map((item, i) => `**${i + 1}.** ${item.name} (ID: ${item.id})`)
              .join("\n");

            await interaction.reply({
              embeds: [api.embeds.primary(description, `Your Items (${items.length}/${ctx.config.maxItemsPerUser})`)],
            });
            break;
          }

          case "add": {
            const name = interaction.options.getString("name", true);
            const currentItems = itemRepo.getUserItems(interaction.user.id);

            // Check limit
            if (currentItems.length >= ctx.config.maxItemsPerUser) {
              await interaction.reply({
                embeds: [api.embeds.error(`You can only have ${ctx.config.maxItemsPerUser} items!`, "Limit Reached")],
                ephemeral: true,
              });
              return;
            }

            // Create item
            const itemId = itemRepo.createItem(interaction.user.id, name);

            await interaction.reply({
              embeds: [api.embeds.success(`Added **${name}** to your inventory! (ID: ${itemId})`, "Item Added")],
            });
            break;
          }

          case "remove": {
            const itemId = interaction.options.getInteger("id", true);
            const item = itemRepo.getItem(itemId);

            // Check if exists and belongs to user
            if (!item || item.user_id !== interaction.user.id) {
              await interaction.reply({
                embeds: [api.embeds.error("Item not found or doesn't belong to you!", "Error")],
                ephemeral: true,
              });
              return;
            }

            // Confirm deletion
            const confirmed = await api.confirm(interaction, {
              message: `Are you sure you want to delete **${item.name}**?`,
              title: "Confirm Deletion",
            });

            if (!confirmed) {
              await interaction.followUp({
                embeds: [api.embeds.info("Deletion cancelled", "Cancelled")],
                ephemeral: true,
              });
              return;
            }

            itemRepo.deleteItem(itemId);

            await interaction.followUp({
              embeds: [api.embeds.success(`Deleted **${item.name}**`, "Item Deleted")],
            });
            break;
          }

          case "gift": {
            if (!ctx.config.features.allowGifts) {
              await interaction.reply({
                embeds: [api.embeds.error("Gifting is currently disabled!", "Disabled")],
                ephemeral: true,
              });
              return;
            }

            const itemId = interaction.options.getInteger("id", true);
            const recipient = interaction.options.getUser("user", true);
            const item = itemRepo.getItem(itemId);

            // Validate
            if (!item || item.user_id !== interaction.user.id) {
              await interaction.reply({
                embeds: [api.embeds.error("Item not found or doesn't belong to you!", "Error")],
                ephemeral: true,
              });
              return;
            }

            if (recipient.id === interaction.user.id) {
              await interaction.reply({
                embeds: [api.embeds.error("You can't gift items to yourself!", "Error")],
                ephemeral: true,
              });
              return;
            }

            const recipientItems = itemRepo.getUserItems(recipient.id);
            if (recipientItems.length >= ctx.config.maxItemsPerUser) {
              await interaction.reply({
                embeds: [api.embeds.error("Recipient has too many items!", "Error")],
                ephemeral: true,
              });
              return;
            }

            // Transfer item
            itemRepo.transferItem(itemId, recipient.id);

            await interaction.reply({
              embeds: [api.embeds.success(
                `Gifted **${item.name}** to ${recipient}!`,
                "Gift Sent"
              )],
            });
            break;
          }
        }
      },
    });

    ctx.logger.info("Template plugin loaded!");
  },
};

export default plugin;
