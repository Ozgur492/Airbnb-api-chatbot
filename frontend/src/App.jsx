import { useState, useCallback, useRef } from "react";
import ChatWindow from "./components/ChatWindow.jsx";
import ChatInput from "./components/ChatInput.jsx";

const API_URL = import.meta.env.VITE_API_URL || "";

const EXAMPLE_QUERIES = [
  "Find listings in Istanbul for June 1-5 for 2 people",
  "Search for places in Paris for 2 guests, July 10-15",
  "Show me listings in London for 4 people, August 1-7",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(null);

  /**
   * Parse SSE lines from a text chunk.
   * Handles partial lines across chunk boundaries.
   */
  const parseSSEEvents = useCallback((text) => {
    const events = [];
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          events.push(JSON.parse(line.slice(6)));
        } catch {
          // partial JSON — skip
        }
      }
    }
    return events;
  }, []);

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || isLoading) return;

      // Add user message
      const userMsg = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      // Placeholder for the assistant's streaming message
      const streamingMsg = {
        role: "assistant",
        content: "",
        toolCalls: [],
        isStreaming: true,
      };
      setMessages((prev) => [...prev, streamingMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`${API_URL}/api/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        let accContent = "";
        let accToolCalls = [];
        let newConvId = conversationId;
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE lines from buffer
          const events = parseSSEEvents(buffer);
          // Keep only incomplete data at end of buffer
          const lastNewline = buffer.lastIndexOf("\n");
          buffer = lastNewline >= 0 ? buffer.slice(lastNewline + 1) : buffer;

          for (const event of events) {
            switch (event.type) {
              case "start":
                if (event.conversationId) {
                  newConvId = event.conversationId;
                  setConversationId(event.conversationId);
                }
                break;

              case "token":
                accContent += event.content;
                // Update the streaming message in-place
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: accContent,
                    };
                  }
                  return updated;
                });
                break;

              case "tool_start":
                // Show a temporary "calling tool" indicator
                accToolCalls.push({
                  tool: event.tool,
                  args: event.args,
                  result: null,  // pending
                });
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      toolCalls: [...accToolCalls],
                    };
                  }
                  return updated;
                });
                break;

              case "tool_end":
                // Update the matching tool call with the result
                accToolCalls = accToolCalls.map((tc) =>
                  tc.tool === event.tool && tc.result === null
                    ? { ...tc, result: event.result }
                    : tc
                );
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      toolCalls: [...accToolCalls],
                    };
                  }
                  return updated;
                });
                break;

              case "done":
                // Finalize the message — remove streaming flag
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: accContent,
                      toolCalls: accToolCalls,
                      isStreaming: false,
                    };
                  }
                  return updated;
                });
                break;

              case "error":
                throw new Error(event.message);
            }
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return; // user cancelled
        console.error("Chat error:", err);
        // Replace the streaming placeholder with an error message
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              role: "assistant",
              content: `Sorry, something went wrong: ${err.message}. Please make sure the backend server is running and try again.`,
              toolCalls: [],
              isStreaming: false,
            };
          }
          return updated;
        });
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [conversationId, isLoading, parseSSEEvents]
  );

  const startNewChat = useCallback(() => {
    // Abort any in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
    }
    // Optionally clear on server
    if (conversationId) {
      fetch(`${API_URL}/api/chat/${conversationId}`, { method: "DELETE" }).catch(() => {});
    }
    setMessages([]);
    setConversationId(null);
  }, [conversationId]);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">S</div>
          <div className="brand-text">
            <h1>StayBot</h1>
            <p>AI Travel Assistant</p>
          </div>
        </div>

        <button
          className="new-chat-btn"
          onClick={startNewChat}
          id="new-chat-button"
        >
          <span className="icon">+</span>
          New Conversation
        </button>

        <div className="sidebar-section-title">Try asking</div>
        <ul className="example-queries">
          {EXAMPLE_QUERIES.map((q, i) => (
            <li key={i}>
              <button
                className="example-query-btn"
                onClick={() => sendMessage(q)}
                disabled={isLoading}
                id={`example-query-${i}`}
              >
                "{q}"
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar-info">
          <div className="sidebar-info-card">
            <h3>How it works</h3>
            <p>
              I use AI to understand your travel needs and search the Airbnb
              platform for you. I can find listings, make bookings, and submit
              reviews — all through natural conversation.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Chat */}
      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="status-dot"></div>
            <span>StayBot is online</span>
          </div>
          <div className="model-badge">GPT-4o-mini + MCP · SSE</div>
        </header>

        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          onExampleClick={sendMessage}
        />

        <ChatInput onSend={sendMessage} isLoading={isLoading} />
      </main>
    </div>
  );
}
