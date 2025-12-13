import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Client,
  ClientEvents,
} from "discord.js";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { z } from "zod";

// ============ Commands ============

export type SlashCommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;

export interface Command {
  data: SlashCommandData;
  execute: (
    interaction: ChatInputCommandInteraction,
    ctx: PluginContext
  ) => Promise<void>;
}

// ============ Events ============

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (ctx: PluginContext, ...args: ClientEvents[K]) => Promise<void>;
}

// ============ Plugin System ============

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  commandGroup?: {
    name: string;
    description: string;
  };
  dependencies?: {
    hard?: string[];
    soft?: string[];
  };
}

export interface PluginConfig<T extends z.ZodType = z.ZodType> {
  schema: T;
  defaults: z.infer<T>;
}

export interface Plugin<TConfig extends z.ZodType = z.ZodType> {
  manifest: PluginManifest;
  config?: PluginConfig<TConfig>;
  onLoad(ctx: PluginContext<z.infer<TConfig>>): Promise<void>;
  onUnload?(): Promise<void>;
}

// ============ Plugin Context ============

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface PluginContext<TConfig = Record<string, unknown>> {
  client: Client;
  logger: Logger;
  config: TConfig;
  db: BunSQLiteDatabase;
  dbPrefix: string;
  registerCommand(command: Command): void;
  registerEvent<K extends keyof ClientEvents>(event: Event<K>): void;
  getPlugin<T = unknown>(name: string): T | undefined;
}

// ============ Internal Types ============

export interface LoadedPlugin {
  plugin: Plugin;
  context: PluginContext;
  commands: Command[];
  events: Event[];
}
