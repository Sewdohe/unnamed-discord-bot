import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Client,
  ClientEvents,
} from "discord.js";
import type { Db, ObjectId } from "mongodb";
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
  db: Db;
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

// ============ Database Abstraction ============

export type WhereOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS' | 'IS NOT';

export interface WhereCondition {
  field: string;
  operator: WhereOperator;
  value: unknown;
  conjunction?: 'AND' | 'OR';
}

export interface QueryBuilder<T = unknown> {
  // Filtering
  where(field: string, operator: WhereOperator, value: unknown): this;
  whereAnd(field: string, operator: WhereOperator, value: unknown): this;
  whereOr(field: string, operator: WhereOperator, value: unknown): this;

  // Ordering & Limiting
  orderBy(field: string, direction?: 'ASC' | 'DESC'): this;
  limit(count: number): this;
  offset(count: number): this;

  // Execution (now async for MongoDB)
  first(): Promise<T | null>;
  all(): Promise<T[]>;
  count(): Promise<number>;

  // Mutations
  insert(data: Partial<T>): this;
  update(data: Partial<T>): this;
  delete(): this;
  execute(): Promise<void>;
}

export interface Repository<T, TCreate = Partial<T>, TUpdate = Partial<T>> {
  find(id: string | ObjectId): Promise<T | null>;
  findBy(field: string, value: unknown): Promise<T | null>;
  findAll(): Promise<T[]>;
  findAllBy(field: string, value: unknown): Promise<T[]>;

  create(data: TCreate): Promise<string>;
  update(id: string | ObjectId, data: TUpdate): Promise<boolean>;
  delete(id: string | ObjectId): Promise<boolean>;

  exists(id: string | ObjectId): Promise<boolean>;
  count(): Promise<number>;
  query(): QueryBuilder<T>;
}

export interface SchemaValidator<T> {
  validate(data: unknown): T;
  partial(data: unknown): Partial<T>;
}
