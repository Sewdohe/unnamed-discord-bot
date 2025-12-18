# Template Plugin

A comprehensive example plugin demonstrating best practices for Discord bot plugin development. Use this as a starting point for your own plugins!

## Features Demonstrated

This template showcases:

- ✅ **MongoDB Integration** - Repository pattern with async/await
- ✅ **Type Safety** - Full TypeScript with proper types
- ✅ **Configuration** - Zod schemas with auto-generated YAML
- ✅ **Commands** - Slash commands with subcommands
- ✅ **UI Components** - Interactive buttons with handlers
- ✅ **Event Handlers** - Multiple event types
- ✅ **Error Handling** - Graceful error management
- ✅ **Database Indexes** - Performance optimization
- ✅ **Cross-Plugin Communication** - Using core-utils API
- ✅ **Pagination** - Long lists with page navigation
- ✅ **Confirmations** - User confirmation dialogs
- ✅ **Logging** - Structured logging with context

## File Structure

```
template-plugin/
├── plugin.ts              # Main plugin file
├── commands/
│   └── index.ts          # Command definitions and handlers
├── db/
│   └── repository.ts     # Database layer with repository pattern
└── README.md             # This file
```

## Quick Start

### 1. Copy the Template

```bash
# Copy to your plugin directory
cp -r examples/template-plugin plugins/my-plugin

# Navigate to your new plugin
cd plugins/my-plugin
```

### 2. Customize the Manifest

Edit `plugin.ts` and update the manifest:

```typescript
manifest: {
  name: "my-plugin",           // Change this
  version: "1.0.0",
  description: "...",          // Change this
  author: "Your Name",         // Change this
  dependencies: {
    hard: ["core-utils"],      // Keep or modify
    soft: [],
  },
}
```

### 3. Define Your Data Model

Edit `db/repository.ts` and define your data interface:

```typescript
export interface MyData extends Document {
  _id?: ObjectId;
  user_id: string;
  // Add your fields here
  created_at: Date;
  updated_at: Date;
}
```

### 4. Create Repository Methods

Add methods to interact with your data:

```typescript
export class MyRepository extends BaseRepository<MyData> {
  async createData(userId: string, data: any): Promise<string> {
    // Implementation
  }

  async getUserData(userId: string): Promise<MyData[]> {
    // Implementation
  }
}
```

### 5. Define Configuration

Edit the config schema in `plugin.ts`:

```typescript
const configSchema = z.object({
  enabled: z.boolean().default(true),
  // Add your config options
});
```

### 6. Create Commands

Edit `commands/index.ts` to define your slash commands:

```typescript
export function createMyCommand(ctx, api, repo): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("mycommand")
      .setDescription("..."),

    async execute(interaction) {
      // Implementation
    },
  };
}
```

### 7. Test Your Plugin

```bash
# From project root
bun run dev
```

The bot will automatically load your plugin!

## Commands

The template includes these example commands:

### `/items list`
View all your items with pagination

### `/items add <name> [description] [quantity]`
Add a new item to your inventory

### `/items view <name>`
View detailed information about an item

### `/items delete <name>`
Delete an item (with confirmation)

### `/items update <name> <quantity>`
Update an item's quantity

### `/items transfer <name> <user>`
Transfer an item to another user

### `/items stats`
View your statistics

## Configuration

The template auto-generates a YAML config file at `config/template-plugin.yaml`:

```yaml
# Template Plugin Configuration
enabled: true                    # Enable or disable the plugin
maxItemsPerUser: 50             # Maximum items per user (1-1000)
defaultQuantity: 1              # Default quantity for new items (1-999)
enableNotifications: true       # Send notifications for events
features:
  enableTransfers: true         # Allow item transfers
  enableStats: true             # Show statistics
```

Edit this file to customize behavior without touching code!

## Database Schema

The template creates a MongoDB collection with this structure:

