import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { config } from "../config.js";
import { heuristicParseIntent, parseIntent, repairSearchDevicesIntent } from "../chains/intentParser.chain.js";
import { clarificationIntentTypes, terminalIntentTypes } from "../chains/intentParser.constants.js";
import { logEvent } from "../logger.js";
import { deviceMcpClient } from "../mcp/deviceMcpClient.js";
import type { DeviceState, DeviceSummary } from "../schemas/device.schema.js";
import type { DeviceAction, ParsedIntent } from "../schemas/intent.schema.js";
import type { AgentResponse } from "../schemas/response.schema.js";
import { appendMessage, getMessageHistory, type ChatMessage } from "../stores/conversationStore.js";
import { consumePendingAction, createPendingAction } from "../stores/pendingActionStore.js";
import {
  deviceNotFoundResponse,
  fixedIntentResponse,
  invalidValueResponse,
  readResultResponse,
  writeSuccessResponse
} from "../policies/devicePolicy.js";

const clarificationIntentSet = new Set<string>(clarificationIntentTypes);
const terminalIntentSet = new Set<string>(terminalIntentTypes);
type TerminalIntentType = (typeof terminalIntentTypes)[number];
export const DEFAULT_SESSION_ID = "default";

export function shouldRequestClarification(intent?: ParsedIntent) {
  return Boolean(intent && (intent.confidence < config.intentConfidenceThreshold || clarificationIntentSet.has(intent.intent)));
}

export function isTerminalIntent(intent?: ParsedIntent): intent is ParsedIntent & { intent: TerminalIntentType } {
  return Boolean(intent && terminalIntentSet.has(intent.intent));
}

export type DeviceAgentState = {
  sessionId: string;
  userMessage?: string;
  messageHistory?: ChatMessage[];
  selectedDeviceId?: string;
  intent?: ParsedIntent;
  matchedDevices?: DeviceSummary[];
  deviceStates?: DeviceState[];
  pendingAction?: {
    id: string;
    action: DeviceAction;
    candidates: DeviceSummary[];
  };
  response?: AgentResponse;
  errors?: Array<{ code: string; message: string }>;
};

const AgentStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>(),
  userMessage: Annotation<string | undefined>(),
  messageHistory: Annotation<ChatMessage[] | undefined>(),
  selectedDeviceId: Annotation<string | undefined>(),
  intent: Annotation<ParsedIntent | undefined>(),
  matchedDevices: Annotation<DeviceSummary[] | undefined>(),
  deviceStates: Annotation<DeviceState[] | undefined>(),
  pendingAction: Annotation<DeviceAgentState["pendingAction"] | undefined>(),
  response: Annotation<AgentResponse | undefined>(),
  errors: Annotation<Array<{ code: string; message: string }> | undefined>()
});

export async function loadMessageHistory(state: DeviceAgentState): Promise<Partial<DeviceAgentState>> {
  if (state.messageHistory) {
    return {};
  }
  return { messageHistory: getMessageHistory(state.sessionId) };
}

export async function parseUserMessage(state: DeviceAgentState): Promise<Partial<DeviceAgentState>> {
  if (!state.userMessage) {
    return { response: fixedIntentResponse("clarification_needed") };
  }
  const intent = await parseIntent(state.userMessage, state.messageHistory ?? []);
  logEvent("info", {
    event: "parsed_intent",
    user_message: state.userMessage,
    intent
  });
  if (shouldRequestClarification(intent)) {
    const fallbackIntent = heuristicParseIntent(state.userMessage, state.messageHistory ?? []);
    if (isTerminalIntent(fallbackIntent)) {
      return { intent: fallbackIntent, response: fixedIntentResponse(fallbackIntent.intent) };
    }
    return { intent, response: fixedIntentResponse("clarification_needed") };
  }
  if (isTerminalIntent(intent)) {
    return { intent, response: fixedIntentResponse(intent.intent) };
  }
  return { intent };
}

export async function searchDevices(state: DeviceAgentState): Promise<Partial<DeviceAgentState>> {
  if (!state.intent) return {};
  let matchedDevices = await deviceMcpClient.searchDevices(state.intent.device_query);
  if (matchedDevices.length === 0 && state.intent.intent === "search_devices" && state.userMessage) {
    const repairedIntent = await repairSearchDevicesIntent(state.userMessage, state.intent);
    if (JSON.stringify(repairedIntent.device_query) !== JSON.stringify(state.intent.device_query)) {
      logEvent("info", {
        event: "repaired_search_intent",
        user_message: state.userMessage,
        before: state.intent,
        after: repairedIntent
      });
      matchedDevices = await deviceMcpClient.searchDevices(repairedIntent.device_query);
      return { intent: repairedIntent, matchedDevices };
    }
  }
  return { matchedDevices };
}

export async function readDeviceStates(state: DeviceAgentState): Promise<Partial<DeviceAgentState>> {
  const devices = state.matchedDevices ?? [];
  if (devices.length === 0) {
    return { response: deviceNotFoundResponse() };
  }
  const deviceStates = await Promise.all(devices.map((device) => deviceMcpClient.getDeviceState(device.device_id)));
  return { deviceStates, response: readResultResponse(deviceStates) };
}

