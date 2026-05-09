import { z } from "zod";
import {
  getDeviceState,
  listDeviceCapabilities,
  searchDevices,
  setDeviceValue,
  validateDeviceValue
} from "../store/backendDeviceStore.js";

export const searchDevicesInputSchema = {
  query: z.string().optional(),
  name: z.string().optional(),
  room: z.string().optional(),
  type: z.string().optional()
};

export const getDeviceStateInputSchema = {
  device_id: z.string().min(1)
};

export const setDeviceValueInputSchema = {
  device_id: z.string().min(1),
  property: z.string().min(1),
  value: z.unknown()
};

export const listDeviceCapabilitiesInputSchema = {
  device_id: z.string().min(1)
};

export const validateDeviceValueInputSchema = {
  device_id: z.string().min(1),
  property: z.string().min(1),
  value: z.unknown()
};

export const deviceToolHandlers = {
  search_devices: async (input: z.infer<z.ZodObject<typeof searchDevicesInputSchema>>) => ({
    devices: await searchDevices(input)
  }),

  get_device_state: async (input: z.infer<z.ZodObject<typeof getDeviceStateInputSchema>>) =>
    getDeviceState(input.device_id),

  set_device_value: async (input: z.infer<z.ZodObject<typeof setDeviceValueInputSchema>>) =>
    setDeviceValue(input.device_id, input.property, input.value),

  list_device_capabilities: async (input: z.infer<z.ZodObject<typeof listDeviceCapabilitiesInputSchema>>) =>
    listDeviceCapabilities(input.device_id),

  validate_device_value: async (input: z.infer<z.ZodObject<typeof validateDeviceValueInputSchema>>) =>
    validateDeviceValue(input.device_id, input.property, input.value)
};

export function toToolResult(output: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output as Record<string, unknown>
  };
}

export function toToolError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown MCP tool error";
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "MCP_TOOL_ERROR";
  const output = { success: false, error: { code, message } };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(output) }],
    structuredContent: output,
    isError: true
  };
}
