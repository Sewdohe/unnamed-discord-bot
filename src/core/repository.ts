import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { Repository as IRepository, SchemaValidator, QueryBuilder } from "@types";
import { createQueryBuilder } from "./query-builder";
import { sql } from "drizzle-orm";

/**
 * Base repository class providing common CRUD operations.
 * Extend this class to create domain-specific repositories.
 *
 * @template T - The record type
 * @template TCreate - The type for create operations (defaults to Partial<T>)
 * @template TUpdate - The type for update operations (defaults to Partial<T>)
 *
 * @example
 * ```typescript
 * class UserRepository extends BaseRepository<User> {
 *   constructor(db: BunSQLiteDatabase, tableName: string) {
 *     super(db, tableName, 'id');
 *   }
 *
 *   // Add domain-specific methods
 *   findByEmail(email: string): User | null {
 *     return this.findBy('email', email);
 *   }
 * }
 * ```
 */
export abstract class BaseRepository<T, TCreate = Partial<T>, TUpdate = Partial<T>>
  implements IRepository<T, TCreate, TUpdate> {

  protected db: BunSQLiteDatabase;
  protected tableName: string;
  protected primaryKey: string;
  protected validator?: SchemaValidator<T>;

  /**
   * @param db Database instance
   * @param tableName Table name (should already include prefix)
   * @param primaryKey Primary key field name (defaults to 'id')
   * @param validator Optional schema validator for runtime validation
   */
  constructor(
    db: BunSQLiteDatabase,
    tableName: string,
    primaryKey: string = 'id',
    validator?: SchemaValidator<T>
  ) {
    this.db = db;
    this.tableName = tableName;
    this.primaryKey = primaryKey;
    this.validator = validator;
  }

  // ============ Query Builder Access ============

  /**
   * Create a new query builder instance for complex queries
   *
   * @example
   * ```typescript
   * const users = repo.query()
   *   .where('active', '=', 1)
   *   .orderBy('created_at', 'DESC')
   *   .limit(10)
   *   .all();
   * ```
   */
  query(): QueryBuilder<T> {
    return createQueryBuilder<T>(this.db, this.tableName);
  }

  // ============ Basic CRUD Operations ============

  /**
   * Find a record by primary key
   *
   * @param id Primary key value
   * @returns Record or null if not found
   */
  find(id: number | string): T | null {
    const result = this.query()
      .where(this.primaryKey, '=', id)
      .first();

    return this.validateResult(result);
  }

  /**
   * Find a single record by any field
   *
   * @param field Field name
   * @param value Field value
   * @returns Record or null if not found
   */
  findBy(field: string, value: unknown): T | null {
    const result = this.query()
      .where(field, '=', value)
      .first();

    return this.validateResult(result);
  }

  /**
   * Find all records in the table
   *
   * @returns Array of records
   */
  findAll(): T[] {
    const results = this.query().all();
    return this.validateResults(results);
  }

  /**
   * Find all records matching a field value
   *
   * @param field Field name
   * @param value Field value
   * @returns Array of matching records
   */
  findAllBy(field: string, value: unknown): T[] {
    const results = this.query()
      .where(field, '=', value)
      .all();

    return this.validateResults(results);
  }

  /**
   * Create a new record
   *
   * @param data Record data
   * @returns ID of created record
   */
  create(data: TCreate): number {
    // Validate if validator is present
    const validated = this.validator?.validate(data) ?? data;

    // Insert record
    this.query()
      .insert(validated as Partial<T>)
      .execute();

    // Get last inserted ID
    const result = this.db.get<{ id: number }>(sql.raw('SELECT last_insert_rowid() as id'));

    return result?.id ?? 0;
  }

  /**
   * Update an existing record
   *
   * @param id Primary key value
   * @param data Updated fields
   * @returns true if updated, false if record not found
   */
  update(id: number | string, data: TUpdate): boolean {
    // Check if record exists
    const existingRecord = this.find(id);
    if (!existingRecord) return false;

    // Validate if validator is present
    const validated = this.validator?.partial(data) ?? data;

    // Update record
    this.query()
      .where(this.primaryKey, '=', id)
      .update(validated as Partial<T>)
      .execute();

    return true;
  }

  /**
   * Delete a record
   *
   * @param id Primary key value
   * @returns true if deleted, false if record not found
   */
  delete(id: number | string): boolean {
    // Check if record exists
    const existingRecord = this.find(id);
    if (!existingRecord) return false;

    // Delete record
    this.query()
      .where(this.primaryKey, '=', id)
      .delete()
      .execute();

    return true;
  }

  // ============ Utility Methods ============

  /**
   * Check if a record exists
   *
   * @param id Primary key value
   * @returns true if record exists
   */
  exists(id: number | string): boolean {
    return this.find(id) !== null;
  }

  /**
   * Count all records in the table
   *
   * @returns Number of records
   */
  count(): number {
    return this.query().count();
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
}
