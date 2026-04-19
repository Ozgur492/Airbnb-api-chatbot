/**
 * Agent Backend — Express server with /api/chat and /api/chat/stream endpoints.
 * Bridges the React frontend with the AI agent + MCP tools.
 * Supports both synchronous JSON responses and real-time Server-Sent Events (SSE).
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { initMcpClient, closeMcpClient } from "./mcpClient.js";
import {
  processMessage,
  processMessageStream,
  clearConversation,
} from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"]
}));
app.use(express.json());

// ─── Health Check ────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Chat Endpoint (synchronous JSON) ────────────────────────────────────────

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

// ─── Chat Stream Endpoint (Server-Sent Events) ──────────────────────────────

app.post("/api/chat/stream", async (req, res) => {
  const { message, conversationId: incomingConvId } = req.body;

  if (!message || typeof message !== "string" || message.trim() === "") {
    return res.status(400).json({ error: "Message is required." });
  }

  const conversationId = incomingConvId || uuidv4();

  console.log(`\n[Server] SSE stream request — conv: ${conversationId}`);
  console.log(`[Server] User message: "${message.substring(0, 100)}..."`);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering if proxied
  res.flushHeaders();

  // Send conversationId immediately so frontend can track it
  res.write(`data: ${JSON.stringify({ type: "start", conversationId })}\n\n`);

  try {
    await processMessageStream(
      message.trim(),
      conversationId,
      (event) => {
        // Write each event as an SSE data line
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    );
  } catch (err) {
    console.error("[Server] SSE stream error:", err);
    res.write(
      `data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`
    );
  }

  res.end();
});

// ─── Clear Conversation ──────────────────────────────────────────────────────

app.delete("/api/chat/:conversationId", (req, res) => {
  clearConversation(req.params.conversationId);
  res.json({ status: "cleared" });
});

// ─── Serve Frontend (production) ─────────────────────────────────────────────

const frontendDist = path.resolve(__dirname, "../../frontend/dist");
app.use(express.static(frontendDist));

// SPA catch-all: any non-API route serves the React app
app.get("*", (req, res, next) => {
  // Don't catch API routes
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(frontendDist, "index.html"));
});

// ─── Startup ─────────────────────────────────────────────────────────────────

async function start() {
  console.log("====================================");
  console.log("  Airbnb AI Agent Backend Starting  ");
  console.log("====================================\n");

  // Start Express server FIRST so Azure health probe succeeds
  app.listen(PORT, () => {
    console.log(`[Server] Agent backend listening on http://localhost:${PORT}`);
    console.log(`[Server] Chat endpoint:   POST http://localhost:${PORT}/api/chat`);
    console.log(`[Server] Stream endpoint: POST http://localhost:${PORT}/api/chat/stream (SSE)`);
    console.log(`[Server] Health check:    GET  http://localhost:${PORT}/api/health\n`);
  });

  // Initialize MCP client (spawns the MCP server) — retry on failure
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await initMcpClient();
      console.log("[Server] MCP client initialized successfully.\n");
      break;
    } catch (err) {
      console.error(`[Server] MCP init attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (attempt === MAX_RETRIES) {
        console.error("[Server] MCP client failed after all retries. Chat will not work until MCP is available.");
      } else {
        console.log(`[Server] Retrying MCP init in 5 seconds...`);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
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
