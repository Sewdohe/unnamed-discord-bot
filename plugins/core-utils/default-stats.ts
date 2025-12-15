/**
 * Default Stats Tracker for Core Utils
 *
 * Automatically tracks basic bot statistics when the statistics plugin is present.
 *
 * Tracked metrics:
 * - Uptime (time since bot started)
 * - Message count (total messages seen)
 * - Command count (total slash commands executed)
 * - Active users (unique users in last 24 hours)
 * - Total members (across all guilds)
 * - Total channels (across all guilds)
 */

import type { PluginContext } from "@types";
import type { Message, Client } from "discord.js";

export interface DefaultStats {
  uptime: string;
  uptimeMs: number;
  messageCount: number;
  commandCount: number;
  activeUsers24h: number;
  totalMembers: number;
  totalChannels: number;
  totalGuilds: number;
}

export class DefaultStatsTracker {
  private startTime: Date;
  private messageCount: number = 0;
  private commandCount: number = 0;
  private activeUsers: Map<string, number> = new Map(); // userId -> last activity timestamp
  private ctx: PluginContext;
  private client: Client;

  constructor(ctx: PluginContext, client: Client) {
    this.ctx = ctx;
    this.client = client;
    this.startTime = new Date();

    // Start cleanup interval for active users (run every hour)
    setInterval(() => this.cleanupActiveUsers(), 60 * 60 * 1000);
  }

  /**
   * Track a message
   * @param message - Discord message object
   */
  trackMessage(message: Message): void {
    if (message.author.bot) return;

    this.messageCount++;
    this.activeUsers.set(message.author.id, Date.now());
  }

  /**
   * Track a command execution
   * @param userId - User who executed the command (optional)
   */
  trackCommand(userId?: string): void {
    this.commandCount++;

    if (userId) {
      this.activeUsers.set(userId, Date.now());
    }
  }

  /**
   * Track user activity manually
   * @param userId - User ID
   */
  trackActivity(userId: string): void {
    this.activeUsers.set(userId, Date.now());
  }

  /**
   * Get current statistics snapshot
   * @returns Current stats
   */
  getStats(): DefaultStats {
    const uptimeMs = Date.now() - this.startTime.getTime();
    const uptime = this.formatUptime(uptimeMs);

    // Count active users (last 24 hours)
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const activeUsers24h = Array.from(this.activeUsers.values()).filter(
      timestamp => now - timestamp < oneDayMs
    ).length;

    // Count total members and channels across all guilds
    let totalMembers = 0;
    let totalChannels = 0;

    for (const guild of this.client.guilds.cache.values()) {
      totalMembers += guild.memberCount;
      totalChannels += guild.channels.cache.size;
    }

    return {
      uptime,
      uptimeMs,
      messageCount: this.messageCount,
      commandCount: this.commandCount,
      activeUsers24h,
      totalMembers,
      totalChannels,
      totalGuilds: this.client.guilds.cache.size,
    };
  }

  /**
   * Format uptime duration
   * @param ms - Milliseconds
   * @returns Formatted string (e.g., "2d 3h 45m")
   */
  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts: string[] = [];

    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 && parts.length === 0) parts.push(`${seconds % 60}s`);

    return parts.length > 0 ? parts.join(" ") : "0s";
  }

  /**
   * Remove users who haven't been active in over 24 hours
   */
  private cleanupActiveUsers(): void {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const beforeSize = this.activeUsers.size;

    for (const [userId, timestamp] of this.activeUsers.entries()) {
      if (now - timestamp > oneDayMs) {
        this.activeUsers.delete(userId);
      }
    }

    const removed = beforeSize - this.activeUsers.size;
    if (removed > 0) {
      this.ctx.logger.debug(`Cleaned up ${removed} inactive users from active users tracker`);
    }
  }

  /**
   * Reset all statistics (useful for testing)
   */
  reset(): void {
    this.startTime = new Date();
    this.messageCount = 0;
    this.commandCount = 0;
    this.activeUsers.clear();
    this.ctx.logger.info("Reset all default statistics");
  }
}

/**
 * Create and initialize the default stats tracker
 */
export function createDefaultStatsTracker(ctx: PluginContext, client: Client): DefaultStatsTracker {
  const tracker = new DefaultStatsTracker(ctx, client);
  ctx.logger.debug("Created default stats tracker");
  return tracker;
}
