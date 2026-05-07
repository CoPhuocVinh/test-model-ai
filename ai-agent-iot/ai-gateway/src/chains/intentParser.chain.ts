import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";
import { config } from "../config.js";
import type { ChatMessage } from "../stores/conversationStore.js";
import { parsedIntentSchema, type ParsedIntent } from "../schemas/intent.schema.js";
import {
  actionKeywordGroups,
  clarificationIntentTypes,
  currentDeviceReferenceTerms,
  deviceCollectionKeywords,
  deviceListRequestKeywords,
  genericInventoryQueries,
  guardedFallbackIntents,
  harmfulIntentKeywords,
  heuristicConfidence,
  outOfScopeKeywords,
  parserFillerTerms,
  politeCommandPrefixes,
  propertyKeywordGroups,
  readStateKeywords,
  smartHomeKeywords,
  terminalIntentTypes,
  writeCommandKeywords
} from "./intentParser.constants.js";
import { intentParserPrompt, searchRepairPrompt } from "./intentParser.prompts.js";

const rawIntentSchema = z.object({
  intent: z.enum([
    "search_devices",
    "read_device_state",
    "write_device_value",
    "out_of_scope",
    "harmful_intent",
    "clarification_needed",
    "unsupported"
  ]),
  query_scope: z.enum(["all", "filtered", "unknown"]).default("unknown"),
  device_query_text: z.string().default(""),
  operation_text: z.string().nullable().default(null),
  property_hint: z.string().nullable().default(null),
  value_hint: z.unknown().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0.5)
});

type RawIntent = z.infer<typeof rawIntentSchema>;

const searchRepairSchema = z.object({
  query_scope: z.enum(["all", "filtered", "unknown"]).default("unknown"),
  device_query_text: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5)
});

type ChatOllamaOptions = ConstructorParameters<typeof ChatOllama>[0];

export function buildIntentParserModelOptions(): ChatOllamaOptions {
  return {
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    temperature: config.ollamaTemperature,
    format: config.ollamaFormat,
    numPredict: config.llmNumPredict
  };
}

export function buildSearchRepairModelOptions(): ChatOllamaOptions {
  return {
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    temperature: config.ollamaTemperature,
    format: config.ollamaFormat,
    numPredict: config.llmRepairNumPredict
  };
}

export function shouldAcceptSearchRepairAll(confidence: number) {
  return confidence >= config.searchRepairConfidenceThreshold;
}

function extractJson(content: unknown) {
  const text = Array.isArray(content)
    ? content.map((part) => (typeof part === "string" ? part : "text" in part ? part.text : "")).join("")
    : String(content ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

function normalizeVietnamese(input: string) {
  return input.trim().toLowerCase();
}

function cleanQueryText(input: string) {
  let text = normalizeVietnamese(input)
    .replace(/[?.!,]/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(độ|do|c|°|%|phần trăm|phan tram)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const term of [...parserFillerTerms].sort((a, b) => b.length - a.length)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "g"), "$1");
  }

  return text.replace(/\s+/g, " ").trim();
}

function extractNumber(text: string) {
  const match = normalizeVietnamese(text).match(/(\d+(?:[.,]\d+)?)/);
  return match ? Number(match[1].replace(",", ".")) : undefined;
}

function isGenericDeviceListQuery(queryText: string) {
  const query = cleanQueryText(queryText);
  return query.length === 0 || genericInventoryQueries.includes(query);
}

