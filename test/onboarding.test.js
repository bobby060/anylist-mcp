import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import session from "express-session";
import { AnyList, pb, startAnyListStandIn } from "./anylist-stand-in.js";

// Set before the server modules load: db.js reads DATA_DIR on import, and
// anylist-js defaults its files to the home directory.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "anylist-mcp-onboarding-"));
process.env.HOME = mkdtempSync(path.join(tmpdir(), "anylist-mcp-home-"));
process.env.SERVER_SECRET_KEY = "00".repeat(32);
const db = await import("../src/http/db.js");
const { verifyCredentials, default: onboardingRouter } = await import("../src/http/onboarding.js");
const { getOrCreateSession, evictSession } = await import("../src/http/session-manager.js");

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
    async disconnect() {
      this.calls.push("disconnect");
    },
  };
}

describe("verifyCredentials", () => {
  it("rejects bad credentials when no default list is given", async () => {
    const client = fakeClient({ loginOk: false });
    const error = await verifyCredentials(client, "");
    assert.match(error, /401/);
    assert.deepEqual(client.calls, ["login", "disconnect"]);
  });

  it("rejects bad credentials when a default list is given", async () => {
    const error = await verifyCredentials(fakeClient({ loginOk: false }), "Groceries");
    assert.match(error, /401/);
  });

  it("accepts good credentials without a default list", async () => {
    const client = fakeClient();
    assert.equal(await verifyCredentials(client, undefined), null);
    assert.deepEqual(client.calls, ["login", "disconnect"]);
  });

  it("accepts good credentials with an existing default list", async () => {
    const client = fakeClient();
    assert.equal(await verifyCredentials(client, "Groceries"), null);
    assert.deepEqual(client.calls, ["login", "connect:Groceries", "disconnect"]);
  });

  it("still accepts good credentials when the default list doesn't exist", async () => {
    assert.equal(await verifyCredentials(fakeClient(), "Typo List"), null);
  });
});

describe("POST /setup", () => {
  let standIn;
  let server;
  let baseUrl;
  const storageDir = path.join(process.env.DATA_DIR, "anylist", "user-a");
  const credentialsFile = path.join(storageDir, "credentials");
  const tokens = () => new AnyList({ email: "x", password: "pw" })._decryptCredentials(readFileSync(credentialsFile), "pw");
  const subject = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url")).sub;
  const token = (sub) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.sig`;

  before(async () => {
    standIn = await startAnyListStandIn();
    db.createUser({ id: "user-a", email: "user@example.com" });
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req, _res, next) => { req.session.userId = "user-a"; next(); });
    app.use(onboardingRouter);
    server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await standIn.close();
  });

  it("signs in to the new account and closes the check's connection", async () => {
    // Tokens saved for the account being replaced, under the same password.
    mkdirSync(storageDir, { recursive: true });
    const old = new AnyList({ email: "old@example.com", password: "pw" });
    writeFileSync(credentialsFile, old._encryptCredentials({ clientId: "old", accessToken: "x.eyJzdWIiOiJvbGQifQ.x", refreshToken: "old" }, "pw"));

    const res = await fetch(`${baseUrl}/setup`, {
      method: "POST",
      body: new URLSearchParams({ anylist_username: "new@example.com", anylist_password: "pw", default_list: "Groceries" }),
      redirect: "manual",
    });

    assert.equal(res.headers.get("location"), "/setup?saved=1");
    assert.equal(db.getAnyListCredentials("user-a").username, "new@example.com");
    assert.equal(subject(tokens().accessToken), "uid-new@example.com");
    const deadline = Date.now() + 3000;
    while (standIn.openSockets() > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(standIn.openSockets(), 0);
    assert.equal(existsSync(path.join(process.env.HOME, ".anylist_credentials")), false);
  });

  const setup = (username) => fetch(`${baseUrl}/setup`, {
    method: "POST",
    body: new URLSearchParams({ anylist_username: username, anylist_password: "pw", default_list: "Groceries" }),
    redirect: "manual",
  });
  const waitFor = async (condition) => {
    const deadline = Date.now() + 3000;
    while (!condition()) {
      if (Date.now() > deadline) throw new Error("timed out");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  it("makes a tool call during the check wait for the new credentials", async () => {
    db.upsertAnyListCredentials("user-a", { username: "old@example.com", password: "pw", defaultListName: "Groceries" });
    // Hold the check's sign-in, so the tool call below comes in during the check.
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    standIn.respond = (request, res) => {
      if (request.url !== "/auth/token" || !request.body.includes("new@example.com")) return false;
      standIn.respond = null;
      held.then(() => res.end(JSON.stringify({ access_token: token("uid-new@example.com"), refresh_token: "r" })));
      return true;
    };

    const saving = setup("new@example.com");
    await waitFor(() => standIn.respond === null);
    const session = getOrCreateSession("user-a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    assert.equal((await saving).headers.get("location"), "/setup?saved=1");
    const client = await session;
    assert.equal(client._username, "new@example.com");
    await client.login();
    assert.equal(subject(client.client.accessToken), "uid-new@example.com");
    evictSession("user-a");
  });

  it("lets a tool call that is running finish when /setup replaces its session", async () => {
    db.upsertAnyListCredentials("user-a", { username: "new@example.com", password: "pw", defaultListName: "Groceries" });
    const client = await getOrCreateSession("user-a");
    await client.login();
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    standIn.respond = (request, res) => {
      if (request.url !== "/data/user-data/get") return false;
      standIn.respond = null; // Only the running call's sync is held.
      held.then(() => res.end(new pb.PBUserDataResponse(standIn.userData).toBuffer()));
      return true;
    };
    const running = client.connect("Groceries");
    await waitFor(() => standIn.respond === null);
    assert.equal((await setup("new@example.com")).headers.get("location"), "/setup?saved=1");
    release();
    await running;
    assert.equal(client.targetList.name, "Groceries");
    evictSession("user-a");
  });
});