```typescript
{
  _id: ObjectId,              // MongoDB unique ID
  user_id: string,            // Discord user ID
  name: string,               // Item name
  description?: string,       // Optional description
  quantity: number,           // Item quantity
  created_at: Date,          // Creation timestamp
  updated_at: Date           // Last update timestamp
}
```

### Indexes

The template creates these indexes for performance:

1. **Unique Index**: `{ user_id: 1, name: 1 }` - Prevents duplicate item names per user
2. **Sort Index**: `{ user_id: 1, created_at: -1 }` - Efficient sorting by creation date

## Architecture Patterns

### Repository Pattern

All database operations go through the repository:

```typescript
// ✅ Good
const items = await itemRepo.getUserItems(userId);

// ❌ Avoid direct collection access in commands
const items = await collection.find({ user_id: userId }).toArray();
```

**Benefits:**
- Centralized data access logic
- Easy to test and mock
- Consistent error handling
- Business logic separation

### Command Structure

Commands use subcommands for organization:

```typescript
/items list      // List all items
/items add       // Add an item
/items delete    // Delete an item
```

This keeps the command list clean and groups related functionality.

### Configuration with Zod

Zod schemas provide:
- Type safety at runtime
- Auto-generated YAML files
- Validation with helpful errors
- TypeScript type inference

### Error Handling

Always handle errors gracefully:

```typescript
try {
  await itemRepo.createItem(...);
  // Success response
} catch (error) {
  ctx.logger.error("Failed to create item:", error);
  // Error response to user
}
```

## API Reference

### Core Utils API

The template uses these core-utils helpers:

#### Embeds
```typescript
api.embeds.success(message, title)  // Green success embed
api.embeds.error(message, title)    // Red error embed
api.embeds.info(message, title)     // Blue info embed
api.embeds.warning(message, title)  // Yellow warning embed
api.embeds.primary(message, title)  // Purple primary embed
api.embeds.create()                 // Blank embed builder
```

#### Pagination
```typescript
await api.paginate(interaction, {
  items: arrayOfItems,
  formatPage: (pageItems, page, totalPages) => embed,
  itemsPerPage: 10,
});
```

#### Confirmations
```typescript
const confirmed = await api.confirm(interaction, {
  message: "Are you sure?",
  title: "Confirm Action",
});
```

#### UI Components
```typescript
api.components.define(ctx, {
  id: "my-buttons",
  scope: "message",
  components: [...],
  handler: async (ctx, interaction, meta) => { ... }
});
```

### Repository Methods

Base repository provides these methods:

```typescript
await repo.find(id)                    // Find by _id (string or ObjectId)
await repo.findBy(field, value)        // Find one by any field
await repo.findAll()                   // Find all documents
await repo.findAllBy(field, value)     // Find all by field value
await repo.create(data)                // Create new document
await repo.update(id, data)            // Update by _id (string or ObjectId)
await repo.delete(id)                  // Delete by _id (string or ObjectId)
await repo.exists(id)                  // Check if document exists
await repo.count()                     // Count all documents
await repo.all()                       // Alias for findAll()
await repo.query()                     // Get query builder
```

Query builder methods:

```typescript
repo.query()
  .where('field', '=', 'value')
  .whereOr('field', '>', 10)
  .orderBy('created_at', 'DESC')
  .limit(10)
  .offset(20)
  .all()    // or .first() or .count()
```

## Best Practices

### 1. Always Use Async/Await

```typescript
// ✅ Good
const items = await repo.getUserItems(userId);

// ❌ Bad - blocks event loop
const items = repo.getUserItems(userId); // Missing await
```

### 2. Validate User Input

```typescript
// Use Zod schemas
const schema = z.string().min(1).max(100);
const validated = schema.parse(userInput);
```

### 3. Create Database Indexes

```typescript
// In createRepo function
collection.createIndex({ user_id: 1 }, { unique: true }).catch(() => {});
```

### 4. Handle Errors

```typescript
try {
  await operation();
} catch (error) {
  ctx.logger.error("Operation failed:", error);
  // Show user-friendly error message
}
```

