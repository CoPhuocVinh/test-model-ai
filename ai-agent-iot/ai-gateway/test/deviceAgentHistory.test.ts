import { describe, expect, it } from "vitest";
import { loadMessageHistory } from "../src/agents/deviceAgent.graph.js";

describe("device agent history loading", () => {
  it("keeps explicitly supplied previous history", async () => {
    const previousHistory = [
      { role: "user" as const, content: "Máy lạnh phòng ngủ đang bao nhiêu độ?" },
      { role: "assistant" as const, content: "Máy lạnh phòng ngủ đang đặt 24 độ C." }
    ];

    await expect(loadMessageHistory({
      conversationId: "conv",
      userMessage: "Nó đang bật không?",
      messageHistory: previousHistory
    })).resolves.toEqual({});
  });
});
