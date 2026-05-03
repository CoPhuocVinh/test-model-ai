import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOllama } from "@langchain/ollama";
import { z } from "zod";
import { config } from "../config.js";
import type { ChatMessage } from "../stores/conversationStore.js";
import { parsedIntentSchema, type ParsedIntent } from "../schemas/intent.schema.js";

const systemPrompt = `Bạn là intent parser cho trợ lý điều khiển thiết bị IoT/nhà thông minh.
Nhiệm vụ duy nhất: chuyển câu người dùng thành JSON hợp lệ theo schema thô bên dưới.
Không markdown. Không giải thích. Không thêm key ngoài schema. Không tạo device_id.

Schema JSON:
{"intent":"search_devices|read_device_state|write_device_value|out_of_scope|harmful_intent|clarification_needed|unsupported","query_scope":"all|filtered|unknown","device_query_text":"string","operation_text":"string|null","property_hint":"string|null","value_hint":any|null,"confidence":0.0}

Quy tắc:
- User muốn xem/list/liệt kê/tìm danh sách thiết bị => search_devices.
- query_scope="all" khi user hỏi tổng quan trong nhà có gì, có thiết bị nào, liệt kê toàn bộ, danh sách tất cả. Khi query_scope="all", device_query_text="".
- query_scope="filtered" khi user nêu một loại/phòng/thiết bị cụ thể, ví dụ "đèn phòng khách", "máy lạnh phòng ngủ".
- query_scope="unknown" nếu không rõ phạm vi.
- User hỏi trạng thái/kết nối/on-off/giá trị hiện tại/còn hoạt động/bao nhiêu => read_device_state.
- User yêu cầu bật/tắt/mở/set/đặt/tăng/giảm/chuyển mode => write_device_value.
- device_query_text là cụm mô tả thiết bị/phòng do user nói, bỏ phần thao tác/giá trị. Ví dụ "bật đèn phòng khách" => "đèn phòng khách".
- operation_text là cụm thao tác/giá trị. Ví dụ "tăng lên 2 độ", "bật", "tắt", "set 26 độ".
- property_hint dùng tên property tổng quát nếu rõ: power, online, temperature, brightness, mode, battery, open. Nếu không chắc thì null.
- value_hint dùng true/false/number/string nếu rõ. Nếu không chắc thì null.
- Nếu user nói "cái đó", "nó", hoặc câu nối tiếp thiếu thiết bị, dùng History gần nhất để suy luận device_query_text.
- Nếu không đủ thiết bị hoặc thao tác sau khi xét History, trả clarification_needed.
- out_of_scope chỉ dùng khi hoàn toàn không liên quan nhà thông minh/thiết bị. harmful_intent dùng cho nội dung nguy hiểm.
- Không ánh xạ sang room/type cụ thể. Không chọn một thiết bị cụ thể. Backend sẽ resolve bằng Device API.

Examples:
User: Đèn phòng khách đang bật không?
JSON: {"intent":"read_device_state","query_scope":"filtered","device_query_text":"đèn phòng khách","operation_text":"đang bật không","property_hint":"power","value_hint":null,"confidence":0.92}

User: Bật đèn phòng khách
JSON: {"intent":"write_device_value","query_scope":"filtered","device_query_text":"đèn phòng khách","operation_text":"bật","property_hint":"power","value_hint":true,"confidence":0.94}

User: Set máy lạnh phòng ngủ 26 độ
JSON: {"intent":"write_device_value","query_scope":"filtered","device_query_text":"máy lạnh phòng ngủ","operation_text":"set 26 độ","property_hint":"temperature","value_hint":26,"confidence":0.9}

User: đèn khu vực tiếp khách còn hoạt động không
JSON: {"intent":"read_device_state","query_scope":"filtered","device_query_text":"đèn khu vực tiếp khách","operation_text":"còn hoạt động không","property_hint":"online","value_hint":null,"confidence":0.9}

User: tắt đèn trần khu vực tiếp khách còn hoạt động đi
JSON: {"intent":"write_device_value","query_scope":"filtered","device_query_text":"đèn trần khu vực tiếp khách","operation_text":"tắt","property_hint":"power","value_hint":false,"confidence":0.9}

User: cho tui list các thiết bị trong nhà đi
JSON: {"intent":"search_devices","query_scope":"all","device_query_text":"","operation_text":"list các thiết bị","property_hint":null,"value_hint":null,"confidence":0.9}

User: trong nhà đang có gì thế
JSON: {"intent":"search_devices","query_scope":"all","device_query_text":"","operation_text":"trong nhà đang có gì","property_hint":null,"value_hint":null,"confidence":0.9}

User: liệt kê đèn phòng khách
JSON: {"intent":"search_devices","query_scope":"filtered","device_query_text":"đèn phòng khách","operation_text":"liệt kê","property_hint":null,"value_hint":null,"confidence":0.9}

History: User: Máy lạnh phòng ngủ đang bao nhiêu độ? Assistant: Máy lạnh phòng ngủ đang đặt 24 độ C.
User: Tăng lên 2 độ đi
JSON: {"intent":"write_device_value","query_scope":"filtered","device_query_text":"máy lạnh phòng ngủ","operation_text":"tăng lên 2 độ","property_hint":"temperature","value_hint":2,"confidence":0.86}
`;

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

