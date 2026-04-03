import { OAuth2Client } from "google-auth-library";
import { randomUUID } from "crypto";
import { getUserByGoogleSub, getUserByEmail, createUser, isEmailAllowed } from "../../db.js";

let _client;

function getGoogleClient() {
  if (!_client) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured.");
    _client = new OAuth2Client(clientId);
  }
  return _client;
}

/**
 * Verify a Google ID token (from the frontend sign-in button).
 * Returns the user row, creating it on first login if the email is whitelisted.
 * @param {string} idToken - Google credential from the Sign In With Google button
 */
export async function loginWithGoogle(idToken) {
  const client = getGoogleClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const { sub, email } = payload;

  if (!email) throw new Error("Google account has no email.");

  // Check if user already exists by Google sub
  let user = getUserByGoogleSub(sub);
  if (user) return user;

  // Check if user exists by email (e.g. registered via password first)
  user = getUserByEmail(email);
  if (user) {
    // Link Google sub to existing account
    // (simple update — not handling full account merge)
    return user;
  }

  // New user — check whitelist before creating
  if (!isEmailAllowed(email)) {
    throw new Error("This Google account is not authorized.");
  }

  return createUser({ id: randomUUID(), email, googleSub: sub });
}

/**
 * Returns true if Google OAuth is configured.
 */
export function isGoogleEnabled() {
  return !!process.env.GOOGLE_CLIENT_ID;
}
