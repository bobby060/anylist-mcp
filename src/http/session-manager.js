import { mkdirSync } from "node:fs";
import path from "node:path";
import AnyListClient from "../anylist-client.js";
import { DATA_DIR, getAnyListCredentials } from "./db.js";

const IDLE_TIMEOUT_MS =
  (parseInt(process.env.ANYLIST_SESSION_IDLE_MINUTES, 10) || 30) * 60 * 1000;

// Map of userId → { client: AnyListClient, timer: NodeJS.Timeout }
const sessions = new Map();
// Map of userId → a credential change in progress; no session starts until it ends.
const credentialChanges = new Map();

/**
 * Get or create an AnyListClient for a user, keeping the connection alive.
 * On first call for a user, loads credentials from the DB and connects.
 * Resets the idle timer on each call.
 *
 * @param {string} userId
 * @returns {Promise<AnyListClient>}
 */
export async function getOrCreateSession(userId) {
  while (credentialChanges.has(userId)) {
    await credentialChanges.get(userId).catch(() => {});
  }

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
    storageDir: anyListStorageDir(userId),
  });

  const session = { client, timer: null };
  sessions.set(userId, session);
  resetIdleTimer(userId, session);

  return client;
}

/**
 * The directory for a user's AnyList tokens and saved account. It is on the
 * data volume, so both survive restarts.
 */
export function anyListStorageDir(userId) {
  const dir = path.join(DATA_DIR, "anylist", userId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Run `change` (check and store new credentials) with the user's session
 * closed. Sessions asked for meanwhile wait and then start with whatever
 * credentials it stored. Concurrent changes for one user run one at a time.
 */
export async function changeCredentials(userId, change) {
  while (credentialChanges.has(userId)) {
    await credentialChanges.get(userId).catch(() => {});
  }

  const running = (async () => {
    evictSession(userId);
    try {
      return await change();
    } finally {
      evictSession(userId);
    }
  })();
  credentialChanges.set(userId, running);
  try {
    return await running;
  } finally {
    credentialChanges.delete(userId);
  }
}

/**
 * End a user's session now (credential change or idle timeout) and close its
 * AnyList client's websocket. Calls already running on it finish.
 */
export function evictSession(userId) {
  const session = sessions.get(userId);
  if (!session) return;
  clearTimeout(session.timer);
  sessions.delete(userId);
  session.client.close().catch((err) => console.error(err.message));
}

function resetIdleTimer(userId, session) {
  clearTimeout(session.timer);
  session.timer = setTimeout(() => evictSession(userId), IDLE_TIMEOUT_MS);
}
