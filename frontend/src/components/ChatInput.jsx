import { useState, useRef, useEffect } from "react";

export default function ChatInput({ onSend, isLoading }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "24px";
      ta.style.height = Math.min(ta.scrollHeight, 150) + "px";
    }
  }, [text]);

  const handleSubmit = () => {
    if (text.trim() && !isLoading) {
      onSend(text.trim());
      setText("");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isLoading
              ? "Waiting for response..."
              : "Ask me about listings, bookings, or reviews..."
          }
          disabled={isLoading}
          rows={1}
          id="chat-input"
        />
        <button
          className="send-btn"
          onClick={handleSubmit}
          disabled={!text.trim() || isLoading}
          id="send-button"
          title="Send message"
        >
          ➤
        </button>
      </div>
      <p className="input-hint">
        Press Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
