# CLAUDE.md - Discord Bot Framework

This document provides comprehensive context for Claude Code when working on this Discord bot framework. It covers architecture, conventions, common tasks, and implementation patterns.

---

## Project Overview

This is a **plugin-based Discord bot framework** built with:

- **Runtime**: Bun
- **Language**: TypeScript
- **Discord Library**: Discord.js v14
- **Database**: SQLite via Bun's native driver + Drizzle ORM
- **Configuration**: Zod schemas → auto-generated YAML files

The core framework handles Discord client management, plugin loading, command registration, and database initialization. Plugins extend functionality without modifying core code.

---

## Directory Structure

```
discord-bot/
├── src/
│   ├── core/                   # Framework internals
│   │   ├── bot.ts              # Main Bot class, command routing, event setup
│   │   ├── plugin-loader.ts    # Plugin discovery, dependency resolution, loading
│   │   ├── config.ts           # Zod→YAML config generation and loading
│   │   ├── database.ts         # SQLite initialization with Bun's native driver
│   │   ├── logger.ts           # Colored, prefixed console logger
│   │   └── index.ts            # Barrel exports
│   ├── types/
│   │   └── index.ts            # All TypeScript interfaces and types
│   └── index.ts                # Entry point (just creates and starts Bot)
├── plugins/                    # Plugin directory (auto-discovered)
│   ├── ping/
│   │   └── plugin.ts           # Example: simple ping command with config
│   └── economy/
│       └── plugin.ts           # Example: database usage, multiple commands
├── config/                     # Auto-generated YAML configs (one per plugin)
├── data/                       # SQLite database (bot.db)
├── docs/
│   └── PLUGIN_DEVELOPMENT.md   # Plugin development guide
├── .env                        # DISCORD_TOKEN, CLIENT_ID, GUILD_ID
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Key Files Reference

### `src/types/index.ts`

All type definitions. Key interfaces:

```typescript
// Plugin definition
interface Plugin<TConfig extends z.ZodType = z.ZodType> {
  manifest: PluginManifest;
  config?: PluginConfig<TConfig>;
  onLoad(ctx: PluginContext<z.infer<TConfig>>): Promise<void>;
  onUnload?(): Promise<void>;
}

// Plugin metadata
interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: {
    hard?: string[];   // Required - bot fails if missing
    soft?: string[];   // Optional - loaded first if present
  };
}

// Available to plugins during onLoad
interface PluginContext<TConfig = Record<string, unknown>> {
  client: Client;                    // Discord.js client
  logger: Logger;                    // Prefixed logger
  config: TConfig;                   // Validated config from YAML
  db: BunSQLiteDatabase;             // Drizzle database instance
  dbPrefix: string;                  // Table prefix (e.g., "economy_")
  registerCommand(command: Command): void;
  registerEvent<K extends keyof ClientEvents>(event: Event<K>): void;
  getPlugin<T = unknown>(name: string): T | undefined;
}

// Slash command definition
interface Command {
  data: SlashCommandData;
  execute: (interaction: ChatInputCommandInteraction, ctx: PluginContext) => Promise<void>;
}

// Event handler definition
interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (ctx: PluginContext, ...args: ClientEvents[K]) => Promise<void>;
}
```

### `src/core/bot.ts`

Main bot class. Responsibilities:
- Creates Discord client with intents
- Initializes database
- Creates PluginLoader and loads all plugins
- Collects commands from plugins into a Collection
- Sets up interaction handler for slash commands
- Registers commands with Discord API on ready
- Routes events to plugin handlers

### `src/core/plugin-loader.ts`

Plugin discovery and loading. Key methods:
- `discoverPlugins()`: Scans `plugins/` for `plugin.ts` files
- `resolveDependencies()`: Topological sort based on hard/soft deps
- `loadPlugin()`: Creates context, calls `onLoad()`, tracks commands/events
- `getAllCommands()`: Returns all registered commands
- `getAllEvents()`: Returns all registered events

### `src/core/config.ts`

Configuration management:
- `loadPluginConfig()`: Loads YAML, validates with Zod, merges with defaults
- Creates default YAML files if missing
- Falls back to defaults on validation errors

### `src/core/database.ts`

Database setup:
- `initDatabase()`: Creates SQLite database with WAL mode
- `prefixTable()`: Generates table prefix from plugin name

---

## Common Tasks

### Creating a New Plugin

1. Create directory: `plugins/my-plugin/`
2. Create `plugins/my-plugin/plugin.ts`:

```typescript
import { SlashCommandBuilder } from "discord.js";
import type { Plugin, PluginContext, Command } from "@types";

