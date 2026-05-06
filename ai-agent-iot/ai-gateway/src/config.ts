export const config = {
  port: Number(process.env.PORT ?? 4000),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
  ollamaFormat: process.env.OLLAMA_FORMAT ?? "json",
  ollamaTemperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0),
  mcpDeviceServerUrl: process.env.MCP_DEVICE_SERVER_URL ?? "http://localhost:4001/mcp",
  intentConfidenceThreshold: Number(process.env.INTENT_CONFIDENCE_THRESHOLD ?? 0.65),
  intentParseMaxRetries: Number(process.env.INTENT_PARSE_MAX_RETRIES ?? 2),
  llmParseTimeoutMs: Number(process.env.LLM_PARSE_TIMEOUT_MS ?? 300000),
  llmNumPredict: Number(process.env.LLM_NUM_PREDICT ?? 220),
  llmRepairNumPredict: Number(process.env.LLM_REPAIR_NUM_PREDICT ?? 80),
  messageHistoryTurns: Number(process.env.MESSAGE_HISTORY_TURNS ?? 5),
  pendingActionTtlSeconds: Number(process.env.PENDING_ACTION_TTL_SECONDS ?? 300)
};
