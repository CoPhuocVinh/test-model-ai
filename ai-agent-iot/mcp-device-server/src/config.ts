export const config = {
  port: Number(process.env.PORT ?? 4001),
  mcpPath: process.env.MCP_PATH ?? "/mcp"
};
