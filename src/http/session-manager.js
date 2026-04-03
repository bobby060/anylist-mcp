import AnyListClient from "../anylist-client.js";
import { getAnyListCredentials } from "./db.js";

const IDLE_TIMEOUT_MS =
  (parseInt(process.env.ANYLIST_SESSION_IDLE_MINUTES, 10) || 30) * 60 * 1000;

// Map of userId → { client: AnyListClient, timer: NodeJS.Timeout }
const sessions = new Map();

/**
 * Get or create an AnyListClient for a user, keeping the connection alive.
 * On first call for a user, loads credentials from the DB and connects.
 * Resets the idle timer on each call.
 *
 * @param {string} userId
 * @returns {Promise<AnyListClient>}
 */
export async function getOrCreateSession(userId) {
  if (sessions.has(userId)) {
    const session = sessions.get(userId);
    resetIdleTimer(userId, session);
    return session.client;
  }

  const creds = getAnyListCredentials(userId);
  if (!creds) {
    throw new Error("No AnyList credentials configured for this user. Complete setup first.");
  }

  const client = new AnyListClient({
    username: creds.username,
    password: creds.password,
    defaultListName: creds.defaultListName,
  });

  const session = { client, timer: null };
  sessions.set(userId, session);
  resetIdleTimer(userId, session);

  return client;
}

/**
 * Evict a user's session immediately (e.g. after credential change).
 */
export function evictSession(userId) {
  const session = sessions.get(userId);
  if (session) {
    clearTimeout(session.timer);
    sessions.delete(userId);
  }
}

function resetIdleTimer(userId, session) {
  clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    sessions.delete(userId);
  }, IDLE_TIMEOUT_MS);
}
