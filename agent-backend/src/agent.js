/**
 * Agent — LLM orchestration with OpenAI function-calling and MCP tool execution.
 * Implements the agentic loop: send → tool_call? → execute → feed back → repeat.
 * Supports both synchronous (processMessage) and streaming (processMessageStream) modes.
 */

import OpenAI from "openai";
import {
  getOpenAIToolDefinitions,
  callMcpTool,
} from "./mcpClient.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-4o-mini";
const MAX_TOOL_ROUNDS = 5; // Prevent infinite loops

const SYSTEM_PROMPT = `You are a helpful AI assistant for an Airbnb-like short-term rental platform. You help users find and book accommodations, and leave reviews.

You have access to the following tools:
1. **query_listings** — Search for available listings by country, city, dates, and number of guests.
2. **book_listing** — Book a specific listing by providing the listing ID, dates, and guest names.
3. **review_listing** — Leave a review (rating 1-5 and comment) for a completed booking.

## Guidelines:
- When the user asks to search for listings, extract the country, city, dates (YYYY-MM-DD format), and number of guests from their message. If any required info is missing, ask them politely.
- When presenting listing results, format them clearly with the listing ID, title, location, price, and capacity. Make it easy for the user to choose.
- When the user wants to book, they need to provide the listing ID, dates, and guest names. If they've just searched, reference the listing IDs from the results.
- For reviews, the user needs a booking ID, a rating (1-5), and a comment.
- Be conversational and friendly. If an API call fails, explain the error clearly.
- Always use the tools when the user wants to interact with the platform. Do NOT make up listing data.
- Format prices with currency symbols and dates in a readable format.
- When listing results are returned, present them in a clean, structured way.

## Important:
- Dates must be in YYYY-MM-DD format when calling tools.
- The numberOfPeople parameter must be a positive integer.
- Guest names should be an array of strings like ["John Doe", "Jane Doe"].
- Rating must be between 1 and 5 inclusive.`;

// In-memory conversation store (keyed by conversationId)
const conversations = new Map();

/**
 * Get or initialize conversation history.
 */
function getHistory(conversationId) {
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, [
      { role: "system", content: SYSTEM_PROMPT },
    ]);
  }
  return conversations.get(conversationId);
}

/**
 * Process a chat message through the agentic loop (synchronous).
 * Returns { response, conversationId, toolCalls }
 */
export async function processMessage(message, conversationId) {
  const history = getHistory(conversationId);
  history.push({ role: "user", content: message });

  const toolDefinitions = getOpenAIToolDefinitions();
  const toolCallLog = [];

  // Agentic loop: keep going until the LLM produces a final text response
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    console.log(`[Agent] Round ${round + 1} — Sending ${history.length} messages to LLM...`);

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: history,
      tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      tool_choice: toolDefinitions.length > 0 ? "auto" : undefined,
    });

    const assistantMessage = completion.choices[0].message;
    history.push(assistantMessage);

    // If no tool calls, we have our final response
    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      console.log("[Agent] Final response (no more tool calls).");
      return {
        response: assistantMessage.content || "I'm not sure how to help with that.",
        conversationId,
        toolCalls: toolCallLog,
      };
    }

    // Process each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const fnName = toolCall.function.name;
      let fnArgs;

      try {
        fnArgs = JSON.parse(toolCall.function.arguments);
      } catch (err) {
        fnArgs = {};
        console.warn(`[Agent] Failed to parse tool args: ${toolCall.function.arguments}`);
      }

      console.log(`[Agent] Tool call: ${fnName}(${JSON.stringify(fnArgs)})`);

      let toolResult;
      try {
        toolResult = await callMcpTool(fnName, fnArgs);
      } catch (err) {
        toolResult = `Error executing tool: ${err.message}`;
        console.error(`[Agent] Tool error:`, err.message);
      }

      // Log tool call for frontend
      toolCallLog.push({
        tool: fnName,
        args: fnArgs,
        result: toolResult,
      });

      // Add tool result to conversation history
      history.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  // If we exhausted all rounds, return what we have
  console.warn("[Agent] Max tool rounds reached, forcing response.");
  return {
    response:
      "I've been working on your request but it's taking longer than expected. Could you try again or simplify your request?",
    conversationId,
    toolCalls: toolCallLog,
  };
}