export async function resolveRelativeValue(state: DeviceAgentState, device: DeviceSummary, action: DeviceAction): Promise<DeviceAction> {
  if (action.operation === "set") {
    return action;
  }
  if (typeof action.value !== "number") {
    throw Object.assign(new Error("Relative value must be numeric"), { code: "INVALID_VALUE" });
  }

  const currentState = await deviceMcpClient.getDeviceState(device.device_id);
  const currentValue = currentState.values[action.property];
  if (typeof currentValue !== "number") {
    throw Object.assign(new Error(`Current ${action.property} is not numeric`), { code: "INVALID_VALUE" });
  }

  return {
    property: action.property,
    operation: "set",
    value: action.operation === "add" ? currentValue + action.value : currentValue - action.value
  };
}

async function executeWriteAction(device: DeviceSummary, action: DeviceAction): Promise<AgentResponse> {
  let finalAction = action;
  if (action.operation !== "set") {
    finalAction = await resolveRelativeValue({ sessionId: DEFAULT_SESSION_ID }, device, action);
  }

  const validation = await deviceMcpClient.validateDeviceValue(device.device_id, finalAction.property, finalAction.value);
  if (!validation.valid) {
    return invalidValueResponse(validation.reason ?? "Giá trị không hợp lệ.", validation.code);
  }

  await deviceMcpClient.setDeviceValue(device.device_id, finalAction.property, finalAction.value);
  return writeSuccessResponse(device, finalAction);
}

export async function checkWritePolicy(state: DeviceAgentState): Promise<Partial<DeviceAgentState>> {
  const action = state.intent?.action;
  if (!action) {
    return { response: fixedIntentResponse("clarification_needed") };
  }

  const devices = state.matchedDevices ?? [];
  if (devices.length === 0) {
    return { response: deviceNotFoundResponse() };
  }
  if (devices.length > 1) {
    return requestDeviceSelection(state);
  }

  const response = await executeWriteAction(devices[0], action);
  return { response };
}

export async function requestDeviceSelection(state: DeviceAgentState): Promise<Partial<DeviceAgentState>> {
  const action = state.intent?.action;
  const devices = state.matchedDevices ?? [];
  if (!action) {
    return { response: fixedIntentResponse("clarification_needed") };
  }

  const pending = createPendingAction(action, devices);
  return {
    pendingAction: { id: pending.id, action, candidates: devices },
    response: {
      type: "multiple_devices_matched",
      message: "Có nhiều thiết bị phù hợp. Vui lòng chọn thiết bị cần điều khiển.",
      devices: devices.map((device) => device.raw ?? device),
      pending_action: {
        id: pending.id,
        property: action.property,
        operation: action.operation,
        value: action.value
      }
    }
  };
}

export async function formatResponse(state: DeviceAgentState): Promise<Partial<DeviceAgentState>> {
  if (state.response) return {};
  return { response: fixedIntentResponse("error") };
}

function routeAfterParse(state: DeviceAgentState) {
  const intent = state.intent?.intent;
  if (intent === "read_device_state" || intent === "write_device_value" || intent === "search_devices") {
    return "searchDevices";
  }
  return "formatResponse";
}

function routeAfterSearch(state: DeviceAgentState) {
  if (state.intent?.intent === "read_device_state" || state.intent?.intent === "search_devices") {
    return "readDeviceStates";
  }
  if (state.intent?.intent === "write_device_value") {
    return "checkWritePolicy";
  }
  return "formatResponse";
}

export function buildDeviceAgentGraph() {
  return new StateGraph(AgentStateAnnotation)
    .addNode("loadMessageHistory", loadMessageHistory)
    .addNode("parseUserMessage", parseUserMessage)
    .addNode("searchDevices", searchDevices)
    .addNode("readDeviceStates", readDeviceStates)
    .addNode("checkWritePolicy", checkWritePolicy)
    .addNode("formatResponse", formatResponse)
    .addEdge(START, "loadMessageHistory")
    .addEdge("loadMessageHistory", "parseUserMessage")
    .addConditionalEdges("parseUserMessage", routeAfterParse, {
      searchDevices: "searchDevices",
      formatResponse: "formatResponse"
    })
    .addConditionalEdges("searchDevices", routeAfterSearch, {
      readDeviceStates: "readDeviceStates",
      checkWritePolicy: "checkWritePolicy",
      formatResponse: "formatResponse"
    })
    .addEdge("readDeviceStates", "formatResponse")
    .addEdge("checkWritePolicy", "formatResponse")
    .addEdge("formatResponse", END)
    .compile();
}

export async function runChat(message: string): Promise<AgentResponse> {
  const previousHistory = getMessageHistory(DEFAULT_SESSION_ID);
  appendMessage(DEFAULT_SESSION_ID, { role: "user", content: message });
  const graph = buildDeviceAgentGraph();
  const result = await graph.invoke({ sessionId: DEFAULT_SESSION_ID, userMessage: message, messageHistory: previousHistory });
  const response = result.response ?? fixedIntentResponse("error");
  appendMessage(DEFAULT_SESSION_ID, { role: "assistant", content: response.message });
  return response;
}

export async function confirmAction(pendingActionId: string, deviceId: string): Promise<AgentResponse> {
  try {
    const { pending, selectedDevice } = consumePendingAction(pendingActionId, deviceId);
    const response = await executeWriteAction(selectedDevice, pending.action);
    appendMessage(DEFAULT_SESSION_ID, { role: "assistant", content: response.message });
    return response;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "PENDING_ACTION_ERROR";
    return {
      type: "error",
      message: error instanceof Error ? error.message : "Không thể xác nhận thao tác.",
      code,
      retryable: false
    };
  }
}
