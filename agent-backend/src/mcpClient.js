/**
 * MCP Client — Spawns the MCP server as a child process and connects via Stdio.
 * Provides tool discovery and execution helpers for the agent.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let client = null;
let tools = [];

/**
 * Initialize the MCP client by spawning the MCP server process.
 */
export async function initMcpClient() {
  const mcpServerPath =
    process.env.MCP_SERVER_PATH || "../mcp-server/src/index.js";
  const serverScript = path.resolve(__dirname, "..", mcpServerPath);

  console.log(`[MCP Client] Spawning MCP server: ${serverScript}`);

  const transport = new StdioClientTransport({
    command: "node",
    args: [serverScript],
    env: {
      ...process.env,
      // Pass gateway config to the MCP server child process
      GATEWAY_URL: process.env.GATEWAY_URL || "http://localhost:9090",
    },
  });

  client = new Client(
    { name: "airbnb-agent-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  // Discover available tools
  const toolsResult = await client.listTools();
  tools = toolsResult.tools || [];

  console.log(
    `[MCP Client] Connected. Discovered ${tools.length} tools:`,
    tools.map((t) => t.name).join(", ")
  );

  return { client, tools };
}

/**
 * Get the list of discovered MCP tools.
 */
export function getMcpTools() {
  return tools;
}

/**
 * Convert MCP tools to OpenAI function-calling tool format.
 */
export function getOpenAIToolDefinitions() {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.inputSchema || { type: "object", properties: {} },
    },
  }));
}

/**
 * Execute an MCP tool by name with the given arguments.
 * Returns the tool result as a string.
 */
export async function callMcpTool(toolName, args) {
  if (!client) {
    throw new Error("MCP client not initialized. Call initMcpClient() first.");
  }

  console.log(
    `[MCP Client] Calling tool: ${toolName} with args:`,
    JSON.stringify(args)
  );

  const result = await client.callTool({
    name: toolName,
    arguments: args,
  });

  // Extract text content from the result
  const textContent = result.content
    ?.filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  console.log(`[MCP Client] Tool ${toolName} result length: ${textContent?.length || 0} chars`);

  return textContent || "No result returned.";
}

/**
 * Gracefully close the MCP client connection.
 */
export async function closeMcpClient() {
  if (client) {
    try {
      await client.close();
      console.log("[MCP Client] Connection closed.");
    } catch (err) {
      console.warn("[MCP Client] Error closing:", err.message);
    }
  }
}
