import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { backendDeviceSchema, type BackendDevice, type Device, type DeviceCapability } from "../schemas/device.js";

type FetchLike = typeof fetch;

let fetchImpl: FetchLike = fetch;

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesText(source: string, needle?: string) {
  if (!needle) return true;
  return normalize(source).includes(normalize(needle));
}

function parseInputConfig(device: BackendDevice) {
  if (!device.inputConfig) return undefined;
  try {
    const parsed = JSON.parse(device.inputConfig);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function parseDeviceValue(device: BackendDevice) {
  const numericValue = Number(device.value);
  return Number.isFinite(numericValue) ? numericValue : device.value;
}

function buildValueCapability(device: BackendDevice): DeviceCapability {
  const inputConfig = parseInputConfig(device);
  const capability: DeviceCapability = {
    property: "value",
    type: "number",
    writable: true
  };

  if (typeof inputConfig?.min === "number") capability.min = inputConfig.min;
  if (typeof inputConfig?.max === "number") capability.max = inputConfig.max;
  if (typeof inputConfig?.unit === "string") capability.unit = inputConfig.unit;
  return capability;
}

function toNormalizedDevice(device: BackendDevice): Device {
  const value = parseDeviceValue(device);
  const capability = buildValueCapability(device);
  return {
    device_id: device.code,
    name: device.name,
    room: device.roomId === null || device.roomId === undefined ? "" : String(device.roomId),
    type: device.typeLabel || device.type,
    aliases: [device.code, device.type, device.typeLabel ?? "", "máy lạnh", "điều hòa", "điều hoà"].filter(Boolean),
    online: normalize(device.status) !== "offline",
    values: {
      value,
      temperature: value,
      power: Boolean(device.isOn)
    },
    capabilities: [
      capability,
      { ...capability, property: "temperature" },
      { property: "power", type: "boolean", writable: true }
    ],
    updated_at: device.updated_at ?? device.lastUpdate ?? new Date().toISOString(),
    raw: device
  };
}

function getDeviceUrl(code = config.demoDeviceCode) {
  return `${config.backendBaseUrl}/iot/device-by-mac/${encodeURIComponent(code)}`;
}

function patchDeviceUrl(code: string, value: unknown) {
  const url = new URL(`${config.backendBaseUrl}/iot/device-by-mac`);
  url.searchParams.set("id", code);
  url.searchParams.set("value", String(value));
  return url.toString();
}

async function fetchBackendDevice(code = config.demoDeviceCode) {
  const response = await fetchImpl(getDeviceUrl(code));
  if (!response.ok) {
    throw Object.assign(new Error(`Backend device fetch failed with ${response.status}`), { code: "BACKEND_DEVICE_FETCH_FAILED" });
  }
  return backendDeviceSchema.parse(await response.json());
}

async function fetchDemoDevices() {
  return [toNormalizedDevice(await fetchBackendDevice())];
}

function matchesQuery(device: Device, input: SearchDevicesInput) {
  const query = input.query ? normalize(input.query) : undefined;
  const haystack = normalize([
    device.name,
    device.room,
    device.type,
    device.device_id,
    device.raw?.typeLabel,
    device.raw?.code,
    ...(device.aliases ?? [])
  ].filter(Boolean).join(" "));
  const queryParts = query?.split(/\s+/).filter((part) => device.room ? true : !["phòng", "phong", "ngủ", "ngu", "khách", "khach"].includes(part));
  const queryMatches = query ? haystack.includes(query) || Boolean(queryParts?.length && queryParts.every((part) => haystack.includes(part))) : true;
  return queryMatches && includesText(device.name, input.name) && includesText(device.room, input.room) && includesText(device.type, input.type);
}

function normalizeWritableValue(property: string, value: unknown) {
  if (property === "power") {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === 1 || value === 0) return value;
  }
  return value;
}

function valueCapabilityForProperty(device: Device, property: string) {
  const normalizedProperty = property === "temperature" ? "value" : property;
  return device.capabilities.find((item) => item.property === normalizedProperty || item.property === property);
}

export type SearchDevicesInput = {
  query?: string;
  name?: string;
  room?: string;
  type?: string;
};

export async function searchDevices(input: SearchDevicesInput) {
  const devices = await fetchDemoDevices();
  return devices.filter((device) => matchesQuery(device, input));
}

export async function getDeviceState(deviceId: string) {
  const device = toNormalizedDevice(await fetchBackendDevice(deviceId));
  if (device.device_id !== deviceId) {
    throw Object.assign(new Error("Device not found"), { code: "DEVICE_NOT_FOUND" });
  }

  return {
    device_id: device.device_id,
    name: device.name,
    room: device.room,
    type: device.type,
    online: device.online,
    values: device.values,
    updated_at: device.updated_at,
    raw: device.raw
  };
}

export async function listDeviceCapabilities(deviceId: string) {
  const device = toNormalizedDevice(await fetchBackendDevice(deviceId));
  return {
    device_id: device.device_id,
    capabilities: device.capabilities
  };
}

export async function validateDeviceValue(deviceId: string, property: string, value: unknown) {
  const device = toNormalizedDevice(await fetchBackendDevice(deviceId));
  const capability = valueCapabilityForProperty(device, property);
  if (!capability) {
    return { valid: false, reason: `Property ${property} is not supported`, code: "UNSUPPORTED_PROPERTY" };
  }
  if (!capability.writable) {
    return { valid: false, reason: `Property ${property} is not writable`, code: "UNSUPPORTED_PROPERTY" };
  }

  const writableValue = normalizeWritableValue(property, value);
  if (capability.type === "boolean" && typeof value !== "boolean" && value !== 0 && value !== 1) {
    return { valid: false, reason: `${property} must be boolean`, code: "INVALID_VALUE" };
  }
  if (capability.type === "number") {
    if (typeof writableValue !== "number" || Number.isNaN(writableValue)) {
      return { valid: false, reason: `${property} must be a number`, code: "INVALID_VALUE" };
    }
    if (capability.min !== undefined && writableValue < capability.min) {
      return { valid: false, reason: `${property} must be >= ${capability.min}`, code: "INVALID_VALUE" };
    }
    if (capability.max !== undefined && writableValue > capability.max) {
      return { valid: false, reason: `${property} must be <= ${capability.max}`, code: "INVALID_VALUE" };
    }
  }

  return { valid: true };
}

export async function setDeviceValue(deviceId: string, property: string, value: unknown) {
  const validation = await validateDeviceValue(deviceId, property, value);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.reason), { code: validation.code ?? "INVALID_VALUE" });
  }

  const writableValue = normalizeWritableValue(property, value);
  const response = await fetchImpl(patchDeviceUrl(deviceId, writableValue), { method: "PATCH" });
  if (!response.ok) {
    throw Object.assign(new Error(`Backend device update failed with ${response.status}`), { code: "BACKEND_DEVICE_UPDATE_FAILED" });
  }

  return {
    success: true,
    device_id: deviceId,
    property,
    value: writableValue,
    request_id: randomUUID()
  };
}

export function setDeviceFetchForTest(nextFetch: FetchLike) {
  fetchImpl = nextFetch;
}

export function resetBackendDeviceStoreForTest() {
  fetchImpl = fetch;
}
