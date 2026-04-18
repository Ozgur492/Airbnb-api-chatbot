/**
 * Agent Backend — Express server with /api/chat endpoint.
 * Bridges the React frontend with the AI agent + MCP tools.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { initMcpClient, closeMcpClient } from "./mcpClient.js";
import { processMessage, clearConversation } from "./agent.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ─── Health Check ────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Chat Endpoint ───────────────────────────────────────────────────────────

app.post("/api/chat", async (req, res) => {
  try {
    const { message, conversationId: incomingConvId } = req.body;

    if (!message || typeof message !== "string" || message.trim() === "") {
      return res.status(400).json({ error: "Message is required." });
    }

    // Use existing conversation or create new one
    const conversationId = incomingConvId || uuidv4();

    console.log(`\n[Server] Chat request — conv: ${conversationId}`);
    console.log(`[Server] User message: "${message.substring(0, 100)}..."`);

    const result = await processMessage(message.trim(), conversationId);

    console.log(
      `[Server] Response length: ${result.response.length}, Tool calls: ${result.toolCalls.length}`
    );

    res.json({
      response: result.response,
      conversationId: result.conversationId,
      toolCalls: result.toolCalls,
    });
  } catch (err) {
    console.error("[Server] Chat error:", err);
    res.status(500).json({
      error: "Failed to process message. Please try again.",
      details: err.message,
    });
  }
});

// ─── Clear Conversation ──────────────────────────────────────────────────────

app.delete("/api/chat/:conversationId", (req, res) => {
  clearConversation(req.params.conversationId);
  res.json({ status: "cleared" });
});

// ─── Startup ─────────────────────────────────────────────────────────────────

async function start() {
  console.log("====================================");
  console.log("  Airbnb AI Agent Backend Starting  ");
  console.log("====================================\n");

  // Initialize MCP client (spawns the MCP server)
  try {
    await initMcpClient();
    console.log("[Server] MCP client initialized successfully.\n");
  } catch (err) {
    console.error("[Server] Failed to initialize MCP client:", err.message);
    console.error(
      "[Server] Make sure the MCP server dependencies are installed."
    );
    process.exit(1);
  }

  // Start Express server
  app.listen(PORT, () => {
    console.log(`[Server] Agent backend listening on http://localhost:${PORT}`);
    console.log(`[Server] Chat endpoint: POST http://localhost:${PORT}/api/chat`);
    console.log(`[Server] Health check:  GET  http://localhost:${PORT}/api/health\n`);
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n[Server] Shutting down...");
  await closeMcpClient();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeMcpClient();
  process.exit(0);
});

start();