const searchRepairPrompt = `Bạn phân loại truy vấn tìm thiết bị IoT.
Chỉ trả JSON hợp lệ. Không markdown. Không giải thích.

Schema:
{"query_scope":"all|filtered|unknown","device_query_text":"string","confidence":0.0}

Quy tắc:
- query_scope="all" nếu user hỏi tổng quan/toàn bộ inventory trong nhà, ví dụ trong nhà có gì, có thiết bị nào, danh sách tất cả thiết bị.
- query_scope="filtered" nếu user nhắc rõ một thiết bị, loại thiết bị, phòng, khu vực, hoặc thuộc tính cụ thể.
- Một filter phải là tên thiết bị, loại thiết bị, phòng, khu vực, hoặc thuộc tính cụ thể. Từ hỏi/từ đệm như "gì", "thế", "nào", "có gì" không phải filter.
- Nếu parsed query hiện tại chỉ là từ hỏi/từ đệm hoặc đã search không ra gì vì không có filter cụ thể, chọn query_scope="all".
- Nếu all thì device_query_text="".
- Nếu filtered thì device_query_text là cụm thiết bị/phòng/khu vực cần tìm, bỏ các từ đệm/câu hỏi.
- Không bịa thiết bị.

Examples:
User: trong nhà đang có gì thế
JSON: {"query_scope":"all","device_query_text":"","confidence":0.9}

User: nhà mình có thiết bị nào
JSON: {"query_scope":"all","device_query_text":"","confidence":0.9}

User: có đèn phòng khách nào không
JSON: {"query_scope":"filtered","device_query_text":"đèn phòng khách","confidence":0.9}`;

const searchRepairSchema = z.object({
  query_scope: z.enum(["all", "filtered", "unknown"]).default("unknown"),
  device_query_text: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0.5)
});

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
  const removeTerms = [
    "vui lòng",
    "vui long",
    "liệt kê",
    "liet ke",
    "danh sách",
    "danh sach",
    "xem các thiết bị",
    "xem cac thiet bi",
    "các thiết bị",
    "cac thiet bi",
    "thiết bị",
    "thiet bi",
    "trong nhà",
    "trong nha",
    "biết",
    "biet",
    "có",
    "co",
    "gì",
    "gi",
    "thứ",
    "thu",
    "hoạt động",
    "hoat dong",
    "kết nối",
    "ket noi",
    "bao nhiêu",
    "bao nhieu",
    "trạng thái",
    "trang thai",
    "phần trăm",
    "phan tram",
    "độ",
    "do",
    "cho",
    "tui",
    "tôi",
    "toi",
    "giúp",
    "giup",
    "hãy",
    "hay",
    "đi",
    "di",
    "nhé",
    "nhe",
    "list",
    "xem",
    "tìm",
    "tim",
    "kiếm",
    "kiem",
    "các",
    "cac",
    "những",
    "nhung",
    "đang",
    "dang",
    "còn",
    "con",
    "online",
    "offline",
    "không",
    "khong",
    "bật",
    "bat",
    "mở",
    "mo",
    "tắt",
    "tat",
    "set",
    "đặt",
    "dat",
    "tăng",
    "tang",
    "giảm",
    "giam",
    "lên",
    "len",
    "xuống",
    "xuong",
    "chuyển",
    "chuyen"
  ];
  let text = normalizeVietnamese(input)
    .replace(/[?.!,]/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(độ|do|c|°|%|phần trăm|phan tram)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const term of removeTerms.sort((a, b) => b.length - a.length)) {
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
  return query.length === 0 || ["nhà", "nha", "toàn bộ", "toan bo", "tất cả", "tat ca"].includes(query);
}

