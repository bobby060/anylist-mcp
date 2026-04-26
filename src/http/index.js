import dotenv from "dotenv";
dotenv.config();

import express from "express";
import session from "express-session";
import { fileURLToPath } from "url";
import path from "path";
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { getDb, loadAllowedEmails, deleteExpiredTokens } from "./db.js";
import { getOrCreateSession } from "./session-manager.js";
import oauthRouter, { requireBearerToken } from "./auth/oauth.js";
import onboardingRouter from "./onboarding.js";
import { registerAllTools } from "../tools/index.js";
import { isGoogleEnabled } from "./auth/providers/google.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ── Startup validation ────────────────────────────────────────────────────────

function validateEnv() {
  const required = ["SERVER_SECRET_KEY", "SESSION_SECRET"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
  if (process.env.SERVER_SECRET_KEY.length !== 64) {
    console.error("SERVER_SECRET_KEY must be a 64-character hex string (32 bytes).");
    process.exit(1);
  }
  if (!process.env.BASE_URL) {
    console.warn("BASE_URL not set — will derive from incoming request Host header (fine for dev/tunnel use)");
  }
  loadAllowedEmails(); // Will throw + exit if file missing
}

// ── Express app setup ─────────────────────────────────────────────────────────

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Trust the first proxy (Cloudflare Tunnel) so req.secure reflects the
// original HTTPS connection. This also makes session cookies work correctly
// when accessed through the tunnel.
app.set("trust proxy", 1);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // secure=true only when the request actually arrived over HTTPS (via proxy).
    // When testing locally over plain HTTP this will be false, allowing cookies to work.
    secure: "auto",
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// ── Request logging ───────────────────────────────────────────────────────────

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms) session:${req.session?.id?.slice(0, 8) ?? "none"} user:${req.session?.userId ?? "-"}`);
  });
  next();
});

// View engine (simple HTML template rendering via res.render)
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "html");
app.engine("html", (filePath, options, callback) => {
  try {
    let content = readFileSync(filePath, "utf8");
    for (const [k, v] of Object.entries(options)) {
      // Section toggle: <!-- if:key -->...<!-- endif:key -->
      // Truthy = boolean true, non-empty string, non-zero number
      const startTag = `<!-- if:${k} -->`;
      const endTag = `<!-- endif:${k} -->`;
      if (content.includes(startTag)) {
        const truthy = v !== null && v !== undefined && v !== false && v !== "" && v !== 0;
        if (!truthy) {
          const re = new RegExp(startTag + "[\\s\\S]*?" + endTag, "g");
          content = content.replace(re, "");
        } else {
          content = content.replaceAll(startTag, "").replaceAll(endTag, "");
        }
      }
      // Value replacement: {{key}}
      if (typeof v === "string" || typeof v === "number") {
        content = content.replaceAll(`{{${k}}}`, String(v));
      } else if (v === null || v === undefined) {
        content = content.replaceAll(`{{${k}}}`, "");
      }
    }
    callback(null, content);
  } catch (err) {
    callback(err);
  }
});

// ── Login page ────────────────────────────────────────────────────────────────

app.get("/login", (_req, res) => {
  res.render("login", {
    error: "",
    googleEnabled: isGoogleEnabled(),
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ── OAuth + onboarding routes ─────────────────────────────────────────────────

app.use(oauthRouter);
app.use("/mcp", oauthRouter);
app.use(onboardingRouter);

// ── MCP Streamable HTTP endpoint ──────────────────────────────────────────────
//
// Per the MCP spec, we use stateful sessions: one McpServer + transport per
// session, keyed by the Mcp-Session-Id header. This is required for elicitation
// to work (the server needs to maintain request context across the session).

const mcpSessions = new Map(); // sessionId → { server, transport }

// MCP endpoint — available at both / and /mcp.
// All specific routes above (/health, /login, /oauth/*, etc.) take precedence.
async function handleMcp(req, res) {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let mcpSession = sessionId ? mcpSessions.get(sessionId) : null;

    if (!mcpSession) {
      // Check if this is an initialize request; if not and no session exists, reject
      if (sessionId || !isInitializeRequest(req.body)) {
        return res.status(404).json({ error: "Session not found. Send an initialize request first." });
      }

      // Create a new MCP session for this user
      const userId = req.userId;
      const mcpServer = new McpServer({ name: "anylist-mcp-server", version: "2.0.0" });
      registerAllTools(mcpServer, () => getOrCreateSession(userId));

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomBytes(16).toString("hex"),
        onsessioninitialized: (sid) => {
          mcpSessions.set(sid, { server: mcpServer, transport });
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) mcpSessions.delete(sid);
      };

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    await mcpSession.transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

app.all("/", requireBearerToken, handleMcp);
app.all("/mcp", requireBearerToken, handleMcp);

// ── Cleanup job ───────────────────────────────────────────────────────────────

setInterval(deleteExpiredTokens, 60 * 60 * 1000); // hourly

// ── Start server ──────────────────────────────────────────────────────────────

validateEnv();
getDb(); // Initialize DB (runs migrations)

app.listen(PORT, () => {
  console.log(`anylist-mcp HTTP server listening on port ${PORT}`);
  console.log(`Base URL: ${process.env.BASE_URL || "(derived from request host)"}`);
  console.log(`Google OAuth: ${isGoogleEnabled() ? "enabled" : "disabled (set GOOGLE_CLIENT_ID to enable)"}`);
});
