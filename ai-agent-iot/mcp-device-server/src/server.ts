import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import {
  deviceToolHandlers,
  getDeviceStateInputSchema,
  listDeviceCapabilitiesInputSchema,
  searchDevicesInputSchema,
  setDeviceValueInputSchema,
  toToolError,
  toToolResult,
  validateDeviceValueInputSchema
} from "./tools/deviceTools.js";

function createMcpServer() {
  const server = new McpServer({
    name: "iot-device-mcp-server",
    version: "0.1.0"
  });

  server.registerTool(
    "search_devices",
    {
      title: "Search devices",
      description: "Search mock IoT devices by query, name, room, or type.",
      inputSchema: searchDevicesInputSchema
    },
    async (input) => {
      try {
        return toToolResult(await deviceToolHandlers.search_devices(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "get_device_state",
    {
      title: "Get device state",
      description: "Get connection status and current values for one device.",
      inputSchema: getDeviceStateInputSchema
    },
    async (input) => {
      try {
        return toToolResult(await deviceToolHandlers.get_device_state(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "set_device_value",
    {
      title: "Set device value",
      description: "Write one property value to one specific device.",
      inputSchema: setDeviceValueInputSchema
    },
    async (input) => {
      try {
        return toToolResult(await deviceToolHandlers.set_device_value(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "list_device_capabilities",
    {
      title: "List device capabilities",
      description: "List readable/writable capabilities for one device.",
      inputSchema: listDeviceCapabilitiesInputSchema
    },
    async (input) => {
      try {
        return toToolResult(await deviceToolHandlers.list_device_capabilities(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  server.registerTool(
    "validate_device_value",
    {
      title: "Validate device value",
      description: "Validate that a property/value can be written to a device.",
      inputSchema: validateDeviceValueInputSchema
    },
    async (input) => {
      try {
        return toToolResult(await deviceToolHandlers.validate_device_value(input));
      } catch (error) {
        return toToolError(error);
      }
    }
  );

  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mcp-device-server" });
});

app.all(config.mcpPath, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on("close", () => {
    void transport.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "MCP request failed"
      });
    }
  }
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`MCP Device Server listening on http://0.0.0.0:${config.port}${config.mcpPath}`);
});
