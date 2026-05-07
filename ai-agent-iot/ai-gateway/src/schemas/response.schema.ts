import type { DeviceState, DeviceSummary } from "./device.schema.js";
import type { DeviceAction } from "./intent.schema.js";

export type AgentResponse =
  | {
      type: "device_read_result";
      message: string;
      devices: DeviceState[];
    }
  | {
      type: "device_write_success";
      message: string;
      device: Pick<DeviceSummary, "device_id" | "name">;
      action: DeviceAction;
    }
  | {
      type: "multiple_devices_matched";
      message: string;
      devices: DeviceSummary[];
      pending_action: {
        id: string;
        property: string;
        operation: "set" | "add" | "subtract";
        value: unknown;
      };
    }
  | {
      type:
        | "device_not_found"
        | "invalid_value"
        | "unsupported_property"
        | "device_offline"
        | "clarification_needed"
        | "not_device_related"
        | "out_of_scope"
        | "harmful_intent"
        | "error";
      message: string;
      code?: string;
      retryable?: boolean;
    };
