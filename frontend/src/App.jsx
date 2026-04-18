import { useState, useCallback } from "react";
import ChatWindow from "./components/ChatWindow.jsx";
import ChatInput from "./components/ChatInput.jsx";

const EXAMPLE_QUERIES = [
  "Find listings in Istanbul for June 1-5 for 2 people",
  "Search for places in Paris for 2 guests, July 10-15",
  "Show me listings in London for 4 people, August 1-7",
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim() || isLoading) return;

      // Add user message
      const userMsg = { role: "user", content: text };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            conversationId,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error (${res.status})`);
        }

        const data = await res.json();

        // Update conversation ID
        if (data.conversationId) {
          setConversationId(data.conversationId);
        }

        // Add assistant message
        const assistantMsg = {
          role: "assistant",
          content: data.response,
          toolCalls: data.toolCalls || [],
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err) {
        console.error("Chat error:", err);
        const errorMsg = {
          role: "assistant",
          content: `Sorry, something went wrong: ${err.message}. Please make sure the backend server is running and try again.`,
          toolCalls: [],
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, isLoading]
  );

  const startNewChat = useCallback(() => {
    // Optionally clear on server
    if (conversationId) {
      fetch(`/api/chat/${conversationId}`, { method: "DELETE" }).catch(() => {});
    }
    setMessages([]);
    setConversationId(null);
  }, [conversationId]);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">🏠</div>
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
          <span className="icon">✨</span>
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
            <h3>💡 How it works</h3>
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
          <div className="model-badge">GPT-4o-mini + MCP</div>
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
