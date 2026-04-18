# StayBot — AI Agent Chat Application

**SE4458 Software Architecture & Design — Assignment 2**  
Student: Özgür Can Güngör

## 📋 Project Description

StayBot is a full-stack AI Agent chat application that enables users to interact with an Airbnb-like rental platform through natural language conversations. It integrates with an existing REST API (developed in the midterm project) using the **Model Context Protocol (MCP)** to bridge AI capabilities with real API operations.

Users can search for listings, make bookings, and leave reviews — all by simply chatting with an AI assistant.

## 🏗 Architecture

```
┌──────────────┐   HTTP    ┌──────────────────┐   Stdio    ┌──────────────┐   HTTP    ┌─────────────┐
│  React Chat  │ ───────── │  Agent Backend   │ ────────── │  MCP Server  │ ───────── │ API Gateway │
│  UI (:5173)  │   /api/   │  Node.js (:3000) │            │  (child      │   :9090   │ → Spring    │
│              │   chat    │  + OpenAI LLM    │            │   process)   │           │   Boot API  │
└──────────────┘           └──────────────────┘            └──────────────┘           └─────────────┘
                                    │                                                        │
                                    │ OpenAI API                                        PostgreSQL
                                    ▼                                                    + Redis
                             ┌──────────────┐
                             │  GPT-4o-mini │
                             │  (LLM)       │
                             └──────────────┘
```

### Data Flow
1. User types a natural language message in the React Chat UI
2. Frontend sends the message to the Agent Backend (`POST /api/chat`)
3. Agent Backend forwards the message + conversation history to OpenAI GPT-4o-mini
4. LLM analyzes the intent and decides which MCP tool to call (if any)
5. Agent Backend executes the tool via the MCP Server (Stdio transport)
6. MCP Server calls the Airbnb API through the gateway at `localhost:9090`
7. Results flow back: API → MCP Server → Agent Backend → LLM (for formatting) → Frontend
8. Frontend renders the response with rich UI cards (listing cards, booking confirmations, etc.)

## 🧩 Components

### 1. MCP Server (`mcp-server/`)
- Built with `@modelcontextprotocol/sdk`
- Exposes 3 tools mapped to the Airbnb API:
  - `query_listings` — Search listings by location, dates, guests
  - `book_listing` — Create a booking with guest names
  - `review_listing` — Submit a review for a booking
- Auto-registers and authenticates with hardcoded guest credentials
- Communicates via Stdio transport (spawned as child process)

### 2. Agent Backend (`agent-backend/`)
- Express.js server with conversation management
- Integrates OpenAI GPT-4o-mini for natural language understanding
- Implements the agentic loop (message → tool call → execute → repeat)
- Converts MCP tool definitions to OpenAI function-calling format
- REST endpoint: `POST /api/chat`

### 3. React Frontend (`frontend/`)
- Vite + React chat interface
- Dark theme with glassmorphism, gradients, and micro-animations
- Rich structured cards for listings, bookings, and reviews
- Markdown rendering for AI responses
- Responsive design

## 🚀 Setup & Running

### Prerequisites
- **Node.js** v18+ and npm
- **Docker** and Docker Compose (for the Airbnb API)
- **OpenAI API key** (for GPT-4o-mini)

### Step 1: Start the Airbnb API
```bash
# Clone and run the midterm API
git clone https://github.com/Ozgur492/Airbnb-api.git
cd Airbnb-api
docker-compose up --build
# Wait for all 4 services: PostgreSQL, Redis, API (8080), Gateway (9090)
```

### Step 2: Configure Environment Variables
```bash
# In agent-backend/.env, set your OpenAI API key:
OPENAI_API_KEY=sk-your-actual-key-here
PORT=3000
MCP_SERVER_PATH=../mcp-server/src/index.js
GATEWAY_URL=http://localhost:9090
```