### 5. Log Important Events

```typescript
ctx.logger.info("User created item:", itemName);
ctx.logger.warn("Item limit reached");
ctx.logger.error("Database error:", error);
ctx.logger.debug("Debug info"); // Only shows with DEBUG=true
```

### 6. Use TypeScript Types

```typescript
// ✅ Good - typed
const item: Item = await repo.getItem(id);

// ❌ Avoid - untyped
const item = await repo.getItem(id);
```

### 7. Keep Code Organized

```
plugin.ts        → Plugin setup, config, registration
commands/        → Command handlers
db/              → Database layer
types.ts         → Type definitions (if needed)
utils.ts         → Helper functions (if needed)
```

## Common Patterns

### Creating Items
```typescript
const itemId = await itemRepo.createItem(userId, name, description, quantity);
```

### Querying Items
```typescript
const items = await itemRepo.getUserItems(userId);
const item = await itemRepo.getItem(itemId);
const found = await itemRepo.findItemsByName(userId, "sword");
```

### Updating Items
```typescript
await itemRepo.updateQuantity(itemId, 10);
await itemRepo.transferItem(itemId, newUserId);
```

### Deleting Items
```typescript
const deleted = await itemRepo.deleteItem(itemId);
```

### Checking Limits
```typescript
const count = await itemRepo.countUserItems(userId);
if (count >= config.maxItemsPerUser) {
  // Show error
}
```

### Confirmations
```typescript
const confirmed = await api.confirm(interaction, {
  message: "Delete this item?",
  title: "Confirm Deletion",
});

if (!confirmed) {
  return; // User cancelled
}
```

## Troubleshooting

### Plugin Not Loading

1. Check plugin name in manifest matches directory name
2. Ensure `export default plugin` is present
3. Check for TypeScript errors: `bunx tsc --noEmit`
4. Check logs for error messages

### Commands Not Appearing

1. Guild commands update instantly (set GUILD_ID in .env)
2. Global commands take up to 1 hour
3. Check bot permissions

### Database Errors

1. Ensure MongoDB connection string is correct
2. Check database permissions
3. Verify indexes are created
4. Check data validation schemas

### Type Errors

1. Ensure all imports use correct paths
2. Restart TypeScript server if needed
3. Check `@types` import alias is working

## Advanced Examples

### Custom Validation

```typescript
const validator = api.database.createValidator(
  z.object({
    name: z.string().min(1).max(100),
    quantity: z.number().int().min(0),
  })
);

// Use in repository
const validatedData = validator(data);
```

### Complex Queries

```typescript
// Find items with regex
const items = await collection.find({
  user_id: userId,
  name: { $regex: searchTerm, $options: 'i' }
}).toArray();

// Aggregate data
const pipeline = [
  { $match: { user_id: userId } },
  { $group: { _id: null, total: { $sum: "$quantity" } } }
];
const result = await collection.aggregate(pipeline).toArray();
```

### Transactions

```typescript
const session = client.startSession();
try {
  await session.withTransaction(async () => {
    await collection1.updateOne({ ... }, { ... }, { session });
    await collection2.insertOne({ ... }, { session });
  });
} finally {
  await session.endSession();
}
```

## Next Steps

1. **Customize the data model** in `db/repository.ts`
2. **Add your commands** in `commands/index.ts`
3. **Configure behavior** via YAML config
4. **Test thoroughly** with `bun run dev`
5. **Add documentation** for your users
6. **Consider edge cases** and error scenarios
7. **Deploy** to production!

## Resources

- [Plugin Development Guide](../../docs/PLUGIN_DEVELOPMENT.md)
- [Discord.js Documentation](https://discord.js.org/)
- [MongoDB Node Driver](https://www.mongodb.com/docs/drivers/node/)
- [Zod Documentation](https://zod.dev/)

## License

This template is provided as-is for use in your Discord bot plugins. Modify freely!

---

**Happy coding!** 🚀

If you have questions, check the main documentation or reach out to the community.
