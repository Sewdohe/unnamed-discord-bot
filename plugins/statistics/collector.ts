/**
 * Stat Collector
 *
 * Manages registration of stat providers and collects data from all providers.
 * Provides error isolation so that failed providers don't crash the entire collection.
 */

import type { PluginContext } from "@types";

export interface StatProvider {
  /** Unique identifier for this provider */
  id: string;
  /** Category name (e.g., "Bot Stats", "Plugin Stats") */
  category: string;
  /** Priority for ordering (higher = shown first, default: 0) */
  priority?: number;
  /** Function that collects and returns stat data */
  collect: () => Promise<Record<string, string | number>> | Record<string, string | number>;
}

export interface CollectedStats {
  /** Category name */
  category: string;
  /** Priority for ordering */
  priority: number;
  /** Collected stat data (name -> value) */
  stats: Record<string, string | number>;
}

export class StatCollector {
  private providers: Map<string, StatProvider> = new Map();
  private ctx: PluginContext;

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
  }

  /**
   * Register a stat provider
   * @param provider - Stat provider to register
   */
  registerProvider(provider: StatProvider): void {
    if (this.providers.has(provider.id)) {
      this.ctx.logger.warn(`Stat provider "${provider.id}" is already registered. Overwriting.`);
    }

    this.providers.set(provider.id, provider);
    this.ctx.logger.debug(`Registered stat provider: ${provider.id} (category: ${provider.category})`);
  }

  /**
   * Unregister a stat provider
   * @param id - Provider ID to remove
   * @returns true if provider was found and removed
   */
  unregisterProvider(id: string): boolean {
    const removed = this.providers.delete(id);
    if (removed) {
      this.ctx.logger.debug(`Unregistered stat provider: ${id}`);
    }
    return removed;
  }

  /**
   * Get all registered provider IDs
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Collect stats from all providers
   * Providers are grouped by category and sorted by priority
   * Failed providers are logged but don't stop the collection
   *
   * @returns Array of collected stats by category
   */
  async collectAll(): Promise<CollectedStats[]> {
    const results: CollectedStats[] = [];
    const categoryMap = new Map<string, CollectedStats>();

    for (const [id, provider] of this.providers) {
      try {
        const stats = await provider.collect();

        // Get or create category entry
        let categoryData = categoryMap.get(provider.category);
        if (!categoryData) {
          categoryData = {
            category: provider.category,
            priority: provider.priority ?? 0,
            stats: {},
          };
          categoryMap.set(provider.category, categoryData);
        }

        // Merge stats into category
        Object.assign(categoryData.stats, stats);

        // Update priority if this provider has higher priority
        if ((provider.priority ?? 0) > categoryData.priority) {
          categoryData.priority = provider.priority ?? 0;
        }
      } catch (error) {
        this.ctx.logger.error(`Failed to collect stats from provider "${id}":`, error);
      }
    }

    // Convert map to array and sort by priority (highest first)
    results.push(...Array.from(categoryMap.values()));
    results.sort((a, b) => b.priority - a.priority);

    return results;
  }

  /**
   * Get the number of registered providers
   */
  getProviderCount(): number {
    return this.providers.size;
  }
}

/**
 * Create a stat collector instance
 */
export function createStatCollector(ctx: PluginContext): StatCollector {
  return new StatCollector(ctx);
}