### Step 3: Install Dependencies
```bash
cd mcp-server && npm install && cd ..
cd agent-backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Step 4: Start the Agent Backend
```bash
cd agent-backend
npm run dev
# Starts on http://localhost:3000
# This also spawns the MCP server as a child process
```

### Step 5: Start the Frontend
```bash
cd frontend
npm run dev
# Opens on http://localhost:5173
```

### Step 6: Chat!
Open `http://localhost:5173` and try:
- "Find me listings in Istanbul for June 1-5 for 2 people"
- "Book listing #1 for June 1-5 for John Doe and Jane Doe"
- "Leave a 5-star review for booking #1: Great place!"

## 🎨 Design Decisions

1. **MCP over direct API calls**: Using the Model Context Protocol provides a standardized, extensible way to expose API tools to the LLM. Adding new endpoints only requires adding a new tool definition in the MCP server.

2. **Stdio transport**: The MCP server runs as a child process of the agent backend, avoiding network overhead and simplifying deployment. No additional ports needed.

3. **OpenAI function-calling**: GPT-4o-mini's native function-calling ensures reliable parameter extraction from natural language, with structured JSON arguments.

4. **Auto-register flow**: The MCP server automatically registers the guest user on first use, handling the case where the database is fresh from `docker-compose up`.

5. **In-memory conversation history**: Keeps things simple for a single-user assignment demo. History is keyed by `conversationId` (UUID) and allows multi-turn conversations.

6. **Rich UI cards**: Instead of showing raw JSON, the frontend parses tool call results and renders styled cards for listings, bookings, and reviews.

## ⚠️ Known Issues & Limitations

1. **Rate Limiting**: The Airbnb API has IP-based rate limiting (3 requests/day for listings). This may need to be temporarily disabled during testing/demo.

2. **Single User**: The system uses hardcoded credentials (`guest@test.com`). It doesn't support multi-user authentication.

3. **No persistence**: Conversation history is stored in memory and is lost when the agent backend restarts.

4. **API availability**: All services (PostgreSQL, Redis, API, Gateway) must be running via docker-compose before starting the agent.

## 📁 Project Structure
```
airbnb-chatbot/
├── mcp-server/                    # MCP Server
│   ├── package.json
│   ├── .env                       # Gateway URL + auth credentials
│   └── src/
│       └── index.js               # 3 MCP tools + auth management
│
├── agent-backend/                 # Agent Backend
│   ├── package.json
│   ├── .env                       # OpenAI key + port config
│   └── src/
│       ├── index.js               # Express server + /api/chat
│       ├── agent.js               # LLM orchestration + tool loop
│       └── mcpClient.js           # MCP client (Stdio transport)
│
├── frontend/                      # React Chat UI
│   ├── package.json
│   ├── vite.config.js             # Proxy to agent backend
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                # App layout + state management
│       ├── styles/
│       │   └── index.css          # Design system
│       └── components/
│           ├── ChatWindow.jsx     # Messages + welcome screen
│           ├── ChatInput.jsx      # Input + keyboard shortcuts
│           ├── MessageBubble.jsx  # Message display + card parsing
│           ├── ListingCard.jsx    # Listing result card
│           ├── BookingCard.jsx    # Booking confirmation card
│           └── ReviewCard.jsx     # Review confirmation card
│
└── README.md                      # This file
```

## 🎥 Demo Video
[Video link will be added here]

## 📚 Technologies Used
- **Frontend**: React 19, Vite 6, react-markdown
- **Agent Backend**: Node.js, Express, OpenAI SDK
- **MCP**: @modelcontextprotocol/sdk (server + client)
- **LLM**: OpenAI GPT-4o-mini
- **Existing API**: Spring Boot, PostgreSQL, Redis, Spring Cloud Gateway

## 📝 Assumptions
1. The Airbnb API is running locally via docker-compose before starting the chatbot.
2. A single guest user (`guest@test.com`) is sufficient for the demo.
3. The API gateway is accessible at `localhost:9090`.
4. OpenAI API is used for LLM (requires internet access and API key).
5. Rate limiting may need to be disabled for testing multiple queries.
