export default function ReviewCard({ review }) {
  const { id, bookingId, rating, comment } = review;

  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <span key={i} className={i <= (rating || 0) ? "filled" : "empty"}>
        ★
      </span>
    );
  }

  return (
    <div className="review-card" id={`review-card-${id || bookingId}`}>
      <div className="review-card-header">
        <h4>Review Submitted</h4>
        <div className="star-rating">{stars}</div>
      </div>
      {comment && <p className="review-comment">"{comment}"</p>}
      <div className="booking-details" style={{ marginTop: "0.75rem" }}>
        {(id || bookingId) && (
          <div className="booking-detail">
            <span className="label">{id ? "Review ID" : "Booking ID"}</span>
            <span className="value">#{id || bookingId}</span>
          </div>
        )}
        {rating && (
          <div className="booking-detail">
            <span className="label">Rating</span>
            <span className="value">{rating}/5</span>
          </div>
        )}
      </div>
    </div>
  );
}
