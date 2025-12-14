# Plugin Development Guide

This guide covers everything you need to know to develop plugins for this Discord bot framework.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Using Core Utilities](#using-core-utilities)
3. [Plugin Structure](#plugin-structure)
4. [Commands](#commands)
5. [Events](#events)
6. [Configuration](#configuration)
7. [Database](#database)
8. [Cross-Plugin Communication](#cross-plugin-communication)
9. [Best Practices](#best-practices)

---

## Getting Started

### Minimal Plugin

Create a new directory in `plugins/` with a `plugin.ts` file:

```typescript
import { SlashCommandBuilder } from "discord.js";
import type { Plugin, PluginContext } from "@types";

const plugin: Plugin = {
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    description: "What this plugin does",
  },

  async onLoad(ctx: PluginContext) {
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("hello")
        .setDescription("Say hello"),

      async execute(interaction) {
        await interaction.reply("Hello!");
      },
    });

    ctx.logger.info("Plugin loaded!");
  },
};

export default plugin;
```

---

## Using Core Utilities

The `core-utils` plugin provides helpers that nearly every plugin needs. **Always declare it as a soft dependency** so your plugin works even if core-utils isn't installed.

### Setup

```typescript
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";

const plugin: Plugin = {
  manifest: {
    name: "my-plugin",
    version: "1.0.0",
    dependencies: {
      soft: ["core-utils"], // Optional dependency
    },
  },

  async onLoad(ctx: PluginContext) {
    // Get core-utils API
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");

    if (!coreUtils?.api) {
      ctx.logger.warn("core-utils not available, some features disabled");
      // Continue without core-utils or return early
    }

    const api = coreUtils.api;
    // Now you can use api.permissions, api.embeds, api.paginate, api.confirm
  },
};
```

### Permission Helpers

Check user permissions easily without dealing with Discord.js permission bitfields.

#### Server-Wide Permissions

```typescript
const api = coreUtils.api;

// Check single permission
if (api.permissions.hasPermission(interaction.member, "BanMembers")) {
  // User can ban members
}

// Check if user has ANY of these permissions
if (api.permissions.hasAnyPermission(interaction.member, ["BanMembers", "KickMembers"])) {
  // User is a moderator
}

// Check if user has ALL of these permissions
if (api.permissions.hasAllPermissions(interaction.member, ["ManageGuild", "Administrator"])) {
  // User is an admin
}

// Check role membership
if (api.permissions.hasRole(interaction.member, roleId)) {
  // User has this role
}

// Check if server owner
if (api.permissions.isServerOwner(interaction.member)) {
  // User owns the server
}
```

#### Channel-Specific Permissions

Use these when you need to check permissions in a specific channel (includes permission overwrites).

```typescript
// Check if user can send messages in a channel
if (api.permissions.hasPermissionIn(interaction.member, channel, "SendMessages")) {
  // User can send messages here
}

// Check if user has any of these permissions in the channel
if (api.permissions.hasAnyPermissionIn(interaction.member, channel, ["SendMessages", "EmbedLinks"])) {
  // User can communicate
}

// Check if user has all permissions in the channel
if (api.permissions.hasAllPermissionsIn(interaction.member, channel, ["ManageMessages", "ManageThreads"])) {
  // User can moderate this channel
}
```

**When to use channel-specific helpers:**
- Checking if a user can perform actions in a specific channel
- Respecting channel permission overwrites
- Commands that target specific channels

### Embed Helpers

Create consistent, styled embeds across all plugins.

```typescript
const api = coreUtils.api;

// Create a success embed
const embed = api.embeds.success("Operation completed!", "Success");
await interaction.reply({ embeds: [embed] });

// Create an error embed
const embed = api.embeds.error("Something went wrong!", "Error");
await interaction.reply({ embeds: [embed] });

// Create a warning embed
const embed = api.embeds.warning("Are you sure?", "Warning");
await interaction.reply({ embeds: [embed] });

// Create an info embed
const embed = api.embeds.info("Here's some information", "Info");
await interaction.reply({ embeds: [embed] });

// Create a primary embed (default color)
const embed = api.embeds.primary("Generic message", "Title");
await interaction.reply({ embeds: [embed] });

// Create a blank embed and customize it
const embed = api.embeds.create()
  .setTitle("Custom")
  .setDescription("Fully customized")
  .addFields({ name: "Field", value: "Value" });
await interaction.reply({ embeds: [embed] });
```

All embeds automatically include:
- Configured footer (if set in `config/core-utils.yaml`)
- Timestamp (if enabled in config)
- Consistent colors (configurable)

### Pagination

Display long lists with interactive navigation buttons.

```typescript
const api = coreUtils.api;

// Example: Paginate a list of items
const items = ["Item 1", "Item 2", "Item 3", /* ... many items ... */];

await api.paginate(interaction, {
  items,
  formatPage: (pageItems, page, totalPages) => {
    // Return an embed for each page
    return api.embeds.info(
      pageItems.join("\n"),
      `Items (Page ${page + 1}/${totalPages})`
    );
  },
  itemsPerPage: 10, // Optional, defaults to config value
  timeout: 120000,  // Optional, defaults to config value
});
```

Features:
- ⏮ ◀ ▶ ⏭ navigation buttons
- Auto-disables on single page
- Only original user can navigate
- Auto-cleanup after timeout
- Buttons disable when timeout expires

### Component / Button Helpers

Create consistent action rows and buttons using core-utils helpers.

```typescript
const api = coreUtils.api;

const row = api.components.actionRow([
  { customId: "confirm", label: "Confirm", style: 3 }, // ButtonStyle.Success
  { customId: "cancel", label: "Cancel", style: 4 }, // ButtonStyle.Danger
]);

await interaction.reply({ content: "Confirm action?", components: [row] });
```

You can pass either `ButtonBuilder` instances or simple descriptors to `actionRow`.

```typescript
// Select menu example
const menu = api.components.selectMenu({
  customId: "select:example",
  placeholder: "Pick an option",
  options: [
    { label: "Option 1", value: "opt1", description: "The first option" },
    { label: "Option 2", value: "opt2", description: "The second option" },
  ],
});

await interaction.reply({ content: "Choose", components: [api.components.actionRow([menu])] });
```

```typescript
// Modal example
const modal = api.components.modal({
  customId: "report_issue",
  title: "Report an issue",
  components: [
    { customId: "issue_title", label: "Issue Title", style: "short", placeholder: "What's the issue?" },
    { customId: "issue_details", label: "Details", style: "paragraph", placeholder: "Details about the issue" },
  ],
});

await interaction.showModal(modal);
```

```typescript
// Link button
const linkRow = api.components.actionRow([
  { label: "Open Website", url: "https://example.com", style: "link" },
]);
await interaction.reply({ content: "Open link:", components: [linkRow] });

// User / Role / Mentionable select
const userSelectRow = api.components.actionRow([
  api.components.userSelect({ customId: "select:user", placeholder: "Choose a user" }),
]);
await interaction.reply({ content: "Select a user", components: [userSelectRow] });

<!-- DSL example -->
```typescript
// Define a group once in onLoad
api.components.define(ctx, {
  id: "choose-class",
  scope: "message",
  components: [
    { customId: "warrior", label: "Warrior", style: "primary" },
    { customId: "mage", label: "Mage", style: "primary" },
  ],
  handler: async (pluginCtx, interaction, meta) => {
    // meta.componentId will be 'warrior' or 'mage'
    await interaction.reply({ content: `You chose ${meta.componentId}` });
  }
});

// Send the UI in a command and auto-hook a message-scoped collector
await api.components.sendWithHandlers(ctx, interaction, {
  groupId: "choose-class",
  embeds: [api.embeds.primary("Choose a class")],
  ephemeral: true,
});
```
```

```typescript
// Disable components on an existing action row (useful after an interaction completes)
const row = api.components.actionRow([
  { customId: 'rpg_choose_warrior', label: 'Warrior', style: 'primary' },
  { customId: 'rpg_choose_mage', label: 'Mage', style: 'primary' }
]);
const [disabledRow] = api.components.disableAll(row);
await interaction.update({ components: [disabledRow] });
```

**Advanced pagination:**

```typescript
// Paginate database results
const users = getAllUsers();

await api.paginate(interaction, {
  items: users,
  formatPage: (pageUsers, page, totalPages) => {
    const description = pageUsers
      .map((user, i) => `${page * 10 + i + 1}. <@${user.id}> - ${user.balance} coins`)
      .join("\n");

    return api.embeds.primary(description, "Leaderboard")
      .setFooter({ text: `Page ${page + 1}/${totalPages} • ${users.length} total users` });
  },
  itemsPerPage: 10,
  startPage: 0, // Optional: start on a specific page
});
```

### Confirmation Dialogs

Prompt users to confirm destructive actions.

```typescript
const api = coreUtils.api;

// Simple confirmation
const confirmed = await api.confirm(interaction, "Are you sure you want to delete this?");

if (confirmed) {
  // User clicked "Confirm"
  await deleteItem();
  await interaction.followUp({ embeds: [api.embeds.success("Item deleted!")] });
} else {
  // User clicked "Cancel" or timeout
  await interaction.followUp({ embeds: [api.embeds.info("Cancelled")] });
}

// Advanced confirmation with custom options
const confirmed = await api.confirm(interaction, {
  message: "This will permanently delete your account and all data!",
  title: "⚠️ Danger Zone",
  confirmLabel: "Yes, delete everything",
  cancelLabel: "Cancel",
  timeout: 30000, // 30 seconds
});
```

Features:
- Returns `true` if confirmed, `false` if cancelled or timeout
- Only original user can respond
- Auto-cleanup after timeout
- Customizable button labels

---

## Plugin Structure

### File Organization

```
plugins/my-plugin/
├── plugin.ts           # Main plugin file (required)
├── commands/          # Optional: separate command files
│   ├── command1.ts
│   └── command2.ts
├── events/            # Optional: separate event files
│   └── ready.ts
└── db/                # Optional: database utilities
    └── repository.ts
```

### Plugin Interface

```typescript
interface Plugin<TConfig extends z.ZodType = z.ZodType> {
  manifest: PluginManifest;
  config?: PluginConfig<TConfig>;
  onLoad(ctx: PluginContext<z.infer<TConfig>>): Promise<void>;
  onUnload?(): Promise<void>;
}
```

### Manifest

```typescript
manifest: {
  name: "my-plugin",              // Lowercase, hyphenated
  version: "1.0.0",              // Semver
  description: "What it does",   // Optional
  author: "Your Name",           // Optional
  dependencies: {
    hard: ["required-plugin"],   // Bot fails if missing
    soft: ["optional-plugin"],   // Loaded first if present
  },
}
```

**Dependency Types:**
- **Hard dependencies**: Required for plugin to work. Bot fails to start if missing.
- **Soft dependencies**: Optional but preferred. Loaded before your plugin if present.

---

## Commands

### Basic Command

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check bot latency"),

  async execute(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply(`Pong! ${latency}ms`);
  },
});
```

### Command with Options

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("give")
    .setDescription("Give coins to a user")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("User to give coins to")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("Amount of coins")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(1000)
    )
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("Reason for giving coins")
        .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason");

    // Your logic here
    await interaction.reply(`Gave ${amount} coins to ${user}!`);
  },
});
```

### Command with Subcommands

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("wallet")
    .setDescription("Manage your wallet")
    .addSubcommand(sub =>
      sub.setName("balance")
        .setDescription("Check your balance")
    )
    .addSubcommand(sub =>
      sub.setName("send")
        .setDescription("Send coins to someone")
        .addUserOption(opt => opt.setName("to").setDescription("Recipient").setRequired(true))
        .addIntegerOption(opt => opt.setName("amount").setDescription("Amount").setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "balance":
        await interaction.reply("Your balance: 100 coins");
        break;

      case "send":
        const to = interaction.options.getUser("to", true);
        const amount = interaction.options.getInteger("amount", true);
        await interaction.reply(`Sent ${amount} coins to ${to}`);
        break;
    }
  },
});
```

### Permission-Restricted Commands

```typescript
import { PermissionFlagsBits } from "discord.js";

ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers) // Discord's built-in check
    .setDMPermission(false) // Can't be used in DMs
    .addUserOption(opt =>
      opt.setName("user").setDescription("User to ban").setRequired(true)
    ),

  async execute(interaction) {
    const api = coreUtils.api;

    // Additional runtime check
    if (!api.permissions.hasPermission(interaction.member, "BanMembers")) {
      await interaction.reply({
        embeds: [api.embeds.error("You don't have permission to ban members!")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Confirm before banning
    const confirmed = await api.confirm(interaction, {
      message: "Are you sure you want to ban this user?",
      title: "Confirm Ban",
    });

    if (!confirmed) {
      await interaction.followUp({ embeds: [api.embeds.info("Ban cancelled")] });
      return;
    }

    // Perform ban
    const user = interaction.options.getUser("user", true);
    await interaction.guild?.members.ban(user);
    await interaction.followUp({ embeds: [api.embeds.success(`Banned ${user}`)] });
  },
});
```

### Deferred Replies

For operations that take more than 3 seconds:

```typescript
async execute(interaction) {
  // Tell Discord we're working on it
  await interaction.deferReply();

  // Do long operation (up to 15 minutes)
  const result = await longDatabaseQuery();

  // Respond when done
  await interaction.editReply(`Result: ${result}`);
}

// Deferred ephemeral reply
await interaction.deferReply({ flags: MessageFlags.Ephemeral });
```

---

## Events

### Basic Event

```typescript
ctx.registerEvent({
  name: "messageCreate",
  async execute(ctx, message) {
    if (message.author.bot) return;

    if (message.content === "!hello") {
      await message.reply("Hi!");
    }
  },
});
```

### One-Time Events

```typescript
ctx.registerEvent({
  name: "ready",
  once: true, // Only fires once
  async execute(ctx, client) {
    ctx.logger.info(`Bot ready as ${client.user.tag}`);
  },
});
```

### Common Events

```typescript
// Member joins
ctx.registerEvent({
  name: "guildMemberAdd",
  async execute(ctx, member) {
    ctx.logger.info(`${member.user.tag} joined ${member.guild.name}`);
    // Send welcome message, assign roles, etc.
  },
});

// Message deleted
ctx.registerEvent({
  name: "messageDelete",
  async execute(ctx, message) {
    ctx.logger.info(`Message deleted: ${message.content}`);
  },
});

// Voice state update
ctx.registerEvent({
  name: "voiceStateUpdate",
  async execute(ctx, oldState, newState) {
    if (!oldState.channel && newState.channel) {
      // User joined voice channel
    }
  },
});
```

---

## Configuration

### Defining Config Schema

```typescript
import { z } from "zod";

const configSchema = z.object({
  maxItems: z.number().min(1).max(100).default(10),
  enableFeature: z.boolean().default(true),
  apiKey: z.string().optional(),
  nested: z.object({
    timeout: z.number().default(5000),
  }).default({}),
});

type MyConfig = z.infer<typeof configSchema>;

const plugin: Plugin<typeof configSchema> = {
  manifest: { /* ... */ },

  config: {
    schema: configSchema,
    defaults: {
      maxItems: 10,
      enableFeature: true,
      nested: { timeout: 5000 },
    },
  },

  async onLoad(ctx: PluginContext<MyConfig>) {
    // Fully typed access to config
    console.log(ctx.config.maxItems);      // number
    console.log(ctx.config.enableFeature); // boolean
    console.log(ctx.config.nested.timeout); // number
  },
};
```

### Config File

Config files are auto-generated in `config/my-plugin.yaml`:

```yaml
maxItems: 10
enableFeature: true
nested:
  timeout: 5000
```

Users can edit these files to configure your plugin. Changes require bot restart.

---

## Database

### Creating Tables

```typescript
import { sql } from "drizzle-orm";

async onLoad(ctx) {
  const tableName = `${ctx.dbPrefix}users`; // e.g., "myplugin_users"

  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      balance INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `));
}
```

**Important:** Always use `ctx.dbPrefix` to avoid table name conflicts between plugins.

### Queries

```typescript
import { sql } from "drizzle-orm";

const tableName = `${ctx.dbPrefix}users`;

// Get one row
const user = ctx.db.get<{ id: number; user_id: string; balance: number }>(
  sql.raw(`SELECT * FROM ${tableName} WHERE user_id = '${userId}'`)
);

// Get multiple rows
const users = ctx.db.all<{ id: number; user_id: string; balance: number }>(
  sql.raw(`SELECT * FROM ${tableName} ORDER BY balance DESC LIMIT 10`)
);

// Insert
ctx.db.run(sql.raw(`
  INSERT INTO ${tableName} (user_id, balance)
  VALUES ('${userId}', ${balance})
`));

// Update
ctx.db.run(sql.raw(`
  UPDATE ${tableName}
  SET balance = ${newBalance}
  WHERE user_id = '${userId}'
`));

// Delete
ctx.db.run(sql.raw(`
  DELETE FROM ${tableName}
  WHERE user_id = '${userId}'
`));

// Upsert
ctx.db.run(sql.raw(`
  INSERT INTO ${tableName} (user_id, balance)
  VALUES ('${userId}', ${amount})
  ON CONFLICT(user_id) DO UPDATE SET balance = balance + ${amount}
`));
```

### Repository Pattern

Organize database operations in separate modules:

```typescript
// db/users.ts
import { sql } from "drizzle-orm";
import type { PluginContext } from "@types";

interface User {
  id: number;
  user_id: string;
  balance: number;
  created_at: string;
}

export function createUserRepo(ctx: PluginContext) {
  const table = `${ctx.dbPrefix}users`;

  return {
    find(userId: string): User | null {
      return ctx.db.get<User>(
        sql.raw(`SELECT * FROM ${table} WHERE user_id = '${userId}'`)
      ) ?? null;
    },

    create(userId: string, balance: number = 0): void {
      ctx.db.run(sql.raw(`
        INSERT INTO ${table} (user_id, balance)
        VALUES ('${userId}', ${balance})
      `));
    },

    updateBalance(userId: string, newBalance: number): void {
      ctx.db.run(sql.raw(`
        UPDATE ${table}
        SET balance = ${newBalance}
        WHERE user_id = '${userId}'
      `));
    },

    getTop(limit: number = 10): User[] {
      return ctx.db.all<User>(
        sql.raw(`SELECT * FROM ${table} ORDER BY balance DESC LIMIT ${limit}`)
      ) ?? [];
    },

    findOrCreate(userId: string, defaultBalance: number = 0): User {
      let user = this.find(userId);
      if (!user) {
        this.create(userId, defaultBalance);
        user = this.find(userId)!;
      }
      return user;
    },
  };
}
```

Usage in plugin:

```typescript
import { createUserRepo } from "./db/users";

async onLoad(ctx) {
  const users = createUserRepo(ctx);

  ctx.registerCommand({
    data: new SlashCommandBuilder()
      .setName("balance")
      .setDescription("Check your balance"),

    async execute(interaction) {
      const user = users.findOrCreate(interaction.user.id, 100);
      await interaction.reply(`Your balance: ${user.balance} coins`);
    },
  });
}
```

---

## Cross-Plugin Communication

Plugins can expose APIs for other plugins to use.

### Exposing an API

```typescript
// Define your API interface
export interface MyPluginAPI {
  doSomething(input: string): Promise<string>;
  getData(): number;
}

const plugin: Plugin = {
  manifest: { name: "my-plugin", version: "1.0.0" },

  // Add API property
  api: null as unknown as MyPluginAPI,

  async onLoad(ctx) {
    // Create the API
    const api: MyPluginAPI = {
      async doSomething(input: string) {
        return `Processed: ${input}`;
      },

      getData() {
        return 42;
      },
    };

    // Expose it
    (this as any).api = api;
  },
};

export default plugin;
```

### Consuming an API

```typescript
import type { MyPluginAPI } from "../my-plugin/plugin";

const plugin: Plugin = {
  manifest: {
    name: "consumer-plugin",
    version: "1.0.0",
    dependencies: {
      soft: ["my-plugin"], // Declare dependency
    },
  },

  async onLoad(ctx) {
    // Get the other plugin
    const myPlugin = ctx.getPlugin<{ api: MyPluginAPI }>("my-plugin");

    if (!myPlugin?.api) {
      ctx.logger.warn("my-plugin not available");
      return;
    }

    // Use the API
    const result = await myPlugin.api.doSomething("test");
    const data = myPlugin.api.getData();
  },
};
```

---

## Best Practices

### 1. Always Use Core Utils

```typescript
// ✅ Good
const api = coreUtils.api;
const confirmed = await api.confirm(interaction, "Are you sure?");

// ❌ Bad - reimplementing confirmation logic
const row = new ActionRowBuilder()...
```

### 2. Declare Core Utils as Soft Dependency

```typescript
dependencies: {
  soft: ["core-utils"], // Not hard - plugin should work without it
}
```

### 3. Handle Missing Core Utils Gracefully

```typescript
const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");

if (!coreUtils?.api) {
  // Fall back to basic functionality or disable features
  ctx.logger.warn("core-utils not available, using fallbacks");
}
```

### 4. Use Permission Helpers

```typescript
// ✅ Good
if (api.permissions.hasPermission(member, "BanMembers")) { /* ... */ }

// ❌ Bad - manual permission checking
if (member.permissions.has(PermissionFlagsBits.BanMembers)) { /* ... */ }
```

### 5. Consistent Error Handling

```typescript
async execute(interaction) {
  try {
    // Your logic
    await doSomething();
    await interaction.reply({ embeds: [api.embeds.success("Done!")] });
  } catch (error) {
    ctx.logger.error("Command failed:", error);
    await interaction.reply({
      embeds: [api.embeds.error("Something went wrong!")],
      flags: MessageFlags.Ephemeral,
    });
  }
}
```

### 6. Use Logger, Not Console

```typescript
// ✅ Good
ctx.logger.info("User joined");
ctx.logger.warn("Config missing, using defaults");
ctx.logger.error("Failed to load data", error);

// ❌ Bad
console.log("User joined");
```

### 7. Prefix Database Tables

```typescript
// ✅ Good
const table = `${ctx.dbPrefix}users`;

// ❌ Bad - will conflict with other plugins
const table = "users";
```

### 8. Validate User Input

```typescript
const amount = interaction.options.getInteger("amount", true);

if (amount < 1 || amount > 1000) {
  await interaction.reply({
    embeds: [api.embeds.error("Amount must be between 1 and 1000!")],
    flags: MessageFlags.Ephemeral,
  });
  return;
}
```

### 9. Use Ephemeral for Error Messages

```typescript
import { MessageFlags } from "discord.js";

await interaction.reply({
  embeds: [api.embeds.error("Invalid input!")],
  flags: MessageFlags.Ephemeral, // Only visible to user
});
```

### 10. Confirm Destructive Actions

```typescript
const confirmed = await api.confirm(interaction, {
  message: "This will delete all your data. Are you sure?",
  title: "⚠️ Warning",
});

if (!confirmed) {
  await interaction.followUp({ embeds: [api.embeds.info("Cancelled")] });
  return;
}

// Proceed with deletion
```

---

## Complete Example Plugin

```typescript
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Plugin, PluginContext } from "@types";
import type { CoreUtilsAPI } from "../core-utils/plugin";

// Config schema
const configSchema = z.object({
  itemLimit: z.number().min(1).max(100).default(20),
});

type Config = z.infer<typeof configSchema>;

// Database types
interface Item {
  id: number;
  user_id: string;
  name: string;
  created_at: string;
}

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "items",
    version: "1.0.0",
    description: "Manage user items",
    dependencies: {
      soft: ["core-utils"],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      itemLimit: 20,
    },
  },

  async onLoad(ctx: PluginContext<Config>) {
    // Get core utils
    const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
    if (!coreUtils?.api) {
      ctx.logger.warn("core-utils not available");
      return;
    }
    const api = coreUtils.api;

    // Initialize database
    const table = `${ctx.dbPrefix}items`;
    ctx.db.run(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `));

    // List items command
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("items")
        .setDescription("List your items"),

      async execute(interaction) {
        const items = ctx.db.all<Item>(
          sql.raw(`SELECT * FROM ${table} WHERE user_id = '${interaction.user.id}' ORDER BY created_at DESC`)
        ) ?? [];

        if (items.length === 0) {
          await interaction.reply({
            embeds: [api.embeds.info("You have no items yet!")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        await api.paginate(interaction, {
          items,
          formatPage: (pageItems, page, totalPages) => {
            const description = pageItems
              .map((item, i) => `${i + 1}. ${item.name}`)
              .join("\n");

            return api.embeds.primary(description, "Your Items")
              .setFooter({ text: `Page ${page + 1}/${totalPages} • ${items.length} total items` });
          },
          itemsPerPage: 10,
        });
      },
    });

    // Add item command
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("add-item")
        .setDescription("Add a new item")
        .addStringOption(opt =>
          opt.setName("name")
            .setDescription("Item name")
            .setRequired(true)
            .setMaxLength(50)
        ),

      async execute(interaction) {
        const name = interaction.options.getString("name", true);

        // Check item limit
        const count = ctx.db.get<{ count: number }>(
          sql.raw(`SELECT COUNT(*) as count FROM ${table} WHERE user_id = '${interaction.user.id}'`)
        )?.count ?? 0;

        if (count >= ctx.config.itemLimit) {
          await interaction.reply({
            embeds: [api.embeds.error(`You can only have ${ctx.config.itemLimit} items!`)],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Add item
        ctx.db.run(sql.raw(`
          INSERT INTO ${table} (user_id, name)
          VALUES ('${interaction.user.id}', '${name.replace(/'/g, "''")}')
        `));

        await interaction.reply({
          embeds: [api.embeds.success(`Added item: **${name}**`)],
        });
      },
    });

    // Delete item command
    ctx.registerCommand({
      data: new SlashCommandBuilder()
        .setName("delete-item")
        .setDescription("Delete an item")
        .addStringOption(opt =>
          opt.setName("name")
            .setDescription("Item name")
            .setRequired(true)
        ),

      async execute(interaction) {
        const name = interaction.options.getString("name", true);

        // Check if item exists
        const item = ctx.db.get<Item>(
          sql.raw(`SELECT * FROM ${table} WHERE user_id = '${interaction.user.id}' AND name = '${name.replace(/'/g, "''")}'`)
        );

        if (!item) {
          await interaction.reply({
            embeds: [api.embeds.error("Item not found!")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        // Confirm deletion
        const confirmed = await api.confirm(interaction, {
          message: `Delete **${name}**?`,
          title: "Confirm Deletion",
        });

        if (!confirmed) {
          await interaction.followUp({
            embeds: [api.embeds.info("Deletion cancelled")],
          });
          return;
        }

        // Delete item
        ctx.db.run(sql.raw(`
          DELETE FROM ${table}
          WHERE id = ${item.id}
        `));

        await interaction.followUp({
          embeds: [api.embeds.success(`Deleted **${name}**`)],
        });
      },
    });

    ctx.logger.info("Items plugin loaded!");
  },
};

export default plugin;
```

---

## Quick Reference

### Core Utils Import

```typescript
import type { CoreUtilsAPI } from "../core-utils/plugin";

const coreUtils = ctx.getPlugin<{ api: CoreUtilsAPI }>("core-utils");
const api = coreUtils?.api;
```

### Common Imports

```typescript
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Plugin, PluginContext, Command, Event } from "@types";
```

### Permission Flags

```typescript
"Administrator", "ManageGuild", "ManageRoles", "ManageChannels",
"KickMembers", "BanMembers", "ManageMessages", "SendMessages",
"EmbedLinks", "AttachFiles", "MentionEveryone", "ViewChannel"
// See Discord.js docs for full list
```

### Embed Colors (from core-utils defaults)

- Primary: `0x5865f2` (Blurple)
- Success: `0x57f287` (Green)
- Warning: `0xfee75c` (Yellow)
- Error: `0xed4245` (Red)
- Info: `0x3ba55d` (Dark Green)

---

## Need Help?

- Check `examples/` directory for working plugin examples
- Read `CLAUDE.md` for framework internals
- Look at `core-utils` source code for advanced patterns
