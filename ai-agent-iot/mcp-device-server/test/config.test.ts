import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("mcp server config", () => {
  it("parses a valid port from env", async () => {
    process.env.PORT = "4101";

    const { config } = await import("../src/config.js");

    expect(config.port).toBe(4101);
  });

  it("uses the default IoT API base URL", async () => {
    const { config } = await import("../src/config.js");

    expect(config.iotApiBaseUrl).toBe("http://iot.dev-api.bmscontrols.vn");
  });

  it("reads the IoT API base URL from env", async () => {
    process.env.IOT_API_ENDPOINT = "https://iot.example.test";

    const { config } = await import("../src/config.js");

    expect(config.iotApiBaseUrl).toBe("https://iot.example.test");
  });

  it("fails fast for invalid port env values", async () => {
    process.env.PORT = "abc";

    await expect(import("../src/config.js")).rejects.toThrow("Invalid numeric env PORT");
  });
});
