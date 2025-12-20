import type { Message } from "discord.js";
import type { Event, PluginContext } from "@types";
import type { EconomyAPI } from "../plugin";

/**
 * Create message earning event handler
 * Awards coins to users when they send messages (with cooldown)
 */
export function createMessageEarnEvent<T>(
  ctx: PluginContext<T extends { enabled: boolean; earnAmount: number; currencyName: string } ? T : any>,
  economyAPI: EconomyAPI
): Event<"messageCreate"> {
  return {
    name: "messageCreate",

    async execute(ctx, message: Message) {
      // Validation checks
      if (!(ctx.config as any).enabled) return;
      if (message.author.bot) return;
      if (!message.guildId) return;

      try {
        // Attempt to award earnings (will fail if on cooldown)
        const newBalance = await economyAPI.awardMessageEarning(message.guildId, message.author.id);

        // If newBalance is not null, user earned coins
        if (newBalance !== null) {
          const config = ctx.config as any;
          ctx.logger.debug(
            `Awarded ${config.earnAmount} ${config.currencyName} to ${message.author.tag} ` +
            `in ${message.guild?.name} (new balance: ${newBalance})`
          );
        }
      } catch (error) {
        ctx.logger.error("Failed to award message earning:", error);
      }
    },
  };
}
