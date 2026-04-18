#!/usr/bin/env node

/**
 * Airbnb MCP Server
 * Exposes 3 tools: query_listings, book_listing, review_listing
 * Auto-registers/logs in with constant guest credentials.
 * Communicates via Stdio transport (spawned by agent backend).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Configuration ───────────────────────────────────────────────────────────

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:9090";
const AUTH_EMAIL = process.env.AUTH_EMAIL || "guest@test.com";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "123456";
const AUTH_NAME = process.env.AUTH_NAME || "Test Guest";

// ─── Auth Token Management ───────────────────────────────────────────────────

let cachedToken = null;

/**
 * Try login first. If login fails (user not found), auto-register then login.
 * Returns a JWT Bearer token string.
 */
async function getAuthToken(forceRefresh = false) {
  if (cachedToken && !forceRefresh) {
    return cachedToken;
  }

  // Attempt login first
  try {
    const token = await loginUser();
    cachedToken = token;
    return token;
  } catch (loginErr) {
    // Login failed — try to register, then login again
    logDebug(`Login failed (${loginErr.message}), attempting auto-register...`);
  }

  // Register the user
  try {
    await registerUser();
    logDebug("Auto-register succeeded.");
  } catch (regErr) {
    logDebug(`Register attempt: ${regErr.message}`);
    // May already be registered — continue to login
  }

  // Login after registration
  const token = await loginUser();
  cachedToken = token;
  return token;
}

