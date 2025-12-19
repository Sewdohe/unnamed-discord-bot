import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
  GuildMember,
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageComponentInteraction,
  ComponentType,
  MessageFlags,
  GuildBasedChannel,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AnySelectMenuInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { z } from "zod";
import type { Plugin, PluginContext, QueryBuilder, SchemaValidator } from "@types";
import type { Collection, Document } from "mongodb";
import { MongoQueryBuilder } from "../../src/core/query-builder";
import { BaseRepository } from "../../src/core/repository";
import { createSchemaValidator, commonSchemas } from "../../src/core/schema";
import { getDatabase, prefixCollection } from "../../src/core/database";
import { createScheduler, type SchedulerAPI } from "./scheduler";
import { createDefaultStatsTracker, type DefaultStats, DefaultStatsTracker } from "./default-stats";

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
  components: ComponentsHelpers;
  confirm: ConfirmFunction;
  database: DatabaseHelpers;
  scheduler: SchedulerAPI;
  utils: UtilsHelpers;
  getDefaultStats?: () => DefaultStats;
}

interface DatabaseHelpers {
  /**
   * Get a MongoDB collection (automatically prefixed with plugin name)
   * @param ctx Plugin context
   * @param collectionName Collection name (will be prefixed with plugin name)
   */
  getCollection<T extends Document = any>(ctx: PluginContext, collectionName: string): Collection<T>;

  /**
   * Create a query builder for a collection (automatically prefixed)
   * @param ctx Plugin context
   * @param collectionName Collection name (will be prefixed with plugin name)
   */
  createQueryBuilder<T extends Document = any>(ctx: PluginContext, collectionName: string): QueryBuilder<T>;

  /**
   * Create a repository instance for a collection
   * @param ctx Plugin context
   * @param collectionName Collection name (will be prefixed)
   * @param RepositoryClass Repository class constructor
   * @param validator Optional Zod schema validator
   */
  createRepository<T extends Document, TCreate = Partial<T>, TUpdate = Partial<T>>(
    ctx: PluginContext,
    collectionName: string,
    RepositoryClass: new (collection: Collection<T>, validator?: SchemaValidator<T>) => BaseRepository<T, TCreate, TUpdate>,
    validator?: SchemaValidator<T>
  ): BaseRepository<T, TCreate, TUpdate>;

  /**
   * Create a schema validator from a Zod schema
   */
  createValidator<T extends z.ZodTypeAny>(schema: T): SchemaValidator<z.infer<T>>;

