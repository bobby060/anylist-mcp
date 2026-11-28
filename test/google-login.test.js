import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OAuth2Client } from "google-auth-library";

// Google's signing key, stood in for by a local one: the library fetches the
// public key, and here it gets this one instead.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
OAuth2Client.prototype.getFederatedSignonCertsAsync = async () => ({
  certs: { test: publicKey.export({ type: "spki", format: "pem" }) },
  format: "PEM",
});

function idToken(claims) {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const signed = `${part({ alg: "RS256", kid: "test", typ: "JWT" })}.${part({
    iss: "https://accounts.google.com", aud: "test-client", iat: now, exp: now + 600, ...claims,
  })}`;
  return `${signed}.${createSign("RSA-SHA256").update(signed).sign(privateKey, "base64url")}`;
}

describe("loginWithGoogle", () => {
  let loginWithGoogle, db;

  before(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anylist-mcp-google-"));
    writeFileSync(path.join(dir, "allowed-emails.txt"), "new@example.com\n");
    process.env.DATA_DIR = dir;
    process.env.ALLOWED_EMAILS_FILE = path.join(dir, "allowed-emails.txt");
    process.env.GOOGLE_CLIENT_ID = "test-client";
    db = await import("../src/http/db.js");
    ({ loginWithGoogle } = await import("../src/http/auth/providers/google.js"));
    db.createUser({ id: "user-a", email: "a@example.com", pwHash: "x" });
  });

  it("signs in an existing user by a verified email", async () => {
    const user = await loginWithGoogle(idToken({ sub: "g-1", email: "a@example.com", email_verified: true }));
    assert.equal(user.id, "user-a");
  });

  it("refuses an unverified email that matches an existing user", async () => {
    await assert.rejects(
      () => loginWithGoogle(idToken({ sub: "g-2", email: "a@example.com", email_verified: false })),
      /not verified/,
    );
  });

  it("refuses to create a user from an unverified allowed email", async () => {
    await assert.rejects(
      () => loginWithGoogle(idToken({ sub: "g-3", email: "new@example.com" })),
      /not verified/,
    );
    assert.equal(db.getUserByEmail("new@example.com"), undefined);
  });
});
