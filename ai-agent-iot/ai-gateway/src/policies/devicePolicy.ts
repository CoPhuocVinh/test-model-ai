import type { DeviceState, DeviceSummary } from "../schemas/device.schema.js";
import type { DeviceAction } from "../schemas/intent.schema.js";
import type { AgentResponse } from "../schemas/response.schema.js";

function toPublicDevice<T extends DeviceState | DeviceSummary>(device: T) {
  return device.raw ?? device;
}

export function deviceNotFoundResponse(): AgentResponse {
  return {
    type: "device_not_found",
    message: "Không tìm thấy thiết bị phù hợp."
  };
}

export function offlineResponse(device: Pick<DeviceSummary, "device_id" | "name">): AgentResponse {
  return {
    type: "device_offline",
    message: `${device.name} đang offline, chưa thể điều khiển.`,
    code: "DEVICE_OFFLINE"
  };
}

export function invalidValueResponse(message: string, code = "INVALID_VALUE"): AgentResponse {
  return {
    type: code === "UNSUPPORTED_PROPERTY" ? "unsupported_property" : "invalid_value",
    message,
    code
  };
}

export function readResultResponse(states: DeviceState[]): AgentResponse {
  return {
    type: "device_read_result",
    message: `Tìm thấy ${states.length} thiết bị phù hợp.`,
    devices: states.map(toPublicDevice)
  };
}

export function writeSuccessResponse(device: DeviceSummary, action: DeviceAction): AgentResponse {
  const verb = action.property === "power" ? (action.value === true ? "bật" : "tắt") : `set ${action.property}`;
  return {
    type: "device_write_success",
    message: `Đã ${verb} ${device.name}.`,
    device: toPublicDevice(device),
    action
  };
}

export function fixedIntentResponse(type: "out_of_scope" | "harmful_intent" | "not_device_related" | "clarification_needed" | "error", message?: string): AgentResponse {
  const defaults = {
    out_of_scope: "Tôi là trợ lý nhà thông minh, hiện chỉ hỗ trợ tra cứu và điều khiển thiết bị.",
    harmful_intent: "Tôi không thể hỗ trợ yêu cầu đó. Tôi chỉ hỗ trợ các tác vụ an toàn liên quan đến thiết bị nhà thông minh.",
    not_device_related: "Tôi chỉ hỗ trợ các câu hỏi và thao tác liên quan đến thiết bị nhà thông minh.",
    clarification_needed: "Tôi chưa hiểu rõ thiết bị hoặc thao tác bạn muốn thực hiện. Bạn có thể nói rõ tên thiết bị và phòng không?",
    error: "Có lỗi xảy ra khi xử lý yêu cầu."
  };

  return {
    type,
    message: message ?? defaults[type]
  };
}
