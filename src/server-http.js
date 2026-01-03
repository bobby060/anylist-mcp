import { randomUUID } from 'node:crypto';
import express from 'express';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from "zod";
import dotenv from "dotenv";
import AnyListClient from "./anylist-client.js";
import AnylistMCPServer from './server.js';

// Load environment variables
dotenv.config();

// Simple in-memory event store for resumability
// Based on the SDK example implementation
class InMemoryEventStore {
    constructor() {
        this.events = new Map();
    }

    generateEventId(streamId) {
        return `${streamId}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    }

    getStreamIdFromEventId(eventId) {
        const parts = eventId.split('_');
        return parts.length > 0 ? parts[0] : '';
    }

    async storeEvent(streamId, message) {
        const eventId = this.generateEventId(streamId);
        this.events.set(eventId, { streamId, message });
        return eventId;
    }

    async replayEventsAfter(lastEventId, { send }) {
        if (!lastEventId || !this.events.has(lastEventId)) {
            return '';
        }

        const streamId = this.getStreamIdFromEventId(lastEventId);
        if (!streamId) {
            return '';
        }

        let foundLastEvent = false;
        const sortedEvents = [...this.events.entries()].sort((a, b) => a[0].localeCompare(b[0]));

        for (const [eventId, { streamId: eventStreamId, message }] of sortedEvents) {
            if (eventStreamId !== streamId) {
                continue;
            }

            if (eventId === lastEventId) {
                foundLastEvent = true;
                continue;
            }

            if (foundLastEvent) {
                await send(eventId, message);
            }
        }

        return streamId;
    }
}

// Create the AnyList MCP server
const getServer = () => {
    const server = new AnylistMCPServer({
        name: 'anylist-mcp-server',
        version: '1.0.0',
        websiteUrl: 'https://github.com/bobby060/anylist-mcp'
    }, {
        capabilities: { logging: {} }
    });

    return server;
};

const MCP_PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT, 10) : 3000;

const app = express();
app.use(express.json());

// Map to store transports by session ID
const transports = {};

// MCP POST endpoint
const mcpPostHandler = async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId) {
        console.log(`Received MCP request for session: ${sessionId}`);
    } else {
        console.log('Request body:', req.body);
    }

    try {
        let transport;
        if (sessionId && transports[sessionId]) {
            // Reuse existing transport
            transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
            // New initialization request
            const eventStore = new InMemoryEventStore();
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                eventStore, // Enable resumability
                onsessioninitialized: sessionId => {
                    // Store the transport by session ID when session is initialized
                    console.log(`Session initialized with ID: ${sessionId}`);
                    transports[sessionId] = transport;
                }
            });

            // Set up onclose handler to clean up transport when closed
            transport.onclose = () => {
                const sid = transport.sessionId;
                if (sid && transports[sid]) {
                    console.log(`Transport closed for session ${sid}, removing from transports map`);
                    delete transports[sid];
                }
            };

            // Connect the transport to the MCP server BEFORE handling the request
            const server = getServer();
            await server.connect(transport);

            await transport.handleRequest(req, res, req.body);
            return;
        } else {
            // Invalid request - no session ID or not initialization request
            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: No valid session ID provided'
                },
                id: null
            });
            return;
        }

        // Handle the request with existing transport
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
};

app.post('/mcp', mcpPostHandler);

// Handle GET requests for SSE streams
const mcpGetHandler = async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }

    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {
        console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
        console.log(`Establishing new SSE stream for session ${sessionId}`);
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
};

app.get('/mcp', mcpGetHandler);

// Handle DELETE requests for session termination
const mcpDeleteHandler = async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }

    console.log(`Received session termination request for session ${sessionId}`);

    try {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
    } catch (error) {
        console.error('Error handling session termination:', error);
        if (!res.headersSent) {
            res.status(500).send('Error processing session termination');
        }
    }
};

app.delete('/mcp', mcpDeleteHandler);

app.listen(MCP_PORT, error => {
    if (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
    console.log(`AnyList MCP Streamable HTTP Server listening on port ${MCP_PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');

    // Close all active transports to properly clean up resources
    for (const sessionId in transports) {
        try {
            console.log(`Closing transport for session ${sessionId}`);
            await transports[sessionId].close();
            delete transports[sessionId];
        } catch (error) {
            console.error(`Error closing transport for session ${sessionId}:`, error);
        }
    }
    console.log('Server shutdown complete');
    process.exit(0);
});
