# Template Plugin

A comprehensive example plugin demonstrating all best practices for the Discord bot framework.

## Features Demonstrated

### ✅ Configuration
- Zod schema with descriptions (auto-generates YAML)
- Nested configuration objects
- Feature toggles
- Type-safe config access

### ✅ Database
- **Repository pattern** with BaseRepository
- **Safe SQL queries** (no injection vulnerabilities)
- Query builder with method chaining
- Optional Zod validation
- Database indexes for performance

### ✅ Commands
- Subcommands for organization
- Required and optional parameters
- Permission checks
- Ephemeral replies for errors
- Confirmation dialogs for destructive actions

### ✅ Core-Utils Integration
- Embed helpers
- Confirmation dialogs
- Proper dependency management

## File Structure

```
template-plugin/
├── plugin.ts           # Main plugin with commands
├── db/
│   └── repository.ts   # Database layer with Repository pattern
└── README.md          # This file
```

## Usage

To use this template:

1. **Copy the entire folder** to `plugins/your-plugin-name/`
2. **Rename** the plugin in `manifest.name`
3. **Update** the config schema for your needs
4. **Modify** the database schema in `repository.ts`
5. **Add/remove** commands as needed

## Key Patterns

### Database Operations (Safe & Type-Safe)

```typescript
// Get items
const items = itemRepo.getUserItems(userId);

// Create item
const id = itemRepo.createItem(userId, "Item Name");

// Query builder
const filtered = itemRepo.query()
  .where('user_id', '=', userId)
  .where('name', 'LIKE', '%search%')
  .orderBy('created_at', 'DESC')
  .limit(10)
  .all();
```

### Configuration Access

```typescript
// Type-safe config
if (!ctx.config.enabled) return;

const max = ctx.config.maxItemsPerUser;
const allowGifts = ctx.config.features.allowGifts;
```

### Command Structure

```typescript
ctx.registerCommand({
  data: new SlashCommandBuilder()
    .setName("command")
    .setDescription("Description")
    .addSubcommand(sub => /* ... */),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    // Handle subcommands
  },
});
```

## Security

✅ All database queries use parameterized queries (SQL injection proof)
✅ Input validation with Zod schemas
✅ Permission checks on commands
✅ User ownership verification before operations

## Testing

1. Enable the plugin by copying to `plugins/`
2. Restart the bot
3. Edit `config/template-plugin.yaml` to configure
4. Use `/item list`, `/item add`, etc.
