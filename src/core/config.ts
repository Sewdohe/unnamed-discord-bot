import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { parse, stringify } from "yaml";
import { z } from "zod";
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

  if (!pluginConfig) {
    return {} as z.infer<T>;
  }

  const { schema, defaults } = pluginConfig;

  if (!existsSync(configPath)) {
    logger.info(`Creating default config for ${pluginName}`);
    
    let configToWrite = defaults;
    try {
      const deepDefaults = schema.parse({});
      configToWrite = deepDefaults;
    } catch (e) {
      logger.debug(`Could not generate deep defaults for ${pluginName}, using provided defaults.`);
    }

    const yamlContent = generateYamlWithComments(configToWrite, schema);
    writeFileSync(configPath, yamlContent, "utf-8");
    return configToWrite;
  }

  try {
    const fileContent = readFileSync(configPath, "utf-8");
    const parsed = parse(fileContent);
    const merged = { ...defaults, ...parsed };
    const validated = schema.parse(merged);
    return validated;
  } catch (error) {
    logger.error(`Invalid config for ${pluginName}:`, error);
    logger.warn(`Using default config for ${pluginName}`);
    return defaults;
  }
}

export function savePluginConfig<T extends z.ZodType>(
  pluginName: string,
  newConfig: z.infer<T>,
  pluginConfig?: PluginConfig<T>
): void {
  ensureConfigDir();

  const configPath = join(CONFIG_DIR, `${pluginName}.yaml`);

  if (!pluginConfig) {
    logger.warn(`Cannot save config for ${pluginName}: no schema defined.`);
    return;
  }

  try {
    const yamlContent = generateYamlWithComments(newConfig, pluginConfig.schema);
    writeFileSync(configPath, yamlContent, "utf-8");
    logger.debug(`Saved config for ${pluginName}`);
  } catch (error) {
    logger.error(`Failed to save config for ${pluginName}:`, error);
  }
}

function zodTypeToString(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    const unwrapped = schema._def.innerType; // Corrected line
    if (unwrapped instanceof z.ZodObject || unwrapped instanceof z.ZodArray) {
        return zodTypeToString(unwrapped);
    }
    return `${zodTypeToString(unwrapped)} | undefined`;
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const entries = Object.entries(shape).map(([key, value]) => {
      const isOptional = value instanceof z.ZodOptional || value instanceof z.ZodDefault;
      return `${key}${isOptional ? "?" : ""}: ${zodTypeToString(value)}`;
    });
    return `{ ${entries.join(", ")} }`;
  }
  if (schema instanceof z.ZodArray) {
    return `Array<${zodTypeToString(schema.element)}>`;
  }
  if (schema instanceof z.ZodEnum) {
    return schema.options.map((option: string) => `"${option}"`).join(" | ");
  }
  if (schema instanceof z.ZodUnion) {
      return schema.options.map(zodTypeToString).join(" | ");
  }
  if (schema instanceof z.ZodLiteral) {
      return `"${schema.value}"`;
  }
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";

  return "any";
}

function generateYamlWithComments<T>(
  config: T,
  schema: z.ZodType
): string {
  const header = schema.description
    ? `# ${schema.description}\n\n`
    : "";

  const descriptions = extractFieldDescriptions(schema);
  const yaml = stringify(config, { indent: 2, lineWidth: 80 });
  const yamlWithComments = addInlineComments(yaml, descriptions);

  return header + yamlWithComments;
}

function extractFieldDescriptions(schema: z.ZodType, prefix = ""): Record<string, string> {
  const descriptions: Record<string, string> = {};

  let unwrappedSchema: any = schema;
  while (unwrappedSchema instanceof z.ZodDefault || unwrappedSchema instanceof z.ZodOptional) {
    unwrappedSchema = unwrappedSchema._def.innerType;
  }

  if (unwrappedSchema instanceof z.ZodObject) {
    const shape = unwrappedSchema.shape;
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const desc = (fieldSchema as any).description;
      
      let unwrappedField: any = fieldSchema;
      while (unwrappedField instanceof z.ZodDefault || unwrappedField instanceof z.ZodOptional) {
          unwrappedField = unwrappedField._def.innerType;
      }

      if (unwrappedField instanceof z.ZodArray) {
        let comment = desc ? `${desc}\n` : '';
        comment += `# Each item should have the following structure:\n# ${zodTypeToString(unwrappedField.element)}`;
        descriptions[fullKey] = comment;
      } else if (desc) {
        descriptions[fullKey] = desc;
      }

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

    if (!trimmed || trimmed.startsWith("#")) {
      result.push(line);
      continue;
    }

    const match = line.match(/^(\s*)([^:]+):/);
    if (match) {
      const indent = match[1] || "";
      const key = match[2].trim();

      const fullPath = buildPath(lines, i);
      const description = descriptions[fullPath] || descriptions[key];

      if (description) {
        const commentLines = description.split('\n');
        commentLines.forEach(commentLine => {
            if (commentLine.startsWith('#')) {
                 result.push(`${indent}${commentLine}`);
            } else {
                 result.push(`${indent}# ${commentLine}`);
            }
        });
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

function buildPath(lines: string[], currentIndex: number): string {
  const pathStack: { indent: number, key: string }[] = [];
  for (let i = 0; i <= currentIndex; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)([^:]+):/);
    if (match) {
      const indent = match[1].length;
      const key = match[2].trim();
      
      while (pathStack.length > 0 && pathStack[pathStack.length - 1].indent >= indent) {
        pathStack.pop();
      }
      pathStack.push({ indent, key });
    }
  }

  if (lines[currentIndex].match(/^(\s*)([^:]+):/)) {
    return pathStack.map(p => p.key).join('.');
  }

  return '';
}
