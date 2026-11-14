// Hosts an OAuth authorization code may be redirected to. Without this, anyone
// could register a client pointing at their own server and phish a token.
// This is the only place the default list lives. The defaults cover Claude
// (web/desktop/mobile) and local clients like Claude Code. ALLOWED_REDIRECT_HOSTS
// adds hosts on top of these, e.g. "my.home-assistant.io" for Home Assistant.
const DEFAULT_REDIRECT_HOSTS = ["claude.ai", "claude.com", "localhost", "127.0.0.1"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Returns true if redirectUri is https on an allowed host (or http on loopback).
 */
export function isRedirectUriAllowed(redirectUri) {
  let url;
  try { url = new URL(redirectUri); } catch { return false; }
  const host = url.hostname.toLowerCase();
  const extra = (process.env.ALLOWED_REDIRECT_HOSTS || "").split(",").map(h => h.trim().toLowerCase()).filter(Boolean);
  if (!DEFAULT_REDIRECT_HOSTS.includes(host) && !extra.includes(host)) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(host));
}