const plugin: Plugin = {
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "What this plugin does",
  },

  async onLoad(ctx: PluginContext) {
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("mycommand")
        .setDescription("Does something"),

      async execute(interaction) {
        await interaction.reply("Hello!");
      },
    });

    ctx.logger.info("Plugin loaded!");
  },
};

export default plugin;
```

### Adding Configuration to a Plugin

```typescript
import { z } from "zod";
import type { Plugin, PluginContext } from "@types";

const configSchema = z.object({
  option1: z.string().default("default"),
  option2: z.number().min(1).max(100).default(50),
  nested: z.object({
    enabled: z.boolean().default(true),
  }).default({}),
});

type MyConfig = z.infer<typeof configSchema>;

const plugin: Plugin<typeof configSchema> = {
  manifest: { name: "my-plugin", version: "1.0.0" },

  config: {
    schema: configSchema,
    defaults: {
      option1: "default",
      option2: 50,
      nested: { enabled: true },
    },
  },

  async onLoad(ctx: PluginContext<MyConfig>) {
    // Fully typed access
    console.log(ctx.config.option1);
    console.log(ctx.config.nested.enabled);
  },
};

export default plugin;
```

### Adding Database Tables

```typescript
import { sql } from "drizzle-orm";

async onLoad(ctx) {
  const tableName = `${ctx.dbPrefix}my_table`;

  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      data TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `));
}
```

### Database Queries

```typescript
import { sql } from "drizzle-orm";

// Get one row
const row = ctx.db.get<{ id: number; data: string }>(
  sql.raw(`SELECT * FROM ${tableName} WHERE id = ${id}`)
);

// Get multiple rows
const rows = ctx.db.all<{ id: number; data: string }>(
  sql.raw(`SELECT * FROM ${tableName} WHERE user_id = '${userId}'`)
);

// Insert
ctx.db.run(sql.raw(`INSERT INTO ${tableName} (user_id, data) VALUES ('${userId}', '${data}')`));

// Update
ctx.db.run(sql.raw(`UPDATE ${tableName} SET data = '${newData}' WHERE id = ${id}`));

// Delete
ctx.db.run(sql.raw(`DELETE FROM ${tableName} WHERE id = ${id}`));
```

### Adding Commands with Options

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Give coins to a user")
    .addUserOption(opt =>
      opt.setName("user").setDescription("Target user").setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount").setDescription("Amount to give").setRequired(true).setMinValue(1)
    )
    .addStringOption(opt =>
      opt.setName("reason").setDescription("Reason").setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason");

    await interaction.reply(`Gave ${amount} to ${user}${reason ? ` for ${reason}` : ""}`);
  },
});
```

### Adding Subcommands

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("wallet")
    .setDescription("Wallet commands")
    .addSubcommand(sub =>
      sub.setName("balance").setDescription("Check balance")
    )
    .addSubcommand(sub =>
      sub.setName("send").setDescription("Send coins")
        .addUserOption(opt => opt.setName("to").setDescription("Recipient").setRequired(true))
        .addIntegerOption(opt => opt.setName("amount").setDescription("Amount").setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "balance":
        await interaction.reply("Your balance: 100");
        break;
      case "send":
        const to = interaction.options.getUser("to", true);
        const amount = interaction.options.getInteger("amount", true);
        await interaction.reply(`Sent ${amount} to ${to}`);
        break;
    }
  },
});
```

