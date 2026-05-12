import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDeviceState,
  listDeviceCapabilities,
  resetBackendDeviceStoreForTest,
  searchDevices,
  setDeviceFetchForTest,
  setDeviceValue,
  validateDeviceValue
} from "../src/store/backendDeviceStore.js";

const originalEnv = { ...process.env };

const backendDevices = [
  {
    id: 4,
    userId: 1,
    name: "Máy lạnh mẫu",
    model: "Demo Model",
    firmwareVersion: null,
    type: "thermostat",
    typeLabel: "Điều hòa",
    status: "offline",
    value: "26",
    prevalue: null,
    isOn: 1,
    roomId: null,
    lastUpdate: null,
    statusLastDate: "2026-05-11T08:28:30.000Z",
    statusTimeout: 60,
    created_at: "2026-05-11T08:28:30.000Z",
    updated_at: "2026-05-11T08:30:00.000Z",
    code: "INIT-THERMOSTAT",
    inputConfig: "{\"controlType\":\"input\",\"label\":\"Nhiệt độ\",\"min\":16,\"max\":30,\"step\":1,\"unit\":\"°C\",\"defaultValue\":26}"
  },
  {
    id: 5,
    userId: 1,
    name: "Quạt mẫu",
    model: "Demo Model",
    firmwareVersion: null,
    type: "fan",
    typeLabel: "Quạt",
    status: "offline",
    value: "3",
    prevalue: null,
    isOn: 1,
    roomId: null,
    lastUpdate: null,
    statusLastDate: "2026-05-11T08:28:30.000Z",
    statusTimeout: 60,
    created_at: "2026-05-11T08:28:30.000Z",
    updated_at: "2026-05-11T08:30:00.000Z",
    code: "INIT-FAN",
    inputConfig: "{\"controlType\":\"input\",\"label\":\"Tốc độ\",\"min\":0,\"max\":5,\"step\":1,\"unit\":\"\",\"defaultValue\":3}"
  },
  {
    id: 6,
    userId: 1,
    name: "Đèn mẫu",
    model: "Demo Model",
    firmwareVersion: null,
    type: "bulb",
    typeLabel: "Đèn",
    status: "offline",
    value: "70",
    prevalue: null,
    isOn: 1,
    roomId: null,
    lastUpdate: null,
    statusLastDate: "2026-05-11T08:28:31.000Z",
    statusTimeout: 60,
    created_at: "2026-05-11T08:28:31.000Z",
    updated_at: "2026-05-11T08:30:00.000Z",
    code: "INIT-BULB",
    inputConfig: "{\"controlType\":\"input\",\"label\":\"Độ sáng\",\"min\":0,\"max\":100,\"step\":1,\"unit\":\"%\",\"defaultValue\":70}"
  },
  {
    id: 7,
    userId: 1,
    name: "Rèm cửa mẫu",
    model: "Demo Model",
    firmwareVersion: null,
    type: "curtain",
    typeLabel: "Rèm cửa",
    status: "offline",
    value: "50",
    prevalue: null,
    isOn: 0,
    roomId: null,
    lastUpdate: null,
    statusLastDate: "2026-05-11T08:28:31.000Z",
    statusTimeout: 60,
    created_at: "2026-05-11T08:28:31.000Z",
    updated_at: "2026-05-11T08:30:00.000Z",
    code: "INIT-CURTAIN",
    inputConfig: "{\"controlType\":\"input\",\"label\":\"Vị trí\",\"min\":0,\"max\":100,\"step\":1,\"unit\":\"%\",\"defaultValue\":50}"
  },
  {
    id: 2,
    userId: 1,
    name: "Smart Light",
    model: "L-Bulb-Smart",
    firmwareVersion: null,
    type: "L",
    typeLabel: "Light",
    status: "offline",
    value: "80",
    prevalue: null,
    isOn: 1,
    roomId: null,
    lastUpdate: null,
    statusLastDate: "2026-05-11T07:46:34.000Z",
    statusTimeout: 60,
    created_at: "2026-05-11T07:46:33.000Z",
    updated_at: "2026-05-11T07:50:00.000Z",
    code: "L-001",
    inputConfig: "{\"label\":\"Độ sáng\",\"min\":0,\"max\":100,\"step\":1,\"unit\":\"%\",\"defaultValue\":50,\"controlType\":\"input\"}"
  },
  {
    id: 3,
    userId: 1,
    name: "Temperature & Humidity Sensor",
    model: "H-Sensor-Pro",
    firmwareVersion: null,
    type: "H",
    typeLabel: "Temperature & Humidity Sensor",
    status: "offline",
    value: "25,50",
    prevalue: null,
    isOn: 1,
    roomId: null,
    lastUpdate: null,
    statusLastDate: "2026-05-11T07:46:34.000Z",
    statusTimeout: 60,
    created_at: "2026-05-11T07:46:33.000Z",
    updated_at: "2026-05-11T07:50:00.000Z",
    code: "H-001",
    inputConfig: "{\"values\":[{\"label\":\"Nhiệt độ\",\"min\":-50,\"max\":100,\"step\":0.1,\"unit\":\"°C\",\"defaultValue\":25,\"controlType\":\"input\"},{\"label\":\"Độ ẩm\",\"min\":0,\"max\":100,\"step\":1,\"unit\":\"%\",\"defaultValue\":50,\"controlType\":\"input\"}],\"controlType\":\"input\"}"
  },
  {
    id: 8,
    userId: 1,
    name: "Environmental Combo Sensor",
    model: "Combo-Pro",
    firmwareVersion: null,
    type: "combo",
    typeLabel: "Environmental Sensor",
    status: "offline",
    value: "24,65",
    prevalue: null,
    isOn: 1,
    roomId: null,
    lastUpdate: null,
    statusLastDate: "2026-05-11T07:46:34.000Z",
    statusTimeout: 60,
    created_at: "2026-05-11T07:46:33.000Z",
    updated_at: "2026-05-11T07:50:00.000Z",
    code: "ENV-001",
    inputConfig: "{\"values\":[{\"label\":\"Nhiệt độ\",\"min\":-50,\"max\":100,\"step\":0.1,\"unit\":\"°C\",\"defaultValue\":24,\"controlType\":\"input\"},{\"label\":\"Độ ẩm\",\"min\":0,\"max\":100,\"step\":1,\"unit\":\"%\",\"defaultValue\":65,\"controlType\":\"input\"}],\"controlType\":\"input\"}"
  }
];

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesBackendSearch(device: (typeof backendDevices)[number], search: string) {
  if (!search) return true;
  const haystack = normalize([device.name, device.code, device.type, device.typeLabel ?? "", device.model ?? ""].join(" "));
  return haystack.includes(normalize(search));
}

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      return jsonResponse({ success: true });
    }

    const url = new URL(String(input));
    const search = url.searchParams.get("$search") ?? "";
    const data = backendDevices.filter((device) => matchesBackendSearch(device, search));
    return jsonResponse({ total: data.length, limit: 10, skip: 0, data });
  });
  setDeviceFetchForTest(fetchMock as typeof fetch);
  return fetchMock;
}

