# Plugin Development Guide

This guide covers everything you need to know to develop plugins for the bot framework. Whether you're adding simple commands or building complex systems with database persistence and cross-plugin communication, this document will walk you through the architecture and APIs available to you.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Quick Start](#quick-start)
3. [Plugin Structure](#plugin-structure)
4. [The Plugin Manifest](#the-plugin-manifest)
5. [Plugin Configuration](#plugin-configuration)
6. [The Plugin Context](#the-plugin-context)
7. [Registering Commands](#registering-commands)
8. [Registering Events](#registering-events)
9. [Database Access](#database-access)
10. [Cross-Plugin Communication](#cross-plugin-communication)
11. [Logging](#logging)
12. [Best Practices](#best-practices)
13. [Troubleshooting](#troubleshooting)
14. [Complete Examples](#complete-examples)

---

## Architecture Overview

The bot uses a plugin-based architecture where the core framework handles:

- Discord client management and authentication
- Plugin discovery and loading
- Dependency resolution between plugins
- Slash command registration with Discord's API
- Event routing to plugins
- Database initialization and connection pooling
- Configuration file generation and validation

Plugins are self-contained modules that extend the bot's functionality without modifying core code. Each plugin can:

- Register slash commands
- Listen to Discord events
- Store data in the shared SQLite database
- Define its own configuration schema (auto-generates YAML files)
- Communicate with other plugins
- Declare dependencies on other plugins

### How the Bot Starts

1. **Initialization**: The bot creates a Discord client and initializes the SQLite database
2. **Plugin Discovery**: The plugin loader scans the `plugins/` directory for valid plugins
3. **Dependency Resolution**: Plugins are sorted based on their declared dependencies
4. **Plugin Loading**: Each plugin's `onLoad()` function is called in dependency order
5. **Command Registration**: All commands from all plugins are registered with Discord
6. **Event Binding**: All event handlers are attached to the Discord client
7. **Login**: The bot authenticates with Discord and comes online

### Directory Structure

```
discord-bot/
├── src/
│   ├── core/                 # Framework code (don't modify)
│   │   ├── bot.ts            # Main bot class
│   │   ├── plugin-loader.ts  # Plugin discovery and loading
│   │   ├── config.ts         # YAML config management
│   │   ├── database.ts       # SQLite/Drizzle setup
│   │   ├── logger.ts         # Logging utility
│   │   └── index.ts          # Barrel exports
│   ├── types/
│   │   └── index.ts          # TypeScript definitions
│   └── index.ts              # Entry point
├── plugins/                  # Your plugins go here
│   ├── my-plugin/
│   │   └── plugin.ts
│   └── another-plugin/
│       └── plugin.ts
├── config/                   # Auto-generated configs (per plugin)
├── data/                     # SQLite database
└── .env                      # Bot token and settings
```

---

## Quick Start

Create a new plugin in under 2 minutes:

### 1. Create the plugin directory

```bash
mkdir -p plugins/hello
```

### 2. Create `plugins/hello/plugin.ts`

```typescript
import { SlashCommandBuilder } from "discord.js";
import type { Plugin, PluginContext, Command } from "@types";

const plugin: Plugin = {
  manifest: {
    name: "hello",
    version: "1.0.0",
    description: "A simple hello world plugin",
  },

  async onLoad(ctx: PluginContext) {
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("hello")
        .setDescription("Says hello!"),

      async execute(interaction) {
        await interaction.reply(`Hello, ${interaction.user.displayName}!`);
      },
    });

    ctx.logger.info("Hello plugin loaded!");
  },
};

export default plugin;
```

### 3. Restart the bot

```bash
bun run dev
```

That's it! The `/hello` command is now available.

---

## Plugin Structure

Every plugin must have a `plugin.ts` file in its directory that exports a `Plugin` object as the default export.

```typescript
import type { Plugin } from "@types";

const plugin: Plugin = {
  // Required: Plugin metadata
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
  },

  // Required: Called when the plugin loads
  async onLoad(ctx) {
    // Register commands, events, initialize database tables, etc.
  },

  // Optional: Called when the plugin unloads (future hot-reload support)
  async onUnload() {
    // Cleanup resources
  },
};

export default plugin;
```

### File Organization

For simple plugins, everything can live in `plugin.ts`. For larger plugins, you might want to organize your code:

```
plugins/my-plugin/
├── plugin.ts           # Main entry point
├── commands/
│   ├── foo.ts          # Individual command definitions
│   └── bar.ts
├── events/
│   └── messageCreate.ts
├── services/
│   └── myService.ts    # Business logic
└── db/
    └── schema.ts       # Database table definitions
```

Then import and register them in your `plugin.ts`:

```typescript
import { fooCommand } from "./commands/foo";
import { barCommand } from "./commands/bar";
import { messageCreateEvent } from "./events/messageCreate";

async onLoad(ctx) {
  ctx.registerCommand(fooCommand(ctx));
  ctx.registerCommand(barCommand(ctx));
  ctx.registerEvent(messageCreateEvent(ctx));
}
```

---

## The Plugin Manifest

The manifest provides metadata about your plugin:

```typescript
interface PluginManifest {
  // Required: Unique identifier for your plugin
  name: string;

  // Required: Semantic version (e.g., "1.0.0", "2.1.3")
  version: string;

  // Optional: What does this plugin do?
  description?: string;

  // Optional: Who made this?
  author?: string;

  // Optional: Plugin dependencies
  dependencies?: {
    hard?: string[];  // Required plugins - bot fails if missing
    soft?: string[];  // Optional plugins - loaded first if present
  };
}
```

### Example with Dependencies

```typescript
manifest: {
  name: "shop",
  version: "1.0.0",
  description: "A shop system where users can buy items",
  author: "YourName",
  dependencies: {
    hard: ["economy"],      // Requires the economy plugin
    soft: ["inventory"],    // Uses inventory if available, but works without it
  },
}
```

### Dependency Resolution

- **Hard dependencies**: The bot will fail to start if any hard dependency is missing. Hard dependencies are always loaded before your plugin.

- **Soft dependencies**: If present, they're loaded before your plugin. If missing, your plugin still loads but you should handle the absence gracefully.

---

## Plugin Configuration

Plugins can define a configuration schema using Zod. The framework will:

1. Automatically generate a YAML config file with defaults
2. Load and validate the config on startup
3. Provide typed access to config values via `ctx.config`

### Defining a Config Schema

```typescript
import { z } from "zod";
import type { Plugin, PluginContext } from "@types";

// Define your schema
const configSchema = z.object({
  greeting: z.string().default("Hello"),
  maxUses: z.number().min(1).max(100).default(10),
  features: z.object({
    enableFoo: z.boolean().default(true),
    enableBar: z.boolean().default(false),
  }).default({}),
}).describe("My Plugin Configuration");  // This becomes a comment in the YAML

// Infer the TypeScript type from the schema
type MyConfig = z.infer<typeof configSchema>;

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
  },

  // Provide the schema and defaults
  config: {
    schema: configSchema,
    defaults: {
      greeting: "Hello",
      maxUses: 10,
      features: {
        enableFoo: true,
        enableBar: false,
      },
    },
  },

  async onLoad(ctx: PluginContext<MyConfig>) {
    // Access config with full type safety
    console.log(ctx.config.greeting);           // string
    console.log(ctx.config.maxUses);            // number
    console.log(ctx.config.features.enableFoo); // boolean
  },
};
```

### Generated YAML File

When the bot first starts with this plugin, it creates `config/my-plugin.yaml`:

```yaml
# My Plugin Configuration

greeting: Hello
maxUses: 10
features:
  enableFoo: true
  enableBar: false
```

Users can edit this file, and changes take effect on restart. Invalid values fall back to defaults with a warning.

### Config Without Schema

If your plugin doesn't need configuration, just omit the `config` property:

```typescript
const plugin: Plugin = {
  manifest: { name: "simple", version: "1.0.0" },
  async onLoad(ctx) {
    // ctx.config will be an empty object
  },
};
```

---

## The Plugin Context

When your plugin's `onLoad()` is called, it receives a context object with everything needed to interact with the bot:

```typescript
interface PluginContext<TConfig = Record<string, unknown>> {
  // The Discord.js client instance
  client: Client;

  // A logger prefixed with your plugin name
  logger: Logger;

  // Your validated configuration
  config: TConfig;

  // Drizzle database instance
  db: BunSQLiteDatabase;

  // Table name prefix for your plugin (e.g., "economy_")
  dbPrefix: string;

  // Register a slash command
  registerCommand(command: Command): void;

  // Register an event handler
  registerEvent<K extends keyof ClientEvents>(event: Event<K>): void;

  // Get another loaded plugin
  getPlugin<T = unknown>(name: string): T | undefined;
}
```

### Storing Context for Later Use

If you need access to the context outside of `onLoad()`, store it:

```typescript
let ctx: PluginContext<MyConfig>;

const plugin: Plugin<typeof configSchema> = {
  manifest: { name: "my-plugin", version: "1.0.0" },

  async onLoad(context) {
    ctx = context;
    ctx.registerCommand(myCommand());
  },
};

function myCommand(): Command {
  return {
    data: new SlashCommandBuilder().setName("test").setDescription("Test"),
    async execute(interaction) {
      // Access ctx here
      ctx.logger.info("Command executed!");
    },
  };
}
```

Or use a factory pattern (recommended):

```typescript
function myCommand(ctx: PluginContext<MyConfig>): Command {
  return {
    data: new SlashCommandBuilder().setName("test").setDescription("Test"),
    async execute(interaction) {
      ctx.logger.info("Command executed!");
      await interaction.reply(ctx.config.greeting);
    },
  };
}

async onLoad(ctx) {
  ctx.registerCommand(myCommand(ctx));
}
```

---

## Registering Commands

Commands are slash commands that users invoke with `/commandname`.

### Command Interface

```typescript
interface Command {
  // The slash command definition (use SlashCommandBuilder)
  data: SlashCommandData;

  // Handler called when the command is used
  execute: (
    interaction: ChatInputCommandInteraction,
    ctx: PluginContext
  ) => Promise<void>;
}
```

### Basic Command

```typescript
import { SlashCommandBuilder } from "discord.js";

ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  async execute(interaction) {
    await interaction.reply("Pong!");
  },
});
```

### Command with Options

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("greet")
    .setDescription("Greet someone")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Who to greet")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("message")
        .setDescription("Custom message")
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const message = interaction.options.getString("message") ?? "Hello";

    await interaction.reply(`${message}, ${user}!`);
  },
});
```

### Command with Subcommands

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Manage settings")
    .addSubcommand(sub =>
      sub
        .setName("view")
        .setDescription("View current settings")
    )
    .addSubcommand(sub =>
      sub
        .setName("set")
        .setDescription("Change a setting")
        .addStringOption(opt =>
          opt.setName("key").setDescription("Setting name").setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName("value").setDescription("New value").setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "view") {
      await interaction.reply("Current settings: ...");
    } else if (subcommand === "set") {
      const key = interaction.options.getString("key", true);
      const value = interaction.options.getString("value", true);
      await interaction.reply(`Set ${key} to ${value}`);
    }
  },
});
```

### Deferred Replies

For operations that take more than 3 seconds:

```typescript
async execute(interaction) {
  // Tell Discord we're working on it (gives you 15 minutes)
  await interaction.deferReply();

  // Do slow work...
  const result = await someSlowOperation();

  // Send the actual response
  await interaction.editReply(`Result: ${result}`);
}
```

### Ephemeral Replies

For responses only the command user can see:

```typescript
async execute(interaction) {
  await interaction.reply({
    content: "This is private!",
    ephemeral: true,
  });
}
```

### Permission Checks

```typescript
data: new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a user")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setDMPermission(false),  // Guild-only
```

---

## Registering Events

Events let you respond to things happening in Discord (messages, reactions, member joins, etc.).

### Event Interface

```typescript
interface Event<K extends keyof ClientEvents> {
  // The event name (e.g., "messageCreate", "guildMemberAdd")
  name: K;

  // If true, handler only fires once then unregisters
  once?: boolean;

  // Handler function
  execute: (ctx: PluginContext, ...args: ClientEvents[K]) => Promise<void>;
}
```

### Basic Event

```typescript
ctx.registerEvent({
  name: "messageCreate",

  async execute(ctx, message) {
    // Ignore bots
    if (message.author.bot) return;

    // Respond to "hello"
    if (message.content.toLowerCase() === "hello") {
      await message.reply("Hi there!");
    }
  },
});
```

### Common Events

```typescript
// When someone joins the server
ctx.registerEvent({
  name: "guildMemberAdd",
  async execute(ctx, member) {
    const channel = member.guild.systemChannel;
    if (channel) {
      await channel.send(`Welcome, ${member}!`);
    }
  },
});

// When a reaction is added
ctx.registerEvent({
  name: "messageReactionAdd",
  async execute(ctx, reaction, user) {
    if (reaction.emoji.name === "⭐") {
      ctx.logger.info(`${user.tag} starred a message`);
    }
  },
});

// When the bot is ready (fires once)
ctx.registerEvent({
  name: "ready",
  once: true,
  async execute(ctx, client) {
    ctx.logger.info(`Connected as ${client.user.tag}`);
  },
});
```

### Event List

Common Discord.js events you might use:

| Event | Arguments | Description |
|-------|-----------|-------------|
| `messageCreate` | `message` | A message was sent |
| `messageDelete` | `message` | A message was deleted |
| `messageUpdate` | `oldMessage, newMessage` | A message was edited |
| `guildMemberAdd` | `member` | Someone joined a server |
| `guildMemberRemove` | `member` | Someone left a server |
| `messageReactionAdd` | `reaction, user` | A reaction was added |
| `messageReactionRemove` | `reaction, user` | A reaction was removed |
| `interactionCreate` | `interaction` | Any interaction (usually handled by core) |
| `voiceStateUpdate` | `oldState, newState` | Voice channel changes |
| `ready` | `client` | Bot is connected and ready |

See the [Discord.js documentation](https://discord.js.org/docs/packages/discord.js/main/Client:Class#events) for the complete list.

---

## Database Access

Each plugin has access to a shared SQLite database via Drizzle ORM. To avoid table name collisions, always prefix your tables with `ctx.dbPrefix`.

### Creating Tables

```typescript
import { sql } from "drizzle-orm";

async onLoad(ctx) {
  const tableName = `${ctx.dbPrefix}users`;

  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `));
}
```

### Querying Data

```typescript
import { sql } from "drizzle-orm";

// Get one row
const user = ctx.db.get<{ user_id: string; points: number }>(
  sql.raw(`SELECT user_id, points FROM ${tableName} WHERE user_id = '${userId}'`)
);

// Get multiple rows
const topUsers = ctx.db.all<{ user_id: string; points: number }>(
  sql.raw(`SELECT user_id, points FROM ${tableName} ORDER BY points DESC LIMIT 10`)
);
```

### Inserting/Updating Data

```typescript
// Insert
ctx.db.run(
  sql.raw(`INSERT INTO ${tableName} (user_id, points) VALUES ('${userId}', 100)`)
);

// Update
ctx.db.run(
  sql.raw(`UPDATE ${tableName} SET points = points + 10 WHERE user_id = '${userId}'`)
);

// Upsert (insert or update)
ctx.db.run(
  sql.raw(`
    INSERT INTO ${tableName} (user_id, points) VALUES ('${userId}', 100)
    ON CONFLICT(user_id) DO UPDATE SET points = points + 100
  `)
);
```

### SQL Injection Warning

The examples above use string interpolation for simplicity. For user-provided input, use parameterized queries or sanitize input:

```typescript
// DANGEROUS - don't do this with user input!
const name = userInput; // Could be "'; DROP TABLE users; --"
ctx.db.run(sql.raw(`INSERT INTO ${tableName} (name) VALUES ('${name}')`));

// SAFER - sanitize or validate input
function sanitize(input: string): string {
  return input.replace(/'/g, "''");
}
const safeName = sanitize(userInput);
ctx.db.run(sql.raw(`INSERT INTO ${tableName} (name) VALUES ('${safeName}')`));
```

### Helper Pattern

Create a data access layer for cleaner code:

```typescript
// db/users.ts
import { sql } from "drizzle-orm";
import type { PluginContext } from "@types";

export function createUserRepository(ctx: PluginContext) {
  const table = `${ctx.dbPrefix}users`;

  return {
    findById(userId: string) {
      return ctx.db.get<{ user_id: string; points: number }>(
        sql.raw(`SELECT * FROM ${table} WHERE user_id = '${userId}'`)
      );
    },

    addPoints(userId: string, amount: number) {
      ctx.db.run(
        sql.raw(`UPDATE ${table} SET points = points + ${amount} WHERE user_id = '${userId}'`)
      );
    },

    getLeaderboard(limit = 10) {
      return ctx.db.all<{ user_id: string; points: number }>(
        sql.raw(`SELECT * FROM ${table} ORDER BY points DESC LIMIT ${limit}`)
      );
    },
  };
}

// plugin.ts
async onLoad(ctx) {
  const users = createUserRepository(ctx);

  ctx.registerCommand({
    data: new SlashCommandBuilder().setName("points").setDescription("Check points"),
    async execute(interaction) {
      const user = users.findById(interaction.user.id);
      await interaction.reply(`You have ${user?.points ?? 0} points`);
    },
  });
}
```

---

## Cross-Plugin Communication

Plugins can access other loaded plugins via `ctx.getPlugin()`.

### Accessing Another Plugin

```typescript
// In shop plugin, access economy plugin
async onLoad(ctx) {
  const economy = ctx.getPlugin<EconomyPlugin>("economy");

  if (!economy) {
    ctx.logger.error("Economy plugin not found!");
    return;
  }

  // Now you can use economy plugin's exported functionality
}
```

### Exposing an API

To let other plugins use your functionality, export functions or objects from your plugin:

```typescript
// economy/plugin.ts
import type { Plugin, PluginContext } from "@types";

// Export types for consumers
export interface EconomyAPI {
  getBalance(userId: string): number;
  addBalance(userId: string, amount: number): void;
  removeBalance(userId: string, amount: number): boolean;
}

let api: EconomyAPI;

const plugin: Plugin = {
  manifest: { name: "economy", version: "1.0.0" },

  // Expose the API on the plugin object itself
  api: undefined as unknown as EconomyAPI,

  async onLoad(ctx) {
    const tableName = `${ctx.dbPrefix}wallets`;

    // Initialize database...

    api = {
      getBalance(userId: string): number {
        const row = ctx.db.get<{ balance: number }>(
          sql.raw(`SELECT balance FROM ${tableName} WHERE user_id = '${userId}'`)
        );
        return row?.balance ?? 0;
      },

      addBalance(userId: string, amount: number): void {
        ctx.db.run(
          sql.raw(`UPDATE ${tableName} SET balance = balance + ${amount} WHERE user_id = '${userId}'`)
        );
      },

      removeBalance(userId: string, amount: number): boolean {
        const current = this.getBalance(userId);
        if (current < amount) return false;
        ctx.db.run(
          sql.raw(`UPDATE ${tableName} SET balance = balance - ${amount} WHERE user_id = '${userId}'`)
        );
        return true;
      },
    };

    // Attach to plugin for external access
    (plugin as any).api = api;
  },
};

export default plugin;
```

```typescript
// shop/plugin.ts
import type { EconomyAPI } from "../economy/plugin";

async onLoad(ctx) {
  const economyPlugin = ctx.getPlugin<{ api: EconomyAPI }>("economy");

  if (!economyPlugin?.api) {
    ctx.logger.error("Economy plugin API not available");
    return;
  }

  const economy = economyPlugin.api;

  ctx.registerCommand({
    data: new SlashCommandBuilder()
      .setName("buy")
      .setDescription("Buy an item")
      .addStringOption(opt => opt.setName("item").setDescription("Item to buy").setRequired(true)),

    async execute(interaction) {
      const item = interaction.options.getString("item", true);
      const price = 100; // Look up real price

      if (!economy.removeBalance(interaction.user.id, price)) {
        await interaction.reply({ content: "Not enough coins!", ephemeral: true });
        return;
      }

      // Give item...
      await interaction.reply(`You bought ${item} for ${price} coins!`);
    },
  });
}
```

---

## Logging

Each plugin gets a prefixed logger via `ctx.logger`:

```typescript
ctx.logger.info("Plugin started");          // 12:34:56 INFO  [my-plugin] Plugin started
ctx.logger.warn("Something weird");          // 12:34:56 WARN  [my-plugin] Something weird
ctx.logger.error("Something broke", error);  // 12:34:56 ERROR [my-plugin] Something broke
ctx.logger.debug("Verbose info");            // Only shown if DEBUG=true in .env
```

### Log Levels

| Method | When to use |
|--------|-------------|
| `info` | Normal operational messages (startup, shutdown, milestones) |
| `warn` | Something unexpected but recoverable |
| `error` | Something failed |
| `debug` | Verbose information for development (hidden by default) |

### Enabling Debug Logs

Set `DEBUG=true` in your `.env` file to see debug messages.

---

## Best Practices

### 1. Always Use the Database Prefix

```typescript
// Good
const table = `${ctx.dbPrefix}users`;

// Bad - will collide with other plugins
const table = "users";
```

### 2. Handle Missing Dependencies Gracefully

```typescript
const economy = ctx.getPlugin<EconomyAPI>("economy");
if (!economy) {
  ctx.logger.warn("Economy plugin not found, some features disabled");
  // Disable features that require economy
  return;
}
```

### 3. Use Ephemeral Replies for Errors

```typescript
if (!hasPermission) {
  await interaction.reply({
    content: "You don't have permission to do that!",
    ephemeral: true,
  });
  return;
}
```

### 4. Defer Long Operations

```typescript
async execute(interaction) {
  await interaction.deferReply();

  // If this takes > 3 seconds without deferring, Discord will show an error
  const result = await someLongOperation();

  await interaction.editReply(`Done: ${result}`);
}
```

### 5. Validate User Input

```typescript
const amount = interaction.options.getInteger("amount", true);

if (amount < 1 || amount > 1000) {
  await interaction.reply({
    content: "Amount must be between 1 and 1000",
    ephemeral: true,
  });
  return;
}
```

### 6. Use TypeScript Properly

```typescript
// Define your config type
type MyConfig = z.infer<typeof configSchema>;

// Use it in the context
async onLoad(ctx: PluginContext<MyConfig>) {
  // Full autocomplete and type checking
  ctx.config.someOption; // TypeScript knows the type
}
```

### 7. Keep Commands Focused

Each command should do one thing well. If you have `/settings view`, `/settings set`, `/settings reset`, use subcommands rather than separate commands.

### 8. Log Important Events

```typescript
async execute(interaction) {
  ctx.logger.info(`${interaction.user.tag} used /ban on ${target.tag}`);
  // ...
}
```

---

## Troubleshooting

### Commands Not Appearing

1. **Check for errors in console** - Syntax errors prevent the plugin from loading
2. **Wait for propagation** - Global commands take up to an hour. Use `GUILD_ID` in `.env` for instant updates during development
3. **Restart the bot** - Commands are registered on startup

### Type Errors with Imports

Make sure your import uses the path alias:

```typescript
// Correct
import type { Plugin, PluginContext, Command } from "@types";

// Wrong (might work but can cause issues)
import type { Plugin } from "../../src/types";
```

If your editor still shows errors, restart the TypeScript server.

### Database Errors

1. **Check table exists** - Ensure your `CREATE TABLE IF NOT EXISTS` runs before queries
2. **Check column names** - SQLite is case-sensitive for some operations
3. **Check the prefix** - Make sure you're using `ctx.dbPrefix`

### Plugin Not Loading

1. **Check file name** - Must be `plugin.ts` in the plugin folder
2. **Check default export** - Must `export default plugin`
3. **Check manifest** - Must have `name` and `version`
4. **Check dependencies** - Hard dependencies must exist

### Config Not Working

1. **Delete the config file** - Let it regenerate with correct defaults
2. **Check YAML syntax** - Invalid YAML falls back to defaults
3. **Check Zod schema** - Make sure defaults match the schema

---

## Complete Examples

### Leveling Plugin

A full example with database, config, and multiple commands:

```typescript
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Plugin, PluginContext, Command } from "@types";

const configSchema = z.object({
  xpPerMessage: z.number().default(15),
  xpCooldown: z.number().default(60),
  levelUpChannel: z.string().nullable().default(null),
});

type LevelConfig = z.infer<typeof configSchema>;

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "leveling",
    version: "1.0.0",
    description: "XP and leveling system",
  },

  config: {
    schema: configSchema,
    defaults: {
      xpPerMessage: 15,
      xpCooldown: 60,
      levelUpChannel: null,
    },
  },

  async onLoad(ctx: PluginContext<LevelConfig>) {
    const table = `${ctx.dbPrefix}levels`;

    // Initialize database
    ctx.db.run(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${table} (
        user_id TEXT PRIMARY KEY,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        last_xp_gain TEXT
      )
    `));

    // Track cooldowns in memory
    const cooldowns = new Map<string, number>();

    // XP gain on message
    ctx.registerEvent({
      name: "messageCreate",
      async execute(ctx, message) {
        if (message.author.bot) return;

        const userId = message.author.id;
        const now = Date.now();
        const lastGain = cooldowns.get(userId) ?? 0;

        if (now - lastGain < ctx.config.xpCooldown * 1000) return;

        cooldowns.set(userId, now);

        // Get or create user
        let user = ctx.db.get<{ xp: number; level: number }>(
          sql.raw(`SELECT xp, level FROM ${table} WHERE user_id = '${userId}'`)
        );

        if (!user) {
          ctx.db.run(sql.raw(`INSERT INTO ${table} (user_id) VALUES ('${userId}')`));
          user = { xp: 0, level: 1 };
        }

        const newXp = user.xp + ctx.config.xpPerMessage;
        const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;

        ctx.db.run(sql.raw(`
          UPDATE ${table} SET xp = ${newXp}, level = ${newLevel} WHERE user_id = '${userId}'
        `));

        // Level up notification
        if (newLevel > user.level) {
          const channelId = ctx.config.levelUpChannel ?? message.channelId;
          const channel = await ctx.client.channels.fetch(channelId);
          if (channel?.isTextBased()) {
            await channel.send(`🎉 ${message.author} reached level ${newLevel}!`);
          }
        }
      },
    });

    // Rank command
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("rank")
        .setDescription("Check your level and XP")
        .addUserOption(opt =>
          opt.setName("user").setDescription("User to check").setRequired(false)
        ),

      async execute(interaction) {
        const target = interaction.options.getUser("user") ?? interaction.user;

        const data = ctx.db.get<{ xp: number; level: number }>(
          sql.raw(`SELECT xp, level FROM ${table} WHERE user_id = '${target.id}'`)
        );

        if (!data) {
          await interaction.reply({
            content: `${target.username} hasn't earned any XP yet!`,
            ephemeral: true,
          });
          return;
        }

        const nextLevelXp = Math.pow(data.level, 2) * 100;
        const progress = Math.floor((data.xp / nextLevelXp) * 100);

        const embed = new EmbedBuilder()
          .setTitle(`${target.username}'s Rank`)
          .addFields(
            { name: "Level", value: data.level.toString(), inline: true },
            { name: "XP", value: `${data.xp}/${nextLevelXp}`, inline: true },
            { name: "Progress", value: `${progress}%`, inline: true }
          )
          .setColor(0x5865f2);

        await interaction.reply({ embeds: [embed] });
      },
    });

    // Leaderboard command
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("View the XP leaderboard"),

      async execute(interaction) {
        const top = ctx.db.all<{ user_id: string; xp: number; level: number }>(
          sql.raw(`SELECT user_id, xp, level FROM ${table} ORDER BY xp DESC LIMIT 10`)
        );

        if (!top || top.length === 0) {
          await interaction.reply("No one has earned XP yet!");
          return;
        }

        const lines = await Promise.all(
          top.map(async (row, i) => {
            const user = await ctx.client.users.fetch(row.user_id).catch(() => null);
            const name = user?.username ?? "Unknown";
            return `${i + 1}. **${name}** - Level ${row.level} (${row.xp} XP)`;
          })
        );

        const embed = new EmbedBuilder()
          .setTitle("🏆 XP Leaderboard")
          .setDescription(lines.join("\n"))
          .setColor(0xffd700);

        await interaction.reply({ embeds: [embed] });
      },
    });

    ctx.logger.info("Leveling plugin loaded!");
  },
};

export default plugin;
```

---

## API Reference

### Types

```typescript
// Import all types from @types
import type {
  Plugin,
  PluginManifest,
  PluginConfig,
  PluginContext,
  Command,
  Event,
  Logger,
  SlashCommandData,
  LoadedPlugin,
} from "@types";
```

### Discord.js Re-exports

The bot uses Discord.js v14. See the [Discord.js documentation](https://discord.js.org/) for:

- `SlashCommandBuilder` and options
- `EmbedBuilder` for rich embeds
- `ActionRowBuilder` and components (buttons, selects, modals)
- `PermissionFlagsBits` for permissions
- Event types and payloads

### Drizzle ORM

For database operations, see the [Drizzle documentation](https://orm.drizzle.team/docs/overview).

The bot uses `drizzle-orm/bun-sqlite` with Bun's native SQLite driver.

---

## Getting Help

- Check the console for error messages
- Enable debug logging with `DEBUG=true`
- Look at the example plugins in `plugins/ping` and `plugins/economy`
- Check Discord.js documentation for Discord-specific questions
