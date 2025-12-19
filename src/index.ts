import { Bot } from "./core";
import { createLogger } from "./core/logger";

const bot = new Bot();
const logger = createLogger("shutdown");

// Graceful shutdown handlers
let isShuttingDown = false;

async function handleShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn("Force shutdown...");
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully...`);

  try {
    await bot.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
}

// Handle SIGINT (Ctrl+C)
process.on("SIGINT", () => handleShutdown("SIGINT"));

// Handle SIGTERM (kill command)
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  handleShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection:", reason);
  handleShutdown("UNHANDLED_REJECTION");
});

// Start the bot
bot.start().catch((error) => {
  logger.error("Failed to start bot:", error);
  process.exit(1);
});
