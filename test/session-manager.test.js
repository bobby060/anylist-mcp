import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startAnyListStandIn } from "./anylist-stand-in.js";

describe("session manager", () => {
  let getOrCreateSession, evictSession;
  let standIn;

  before(async () => {
    standIn = await startAnyListStandIn();
    process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "anylist-mcp-test-"));
    process.env.SERVER_SECRET_KEY = "00".repeat(32);
    const db = await import("../src/http/db.js");
    db.createUser({ id: "user-a", email: "a@example.com" });
    db.upsertAnyListCredentials("user-a", { username: "a@example.com", password: "pw", defaultListName: "Groceries" });
    ({ getOrCreateSession, evictSession } = await import("../src/http/session-manager.js"));
  });

  after(() => standIn.close());

  it("keeps each user's AnyList files on the data volume", async () => {
    const client = await getOrCreateSession("user-a");
    const dir = path.join(process.env.DATA_DIR, "anylist", "user-a");
    assert.equal(client._storageDir, dir);
    assert.ok(existsSync(dir));
    evictSession("user-a");
  });

  it("closes the websocket when a session is evicted", async () => {
    const client = await getOrCreateSession("user-a");
    await client.login();
    assert.equal(standIn.openSockets(), 1);

    evictSession("user-a");
    const deadline = Date.now() + 3000;
    while (standIn.openSockets() > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(standIn.openSockets(), 0);
    assert.notEqual(await getOrCreateSession("user-a"), client);
    evictSession("user-a");
  });

  it("refuses a new sign-in on an evicted session", async () => {
    const client = await getOrCreateSession("user-a");
    evictSession("user-a");
    // A websocket opened now would have nothing left to close it.
    await assert.rejects(client.login(), /closed/);
    assert.equal(standIn.openSockets(), 0);
  });
});
