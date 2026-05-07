import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const levelPriority: Record<LogLevel | "silent", number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

type LogEvent = Record<string, unknown> & {
  event: string;
  user_message?: string;
};

export function buildLogPayload(event: LogEvent) {
  if (config.logUserMessages) {
    return event;
  }
  const { user_message, ...payload } = event;
  return payload;
}

export function logEvent(level: LogLevel, event: LogEvent) {
  if (levelPriority[level] < levelPriority[config.logLevel]) {
    return;
  }
  const payload = buildLogPayload(event);
  const line = JSON.stringify({ level, ...payload });
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}
