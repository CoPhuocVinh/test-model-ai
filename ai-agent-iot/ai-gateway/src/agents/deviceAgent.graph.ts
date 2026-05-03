import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { heuristicParseIntent, parseIntent, repairSearchDevicesIntent } from "../chains/intentParser.chain.js";
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
  offlineResponse,
  readResultResponse,
  writeSuccessResponse
} from "../policies/devicePolicy.js";

export type DeviceAgentState = {
  conversationId: string;
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
  conversationId: Annotation<string>(),
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
  return { messageHistory: getMessageHistory(state.conversationId) };
}

export async function parseUserMessage(state: DeviceAgentState): Promise<Partial<DeviceAgentState>> {
  if (!state.userMessage) {
    return { response: fixedIntentResponse("clarification_needed") };
  }
  const intent = await parseIntent(state.userMessage, state.messageHistory ?? []);
  console.log(JSON.stringify({
    event: "parsed_intent",
    conversation_id: state.conversationId,
    user_message: state.userMessage,
    intent
  }));
  if (intent.confidence < 0.65 || intent.intent === "clarification_needed" || intent.intent === "unsupported") {
    const fallbackIntent = heuristicParseIntent(state.userMessage, state.messageHistory ?? []);
    if (fallbackIntent.intent === "out_of_scope" || fallbackIntent.intent === "harmful_intent" || fallbackIntent.intent === "not_device_related") {
      return { intent: fallbackIntent, response: fixedIntentResponse(fallbackIntent.intent) };
    }
    return { intent, response: fixedIntentResponse("clarification_needed") };
  }
  if (intent.intent === "out_of_scope" || intent.intent === "harmful_intent" || intent.intent === "not_device_related") {
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
      console.log(JSON.stringify({
        event: "repaired_search_intent",
        conversation_id: state.conversationId,
        user_message: state.userMessage,
        before: state.intent,
        after: repairedIntent
      }));
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
  if (!device.online) {
    return offlineResponse(device);
  }

  let finalAction = action;
  if (action.operation !== "set") {
    finalAction = await resolveRelativeValue({ conversationId: "internal" }, device, action);
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

  const pending = createPendingAction(state.conversationId, action, devices);
  return {
    pendingAction: { id: pending.id, action, candidates: devices },
    response: {
      type: "multiple_devices_matched",
      message: "Có nhiều thiết bị phù hợp. Vui lòng chọn thiết bị cần điều khiển.",
      devices,
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

export async function runChat(conversationId: string, message: string): Promise<AgentResponse> {
  appendMessage(conversationId, { role: "user", content: message });
  const graph = buildDeviceAgentGraph();
  const result = await graph.invoke({ conversationId, userMessage: message });
  const response = result.response ?? fixedIntentResponse("error");
  appendMessage(conversationId, { role: "assistant", content: response.message });
  return response;
}

export async function confirmAction(conversationId: string, pendingActionId: string, deviceId: string): Promise<AgentResponse> {
  try {
    const { pending, selectedDevice } = consumePendingAction(conversationId, pendingActionId, deviceId);
    const response = await executeWriteAction(selectedDevice, pending.action);
    appendMessage(conversationId, { role: "assistant", content: response.message });
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
