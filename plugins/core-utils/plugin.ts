import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  PermissionsBitField,
  GuildMember,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ComponentType,
  MessageFlags,
  GuildBasedChannel,
} from "discord.js";
import { z } from "zod";
import type { Plugin, PluginContext } from "@types";

// ============ Configuration ============

const configSchema = z.object({
  embeds: z.object({
    colors: z.object({
      primary: z.number().default(0x5865f2),
      success: z.number().default(0x57f287),
      warning: z.number().default(0xfee75c),
      error: z.number().default(0xed4245),
      info: z.number().default(0x3ba55d),
    }).default({}),
    footer: z.object({
      text: z.string().optional(),
      iconURL: z.string().optional(),
    }).default({}),
    timestamp: z.boolean().default(true),
  }).default({}),
  pagination: z.object({
    timeout: z.number().min(10000).max(600000).default(120000), // 2 minutes default
    itemsPerPage: z.number().min(1).max(25).default(10),
  }).default({}),
  confirmation: z.object({
    timeout: z.number().min(5000).max(300000).default(30000), // 30 seconds default
  }).default({}),
});

type CoreUtilsConfig = z.infer<typeof configSchema>;

// ============ Types ============

export interface CoreUtilsAPI {
  permissions: PermissionHelpers;
  embeds: EmbedHelpers;
  paginate: PaginateFunction;
  confirm: ConfirmFunction;
}

interface PermissionHelpers {
  // Server-wide permissions
  hasPermission(member: GuildMember | null, permission: keyof typeof PermissionFlagsBits): boolean;
  hasAnyPermission(member: GuildMember | null, permissions: (keyof typeof PermissionFlagsBits)[]): boolean;
  hasAllPermissions(member: GuildMember | null, permissions: (keyof typeof PermissionFlagsBits)[]): boolean;
  hasRole(member: GuildMember | null, roleId: string): boolean;
  isServerOwner(member: GuildMember | null): boolean;

  // Channel-specific permissions (includes permission overwrites)
  hasPermissionIn(member: GuildMember | null, channel: GuildBasedChannel | null, permission: keyof typeof PermissionFlagsBits): boolean;
  hasAnyPermissionIn(member: GuildMember | null, channel: GuildBasedChannel | null, permissions: (keyof typeof PermissionFlagsBits)[]): boolean;
  hasAllPermissionsIn(member: GuildMember | null, channel: GuildBasedChannel | null, permissions: (keyof typeof PermissionFlagsBits)[]): boolean;
}

interface EmbedHelpers {
  create(): EmbedBuilder;
  primary(description: string, title?: string): EmbedBuilder;
  success(description: string, title?: string): EmbedBuilder;
  warning(description: string, title?: string): EmbedBuilder;
  error(description: string, title?: string): EmbedBuilder;
  info(description: string, title?: string): EmbedBuilder;
}

interface PaginateOptions<T> {
  items: T[];
  formatPage: (pageItems: T[], page: number, totalPages: number) => EmbedBuilder;
  itemsPerPage?: number;
  timeout?: number;
  startPage?: number;
}

type PaginateFunction = <T>(
  interaction: ChatInputCommandInteraction,
  options: PaginateOptions<T>
) => Promise<void>;

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  timeout?: number;
}

type ConfirmFunction = (
  interaction: ChatInputCommandInteraction,
  options: string | ConfirmOptions
) => Promise<boolean>;

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "core-utils",
    version: "1.0.0",
    description: "Core utilities for other plugins: permissions, embeds, pagination, confirmations",
    author: "System",
  },

  config: {
    schema: configSchema,
    defaults: {
      embeds: {
        colors: {
          primary: 0x5865f2,
          success: 0x57f287,
          warning: 0xfee75c,
          error: 0xed4245,
          info: 0x3ba55d,
        },
        footer: {},
        timestamp: true,
      },
      pagination: {
        timeout: 120000,
        itemsPerPage: 10,
      },
      confirmation: {
        timeout: 30000,
      },
    },
  },

  api: null as unknown as CoreUtilsAPI,

  async onLoad(ctx: PluginContext<CoreUtilsConfig>) {
    // Build API
    const api: CoreUtilsAPI = {
      permissions: createPermissionHelpers(),
      embeds: createEmbedHelpers(ctx),
      paginate: createPaginateFunction(ctx),
      confirm: createConfirmFunction(ctx),
    };

    // Expose API
    (this as any).api = api;

    ctx.logger.info("Core utilities loaded!");
  },
};

// ============ Permission Helpers ============

function createPermissionHelpers(): PermissionHelpers {
  return {
    hasPermission(member, permission) {
      if (!member) return false;
      const flag = PermissionFlagsBits[permission];
      return member.permissions.has(flag);
    },

    hasAnyPermission(member, permissions) {
      if (!member) return false;
      const flags = permissions.map(p => PermissionFlagsBits[p]);
      return member.permissions.any(flags);
    },

    hasAllPermissions(member, permissions) {
      if (!member) return false;
      const flags = permissions.map(p => PermissionFlagsBits[p]);
      return member.permissions.has(flags);
    },

    hasRole(member, roleId) {
      if (!member) return false;
      return member.roles.cache.has(roleId);
    },

    isServerOwner(member) {
      if (!member) return false;
      return member.guild.ownerId === member.id;
    },

    hasPermissionIn(member, channel, permission) {
      if (!member || !channel) return false;
      const flag = PermissionFlagsBits[permission];
      return member.permissionsIn(channel).has(flag);
    },

    hasAnyPermissionIn(member, channel, permissions) {
      if (!member || !channel) return false;
      const flags = permissions.map(p => PermissionFlagsBits[p]);
      return member.permissionsIn(channel).any(flags);
    },

    hasAllPermissionsIn(member, channel, permissions) {
      if (!member || !channel) return false;
      const flags = permissions.map(p => PermissionFlagsBits[p]);
      return member.permissionsIn(channel).has(flags);
    },
  };
}

