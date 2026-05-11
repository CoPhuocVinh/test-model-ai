import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { IOT_DEVICE_BY_MAC_PATH, IOT_SEARCH_PARAM } from "../constants/iotApi.constants.js";
import { backendDeviceListResponseSchema, type BackendDevice, type Device, type DeviceCapability } from "../schemas/device.js";

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

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberOrRaw(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return value;
  const numericValue = Number(trimmedValue);
  return Number.isFinite(numericValue) ? numericValue : value;
}

function parseDeviceValue(device: BackendDevice) {
  return numberOrRaw(device.value);
}

function isTemperatureDevice(device: BackendDevice) {
  const type = normalize(device.type);
  const text = normalize([device.typeLabel ?? "", device.name].join(" "));
  return ["t", "thermostat", "temperature"].includes(type) || text.includes("temperature") || text.includes("nhiệt độ") || text.includes("nhiet do");
}

function isHumidityDevice(device: BackendDevice) {
  const type = normalize(device.type);
  const text = normalize([device.typeLabel ?? "", device.name].join(" "));
  return ["h", "humidity"].includes(type) || text.includes("humidity") || text.includes("độ ẩm") || text.includes("do am");
}

function isFanDevice(device: BackendDevice) {
  const type = normalize(device.type);
  const text = normalize([device.typeLabel ?? "", device.name].join(" "));
  return type === "fan" || text.includes("fan") || text.includes("quạt") || text.includes("quat");
}

function isLightDevice(device: BackendDevice) {
  const type = normalize(device.type);
  const text = normalize([device.typeLabel ?? "", device.name].join(" "));
  return ["l", "bulb", "light"].includes(type) || text.includes("light") || text.includes("đèn") || text.includes("den");
}

function isCurtainDevice(device: BackendDevice) {
  const type = normalize(device.type);
  const text = normalize([device.typeLabel ?? "", device.name].join(" "));
  return type === "curtain" || text.includes("curtain") || text.includes("rèm") || text.includes("rem");
}

function isThermostatDevice(device: BackendDevice) {
  const type = normalize(device.type);
  const text = normalize([device.typeLabel ?? "", device.name].join(" "));
  return type === "thermostat" || text.includes("điều hòa") || text.includes("điều hoà") || text.includes("dieu hoa");
}

function propertyFromLabel(label: unknown, fallback: string) {
  const text = normalize(stringValue(label));
  if (text.includes("nhiệt độ") || text.includes("nhiet do") || text.includes("temperature")) return "temperature";
  if (text.includes("độ ẩm") || text.includes("do am") || text.includes("humidity")) return "humidity";
  if (text.includes("độ sáng") || text.includes("do sang") || text.includes("brightness") || text.includes("light")) return "brightness";
  if (text.includes("tốc độ") || text.includes("toc do") || text.includes("speed")) return "speed";
  if (text.includes("vị trí") || text.includes("vi tri") || text.includes("position")) return "position";
  return fallback;
}

function primaryPropertyForDevice(device: BackendDevice, inputConfig?: Record<string, unknown>) {
  const byLabel = propertyFromLabel(inputConfig?.label, "");
  if (byLabel) return byLabel;
  if (isFanDevice(device)) return "speed";
  if (isLightDevice(device)) return "brightness";
  if (isCurtainDevice(device)) return "position";
  if (isTemperatureDevice(device)) return "temperature";
  return "value";
}

function capabilityFromInputConfig(property: string, inputConfig?: Record<string, unknown>): DeviceCapability {
  const capability: DeviceCapability = {
    property,
    type: "number",
    writable: true
  };

  if (typeof inputConfig?.min === "number") capability.min = inputConfig.min;
  if (typeof inputConfig?.max === "number") capability.max = inputConfig.max;
  if (typeof inputConfig?.unit === "string") capability.unit = inputConfig.unit;
  return capability;
}

function inputConfigLabels(inputConfig?: Record<string, unknown>) {
  const labels: string[] = [];
  if (typeof inputConfig?.label === "string") labels.push(inputConfig.label);
  if (Array.isArray(inputConfig?.values)) {
    for (const valueConfig of inputConfig.values) {
      if (valueConfig && typeof valueConfig === "object" && typeof (valueConfig as Record<string, unknown>).label === "string") {
        labels.push((valueConfig as Record<string, unknown>).label as string);
      }
    }
  }
  return labels;
}