### Adding Event Handlers

```typescript
// Message event
ctx.registerEvent({
  name: "messageCreate",
  async execute(ctx, message) {
    if (message.author.bot) return;
    if (message.content === "!hello") {
      await message.reply("Hi!");
    }
  },
});

// Member join event
ctx.registerEvent({
  name: "guildMemberAdd",
  async execute(ctx, member) {
    ctx.logger.info(`${member.user.tag} joined ${member.guild.name}`);
  },
});

// One-time event
ctx.registerEvent({
  name: "ready",
  once: true,
  async execute(ctx, client) {
    ctx.logger.info(`Bot ready as ${client.user.tag}`);
  },
});
```

### Cross-Plugin Communication

```typescript
// Accessing another plugin
const economy = ctx.getPlugin<{ api: EconomyAPI }>("economy");
if (economy?.api) {
  const balance = economy.api.getBalance(userId);
}

// Exposing an API from your plugin
const plugin: Plugin = {
  manifest: { name: "my-plugin", version: "1.0.0" },

  // Attach API to plugin object
  api: null as unknown as MyAPI,

  async onLoad(ctx) {
    const api: MyAPI = {
      doSomething() { /* ... */ },
    };
    (this as any).api = api;
  },
};
```

### Deferred Replies (Long Operations)

```typescript
async execute(interaction) {
  await interaction.deferReply(); // Tells Discord "working on it"

  const result = await someLongOperation(); // Can take up to 15 minutes now

  await interaction.editReply(`Result: ${result}`);
}
```

### Ephemeral Replies (Private)

```typescript
await interaction.reply({
  content: "Only you can see this!",
  ephemeral: true,
});
```

### Embeds

```typescript
import { EmbedBuilder } from "discord.js";

const embed = new EmbedBuilder()
  .setTitle("Title")
  .setDescription("Description")
  .setColor(0x5865f2)
  .addFields(
    { name: "Field 1", value: "Value 1", inline: true },
    { name: "Field 2", value: "Value 2", inline: true },
  )
  .setFooter({ text: "Footer text" })
  .setTimestamp();

await interaction.reply({ embeds: [embed] });
```

---

## Code Conventions

### Imports

```typescript
// Discord.js
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";

// Drizzle (for database)
import { sql } from "drizzle-orm";

// Zod (for config schemas)
import { z } from "zod";

// Internal types - always use the path alias
import type { Plugin, PluginContext, Command, Event } from "@types";
```

### Plugin File Structure

```typescript
// 1. Imports
import { SlashCommandBuilder } from "discord.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Plugin, PluginContext, Command } from "@types";

// 2. Config schema (if needed)
const configSchema = z.object({ /* ... */ });
type MyConfig = z.infer<typeof configSchema>;

// 3. Plugin definition
const plugin: Plugin<typeof configSchema> = {
  manifest: { /* ... */ },
  config: { /* ... */ },
  async onLoad(ctx) { /* ... */ },
};

// 4. Helper functions (command factories, utilities)
function myCommand(ctx: PluginContext<MyConfig>): Command {
  return { /* ... */ };
}

// 5. Default export
export default plugin;
```

### Naming Conventions

- **Plugin names**: lowercase, hyphenated (`my-plugin`)
- **Command names**: lowercase, no spaces (`mycommand`, `my-command`)
- **Table names**: use `ctx.dbPrefix` + lowercase (`${ctx.dbPrefix}users`)
- **Config keys**: camelCase (`maxRetries`, `enableFeature`)

### Error Handling

```typescript
async execute(interaction) {
  try {
    await riskyOperation();
    await interaction.reply("Success!");
  } catch (error) {
    ctx.logger.error("Operation failed:", error);
    await interaction.reply({
      content: "Something went wrong!",
      ephemeral: true,
    });
  }
}
```

---

## Database Patterns

### Repository Pattern

