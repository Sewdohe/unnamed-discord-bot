import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { Collection, Document, ObjectId } from "mongodb";
import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";
import { getDatabase, prefixCollection } from "../../src/core/database";

// Config schema
const configSchema = z.object({
  itemLimit: z.number().min(1).max(100).default(20),
});

type Config = z.infer<typeof configSchema>;

// Database types
interface Item extends Document {
  _id?: ObjectId;
  user_id: string;
  name: string;
  created_at: Date;
}

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "items",
    version: "1.0.0",
    description: "Manage user items",
    dependencies: {
      soft: ["core-utils"],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      itemLimit: 20,
    },
  },

  async onLoad(ctx: PluginContext<Config>) {
    // Get core utils
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.warn("core-utils not available");
      return;
    }
    const api = coreUtils.api;

    // Get MongoDB collection (automatically created)
    const collection = api.database.getCollection<Item>(ctx, 'items');

    // Create index for better performance
    collection.createIndex({ user_id: 1, name: 1 }, { unique: true }).catch(() => {});

    // List items command
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("items")
        .setDescription("List your items"),

      async execute(interaction) {
        const items = await collection.find({ user_id: interaction.user.id })
          .sort({ created_at: -1 })
          .toArray();

        if (items.length === 0) {
          await interaction.reply({
            embeds: [api.embeds.info("You have no items yet!")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await api.paginate(interaction, {
          items,
          formatPage: (pageItems, page, totalPages) => {
            const description = pageItems
              .map((item, i) => `${i + 1}. ${item.name}`)
              .join("\n");

            return api.embeds.primary(description, "Your Items")
              .setFooter({ text: `Page ${page + 1}/${totalPages} • ${items.length} total items` });
          },
          itemsPerPage: 10,
        });
      },
    });

    // Add item command
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("add-item")
        .setDescription("Add a new item")
        .addStringOption(opt =>
          opt.setName("name")
            .setDescription("Item name")
            .setRequired(true)
            .setMaxLength(50)
        ),

      async execute(interaction) {
        const name = interaction.options.getString("name", true);

        // Check item limit
        const count = await collection.countDocuments({ user_id: interaction.user.id });

        if (count >= ctx.config.itemLimit) {
          await interaction.reply({
            embeds: [api.embeds.error(`You can only have ${ctx.config.itemLimit} items!`)],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        try {
          // Add item (unique index prevents duplicates)
          await collection.insertOne({
            user_id: interaction.user.id,
            name,
            created_at: new Date(),
          });

          await interaction.reply({
            embeds: [api.embeds.success(`Added item: **${name}**`)],
          });
        } catch (error: any) {
          if (error.code === 11000) {
            // Duplicate key error
            await interaction.reply({
              embeds: [api.embeds.error("You already have an item with that name!")],
              flags: MessageFlags.Ephemeral,
            });
          } else {
            throw error;
          }
        }
      },
    });

    // Delete item command
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("delete-item")
        .setDescription("Delete an item")
        .addStringOption(opt =>
          opt.setName("name")
            .setDescription("Item name")
            .setRequired(true)
        ),

      async execute(interaction) {
        const name = interaction.options.getString("name", true);

        // Check if item exists
        const item = await collection.findOne({
          user_id: interaction.user.id,
          name: name
        });

        if (!item) {
          await interaction.reply({
            embeds: [api.embeds.error("Item not found!")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Confirm deletion
        const confirmed = await api.confirm(interaction, {
          message: `Delete **${name}**?`,
          title: "Confirm Deletion",
        });

        if (!confirmed) {
          await interaction.followUp({
            embeds: [api.embeds.info("Deletion cancelled")],
          });
          return;
        }

        // Delete item
        await collection.deleteOne({ _id: item._id });

        await interaction.followUp({
          embeds: [api.embeds.success(`Deleted **${name}**`)],
        });
      },
    });

    ctx.logger.info("Items plugin loaded!");
  },
};

export default plugin;
