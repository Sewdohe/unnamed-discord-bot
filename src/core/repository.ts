import { Collection, Document, ObjectId, OptionalId } from "mongodb";
import type { Repository as IRepository, SchemaValidator, QueryBuilder } from "@types";
import { MongoQueryBuilder } from "./query-builder";

/**
 * Base repository class providing common CRUD operations for MongoDB.
 * Extend this class to create domain-specific repositories.
 *
 * @template T - The document type (must extend MongoDB Document)
 * @template TCreate - The type for create operations (defaults to Partial<T>)
 * @template TUpdate - The type for update operations (defaults to Partial<T>)
 *
 * @example
 * ```typescript
 * class UserRepository extends BaseRepository<User> {
 *   constructor(collection: Collection<User>) {
 *     super(collection);
 *   }
 *
 *   // Add domain-specific methods
 *   async findByEmail(email: string): Promise<User | null> {
 *     return await this.collection.findOne({ email });
 *   }
 * }
 * ```
 */
export abstract class BaseRepository<T extends Document, TCreate = Partial<T>, TUpdate = Partial<T>>
  implements IRepository<T, TCreate, TUpdate> {

  protected collection: Collection<T>;
  protected validator?: SchemaValidator<T>;

  /**
   * @param collection MongoDB collection instance
   * @param validator Optional schema validator for runtime validation
   */
  constructor(
    collection: Collection<T>,
    validator?: SchemaValidator<T>
  ) {
    this.collection = collection;
    this.validator = validator;
  }

  // ============ Query Builder Access ============

  /**
   * Create a new query builder instance for complex queries
   *
   * @example
   * ```typescript
   * const users = await repo.query()
   *   .where('active', '=', true)
   *   .orderBy('created_at', 'DESC')
   *   .limit(10)
   *   .all();
   * ```
   */
  query(): QueryBuilder<T> {
    return new MongoQueryBuilder<T>(this.collection);
  }

  // ============ Basic CRUD Operations ============

  /**
   * Find a document by MongoDB _id
   *
   * @param id MongoDB ObjectId (string or ObjectId instance)
   * @returns Document or null if not found
   */
  async find(id: string | ObjectId): Promise<T | null> {
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    const result = await this.collection.findOne({ _id } as any);

    return this.validateResult(result);
  }

  /**
   * Find a single document by any field
   *
   * @param field Field name
   * @param value Field value
   * @returns Document or null if not found
   */
  async findBy(field: string, value: unknown): Promise<T | null> {
    const result = await this.collection.findOne({ [field]: value } as any);

    return this.validateResult(result);
  }

  /**
   * Find all documents in the collection
   *
   * @returns Array of documents
   */
  async findAll(): Promise<T[]> {
    const results = await this.collection.find({}).toArray();
    return this.validateResults(results);
  }

  /**
   * Find all documents matching a field value
   *
   * @param field Field name
   * @param value Field value
   * @returns Array of matching documents
   */
  async findAllBy(field: string, value: unknown): Promise<T[]> {
    const results = await this.collection.find({ [field]: value } as any).toArray();

    return this.validateResults(results);
  }

  /**
   * Create a new document
   *
   * @param data Document data
   * @returns ID of created document (as string)
   */
  async create(data: TCreate): Promise<string> {
    // Validate if validator is present
    const validated = this.validator?.validate(data) ?? data;

    // Insert document
    const result = await this.collection.insertOne(validated as OptionalId<T>);

    return result.insertedId.toString();
  }

  /**
   * Update an existing document by _id
   *
   * @param id MongoDB ObjectId (string or ObjectId instance)
   * @param data Updated fields
   * @returns true if updated, false if document not found
   */
  async update(id: string | ObjectId, data: TUpdate): Promise<boolean> {
    const _id = typeof id === 'string' ? new ObjectId(id) : id;

    // Validate if validator is present
    const validated = this.validator?.partial(data) ?? data;

    // Update document
    const result = await this.collection.updateOne(
      { _id } as any,
      { $set: validated }
    );

    return result.modifiedCount > 0;
  }

  /**
   * Delete a document by _id
   *
   * @param id MongoDB ObjectId (string or ObjectId instance)
   * @returns true if deleted, false if document not found
   */
  async delete(id: string | ObjectId): Promise<boolean> {
    const _id = typeof id === 'string' ? new ObjectId(id) : id;

    // Delete document
    const result = await this.collection.deleteOne({ _id } as any);

    return result.deletedCount > 0;
  }

  // ============ Utility Methods ============

  /**
   * Check if a document exists by _id
   *
   * @param id MongoDB ObjectId (string or ObjectId instance)
   * @returns true if document exists
   */
  async exists(id: string | ObjectId): Promise<boolean> {
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    const count = await this.collection.countDocuments({ _id } as any);
    return count > 0;
  }

  /**
   * Count all documents in the collection
   *
   * @returns Number of documents
   */
  async count(): Promise<number> {
    return await this.collection.countDocuments();
  }

  // ============ Validation Helpers ============

  /**
   * Validate a single result using the schema validator (if present)
   *
   * @param result Raw query result
   * @returns Validated result or null
   */
  protected validateResult(result: unknown): T | null {
    if (!result) return null;
    if (!this.validator) return result as T;

    try {
      return this.validator.validate(result);
    } catch (error) {
      // Validation failed - return null
      return null;
    }
  }

  /**
   * Validate multiple results using the schema validator (if present)
   *
   * @param results Raw query results
   * @returns Array of validated results (invalid results filtered out)
   */
  protected validateResults(results: unknown[]): T[] {
    if (!this.validator) return results as T[];

    return results.map(r => {
      try {
        return this.validator!.validate(r);
      } catch {
        return null;
      }
    }).filter((r): r is T => r !== null);
  }

  // ============ Convenience Aliases ============

  /**
   * Alias for findAll() - matches SQLite repository interface
   */
  async all(): Promise<T[]> {
    return await this.findAll();
  }
}
