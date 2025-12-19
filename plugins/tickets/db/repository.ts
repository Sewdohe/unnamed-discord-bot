import { BaseRepository } from "../../../src/core/repository";
import type { PluginContext } from "@types";
import type { Collection, Document, ObjectId, OptionalId } from "mongodb";
import type { CoreUtilsAPI } from "../../core-utils/plugin";

// ============ Data Types ============

/**
 * Support ticket interface - extends Document for MongoDB compatibility
 */
export interface SupportTicket extends Document {
  _id?: ObjectId;
  user_id: string;
  category: string;
  attached_staff_id?: string;
  status: "open" | "closed" | "pending";
  content: string;
  closed_on?: Date;
  closure_reason?: string;
  created_at: Date;
  updated_at: Date;
}

// ============ Repository ============

/**
 * Example repository with common CRUD operations
 * Demonstrates MongoDB usage with the repository pattern
 */
export class TicketsRepository extends BaseRepository<SupportTicket> {
  constructor(collection: Collection<SupportTicket>) {
    super(collection);
  }

  /**
   * Create a new support ticket for a user
   */
  async createTicket(userId: string, name: string, category: string, content: string): Promise<string> {
    const result = await this.collection.insertOne({
      user_id: userId,
      name,
      category,
      content,
      status: "open",
      created_at: new Date(),
      updated_at: new Date(),
    } as OptionalId<SupportTicket>);

    return result.insertedId.toString();
  }

  /**
   * Get a ticket by MongoDB ObjectId
   */
  async getTicket(objectId: ObjectId): Promise<SupportTicket | null> {
    return await this.find(objectId);
  }

  /**
   * Get all tickets for a user
   */
  async getUserTickets(userId: string): Promise<SupportTicket[]> {
    return await this.query()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'DESC')
      .all();
  }

  /**
    * Get all open tickets
    */
  async getOpenTickets(): Promise<SupportTicket[]> {
    return await this.query()
      .where('status', '=', 'open')
      .orderBy('created_at', 'ASC')
      .all();
  }

  /**
   * Get count of open tickets
   */
  async getOpenTicketCount(): Promise<number> {
    return await this.query()
      .where('status', '=', 'open')
      .count();
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(objectId: ObjectId, status: "open" | "closed" | "pending", closureReason?: string): Promise<void> {
    const updateData: Partial<SupportTicket> = {
      status,
      updated_at: new Date(),
    };
    
    if (status === "closed") {
      updateData.closed_on = new Date();
      if (closureReason) {
        updateData.closure_reason = closureReason;
      }
    }

    await this.update(objectId, updateData);
  }

  /** 
   * Attach staff member to ticket
   */
  async attachStaffToTicket(objectId: ObjectId, staffId: string): Promise<void> {
    await this.update(objectId, {
      attached_staff_id: staffId,
      updated_at: new Date(),
    });
  }

  /**
   * Delete a ticket by ObjectId
   */
  async deleteTicket(objectId: ObjectId): Promise<void> {
    await this.delete(objectId);
  }
  
  /**
   * Get count of closed tickets
   */
  async getClosedTicketCount(): Promise<number> {
    return await this.query()
      .where('status', '=', 'closed')
      .count();
  }

  /**
   * Get amount of done tickets (closed)
   */
  async getDoneTicketsCount(): Promise<number> {
    return await this.query()
      .where('status', '=', 'closed')
      .count();
  }

}

// ============ Factory Function ============

/**
 * Initialize the database collection and create repository instance
 * This is the recommended pattern for setting up your plugin's database
 */
export function createTicketsRepo(
  ctx: PluginContext,
  api: CoreUtilsAPI
): TicketsRepository {
  // Get MongoDB collection (automatically created on first insert)
  const collection = api.database.getCollection<SupportTicket>(ctx, 'tickets');

  // Create indexes for better query performance
  // Unique index prevents duplicate item names per user
  collection.createIndex(
    { user_id: 1, name: 1 },
    { unique: true }
  ).catch(() => { });

  // Index for sorting by creation date
  collection.createIndex(
    { user_id: 1, created_at: -1 }
  ).catch(() => { });

  // Return repository instance
  return new TicketsRepository(collection);
}
