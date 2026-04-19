export default function BookingCard({ booking }) {
  const {
    id,
    bookingId,
    status,
    dateFrom,
    dateTo,
    guestNames,
    listingId,
    listingTitle,
    ticketNumber,
  } = booking;

  const displayId = id || bookingId || "N/A";
  const displayStatus = (status || "confirmed").toLowerCase();
  const displayTicket = ticketNumber || displayId;

  return (
    <div className="booking-card" id={`booking-card-${displayId}`}>
      <div className="booking-card-header">
        <div className="booking-card-header-left">
          <span className="booking-icon">&#10003;</span>
          <div>
            <h4>Stay successfully booked!</h4>
            {listingTitle && (
              <p className="booking-listing-title">{listingTitle}</p>
            )}
          </div>
        </div>
        <span className={`status-badge ${displayStatus}`}>
          {displayStatus}
        </span>
      </div>

      <div className="booking-details">
        <div className="booking-detail">
          <span className="label">Check-In</span>
          <span className="value">{dateFrom || "—"}</span>
        </div>
        <div className="booking-detail">
          <span className="label">Check-Out</span>
          <span className="value">{dateTo || "—"}</span>
        </div>
        <div className="booking-detail">
          <span className="label">Ticket Number</span>
          <span className="value">#{displayTicket}</span>
        </div>
        {listingId && (
          <div className="booking-detail">
            <span className="label">Listing</span>
            <span className="value">#{listingId}</span>
          </div>
        )}
      </div>

      {guestNames && guestNames.length > 0 && (
        <div className="booking-guests">
          <span className="guest-icon"></span>
          <span>{guestNames.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}
