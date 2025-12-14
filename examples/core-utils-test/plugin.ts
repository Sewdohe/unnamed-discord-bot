import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Plugin, PluginContext, Command } from "@types";
import type { CoreUtilsAPI } from "../../plugins/core-utils/plugin";

/**
 * Test plugin to demonstrate core-utils functionality
 * This shows how other plugins should use the core-utils API
 */
const plugin: Plugin = {
  manifest: {
    name: "core-utils-test",
    version: "1.0.0",
    description: "Test commands for core-utils plugin",
    commandGroup: {
      name: "test",
      description: "Core utilities test commands",
    },
    dependencies: {
      hard: ["core-utils"],
    },
  },

  async onLoad(ctx: PluginContext) {
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");

    if (!coreUtils?.api) {
      ctx.logger.error("core-utils is required but missing - aborting example plugin load");
      throw new Error("core-utils plugin required");
    }

    const api = coreUtils.api;

    // Test embeds
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("test-embeds")
        .setDescription("Test embed helpers")
        .addStringOption(opt =>
          opt.setName("type")
            .setDescription("Embed type")
            .setRequired(true)
            .addChoices(
              { name: "Primary", value: "primary" },
              { name: "Success", value: "success" },
              { name: "Warning", value: "warning" },
              { name: "Error", value: "error" },
              { name: "Info", value: "info" },
            )
        ),

      async execute(interaction) {
        const type = interaction.options.getString("type", true);

        let embed;
        switch (type) {
          case "primary":
            embed = api.embeds.primary("This is a primary embed", "Primary Title");
            break;
          case "success":
            embed = api.embeds.success("Operation completed successfully!", "Success");
            break;
          case "warning":
            embed = api.embeds.warning("Be careful with this action!", "Warning");
            break;
          case "error":
            embed = api.embeds.error("Something went wrong!", "Error");
            break;
          case "info":
            embed = api.embeds.info("Here's some helpful information", "Info");
            break;
          default:
            embed = api.embeds.create().setDescription("Default embed");
        }

        await interaction.reply({ embeds: [embed] });
      },
    });

    // Test pagination
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("test-pagination")
        .setDescription("Test pagination with a list of items")
        .addIntegerOption(opt =>
          opt.setName("count")
            .setDescription("Number of items to display")
            .setMinValue(1)
            .setMaxValue(100)
        ),

      async execute(interaction) {
        const count = interaction.options.getInteger("count") ?? 25;
        const items = Array.from({ length: count }, (_, i) => `Item ${i + 1}`);

        await api.paginate(interaction, {
          items,
          formatPage: (pageItems, page, totalPages) => {
            return api.embeds
              .info(pageItems.join("\n"), `Test Items (Page ${page + 1}/${totalPages})`)
              .setFooter({ text: `Showing ${pageItems.length} of ${items.length} items` });
          },
          itemsPerPage: 5,
        });
      },
    });

    // Test confirmation
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("test-confirm")
        .setDescription("Test confirmation dialog"),

      async execute(interaction) {
        const confirmed = await api.confirm(interaction, {
          message: "Do you want to proceed with this test action?",
          title: "Confirmation Required",
          confirmLabel: "Yes, proceed",
          cancelLabel: "No, cancel",
        });

        const response = confirmed
          ? api.embeds.success("You confirmed the action!")
          : api.embeds.error("You cancelled the action");

        await interaction.followUp({ embeds: [response] });
      },
    });

    // Test permissions
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("test-permissions")
        .setDescription("Test permission helpers"),

      async execute(interaction) {
        const member = interaction.member;

        if (!(member && typeof member !== "string")) {
          await interaction.reply({
            content: "This command can only be used in a server!",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const checks = [
          `Has BanMembers: ${api.permissions.hasPermission(member, "BanMembers")}`,
          `Has ManageMessages: ${api.permissions.hasPermission(member, "ManageMessages")}`,
          `Is Server Owner: ${api.permissions.isServerOwner(member)}`,
          `Has any mod perms: ${api.permissions.hasAnyPermission(member, ["BanMembers", "KickMembers", "ManageMessages"])}`,
        ];

        const embed = api.embeds.info(checks.join("\n"), "Your Permissions");

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      },
    });

    // Test channel-specific permissions
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("test-channel-perms")
        .setDescription("Test channel-specific permission helpers")
        .addChannelOption(opt =>
          opt.setName("channel")
            .setDescription("Channel to check permissions in")
            .setRequired(false)
        ),

      async execute(interaction) {
        const member = interaction.member;

        if (!(member && typeof member !== "string")) {
          await interaction.reply({
            content: "This command can only be used in a server!",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const targetChannel = interaction.options.getChannel("channel") ?? interaction.channel;

        if (!targetChannel) {
          await interaction.reply({
            content: "Could not determine channel!",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const checks = [
          `**Channel**: ${targetChannel}`,
          ``,
          `**Server-wide permissions:**`,
          `SendMessages: ${api.permissions.hasPermission(member, "SendMessages")}`,
          `ManageMessages: ${api.permissions.hasPermission(member, "ManageMessages")}`,
          ``,
          `**Channel-specific permissions:**`,
          `SendMessages: ${api.permissions.hasPermissionIn(member, targetChannel, "SendMessages")}`,
          `ManageMessages: ${api.permissions.hasPermissionIn(member, targetChannel, "ManageMessages")}`,
          `ViewChannel: ${api.permissions.hasPermissionIn(member, targetChannel, "ViewChannel")}`,
          ``,
          `Has any [Send, Embed, Attach]: ${api.permissions.hasAnyPermissionIn(member, targetChannel, ["SendMessages", "EmbedLinks", "AttachFiles"])}`,
        ];

        const embed = api.embeds.info(checks.join("\n"), "Channel Permissions");

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      },
    });

    // Test action row / button helpers
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("test-action-row")
        .setDescription("Test action row / button helpers"),

      async execute(interaction) {
        const row = api.components.actionRow([
          { customId: "test_confirm", label: "Confirm", style: 3 }, // ButtonStyle.Success
          { customId: "test_cancel", label: "Cancel", style: 4 }, // ButtonStyle.Danger
        ]);

        await interaction.reply({ content: "Action row test", components: [row], flags: MessageFlags.Ephemeral });
      },
    });

    // Test select menu helpers
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("test-select-menu")
        .setDescription("Test select menu helpers"),

      async execute(interaction) {
        const menu = api.components.selectMenu({
          customId: "test_select",
          placeholder: "Choose an item",
          options: [
            { label: "A", value: "a", description: "Select A" },
            { label: "B", value: "b", description: "Select B" },
            { label: "C", value: "c", description: "Select C" },
          ],
        });

        await interaction.reply({ content: "Pick an option", components: [api.components.actionRow([menu])] });
      },
    });

    // Test modal helpers
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("test-modal")
        .setDescription("Test modal helpers"),

      async execute(interaction) {
        const modal = api.components.modal({
          customId: "test_modal",
          title: "Test Modal",
          components: [
            { customId: "name", label: "Your Name", placeholder: "Enter your name" },
            { customId: "bio", label: "Short Bio", style: "paragraph", placeholder: "A few words about you" },
          ],
        });

        // Show modal to user
        await interaction.showModal(modal);
      },
    });

    ctx.logger.info("core-utils test commands registered!");
    // Register an event to handle modal submit
    ctx.registerEvent({
      name: "interactionCreate",
      async execute(ctx, interaction) {
        if (!interaction.isModalSubmit()) return;
        if (interaction.customId !== "test_modal") return;

        const name = interaction.fields.getTextInputValue("name");
        const bio = interaction.fields.getTextInputValue("bio");

        await interaction.reply({ content: `Thanks ${name}! Bio: ${bio}`, flags: MessageFlags.Ephemeral });
      },
    });
  },
};

export default plugin;
