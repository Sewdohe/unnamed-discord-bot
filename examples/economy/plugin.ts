import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Plugin, PluginContext, Command } from "@types";

// Config schema
const configSchema = z.object({
  currencyName: z.string().default("coins"),
  currencySymbol: z.string().default("🪙"),
  startingBalance: z.number().default(100),
  dailyAmount: z.number().default(50),
}).describe("Economy plugin configuration");

type EconomyConfig = z.infer<typeof configSchema>;

const plugin: Plugin<typeof configSchema> = {
  manifest: {
    name: "economy",
    version: "1.0.0",
    description: "Basic economy system with wallets",
    author: "Sewdohe",
    commandGroup: {
      name: "economy",
      description: "Economy commands",
    },
    dependencies: {
      // Example: this plugin has no dependencies
      // hard: ["some-required-plugin"],
      // soft: ["some-optional-plugin"],
    },
  },

  config: {
    schema: configSchema,
    defaults: {
      currencyName: "coins",
      currencySymbol: "🪙",
      startingBalance: 100,
      dailyAmount: 50,
    },
  },

  async onLoad(ctx: PluginContext<EconomyConfig>) {
    // Initialize database table
    await initDatabase(ctx);

    // Register commands
    ctx.registerCommand(balanceCommand(ctx));
    ctx.registerCommand(dailyCommand(ctx));

    ctx.logger.info("Economy plugin ready!");
  },
};

async function initDatabase(ctx: PluginContext<EconomyConfig>) {
  const tableName = `${ctx.dbPrefix}wallets`;

  // Create wallets table if it doesn't exist
  ctx.db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT ${ctx.config.startingBalance},
      last_daily TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `));

  ctx.logger.debug(`Initialized table: ${tableName}`);
}

function getOrCreateWallet(
  ctx: PluginContext<EconomyConfig>,
  userId: string
): { balance: number; last_daily: string | null } {
  const tableName = `${ctx.dbPrefix}wallets`;

  // Try to get existing wallet
  const result = ctx.db.get<{ balance: number; last_daily: string | null }>(
    sql.raw(`SELECT balance, last_daily FROM ${tableName} WHERE user_id = '${userId}'`)
  );

  if (result) return result;

  // Create new wallet
  ctx.db.run(
    sql.raw(`INSERT INTO ${tableName} (user_id, balance) VALUES ('${userId}', ${ctx.config.startingBalance})`)
  );

  return { balance: ctx.config.startingBalance, last_daily: null };
}

function balanceCommand(ctx: PluginContext<EconomyConfig>): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("balance")
      .setDescription("Check your wallet balance"),

    async execute(interaction) {
      const wallet = getOrCreateWallet(ctx, interaction.user.id);
      const { currencySymbol, currencyName } = ctx.config;

      await interaction.reply(
        `${currencySymbol} You have **${wallet.balance}** ${currencyName}`
      );
    },
  };
}

function dailyCommand(ctx: PluginContext<EconomyConfig>): Command {
  return {
    data: new SlashCommandBuilder()
      .setName("daily")
      .setDescription("Claim your daily reward"),

    async execute(interaction) {
      const tableName = `${ctx.dbPrefix}wallets`;
      const userId = interaction.user.id;
      const wallet = getOrCreateWallet(ctx, userId);
      const { currencySymbol, currencyName, dailyAmount } = ctx.config;

      // Check if already claimed today
      const today = new Date().toISOString().split("T")[0];

      if (wallet.last_daily === today) {
        await interaction.reply({
          content: "⏰ You've already claimed your daily reward today!",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update balance and last_daily
      const newBalance = wallet.balance + dailyAmount;
      ctx.db.run(
        sql.raw(`UPDATE ${tableName} SET balance = ${newBalance}, last_daily = '${today}' WHERE user_id = '${userId}'`)
      );

      await interaction.reply(
        `${currencySymbol} You claimed **${dailyAmount}** ${currencyName}! New balance: **${newBalance}**`
      );
    },
  };
}

export default plugin;
