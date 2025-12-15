import {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonStyle,
  MessageFlags,
  ChatInputCommandInteraction,
} from "discord.js";
import type { PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../../plugins/core-utils/plugin";
import type { ItemRepository } from "../db/repository";

// ============ Configuration Type ============

export type TemplateConfig = {
  maxItemsPerUser: number;
  defaultQuantity: number;
  enableNotifications: boolean;
};

// ============ Main Command ============

/**
 * Main command with multiple subcommands
 * Demonstrates various Discord.js and framework features
 */
export function createItemCommand(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: ItemRepository
): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("items")
      .setDescription("Manage your items")
      .addSubcommand(sub =>
        sub.setName("list")
          .setDescription("View all your items")
      )
      .addSubcommand(sub =>
        sub.setName("add")
          .setDescription("Add a new item")
          .addStringOption(opt =>
            opt.setName("name")
              .setDescription("Item name")
              .setRequired(true)
              .setMaxLength(100)
          )
          .addStringOption(opt =>
            opt.setName("description")
              .setDescription("Item description")
              .setRequired(false)
              .setMaxLength(500)
          )
          .addIntegerOption(opt =>
            opt.setName("quantity")
              .setDescription("Item quantity")
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(999)
          )
      )
      .addSubcommand(sub =>
        sub.setName("view")
          .setDescription("View details of a specific item")
          .addStringOption(opt =>
            opt.setName("name")
              .setDescription("Item name")
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName("delete")
          .setDescription("Delete an item")
          .addStringOption(opt =>
            opt.setName("name")
              .setDescription("Item name")
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName("update")
          .setDescription("Update item quantity")
          .addStringOption(opt =>
            opt.setName("name")
              .setDescription("Item name")
              .setRequired(true)
          )
          .addIntegerOption(opt =>
            opt.setName("quantity")
              .setDescription("New quantity")
              .setRequired(true)
              .setMinValue(0)
          )
      )
      .addSubcommand(sub =>
        sub.setName("transfer")
          .setDescription("Transfer an item to another user")
          .addStringOption(opt =>
            opt.setName("name")
              .setDescription("Item name")
              .setRequired(true)
          )
          .addUserOption(opt =>
            opt.setName("user")
              .setDescription("User to transfer to")
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName("stats")
          .setDescription("View your item statistics")
      ),

    async execute(interaction) {
      const subcommand = interaction.options.getSubcommand();

      switch (subcommand) {
        case "list":
          await handleList(ctx, api, itemRepo, interaction);
          break;
        case "add":
          await handleAdd(ctx, api, itemRepo, interaction);
          break;
        case "view":
          await handleView(ctx, api, itemRepo, interaction);
          break;
        case "delete":
          await handleDelete(ctx, api, itemRepo, interaction);
          break;
        case "update":
          await handleUpdate(ctx, api, itemRepo, interaction);
          break;
        case "transfer":
          await handleTransfer(ctx, api, itemRepo, interaction);
          break;
        case "stats":
          await handleStats(ctx, api, itemRepo, interaction);
          break;
      }
    },
  };
}

// ============ Subcommand Handlers ============

/**
 * List all items with pagination
 */
async function handleList(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: ItemRepository,
  interaction: ChatInputCommandInteraction
) {
  const items = await itemRepo.getUserItems(interaction.user.id);

  if (items.length === 0) {
    const embed = api.embeds.info("You don't have any items yet!\nUse `/items add` to create one.", "No Items");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Use pagination helper for long lists
  await api.paginate(interaction, {
    items,
    formatPage: (pageItems, page, totalPages) => {
      const description = pageItems
        .map((item, i) => {
          const index = page * 10 + i + 1;
          const desc = item.description ? `\n  *${item.description}*` : '';
          return `**${index}.** ${item.name} (×${item.quantity})${desc}`;
        })
        .join("\n\n");

      return api.embeds.primary(description, "📦 Your Items")
        .setFooter({ text: `Page ${page + 1}/${totalPages} • ${items.length} total items` })
        .setTimestamp();
    },
    itemsPerPage: 10,
  });
}

/**
 * Add a new item
 */
async function handleAdd(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: ItemRepository,
  interaction: ChatInputCommandInteraction
) {
  const name = interaction.options.getString("name", true);
  const description = interaction.options.getString("description");
  const quantity = interaction.options.getInteger("quantity") ?? ctx.config.defaultQuantity;

  // Check item limit
  const itemCount = await itemRepo.countUserItems(interaction.user.id);
  if (itemCount >= ctx.config.maxItemsPerUser) {
    const embed = api.embeds.error(
      `You've reached the maximum of ${ctx.config.maxItemsPerUser} items!`,
      "Item Limit Reached"
    );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  // Check for duplicate
  if (await itemRepo.hasItem(interaction.user.id, name)) {
    const embed = api.embeds.error(
      `You already have an item named **${name}**!`,
      "Duplicate Item"
    );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    // Create the item
    const itemId = await itemRepo.createItem(interaction.user.id, name, description, quantity);

    const embed = api.embeds.success(
      `**${name}** has been added to your inventory! (×${quantity})\n${description ? `*${description}*` : ''}`,
      "✅ Item Added"
    );
    await interaction.reply({ embeds: [embed] });

    ctx.logger.info(`User ${interaction.user.tag} created item: ${name}`);
  } catch (error: any) {
    ctx.logger.error("Failed to create item:", error);

    const embed = api.embeds.error(
      "Failed to create item. Please try again.",
      "Error"
    );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

/**
 * View item details
 */
async function handleView(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: ItemRepository,
  interaction: ChatInputCommandInteraction
) {
  const name = interaction.options.getString("name", true);

  const items = await itemRepo.findItemsByName(interaction.user.id, name);

  if (items.length === 0) {
    const embed = api.embeds.error(`No item found with name **${name}**`, "Not Found");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const item = items[0];

  const embed = api.embeds.create()
    .setTitle(`📦 ${item.name}`)
    .setDescription(item.description || "*No description*")
    .addFields(
      { name: "Quantity", value: item.quantity.toString(), inline: true },
      { name: "Created", value: `<t:${Math.floor(item.created_at.getTime() / 1000)}:R>`, inline: true },
      { name: "Updated", value: `<t:${Math.floor(item.updated_at.getTime() / 1000)}:R>`, inline: true },
    )
    .setColor(0x5865f2)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

/**
 * Delete an item with confirmation
 */
async function handleDelete(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: ItemRepository,
  interaction: ChatInputCommandInteraction
) {
  const name = interaction.options.getString("name", true);

  const items = await itemRepo.findItemsByName(interaction.user.id, name);

  if (items.length === 0) {
    const embed = api.embeds.error(`No item found with name **${name}**`, "Not Found");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const item = items[0];

  // Confirm deletion using core-utils confirm helper
  const confirmed = await api.confirm(interaction, {
    message: `Are you sure you want to delete **${item.name}**? (×${item.quantity})`,
    title: "⚠️ Confirm Deletion",
  });

  if (!confirmed) {
    const embed = api.embeds.info("Deletion cancelled.", "Cancelled");
    await interaction.followUp({ embeds: [embed] });
    return;
  }

  await itemRepo.deleteItem(item._id!.toString());

  const embed = api.embeds.success(`**${item.name}** has been deleted.`, "🗑️ Item Deleted");
  await interaction.followUp({ embeds: [embed] });

  ctx.logger.info(`User ${interaction.user.tag} deleted item: ${item.name}`);
}

/**
 * Update item quantity
 */
async function handleUpdate(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: ItemRepository,
  interaction: ChatInputCommandInteraction
) {
  const name = interaction.options.getString("name", true);
  const quantity = interaction.options.getInteger("quantity", true);

  const items = await itemRepo.findItemsByName(interaction.user.id, name);

  if (items.length === 0) {
    const embed = api.embeds.error(`No item found with name **${name}**`, "Not Found");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const item = items[0];
  await itemRepo.updateQuantity(item._id!.toString(), quantity);

  const embed = api.embeds.success(
    `**${item.name}** quantity updated: ${item.quantity} → ${quantity}`,
    "📝 Quantity Updated"
  );
  await interaction.reply({ embeds: [embed] });
}

/**
 * Transfer item to another user
 */
async function handleTransfer(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: ItemRepository,
  interaction: ChatInputCommandInteraction
) {
  const name = interaction.options.getString("name", true);
  const targetUser = interaction.options.getUser("user", true);

  if (targetUser.id === interaction.user.id) {
    const embed = api.embeds.error("You can't transfer items to yourself!", "Invalid Transfer");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  if (targetUser.bot) {
    const embed = api.embeds.error("You can't transfer items to bots!", "Invalid Transfer");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const items = await itemRepo.findItemsByName(interaction.user.id, name);

  if (items.length === 0) {
    const embed = api.embeds.error(`No item found with name **${name}**`, "Not Found");
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const item = items[0];

  // Confirm transfer
  const confirmed = await api.confirm(interaction, {
    message: `Transfer **${item.name}** (×${item.quantity}) to ${targetUser}?`,
    title: "🔄 Confirm Transfer",
  });

  if (!confirmed) {
    const embed = api.embeds.info("Transfer cancelled.", "Cancelled");
    await interaction.followUp({ embeds: [embed] });
    return;
  }

  await itemRepo.transferItem(item._id!.toString(), targetUser.id);

  const embed = api.embeds.success(
    `**${item.name}** (×${item.quantity}) has been transferred to ${targetUser}!`,
    "✅ Transfer Complete"
  );
  await interaction.followUp({ embeds: [embed] });

  ctx.logger.info(`${interaction.user.tag} transferred ${item.name} to ${targetUser.tag}`);
}

/**
 * Show user statistics
 */
async function handleStats(
  ctx: PluginContext<TemplateConfig>,
  api: CoreUtilsAPI,
  itemRepo: ItemRepository,
  interaction: ChatInputCommandInteraction
) {
  const itemCount = await itemRepo.countUserItems(interaction.user.id);
  const totalQuantity = await itemRepo.getTotalQuantity(interaction.user.id);

  const embed = api.embeds.create()
    .setTitle("📊 Your Statistics")
    .addFields(
      { name: "Total Items", value: itemCount.toString(), inline: true },
      { name: "Total Quantity", value: totalQuantity.toString(), inline: true },
      { name: "Item Limit", value: `${itemCount}/${ctx.config.maxItemsPerUser}`, inline: true },
    )
    .setColor(0x5865f2)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
