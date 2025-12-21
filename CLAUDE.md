# CLAUDE.md - Navi Bot Framework

This document provides comprehensive context for Claude Code when working on Navi Bot, a Discord bot framework. It covers architecture, conventions, common tasks, and implementation patterns.

---

## Project Overview

This is a **plugin-based Discord bot framework** built with:

- **Runtime**: Bun
- **Language**: TypeScript
- **Discord Library**: Discord.js v14
- **Database**: MongoDB with native Node.js driver
- **Configuration**: Zod schemas → auto-generated YAML files

The core framework handles Discord client management, plugin loading, command registration, and database initialization. Plugins extend functionality without modifying core code.

---

## Directory Structure

```
navi-bot/
├── src/
│   ├── core/                   # Framework internals
│   │   ├── bot.ts              # Main Bot class, command routing, event setup
│   │   ├── plugin-loader.ts    # Plugin discovery, dependency resolution, loading
│   │   ├── config.ts           # Zod→YAML config generation and loading
│   │   ├── database.ts         # MongoDB connection and initialization
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
├── data/                       # Data directory (not used with MongoDB)
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
  db: Db;                            // MongoDB database instance
  dbPrefix: string;                  // Collection prefix (e.g., "economy_")
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
- `initDatabase()`: Connects to MongoDB with connection pooling
- `getDatabase()`: Returns MongoDB Db instance
- `prefixCollection()`: Generates collection prefix from plugin name

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

### Using MongoDB Collections

```typescript
import { Collection } from "mongodb";

async onLoad(ctx) {
  // Get or create collection (MongoDB creates collections automatically)
  const collection = ctx.db.collection(`${ctx.dbPrefix}my_collection`);

  // Create indexes for performance
  await collection.createIndex({ user_id: 1 }).catch(() => {});
}
```

### Database Queries

```typescript
import type { Collection, Document, ObjectId } from "mongodb";

// Get one document
const doc = await collection.findOne({ _id: new ObjectId(id) });

// Get multiple documents
const docs = await collection.find({ user_id: userId }).toArray();

// Insert
await collection.insertOne({
  user_id: userId,
  data: data,
  created_at: new Date()
});

// Update
await collection.updateOne(
  { _id: new ObjectId(id) },
  { $set: { data: newData } }
);

// Delete
await collection.deleteOne({ _id: new ObjectId(id) });
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
  name: "clientReady",
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

// MongoDB (for database)
import type { Collection, Document, ObjectId } from "mongodb";

// Zod (for config schemas)
import { z } from "zod";

// Internal types - always use the path alias
import type { Plugin, PluginContext, Command, Event } from "@types";
```

### Plugin File Structure

```typescript
// 1. Imports
import { SlashCommandBuilder } from "discord.js";
import type { Collection, Document, ObjectId } from "mongodb";
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

**IMPORTANT:** The framework provides a MongoDB abstraction layer that provides type safety and prevents common database issues. **Always use this abstraction instead of writing raw MongoDB queries.**

### Database Abstraction Architecture

The database layer consists of:
1. **Query Builder** (`src/core/query-builder.ts`) - SQL-like query API that converts to MongoDB filter objects
2. **Base Repository** (`src/core/repository.ts`) - Async CRUD operations with type safety
3. **Schema Validation** (`src/core/schema.ts`) - Runtime validation with Zod
4. **Database API** (via `core-utils`) - Factory methods for creating repositories and collections

All MongoDB queries use parameterized filter objects, preventing injection attacks.

### Repository Pattern (Recommended)

**Step 1: Define Repository Class**

```typescript
// db/repository.ts
import { Collection, Document, ObjectId, OptionalId } from "mongodb";
import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

export interface User extends Document {
  _id?: ObjectId;
  discord_id: string;
  balance: number;
  created_at: Date;
}

export class UserRepository extends BaseRepository<User> {
  constructor(collection: Collection<User>) {
    super(collection);
  }

  async findByDiscordId(discordId: string): Promise<User | null> {
    return await this.query()
      .where('discord_id', '=', discordId)
      .first();
  }

  async createUser(discordId: string, initialBalance: number = 0): Promise<string> {
    const result = await this.collection.insertOne({
      discord_id: discordId,
      balance: initialBalance,
      created_at: new Date(),
    } as OptionalId<User>);

    return result.insertedId.toString();
  }

  async getTopUsers(limit: number = 10): Promise<User[]> {
    return await this.query()
      .orderBy('balance', 'DESC')
      .limit(limit)
      .all();
  }
}
```