function isGenericDeviceListRequest(message: string, raw: RawIntent) {
  if (raw.intent !== "search_devices") return false;
  if (raw.query_scope === "all") return true;
  if (raw.query_scope === "filtered") return false;
  const text = normalizeVietnamese(message);
  const cleanedRawQuery = cleanQueryText(raw.device_query_text);
  const mentionsDeviceCollection =
    text.includes("thiết bị") ||
    text.includes("thiet bi") ||
    text.includes("trong nhà") ||
    text.includes("trong nha") ||
    text.includes("các thứ") ||
    text.includes("cac thu") ||
    text.includes("thứ gì") ||
    text.includes("thu gi");
  return cleanedRawQuery.length === 0 || mentionsDeviceCollection;
}

function inferProperty(text: string): string | null {
  const value = normalizeVietnamese(text);
  if (value.includes("bật") || value.includes("bat") || value.includes("mở") || value.includes("mo") || value.includes("tắt") || value.includes("tat")) {
    return "power";
  }
  if (value.includes("hoạt động") || value.includes("hoat dong") || value.includes("online") || value.includes("offline") || value.includes("kết nối") || value.includes("ket noi")) {
    return "online";
  }
  if (value.includes("độ") || value.includes("do") || value.includes("nhiệt độ") || value.includes("nhiet do") || value.includes("tăng") || value.includes("tang") || value.includes("giảm") || value.includes("giam")) {
    return "temperature";
  }
  if (value.includes("%") || value.includes("sáng") || value.includes("sang") || value.includes("brightness")) {
    return "brightness";
  }
  if (value.includes("pin") || value.includes("battery")) {
    return "battery";
  }
  if (value.includes("mở cửa") || value.includes("mo cua") || value.includes("đóng cửa") || value.includes("dong cua")) {
    return "open";
  }
  if (value.includes("mode") || value.includes("chế độ") || value.includes("che do")) {
    return "mode";
  }
  return null;
}