```typescript
// db/users.ts
export function createUserRepo(ctx: PluginContext) {
  const table = `${ctx.dbPrefix}users`;

  return {
    find(userId: string) {
      return ctx.db.get<User>(sql.raw(`SELECT * FROM ${table} WHERE user_id = '${userId}'`));
    },

    create(userId: string) {
      ctx.db.run(sql.raw(`INSERT INTO ${table} (user_id) VALUES ('${userId}')`));
    },

    update(userId: string, data: Partial<User>) {
      const sets = Object.entries(data)
        .map(([k, v]) => `${k} = '${v}'`)
        .join(", ");
      ctx.db.run(sql.raw(`UPDATE ${table} SET ${sets} WHERE user_id = '${userId}'`));
    },

    delete(userId: string) {
      ctx.db.run(sql.raw(`DELETE FROM ${table} WHERE user_id = '${userId}'`));
    },
  };
}

// Usage in plugin
const users = createUserRepo(ctx);
const user = users.find(interaction.user.id);
```

### Upsert Pattern

```typescript
ctx.db.run(sql.raw(`
  INSERT INTO ${table} (user_id, balance)
  VALUES ('${userId}', ${amount})
  ON CONFLICT(user_id) DO UPDATE SET balance = balance + ${amount}
`));
```

### Transaction-like Pattern

SQLite doesn't need explicit transactions for single statements, but for multiple:

```typescript
ctx.db.run(sql.raw(`BEGIN TRANSACTION`));
try {
  ctx.db.run(sql.raw(`UPDATE ${table1} SET ...`));
  ctx.db.run(sql.raw(`UPDATE ${table2} SET ...`));
  ctx.db.run(sql.raw(`COMMIT`));
} catch (error) {
  ctx.db.run(sql.raw(`ROLLBACK`));
  throw error;
}
```

---

## Discord.js Patterns

### Getting Response Latency

```typescript
const { resource } = await interaction.reply({
  content: "Pinging...",
  withResponse: true,
});

const latency = resource!.message!.createdTimestamp - interaction.createdTimestamp;
await interaction.editReply(`Pong! ${latency}ms`);
```

### Fetching Users/Members

```typescript
// Fetch user (works in DMs and guilds)
const user = await ctx.client.users.fetch(userId);

// Fetch guild member (only in guilds, has roles/nickname)
const member = await interaction.guild?.members.fetch(userId);
```

### Permission Checks

```typescript
// In command definition
data: new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Ban a user")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .setDMPermission(false),

// Manual check in execute
if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
  await interaction.reply({ content: "No permission!", ephemeral: true });
  return;
}
```

### Autocomplete

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("item")
    .setDescription("Select an item")
    .addStringOption(opt =>
      opt.setName("name").setDescription("Item name").setRequired(true).setAutocomplete(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString("name", true);
    await interaction.reply(`You selected: ${name}`);
  },
});

// Handle autocomplete in a separate event
ctx.registerEvent({
  name: "interactionCreate",
  async execute(ctx, interaction) {
    if (!interaction.isAutocomplete()) return;
    if (interaction.commandName !== "item") return;

    const focused = interaction.options.getFocused();
    const items = ["Apple", "Banana", "Cherry"].filter(i =>
      i.toLowerCase().includes(focused.toLowerCase())
    );

    await interaction.respond(
      items.slice(0, 25).map(item => ({ name: item, value: item }))
    );
  },
});
```

### Buttons and Components

```typescript
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// Send buttons
const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder()
    .setCustomId("accept")
    .setLabel("Accept")
    .setStyle(ButtonStyle.Success),
  new ButtonBuilder()
    .setCustomId("decline")
    .setLabel("Decline")
    .setStyle(ButtonStyle.Danger),
);

await interaction.reply({ content: "Choose:", components: [row] });

// Handle button clicks
ctx.registerEvent({
  name: "interactionCreate",
  async execute(ctx, interaction) {
    if (!interaction.isButton()) return;

    if (interaction.customId === "accept") {
      await interaction.update({ content: "Accepted!", components: [] });
    } else if (interaction.customId === "decline") {
      await interaction.update({ content: "Declined!", components: [] });
    }
  },
});
```

---

## Testing and Development

### Running the Bot

```bash
# Development (hot reload)
bun run dev

