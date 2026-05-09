import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerChatRoutes } from "../src/routes/chat.route.js";
import { registerConfirmActionRoutes } from "../src/routes/confirmAction.route.js";

const mocks = vi.hoisted(() => ({
  runChat: vi.fn(),
  confirmAction: vi.fn()
}));

vi.mock("../src/agents/deviceAgent.graph.js", () => ({
  runChat: mocks.runChat,
  confirmAction: mocks.confirmAction
}));

async function buildApp() {
  const app = Fastify();
  await registerChatRoutes(app);
  await registerConfirmActionRoutes(app);
  return app;
}

describe("route contracts", () => {
  beforeEach(() => {
    mocks.runChat.mockReset();
    mocks.confirmAction.mockReset();
  });

  it("accepts chat requests without a conversation id", async () => {
    mocks.runChat.mockResolvedValue({
      type: "device_read_result",
      message: "Tìm thấy 0 thiết bị phù hợp.",
      devices: []
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { message: "list các thiết bị" }
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.runChat).toHaveBeenCalledWith("list các thiết bị");
    await app.close();
  });

  it("rejects chat requests that still send conversation_id", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: { conversation_id: "demo", message: "list các thiết bị" }
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.runChat).not.toHaveBeenCalled();
    await app.close();
  });

  it("accepts confirm requests without a conversation id", async () => {
    mocks.confirmAction.mockResolvedValue({
      type: "device_write_success",
      message: "Đã bật Đèn trần phòng khách.",
      device: { device_id: "light_living_ceiling", name: "Đèn trần phòng khách" },
      action: { property: "power", operation: "set", value: true }
    });
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/device-actions/confirm",
      payload: {
        pending_action_id: "pending-1",
        device_id: "light_living_ceiling"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.confirmAction).toHaveBeenCalledWith("pending-1", "light_living_ceiling");
    await app.close();
  });

  it("rejects confirm requests that still send conversation_id", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/device-actions/confirm",
      payload: {
        conversation_id: "demo",
        pending_action_id: "pending-1",
        device_id: "light_living_ceiling"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.confirmAction).not.toHaveBeenCalled();
    await app.close();
  });
});