function inferAction(text: string, propertyHint?: string | null, valueHint?: unknown): ParsedIntent["action"] {
  const value = normalizeVietnamese(text);
  const property = propertyHint ?? inferProperty(value);
  const numericValue = typeof valueHint === "number" ? valueHint : extractNumber(value);

  if (value.includes("bật") || value.includes("bat") || value.includes("mở") || value.includes("mo")) {
    return { property: property ?? "power", operation: "set", value: true };
  }
  if (value.includes("tắt") || value.includes("tat")) {
    return { property: property ?? "power", operation: "set", value: false };
  }
  if (value.includes("tăng") || value.includes("tang")) {
    return { property: property ?? "temperature", operation: "add", value: numericValue ?? 1 };
  }
  if (value.includes("giảm") || value.includes("giam")) {
    return { property: property ?? "temperature", operation: "subtract", value: numericValue ?? 1 };
  }
  if (numericValue !== undefined && (value.includes("set") || value.includes("đặt") || value.includes("dat") || property)) {
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
  return !["cái đó", "cai do", "nó", "no", "thiết bị đó", "thiet bi do"].some((term) => text.includes(term));
}

function startsWithWriteCommand(message: string) {
  let text = normalizeVietnamese(message).trim();
  let previous = "";
  while (previous !== text) {
    previous = text;
    text = text.replace(/^(cho|tui|tôi|toi|giúp|giup|vui lòng|vui long|hãy|hay)\s+/g, "").trim();
  }
  return /^(bật|bat|mở|mo|tắt|tat|set|đặt|dat|tăng|tang|giảm|giam|chuyển|chuyen)(\s|$)/.test(text);
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
  if (text.includes("bom") || text.includes("vũ khí")) {
    return toParsedIntent({ intent: "harmful_intent", query_scope: "unknown", device_query_text: "", operation_text: null, property_hint: null, value_hint: null, confidence: 0.95 }, message, history);
  }
  if (text.includes("code") || text.includes("website") || text.includes("bán hàng")) {
    return toParsedIntent({ intent: "out_of_scope", query_scope: "unknown", device_query_text: "", operation_text: null, property_hint: null, value_hint: null, confidence: 0.9 }, message, history);
  }

  const asksForDeviceList =
    text.includes("list") ||
    text.includes("liệt kê") ||
    text.includes("liet ke") ||
    text.includes("danh sách") ||
    text.includes("danh sach") ||
    text.includes("xem các thiết bị") ||
    text.includes("xem cac thiet bi") ||
    text.includes("các thiết bị") ||
    text.includes("cac thiet bi") ||
    (text.includes("thiết bị") && text.includes("gì")) ||
    (text.includes("thiet bi") && text.includes("gi")) ||
    text.includes("các thứ") ||
    text.includes("cac thu") ||
    text.includes("thứ gì") ||
    text.includes("thu gi");
  if (asksForDeviceList) {
    return toParsedIntent({
      intent: "search_devices",
      query_scope: isGenericDeviceListQuery(message) ? "all" : "unknown",
      device_query_text: cleanQueryText(message),
      operation_text: "search devices",
      property_hint: null,
      value_hint: null,
      confidence: 0.9
    }, message, history);
  }

  const isRead =
    text.includes("?") || text.endsWith("không") || text.includes("khong") || text.includes("bao nhiêu") ||
    text.includes("bao nhieu") || text.includes("trạng thái") || text.includes("trang thai") ||
    text.includes("đang") || text.includes("dang") || text.includes("online") || text.includes("offline") ||
    text.includes("hoạt động") || text.includes("hoat dong") || text.includes("kết nối") || text.includes("ket noi");
  if (isRead && !startsWithWriteCommand(message)) {
    return toParsedIntent({
      intent: "read_device_state",
      query_scope: "filtered",
      device_query_text: cleanQueryText(message),
      operation_text: message,
      property_hint: inferProperty(message),
      value_hint: null,
      confidence: 0.84
    }, message, history);
  }

  const isWrite =
    text.includes("bật") || text.includes("bat") || text.includes("mở") || text.includes("mo") ||
    text.includes("tắt") || text.includes("tat") || text.includes("set") || text.includes("đặt") ||
    text.includes("dat") || text.includes("tăng") || text.includes("tang") || text.includes("giảm") ||
    text.includes("giam") || text.includes("chuyển") || text.includes("chuyen");
  if (isWrite) {
    return toParsedIntent({
      intent: "write_device_value",
      query_scope: "filtered",
      device_query_text: cleanQueryText(message),
      operation_text: message,
      property_hint: inferProperty(message),
      value_hint: extractNumber(message) ?? null,
      confidence: 0.84
    }, message, history);
  }

  return toParsedIntent({ intent: "out_of_scope", query_scope: "unknown", device_query_text: "", operation_text: null, property_hint: null, value_hint: null, confidence: 0.65 }, message, history);
}

function hasSmartHomeKeyword(message: string) {
  const text = normalizeVietnamese(message);
  return [
    "đèn",
    "bóng đèn",
    "máy lạnh",
    "điều hòa",
    "điều hoà",
    "cảm biến",
    "thiết bị",
    "thiet bi",
    "trong nhà",
    "trong nha",
    "list",
    "liệt kê",
    "liet ke",
    "danh sách",
    "danh sach",
    "phòng khách",
    "tiếp khách",
    "phòng ngủ",
    "cửa chính",
    "hoạt động",
    "online",
    "offline",
    "kết nối",
    "bật",
    "tắt",
    "mở",
    "set",
    "đặt",
    "tăng",
    "giảm"
  ].some((keyword) => text.includes(keyword));
}

function hasDeviceQuery(query: ParsedIntent["device_query"]) {
  return Boolean(query?.raw || query?.name || query?.room || query?.type);
}

function applySemanticGuard(message: string, history: ChatMessage[], parsed: ParsedIntent) {
  const fallback = heuristicParseIntent(message, history);

  if (["out_of_scope", "not_device_related", "unsupported"].includes(parsed.intent) && hasSmartHomeKeyword(message)) {
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
  const model = new ChatOllama({
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    temperature: 0,
    format: "json",
    numPredict: config.llmNumPredict
  });

  const historyLines = history.map((item) => `${item.role}: ${item.content}`).join("\n");
  const userPrompt = `History:\n${historyLines || "(empty)"}\n\nUser: ${message}`;
  let lastError = "";

  for (let attempt = 0; attempt <= config.intentParseMaxRetries; attempt += 1) {
    try {
      const prompt = attempt === 0 ? userPrompt : `${userPrompt}\n\nJSON trước đó lỗi: ${lastError}\nHãy trả lại duy nhất JSON hợp lệ.`;
      const response = await withTimeout(
        model.invoke([new SystemMessage(systemPrompt), new HumanMessage(prompt)]),
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

  const model = new ChatOllama({
    baseUrl: config.ollamaBaseUrl,
    model: config.ollamaModel,
    temperature: 0,
    format: "json",
    numPredict: 80
  });

  try {
    const response = await withTimeout(
      model.invoke([
        new SystemMessage(searchRepairPrompt),
        new HumanMessage(`User: ${message}\nCurrent parsed device_query: ${JSON.stringify(currentIntent.device_query)}`)
      ]),
      config.llmParseTimeoutMs
    );
    const repaired = searchRepairSchema.parse(JSON.parse(extractJson((response as AIMessage).content)));
    if (repaired.query_scope === "all" && repaired.confidence >= 0.6) {
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
