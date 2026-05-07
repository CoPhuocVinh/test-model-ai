import { randomUUID } from "node:crypto";
import type { Device, DeviceCapability } from "../schemas/device.js";

const now = () => new Date().toISOString();

const commonPower: DeviceCapability = {
  property: "power",
  type: "boolean",
  writable: true
};

const initialDevices: Device[] = [
    {
      device_id: "light_living_ceiling",
      name: "Đèn trần phòng khách",
      room: "phòng khách",
      type: "light",
      aliases: ["đèn trần", "đèn phòng khách", "đèn khu vực tiếp khách", "đèn tiếp khách"],
      online: true,
      values: { power: true, brightness: 80 },
      capabilities: [
        commonPower,
        { property: "brightness", type: "number", writable: true, min: 0, max: 100, unit: "percent" }
      ],
      updated_at: now()
    },
    {
      device_id: "light_living_led",
      name: "Đèn led phòng khách",
      room: "phòng khách",
      type: "light",
      aliases: ["đèn led", "đèn phòng khách", "đèn khu vực tiếp khách", "đèn tiếp khách"],
      online: true,
      values: { power: false, brightness: 30 },
      capabilities: [
        commonPower,
        { property: "brightness", type: "number", writable: true, min: 0, max: 100, unit: "percent" }
      ],
      updated_at: now()
    },
    {
      device_id: "light_living_corner",
      name: "Đèn góc phòng khách",
      room: "phòng khách",
      type: "light",
      aliases: ["đèn góc", "đèn phòng khách", "đèn khu vực tiếp khách", "đèn tiếp khách"],
      online: false,
      values: { power: false, brightness: 0 },
      capabilities: [
        commonPower,
        { property: "brightness", type: "number", writable: true, min: 0, max: 100, unit: "percent" }
      ],
      updated_at: now()
    },
    {
      device_id: "ac_bedroom",
      name: "Máy lạnh phòng ngủ",
      room: "phòng ngủ",
      type: "ac",
      aliases: ["máy lạnh", "điều hòa phòng ngủ", "điều hoà phòng ngủ", "ac phòng ngủ"],
      online: true,
      values: { power: true, temperature: 24, mode: "cool" },
      capabilities: [
        commonPower,
        { property: "temperature", type: "number", writable: true, min: 16, max: 30, unit: "celsius" },
        { property: "mode", type: "enum", writable: true, values: ["cool", "heat", "dry", "fan"] }
      ],
      updated_at: now()
    },
    {
      device_id: "door_sensor_main",
      name: "Cảm biến cửa chính",
      room: "cửa chính",
      type: "sensor",
      aliases: ["cảm biến cửa", "cảm biến cửa chính", "sensor cửa chính"],
      online: true,
      values: { open: false, battery: 88 },
      capabilities: [
        { property: "open", type: "boolean", writable: false },
        { property: "battery", type: "number", writable: false, min: 0, max: 100, unit: "percent" }
      ],
      updated_at: now()
    }
];

const devices = new Map<string, Device>(initialDevices.map((device) => [device.device_id, device]));

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function includesText(source: string, needle?: string) {
  if (!needle) return true;
  return normalize(source).includes(normalize(needle));
}

function summarize(device: Device) {
  const { capabilities, values, updated_at, aliases, ...summary } = device;
  return summary;
}

export type SearchDevicesInput = {
  query?: string;
  name?: string;
  room?: string;
  type?: string;
};

export function searchDevices(input: SearchDevicesInput) {
  const query = input.query ? normalize(input.query) : undefined;
  const results = [...devices.values()].filter((device) => {
    const haystack = normalize(`${device.name} ${device.room} ${device.type} ${device.aliases?.join(" ") ?? ""}`);
    const queryMatches = query ? haystack.includes(query) || query.split(/\s+/).every((part) => haystack.includes(part)) : true;
    return (
      queryMatches &&
      includesText(device.name, input.name) &&
      includesText(device.room, input.room) &&
      includesText(device.type, input.type)
    );
  });

  return results.map(summarize);
}

export function getDeviceState(deviceId: string) {
  const device = devices.get(deviceId);
  if (!device) {
    throw Object.assign(new Error("Device not found"), { code: "DEVICE_NOT_FOUND" });
  }

  return {
    device_id: device.device_id,
    name: device.name,
    room: device.room,
    type: device.type,
    online: device.online,
    values: device.values,
    updated_at: device.updated_at
  };
}

export function listDeviceCapabilities(deviceId: string) {
  const device = devices.get(deviceId);
  if (!device) {
    throw Object.assign(new Error("Device not found"), { code: "DEVICE_NOT_FOUND" });
  }

  return {
    device_id: device.device_id,
    capabilities: device.capabilities
  };
}

export function validateDeviceValue(deviceId: string, property: string, value: unknown) {
  const device = devices.get(deviceId);
  if (!device) {
    return { valid: false, reason: "Device not found", code: "DEVICE_NOT_FOUND" };
  }

  const capability = device.capabilities.find((item) => item.property === property);
  if (!capability) {
    return { valid: false, reason: `Property ${property} is not supported`, code: "UNSUPPORTED_PROPERTY" };
  }

  if (!capability.writable) {
    return { valid: false, reason: `Property ${property} is not writable`, code: "UNSUPPORTED_PROPERTY" };
  }

  if (capability.type === "boolean" && typeof value !== "boolean") {
    return { valid: false, reason: `${property} must be boolean`, code: "INVALID_VALUE" };
  }

  if (capability.type === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return { valid: false, reason: `${property} must be a number`, code: "INVALID_VALUE" };
    }
    if (capability.min !== undefined && value < capability.min) {
      return { valid: false, reason: `${property} must be >= ${capability.min}`, code: "INVALID_VALUE" };
    }
    if (capability.max !== undefined && value > capability.max) {
      return { valid: false, reason: `${property} must be <= ${capability.max}`, code: "INVALID_VALUE" };
    }
  }

  if (capability.type === "enum" && !capability.values?.includes(value as string)) {
    return { valid: false, reason: `${property} must be one of ${capability.values?.join(", ")}`, code: "INVALID_VALUE" };
  }

  if (capability.type === "string" && typeof value !== "string") {
    return { valid: false, reason: `${property} must be a string`, code: "INVALID_VALUE" };
  }

  return { valid: true };
}

export function setDeviceValue(deviceId: string, property: string, value: unknown) {
  const device = devices.get(deviceId);
  if (!device) {
    throw Object.assign(new Error("Device not found"), { code: "DEVICE_NOT_FOUND" });
  }
  if (!device.online) {
    throw Object.assign(new Error("Device is offline"), { code: "DEVICE_OFFLINE" });
  }

  const validation = validateDeviceValue(deviceId, property, value);
  if (!validation.valid) {
    throw Object.assign(new Error(validation.reason), { code: validation.code ?? "INVALID_VALUE" });
  }

  device.values[property] = value;
  device.updated_at = now();

  return {
    success: true,
    device_id: deviceId,
    property,
    value,
    request_id: randomUUID()
  };
}

export function resetMockDevicesForTest() {
  // Tests run in isolated processes by default, so this hook is intentionally a no-op for now.
}
