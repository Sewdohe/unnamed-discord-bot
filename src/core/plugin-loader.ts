import { readdir } from "fs/promises";
import { join } from "path";
import { SlashCommandBuilder } from "discord.js";
import type { Client, ClientEvents } from "discord.js";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type {
  Plugin,
  PluginManifest,
  LoadedPlugin,
  PluginContext,
  Command,
  Event,
} from "../types/";
import { createLogger } from "./logger";
import { loadPluginConfig } from "./config";
import { prefixTable } from "./database";

const logger = createLogger("plugins");

const PLUGINS_DIR = join(process.cwd(), "plugins");

export class PluginLoader {
  private plugins = new Map<string, LoadedPlugin>();
  private client: Client;
  private db: BunSQLiteDatabase;

  constructor(client: Client, db: BunSQLiteDatabase) {
    this.client = client;
    this.db = db;
  }

  async discoverPlugins(): Promise<Map<string, Plugin>> {
    const discovered = new Map<string, Plugin>();

    let entries: string[];
    try {
      entries = await readdir(PLUGINS_DIR);
    } catch {
      logger.warn(`Plugins directory not found: ${PLUGINS_DIR}`);
      return discovered;
    }

    for (const entry of entries) {
      const pluginPath = join(PLUGINS_DIR, entry, "plugin.ts");
      const pluginFile = Bun.file(pluginPath);

      if (await pluginFile.exists()) {
        try {
          const module = await import(pluginPath);
          const plugin: Plugin = module.default ?? module.plugin;

          if (plugin?.manifest?.name) {
            discovered.set(plugin.manifest.name, plugin);
            logger.debug(`Discovered plugin: ${plugin.manifest.name}`);
          } else {
            logger.warn(`Invalid plugin at ${entry}: missing manifest`);
          }
        } catch (error) {
          logger.error(`Failed to load plugin at ${entry}:`, error);
        }
      }
    }

    return discovered;
  }

  async loadAll(): Promise<void> {
    const discovered = await this.discoverPlugins();

    if (discovered.size === 0) {
      logger.warn("No plugins found");
      return;
    }

    // Resolve load order based on dependencies
    const loadOrder = this.resolveDependencies(discovered);

    logger.info(`Loading ${loadOrder.length} plugins...`);

    for (const pluginName of loadOrder) {
      const plugin = discovered.get(pluginName)!;
      await this.loadPlugin(plugin);
    }
  }

  private resolveDependencies(plugins: Map<string, Plugin>): string[] {
    const resolved: string[] = [];
    const seen = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string, isHard: boolean): boolean => {
      if (resolved.includes(name)) return true;
      if (visiting.has(name)) {
        logger.error(`Circular dependency detected: ${name}`);
        return false;
      }

      const plugin = plugins.get(name);
      if (!plugin) {
        if (isHard) {
          logger.error(`Missing hard dependency: ${name}`);
          return false;
        }
        logger.warn(`Missing soft dependency: ${name} (skipping)`);
        return true;
      }

      visiting.add(name);

      const deps = plugin.manifest.dependencies;

      // Process hard dependencies first
      for (const dep of deps?.hard ?? []) {
        if (!visit(dep, true)) {
          return false;
        }
      }

      // Then soft dependencies
      for (const dep of deps?.soft ?? []) {
        visit(dep, false);
      }

      visiting.delete(name);
      resolved.push(name);
      seen.add(name);

      return true;
    };

    for (const name of plugins.keys()) {
      if (!seen.has(name)) {
        visit(name, true);
      }
    }

    return resolved;
  }

  private async loadPlugin(plugin: Plugin): Promise<void> {
    const { manifest } = plugin;
    const pluginLogger = createLogger(manifest.name);

    pluginLogger.info(`Loading v${manifest.version}...`);

    // Load config from YAML (or create default)
    const config = loadPluginConfig(manifest.name, plugin.config);

    // Track registered commands and events
    const commands: Command[] = [];
    const events: Event[] = [];

    // Create plugin context
    const context: PluginContext = {
      client: this.client,
      logger: pluginLogger,
      config,
      db: this.db,
      dbPrefix: prefixTable(manifest.name, ""),

      registerCommand: (command: Command) => {
        commands.push(command);
        pluginLogger.debug(`Registered command: /${command.data.name}`);
      },

      registerEvent: <K extends keyof ClientEvents>(event: Event<K>) => {
        events.push(event as unknown as Event);
        pluginLogger.debug(`Registered event: ${event.name}`);
      },

      getPlugin: <T = unknown>(name: string): T | undefined => {
        const loaded = this.plugins.get(name);
        return loaded?.plugin as T | undefined;
      },
    };

    try {
      await plugin.onLoad(context);

      this.plugins.set(manifest.name, {
        plugin,
        context,
        commands,
        events,
      });

      pluginLogger.info(
        `Loaded (${commands.length} commands, ${events.length} events)`
      );
    } catch (error) {
      pluginLogger.error(`Failed to load:`, error);
    }
  }

  getAllCommands(): Command[] {
    const commands: Command[] = [];

    for (const loaded of this.plugins.values()) {
      const { plugin, commands: pluginCommands, context } = loaded;
      const { manifest } = plugin;

      // If plugin has no commands, skip
      if (pluginCommands.length === 0) {
        continue;
      }

      // If plugin defines a command group, wrap all commands as subcommands
      if (manifest.commandGroup) {
        const groupCommand = this.createGroupCommand(
          manifest,
          pluginCommands,
          context
        );
        commands.push(groupCommand);
      } else {
        // No grouping - add commands as-is
        commands.push(...pluginCommands);
      }
    }

    return commands;
  }

  private createGroupCommand(
    manifest: PluginManifest,
    pluginCommands: Command[],
    context: PluginContext
  ): Command {
    const { commandGroup } = manifest;

    if (!commandGroup) {
      throw new Error("commandGroup is required");
    }

    const builder = new SlashCommandBuilder()
      .setName(commandGroup.name)
      .setDescription(commandGroup.description);

    // Add each command as a subcommand
    for (const cmd of pluginCommands) {
      builder.addSubcommand((sub) => {
        // Copy name and description from original command
        sub.setName(cmd.data.name);
        sub.setDescription(cmd.data.description || "No description");

        // Copy options from original command
        const options = cmd.data.options ?? [];
        for (const option of options) {
          // @ts-expect-error - Discord.js internal structure
          sub.options.push(option);
        }

        return sub;
      });
    }

    // Create execution handler that routes to the appropriate subcommand
    const execute = async (interaction: any, ctx: PluginContext) => {
      const subcommandName = interaction.options.getSubcommand();
      const subcommand = pluginCommands.find((cmd) => cmd.data.name === subcommandName);

      if (subcommand) {
        await subcommand.execute(interaction, ctx);
      } else {
        await interaction.reply({
          content: `Unknown subcommand: ${subcommandName}`,
          flags: 64, // Ephemeral
        });
      }
    };

    return {
      data: builder,
      execute,
    };
  }

  getAllEvents(): Event[] {
    const events: Event[] = [];
    for (const loaded of this.plugins.values()) {
      events.push(...loaded.events);
    }
    return events;
  }

  getLoadedPlugins(): Map<string, LoadedPlugin> {
    return this.plugins;
  }

  getContext(pluginName: string): PluginContext | undefined {
    return this.plugins.get(pluginName)?.context;
  }
}