**Step 2: Create Factory Function**

```typescript
export function createUserRepo(ctx: PluginContext, api: CoreUtilsAPI): UserRepository {
  const collection = api.database.getCollection<User>(ctx, 'users');

  // Create indexes for performance
  collection.createIndex({ discord_id: 1 }, { unique: true }).catch(() => {});
  collection.createIndex({ balance: -1 }).catch(() => {});

  return new UserRepository(collection);
}

export async function initDatabase(ctx: PluginContext): Promise<void> {
  // MongoDB collections are auto-created, no initialization needed
  ctx.logger.debug("MongoDB auto-creates collections - no initialization needed");
}
```

**Step 3: Use in Plugin**

```typescript
// plugin.ts
import { initDatabase, createUserRepo } from "./db/repository";

async onLoad(ctx) {
  const api = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils").api;

  await initDatabase(ctx);
  const userRepo = createUserRepo(ctx, api);

  ctx.registerCommand({
    data: new SlashCommandBuilder()
      .setName("balance")
      .setDescription("Check your balance"),

    async execute(interaction) {
      let user = await userRepo.findByDiscordId(interaction.user.id);
      if (!user) {
        const id = await userRepo.createUser(interaction.user.id, 100);
        user = await userRepo.find(id)!;
      }
      await interaction.reply(`Your balance: ${user.balance} coins`);
    },
  });
}
```

### Query Builder Usage

The query builder provides method chaining for safe MongoDB queries (all methods return Promises):

```typescript
// Basic queries
const user = await userRepo.query()
  .where('discord_id', '=', userId)
  .first();

// Multiple conditions (AND)
const activeUsers = await userRepo.query()
  .where('balance', '>', 0)
  .where('created_at', '>', new Date('2025-01-01'))
  .all();

// OR conditions
const users = await userRepo.query()
  .where('balance', '>', 1000)
  .whereOr('level', '>', 50)
  .all();

// Ordering and limiting
const topUsers = await userRepo.query()
  .orderBy('balance', 'DESC')
  .limit(10)
  .all();

// Updates
await userRepo.query()
  .where('discord_id', '=', userId)
  .update({ balance: 500 })
  .execute();

// Deletes
await userRepo.query()
  .where('balance', '<', 0)
  .delete()
  .execute();

// Counting
const count = await userRepo.query()
  .where('balance', '>', 0)
  .count();
```

**Supported Operators:** `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`, `IN`, `NOT IN`, `IS`, `IS NOT`

### Base Repository Methods

All repositories have these built-in async methods:

```typescript
// Find by primary key (MongoDB ObjectId or string)
const user = await userRepo.find(userId);

// Create new record (returns string ID)
const id = await userRepo.create({ discord_id: '123', balance: 100, created_at: new Date() });

// Update existing record
const success = await userRepo.update(userId, { balance: 200 });

// Delete record
const deleted = await userRepo.delete(userId);

// Get all records
const allUsers = await userRepo.all();

// Get query builder (still chainable, but execute with await)
const query = userRepo.query();
```

### MongoDB Injection Prevention

**✅ SAFE - Query builder and filter objects:**
```typescript
// Query builder (always safe)
await userRepo.query().where('discord_id', '=', userId).first();

// Direct MongoDB filter (safe with proper objects)
await collection.findOne({ discord_id: userId });
```

**❌ UNSAFE - Building queries from strings (NEVER DO THIS):**
```typescript
// MongoDB injection vulnerability!
await collection.findOne({ discord_id: eval(userId) });
await collection.find({ $where: userInput }); // Never use $where with user input
```

The query builder converts SQL-like syntax to MongoDB filter objects automatically.

### Common Patterns

**Upsert:**
```typescript
// Insert if not exists (using $setOnInsert)
await collection.updateOne(
  { discord_id: discordId },
  {
    $setOnInsert: { discord_id: discordId, balance: 100, created_at: new Date() }
  },
  { upsert: true }
);

// Update or insert (replace entire document)
await collection.replaceOne(
  { discord_id: discordId },
  { discord_id: discordId, balance: balance, created_at: new Date() },
  { upsert: true }
);
```

