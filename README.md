# Discord Bot

A plugin-based Discord bot built with Discord.js, TypeScript, and Bun.

## Getting Started

```bash
# Install dependencies
bun install

# Copy environment file and fill in your tokens
cp .env.example .env

# Run in development (with hot reload)
bun run dev

# Run in production
bun run start
```

## Project Structure

```
discord-bot/
├── src/
│   ├── core/           # Bot framework
│   │   ├── bot.ts      # Main bot class
│   │   ├── plugin-loader.ts  # Plugin discovery & loading
│   │   ├── config.ts   # YAML config management
│   │   ├── database.ts # MongoDB setup
│   │   └── logger.ts   # Logging utility
│   ├── types/          # TypeScript definitions
│   └── index.ts        # Entry point
├── plugins/            # Plugin directory
│   ├── ping/
│   │   └── plugin.ts
│   └── economy/
│       └── plugin.ts
├── config/             # Auto-generated YAML configs (per plugin)
└── data/               # MongoDB data
```

## Creating a Plugin

> NOTE!
> For more in-depth guide, see
> PLUGIN_DEVELOPMENT.md for a detailed overview on plugin creation

Create a new folder in `plugins/` with a `plugin.ts` file:

```ts
import { SlashCommandBuilder } from "discord.js";
import { z } from "zod";
import type { Plugin, PluginContext, Command } from "../../src/types";

// Optional: Define a config schema (auto-generates YAML)
const configSchema = z.object({
  someOption: z.string().default("default value"),
  enabled: z.boolean().default(true),
});

type MyConfig = z.infer<typeof configSchema>;

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "What this plugin does",
    author: "Your Name",
    dependencies: {
      hard: [],  // Required plugins (fails if missing)
      soft: [],  // Optional plugins (loads first if present)
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      someOption: "default value",
      enabled: true,
    },
  },

  async onLoad(ctx: PluginContext<MyConfig>) {
    // Register commands
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("mycommand")
        .setDescription("Does something"),
      
      async execute(interaction, ctx) {
        await interaction.reply(`Config value: ${ctx.config.someOption}`);
      },
    });

    // Register events
    ctx.registerEvent({
      name: "messageCreate",
      async execute(ctx, message) {
        // Handle event
      },
    });

    ctx.logger.info("Plugin loaded!");
  },

  // Optional: cleanup on unload
  async onUnload() {
    // Cleanup resources
  },
};

export default plugin;
```

## Plugin Context

Every plugin receives a context object with:

| Property | Description |
|----------|-------------|
| `client` | Discord.js Client instance |
| `logger` | Prefixed logger (`info`, `warn`, `error`, `debug`) |
| `config` | Parsed & validated config from YAML |
| `db` | MongoDB database instance |
| `dbPrefix` | Collection prefix for this plugin (e.g., `economy_`) |
| `registerCommand(cmd)` | Register a slash command |
| `registerEvent(event)` | Register an event handler |
| `getPlugin(name)` | Get another loaded plugin for cross-plugin communication |

## Database Usage

Plugins use MongoDB for data storage. Get the core-utils API to access database helpers:

```ts
const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
const api = coreUtils?.api;

// Get a MongoDB collection (automatically created)
const collection = api.database.getCollection<MyType>(ctx, 'my_collection');

// Create indexes for performance
collection.createIndex({ user_id: 1 }, { unique: true }).catch(() => {});

// Use the collection
const items = await collection.find({ user_id: userId }).toArray();
await collection.insertOne({ user_id: userId, data: "value" });
```

## Configuration

Plugin configs are auto-generated as YAML files in `config/`:

```yaml
# config/my-plugin.yaml
someOption: "default value"
enabled: true
```

Edit the YAML to change settings. Invalid configs fall back to defaults.

## Dependencies

Plugins can declare dependencies on other plugins:

```ts
dependencies: {
  hard: ["required-plugin"],  // Bot fails to start if missing
  soft: ["optional-plugin"],  // Loads first if present, ignored if missing
}
```

## Cross-Plugin Communication

Access other plugins via `ctx.getPlugin()`:

```ts
const economy = ctx.getPlugin<EconomyPlugin>("economy");
if (economy) {
  // Use economy plugin API
}
```
