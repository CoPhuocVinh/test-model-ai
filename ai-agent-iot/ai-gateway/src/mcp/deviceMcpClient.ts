import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../config.js";
import { capabilitySchema, deviceStateSchema, deviceSummarySchema, type DeviceCapability, type DeviceState, type DeviceSummary } from "../schemas/device.schema.js";
import type { DeviceQuery } from "../schemas/intent.schema.js";

type McpToolResponse = {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

let clientPromise: Promise<Client> | undefined;

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: "ai-gateway", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(config.mcpDeviceServerUrl));
      await client.connect(transport);
      return client;
    })();
  }
  return clientPromise;
}

function parseToolResult<T>(result: McpToolResponse): T {
  const raw = result.structuredContent ?? result.content?.find((item) => item.type === "text")?.text;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (result.isError) {
    const error = parsed && typeof parsed === "object" && "error" in parsed ? (parsed as { error: { message?: string; code?: string } }).error : undefined;
    throw Object.assign(new Error(error?.message ?? "MCP tool failed"), { code: error?.code ?? "MCP_TOOL_ERROR" });
  }

  return parsed as T;
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = await getClient();
  const result = (await client.callTool({ name, arguments: args })) as McpToolResponse;
  return parseToolResult<T>(result);
}

export const deviceMcpClient = {
  async searchDevices(query: DeviceQuery): Promise<DeviceSummary[]> {
    const args = {
      query: query.raw,
      name: query.name,
      room: query.room,
      type: query.type
    };
    const result = await callTool<{ devices: unknown[] }>("search_devices", args);
    return result.devices.map((device) => deviceSummarySchema.parse(device));
  },

  async getDeviceState(deviceId: string): Promise<DeviceState> {
    const result = await callTool<unknown>("get_device_state", { device_id: deviceId });
    return deviceStateSchema.parse(result);
  },

  async setDeviceValue(deviceId: string, property: string, value: unknown) {
    return callTool<{ success: boolean; device_id: string; property: string; value: unknown; request_id: string }>("set_device_value", {
      device_id: deviceId,
      property,
      value
    });
  },

  async listDeviceCapabilities(deviceId: string): Promise<DeviceCapability[]> {
    const result = await callTool<{ capabilities: unknown[] }>("list_device_capabilities", { device_id: deviceId });
    return result.capabilities.map((capability) => capabilitySchema.parse(capability));
  },

  async validateDeviceValue(deviceId: string, property: string, value: unknown) {
    return callTool<{ valid: boolean; reason?: string; code?: string }>("validate_device_value", {
      device_id: deviceId,
      property,
      value
    });
  }
};

export function resetMcpClientForTest() {
  clientPromise = undefined;
}