function hasAnyKeyword(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGenericDeviceListRequest(message: string, raw: RawIntent) {
  if (raw.intent !== "search_devices") return false;
  if (raw.query_scope === "all") return true;
  if (raw.query_scope === "filtered") return false;
  const text = normalizeVietnamese(message);
  const cleanedRawQuery = cleanQueryText(raw.device_query_text);
  const mentionsDeviceCollection = hasAnyKeyword(text, deviceCollectionKeywords);
  return cleanedRawQuery.length === 0 || mentionsDeviceCollection;
}

function inferProperty(text: string): string | null {
  const value = normalizeVietnamese(text);
  for (const group of propertyKeywordGroups) {
    if (hasAnyKeyword(value, group.keywords)) {
      return group.property;
    }
  }
  return null;
}

function inferAction(text: string, propertyHint?: string | null, valueHint?: unknown): ParsedIntent["action"] {
  const value = normalizeVietnamese(text);
  const property = propertyHint ?? inferProperty(value);
  const numericValue = typeof valueHint === "number" ? valueHint : extractNumber(value);

  if (hasAnyKeyword(value, actionKeywordGroups.powerOn)) {
    return { property: property ?? "power", operation: "set", value: true };
  }
  if (hasAnyKeyword(value, actionKeywordGroups.powerOff)) {
    return { property: property ?? "power", operation: "set", value: false };
  }
  if (hasAnyKeyword(value, actionKeywordGroups.add)) {
    return { property: property ?? "temperature", operation: "add", value: numericValue ?? 1 };
  }
  if (hasAnyKeyword(value, actionKeywordGroups.subtract)) {
    return { property: property ?? "temperature", operation: "subtract", value: numericValue ?? 1 };
  }
  if (numericValue !== undefined && (hasAnyKeyword(value, actionKeywordGroups.set) || property)) {
    return { property: property ?? "temperature", operation: "set", value: numericValue };
  }
  if (property && valueHint !== null && valueHint !== undefined) {
    return { property, operation: "set", value: valueHint };
  }
  return null;
}

function inferHistoryDeviceQueryText(history: ChatMessage[] = []) {
  for (const item of [...history].reverse()) {
    if (item.role !== "user") continue;
    const candidate = cleanQueryText(item.content);
    if (candidate) return candidate;
  }
  return "";
}

function hasCurrentDeviceReference(message: string) {
  const text = normalizeVietnamese(message);
  return !hasAnyKeyword(text, currentDeviceReferenceTerms);
}

function startsWithWriteCommand(message: string) {
  let text = normalizeVietnamese(message).trim();
  let previous = "";
  const politePrefixPattern = new RegExp(`^(${politeCommandPrefixes.map(escapeRegExp).join("|")})\\s+`, "g");
  const writeCommandPattern = new RegExp(`^(${writeCommandKeywords.map(escapeRegExp).join("|")})(\\s|$)`);
  while (previous !== text) {
    previous = text;
    text = text.replace(politePrefixPattern, "").trim();
  }
  return writeCommandPattern.test(text);
}

function toParsedIntent(raw: RawIntent, message: string, history: ChatMessage[] = []): ParsedIntent {
  const operationText = raw.operation_text ?? message;
  const currentQueryText = cleanQueryText(raw.device_query_text || message);
  const historyQueryText = inferHistoryDeviceQueryText(history);
  const deviceQueryText = raw.intent === "search_devices"
    ? currentQueryText
    : currentQueryText && hasCurrentDeviceReference(message) ? currentQueryText : historyQueryText;
  const property = raw.property_hint ?? inferProperty(operationText);
  const action = raw.intent === "write_device_value" ? inferAction(operationText, property, raw.value_hint) : null;

  const device_query = isGenericDeviceListRequest(message, raw) || isGenericDeviceListQuery(deviceQueryText) ? {} : { raw: deviceQueryText };
  return parsedIntentSchema.parse({
    intent: raw.intent,
    device_query,
    property,
    action,
    confidence: raw.confidence
  });
}

export function heuristicParseIntent(message: string, history: ChatMessage[] = []): ParsedIntent {
  const text = normalizeVietnamese(message);
  if (hasAnyKeyword(text, harmfulIntentKeywords)) {
    return toParsedIntent({ intent: "harmful_intent", query_scope: "unknown", device_query_text: "", operation_text: null, property_hint: null, value_hint: null, confidence: heuristicConfidence.harmfulIntent }, message, history);
  }
  if (hasAnyKeyword(text, outOfScopeKeywords)) {
    return toParsedIntent({ intent: "out_of_scope", query_scope: "unknown", device_query_text: "", operation_text: null, property_hint: null, value_hint: null, confidence: heuristicConfidence.outOfScope }, message, history);
  }

  const asksForDeviceList =
    hasAnyKeyword(text, deviceListRequestKeywords) ||
    (text.includes("thiết bị") && text.includes("gì")) ||
    (text.includes("thiet bi") && text.includes("gi"));
  if (asksForDeviceList) {
    return toParsedIntent({
      intent: "search_devices",
      query_scope: isGenericDeviceListQuery(message) ? "all" : "unknown",
      device_query_text: cleanQueryText(message),
      operation_text: "search devices",
      property_hint: null,
      value_hint: null,
      confidence: heuristicConfidence.searchDevices
    }, message, history);
  }

  const isRead =
    text.endsWith("không") || hasAnyKeyword(text, readStateKeywords);
  if (isRead && !startsWithWriteCommand(message)) {
    return toParsedIntent({
      intent: "read_device_state",
      query_scope: "filtered",
      device_query_text: cleanQueryText(message),
      operation_text: message,
      property_hint: inferProperty(message),
      value_hint: null,
      confidence: heuristicConfidence.readDeviceState
    }, message, history);
  }

  const isWrite = hasAnyKeyword(text, writeCommandKeywords);
  if (isWrite) {
    return toParsedIntent({
      intent: "write_device_value",
      query_scope: "filtered",
      device_query_text: cleanQueryText(message),
      operation_text: message,
      property_hint: inferProperty(message),
      value_hint: extractNumber(message) ?? null,
      confidence: heuristicConfidence.writeDeviceValue
    }, message, history);
  }

  return toParsedIntent({ intent: "out_of_scope", query_scope: "unknown", device_query_text: "", operation_text: null, property_hint: null, value_hint: null, confidence: heuristicConfidence.defaultOutOfScope }, message, history);
}

function hasSmartHomeKeyword(message: string) {
  const text = normalizeVietnamese(message);
  return smartHomeKeywords.some((keyword) => text.includes(keyword));
}

function hasDeviceQuery(query: ParsedIntent["device_query"]) {
  return Boolean(query?.raw || query?.name || query?.room || query?.type);
}

function applySemanticGuard(message: string, history: ChatMessage[], parsed: ParsedIntent) {
  const fallback = heuristicParseIntent(message, history);

  if (guardedFallbackIntents.includes(parsed.intent as (typeof guardedFallbackIntents)[number]) && hasSmartHomeKeyword(message)) {
    return fallback;
  }

  if (["read_device_state", "write_device_value", "search_devices"].includes(parsed.intent)) {
    return {
      ...parsed,
      device_query: hasDeviceQuery(parsed.device_query) ? parsed.device_query : fallback.device_query,
      property: parsed.property ?? fallback.property ?? null,
      action: parsed.action ?? (parsed.intent === "write_device_value" ? fallback.action ?? null : null)
    };
  }

  return parsed;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`LLM parse timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function parseIntent(message: string, history: ChatMessage[]) {
  const model = new ChatOllama(buildIntentParserModelOptions());

  const historyLines = history.map((item) => `${item.role}: ${item.content}`).join("\n");
  const userPrompt = `History:\n${historyLines || "(empty)"}\n\nUser: ${message}`;
  let lastError = "";

  for (let attempt = 0; attempt <= config.intentParseMaxRetries; attempt += 1) {
    try {
      const prompt = attempt === 0 ? userPrompt : `${userPrompt}\n\nJSON trước đó lỗi: ${lastError}\nHãy trả lại duy nhất JSON hợp lệ.`;
      const response = await withTimeout(
        model.invoke([new SystemMessage(intentParserPrompt), new HumanMessage(prompt)]),
        config.llmParseTimeoutMs
      );
      const parsed = JSON.parse(extractJson((response as AIMessage).content));
      const validated = rawIntentSchema.parse(parsed);
      const internalIntent = toParsedIntent(validated, message, history);
      return applySemanticGuard(message, history, internalIntent);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return heuristicParseIntent(message, history);
}

export async function repairSearchDevicesIntent(message: string, currentIntent: ParsedIntent): Promise<ParsedIntent> {
  if (currentIntent.intent !== "search_devices") {
    return currentIntent;
  }

  const model = new ChatOllama(buildSearchRepairModelOptions());

  try {
    const response = await withTimeout(
      model.invoke([
        new SystemMessage(searchRepairPrompt),
        new HumanMessage(`User: ${message}\nCurrent parsed device_query: ${JSON.stringify(currentIntent.device_query)}`)
      ]),
      config.llmParseTimeoutMs
    );
    const repaired = searchRepairSchema.parse(JSON.parse(extractJson((response as AIMessage).content)));
    if (repaired.query_scope === "all" && shouldAcceptSearchRepairAll(repaired.confidence)) {
      return { ...currentIntent, device_query: {}, confidence: Math.max(currentIntent.confidence, repaired.confidence) };
    }
    if (repaired.query_scope === "filtered" && repaired.device_query_text.trim()) {
      return {
        ...currentIntent,
        device_query: { raw: cleanQueryText(repaired.device_query_text) || repaired.device_query_text.trim() },
        confidence: Math.max(currentIntent.confidence, repaired.confidence)
      };
    }
  } catch {
    return currentIntent;
  }

  return currentIntent;
}

export const intentParserPolicy = {
  clarificationIntentTypes,
  terminalIntentTypes
} as const;
