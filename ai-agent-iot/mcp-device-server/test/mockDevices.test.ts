import { describe, expect, it } from "vitest";
import {
  getDeviceState,
  searchDevices,
  setDeviceValue,
  validateDeviceValue
} from "../src/store/mockDevices.js";

describe("mock device store", () => {
  it("searches multiple living room lights", () => {
    const devices = searchDevices({ name: "đèn", room: "phòng khách" });
    expect(devices.length).toBeGreaterThanOrEqual(2);
  });

  it("searches by alias query text", () => {
    const devices = searchDevices({ query: "đèn khu vực tiếp khách" });
    expect(devices.length).toBeGreaterThanOrEqual(2);
  });

  it("returns device state", () => {
    const state = getDeviceState("ac_bedroom");
    expect(state.values.temperature).toBe(24);
  });

  it("mutates writable values", () => {
    const result = setDeviceValue("ac_bedroom", "temperature", 26);
    expect(result.success).toBe(true);
    expect(getDeviceState("ac_bedroom").values.temperature).toBe(26);
  });

  it("rejects values outside capabilities", () => {
    const result = validateDeviceValue("ac_bedroom", "temperature", 5);
    expect(result.valid).toBe(false);
  });
});
