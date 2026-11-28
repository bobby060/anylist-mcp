import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Runs the real HTTP server. Nothing here reaches AnyList: these routes are
// the server's own login and OAuth pages.
describe("HTTP server pages", () => {
  let child;
  let baseUrl;
  let cookie;

  before(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "anylist-mcp-http-"));
    writeFileSync(path.join(dir, "allowed-emails.txt"), "a@example.com\n");
    const port = await new Promise((resolve) => {
      const probe = createServer().listen(0, "127.0.0.1", () => {
        const { port } = probe.address();
        probe.close(() => resolve(port));
      });
    });
    child = spawn(process.execPath, [fileURLToPath(new URL("../src/http/index.js", import.meta.url))], {
      cwd: dir, // no .env from the repo
      env: {
        PATH: process.env.PATH,
        HOME: dir,
        PORT: String(port),
        DATA_DIR: dir,
        ALLOWED_EMAILS_FILE: path.join(dir, "allowed-emails.txt"),
        SERVER_SECRET_KEY: "00".repeat(32),
        SESSION_SECRET: "test",
      },
      stdio: ["ignore", "pipe", "inherit"],
    });
    await new Promise((resolve, reject) => {
      child.stdout.on("data", (data) => { if (data.toString().includes("listening")) resolve(); });
      child.on("exit", (code) => reject(new Error(`server exited with ${code}`)));
    });
    baseUrl = `http://127.0.0.1:${port}`;

    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      body: new URLSearchParams({ email: "a@example.com", password: "a long password" }),
      redirect: "manual",
    });
    cookie = res.headers.get("set-cookie");
  });

  after(() => child.kill());

  it("keeps the session cookie off cross-site POSTs", () => {
    assert.match(cookie, /SameSite=Lax/i);
  });

  it("shows the requesting client's id as text on the consent page", async () => {
    const sid = cookie.split(";")[0];
    const query = new URLSearchParams({
      client_id: "<script>alert(1)</script>",
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      code_challenge: "challenge",
    });
    await fetch(`${baseUrl}/oauth/authorize?${query}`, { headers: { cookie: sid }, redirect: "manual" });

    const page = await (await fetch(`${baseUrl}/oauth/consent`, { headers: { cookie: sid } })).text();
    assert.ok(!page.includes("<script>alert(1)</script>"));
    assert.ok(page.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  });
});
