import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { getUserByEmail, createUser, isEmailAllowed } from "../../db.js";

const SALT_ROUNDS = 12;

/**
 * Register a new user with email + password.
 * Throws if the email is not on the whitelist or already registered.
 * @returns {object} user row
 */
export async function registerWithPassword(email, password) {
  if (!isEmailAllowed(email)) {
    throw new Error("This email address is not authorized to register.");
  }
  const existing = getUserByEmail(email);
  if (existing) {
    throw new Error("An account with this email already exists.");
  }
  const pwHash = await bcrypt.hash(password, SALT_ROUNDS);
  return createUser({ id: randomUUID(), email, pwHash });
}

/**
 * Authenticate with email + password.
 * Returns user row on success, throws on failure.
 */
export async function loginWithPassword(email, password) {
  const user = getUserByEmail(email);
  if (!user || !user.pw_hash) {
    // Constant-time dummy compare to prevent timing attacks
    await bcrypt.compare(password, "$2b$12$invalid.hash.that.never.matches.xxxxxxxxxx");
    throw new Error("Invalid email or password.");
  }
  const match = await bcrypt.compare(password, user.pw_hash);
  if (!match) throw new Error("Invalid email or password.");
  return user;
}
