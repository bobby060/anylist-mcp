import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isRedirectUriAllowed } from "../src/http/security.js";

describe("isRedirectUriAllowed", () => {
  afterEach(() => { delete process.env.ALLOWED_REDIRECT_HOSTS; });

  it("allows Claude callbacks by default", () => {
    assert.ok(isRedirectUriAllowed("https://claude.ai/api/mcp/auth_callback"));
    assert.ok(isRedirectUriAllowed("https://claude.com/api/mcp/auth_callback"));
  });

  it("allows http only on loopback", () => {
    assert.ok(isRedirectUriAllowed("http://localhost:6274/callback"));
    assert.ok(isRedirectUriAllowed("http://127.0.0.1:8080/cb"));
    assert.ok(!isRedirectUriAllowed("http://claude.ai/api/mcp/auth_callback"));
  });

  it("rejects other hosts, lookalikes, and garbage", () => {
    assert.ok(!isRedirectUriAllowed("https://evil.example/cb"));
    assert.ok(!isRedirectUriAllowed("https://claude.ai.evil.example/cb"));
    assert.ok(!isRedirectUriAllowed("https://evil.example/?x=https://claude.ai"));
    assert.ok(!isRedirectUriAllowed("javascript:alert(1)"));
    assert.ok(!isRedirectUriAllowed(undefined));
  });

  it("honours ALLOWED_REDIRECT_HOSTS", () => {
    process.env.ALLOWED_REDIRECT_HOSTS = "my.home-assistant.io";
    assert.ok(isRedirectUriAllowed("https://my.home-assistant.io/redirect/oauth"));
    assert.ok(!isRedirectUriAllowed("https://claude.ai/api/mcp/auth_callback"));
  });
});
