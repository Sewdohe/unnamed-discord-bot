import { sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { QueryBuilder as IQueryBuilder, WhereCondition, WhereOperator } from "@types";

/**
 * Query builder for constructing safe, parameterized SQL queries.
 * Prevents SQL injection by using parameter binding instead of string interpolation.
 */
export class QueryBuilder<T = unknown> implements IQueryBuilder<T> {
  private db: BunSQLiteDatabase;
  private tableName: string;

  // Query state
  private selectColumns: string[] = ['*'];
  private whereConditions: WhereCondition[] = [];
  private orderByClause: { field: string; direction: 'ASC' | 'DESC' }[] = [];
  private limitValue?: number;
  private offsetValue?: number;

  // Mutation state
  private insertData?: Record<string, unknown>;
  private updateData?: Record<string, unknown>;
  private isDeleteQuery = false;

  constructor(db: BunSQLiteDatabase, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  // ============ Filtering Methods ============

  /**
   * Add a WHERE condition (defaults to AND conjunction)
   */
  where(field: string, operator: WhereOperator, value: unknown): this {
    this.whereConditions.push({ field, operator, value, conjunction: 'AND' });
    return this;
  }

  /**
   * Add a WHERE condition with explicit AND conjunction
   */
  whereAnd(field: string, operator: WhereOperator, value: unknown): this {
    return this.where(field, operator, value);
  }

  /**
   * Add a WHERE condition with OR conjunction
   */
  whereOr(field: string, operator: WhereOperator, value: unknown): this {
    this.whereConditions.push({ field, operator, value, conjunction: 'OR' });
    return this;
  }

  // ============ Ordering & Limiting ============

  /**
   * Add ORDER BY clause
   */
  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClause.push({ field, direction });
    return this;
  }

  /**
   * Set LIMIT clause
   */
  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  /**
   * Set OFFSET clause
   */
  offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  // ============ Execution Methods ============

  /**
   * Execute query and return first result or null
   */
  first(): T | null {
    const query = this.buildParameterizedSelectQuery();
    const result = this.db.get<T>(query);
    return result ?? null;
  }

  /**
   * Execute query and return all results
   */
  all(): T[] {
    const query = this.buildParameterizedSelectQuery();
    const results = this.db.all<T>(query);
    return results ?? [];
  }

  /**
   * Execute query and return count of results
   */
  count(): number {
    const whereClause = this.buildParameterizedWhereClause();
    const query = sql`SELECT COUNT(*) as count FROM ${sql.raw(this.tableName)}${whereClause}`;
    const result = this.db.get<{ count: number }>(query);
    return result?.count ?? 0;
  }

  // ============ Mutation Methods ============

  /**
   * Set data for INSERT operation
   */
  insert(data: Partial<T>): this {
    this.insertData = data as Record<string, unknown>;
    return this;
  }

  /**
   * Set data for UPDATE operation
   */
  update(data: Partial<T>): this {
    this.updateData = data as Record<string, unknown>;
    return this;
  }

  /**
   * Mark as DELETE operation
   */
  delete(): this {
    this.isDeleteQuery = true;
    return this;
  }

  /**
   * Execute mutation (INSERT, UPDATE, or DELETE)
   */
  execute(): void {
    if (this.insertData) {
      this.executeInsert();
    } else if (this.updateData) {
      this.executeUpdate();
    } else if (this.isDeleteQuery) {
      this.executeDelete();
    }
  }

  // ============ Internal Query Building ============

  /**
   * Build parameterized WHERE clause using Drizzle's sql template
   * CRITICAL SECURITY: Uses Drizzle's parameter binding instead of string interpolation
   */
  private buildParameterizedWhereClause() {
    if (this.whereConditions.length === 0) {
      return sql.raw('');
    }

    let result = sql.raw(' WHERE ');

    for (let i = 0; i < this.whereConditions.length; i++) {
      const condition = this.whereConditions[i];
      const conjunction = i === 0 ? sql.raw('') : sql.raw(` ${condition.conjunction ?? 'AND'} `);

      if (condition.operator === 'IN' || condition.operator === 'NOT IN') {
        // Handle IN operator with array of values
        const values = Array.isArray(condition.value) ? condition.value : [condition.value];
        result = sql`${result}${conjunction}${sql.raw(condition.field)} ${sql.raw(condition.operator)} (${sql.join(values.map(v => sql`${v}`), sql.raw(', '))})`;
      } else if (condition.operator === 'IS' || condition.operator === 'IS NOT') {
        // Handle IS NULL / IS NOT NULL
        result = sql`${result}${conjunction}${sql.raw(condition.field)} ${sql.raw(condition.operator)} NULL`;
      } else {
        // Standard operators with single value
        result = sql`${result}${conjunction}${sql.raw(condition.field)} ${sql.raw(condition.operator)} ${condition.value}`;
      }
    }

    return result;
  }

  /**
   * Build ORDER BY clause
   */
  private buildOrderByClause(): string {
    if (this.orderByClause.length === 0) return '';

    const clauses = this.orderByClause.map(o => `${o.field} ${o.direction}`).join(', ');
    return ` ORDER BY ${clauses}`;
  }

  /**
   * Build complete parameterized SELECT query
   */
  private buildParameterizedSelectQuery() {
    const whereClause = this.buildParameterizedWhereClause();
    const orderClause = this.buildOrderByClause();
    const limitClause = this.limitValue ? sql.raw(` LIMIT ${this.limitValue}`) : sql.raw('');
    const offsetClause = this.offsetValue ? sql.raw(` OFFSET ${this.offsetValue}`) : sql.raw('');

    const columns = this.selectColumns.join(', ');
    return sql`SELECT ${sql.raw(columns)} FROM ${sql.raw(this.tableName)}${whereClause}${sql.raw(orderClause)}${limitClause}${offsetClause}`;
  }

  /**
   * Execute INSERT operation
   */
  private executeInsert(): void {
    if (!this.insertData) return;

    const fields = Object.keys(this.insertData);
    const values = Object.values(this.insertData);

    // Build parameterized INSERT query using Drizzle's sql template
    let query = sql`INSERT INTO ${sql.raw(this.tableName)} (${sql.raw(fields.join(', '))}) VALUES (`;

    for (let i = 0; i < values.length; i++) {
      if (i > 0) {
        query = sql`${query}, ${values[i]}`;
      } else {
        query = sql`${query}${values[i]}`;
      }
    }

    query = sql`${query})`;

    this.db.run(query);
  }

  /**
   * Execute UPDATE operation
   */
  private executeUpdate(): void {
    if (!this.updateData) return;

    const fields = Object.keys(this.updateData);
    const values = Object.values(this.updateData);
    const whereClause = this.buildParameterizedWhereClause();

    // Build SET clause with parameterized values
    let setClause = sql.raw('');
    for (let i = 0; i < fields.length; i++) {
      if (i > 0) {
        setClause = sql`${setClause}, ${sql.raw(fields[i])} = ${values[i]}`;
      } else {
        setClause = sql`${sql.raw(fields[i])} = ${values[i]}`;
      }
    }

    const query = sql`UPDATE ${sql.raw(this.tableName)} SET ${setClause}${whereClause}`;
    this.db.run(query);
  }

  /**
   * Execute DELETE operation
   */
  private executeDelete(): void {
    const whereClause = this.buildParameterizedWhereClause();
    const query = sql`DELETE FROM ${sql.raw(this.tableName)}${whereClause}`;
    this.db.run(query);
  }
}

/**
 * Factory function to create a new query builder instance
 * @param db Database instance
 * @param tableName Table name (should already include prefix)
 * @returns New QueryBuilder instance
 */
export function createQueryBuilder<T = unknown>(
  db: BunSQLiteDatabase,
  tableName: string
): QueryBuilder<T> {
  return new QueryBuilder<T>(db, tableName);
}
