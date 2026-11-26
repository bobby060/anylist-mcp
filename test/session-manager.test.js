import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const AnyList = createRequire(import.meta.url)("../anylist-js/lib/index.js");

describe("session manager", () => {
  let getOrCreateSession, evictSession;

  before(async () => {
    process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "anylist-mcp-test-"));
    process.env.SERVER_SECRET_KEY = "00".repeat(32);
    const db = await import("../src/http/db.js");
    db.createUser({ id: "user-a", email: "a@example.com" });
    db.upsertAnyListCredentials("user-a", { username: "a@example.com", password: "pw", defaultListName: "Groceries" });
    ({ getOrCreateSession, evictSession } = await import("../src/http/session-manager.js"));
  });

  it("closes the AnyList client when a session is evicted", async () => {
    const client = await getOrCreateSession("user-a");
    // A real, not-logged-in anylist-js instance stands in for a connected one.
    client.client = new AnyList({ email: "a@example.com", password: "pw" });

    evictSession("user-a");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(client.client, null);
    assert.notEqual(await getOrCreateSession("user-a"), client);
    evictSession("user-a");
  });
});
