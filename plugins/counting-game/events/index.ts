import type { PluginContext, Event } from "@types";
import type { CoreUtilsAPI } from "../../core-utils/plugin";
import type { CountingGameRepository, UserStatsRepository } from "../db/repository";
import type { Message } from "discord.js";

// ============ Configuration Type ============

export type CountingGameConfig = {
  enabled: boolean;
  countingChannels: string[];
  alternatingAccounts: boolean;
  allowTalking: boolean;
  reactions: {
    success: string;
    failure: string;
  };
  resetOnFail: boolean;
};

// ============ Message Handler ============

export function createMessageHandler(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  statsRepo: UserStatsRepository
): Event<"messageCreate"> {
  return {
    name: "messageCreate",
    async execute(ctx, message: Message) {
      // Ignore bots
      if (message.author.bot) return;

      // Ignore DMs
      if (!message.guildId) return;

      // Check if this is a counting channel
      const game = await gameRepo.getGame(message.guildId, message.channelId);
      if (!game) return;

      // Extract the number from the message
      const content = message.content.trim();
      const numberMatch = content.match(/^(\d+)/);

      // If no number found
      if (!numberMatch) {
        // If talking is not allowed, delete the message
        if (!ctx.config.allowTalking) {
          try {
            await message.delete();
            const warning = await message.channel.send(
              `${message.author}, only counting messages are allowed in this channel!`
            );
            setTimeout(() => warning.delete().catch(() => {}), 3000);
          } catch (error) {
            ctx.logger.debug("Could not delete non-counting message");
          }
        }
        return;
      }

      const number = parseInt(numberMatch[1], 10);
      const expectedNumber = game.current_count + 1;

      // Check if it's the correct number
      if (number !== expectedNumber) {
        // Wrong number!
        await handleWrongNumber(
          ctx,
          api,
          gameRepo,
          statsRepo,
          message,
          number,
          expectedNumber,
          game.current_count
        );
        return;
      }

      // Check alternating accounts rule
      if (ctx.config.alternatingAccounts && game.last_user_id === message.author.id) {
        // Same user counting twice in a row!
        await handleSameUser(
          ctx,
          api,
          gameRepo,
          statsRepo,
          message,
          game.current_count
        );
        return;
      }

      // Correct count!
      await handleCorrectCount(
        ctx,
        api,
        gameRepo,
        statsRepo,
        message,
        number
      );
    },
  };
}

// ============ Handler Functions ============

async function handleCorrectCount(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  statsRepo: UserStatsRepository,
  message: Message,
  number: number
) {
  // Update game state
  const updatedGame = await gameRepo.incrementCount(
    message.guildId!,
    message.channelId,
    message.author.id,
    message.id
  );

  // Update user stats
  await statsRepo.recordSuccess(message.guildId!, message.author.id, number);

  // Add success reaction
  try {
    await message.react(ctx.config.reactions.success);
  } catch (error) {
    ctx.logger.debug("Could not add success reaction");
  }

  // Check for milestones
  if (number % 100 === 0) {
    await message.reply(`🎉 Milestone reached! Count: **${number}**`);
  } else if (number === updatedGame.high_score && number > 10) {
    await message.reply(`🏆 New high score! Count: **${number}**`);
  }

  ctx.logger.debug(`Correct count: ${number} by ${message.author.tag}`);
}

async function handleWrongNumber(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  statsRepo: UserStatsRepository,
  message: Message,
  attempted: number,
  expected: number,
  currentCount: number
) {
  // Record failure
  await statsRepo.recordFailure(message.guildId!, message.author.id);

  // Add failure reaction
  try {
    await message.react(ctx.config.reactions.failure);
  } catch (error) {
    ctx.logger.debug("Could not add failure reaction");
  }

  // Send failure message
  const embed = api.embeds.error(
    `${message.author} broke the count at **${currentCount}**!\n\n` +
    `Expected: **${expected}**\n` +
    `Got: **${attempted}**\n\n` +
    `${ctx.config.resetOnFail ? "The count has been reset to **0**. Start again with **1**!" : `Continue with **${expected}**!`}`,
    "❌ Wrong Number!"
  );

  await message.channel.send({ embeds: [embed] });

  // Reset if configured
  if (ctx.config.resetOnFail) {
    await gameRepo.resetCount(message.guildId!, message.channelId);
  }

  ctx.logger.info(
    `Wrong count in ${message.channelId}: ${attempted} (expected ${expected}) by ${message.author.tag}`
  );
}

async function handleSameUser(
  ctx: PluginContext<CountingGameConfig>,
  api: CoreUtilsAPI,
  gameRepo: CountingGameRepository,
  statsRepo: UserStatsRepository,
  message: Message,
  currentCount: number
) {
  // Record failure
  await statsRepo.recordFailure(message.guildId!, message.author.id);

  // Add failure reaction
  try {
    await message.react(ctx.config.reactions.failure);
  } catch (error) {
    ctx.logger.debug("Could not add failure reaction");
  }

  // Send failure message
  const embed = api.embeds.error(
    `${message.author} broke the count at **${currentCount}**!\n\n` +
    `You can't count twice in a row!\n\n` +
    `${ctx.config.resetOnFail ? "The count has been reset to **0**. Start again with **1**!" : `Continue with **${currentCount + 1}**!`}`,
    "❌ Same User!"
  );

  await message.channel.send({ embeds: [embed] });

  // Reset if configured
  if (ctx.config.resetOnFail) {
    await gameRepo.resetCount(message.guildId!, message.channelId);
  }

  ctx.logger.info(
    `Same user counting twice in ${message.channelId}: ${message.author.tag}`
  );
}
