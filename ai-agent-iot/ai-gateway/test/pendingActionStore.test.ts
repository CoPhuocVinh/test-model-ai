import { describe, expect, it } from "vitest";
import { consumePendingAction, createPendingAction } from "../src/stores/pendingActionStore.js";

const candidates = [
  {
    device_id: "light_living_ceiling",
    name: "Đèn trần phòng khách",
    room: "phòng khách",
    type: "light",
    online: true
  }
];

describe("pending action store", () => {
  it("consumes a valid pending action once", () => {
    const pending = createPendingAction("conv", { property: "power", operation: "set", value: true }, candidates);
    const result = consumePendingAction("conv", pending.id, "light_living_ceiling");
    expect(result.selectedDevice.device_id).toBe("light_living_ceiling");
    expect(() => consumePendingAction("conv", pending.id, "light_living_ceiling")).toThrow("already used");
  });

  it("rejects devices outside candidates", () => {
    const pending = createPendingAction("conv", { property: "power", operation: "set", value: true }, candidates);
    expect(() => consumePendingAction("conv", pending.id, "other")).toThrow("not a candidate");
  });
});
