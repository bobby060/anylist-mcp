#!/usr/bin/env node
// Usage: node scripts/create-client.js <email> <client-name>
// Registers a confidential OAuth client for the given user and prints credentials once.

import Database from "better-sqlite3";
import bcrypt from "bcrypt";
import { randomBytes, randomUUID } from "crypto";
import path from "path";

const [email, clientName] = process.argv.slice(2);

if (!email || !clientName) {
  console.error("Usage: node scripts/create-client.js <email> <client-name>");
  process.exit(1);
}

const DATA_DIR = process.env.DATA_DIR || "/data";
const DB_PATH = path.join(DATA_DIR, "anylist-mcp.db");

(async () => {
  const db = new Database(DB_PATH);

  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const clientId = randomUUID();
  const clientSecret = randomBytes(32).toString("hex");
  const secretHash = await bcrypt.hash(clientSecret, 12);

  db.prepare(`
    INSERT INTO oauth_clients (client_id, client_secret_hash, user_id, client_name)
    VALUES (?, ?, ?, ?)
  `).run(clientId, secretHash, user.id, clientName);

  console.log("\nClient created successfully.\n");
  console.log(`  client_id:     ${clientId}`);
  console.log(`  client_secret: ${clientSecret}`);
  console.log("\nSave the client_secret now — it is not stored and cannot be retrieved later.\n");
})();
