import type { Logger } from "../types";

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function timestamp(): string {
  return new Date().toISOString().split("T")[1].slice(0, 8);
}

export function createLogger(prefix: string): Logger {
  const tag = `[${prefix}]`;

  return {
    info(message: string, ...args: unknown[]) {
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.cyan}INFO${colors.reset}  ${tag} ${message}`,
        ...args
      );
    },
    warn(message: string, ...args: unknown[]) {
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.yellow}WARN${colors.reset}  ${tag} ${message}`,
        ...args
      );
    },
    error(message: string, ...args: unknown[]) {
      console.log(
        `${colors.dim}${timestamp()}${colors.reset} ${colors.red}ERROR${colors.reset} ${tag} ${message}`,
        ...args
      );
    },
    debug(message: string, ...args: unknown[]) {
      if (process.env.DEBUG) {
        console.log(
          `${colors.dim}${timestamp()} DEBUG ${tag} ${message}${colors.reset}`,
          ...args
        );
      }
    },
  };
}
