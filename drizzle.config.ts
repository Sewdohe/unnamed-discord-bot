import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  dbCredentials: {
    url: "file:./data/bot.db",
  },
  out: "./drizzle",
});
