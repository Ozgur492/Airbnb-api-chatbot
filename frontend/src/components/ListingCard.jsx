import { useState } from "react";

// Curated placeholder images for listings (cycle through them)
const LISTING_IMAGES = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=250&fit=crop",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=250&fit=crop",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=250&fit=crop",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=250&fit=crop",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&h=250&fit=crop",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=250&fit=crop",
];

export default function ListingCard({ listing }) {
  const {
    id,
    title,
    description,
    country,
    city,
    price,
    numberOfPeople,
    rating,
  } = listing;

  const [showDetails, setShowDetails] = useState(false);

  // Pick a consistent image based on listing id
  const imageUrl = LISTING_IMAGES[(id || 0) % LISTING_IMAGES.length];

  // Generate a display rating (use API rating or a reasonable default)
  const displayRating = rating || (4.0 + ((id || 1) % 10) / 10).toFixed(1);

  return (
    <div className="listing-card" id={`listing-card-${id}`}>
      {/* Property Image */}
      <div className="listing-card-image">
        <img
          src={imageUrl}
          alt={title || `Listing in ${city}`}
          loading="lazy"
        />
        <div className="listing-card-price-badge">
          ${price}<span>/night</span>
        </div>
      </div>

      <div className="listing-card-body">
        <div className="listing-card-title-row">
          <div className="listing-card-title">
            {title || `Listing in ${city}`}
          </div>
          <div className="listing-card-rating">
            <span className="star-icon">★</span>
            {displayRating}
          </div>
        </div>

        <div className="listing-card-location">
          📍 {city}, {country}
        </div>

        <div className="listing-card-meta">
          <span>👥 {numberOfPeople} guests</span>
          <span className="listing-card-id-badge">#{id}</span>
        </div>

        {description && showDetails && (
          <div className="listing-card-desc">{description}</div>
        )}

        <button
          className="listing-details-btn"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? "Hide Details" : "Details"}
        </button>
      </div>
    </div>
  );
}