  /**
   * Common Zod schemas for Discord/database fields
   */
  schemas: typeof commonSchemas;
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

interface UtilsHelpers {
  /**
   * Change a user's nickname in a guild
   * @param member The guild member to update
   * @param nickname The new nickname (or null to remove nickname)
   * @param reason Optional reason for audit log
   * @returns Promise that resolves when nickname is changed
   */
  setNickname(member: GuildMember, nickname: string | null, reason?: string): Promise<GuildMember>;
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

// ============ Component Helpers Types ============

type ButtonDescriptor = {
  customId?: string;
  label?: string;
  style?: ButtonStyle;
  disabled?: boolean;
  emoji?: string | { id?: string; name?: string; animated?: boolean } | undefined;
  url?: string; // link button support: if present, ButtonStyle.Link will be used
};

type StringSelectOptionDescriptor = {
  label: string;
  value: string;
  description?: string;
  emoji?: string | { id?: string; name?: string; animated?: boolean } | undefined;
  default?: boolean;
};

type StringSelectMenuDescriptor = {
  customId?: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  options: StringSelectOptionDescriptor[];
  disabled?: boolean;
};

type GenericSelectMenuDescriptor = {
  customId?: string;
  placeholder?: string;
  minValues?: number;
  maxValues?: number;
  disabled?: boolean;
};

interface ComponentsHelpers {
  actionRow(buttons: Array<ButtonBuilder | ButtonDescriptor | StringSelectMenuBuilder | StringSelectMenuDescriptor>): ActionRowBuilder<any>;
  button(descriptor: ButtonDescriptor): ButtonBuilder;
  selectMenu(descriptor: StringSelectMenuDescriptor): StringSelectMenuBuilder;
  userSelect(descriptor: GenericSelectMenuDescriptor): UserSelectMenuBuilder;
  roleSelect(descriptor: GenericSelectMenuDescriptor): RoleSelectMenuBuilder;
  mentionableSelect(descriptor: GenericSelectMenuDescriptor): MentionableSelectMenuBuilder;
  // Modal helpers:
  textInput(descriptor: TextInputDescriptor): TextInputBuilder;
  modal(descriptor: ModalDescriptor): ModalBuilder;
  /**
   * Return a new array of ActionRowBuilders with all interactive components disabled.
   * Accepts a single ActionRowBuilder or an array and always returns an array.
   */
  disableAll(rows: ActionRowBuilder<any> | ActionRowBuilder<any>[]): ActionRowBuilder<any>[];
  // Define UI groups
  defineButtonGroup(pluginCtx: PluginContext, descriptor: ButtonUIGroupDescriptor): UIRegistration;
  defineSelectMenuGroup(pluginCtx: PluginContext, descriptor: SelectMenuUIGroupDescriptor): UIRegistration;
  defineModal(pluginCtx: PluginContext, descriptor: ModalGroupDescriptor): ModalBuilder;
  // Build the ActionRowBuilders for a defined group
  build(pluginCtx: PluginContext, groupId: string): ActionRowBuilder<any>[];
  // Send a message using a defined group and attach a per-message collector that dispatches to the group's handler
  sendWithHandlers(pluginCtx: PluginContext, interaction: ChatInputCommandInteraction, options: SendWithHandlersOptions): Promise<void>;
  // Unregister a group for a plugin (cleanup)
  unregister(pluginCtx: PluginContext, groupId: string): boolean;
}

// DSL types
type UIScope = "message" | "global";

interface UIGroupDescriptorBase {
  id: string;
  scope?: UIScope;
  timeout?: number;
  autoDisable?: boolean;
}

interface ButtonUIGroupDescriptor extends UIGroupDescriptorBase {
  components: ButtonDescriptor[];
  handler: (ctx: PluginContext, interaction: ButtonInteraction, meta: { pluginName: string; groupId: string; componentId: string }) => Promise<void>;
  filter?: (interaction: ButtonInteraction) => boolean;
}

interface SelectMenuUIGroupDescriptor extends UIGroupDescriptorBase {
  components: (StringSelectMenuDescriptor | GenericSelectMenuDescriptor)[];
  handler: (ctx: PluginContext, interaction: AnySelectMenuInteraction, meta: { pluginName: string; groupId: string; componentId: string }) => Promise<void>;
  filter?: (interaction: AnySelectMenuInteraction) => boolean;
}

export interface ModalGroupDescriptor extends UIGroupDescriptorBase {
  title: string;
  components: TextInputDescriptor[];
  handler: (ctx: PluginContext, interaction: ModalSubmitInteraction, meta: { pluginName: string; groupId: string; }) => Promise<void>;
  filter?: (interaction: ModalSubmitInteraction) => boolean;
}

type UIGroupDescriptor = (ButtonUIGroupDescriptor | SelectMenuUIGroupDescriptor | ModalGroupDescriptor) & { type?: 'button' | 'select' | 'modal' };


interface UIRegistration {
  pluginName: string;
  groupId: string;
  descriptor: UIGroupDescriptor;
  build: () => ActionRowBuilder<any>[];
}

interface SendWithHandlersOptions {
  groupId: string;
  content?: string;
  embeds?: EmbedBuilder[];
  flags?: number;
  ephemeral?: boolean;
  filter?: (interaction: any) => boolean;
  timeout?: number;
  autoDisable?: boolean;
}

type TextInputDescriptor = {
  customId: string;
  label: string;
  style?: TextInputStyle | string | number;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
};

type ModalDescriptor = {
  customId: string;
  title: string;
  components: TextInputDescriptor[];
};

// ============ Plugin Definition ============
// UI registry: maps pluginName -> groupId -> registration
const uiRegistry: Map<string, Map<string, UIGroupDescriptor>> = new Map();

function namespacedId(pluginName: string, groupId: string, componentId: string) {
  // basic namespacing: plugin:group:component
  const id = `${pluginName}:${groupId}:${componentId}`;
  // Discord customId length limit ~ 100; if too long, hash it down
  if (id.length <= 100) return id;
  // simple deterministic hash: base36 of char codes
  const hash = Array.from(id).reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0) >>> 0;
  return `${pluginName}:${groupId}:${hash.toString(36)}`;
}

function parseNamespacedId(customId: string) {
  // Expect plugin:group:component or fallback to split by ':'
  const parts = customId.split(":");
  if (parts.length >= 3) {
    const [pluginName, groupId, ...rest] = parts;
    const componentId = rest.join(":");
    return { pluginName, groupId, componentId };
  }
  return null;
}

const plugin: Plugin<typeof configSchema> & { api?: CoreUtilsAPI } = {
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
    // Create scheduler
    const scheduler = createScheduler(ctx);

    // Create default stats tracker
    const defaultStatsTracker = createDefaultStatsTracker(ctx, ctx.client);

    // Build API
    const api: CoreUtilsAPI = {
      permissions: createPermissionHelpers(),
      embeds: createEmbedHelpers(ctx),
      paginate: createPaginateFunction(ctx),
      components: createComponentsHelpers(),
      confirm: createConfirmFunction(ctx),
      database: createDatabaseHelpers(),
      scheduler,
      utils: createUtilsHelpers(),
      getDefaultStats: () => defaultStatsTracker.getStats(),
    };

    // Expose API
    (this as any).api = api;

    // Register event handlers for default stats tracking
    ctx.registerEvent({
      name: "messageCreate",
      async execute(pluginCtx, message) {
        defaultStatsTracker.trackMessage(message);
      },
    });

    ctx.registerEvent({
      name: "interactionCreate",
      async execute(pluginCtx, interaction) {
        if (interaction.isChatInputCommand()) {
          defaultStatsTracker.trackCommand(interaction.user.id);
        }
      },
    });

    // Global dispatcher: listen for component interactions and route to registered global UI groups
    ctx.registerEvent({
      name: "interactionCreate",
      async execute(pluginCtx, interaction) {
        if (!interaction.isMessageComponent() && !interaction.isModalSubmit()) return;

        const customId = interaction.customId;
        if (!customId) return;

        const parsed = parseNamespacedId(customId);
        if (!parsed) return;

        const groups = uiRegistry.get(parsed.pluginName);
        if (!groups) return;

        const descriptor = groups.get(parsed.groupId);
        if (!descriptor) return;

        try {
          if (interaction.isButton() && descriptor.type === 'button') {
            if ((descriptor as ButtonUIGroupDescriptor).scope !== 'global') return;
            const buttonDescriptor = descriptor as ButtonUIGroupDescriptor;
            if (buttonDescriptor.filter && !buttonDescriptor.filter(interaction)) return;
            await buttonDescriptor.handler(pluginCtx as any, interaction, { pluginName: parsed.pluginName, groupId: parsed.groupId, componentId: parsed.componentId });
          } else if (interaction.isAnySelectMenu() && descriptor.type === 'select') {
            if ((descriptor as SelectMenuUIGroupDescriptor).scope !== 'global') return;
            const selectDescriptor = descriptor as SelectMenuUIGroupDescriptor;
            if (selectDescriptor.filter && !selectDescriptor.filter(interaction)) return;
            await selectDescriptor.handler(pluginCtx as any, interaction, { pluginName: parsed.pluginName, groupId: parsed.groupId, componentId: parsed.componentId });
          } else if (interaction.isModalSubmit() && descriptor.type === 'modal') {
            const modalDescriptor = descriptor as ModalGroupDescriptor;
            // Modals are inherently global and don't have a 'scope' in their descriptor
            await modalDescriptor.handler(pluginCtx as any, interaction, { pluginName: parsed.pluginName, groupId: parsed.groupId });
          }
        } catch (e) {
          try { pluginCtx.logger.error("Error dispatching UI handler:", e); } catch {}
        }
      },
    });

    ctx.logger.info("Core utilities loaded!");
  },

