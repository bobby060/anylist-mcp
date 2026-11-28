import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createSessionStore } from "../src/http/mcp-sessions.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectedEntry(userId) {
  const server = new McpServer({ name: "test", version: "1" });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => "sid" });
  await server.connect(transport);
  const entry = { server, transport, userId, closed: false };
  transport.onclose = () => { entry.closed = true; };
  return entry;
}

describe("createSessionStore", () => {
  it("returns a session only to the user that owns it", () => {
    const store = createSessionStore();
    const entry = { userId: "user-a", transport: {} };
    store.set("sid1", entry);

    assert.equal(store.get("sid1", "user-a"), entry);     // owner
    assert.equal(store.get("sid1", "user-b"), null);      // another user's bearer
    assert.equal(store.get("unknown", "user-a"), null);   // unknown session
  });

  it("stops returning a session once deleted", () => {
    const store = createSessionStore();
    store.set("sid1", { userId: "user-a" });
    store.delete("sid1");
    assert.equal(store.get("sid1", "user-a"), null);
  });

  it("closes a session left idle", async () => {
    const store = createSessionStore({ idleMs: 50 });
    const entry = await connectedEntry("user-a");
    store.set("sid1", entry);

    await sleep(120);

    assert.equal(store.get("sid1", "user-a"), null);
    assert.equal(entry.closed, true);
  });

  it("keeps a session that is in use", async () => {
    const store = createSessionStore({ idleMs: 80 });
    const entry = await connectedEntry("user-a");
    store.set("sid1", entry);

    for (let i = 0; i < 4; i++) {
      await sleep(40);
      assert.equal(store.get("sid1", "user-a"), entry);
    }
    assert.equal(entry.closed, false);
    store.delete("sid1");
  });
});