function calledSearches(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method !== "PATCH")
    .map(([input]) => new URL(String(input)).searchParams.get("$search") ?? "");
}

function calledReadUrls(fetchMock: ReturnType<typeof mockFetch>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method !== "PATCH")
    .map(([input]) => String(input));
}

afterEach(() => {
  process.env = { ...originalEnv };
  resetBackendDeviceStoreForTest();
  vi.resetModules();
});

describe("backend device adapter", () => {
  it("normalizes backend device state by exact code lookup", async () => {
    mockFetch();

    const state = await getDeviceState("INIT-THERMOSTAT");

    expect(state.device_id).toBe("INIT-THERMOSTAT");
    expect(state.online).toBe(false);
    expect(state.values.value).toBe(26);
    expect(state.values.temperature).toBe(26);
    expect(state.values.power).toBe(true);
    expect(state.raw).toMatchObject({ code: "INIT-THERMOSTAT" });
  });

  it("throws when a searched code does not exactly match a returned device", async () => {
    mockFetch();

    await expect(getDeviceState("UNKNOWN")).rejects.toMatchObject({ code: "DEVICE_NOT_FOUND" });
  });

  it("lists all backend devices with an empty backend search", async () => {
    const fetchMock = mockFetch();

    const devices = await searchDevices({});

    expect(devices).toHaveLength(backendDevices.length);
    expect(calledSearches(fetchMock)).toEqual([""]);
    expect(calledReadUrls(fetchMock)).toEqual(["http://iot.dev-api.bmscontrols.vn/iot/device-by-mac?%24search="]);
  });

  it("uses backend search for code and name queries", async () => {
    const fetchMock = mockFetch();

    await expect(searchDevices({ query: "INIT-BULB" })).resolves.toMatchObject([{ device_id: "INIT-BULB" }]);
    await expect(searchDevices({ query: "Đèn" })).resolves.toMatchObject([{ device_id: "INIT-BULB" }]);
    await expect(searchDevices({ query: "Smart Light" })).resolves.toMatchObject([{ device_id: "L-001" }]);

    expect(calledSearches(fetchMock)).toEqual(["INIT-BULB", "Đèn", "Smart Light"]);
  });

  it("falls back to list-all plus local filtering when backend search is too narrow", async () => {
    const fetchMock = mockFetch();

    await expect(searchDevices({ query: "máy lạnh phòng ngủ" })).resolves.toMatchObject([{ device_id: "INIT-THERMOSTAT" }]);

    expect(calledSearches(fetchMock)).toEqual(["máy lạnh phòng ngủ", ""]);
  });

  it("ignores Vietnamese question filler words in local fallback search", async () => {
    const fetchMock = mockFetch();

    const devices = await searchDevices({ query: "nhiệt là bao nhiu" });
    const deviceIds = devices.map((device) => device.device_id);

    expect(deviceIds).toEqual(expect.arrayContaining(["INIT-THERMOSTAT", "H-001", "ENV-001"]));
    expect(deviceIds).not.toContain("INIT-FAN");
    expect(deviceIds).not.toContain("INIT-BULB");
    expect(calledSearches(fetchMock)).toEqual(["nhiệt là bao nhiu", ""]);
  });

  it("does not match non-thermostat devices as máy lạnh", async () => {
    mockFetch();

    await expect(searchDevices({ query: "máy lạnh" })).resolves.toMatchObject([{ device_id: "INIT-THERMOSTAT" }]);
    await expect(searchDevices({ query: "xyz-no-match" })).resolves.toHaveLength(0);
  });

  it("builds dynamic capabilities by device type", async () => {
    mockFetch();

    await expect(listDeviceCapabilities("INIT-THERMOSTAT")).resolves.toMatchObject({
      capabilities: expect.arrayContaining([expect.objectContaining({ property: "temperature" })])
    });
    await expect(listDeviceCapabilities("INIT-BULB")).resolves.toMatchObject({
      capabilities: expect.arrayContaining([expect.objectContaining({ property: "brightness" })])
    });
    await expect(listDeviceCapabilities("INIT-FAN")).resolves.toMatchObject({
      capabilities: expect.arrayContaining([expect.objectContaining({ property: "speed" })])
    });
    await expect(listDeviceCapabilities("INIT-CURTAIN")).resolves.toMatchObject({
      capabilities: expect.arrayContaining([expect.objectContaining({ property: "position" })])
    });
  });

  it("does not assign temperature capability to every device", async () => {
    mockFetch();

    const bulb = await listDeviceCapabilities("INIT-BULB");
    const fan = await listDeviceCapabilities("INIT-FAN");
    const curtain = await listDeviceCapabilities("INIT-CURTAIN");

    expect(bulb.capabilities.map((item) => item.property)).not.toContain("temperature");
    expect(fan.capabilities.map((item) => item.property)).not.toContain("temperature");
    expect(curtain.capabilities.map((item) => item.property)).not.toContain("temperature");
  });

  it("parses H sensor multi-value values from inputConfig.values", async () => {
    mockFetch();

    const state = await getDeviceState("H-001");
    const capabilities = await listDeviceCapabilities("H-001");

    expect(state.values.temperature).toBe(25);
    expect(state.values.humidity).toBe(50);
    expect(capabilities.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: "temperature" }),
      expect.objectContaining({ property: "humidity" })
    ]));
  });

  it("parses multi-value devices from inputConfig.values without relying on device type", async () => {
    mockFetch();

    const state = await getDeviceState("ENV-001");
    const capabilities = await listDeviceCapabilities("ENV-001");

    expect(state.values.temperature).toBe(24);
    expect(state.values.humidity).toBe(65);
    expect(capabilities.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ property: "temperature" }),
      expect.objectContaining({ property: "humidity" })
    ]));
  });

  it("validates only properties supported by the device", async () => {
    mockFetch();

    await expect(validateDeviceValue("INIT-THERMOSTAT", "temperature", 26)).resolves.toEqual({ valid: true });
    await expect(validateDeviceValue("INIT-THERMOSTAT", "temperature", 5)).resolves.toMatchObject({
      valid: false,
      code: "INVALID_VALUE"
    });
    await expect(validateDeviceValue("INIT-BULB", "temperature", 26)).resolves.toMatchObject({
      valid: false,
      code: "UNSUPPORTED_PROPERTY"
    });
  });

  it("patches numeric values through the backend API", async () => {
    const fetchMock = mockFetch();

    const result = await setDeviceValue("INIT-THERMOSTAT", "temperature", 26);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://iot.dev-api.bmscontrols.vn/iot/device-by-mac?id=INIT-THERMOSTAT&value=26",
      { method: "PATCH" }
    );
  });

  it("maps power writes to backend value", async () => {
    const fetchMock = mockFetch();

    await setDeviceValue("INIT-BULB", "power", true);

    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://iot.dev-api.bmscontrols.vn/iot/device-by-mac?id=INIT-BULB&value=1",
      { method: "PATCH" }
    );
  });

  it("builds device URLs correctly when the IoT base endpoint has a trailing slash", async () => {
    vi.resetModules();
    process.env.IOT_API_ENDPOINT = "http://iot.dev-api.bmscontrols.vn/";
    const deviceStore = await import("../src/store/backendDeviceStore.js");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return jsonResponse({ success: true });
      }
      return jsonResponse({ total: 0, limit: 10, skip: 0, data: [] });
    });
    deviceStore.setDeviceFetchForTest(fetchMock as typeof fetch);

    await expect(deviceStore.searchDevices({})).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith("http://iot.dev-api.bmscontrols.vn/iot/device-by-mac?%24search=");
    deviceStore.resetBackendDeviceStoreForTest();
  });
});