# Production
bun run start
```

### Environment Variables

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_client_id
GUILD_ID=test_guild_id          # Optional: for instant command updates
DEBUG=true                       # Optional: enable debug logging
```

### Debug Logging

```typescript
ctx.logger.debug("This only shows when DEBUG=true");
```

### Common Issues

1. **Commands not appearing**: Use `GUILD_ID` for instant updates during development. Global commands take up to an hour.

2. **Type errors on imports**: Use `import type { ... } from "@types"`, restart TS server if needed.

3. **Database errors**: Check table name uses `ctx.dbPrefix`, ensure table is created before queries.

4. **Plugin not loading**: Must have `plugin.ts` with default export, must have `manifest.name` and `manifest.version`.

---

## File Modification Guidelines

### When Modifying Core (`src/core/`)

- Be careful with `plugin-loader.ts` - affects all plugin loading
- Changes to `types/index.ts` may require plugin updates
- Test with multiple plugins to ensure compatibility

### When Creating Plugins

- Always use `@types` import alias
- Always prefix database tables with `ctx.dbPrefix`
- Always handle errors in command execution
- Use `ctx.logger` instead of `console.log`

### When Modifying Existing Plugins

- Check for database migrations if changing schema
- Update config defaults if changing config schema
- Test all commands after changes

---

## Quick Reference

### Slash Command Option Types

```typescript
.addStringOption(opt => ...)      // String input
.addIntegerOption(opt => ...)     // Integer input
.addNumberOption(opt => ...)      // Float input
.addBooleanOption(opt => ...)     // True/false
.addUserOption(opt => ...)        // User mention
.addChannelOption(opt => ...)     // Channel mention
.addRoleOption(opt => ...)        // Role mention
.addMentionableOption(opt => ...) // User or role
.addAttachmentOption(opt => ...)  // File upload
.addSubcommand(sub => ...)        // Subcommand
.addSubcommandGroup(group => ...) // Subcommand group
```

### Getting Option Values

```typescript
interaction.options.getString("name")           // string | null
interaction.options.getString("name", true)     // string (throws if missing)
interaction.options.getInteger("count")         // number | null
interaction.options.getBoolean("flag")          // boolean | null
interaction.options.getUser("target")           // User | null
interaction.options.getMember("target")         // GuildMember | null
interaction.options.getChannel("channel")       // Channel | null
interaction.options.getRole("role")             // Role | null
interaction.options.getAttachment("file")       // Attachment | null
interaction.options.getSubcommand()             // string
```

### Common Discord.js Events

```typescript
"messageCreate"       // Message sent
"messageDelete"       // Message deleted
"messageUpdate"       // Message edited
"guildMemberAdd"      // Member joined
"guildMemberRemove"   // Member left
"guildMemberUpdate"   // Member updated (roles, nickname)
"messageReactionAdd"  // Reaction added
"messageReactionRemove" // Reaction removed
"interactionCreate"   // Any interaction
"voiceStateUpdate"    // Voice channel changes
"ready"               // Bot connected
"guildCreate"         // Bot added to server
"guildDelete"         // Bot removed from server
```

### Logger Methods

```typescript
ctx.logger.info("Normal message");
ctx.logger.warn("Warning message");
ctx.logger.error("Error message", errorObject);
ctx.logger.debug("Debug message"); // Only with DEBUG=true
```

---

## Example: Full Plugin Template

