import {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  Message,
  MessageFlags,
} from "discord.js";
import type { Command, PluginContext } from "../types/";
import { createLogger } from "./logger";
import { initDatabase } from "./database";
import { PluginLoader } from "./plugin-loader";

const logger = createLogger("bot");

export class Bot {
  public client: Client;
  public commands = new Collection<string, { command: Command; ctx: PluginContext }>();
  private pluginLoader!: PluginLoader;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  async start(): Promise<void> {
    // Initialize MongoDB connection
    const db = await initDatabase();
    //@ts-ignore
    //TODO: fix ts ignore
    // this is a type error left over from when we switched db libs
    this.pluginLoader = new PluginLoader(this.client, db);

    // Load all plugins
    await this.pluginLoader.loadAll();

    // Collect commands (already grouped by plugin loader)
    const allCommands = this.pluginLoader.getAllCommands();
    const loadedPlugins = this.pluginLoader.getLoadedPlugins();

    for (const command of allCommands) {
      // Find the plugin context for this command
      // For grouped commands, we need to find the source plugin
      let ctx: PluginContext | undefined;

      for (const loaded of loadedPlugins.values()) {
        // Check if this command came from this plugin
        if (loaded.commands.some((c: any) => c.data.name === command.data.name) ||
            loaded.plugin.manifest.commandGroup?.name === command.data.name) {
          ctx = loaded.context;
          break;
        }
      }

      if (ctx) {
        this.commands.set(command.data.name, { command, ctx });
      }
    }

    // Setup event handlers
    this.setupEvents();

    // Setup interaction handler
    this.setupInteractionHandler();

    // Login and register commands when ready
    this.client.once(Events.ClientReady, async (readyClient) => {
      logger.info(`Logged in as ${readyClient.user.tag}`);
      await this.registerCommands(readyClient.user.id);
    });

    await this.client.login(process.env.DISCORD_TOKEN);
  }

  private setupEvents(): void {
    const events = this.pluginLoader.getAllEvents();

    for (const loaded of this.pluginLoader.getLoadedPlugins().values()) {
      for (const event of loaded.events) {
        const handler = (...args: unknown[]) =>
          event.execute(loaded.context, ...(args as any));

        if (event.once) {
          this.client.once(event.name, handler);
        } else {
          this.client.on(event.name, handler);
        }
      }
    }

    logger.info(`Registered ${events.length} event handlers`);
    logger.info(`Startup done!`);
  }

  private setupInteractionHandler(): void {
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const entry = this.commands.get(interaction.commandName);
      if (!entry) {
        logger.warn(`Unknown command: ${interaction.commandName}`);
        return;
      }

      const { command, ctx } = entry;

      try {
        await command.execute(interaction, ctx);
      } catch (error) {
        ctx.logger.error(`Command error:`, error);

        const reply = {
          content: "There was an error executing this command!",
          // ephemeral: true,
          flags: MessageFlags.Ephemeral,
        };

        if (interaction.replied || interaction.deferred) {
          //@ts-ignore
          //TODO: fix ts ignore
          await interaction.followUp(reply);
        } else {
          //@ts-ignore
          //TODO: fix ts ignore
          await interaction.reply(reply);
        }
      }
    });
  }

  private async registerCommands(clientId: string): Promise<void> {
    const commands = this.pluginLoader.getAllCommands();
    const commandData = commands.map((c) => c.data.toJSON());

    if (commandData.length === 0) {
      logger.warn("No commands to register");
      return;
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

    try {
      if (process.env.GUILD_ID) {
        await rest.put(
          Routes.applicationGuildCommands(clientId, process.env.GUILD_ID),
          { body: commandData }
        );
        logger.info(`Registered ${commandData.length} guild commands`);
      } else {
        await rest.put(Routes.applicationCommands(clientId), {
          body: commandData,
        });
        logger.info(`Registered ${commandData.length} global commands`);
      }
    } catch (error) {
      logger.error("Failed to register commands:", error);
    }
  }
}
