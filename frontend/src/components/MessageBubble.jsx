import ReactMarkdown from "react-markdown";
import ListingCard from "./ListingCard.jsx";
import BookingCard from "./BookingCard.jsx";
import ReviewCard from "./ReviewCard.jsx";

/**
 * Quick action suggestion chips shown after assistant responses.
 */
const SUGGESTION_CHIPS = [
  { label: "🔍 Query Listing", query: "Search for listings" },
  { label: "⭐ Book a Listing", query: "I want to book a listing" },
  { label: "📝 Review a Listing", query: "I want to review a booking" },
];

/**
 * Attempt to parse structured data from tool call results.
 * Returns { type, data } or null if not parseable.
 */
function parseToolResults(toolCalls) {
  if (!toolCalls || toolCalls.length === 0) return [];

  const parsed = [];

  for (const tc of toolCalls) {
    try {
      const data = JSON.parse(tc.result);

      if (tc.tool === "query_listings" && data.items) {
        parsed.push({ type: "listings", data });
      } else if (tc.tool === "book_listing" && (data.bookingId || data.id || data.status)) {
        parsed.push({ type: "booking", data });
      } else if (tc.tool === "review_listing" && (data.rating !== undefined || data.comment)) {
        parsed.push({ type: "review", data });
      }
    } catch {
      // Not JSON, skip
    }
  }

  return parsed;
}

export default function MessageBubble({ message, onSuggestionClick, isLast }) {
  const { role, content, toolCalls } = message;
  const isUser = role === "user";

  const structuredResults = isUser ? [] : parseToolResults(toolCalls);

  return (
    <div className={`message ${role}`}>
      <div className="message-avatar">
        {isUser ? "👤" : "🤖"}
      </div>
      <div className="message-content">
        <ReactMarkdown>{content}</ReactMarkdown>

        {/* Render structured cards */}
        {structuredResults.map((sr, i) => {
          if (sr.type === "listings" && sr.data.items?.length > 0) {
            return (
              <div key={i} className="listing-cards-grid">
                {sr.data.items.map((listing, j) => (
                  <ListingCard key={j} listing={listing} />
                ))}
              </div>
            );
          }
          if (sr.type === "booking") {
            return <BookingCard key={i} booking={sr.data} />;
          }
          if (sr.type === "review") {
            return <ReviewCard key={i} review={sr.data} />;
          }
          return null;
        })}

        {/* Tool call badges */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="tool-calls-section">
            {toolCalls.map((tc, i) => (
              <span key={i} className="tool-badge">
                {tc.tool}
              </span>
            ))}
          </div>
        )}

        {/* Quick action suggestion chips — show only on the last assistant message */}
        {!isUser && isLast && onSuggestionClick && (
          <div className="suggestion-chips">
            {SUGGESTION_CHIPS.map((chip, i) => (
              <button
                key={i}
                className="suggestion-chip"
                onClick={() => onSuggestionClick(chip.query)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
