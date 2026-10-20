// Hosts an OAuth authorization code may be redirected to. Without this, anyone
// could register a client pointing at their own server and phish a token.
// Defaults cover Claude (web/desktop/mobile) and local clients like Claude Code.
// Add "my.home-assistant.io" for Home Assistant.
const DEFAULT_REDIRECT_HOSTS = "claude.ai,claude.com,localhost,127.0.0.1";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Returns true if redirectUri is https on an allowed host (or http on loopback).
 */
export function isRedirectUriAllowed(redirectUri) {
  let url;
  try { url = new URL(redirectUri); } catch { return false; }
  const host = url.hostname.toLowerCase();
  const allowed = (process.env.ALLOWED_REDIRECT_HOSTS ?? DEFAULT_REDIRECT_HOSTS).split(",").map(h => h.trim());
  if (!allowed.includes(host)) return false;
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(host));
}
