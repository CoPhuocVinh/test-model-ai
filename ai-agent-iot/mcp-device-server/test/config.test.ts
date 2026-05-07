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

  it("fails fast for invalid port env values", async () => {
    process.env.PORT = "abc";

    await expect(import("../src/config.js")).rejects.toThrow("Invalid numeric env PORT");
  });
});