  async onUnload() {
    // Cleanup scheduler
    if (this.api?.scheduler) {
      this.api.scheduler.cleanup();
    }
  },
};

// ============ Database Helpers ============

function createDatabaseHelpers(): DatabaseHelpers {
  return {
    getCollection<T extends Document = any>(ctx: PluginContext, collectionName: string): Collection<T> {
      const db = getDatabase();
      const fullName = prefixCollection(ctx.dbPrefix.replace(/_$/, ''), collectionName);
      return db.collection<T>(fullName);
    },

    createQueryBuilder<T extends Document = any>(ctx: PluginContext, collectionName: string): QueryBuilder<T> {
      const collection = this.getCollection<T>(ctx, collectionName);
      return new MongoQueryBuilder<T>(collection);
    },

    createRepository<T extends Document, TCreate = Partial<T>, TUpdate = Partial<T>>(
      ctx: PluginContext,
      collectionName: string,
      RepositoryClass: new (collection: Collection<T>, validator?: SchemaValidator<T>) => BaseRepository<T, TCreate, TUpdate>,
      validator?: SchemaValidator<T>
    ): BaseRepository<T, TCreate, TUpdate> {
      const collection = this.getCollection<T>(ctx, collectionName);
      return new RepositoryClass(collection, validator);
    },

    createValidator<T extends z.ZodTypeAny>(schema: T): SchemaValidator<z.infer<T>> {
      return createSchemaValidator(schema);
    },

    schemas: commonSchemas,
  };
}

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

