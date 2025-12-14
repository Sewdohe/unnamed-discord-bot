import { Collection, Filter, UpdateFilter, Sort, Document } from "mongodb";
import type { QueryBuilder as IQueryBuilder, WhereOperator } from "@types";

/**
 * MongoDB Query builder for constructing safe, parameterized queries.
 * Converts SQL-like query builder API to MongoDB filter objects.
 */
export class MongoQueryBuilder<T extends Document> implements IQueryBuilder<T> {
  private collection: Collection<T>;
  private filters: Filter<T>[] = [];
  private sortSpec: Sort = {};
  private limitCount?: number;
  private skipCount?: number;
  private updateDoc?: UpdateFilter<T>;
  private deleteFlag = false;

  constructor(collection: Collection<T>) {
    this.collection = collection;
  }

  // ============ Filtering Methods ============

  /**
   * Add a WHERE condition (defaults to AND conjunction)
   */
  where(field: string, operator: WhereOperator, value: unknown): this {
    const filter = this.buildFilter(field, operator, value);
    this.filters.push(filter as Filter<T>);
    return this;
  }

  /**
   * Add a WHERE condition with OR conjunction
   */
  whereOr(field: string, operator: WhereOperator, value: unknown): this {
    // MongoDB $or operator - wrap in array for later processing
    const filter = this.buildFilter(field, operator, value);
    this.filters.push({ $or: [filter] } as Filter<T>);
    return this;
  }

  /**
   * Build MongoDB filter object from SQL-like operator
   */
  private buildFilter(field: string, operator: WhereOperator, value: unknown): object {
    switch (operator) {
      case '=':
        return { [field]: value };

      case '!=':
        return { [field]: { $ne: value } };

      case '>':
        return { [field]: { $gt: value } };

      case '<':
        return { [field]: { $lt: value } };

      case '>=':
        return { [field]: { $gte: value } };

      case '<=':
        return { [field]: { $lte: value } };

      case 'LIKE': {
        // Convert SQL LIKE to MongoDB regex
        // % becomes .* (match any characters)
        // _ becomes . (match single character)
        const regexStr = value
          .toString()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
          .replace(/%/g, '.*')
          .replace(/_/g, '.');
        return { [field]: { $regex: new RegExp(`^${regexStr}$`, 'i') } };
      }

      case 'IN':
        return { [field]: { $in: Array.isArray(value) ? value : [value] } };

      case 'NOT IN':
        return { [field]: { $nin: Array.isArray(value) ? value : [value] } };

      case 'IS':
        return { [field]: null };

      case 'IS NOT':
        return { [field]: { $ne: null } };

      default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
  }

  // ============ Ordering & Limiting ============

  /**
   * Add ORDER BY clause (converted to MongoDB sort)
   */
  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.sortSpec[field] = direction === 'ASC' ? 1 : -1;
    return this;
  }

  /**
   * Set LIMIT clause (converted to MongoDB limit)
   */
  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  /**
   * Set OFFSET clause (converted to MongoDB skip)
   */
  offset(count: number): this {
    this.skipCount = count;
    return this;
  }

  // ============ Execution Methods ============

  /**
   * Combine all filter conditions into a single MongoDB filter object
   */
  private getCombinedFilter(): Filter<T> {
    if (this.filters.length === 0) {
      return {};
    }

    if (this.filters.length === 1) {
      return this.filters[0];
    }

    // Combine multiple filters with $and
    return { $and: this.filters } as Filter<T>;
  }

  /**
   * Execute query and return first result or null
   */
  async first(): Promise<T | null> {
    const filter = this.getCombinedFilter();
    const result = await this.collection.findOne(filter, {
      sort: this.sortSpec,
    });
    return result;
  }

  /**
   * Execute query and return all results
   */
  async all(): Promise<T[]> {
    const filter = this.getCombinedFilter();
    let cursor = this.collection.find(filter);

    // Apply sorting if specified
    if (Object.keys(this.sortSpec).length > 0) {
      cursor = cursor.sort(this.sortSpec);
    }

    // Apply skip (OFFSET)
    if (this.skipCount !== undefined) {
      cursor = cursor.skip(this.skipCount);
    }

    // Apply limit
    if (this.limitCount !== undefined) {
      cursor = cursor.limit(this.limitCount);
    }

    return await cursor.toArray();
  }

  /**
   * Execute query and return count of results
   */
  async count(): Promise<number> {
    const filter = this.getCombinedFilter();
    return await this.collection.countDocuments(filter);
  }

  // ============ Mutation Methods ============

  /**
   * Set data for INSERT operation (not used - use repository.create() instead)
   */
  insert(data: Partial<T>): this {
    // MongoDB doesn't use query builder for insert
    // This method exists for interface compatibility but shouldn't be used
    throw new Error("Use repository.create() instead of query().insert()");
  }

  /**
   * Set data for UPDATE operation
   */
  update(data: Partial<T>): this {
    this.updateDoc = { $set: data } as UpdateFilter<T>;
    return this;
  }

  /**
   * Mark as DELETE operation
   */
  delete(): this {
    this.deleteFlag = true;
    return this;
  }

  /**
   * Execute mutation (UPDATE or DELETE)
   */
  async execute(): Promise<void> {
    const filter = this.getCombinedFilter();

    if (this.deleteFlag) {
      await this.collection.deleteMany(filter);
    } else if (this.updateDoc) {
      await this.collection.updateMany(filter, this.updateDoc);
    }
  }
}

/**
 * Factory function to create a new MongoDB query builder instance
 * @param collection MongoDB collection instance
 * @returns New MongoQueryBuilder instance
 */
export function createQueryBuilder<T extends Document>(
  collection: Collection<T>
): MongoQueryBuilder<T> {
  return new MongoQueryBuilder<T>(collection);
}

// Export MongoQueryBuilder as QueryBuilder for backward compatibility
export { MongoQueryBuilder as QueryBuilder };