**Transactions (MongoDB sessions):**
```typescript
const session = ctx.db.client.startSession();
try {
  await session.withTransaction(async () => {
    await userRepo.update(userId1, { balance: balance1 - amount });
    await userRepo.update(userId2, { balance: balance2 + amount });
  });
} finally {
  await session.endSession();
}
```

**Pagination:**
```typescript
const page = 0;
const pageSize = 10;

const users = await userRepo.query()
  .orderBy('balance', 'DESC')
  .limit(pageSize)
  .offset(page * pageSize)
  .all();
```

### MongoDB Best Practices

**Working with Dates:**
- Always use `Date` objects, not strings
- MongoDB stores dates as BSON Date type
- Example: `created_at: new Date()` not `created_at: new Date().toISOString()`

**Working with IDs:**
- MongoDB uses `ObjectId` for `_id` field
- Convert to string when returning to client: `result.insertedId.toString()`
- Accept both string and ObjectId in queries: `typeof id === 'string' ? new ObjectId(id) : id`

**Indexes:**
- Create indexes in factory function: `collection.createIndex({ field: 1 })`
- Use `.catch(() => {})` to prevent errors if index already exists
- Ascending: `1`, Descending: `-1`
- Unique: `{ unique: true }`

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
import type { Collection, Document, ObjectId } from "mongodb";
import { z } from "zod";
import type { Plugin, PluginContext, Command, Event } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";

// ============ Configuration ============

const configSchema = z.object({
  enabled: z.boolean().default(true),
  maxItems: z.number().min(1).max(100).default(10),
});

type PluginConfig = z.infer<typeof configSchema>;

// ============ Database Types ============

interface DbItem extends Document {
  _id?: ObjectId;
  user_id: string;
  name: string;
  created_at: Date;
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

    // Get core-utils API
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.error("core-utils plugin required");
      return;
    }
    const api = coreUtils.api;

    // Get MongoDB collection
    const collection = api.database.getCollection<DbItem>(ctx, 'items');

    // Create index for performance
    collection.createIndex({ user_id: 1 }).catch(() => {});

    // Register commands
    ctx.registerCommand(listCommand(ctx, collection));
    ctx.registerCommand(addCommand(ctx, collection));

    // Register events
    ctx.registerEvent(readyEvent(ctx));

    ctx.logger.info("Template plugin loaded!");
  },

  async onUnload() {
    // Cleanup if needed
  },
};

// ============ Database ============

async function getItems(collection: Collection<DbItem>, userId: string): Promise<DbItem[]> {
  return await collection.find({ user_id: userId })
    .sort({ created_at: -1 })
    .toArray();
}

async function addItem(collection: Collection<DbItem>, userId: string, name: string): Promise<void> {
  await collection.insertOne({
    user_id: userId,
    name,
    created_at: new Date(),
  });
}

// ============ Commands ============

function listCommand(ctx: PluginContext<PluginConfig>, collection: Collection<DbItem>): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("template-list")
      .setDescription("List your items"),

    async execute(interaction) {
      const items = await getItems(collection, interaction.user.id);

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

function addCommand(ctx: PluginContext<PluginConfig>, collection: Collection<DbItem>): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("template-add")
      .setDescription("Add an item")
      .addStringOption(opt =>
        opt.setName("name").setDescription("Item name").setRequired(true)
      ),

    async execute(interaction) {
      const name = interaction.options.getString("name", true);
      const items = await getItems(collection, interaction.user.id);

      if (items.length >= ctx.config.maxItems) {
        await interaction.reply({
          content: `You can only have ${ctx.config.maxItems} items!`,
          ephemeral: true,
        });
        return;
      }

      await addItem(collection, interaction.user.id, name);
      await interaction.reply(`Added item: ${name}`);
    },
  };
}

// ============ Events ============

function readyEvent(ctx: PluginContext<PluginConfig>): Event<"ready"> {
  return {
    name: "clientReady",
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

5. **MongoDB with async/await** - All database operations return Promises, always use `await`

6. **Config files are YAML** - Generated in `config/` directory, one per plugin

7. **Commands auto-register on startup** - No manual registration needed, just `ctx.registerCommand()`

8. **Guild commands update instantly** - Set `GUILD_ID` in .env for development

9. **Global commands take up to an hour** - Don't use in development

10. **Plugins are loaded in dependency order** - Hard deps first, then soft deps, then the plugin