// ============ Utils ============

function createUtilsHelpers(): UtilsHelpers {
  return {
    async setNickname(member: GuildMember, nickname: string | null, reason?: string): Promise<GuildMember> {
      return await member.setNickname(nickname, reason);
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

// ============ Component Helpers Implementation ============

/**
 * Create helpers for building discord.js components (buttons & action rows).
 * Developers can pass ButtonBuilder instances or simple descriptors.
 */
function createComponentsHelpers(): ComponentsHelpers {
  return {
    button(descriptor) {
      const b = new ButtonBuilder();
      if (descriptor.customId) b.setCustomId(descriptor.customId);
      if (descriptor.label) b.setLabel(descriptor.label);
      if (descriptor.style !== undefined) b.setStyle(normalizeButtonStyle(descriptor.style));
      if (typeof descriptor.disabled === "boolean") b.setDisabled(descriptor.disabled);
      if (descriptor.emoji) b.setEmoji(descriptor.emoji as any);
      if (descriptor.url) {
        b.setStyle(ButtonStyle.Link);
        // ButtonBuilder#setURL is not defined on ButtonBuilder in types? use setURL method if available.
        // TypeScript types in discord.js v14 uses setURL on ButtonBuilder only for Link style.
        try {
          // @ts-ignore - setURL exists at runtime for link buttons
          b.setURL(descriptor.url);
        } catch (e) {
          // ignore if not supported in runtime environment or types
        }
      }
      return b;
    },

    selectMenu(descriptor) {
      const menu = new StringSelectMenuBuilder();
      if (descriptor.customId) menu.setCustomId(descriptor.customId);
      if (descriptor.placeholder) menu.setPlaceholder(descriptor.placeholder);
      if (descriptor.minValues !== undefined) menu.setMinValues(descriptor.minValues);
      if (descriptor.maxValues !== undefined) menu.setMaxValues(descriptor.maxValues);
      if (descriptor.disabled !== undefined) menu.setDisabled(descriptor.disabled);
      menu.addOptions(
        ...descriptor.options.map(opt => {
          const o = new StringSelectMenuOptionBuilder()
            .setLabel(opt.label)
            .setValue(opt.value)
            .setDefault(Boolean(opt.default));
          if (opt.description) o.setDescription(opt.description);
          if (opt.emoji) o.setEmoji(opt.emoji as any);
          return o;
        })
      );
      return menu;
    },

    userSelect(descriptor) {
      const menu = new UserSelectMenuBuilder();
      if (descriptor.customId) menu.setCustomId(descriptor.customId);
      if (descriptor.placeholder) menu.setPlaceholder(descriptor.placeholder);
      if (descriptor.minValues !== undefined) menu.setMinValues(descriptor.minValues);
      if (descriptor.maxValues !== undefined) menu.setMaxValues(descriptor.maxValues);
      if (descriptor.disabled !== undefined) menu.setDisabled(descriptor.disabled);
      return menu;
    },

    roleSelect(descriptor) {
      const menu = new RoleSelectMenuBuilder();
      if (descriptor.customId) menu.setCustomId(descriptor.customId);
      if (descriptor.placeholder) menu.setPlaceholder(descriptor.placeholder);
      if (descriptor.minValues !== undefined) menu.setMinValues(descriptor.minValues);
      if (descriptor.maxValues !== undefined) menu.setMaxValues(descriptor.maxValues);
      if (descriptor.disabled !== undefined) menu.setDisabled(descriptor.disabled);
      return menu;
    },

    mentionableSelect(descriptor) {
      const menu = new MentionableSelectMenuBuilder();
      if (descriptor.customId) menu.setCustomId(descriptor.customId);
      if (descriptor.placeholder) menu.setPlaceholder(descriptor.placeholder);
      if (descriptor.minValues !== undefined) menu.setMinValues(descriptor.minValues);
      if (descriptor.maxValues !== undefined) menu.setMaxValues(descriptor.maxValues);
      if (descriptor.disabled !== undefined) menu.setDisabled(descriptor.disabled);
      return menu;
    },

    textInput(descriptor) {
      const input = new TextInputBuilder();
      input.setCustomId(descriptor.customId);
      input.setLabel(descriptor.label);
      if (descriptor.placeholder) input.setPlaceholder(descriptor.placeholder);
      if (descriptor.minLength !== undefined) input.setMinLength(descriptor.minLength);
      if (descriptor.maxLength !== undefined) input.setMaxLength(descriptor.maxLength);
      if (descriptor.required !== undefined) input.setRequired(descriptor.required);
      if (descriptor.value) input.setValue(descriptor.value);
      // Text inputs can't be disabled; ignore this property if provided
      // Normalize style
      if (descriptor.style !== undefined) {
        const style = normalizeTextInputStyle(descriptor.style);
        input.setStyle(style);
      }
      return input;
    },

    modal(descriptor) {
      const m = new ModalBuilder().setCustomId(descriptor.customId).setTitle(descriptor.title);
      const rows = descriptor.components.map(c => new ActionRowBuilder<TextInputBuilder>().addComponents(this.textInput(c)));
      m.addComponents(...rows);
      return m;
    },

    actionRow(buttons) {
      const row = new ActionRowBuilder<any>();
      buttons.forEach(btn => {
        // ButtonBuilder or StringSelectMenuBuilder
        if (btn instanceof ButtonBuilder || btn instanceof StringSelectMenuBuilder) {
          row.addComponents(btn);
          return;
        }
        // If it's a descriptor, detect whether it's a ButtonDescriptor or SelectDescriptor
        if ((btn as any).options) {
          row.addComponents(this.selectMenu(btn as StringSelectMenuDescriptor));
          return;
        }
        row.addComponents(this.button(btn as ButtonDescriptor));
      });
      return row;
    },
    disableAll(rows) {
      const rowsArr = Array.isArray(rows) ? rows : [rows];
      return rowsArr.map(r => {
        const newRow = new ActionRowBuilder<any>();
        // Clone each component and set disabled where applicable
        r.components.forEach(comp => {
          try {
            if (comp instanceof ButtonBuilder) {
              newRow.addComponents(ButtonBuilder.from(comp).setDisabled(true));
              return;
            }
            if (comp instanceof StringSelectMenuBuilder) {
              newRow.addComponents(StringSelectMenuBuilder.from(comp).setDisabled(true));
              return;
            }
            if (comp instanceof UserSelectMenuBuilder) {
              newRow.addComponents(UserSelectMenuBuilder.from(comp).setDisabled(true));
              return;
            }
            if (comp instanceof RoleSelectMenuBuilder) {
              newRow.addComponents(RoleSelectMenuBuilder.from(comp).setDisabled(true));
              return;
            }
            if (comp instanceof MentionableSelectMenuBuilder) {
              newRow.addComponents(MentionableSelectMenuBuilder.from(comp).setDisabled(true));
              return;
            }
            // Unknown component type - attempt to clone via generic from or fallback to original
            // (some types may not support .setDisabled; we try to call it in a safe way)
            try {
              // @ts-ignore
              if (typeof comp.setDisabled === "function") {
                // @ts-ignore
                newRow.addComponents((comp as any).setDisabled(true));
                return;
              }
            } catch (e) {
              // noop
            }
            // If we can't clone or disable, add the component as-is to avoid crashes.
            newRow.addComponents(comp as any);
          } catch (e) {
            // If anything fails, try to include the original component to preserve layout
            newRow.addComponents(comp as any);
          }
        });
        return newRow;
      });
    },
    defineButtonGroup(pluginCtx, descriptor) {
      const pluginName = String(pluginCtx.dbPrefix ?? "");
      if (!pluginName) throw new Error("Plugin must have a manifest name to define UI groups");
      let pluginGroups = uiRegistry.get(pluginName);
      if (!pluginGroups) {
        pluginGroups = new Map();
        uiRegistry.set(pluginName, pluginGroups);
      }
      const newDescriptor: UIGroupDescriptor = { ...descriptor, type: 'button' };
      pluginGroups.set(descriptor.id, newDescriptor);
      return {
        pluginName,
        groupId: descriptor.id,
        descriptor: newDescriptor,
        build: () => this.build(pluginCtx, descriptor.id),
      } as UIRegistration;
    },
    defineSelectMenuGroup(pluginCtx, descriptor) {
      const pluginName = String(pluginCtx.dbPrefix ?? "");
      if (!pluginName) throw new Error("Plugin must have a manifest name to define UI groups");
      let pluginGroups = uiRegistry.get(pluginName);
      if (!pluginGroups) {
        pluginGroups = new Map();
        uiRegistry.set(pluginName, pluginGroups);
      }
      const newDescriptor: UIGroupDescriptor = { ...descriptor, type: 'select' };
      pluginGroups.set(descriptor.id, newDescriptor);
      return {
        pluginName,
        groupId: descriptor.id,
        descriptor: newDescriptor,
        build: () => this.build(pluginCtx, descriptor.id),
      } as UIRegistration;
    },
    defineModal(pluginCtx, descriptor) {
      const pluginName = String(pluginCtx.dbPrefix ?? "");
      if (!pluginName) throw new Error("Plugin must have a manifest name to define UI groups");
      let pluginGroups = uiRegistry.get(pluginName);
      if (!pluginGroups) {
        pluginGroups = new Map();
        uiRegistry.set(pluginName, pluginGroups);
      }
      const finalId = descriptor.id.includes(":") ? descriptor.id : namespacedId(pluginName, descriptor.id, 'modal');
      const newDescriptor: UIGroupDescriptor = { ...descriptor, id: finalId, type: 'modal' };
      pluginGroups.set(descriptor.id, newDescriptor);

      // Return a modal builder
      const modal = new ModalBuilder()
        .setCustomId(finalId)
        .setTitle(descriptor.title);
      const rows = descriptor.components.map(c => new ActionRowBuilder<TextInputBuilder>().addComponents(this.textInput(c)));
      modal.addComponents(...rows);
      return modal;
    },
    build(pluginCtx, groupId) {
      const pluginName = String(pluginCtx.dbPrefix ?? "");
      const groups = uiRegistry.get(pluginName);
      if (!groups) return [];
      const descriptor = groups.get(groupId);
      if (!descriptor) return [];

      // Build rows: place all components into a single action row (max 5 buttons / menu per row in Discord limits by type)
      const row = new ActionRowBuilder<any>();
      descriptor.components.forEach((c, i) => {
        // Button
        if ((c as any).label || (c as any).url) {
          const comp = c as ButtonDescriptor;
          // Skip link buttons from having customId
          const hasUrl = !!comp.url;
          let built: ButtonBuilder;
          if (hasUrl) {
            // Link buttons should not have customId
            built = this.button({ ...comp, customId: undefined as any });
          } else {
            let localId = comp.customId ?? comp.label ?? `btn${i}`;
            let finalId = localId;
            if (!finalId.includes(":")) finalId = namespacedId(pluginName, groupId, String(localId));
            built = this.button({ ...comp, customId: finalId });
          }
          row.addComponents(built);
          return;
        }
        if ((c as any).options) {
          const comp = c as StringSelectMenuDescriptor;
          const localId = comp.customId ?? `select${i}`;
          const finalId = localId.includes(":") ? localId : namespacedId(pluginName, groupId, String(localId));
          const built = this.selectMenu({ ...comp, customId: finalId });
          row.addComponents(built);
          return;
        }
        // For generic select menu descriptors
        const comp = c as GenericSelectMenuDescriptor;
        if (comp && (comp as any).minValues !== undefined) {
          // Treat as generic select (user/role/mentionable)
          const localId = comp.customId ?? `select${i}`;
          const finalId = localId.includes(":") ? localId : namespacedId(pluginName, groupId, String(localId));
          const built = this.userSelect({ ...comp, customId: finalId });
          row.addComponents(built);
          return;
        }
      });
      return [row];
    },
    async sendWithHandlers(pluginCtx, interaction, options) {
      const pluginName = String(pluginCtx.dbPrefix ?? "");
      const groups = uiRegistry.get(pluginName);
      if (!groups) throw new Error(`Group not defined: ${options.groupId}`);
      const descriptor = groups.get(options.groupId);
      if (!descriptor) throw new Error(`Group not defined: ${options.groupId}`);

      // Build rows
      const rows = this.build(pluginCtx, options.groupId);
      const timeout = options.timeout ?? descriptor.timeout ?? 120000;
      const autoDisable = options.autoDisable ?? descriptor.autoDisable ?? true;
      const filter = options.filter ?? descriptor.filter;

      const { resource } = await interaction.reply({ content: options.content, embeds: options.embeds, components: rows, flags: options.ephemeral ? MessageFlags.Ephemeral : undefined, withResponse: true });
      const message = resource!.message!;

      const collector = message.createMessageComponentCollector({ time: timeout });
      collector.on("collect", async (i) => {
        try {
          if (filter && !filter(i as any)) {
            await i.reply({ content: "This interaction isn't for you.", flags: MessageFlags.Ephemeral });
            return;
          }
          // Extract component id
          const parsed = parseNamespacedId(i.customId ?? "");
          if (!parsed) return;
          await descriptor.handler(pluginCtx as any, i as any, { pluginName: parsed.pluginName, groupId: parsed.groupId, componentId: parsed.componentId });
        } catch (e) {
          try { pluginCtx.logger.error("Error in UI handler:", e); } catch {}
        }
      });

      collector.on("end", async () => {
        if (!autoDisable) return;
        try {
          const disabledRows = this.disableAll(rows);
          await message.edit({ components: disabledRows });
        } catch (err) {
          // message might be deleted
        }
      });
    },
    unregister(pluginCtx, groupId) {
      const pluginName = String(pluginCtx.dbPrefix ?? "");
      const groups = uiRegistry.get(pluginName);
      if (!groups) return false;
      const removed = groups.delete(groupId);
      if (groups.size === 0) uiRegistry.delete(pluginName);
      return removed;
    },
  };
}

function normalizeButtonStyle(style?: string | number | ButtonStyle): ButtonStyle {
  if (style === undefined || style === null) return ButtonStyle.Primary;
  if (typeof style === "number") return style as ButtonStyle;
  if (typeof style === "string") {
    const s = style.toLowerCase();
    switch (s) {
      case "primary":
        return ButtonStyle.Primary;
      case "secondary":
        return ButtonStyle.Secondary;
      case "success":
        return ButtonStyle.Success;
      case "danger":
        return ButtonStyle.Danger;
      case "link":
        return ButtonStyle.Link;
      default:
        // Try number fallback
        const asNumber = Number(s);
        if (!isNaN(asNumber)) return asNumber as ButtonStyle;
        return ButtonStyle.Primary;
    }
  }
  return style as ButtonStyle;
}

function normalizeTextInputStyle(style?: string | number | TextInputStyle): TextInputStyle {
  if (style === undefined || style === null) return TextInputStyle.Short;
  if (typeof style === "number") return style as TextInputStyle;
  if (typeof style === "string") {
    const s = style.toLowerCase();
    switch (s) {
      case "short":
      case "short":
        return TextInputStyle.Short;
      case "paragraph":
      case "paragraph":
        return TextInputStyle.Paragraph;
      default:
        const asNumber = Number(s);
        if (!isNaN(asNumber)) return asNumber as TextInputStyle;
        return TextInputStyle.Short;
    }
  }
  return style as TextInputStyle;
}

// ============ Export ============

export default plugin;
