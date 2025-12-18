import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { Collection, Document, ObjectId, OptionalId } from "mongodb";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

// ============ Data Types ============

/**
 * Example item interface - extends Document for MongoDB compatibility
 */
export interface ExamplePluginData extends Document {
  _id?: ObjectId;
  user_id: string;
  name: string;
}

// ============ Repository ============

/**
 * Example repository with common CRUD operations
 * Demonstrates MongoDB usage with the repository pattern
 */
export class PluginDataRepository extends BaseRepository<ExamplePluginData> {
  constructor(collection: Collection<ExamplePluginData>) {
    super(collection);
  }

  /**
   * Create a new item for a user
   */
  async createItem(userId: string, name: string): Promise<string> {
    const result = await this.collection.insertOne({
      user_id: userId,
      name,
    } as OptionalId<ExamplePluginData>);

    return result.insertedId.toString();
  }

  /**
   * Get an item by MongoDB ObjectId
   */
  async getItem(objectId: ObjectId): Promise<ExamplePluginData | null> {
    return await this.find(objectId);
  }

  /**
   * Get all items for a user
   */
  async getUserItems(userId: string): Promise<ExamplePluginData[]> {
    return await this.query()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'DESC')
      .all();
  }
}

// ============ Factory Function ============

/**
 * Initialize the database collection and create repository instance
 * This is the recommended pattern for setting up your plugin's database
 */
export function createExamplePluginDataRepo(
  ctx: PluginContext,
  api: CoreUtilsAPI
): PluginDataRepository {
  // Get MongoDB collection (automatically created on first insert)
  const collection = api.database.getCollection<ExamplePluginData>(ctx, 'items');

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

  // Return repository instance
  return new PluginDataRepository(collection);
}
