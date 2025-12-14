import { z } from "zod";
import type { SchemaValidator } from "@types";

/**
 * Create a schema validator from a Zod schema.
 * Provides runtime validation for database records.
 *
 * @param schema Zod schema definition
 * @returns SchemaValidator instance
 *
 * @example
 * ```typescript
 * const userSchema = z.object({
 *   id: z.number(),
 *   email: z.string().email(),
 *   age: z.number().min(0),
 * });
 *
 * const validator = createSchemaValidator(userSchema);
 * const user = validator.validate(rawData); // Throws if invalid
 * ```
 */
export function createSchemaValidator<T extends z.ZodTypeAny>(
  schema: T
): SchemaValidator<z.infer<T>> {
  return {
    /**
     * Validate data against the full schema
     * @throws ZodError if validation fails
     */
    validate(data: unknown): z.infer<T> {
      return schema.parse(data);
    },

    /**
     * Validate data against a partial version of the schema
     * (all fields optional) - useful for UPDATE operations
     * @throws ZodError if validation fails
     */
    partial(data: unknown): Partial<z.infer<T>> {
      // Create a partial schema by making all fields optional
      const partialSchema = schema instanceof z.ZodObject
        ? schema.partial()
        : schema;
      return partialSchema.parse(data);
    },
  };
}

/**
 * Common Zod schemas for Discord and database fields.
 * Use these to ensure consistent validation across plugins.
 *
 * @example
 * ```typescript
 * import { commonSchemas } from "@core/schema";
 *
 * const verificationSchema = z.object({
 *   user_id: commonSchemas.discordId,
 *   created_at: commonSchemas.timestamp,
 *   verified: commonSchemas.boolean,
 * });
 * ```
 */
export const commonSchemas = {
  /**
   * Discord snowflake ID (17-19 digit string)
   */
  discordId: z.string().regex(/^\d{17,19}$/, "Invalid Discord ID"),

  /**
   * ISO 8601 datetime string
   */
  timestamp: z.string().datetime(),

  /**
   * SQLite boolean (stored as 0 or 1 integer)
   */
  boolean: z.number().min(0).max(1),
};
