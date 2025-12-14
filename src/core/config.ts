import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parse, stringify } from "yaml";
import type { z } from "zod";
import type { PluginConfig } from "../types/";
import { createLogger } from "./logger";

const logger = createLogger("config");

const CONFIG_DIR = join(process.cwd(), "config");

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadPluginConfig<T extends z.ZodType>(
  pluginName: string,
  pluginConfig?: PluginConfig<T>
): z.infer<T> {
  ensureConfigDir();

  const configPath = join(CONFIG_DIR, `${pluginName}.yaml`);

  // If no config schema defined, return empty object
  if (!pluginConfig) {
    return {} as z.infer<T>;
  }

  const { schema, defaults } = pluginConfig;

  // If config file doesn't exist, create it with defaults
  if (!existsSync(configPath)) {
    logger.info(`Creating default config for ${pluginName}`);
    const yamlContent = generateYamlWithComments(defaults, schema);
    writeFileSync(configPath, yamlContent, "utf-8");
    return defaults;
  }

  // Load and parse existing config
  try {
    const fileContent = readFileSync(configPath, "utf-8");
    const parsed = parse(fileContent);

    // Merge with defaults (in case new fields were added)
    const merged = { ...defaults, ...parsed };

    // Validate against schema
    const validated = schema.parse(merged);

    return validated;
  } catch (error) {
    logger.error(`Invalid config for ${pluginName}:`, error);
    logger.warn(`Using default config for ${pluginName}`);
    return defaults;
  }
}

function generateYamlWithComments<T>(
  defaults: T,
  schema: z.ZodType
): string {
  // Get schema description if available
  const header = schema.description
    ? `# ${schema.description}\n\n`
    : "";

  // Extract field descriptions from schema
  const descriptions = extractFieldDescriptions(schema);

  // Generate YAML from defaults
  const yaml = stringify(defaults, {
    indent: 2,
    lineWidth: 80,
  });

  // Add inline comments to YAML
  const yamlWithComments = addInlineComments(yaml, descriptions);

  return header + yamlWithComments;
}

function extractFieldDescriptions(schema: z.ZodType, prefix = ""): Record<string, string> {
  const descriptions: Record<string, string> = {};

  // Unwrap ZodDefault and ZodOptional to get to the underlying schema
  let unwrapped: any = schema;
  while (unwrapped._def?.typeName === "ZodDefault" || unwrapped._def?.typeName === "ZodOptional") {
    if (unwrapped._def.innerType) {
      unwrapped = unwrapped._def.innerType;
    } else {
      break;
    }
  }

  // Handle ZodObject
  if (unwrapped._def?.typeName === "ZodObject") {
    const shape = unwrapped._def.shape();
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const desc = (fieldSchema as any).description;

      if (desc) {
        descriptions[fullKey] = desc;
      }

      // Recursively handle nested objects (including wrapped ones)
      Object.assign(descriptions, extractFieldDescriptions(fieldSchema as any, fullKey));
    }
  }

  return descriptions;
}

function addInlineComments(yaml: string, descriptions: Record<string, string>): string {
  const lines = yaml.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      result.push(line);
      continue;
    }

    // Extract the key from the line
    const match = line.match(/^(\s*)([^:]+):/);
    if (match) {
      const indent = match[1];
      const key = match[2].trim();

      // Build the full path by looking at indentation
      const fullPath = buildPath(lines.slice(0, i + 1), i);
      const description = descriptions[fullPath] || descriptions[key];

      if (description) {
        // Add comment above the line
        result.push(`${indent}# ${description}`);
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

function buildPath(lines: string[], currentIndex: number): string {
  const path: string[] = [];
  let currentIndent = lines[currentIndex].match(/^(\s*)/)?.[1].length ?? 0;

  // Walk backwards to build the path
  for (let i = currentIndex; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    const match = lines[i].match(/^(\s*)([^:]+):/);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2].trim();

    if (i === currentIndex) {
      path.unshift(key);
      currentIndent = indent;
    } else if (indent < currentIndent) {
      path.unshift(key);
      currentIndent = indent;
    }
  }

  return path.join(".");
}
