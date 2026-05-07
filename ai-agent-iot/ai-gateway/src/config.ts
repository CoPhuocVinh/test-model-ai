import { z } from "zod";

const logLevelSchema = z.enum(["debug", "info", "warn", "error", "silent"]);

function stringEnv(name: string, defaultValue: string) {
  return process.env[name] ?? defaultValue;
}

function booleanEnv(name: string, defaultValue: boolean) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  if (["true", "1", "yes", "on"].includes(raw.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(raw.toLowerCase())) return false;
  throw new Error(`Invalid boolean env ${name}: ${raw}`);
}

function numberEnv(name: string, defaultValue: number, options: { integer?: boolean; min?: number; max?: number } = {}) {
  const raw = process.env[name];
  const value = raw === undefined ? defaultValue : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric env ${name}: ${raw}`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`Invalid integer env ${name}: ${raw ?? defaultValue}`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`Env ${name} must be >= ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`Env ${name} must be <= ${options.max}`);
  }
  return value;
}

export const config = {
  port: numberEnv("PORT", 4000, { integer: true, min: 1, max: 65535 }),
  ollamaBaseUrl: stringEnv("OLLAMA_BASE_URL", "http://localhost:11434"),
  ollamaModel: stringEnv("OLLAMA_MODEL", "qwen2.5:3b"),
  ollamaFormat: stringEnv("OLLAMA_FORMAT", "json"),
  ollamaTemperature: numberEnv("OLLAMA_TEMPERATURE", 0, { min: 0 }),
  mcpDeviceServerUrl: stringEnv("MCP_DEVICE_SERVER_URL", "http://localhost:4001/mcp"),
  intentConfidenceThreshold: numberEnv("INTENT_CONFIDENCE_THRESHOLD", 0.65, { min: 0, max: 1 }),
  intentParseMaxRetries: numberEnv("INTENT_PARSE_MAX_RETRIES", 2, { integer: true, min: 0 }),
  llmParseTimeoutMs: numberEnv("LLM_PARSE_TIMEOUT_MS", 300000, { integer: true, min: 1 }),
  llmNumPredict: numberEnv("LLM_NUM_PREDICT", 220, { integer: true, min: 1 }),
  llmRepairNumPredict: numberEnv("LLM_REPAIR_NUM_PREDICT", 80, { integer: true, min: 1 }),
  searchRepairConfidenceThreshold: numberEnv("SEARCH_REPAIR_CONFIDENCE_THRESHOLD", 0.6, { min: 0, max: 1 }),
  messageHistoryTurns: numberEnv("MESSAGE_HISTORY_TURNS", 5, { integer: true, min: 1 }),
  pendingActionTtlSeconds: numberEnv("PENDING_ACTION_TTL_SECONDS", 300, { integer: true, min: 1 }),
  logLevel: logLevelSchema.parse(stringEnv("LOG_LEVEL", "info")),
  logUserMessages: booleanEnv("LOG_USER_MESSAGES", false)
};

export type AppConfig = typeof config;
