/**
 * Embed Manager
 *
 * Handles creation and updating of the statistics embed.
 * Manages a pinned message that is edited in place for updates.
 */

import { EmbedBuilder, TextChannel, Message } from "discord.js";
import type { PluginContext } from "@types";
import type { CollectedStats } from "./collector";

export class EmbedManager {
  private ctx: PluginContext;
  private embedColor: number;
  private pinnedMessage: Message | null = null;
  private channelId: string | null = null;

  constructor(ctx: PluginContext, embedColor: number) {
    this.ctx = ctx;
    this.embedColor = embedColor;
  }

  /**
   * Set the channel for statistics display
   * @param channelId - Discord channel ID
   */
  setChannel(channelId: string): void {
    this.channelId = channelId;
    this.pinnedMessage = null; // Reset pinned message when channel changes
    this.ctx.logger.info(`Statistics channel set to: ${channelId}`);
  }

  /**
   * Get the current channel ID
   */
  getChannelId(): string | null {
    return this.channelId;
  }

  /**
   * Create the statistics embed from collected data
   * @param stats - Collected statistics by category
   * @param lastUpdate - Last update timestamp
   * @returns EmbedBuilder
   */
  createEmbed(stats: CollectedStats[], lastUpdate: Date): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle("📊 Bot Statistics")
      .setColor(this.embedColor)
      .setTimestamp(lastUpdate)
      .setFooter({ text: "Last updated" });

    if (stats.length === 0) {
      embed.setDescription("*No statistics available*");
      return embed;
    }

    // Add fields for each category
    for (const category of stats) {
      const lines: string[] = [];

      for (const [name, value] of Object.entries(category.stats)) {
        lines.push(`**${name}:** ${value}`);
      }

      const fieldValue = lines.length > 0 ? lines.join("\n") : "*No data*";

      embed.addFields({
        name: category.category,
        value: fieldValue,
        inline: false,
      });
    }

    return embed;
  }

  /**
   * Update the statistics display
   * Creates a new pinned message if none exists, otherwise edits the existing one
   *
   * @param stats - Collected statistics
   * @returns true if successful, false otherwise
   */
  async update(stats: CollectedStats[]): Promise<boolean> {
    if (!this.channelId) {
      this.ctx.logger.warn("Cannot update statistics: no channel configured");
      return false;
    }

    try {
      // Fetch the channel
      const channel = await this.ctx.client.channels.fetch(this.channelId);
      if (!channel || !channel.isTextBased()) {
        this.ctx.logger.error(`Statistics channel ${this.channelId} is not a text channel`);
        return false;
      }

      const textChannel = channel as TextChannel;
      const embed = this.createEmbed(stats, new Date());

      // Try to edit existing pinned message
      if (this.pinnedMessage) {
        try {
          await this.pinnedMessage.edit({ embeds: [embed] });
          this.ctx.logger.debug("Updated existing statistics message");

          // Ensure message is still pinned
          if (!this.pinnedMessage.pinned) {
            await this.pinnedMessage.pin();
            this.ctx.logger.debug("Re-pinned statistics message");
          }

          return true;
        } catch (error) {
          this.ctx.logger.warn("Failed to edit existing message, creating new one:", error);
          this.pinnedMessage = null;
        }
      }

      // Create new pinned message
      const newMessage = await textChannel.send({ embeds: [embed] });
      await newMessage.pin();
      this.pinnedMessage = newMessage;
      this.ctx.logger.info("Created new pinned statistics message");

      return true;
    } catch (error) {
      this.ctx.logger.error("Failed to update statistics embed:", error);
      return false;
    }
  }

  /**
   * Force refresh the statistics message
   * Useful for manual updates
   */
  async forceRefresh(stats: CollectedStats[]): Promise<boolean> {
    return this.update(stats);
  }

  /**
   * Clear the pinned message reference
   * Useful when the message is manually deleted
   */
  clearPinnedMessage(): void {
    this.pinnedMessage = null;
    this.ctx.logger.debug("Cleared pinned message reference");
  }

  /**
   * Get the current pinned message ID (if any)
   */
  getPinnedMessageId(): string | null {
    return this.pinnedMessage?.id ?? null;
  }
}

/**
 * Create an embed manager instance
 */
export function createEmbedManager(ctx: PluginContext, embedColor: number): EmbedManager {
  return new EmbedManager(ctx, embedColor);
}
