import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSessionStore } from "../src/http/mcp-sessions.js";

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
});
