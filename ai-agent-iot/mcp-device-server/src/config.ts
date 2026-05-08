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
  port: numberEnv("PORT", 4001, { integer: true, min: 1, max: 65535 }),
  mcpPath: process.env.MCP_PATH ?? "/mcp",
  backendBaseUrl: process.env.DEVICE_BACKEND_BASE_URL ?? "https://iot.api.bmscontrols.vn",
  demoDeviceCode: process.env.DEMO_DEVICE_CODE ?? "MLM"
};