function typeAliases(device: BackendDevice) {
  return [
    ...(isThermostatDevice(device) ? ["máy lạnh", "điều hòa", "điều hoà"] : []),
    ...(isTemperatureDevice(device) ? ["nhiệt độ", "temperature"] : []),
    ...(isFanDevice(device) ? ["quạt", "fan"] : []),
    ...(isLightDevice(device) ? ["đèn", "bóng đèn", "light"] : []),
    ...(isCurtainDevice(device) ? ["rèm", "rèm cửa", "curtain"] : []),
    ...(isHumidityDevice(device) ? ["độ ẩm", "humidity"] : [])
  ];
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function buildValuesAndCapabilities(device: BackendDevice, inputConfig?: Record<string, unknown>) {
  const values: Record<string, unknown> = {};
  const capabilities: DeviceCapability[] = [];

  if (Array.isArray(inputConfig?.values)) {
    const rawValues = device.value.split(",");
    inputConfig.values.forEach((valueConfig, index) => {
      const configItem = valueConfig && typeof valueConfig === "object" ? valueConfig as Record<string, unknown> : undefined;
      const property = propertyFromLabel(configItem?.label, `value_${index + 1}`);
      values[property] = numberOrRaw(rawValues[index] ?? "");
      capabilities.push(capabilityFromInputConfig(property, configItem));
    });
  } else {
    const property = primaryPropertyForDevice(device, inputConfig);
    const value = parseDeviceValue(device);
    values[property] = value;
    if (property !== "value") values.value = value;
    capabilities.push(capabilityFromInputConfig(property, inputConfig));
  }

  if (device.isOn !== null && device.isOn !== undefined) {
    values.power = Boolean(device.isOn);
    capabilities.push({ property: "power", type: "boolean", writable: true });
  }

  return { values, capabilities };
}

function toNormalizedDevice(device: BackendDevice): Device {
  const inputConfig = parseInputConfig(device);
  const { values, capabilities } = buildValuesAndCapabilities(device, inputConfig);
  return {
    device_id: device.code,
    name: device.name,
    room: device.roomId === null || device.roomId === undefined ? "" : String(device.roomId),
    type: device.typeLabel || device.type,
    aliases: uniqueStrings([
      device.code,
      device.name,
      device.model,
      device.type,
      device.typeLabel,
      ...inputConfigLabels(inputConfig),
      ...typeAliases(device)
    ]),
    online: normalize(device.status) !== "offline",
    values,
    capabilities,
    updated_at: device.updated_at ?? device.lastUpdate ?? new Date().toISOString(),
    raw: device
  };
}

function deviceSearchUrl(search: string) {
  const url = new URL(IOT_DEVICE_BY_MAC_PATH, normalizedIotApiBaseUrl());
  url.searchParams.set(IOT_SEARCH_PARAM, search);
  return url.toString();
}

function patchDeviceUrl(code: string, value: unknown) {
  const url = new URL(IOT_DEVICE_BY_MAC_PATH, normalizedIotApiBaseUrl());
  url.searchParams.set("id", code);
  url.searchParams.set("value", String(value));
  return url.toString();
}

function normalizedIotApiBaseUrl() {
  return config.iotApiBaseUrl.endsWith("/") ? config.iotApiBaseUrl : `${config.iotApiBaseUrl}/`;
}

async function fetchBackendDevices(search = "") {
  const response = await fetchImpl(deviceSearchUrl(search));
  if (!response.ok) {
    throw Object.assign(new Error(`Backend device list fetch failed with ${response.status}`), { code: "BACKEND_DEVICE_FETCH_FAILED" });
  }
  return backendDeviceListResponseSchema.parse(await response.json()).data.map(toNormalizedDevice);
}

async function findDeviceByCode(deviceId: string) {
  const devices = await fetchBackendDevices(deviceId);
  const device = devices.find((item) => item.device_id === deviceId);
  if (!device) {
    throw Object.assign(new Error("Device not found"), { code: "DEVICE_NOT_FOUND" });
  }
  return device;
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
  const questionNoiseWords = new Set(["đang", "dang", "là", "la", "bao", "nhiêu", "nhieu", "nhiu"]);
  const roomNoiseWords = new Set(["phòng", "phong", "ngủ", "ngu", "khách", "khach"]);
  const queryParts = query?.split(/\s+/).filter((part) => !questionNoiseWords.has(part) && (device.room || !roomNoiseWords.has(part)));
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
  return device.capabilities.find((item) => item.property === property);
}

export type SearchDevicesInput = {
  query?: string;
  name?: string;
  room?: string;
  type?: string;
};

export async function searchDevices(input: SearchDevicesInput) {
  const backendSearch = input.query || input.name || "";
  const devices = await fetchBackendDevices(backendSearch);
  const matches = devices.filter((device) => matchesQuery(device, input));
  if (matches.length || !backendSearch) return matches;

  const fallbackDevices = await fetchBackendDevices("");
  return fallbackDevices.filter((device) => matchesQuery(device, input));
}

export async function getDeviceState(deviceId: string) {
  const device = await findDeviceByCode(deviceId);

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
  const device = await findDeviceByCode(deviceId);
  return {
    device_id: device.device_id,
    capabilities: device.capabilities
  };
}

export async function validateDeviceValue(deviceId: string, property: string, value: unknown) {
  const device = await findDeviceByCode(deviceId);
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
