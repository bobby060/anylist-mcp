import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "crypto";
import {
  getOAuthClient,
  registerOAuthClient,
  saveOAuthCode,
  consumeOAuthCode,
  saveOAuthTokens,
  getTokenRecord,
  getTokenByRefresh,
  deleteTokensByRefresh,
  getAnyListCredentials,
} from "../db.js";
import { loginWithPassword, registerWithPassword } from "./providers/password.js";
import { loginWithGoogle, isGoogleEnabled } from "./providers/google.js";

function renderLogin(res, error = "") {
  res.render("login", {
    error,
    googleEnabled: isGoogleEnabled(),
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  });
}

const router = Router();

// BASE_URL is optional: if not set, derive from the incoming request so the
// server works behind any proxy (including a Cloudflare quick tunnel) without
// needing to know its public URL at startup.
function baseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (req) return `${req.protocol}://${req.get("host")}`;
  return "http://localhost:3000";
}

// ── OAuth AS Metadata (RFC 8414) ──────────────────────────────────────────────

router.get("/.well-known/oauth-authorization-server", (req, res) => {
  const base = baseUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// MCP protected resource metadata
router.get("/.well-known/oauth-protected-resource", (req, res) => {
  const base = baseUrl(req);
  res.json({
    resource: base,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  });
});

// ── Dynamic Client Registration (RFC 7591) ────────────────────────────────────

router.post("/oauth/register", (req, res) => {
  const { redirect_uris, client_name } = req.body || {};
  const clientId = randomUUID();
  const redirectUri = Array.isArray(redirect_uris) ? redirect_uris[0] : redirect_uris || null;
  registerOAuthClient({ clientId, redirectUri });
  res.status(201).json({
    client_id: clientId,
    client_secret: null,
    redirect_uris: redirectUri ? [redirectUri] : [],
    client_name: client_name || "MCP Client",
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
});

// ── Authorization Endpoint ────────────────────────────────────────────────────

router.get("/oauth/authorize", (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = req.query;

  if (!client_id || !code_challenge) {
    return res.status(400).send("Missing required parameters: client_id, code_challenge");
  }

  // Store OAuth params in session, redirect to login
  req.session.oauthParams = { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope };
  res.redirect("/login");
});

// ── Token Endpoint ────────────────────────────────────────────────────────────

router.post("/oauth/token", async (req, res) => {
  const { grant_type } = req.body || {};

  if (grant_type === "authorization_code") {
    return handleAuthCodeGrant(req, res);
  }
  if (grant_type === "refresh_token") {
    return handleRefreshGrant(req, res);
  }
  return res.status(400).json({ error: "unsupported_grant_type" });
});

async function handleAuthCodeGrant(req, res) {
  const { code, redirect_uri, code_verifier, client_id } = req.body;

  if (!code || !code_verifier) {
    return res.status(400).json({ error: "invalid_request", error_description: "Missing code or code_verifier" });
  }

  const codeRow = consumeOAuthCode(code);
  if (!codeRow) {
    return res.status(400).json({ error: "invalid_grant", error_description: "Code invalid or expired" });
  }

  // Verify PKCE
  const expected = codeRow.code_challenge;
  const method = codeRow.challenge_method;
  let verifierHash;
  if (method === "S256") {
    verifierHash = createHash("sha256").update(code_verifier).digest("base64url");
  } else {
    verifierHash = code_verifier; // plain (discouraged)
  }
  if (verifierHash !== expected) {
    return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
  }

  const accessToken = randomBytes(32).toString("hex");
  const refreshToken = randomBytes(32).toString("hex");
  saveOAuthTokens({
    accessToken,
    refreshToken,
    userId: codeRow.user_id,
    clientId: codeRow.client_id,
    scope: codeRow.scope,
  });

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: codeRow.scope || "mcp",
  });
}

async function handleRefreshGrant(req, res) {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const tokenRow = getTokenByRefresh(refresh_token);
  if (!tokenRow || tokenRow.refresh_expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: "invalid_grant", error_description: "Refresh token invalid or expired" });
  }

  deleteTokensByRefresh(refresh_token);

  const accessToken = randomBytes(32).toString("hex");
  const newRefreshToken = randomBytes(32).toString("hex");
  saveOAuthTokens({
    accessToken,
    refreshToken: newRefreshToken,
    userId: tokenRow.user_id,
    clientId: tokenRow.client_id,
    scope: tokenRow.scope,
  });

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: newRefreshToken,
    scope: tokenRow.scope || "mcp",
  });
}