async function loginUser() {
  const res = await fetch(`${GATEWAY_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: AUTH_EMAIL, password: AUTH_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  // The API may return the token in different shapes — handle common patterns
  const token = data.token || data.jwt || data.accessToken || data;
  if (typeof token === "string") {
    return token;
  }
  throw new Error(`Unexpected login response shape: ${JSON.stringify(data)}`);
}

async function registerUser() {
  const res = await fetch(`${GATEWAY_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: AUTH_EMAIL,
      password: AUTH_PASSWORD,
      name: AUTH_NAME,
      role: "GUEST",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Register failed (${res.status}): ${body}`);
  }

  return await res.json();
}

/**
 * Make an authenticated API call. Automatically retries once on 401/403
 * by refreshing the token.
 */
async function authenticatedFetch(url, options = {}) {
  let token = await getAuthToken();

  const makeRequest = async (authToken) => {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        ...(options.headers || {}),
      },
    });
    return res;
  };

  let res = await makeRequest(token);

  // If unauthorized, refresh token and retry once
  if (res.status === 401 || res.status === 403) {
    logDebug("Got 401/403, refreshing auth token...");
    token = await getAuthToken(true);
    res = await makeRequest(token);
  }

  return res;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function logDebug(msg) {
  // Write debug output to stderr (stdout is reserved for MCP protocol)
  process.stderr.write(`[MCP-Server] ${msg}\n`);
}

function toolResult(data) {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toolError(message) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

// ─── MCP Server Setup ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "airbnb-mcp-server",
  version: "1.0.0",
});

// ─── Tool 1: query_listings ──────────────────────────────────────────────────

server.tool(
  "query_listings",
  "Search for Airbnb-style short-term rental listings. Filters by country, city, dates, and number of guests. Returns paginated results with listing details (id, title, description, price, capacity, location).",
  {
    country: z.string().describe("Country name, e.g. 'Turkey'"),
    city: z.string().describe("City name, e.g. 'Istanbul'"),
    startDate: z
      .string()
      .describe("Check-in date in YYYY-MM-DD format, e.g. '2025-06-01'"),
    endDate: z
      .string()
      .describe("Check-out date in YYYY-MM-DD format, e.g. '2025-06-05'"),
    numberOfPeople: z
      .number()
      .int()
      .positive()
      .describe("Number of guests, e.g. 2"),
    page: z
      .number()
      .int()
      .positive()
      .optional()
      .default(1)
      .describe("Page number for pagination, defaults to 1"),
  },
  async ({ country, city, startDate, endDate, numberOfPeople, page }) => {
    try {
      const params = new URLSearchParams({
        country,
        city,
        startDate,
        endDate,
        numberOfPeople: String(numberOfPeople),
        page: String(page || 1),
      });

      const url = `${GATEWAY_URL}/api/v1/listings?${params.toString()}`;
      logDebug(`query_listings → GET ${url}`);

      const res = await fetch(url);

      if (!res.ok) {
        const body = await res.text();
        return toolError(
          `Failed to query listings (HTTP ${res.status}): ${body}`
        );
      }

      const data = await res.json();
      logDebug(
        `query_listings → Found ${data.totalCount || 0} results, page ${data.currentPage || 1}/${data.totalPages || 1}`
      );
      return toolResult(data);
    } catch (err) {
      return toolError(`query_listings failed: ${err.message}`);
    }
  }
);

// ─── Tool 2: book_listing ────────────────────────────────────────────────────

server.tool(
  "book_listing",
  "Book an Airbnb-style listing. Requires the listing ID, check-in/check-out dates, and a list of guest names. The booking is made under the authenticated guest user. Returns booking confirmation with status.",
  {
    listingId: z.number().int().positive().describe("ID of the listing to book"),
    dateFrom: z
      .string()
      .describe("Check-in date in YYYY-MM-DD format, e.g. '2025-06-01'"),
    dateTo: z
      .string()
      .describe("Check-out date in YYYY-MM-DD format, e.g. '2025-06-05'"),
    guestNames: z
      .array(z.string())
      .min(1)
      .describe(
        'Array of guest full names, e.g. ["John Doe", "Jane Doe"]'
      ),
  },
  async ({ listingId, dateFrom, dateTo, guestNames }) => {
    try {
      const url = `${GATEWAY_URL}/api/v1/bookings`;
      const body = { listingId, dateFrom, dateTo, guestNames };

      logDebug(`book_listing → POST ${url} with ${JSON.stringify(body)}`);

      const res = await authenticatedFetch(url, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        return toolError(
          `Failed to book listing (HTTP ${res.status}): ${errBody}`
        );
      }

      const data = await res.json();
      logDebug(`book_listing → Booking confirmed: ${JSON.stringify(data)}`);

      // Enrich response with input parameters so the frontend can render full details
      const enrichedResponse = {
        bookingId: data.data || data.id || data.bookingId,
        status: data.status || "Successful",
        message: data.message || "Booking created",
        dateFrom,
        dateTo,
        guestNames,
        listingId,
      };

      return toolResult(enrichedResponse);
    } catch (err) {
      return toolError(`book_listing failed: ${err.message}`);
    }
  }
);

// ─── Tool 3: review_listing ─────────────────────────────────────────────────

server.tool(
  "review_listing",
  "Leave a review for a completed booking. Requires the booking ID, a rating from 1 to 5, and a comment. Only one review per booking is allowed.",
  {
    bookingId: z
      .number()
      .int()
      .positive()
      .describe("ID of the booking to review"),
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .describe("Rating from 1 (worst) to 5 (best)"),
    comment: z
      .string()
      .describe("Review comment text, e.g. 'Great place, loved the view!'"),
  },
  async ({ bookingId, rating, comment }) => {
    try {
      const url = `${GATEWAY_URL}/api/v1/reviews`;
      // API expects 'stayId' (not 'bookingId')
      const body = { stayId: bookingId, rating, comment };

      logDebug(`review_listing → POST ${url} with ${JSON.stringify(body)}`);

      const res = await authenticatedFetch(url, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        return toolError(
          `Failed to submit review (HTTP ${res.status}): ${errBody}`
        );
      }

      const data = await res.json();
      logDebug(`review_listing → Review submitted: ${JSON.stringify(data)}`);

      // Enrich response with input parameters for frontend rendering
      const enrichedResponse = {
        id: data.data || data.id,
        status: data.status || "Successful",
        message: data.message || "Review submitted",
        bookingId,
        rating,
        comment,
      };

      return toolResult(enrichedResponse);
    } catch (err) {
      return toolError(`review_listing failed: ${err.message}`);
    }
  }
);

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  logDebug("Starting Airbnb MCP Server...");
  logDebug(`Gateway URL: ${GATEWAY_URL}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logDebug("MCP Server connected and ready.");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
