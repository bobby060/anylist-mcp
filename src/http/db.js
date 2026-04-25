import Database from "better-sqlite3";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { readFileSync, existsSync } from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "/data";
const DB_PATH = path.join(DATA_DIR, "anylist-mcp.db");

let _db;

export function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    migrate(_db);
  }
  return _db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      pw_hash    TEXT,
      google_sub TEXT UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS anylist_credentials (
      user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_user   TEXT NOT NULL,
      encrypted_pass   TEXT NOT NULL,
      default_list     TEXT,
      updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id    TEXT PRIMARY KEY,
      redirect_uri TEXT,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Additive migrations — safe to run on existing DBs
  for (const sql of [
    "ALTER TABLE oauth_clients ADD COLUMN client_secret_hash TEXT",
    "ALTER TABLE oauth_clients ADD COLUMN user_id TEXT REFERENCES users(id)",
    "ALTER TABLE oauth_clients ADD COLUMN client_name TEXT",
  ]) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Make code_challenge nullable to support confidential clients that skip PKCE.
  // SQLite can't ALTER COLUMN, so recreate the table if the old NOT NULL constraint is still in place.
  const ccNotNull = db.prepare("PRAGMA table_info(oauth_codes)").all()
    .find(c => c.name === "code_challenge")?.notnull === 1;
  if (ccNotNull) {
    db.exec(`
      CREATE TABLE oauth_codes_new (
        code              TEXT PRIMARY KEY,
        client_id         TEXT NOT NULL,
        user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        redirect_uri      TEXT NOT NULL,
        code_challenge    TEXT,
        challenge_method  TEXT,
        scope             TEXT,
        expires_at        INTEGER NOT NULL,
        created_at        INTEGER NOT NULL DEFAULT (unixepoch())
      );
      INSERT OR IGNORE INTO oauth_codes_new SELECT * FROM oauth_codes;
      DROP TABLE oauth_codes;
      ALTER TABLE oauth_codes_new RENAME TO oauth_codes;
    `);
  }

  db.exec(`

    CREATE TABLE IF NOT EXISTS oauth_codes (
      code         TEXT PRIMARY KEY,
      client_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redirect_uri TEXT NOT NULL,
      code_challenge    TEXT,
      challenge_method  TEXT,
      scope        TEXT,
      expires_at   INTEGER NOT NULL,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      access_token   TEXT PRIMARY KEY,
      refresh_token  TEXT UNIQUE NOT NULL,
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id      TEXT NOT NULL,
      scope          TEXT,
      expires_at     INTEGER NOT NULL,
      refresh_expires_at INTEGER NOT NULL,
      created_at     INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

// ── Encryption helpers ────────────────────────────────────────────────────────

function getEncKey() {
  const keyHex = process.env.SERVER_SECRET_KEY;
  if (!keyHex) throw new Error("SERVER_SECRET_KEY env var is required");
  return Buffer.from(keyHex, "hex");
}

export function encrypt(plaintext) {
  const key = getEncKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(ciphertext) {
  const key = getEncKey();
  const [ivHex, tagHex, dataHex] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ── Email whitelist ───────────────────────────────────────────────────────────

let _allowedEmails;

export function loadAllowedEmails() {
  const filePath = process.env.ALLOWED_EMAILS_FILE || path.join(DATA_DIR, "allowed-emails.txt");
  if (!existsSync(filePath)) {
    throw new Error(
      `allowed-emails.txt not found at ${filePath}. ` +
      `Create the file with one allowed email per line and mount it into the container.`
    );
  }
  _allowedEmails = new Set(
    readFileSync(filePath, "utf8")
      .split("\n")
      .map(l => l.trim().toLowerCase())
      .filter(l => l && !l.startsWith("#"))
  );
  return _allowedEmails;
}

export function isEmailAllowed(email) {
  if (!_allowedEmails) loadAllowedEmails();
  return _allowedEmails.has(email.toLowerCase());
}

// ── User queries ──────────────────────────────────────────────────────────────

export function getUserById(id) {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserByEmail(email) {
  return getDb().prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
}

export function getUserByGoogleSub(sub) {
  return getDb().prepare("SELECT * FROM users WHERE google_sub = ?").get(sub);
}

export function createUser({ id, email, pwHash = null, googleSub = null }) {
  getDb().prepare(`
    INSERT INTO users (id, email, pw_hash, google_sub) VALUES (?, ?, ?, ?)
  `).run(id, email.toLowerCase(), pwHash, googleSub);
  return getUserById(id);
}

// ── AnyList credential queries ────────────────────────────────────────────────

export function getAnyListCredentials(userId) {
  const row = getDb().prepare("SELECT * FROM anylist_credentials WHERE user_id = ?").get(userId);
  if (!row) return null;
  return {
    username: decrypt(row.encrypted_user),
    password: decrypt(row.encrypted_pass),
    defaultListName: row.default_list || null,
  };
}

export function upsertAnyListCredentials(userId, { username, password, defaultListName }) {
  getDb().prepare(`
    INSERT INTO anylist_credentials (user_id, encrypted_user, encrypted_pass, default_list, updated_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_user = excluded.encrypted_user,
      encrypted_pass = excluded.encrypted_pass,
      default_list   = excluded.default_list,
      updated_at     = unixepoch()
  `).run(userId, encrypt(username), encrypt(password), defaultListName || null);
}

// ── OAuth client queries ──────────────────────────────────────────────────────

export function getOAuthClient(clientId) {
  return getDb().prepare("SELECT * FROM oauth_clients WHERE client_id = ?").get(clientId);
}

export function registerOAuthClient({ clientId, redirectUri }) {
  getDb().prepare(`
    INSERT OR IGNORE INTO oauth_clients (client_id, redirect_uri) VALUES (?, ?)
  `).run(clientId, redirectUri || null);
  return getOAuthClient(clientId);
}

export function createConfidentialClient({ clientId, clientSecretHash, userId, clientName }) {
  getDb().prepare(`
    INSERT INTO oauth_clients (client_id, client_secret_hash, user_id, client_name)
    VALUES (?, ?, ?, ?)
  `).run(clientId, clientSecretHash, userId, clientName || null);
  return getDb().prepare("SELECT * FROM oauth_clients WHERE client_id = ?").get(clientId);
}

export function getOAuthClientWithSecret(clientId) {
  return getDb().prepare("SELECT * FROM oauth_clients WHERE client_id = ?").get(clientId);
}

// ── OAuth code queries ────────────────────────────────────────────────────────

export function saveOAuthCode({ code, clientId, userId, redirectUri, codeChallenge, challengeMethod, scope }) {
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  getDb().prepare(`
    INSERT INTO oauth_codes
      (code, client_id, user_id, redirect_uri, code_challenge, challenge_method, scope, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(code, clientId, userId, redirectUri, codeChallenge, challengeMethod || "S256", scope || null, expiresAt);
}

export function consumeOAuthCode(code) {
  const row = getDb().prepare("SELECT * FROM oauth_codes WHERE code = ?").get(code);
  if (!row) return null;
  getDb().prepare("DELETE FROM oauth_codes WHERE code = ?").run(code);
  if (row.expires_at < Math.floor(Date.now() / 1000)) return null;
  return row;
}

// ── OAuth token queries ───────────────────────────────────────────────────────

export function saveOAuthTokens({ accessToken, refreshToken, userId, clientId, scope }) {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare(`
    INSERT INTO oauth_tokens
      (access_token, refresh_token, user_id, client_id, scope, expires_at, refresh_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    accessToken,
    refreshToken,
    userId,
    clientId,
    scope || null,
    now + 3600,          // access token: 1 hour
    now + 86400 * 30     // refresh token: 30 days
  );
}

export function getTokenRecord(accessToken) {
  return getDb().prepare("SELECT * FROM oauth_tokens WHERE access_token = ?").get(accessToken);
}

export function getTokenByRefresh(refreshToken) {
  return getDb().prepare("SELECT * FROM oauth_tokens WHERE refresh_token = ?").get(refreshToken);
}

export function deleteTokensByRefresh(refreshToken) {
  getDb().prepare("DELETE FROM oauth_tokens WHERE refresh_token = ?").run(refreshToken);
}

export function deleteExpiredTokens() {
  const now = Math.floor(Date.now() / 1000);
  getDb().prepare("DELETE FROM oauth_tokens WHERE refresh_expires_at < ?").run(now);
  getDb().prepare("DELETE FROM oauth_codes WHERE expires_at < ?").run(now);
}