// ============ Embed Helpers ============

function createEmbedHelpers(ctx: PluginContext<CoreUtilsConfig>): EmbedHelpers {
  const applyDefaults = (embed: EmbedBuilder) => {
    if (ctx.config.embeds.footer.text || ctx.config.embeds.footer.iconURL) {
      embed.setFooter({
        text: ctx.config.embeds.footer.text ?? "",
        iconURL: ctx.config.embeds.footer.iconURL,
      });
    }
    if (ctx.config.embeds.timestamp) {
      embed.setTimestamp();
    }
    return embed;
  };

  return {
    create() {
      return applyDefaults(new EmbedBuilder());
    },

    primary(description, title) {
      const embed = new EmbedBuilder()
        .setColor(ctx.config.embeds.colors.primary)
        .setDescription(description);
      if (title) embed.setTitle(title);
      return applyDefaults(embed);
    },

    success(description, title) {
      const embed = new EmbedBuilder()
        .setColor(ctx.config.embeds.colors.success)
        .setDescription(description);
      if (title) embed.setTitle(title);
      return applyDefaults(embed);
    },

    warning(description, title) {
      const embed = new EmbedBuilder()
        .setColor(ctx.config.embeds.colors.warning)
        .setDescription(description);
      if (title) embed.setTitle(title);
      return applyDefaults(embed);
    },

    error(description, title) {
      const embed = new EmbedBuilder()
        .setColor(ctx.config.embeds.colors.error)
        .setDescription(description);
      if (title) embed.setTitle(title);
      return applyDefaults(embed);
    },

    info(description, title) {
      const embed = new EmbedBuilder()
        .setColor(ctx.config.embeds.colors.info)
        .setDescription(description);
      if (title) embed.setTitle(title);
      return applyDefaults(embed);
    },
  };
}

// ============ Pagination ============

function createPaginateFunction(ctx: PluginContext<CoreUtilsConfig>): PaginateFunction {
  return async (interaction, options) => {
    const itemsPerPage = options.itemsPerPage ?? ctx.config.pagination.itemsPerPage;
    const timeout = options.timeout ?? ctx.config.pagination.timeout;
    const totalPages = Math.ceil(options.items.length / itemsPerPage);

    if (totalPages === 0) {
      await interaction.reply({
        content: "No items to display.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let currentPage = options.startPage ?? 0;

    const getPage = (page: number) => {
      const start = page * itemsPerPage;
      const end = start + itemsPerPage;
      const pageItems = options.items.slice(start, end);
      return options.formatPage(pageItems, page, totalPages);
    };

    const getButtons = (page: number) => {
      return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("first")
          .setLabel("⏮")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("prev")
          .setLabel("◀")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("page")
          .setLabel(`${page + 1} / ${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("next")
          .setLabel("▶")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages - 1),
        new ButtonBuilder()
          .setCustomId("last")
          .setLabel("⏭")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1),
      );
    };

    // Single page - no buttons needed
    if (totalPages === 1) {
      await interaction.reply({
        embeds: [getPage(0)],
      });
      return;
    }

    const { resource } = await interaction.reply({
      embeds: [getPage(currentPage)],
      components: [getButtons(currentPage)],
      withResponse: true,
    });
    const message = resource!.message!;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: timeout,
    });

    collector.on("collect", async (buttonInteraction: ButtonInteraction) => {
      // Only allow original user to interact
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: "These buttons aren't for you!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update page based on button
      switch (buttonInteraction.customId) {
        case "first":
          currentPage = 0;
          break;
        case "prev":
          currentPage = Math.max(0, currentPage - 1);
          break;
        case "next":
          currentPage = Math.min(totalPages - 1, currentPage + 1);
          break;
        case "last":
          currentPage = totalPages - 1;
          break;
      }

      await buttonInteraction.update({
        embeds: [getPage(currentPage)],
        components: [getButtons(currentPage)],
      });
    });

    collector.on("end", async () => {
      // Disable all buttons when collector ends
      try {
        await message.edit({
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              ...getButtons(currentPage).components.map(button =>
                ButtonBuilder.from(button).setDisabled(true)
              )
            ),
          ],
        });
      } catch (error) {
        // Message might be deleted, ignore
      }
    });
  };
}

// ============ Confirmation Dialog ============

function createConfirmFunction(ctx: PluginContext<CoreUtilsConfig>): ConfirmFunction {
  return async (interaction, options) => {
    const opts = typeof options === "string" ? { message: options } : options;
    const timeout = opts.timeout ?? ctx.config.confirmation.timeout;

    const embed = new EmbedBuilder()
      .setColor(ctx.config.embeds.colors.warning)
      .setDescription(opts.message);

    if (opts.title) {
      embed.setTitle(opts.title);
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm")
        .setLabel(opts.confirmLabel ?? "Confirm")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("cancel")
        .setLabel(opts.cancelLabel ?? "Cancel")
        .setStyle(ButtonStyle.Danger),
    );

    const { resource } = await interaction.reply({
      embeds: [embed],
      components: [row],
      withResponse: true,
    });
    const message = resource!.message!;

    try {
      const buttonInteraction = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: timeout,
        filter: (i) => i.user.id === interaction.user.id,
      });

      const confirmed = buttonInteraction.customId === "confirm";

      await buttonInteraction.update({
        embeds: [embed],
        components: [],
      });

      return confirmed;
    } catch (error) {
      // Timeout or error
      try {
        await message.edit({
          components: [],
        });
      } catch {
        // Message might be deleted
      }
      return false;
    }
  };
}

// ============ Export ============

export default plugin;
