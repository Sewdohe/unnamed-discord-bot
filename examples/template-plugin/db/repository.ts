import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { Collection, Document, ObjectId, OptionalId } from "mongodb";
import type { CoreUtilsAPI } from "../../../plugins/core-utils/plugin";
import { z } from "zod";

// ============ Data Types ============

/**
 * Example item interface - extends Document for MongoDB compatibility
 */
export interface Item extends Document {
  _id?: ObjectId;
  user_id: string;
  name: string;
  description?: string;
  quantity: number;
  created_at: Date;
  updated_at: Date;
}

// ============ Repository ============

/**
 * Example repository with common CRUD operations
 * Demonstrates MongoDB usage with the repository pattern
 */
export class ItemRepository extends BaseRepository<Item> {
  constructor(collection: Collection<Item>) {
    super(collection);
  }

  /**
   * Create a new item for a user
   */
  async createItem(userId: string, name: string, description?: string, quantity: number = 1): Promise<string> {
    const result = await this.collection.insertOne({
      user_id: userId,
      name,
      description,
      quantity,
      created_at: new Date(),
      updated_at: new Date(),
    } as OptionalId<Item>);

    return result.insertedId.toString();
  }

  /**
   * Get an item by MongoDB ObjectId
   */
  async getItem(itemId: string): Promise<Item | null> {
    return await this.find(itemId);
  }

  /**
   * Get all items for a user
   */
  async getUserItems(userId: string): Promise<Item[]> {
    return await this.query()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'DESC')
      .all();
  }

  /**
   * Find items by name (case-insensitive)
   */
  async findItemsByName(userId: string, searchTerm: string): Promise<Item[]> {
    return await this.collection.find({
      user_id: userId,
      name: { $regex: searchTerm, $options: 'i' }
    }).toArray();
  }

  /**
   * Update item quantity
   */
  async updateQuantity(itemId: string, quantity: number): Promise<boolean> {
    return await this.update(itemId, {
      quantity,
      updated_at: new Date()
    } as any);
  }

  /**
   * Delete an item
   */
  async deleteItem(itemId: string): Promise<boolean> {
    return await this.delete(itemId);
  }

  /**
   * Transfer item to another user
   */
  async transferItem(itemId: string, newUserId: string): Promise<boolean> {
    return await this.update(itemId, {
      user_id: newUserId,
      updated_at: new Date()
    } as any);
  }

  /**
   * Count items for a user
   */
  async countUserItems(userId: string): Promise<number> {
    return await this.query()
      .where('user_id', '=', userId)
      .count();
  }

  /**
   * Get total quantity of all items for a user
   */
  async getTotalQuantity(userId: string): Promise<number> {
    const items = await this.getUserItems(userId);
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }

  /**
   * Check if user has an item with the given name
   */
  async hasItem(userId: string, itemName: string): Promise<boolean> {
    const item = await this.collection.findOne({
      user_id: userId,
      name: { $regex: `^${itemName}$`, $options: 'i' }
    });
    return item !== null;
  }
}

// ============ Factory Function ============

/**
 * Initialize the database collection and create repository instance
 * This is the recommended pattern for setting up your plugin's database
 */
export function createItemRepo(
  ctx: PluginContext,
  api: CoreUtilsAPI
): ItemRepository {
  // Get MongoDB collection (automatically created on first insert)
  const collection = api.database.getCollection<Item>(ctx, 'items');

  // Create indexes for better query performance
  // Unique index prevents duplicate item names per user
  collection.createIndex(
    { user_id: 1, name: 1 },
    { unique: true }
  ).catch(() => {});

  // Index for sorting by creation date
  collection.createIndex(
    { user_id: 1, created_at: -1 }
  ).catch(() => {});

  // Optional: Create schema validator for runtime validation
  const validator = api.database.createValidator(
    z.object({
      user_id: z.string(),
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      quantity: z.number().int().min(0),
      created_at: z.date(),
      updated_at: z.date(),
    })
  );

  // Return repository instance
  return new ItemRepository(collection);
}

/**
 * Initialize database (MongoDB collections are auto-created, so this is optional)
 * You can use this function to set up any initial data or perform migrations
 */
export async function initDatabase(ctx: PluginContext): Promise<void> {
  ctx.logger.debug("MongoDB collections auto-created - no initialization needed");

  // Example: You could seed initial data here
  // const collection = api.database.getCollection<Item>(ctx, 'items');
  // await collection.insertOne({ ... });
}
