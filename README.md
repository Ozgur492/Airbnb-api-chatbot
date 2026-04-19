# StayBot — AI Agent Chat Application

**SE4458 Software Architecture & Design — Assignment 2**  
Student: Özgür Can Güngör

## 🌐 Live Deployment

| Component | URL |
|---|---|
| **Frontend + Backend** | https://staybot-backend-ozgur492.azurewebsites.net |
| **Health Check** | https://staybot-backend-ozgur492.azurewebsites.net/api/health |
| **API Gateway (VM)** | http://51.107.187.183:9090 |

> Deployed on Azure — VM (midterm API stack: Spring Boot + PostgreSQL + Redis), App Service B1 Linux (Agent Backend + MCP Server + React Frontend).

## 📋 Project Description

StayBot is a full-stack AI Agent chat application that enables users to interact with an Airbnb-like rental platform through natural language conversations. It integrates with an existing REST API (developed in the midterm project) using the **Model Context Protocol (MCP)** to bridge AI capabilities with real API operations.

Users can search for listings, make bookings, and leave reviews — all by simply chatting with an AI assistant.

## 🏗 Architecture

```
┌──────────────┐    SSE     ┌──────────────────┐   Stdio    ┌──────────────┐   HTTP    ┌─────────────┐
│  React Chat  │ ◄──────── │  Agent Backend   │ ────────── │  MCP Server  │ ───────── │ API Gateway │
│  UI (:5173)  │   /api/   │  Node.js (:3000) │            │  (child      │   :9090   │ → Spring    │
│              │   chat/   │  + OpenAI LLM    │            │   process)   │           │   Boot API  │
│              │   stream  │  + SSE Streaming │            │              │           │             │
└──────────────┘           └──────────────────┘            └──────────────┘           └─────────────┘
                                    │                                                        │
                                    │ OpenAI API (stream: true)                         PostgreSQL
                                    ▼                                                    + Redis
                             ┌──────────────┐
                             │  GPT-4o-mini │
                             │  (LLM)       │
                             └──────────────┘
```

### Data Flow (Real-Time SSE Streaming)
1. User types a natural language message in the React Chat UI
2. Frontend opens an SSE connection to the Agent Backend (`POST /api/chat/stream`)
3. Agent Backend forwards the message + conversation history to OpenAI GPT-4o-mini with `stream: true`
4. LLM tokens are streamed back **in real-time** via Server-Sent Events → displayed token-by-token in the UI
5. If the LLM decides to call an MCP tool, a `tool_start` event is emitted → UI shows a spinner
6. Agent Backend executes the tool via the MCP Server (Stdio transport)
7. MCP Server calls the Airbnb API **through the gateway** at `localhost:9090`
8. Tool result is sent as a `tool_end` event → the next LLM round streams the final response
9. Frontend renders the response with rich UI cards (listing cards, booking confirmations, etc.)

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
- **Server-Sent Events (SSE)** streaming endpoint: `POST /api/chat/stream`
- Fallback synchronous endpoint: `POST /api/chat`

### 3. React Frontend (`frontend/`)
- Vite + React chat interface
- **Real-time token-by-token streaming** via SSE with blinking cursor
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

7. **Server-Sent Events (SSE) over WebSockets/Firestore**: SSE provides real-time streaming with a simpler protocol than WebSockets. Since the communication is unidirectional (server → client token stream), SSE is the optimal choice. OpenAI's streaming API (`stream: true`) feeds directly into `res.write()` for zero-buffering token delivery. This avoids the complexity of WebSocket connection management or Firestore setup while still providing real-time UX.

## ⚠️ Known Issues & Limitations

1. **Single User**: The system uses hardcoded credentials (`guest@test.com`). It doesn't support multi-user authentication.

2. **No persistence**: Conversation history is stored in memory and is lost when the agent backend restarts.

3. **API availability**: All services (PostgreSQL, Redis, API, Gateway) must be running via docker-compose before starting the agent.

4. **Rate Limiting**: The API gateway has rate limiting configured. For testing/demo, the limits are set to a high value (99999 requests). In production, these should be tuned appropriately.

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
│       ├── index.js               # Express server + /api/chat + /api/chat/stream (SSE)
│       ├── agent.js               # LLM orchestration + sync & streaming tool loop
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

## Demo Video

[Watch Demo Video on Google Drive](https://drive.google.com/file/d/1HdS6_s7e9td5pWgU5HsxXM04aUD4f7eG/view?usp=sharing)

## ☁️ Azure Deployment Architecture

```
┌─────────────────────────────────────────────┐
│        Azure App Service (B1 Linux)         │
│    staybot-backend-ozgur492.azurewebsites   │
│                                             │
│  ┌──────────────┐  ┌───────────────────┐    │
│  │ React SPA    │  │ Agent Backend     │    │
│  │ (dist/)      │  │ Express + OpenAI  │    │
│  │ served via   │  │ + MCP Client      │    │
│  │ express      │  │                   │    │
│  │ .static()    │  │ Spawns MCP Server │    │
│  └──────────────┘  └───────────────────┘    │
└──────────────────────┬──────────────────────┘
                       │ HTTP :9090
              ┌────────▼────────┐
              │  Azure VM (B2s) │
              │  51.107.187.183 │
              │  docker-compose │
              │  ┌────────────┐ │
              │  │  Gateway   │ │
              │  │  API       │ │
              │  │  PostgreSQL│ │
              │  │  Redis     │ │
              │  └────────────┘ │
              └─────────────────┘
```

## 📚 Technologies Used
- **Frontend**: React 19, Vite 6, react-markdown
- **Agent Backend**: Node.js, Express, OpenAI SDK
- **Real-Time Messaging**: Server-Sent Events (SSE) for token streaming
- **MCP**: @modelcontextprotocol/sdk (server + client)
- **LLM**: OpenAI GPT-4o-mini
- **Existing API**: Spring Boot, PostgreSQL, Redis, Spring Cloud Gateway

## 📝 Assumptions
1. The Airbnb API is running via docker-compose (locally or on Azure VM) before starting the chatbot.
2. A single guest user (`guest@test.com`) is sufficient for the demo.
3. The API gateway is accessible at `GATEWAY_URL` environment variable (default: `localhost:9090`).
4. OpenAI API is used for LLM (requires internet access and API key).
5. All API calls go through the gateway (port 9090). The backend never bypasses the gateway.
6. For Azure deployment, the `OPENAI_API_KEY` is stored as an App Service secret, never in the repository.