/**
 * Process a chat message through the agentic loop with SSE streaming.
 * Emits events via the `emit` callback:
 *   { type: "token",     content: "..." }           — streamed LLM text token
 *   { type: "tool_start", tool: "...", args: {...} } — tool call begins
 *   { type: "tool_end",   tool: "...", result: "..." } — tool call finished
 *   { type: "done",       toolCalls: [...] }         — full response complete
 *   { type: "error",      message: "..." }           — error occurred
 */
export async function processMessageStream(message, conversationId, emit) {
  const history = getHistory(conversationId);
  history.push({ role: "user", content: message });

  const toolDefinitions = getOpenAIToolDefinitions();
  const toolCallLog = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    console.log(`[Agent-Stream] Round ${round + 1} — Streaming from LLM...`);

    const stream = await openai.chat.completions.create({
      model: MODEL,
      messages: history,
      tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
      tool_choice: toolDefinitions.length > 0 ? "auto" : undefined,
      stream: true,
    });

    // Accumulate the streamed response
    let contentBuffer = "";
    let toolCalls = [];                // accumulated tool_calls from deltas
    let finishReason = null;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      finishReason = chunk.choices?.[0]?.finish_reason || finishReason;

      if (!delta) continue;

      // Stream text tokens to client
      if (delta.content) {
        contentBuffer += delta.content;
        emit({ type: "token", content: delta.content });
      }

      // Accumulate tool call deltas
      if (delta.tool_calls) {
        for (const tcDelta of delta.tool_calls) {
          const idx = tcDelta.index;

          // Initialize a new tool call entry if needed
          if (!toolCalls[idx]) {
            toolCalls[idx] = {
              id: tcDelta.id || "",
              function: { name: "", arguments: "" },
            };
          }

          if (tcDelta.id) toolCalls[idx].id = tcDelta.id;
          if (tcDelta.function?.name) toolCalls[idx].function.name += tcDelta.function.name;
          if (tcDelta.function?.arguments) toolCalls[idx].function.arguments += tcDelta.function.arguments;
        }
      }
    }

    // Build the complete assistant message for history
    const assistantMessage = { role: "assistant", content: contentBuffer || null };
    if (toolCalls.length > 0) {
      assistantMessage.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    history.push(assistantMessage);

    // If no tool calls → final response, we are done
    if (toolCalls.length === 0 || finishReason === "stop") {
      console.log("[Agent-Stream] Final response streamed.");
      emit({ type: "done", conversationId, toolCalls: toolCallLog });
      return;
    }

    // Execute each tool call
    for (const tc of toolCalls) {
      const fnName = tc.function.name;
      let fnArgs;
      try {
        fnArgs = JSON.parse(tc.function.arguments);
      } catch {
        fnArgs = {};
        console.warn(`[Agent-Stream] Failed to parse tool args: ${tc.function.arguments}`);
      }

      console.log(`[Agent-Stream] Tool call: ${fnName}(${JSON.stringify(fnArgs)})`);
      emit({ type: "tool_start", tool: fnName, args: fnArgs });

      let toolResult;
      try {
        toolResult = await callMcpTool(fnName, fnArgs);
      } catch (err) {
        toolResult = `Error executing tool: ${err.message}`;
        console.error(`[Agent-Stream] Tool error:`, err.message);
      }

      toolCallLog.push({ tool: fnName, args: fnArgs, result: toolResult });
      emit({ type: "tool_end", tool: fnName, result: toolResult });

      history.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }

    // Next round will stream the LLM's response after tool results
  }

  console.warn("[Agent-Stream] Max tool rounds reached.");
  emit({
    type: "done",
    conversationId,
    toolCalls: toolCallLog,
  });
}

/**
 * Clear conversation history for a given ID.
 */
export function clearConversation(conversationId) {
  conversations.delete(conversationId);
}
