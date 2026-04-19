import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble.jsx";

const WELCOME_CARDS = [
  {
    icon: "Q",
    title: "Query Listing",
    desc: "Find the perfect stay by city, dates, and guests",
    query: "Find me a listing in Istanbul for June 1-5 for 2 people",
  },
  {
    icon: "B",
    title: "Book a Listing",
    desc: "Reserve a listing with guest names and dates",
    query: "Book listing #1 for June 1-5 for John Doe and Jane Doe",
  },
  {
    icon: "R",
    title: "Review a Listing",
    desc: "Rate and review your completed bookings",
    query: "Leave a 5-star review for booking #1: Amazing place!",
  },
];

export default function ChatWindow({ messages, isLoading, onExampleClick }) {
  const bottomRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Show welcome screen when no messages
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="chat-window">
        <div className="welcome-screen">
          <div className="welcome-avatar">
            <img
              src="https://api.dicebear.com/7.x/bottts-neutral/svg?seed=staybot&backgroundColor=transparent"
              alt="StayBot"
            />
          </div>
          <h2>AI Agent - Listing Actions</h2>
          <p className="welcome-greeting">
            Hello! How can I assist you today? I can help you search for
            accommodations, make bookings, and leave reviews — just tell me what
            you need.
          </p>
          <div className="welcome-cards">
            {WELCOME_CARDS.map((card, i) => (
              <div
                key={i}
                className="welcome-card"
                onClick={() => onExampleClick(card.query)}
                id={`welcome-card-${i}`}
              >
                <div className="card-icon">{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
                <div className="welcome-card-arrow">›</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window" id="chat-window">
      {messages.map((msg, i) => (
        <MessageBubble
          key={i}
          message={msg}
          isLast={i === messages.length - 1 && !isLoading}
          onSuggestionClick={onExampleClick}
        />
      ))}

      {/* Show typing dots only before first token arrives */}
      {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant" || !messages[messages.length - 1]?.content) && (
        <div className="typing-indicator">
          <div className="message-avatar">AI</div>
          <div className="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
