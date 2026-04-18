/**
 * Seed script — registers a host user, logs in, and creates test listings
 * via the Airbnb API gateway.
 */

const GATEWAY = "http://localhost:9090";

async function post(url, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function main() {
  console.log("=== Seeding Airbnb test data ===\n");

  // 1. Register host
  console.log("1. Registering host user...");
  const regRes = await post(`${GATEWAY}/api/v1/auth/register`, {
    email: "host@test.com",
    password: "123456",
    name: "Test Host",
    role: "HOST",
  });
  console.log(`   Register: ${regRes.status}`, typeof regRes.data === 'string' ? regRes.data.substring(0,100) : JSON.stringify(regRes.data).substring(0,100));

  // 2. Login as host
  console.log("2. Logging in as host...");
  const loginRes = await post(`${GATEWAY}/api/v1/auth/login`, {
    email: "host@test.com",
    password: "123456",
  });
  const token = loginRes.data?.token || loginRes.data?.jwt || loginRes.data?.accessToken || loginRes.data;
  console.log(`   Login: ${loginRes.status}, token: ${typeof token === 'string' ? token.substring(0,30) + '...' : 'N/A'}`);

  if (!token || typeof token !== 'string') {
    console.error("   Failed to get token. Aborting.");
    process.exit(1);
  }

  // 3. Create listings
  const listings = [
    {
      title: "Cozy Studio in Sultanahmet",
      description: "Beautiful studio apartment in the heart of Istanbul's historic district. Walking distance to Hagia Sophia and Blue Mosque.",
      country: "Turkey",
      city: "Istanbul",
      price: 85,
      numberOfPeople: 2,
    },
    {
      title: "Modern Loft with Bosphorus View",
      description: "Stunning modern loft with panoramic Bosphorus views. Perfect for couples looking for a romantic getaway in Istanbul.",
      country: "Turkey",
      city: "Istanbul",
      price: 150,
      numberOfPeople: 3,
    },
    {
      title: "Charming Flat near Grand Bazaar",
      description: "Centrally located flat near the Grand Bazaar. Great for shopping enthusiasts and history lovers.",
      country: "Turkey",
      city: "Istanbul",
      price: 65,
      numberOfPeople: 4,
    },
    {
      title: "Elegant Apartment in Le Marais",
      description: "Chic Parisian apartment in the trendy Le Marais district. Close to museums, cafes, and nightlife.",
      country: "France",
      city: "Paris",
      price: 120,
      numberOfPeople: 2,
    },
    {
      title: "Penthouse near Eiffel Tower",
      description: "Luxury penthouse with Eiffel Tower views. Rooftop terrace, modern amenities, unforgettable stay.",
      country: "France",
      city: "Paris",
      price: 250,
      numberOfPeople: 4,
    },
    {
      title: "Stylish Flat in Kensington",
      description: "Elegant London flat in the prestigious Kensington neighborhood. Close to Hyde Park and museums.",
      country: "UK",
      city: "London",
      price: 180,
      numberOfPeople: 3,
    },
  ];

  console.log(`3. Creating ${listings.length} listings...\n`);

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    const res = await post(`${GATEWAY}/api/v1/listings`, listing, token);
    console.log(`   [${i+1}] "${listing.title}" — ${res.status} ${res.status < 300 ? '✓' : '✗'}`);
    if (res.status >= 300) {
      console.log(`       Response: ${JSON.stringify(res.data).substring(0, 150)}`);
    }
  }

  // 4. Also register the guest user
  console.log("\n4. Registering guest user...");
  const guestRes = await post(`${GATEWAY}/api/v1/auth/register`, {
    email: "guest@test.com",
    password: "123456",
    name: "Test Guest",
    role: "GUEST",
  });
  console.log(`   Guest register: ${guestRes.status}`);

  console.log("\n=== Seeding complete! ===");
}

main().catch(err => {
  console.error("Seed error:", err.message);
  process.exit(1);
});
