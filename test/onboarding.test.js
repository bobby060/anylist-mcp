import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyCredentials } from "../src/http/onboarding.js";

// Minimal stand-in for AnyListClient: login() succeeds or throws like the real one,
// connect() resolves the list or throws "not found".
function fakeClient({ loginOk = true, lists = ["Groceries"] } = {}) {
  return {
    client: null,
    calls: [],
    async login() {
      this.calls.push("login");
      if (!loginOk) throw new Error("Failed to connect to AnyList: Response code 401 (Unauthorized)");
      this.client = {};
    },
    async connect(name) {
      this.calls.push(`connect:${name}`);
      if (!lists.includes(name)) throw new Error(`Failed to connect to AnyList: List "${name}" not found.`);
    },
  };
}

describe("verifyCredentials", () => {
  it("rejects bad credentials when no default list is given", async () => {
    const client = fakeClient({ loginOk: false });
    const error = await verifyCredentials(client, "");
    assert.match(error, /401/);
    assert.deepEqual(client.calls, ["login"]);
  });

  it("rejects bad credentials when a default list is given", async () => {
    const error = await verifyCredentials(fakeClient({ loginOk: false }), "Groceries");
    assert.match(error, /401/);
  });

  it("accepts good credentials without a default list", async () => {
    const client = fakeClient();
    assert.equal(await verifyCredentials(client, undefined), null);
    assert.deepEqual(client.calls, ["login"]);
  });

  it("accepts good credentials with an existing default list", async () => {
    const client = fakeClient();
    assert.equal(await verifyCredentials(client, "Groceries"), null);
    assert.deepEqual(client.calls, ["login", "connect:Groceries"]);
  });

  it("still accepts good credentials when the default list doesn't exist", async () => {
    assert.equal(await verifyCredentials(fakeClient(), "Typo List"), null);
  });
});
