import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("intent parser runtime config", () => {
  it("uses env-backed config for the main parser and repair parser", async () => {
    process.env.OLLAMA_BASE_URL = "http://ollama-test:11434";
    process.env.OLLAMA_MODEL = "iot-qwen:test";
    process.env.OLLAMA_FORMAT = "json";
    process.env.OLLAMA_TEMPERATURE = "0.2";
    process.env.LLM_NUM_PREDICT = "321";
    process.env.LLM_REPAIR_NUM_PREDICT = "77";

    const { buildIntentParserModelOptions, buildSearchRepairModelOptions } = await import("../src/chains/intentParser.chain.js");

    expect(buildIntentParserModelOptions()).toMatchObject({
      baseUrl: "http://ollama-test:11434",
      model: "iot-qwen:test",
      format: "json",
      temperature: 0.2,
      numPredict: 321
    });
    expect(buildSearchRepairModelOptions()).toMatchObject({
      baseUrl: "http://ollama-test:11434",
      model: "iot-qwen:test",
      format: "json",
      temperature: 0.2,
      numPredict: 77
    });
  });

  it("loads parser prompts from the dedicated prompt module", async () => {
    const { intentParserPrompt, searchRepairPrompt } = await import("../src/chains/intentParser.prompts.js");

    expect(intentParserPrompt).toContain("Bạn là intent parser");
    expect(searchRepairPrompt).toContain("Bạn phân loại truy vấn tìm thiết bị IoT.");
  });

  it("uses the configured confidence threshold when deciding clarification", async () => {
    process.env.INTENT_CONFIDENCE_THRESHOLD = "0.9";

    const { shouldRequestClarification } = await import("../src/agents/deviceAgent.graph.js");

    expect(shouldRequestClarification({
      intent: "read_device_state",
      device_query: { raw: "đèn phòng khách" },
      property: "power",
      action: null,
      confidence: 0.89
    })).toBe(true);
    expect(shouldRequestClarification({
      intent: "read_device_state",
      device_query: { raw: "đèn phòng khách" },
      property: "power",
      action: null,
      confidence: 0.91
    })).toBe(false);
  });
});
