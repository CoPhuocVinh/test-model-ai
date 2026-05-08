import type { BackendDevice, DeviceState, DeviceSummary } from "./device.schema.js";
import type { DeviceAction } from "./intent.schema.js";

export type PublicDevice = BackendDevice | DeviceState | DeviceSummary;

export type AgentResponse =
  | {
      type: "device_read_result";
      message: string;
      devices: PublicDevice[];
    }
  | {
      type: "device_write_success";
      message: string;
      device: PublicDevice;
      action: DeviceAction;
    }
  | {
      type: "multiple_devices_matched";
      message: string;
      devices: PublicDevice[];
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
