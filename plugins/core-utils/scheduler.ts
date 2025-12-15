/**
 * Scheduler API for Core Utils
 *
 * Provides interval-based task scheduling for plugins.
 * Tasks are in-memory only and cleared on bot restart.
 *
 * Features:
 * - Simple interval-based scheduling (milliseconds)
 * - Error isolation (failed tasks don't crash the scheduler)
 * - Lifecycle management (cleanup on plugin unload)
 * - Task querying and management
 */

import type { PluginContext } from "@types";

export interface ScheduledTask {
  id: string;
  interval: number;
  handler: () => Promise<void> | void;
  lastRun?: Date;
  nextRun?: Date;
  timerId?: NodeJS.Timeout;
}

export interface SchedulerAPI {
  /**
   * Schedule a task to run at a fixed interval
   * @param id - Unique identifier for this task
   * @param interval - Interval in milliseconds
   * @param handler - Function to execute on each interval
   */
  interval(id: string, interval: number, handler: () => Promise<void> | void): void;

  /**
   * Cancel a scheduled task
   * @param id - Task identifier
   * @returns true if task was found and cancelled
   */
  cancel(id: string): boolean;

  /**
   * Get all scheduled tasks
   * @returns Array of scheduled tasks
   */
  getTasks(): ScheduledTask[];

  /**
   * Get a specific task by ID
   * @param id - Task identifier
   * @returns The task or undefined
   */
  getTask(id: string): ScheduledTask | undefined;

  /**
   * Cleanup all scheduled tasks
   * Called on plugin unload
   */
  cleanup(): void;
}

export function createScheduler(ctx: PluginContext): SchedulerAPI {
  const tasks = new Map<string, ScheduledTask>();

  /**
   * Wraps the user's handler with error handling and timing updates
   */
  function wrapHandler(task: ScheduledTask): () => void {
    return async () => {
      try {
        task.lastRun = new Date();
        task.nextRun = new Date(Date.now() + task.interval);

        await task.handler();
      } catch (error) {
        ctx.logger.error(`Scheduled task "${task.id}" failed:`, error);
      }
    };
  }

  const api: SchedulerAPI = {
    interval(id: string, interval: number, handler: () => Promise<void> | void): void {
      // Cancel existing task with same ID
      if (tasks.has(id)) {
        api.cancel(id);
        ctx.logger.debug(`Rescheduling existing task: ${id}`);
      }

      // Validate interval
      if (interval < 1000) {
        ctx.logger.warn(`Task "${id}" has very short interval (${interval}ms). Consider increasing it.`);
      }

      // Create task
      const task: ScheduledTask = {
        id,
        interval,
        handler,
        nextRun: new Date(Date.now() + interval),
      };

      // Start interval
      const wrappedHandler = wrapHandler(task);
      task.timerId = setInterval(wrappedHandler, interval);

      tasks.set(id, task);
      ctx.logger.debug(`Scheduled task "${id}" with ${interval}ms interval`);
    },

    cancel(id: string): boolean {
      const task = tasks.get(id);
      if (!task) {
        return false;
      }

      if (task.timerId) {
        clearInterval(task.timerId);
      }

      tasks.delete(id);
      ctx.logger.debug(`Cancelled task: ${id}`);
      return true;
    },

    getTasks(): ScheduledTask[] {
      return Array.from(tasks.values()).map(task => ({
        id: task.id,
        interval: task.interval,
        handler: task.handler,
        lastRun: task.lastRun,
        nextRun: task.nextRun,
        // Don't expose timerId
      }));
    },

    getTask(id: string): ScheduledTask | undefined {
      const task = tasks.get(id);
      if (!task) {
        return undefined;
      }

      return {
        id: task.id,
        interval: task.interval,
        handler: task.handler,
        lastRun: task.lastRun,
        nextRun: task.nextRun,
      };
    },

    cleanup(): void {
      ctx.logger.info(`Cleaning up ${tasks.size} scheduled tasks`);

      for (const task of tasks.values()) {
        if (task.timerId) {
          clearInterval(task.timerId);
        }
      }

      tasks.clear();
    },
  };

  return api;
}