```typescript
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Plugin, PluginContext, Command, Event } from "@types";

// ============ Configuration ============

const configSchema = z.object({
  enabled: z.boolean().default(true),
  maxItems: z.number().min(1).max(100).default(10),
});

type PluginConfig = z.infer<typeof configSchema>;

// ============ Database Types ============

interface DbItem {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
}

// ============ Plugin Definition ============

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "template",
    version: "1.0.0",
    description: "A template plugin",
    author: "Your Name",
    dependencies: {
      hard: [],
      soft: [],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      enabled: true,
      maxItems: 10,
    },
  },

  async onLoad(ctx: PluginContext<PluginConfig>) {
    if (!ctx.config.enabled) {
      ctx.logger.warn("Plugin is disabled in config");
      return;
    }

    // Initialize database
    await initDatabase(ctx);

    // Register commands
    ctx.registerCommand(listCommand(ctx));
    ctx.registerCommand(addCommand(ctx));

    // Register events
    ctx.registerEvent(readyEvent(ctx));

    ctx.logger.info("Template plugin loaded!");
  },

  async onUnload() {
    // Cleanup if needed
  },
};

// ============ Database ============

async function initDatabase(ctx: PluginContext<PluginConfig>) {
  const table = `${ctx.dbPrefix}items`;

  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `));

  ctx.logger.debug(`Initialized table: ${table}`);
}

function getItems(ctx: PluginContext<PluginConfig>, userId: string): DbItem[] {
  const table = `${ctx.dbPrefix}items`;
  return ctx.db.all<DbItem>(
    sql.raw(`SELECT * FROM ${table} WHERE user_id = '${userId}' ORDER BY created_at DESC`)
  ) ?? [];
}

function addItem(ctx: PluginContext<PluginConfig>, userId: string, name: string): void {
  const table = `${ctx.dbPrefix}items`;
  ctx.db.run(sql.raw(`INSERT INTO ${table} (user_id, name) VALUES ('${userId}', '${name}')`));
}

// ============ Commands ============

function listCommand(ctx: PluginContext<PluginConfig>): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("template-list")
      .setDescription("List your items"),

    async execute(interaction) {
      const items = getItems(ctx, interaction.user.id);

      if (items.length === 0) {
        await interaction.reply({
          content: "You have no items!",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("Your Items")
        .setDescription(items.map((i, idx) => `${idx + 1}. ${i.name}`).join("\n"))
        .setColor(0x5865f2);

      await interaction.reply({ embeds: [embed] });
    },
  };
}

function addCommand(ctx: PluginContext<PluginConfig>): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("template-add")
      .setDescription("Add an item")
      .addStringOption(opt =>
        opt.setName("name").setDescription("Item name").setRequired(true)
      ),

    async execute(interaction) {
      const name = interaction.options.getString("name", true);
      const items = getItems(ctx, interaction.user.id);

      if (items.length >= ctx.config.maxItems) {
        await interaction.reply({
          content: `You can only have ${ctx.config.maxItems} items!`,
          ephemeral: true,
        });
        return;
      }

      addItem(ctx, interaction.user.id, name);
      await interaction.reply(`Added item: ${name}`);
    },
  };
}

// ============ Events ============

function readyEvent(ctx: PluginContext<PluginConfig>): Event<"ready"> {
  return {
    name: "ready",
    once: true,
    async execute(ctx, client) {
      ctx.logger.info(`Template plugin ready on ${client.guilds.cache.size} guilds`);
    },
  };
}

// ============ Export ============

export default plugin;
```

---

## Notes for Claude

1. **Always use `@types` for imports** - The path alias is configured in tsconfig.json

2. **Database tables must be prefixed** - Use `${ctx.dbPrefix}tablename`

3. **Use factory pattern for commands** - Pass `ctx` to command functions for access to config/db/logger

4. **Discord.js v14 uses `withResponse` not `fetchReply`** - For getting the reply message

5. **Bun's native SQLite** - No need for better-sqlite3, use `bun:sqlite` via drizzle-orm/bun-sqlite

6. **Config files are YAML** - Generated in `config/` directory, one per plugin

7. **Commands auto-register on startup** - No manual registration needed, just `ctx.registerCommand()`

8. **Guild commands update instantly** - Set `GUILD_ID` in .env for development

9. **Global commands take up to an hour** - Don't use in development

10. **Plugins are loaded in dependency order** - Hard deps first, then soft deps, then the plugin
