# AnyList MCP HTTP Server

This document describes how to use the stateful streamable HTTP transport for the AnyList MCP server.

## Overview

The HTTP server ([server-http.js](src/server-http.js)) provides a stateful, resumable MCP server over HTTP using Server-Sent Events (SSE) for real-time updates. This is an alternative to the stdio transport used by the default server. Right now, the stateful part isn't used, but I hope to extend it to help with recipe management/cooking in the future.

## Features

- **Stateful Sessions**: Each client connection maintains a unique session with persistent state
- **Server-Sent Events (SSE)**: Real-time streaming of server notifications and responses
- **Resumability**: Clients can reconnect and resume from the last event using `Last-Event-ID`
- **HTTP/REST API**: Standard HTTP endpoints for MCP protocol operations

## Starting the Server

### Using npm scripts

```bash
# Start the HTTP server (default port 3000)
npm run start:http

# Start with auto-reload during development
npm run dev:http

# Use a custom port
MCP_PORT=3001 npm run start:http
```

### Direct execution

```bash
# Default port 3000
node src/server-http.js

# Custom port
MCP_PORT=3001 node src/server-http.js
```

## Environment Variables

- `MCP_PORT`: HTTP server port (default: 3000)
- `ANYLIST_EMAIL`: Your AnyList email
- `ANYLIST_PASSWORD`: Your AnyList password
- `ANYLIST_LIST_NAME`: Default shopping list name

## HTTP Endpoints

### POST /mcp

Main endpoint for MCP requests.

**Headers:**
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`
- `mcp-session-id`: (optional, for existing sessions)

**Request Format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "your-client-name",
      "version": "1.0.0"
    }
  }
}
```

**Response:**
Returns Server-Sent Events stream with:
- `mcp-session-id` header containing the session ID
- Event stream with JSON-RPC responses

### GET /mcp

Subscribe to server notifications and updates via SSE.

**Headers:**
- `mcp-session-id`: Required, session ID from initialization
- `Last-Event-ID`: (optional) Resume from specific event

**Response:**
Continuous Server-Sent Events stream with server notifications and updates.

### DELETE /mcp

Terminate an active session.

**Headers:**
- `mcp-session-id`: Required, session ID to terminate

## Example Client Usage

### 1. Initialize Connection

```bash
curl -X POST 'http://localhost:3000/mcp' \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

Save the `mcp-session-id` from the response headers.

### 2. List Available Tools

```bash
curl -X POST 'http://localhost:3000/mcp' \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

### 3. Call a Tool

```bash
curl -X POST 'http://localhost:3000/mcp' \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "list_items",
      "arguments": {
        "include_checked": false,
        "include_notes": true
      }
    }
  }'
```

### 4. Subscribe to Notifications (in separate terminal)

```bash
curl -N 'http://localhost:3000/mcp' \
  -H "mcp-session-id: YOUR_SESSION_ID"
```

This keeps a persistent connection open to receive real-time server notifications.

## Available Tools

The HTTP server exposes the same tools as the stdio server:

- `health_check`: Test connection to AnyList
- `list_lists`: View all available shopping lists
- `list_items`: Get items from a shopping list
- `add_item`: Add an item to the shopping list
- `check_item`: Mark an item as completed

See the main README for detailed tool documentation.

## Session Management

- Sessions are created automatically on the first `initialize` request
- Each session maintains its own state and AnyList connection
- Sessions are cleaned up when:
  - Client sends DELETE request
  - Transport is closed
  - Server shuts down

## Resumability

The server implements event storage for resumability:

1. All events are stored with unique IDs
2. Clients can reconnect using `Last-Event-ID` header
3. Server replays missed events since the last received event

Example reconnection:
```bash
curl -N 'http://localhost:3000/mcp' \
  -H "mcp-session-id: YOUR_SESSION_ID" \
  -H "Last-Event-ID: previous-event-id"
```

## Server Architecture

The HTTP server implementation:
- Uses Express.js for HTTP handling
- Implements `StreamableHTTPServerTransport` from MCP SDK
- Maintains session-to-transport mapping
- Stores events in-memory for resumability (InMemoryEventStore)
- Reuses the `AnylistMCPServer` class from [server.js](src/server.js)

## Differences from stdio Server

| Feature | stdio Server | HTTP Server |
|---------|-------------|-------------|
| Transport | Standard I/O | HTTP/SSE |
| Sessions | Single process | Multi-session |
| State | Single client | Per-session |
| Resumability | No | Yes |
| Real-time updates | Direct | Server-Sent Events |
| Use case | CLI tools, IDEs | Web clients, remote access |

## Troubleshooting

**Port already in use:**
```bash
# Use a different port
MCP_PORT=3001 npm run start:http
```

**Connection refused:**
- Ensure server is running
- Check firewall settings
- Verify correct port

**Session not found:**
- Initialize a new session with POST /mcp without session ID
- Check that session hasn't expired or been terminated

## Security Considerations

⚠️ **Important:** This server does not currently implement authentication. For production use:

1. Add authentication middleware (Bearer tokens, OAuth, etc.)
2. Use HTTPS/TLS encryption
3. Implement rate limiting
4. Add request validation
5. Consider CORS policies for web clients

The SDK supports OAuth authentication - see the commented sections in the code for examples.
