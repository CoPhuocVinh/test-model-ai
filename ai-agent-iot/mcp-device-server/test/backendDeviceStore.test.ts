import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDeviceState,
  resetBackendDeviceStoreForTest,
  searchDevices,
  setDeviceFetchForTest,
  setDeviceValue,
  validateDeviceValue
} from "../src/store/backendDeviceStore.js";

const backendDevice = {
  id: 5,
  userId: 1,
  name: "Máy lạnh mẫu",
  model: "Demo Model",
  firmwareVersion: null,
  type: "fan",
  typeLabel: "Điều hòa",
  status: "offline",
  value: "23",
  prevalue: "23",
  isOn: 1,
  roomId: null,
  lastUpdate: "2026-05-08T15:33:31.000Z",
  statusLastDate: "2026-05-08T15:33:31.000Z",
  statusTimeout: 60,
  created_at: "2026-04-22T13:25:31.000Z",
  updated_at: "2026-05-08T15:35:00.000Z",
  code: "MLM",
  inputConfig: "{\"controlType\":\"input\",\"label\":\"Nhiệt độ\",\"min\":16,\"max\":30,\"step\":1,\"unit\":\"°C\",\"defaultValue\":26}"
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  });
}

function mockFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      return jsonResponse({ success: true });
    }
    return jsonResponse(backendDevice);
  });
  setDeviceFetchForTest(fetchMock as typeof fetch);
  return fetchMock;
}

afterEach(() => {
  resetBackendDeviceStoreForTest();
});

describe("backend device adapter", () => {
  it("normalizes backend device state", async () => {
    mockFetch();

    const state = await getDeviceState("MLM");

    expect(state.device_id).toBe("MLM");
    expect(state.online).toBe(false);
    expect(state.values.value).toBe(23);
    expect(state.values.temperature).toBe(23);
    expect(state.raw).toMatchObject(backendDevice);
  });

  it("searches the demo backend device", async () => {
    mockFetch();

    await expect(searchDevices({ query: "máy lạnh" })).resolves.toHaveLength(1);
    await expect(searchDevices({ query: "máy lạnh phòng ngủ" })).resolves.toHaveLength(1);
    await expect(searchDevices({ query: "điều hòa" })).resolves.toHaveLength(1);
    await expect(searchDevices({ query: "MLM" })).resolves.toHaveLength(1);
    await expect(searchDevices({ query: "đèn phòng khách" })).resolves.toHaveLength(0);
  });

  it("validates values from inputConfig", async () => {
    mockFetch();

    await expect(validateDeviceValue("MLM", "temperature", 26)).resolves.toEqual({ valid: true });
    await expect(validateDeviceValue("MLM", "temperature", 5)).resolves.toMatchObject({
      valid: false,
      code: "INVALID_VALUE"
    });
  });

  it("patches numeric values through the backend API", async () => {
    const fetchMock = mockFetch();

    const result = await setDeviceValue("MLM", "temperature", 26);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://iot.api.bmscontrols.vn/iot/device-by-mac?id=MLM&value=26",
      { method: "PATCH" }
    );
  });

  it("maps power writes to backend value", async () => {
    const fetchMock = mockFetch();

    await setDeviceValue("MLM", "power", true);

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://iot.api.bmscontrols.vn/iot/device-by-mac?id=MLM&value=1",
      { method: "PATCH" }
    );
  });
});