// ── Login / Registration form handlers ───────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  console.log(`[auth] login attempt: ${email}`);
  if (!email || !password) {
    return renderLogin(res, "Email and password are required.");
  }
  try {
    const user = await loginWithPassword(email, password);
    console.log(`[auth] login success: ${email} (${user.id})`);
    return completeAuth(req, res, user);
  } catch (err) {
    console.log(`[auth] login failed: ${email} — ${err.message}`);
    return renderLogin(res, err.message);
  }
});

router.post("/auth/register", async (req, res) => {
  const { email, password } = req.body || {};
  console.log(`[auth] register attempt: ${email}`);
  if (!email || !password) {
    return renderLogin(res, "Email and password are required.");
  }
  try {
    const user = await registerWithPassword(email, password);
    console.log(`[auth] register success: ${email} (${user.id})`);
    return completeAuth(req, res, user);
  } catch (err) {
    console.log(`[auth] register failed: ${email} — ${err.message}`);
    return renderLogin(res, err.message);
  }
});

router.post("/auth/google", async (req, res) => {
  const { credential } = req.body || {};
  try {
    const user = await loginWithGoogle(credential);
    return completeAuth(req, res, user);
  } catch (err) {
    console.log(`[auth] google failed — ${err.message}`);
    return renderLogin(res, err.message);
  }
});

/**
 * After successful authentication, check if the user has AnyList credentials.
 * If yes: issue OAuth code and redirect back to the client.
 * If no: redirect to /setup to collect them first.
 */
function completeAuth(req, res, user) {
  req.session.userId = user.id;
  const oauth = req.session.oauthParams;
  const hasCreds = !!getAnyListCredentials(user.id);
  console.log(`[auth] completeAuth user:${user.id} oauthPending:${!!oauth} hasCreds:${hasCreds}`);

  if (!oauth) {
    return res.redirect("/setup");
  }

  if (!hasCreds) {
    return res.redirect("/setup");
  }

  return issueCodeAndRedirect(req, res, user.id, oauth);
}

/**
 * OAuth consent page — shown after AnyList setup if an OAuth flow is pending.
 */
router.get("/oauth/consent", (req, res) => {
  if (!req.session.userId || !req.session.oauthParams) {
    return res.redirect("/login");
  }
  // Render consent view
  res.render("consent", {
    clientId: req.session.oauthParams.client_id,
    scope: req.session.oauthParams.scope || "mcp",
  });
});

router.post("/oauth/consent", (req, res) => {
  const { approve } = req.body || {};
  const oauth = req.session.oauthParams;
  const userId = req.session.userId;

  if (!userId || !oauth) return res.redirect("/login");

  if (approve !== "yes") {
    const redirectUri = oauth.redirect_uri;
    const state = oauth.state;
    const url = new URL(redirectUri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    return res.redirect(url.toString());
  }

  return issueCodeAndRedirect(req, res, userId, oauth);
});

function issueCodeAndRedirect(req, res, userId, oauth) {
  const code = randomBytes(16).toString("hex");
  saveOAuthCode({
    code,
    clientId: oauth.client_id,
    userId,
    redirectUri: oauth.redirect_uri,
    codeChallenge: oauth.code_challenge,
    challengeMethod: oauth.code_challenge_method || "S256",
    scope: oauth.scope,
  });
  delete req.session.oauthParams;

  const url = new URL(oauth.redirect_uri);
  url.searchParams.set("code", code);
  if (oauth.state) url.searchParams.set("state", oauth.state);
  res.redirect(url.toString());
}

// ── Bearer token validation middleware ────────────────────────────────────────

/**
 * Express middleware that validates Bearer tokens on the /mcp endpoint.
 * Sets req.userId on success; sends 401 on failure.
 */
export function requireBearerToken(req, res, next) {
  const auth = req.headers["authorization"] || "";
  if (!auth.startsWith("Bearer ")) {
    res.setHeader("WWW-Authenticate", `Bearer realm="${baseUrl(req)}"`);
    return res.status(401).json({ error: "unauthorized" });
  }
  const token = auth.slice(7);
  const record = getTokenRecord(token);
  if (!record || record.expires_at < Math.floor(Date.now() / 1000)) {
    res.setHeader("WWW-Authenticate", `Bearer realm="${baseUrl(req)}", error="invalid_token"`);
    return res.status(401).json({ error: "invalid_token" });
  }
  req.userId = record.user_id;
  next();
}

export default router;
