import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { isIpAllowed, requireAllowedIp, requireSetupOpen } from "../src/http/access.js";

function run(middleware, req) {
  let nextCalled = false, status;
  const res = {
    status(c) { status = c; return this; },
    json() { return this; },
    send() { return this; },
  };
  middleware({ method: "GET", path: "/x", ...req }, res, () => { nextCalled = true; });
  return { nextCalled, status };
}

describe("isIpAllowed", () => {
  afterEach(() => { delete process.env.ALLOWED_IPS; });

  it("allows everything when ALLOWED_IPS is unset", () => {
    assert.ok(isIpAllowed("8.8.8.8"));
  });

  it("matches CIDRs, single addresses, IPv6 and IPv4-mapped addresses", () => {
    process.env.ALLOWED_IPS = "160.79.104.0/21, 203.0.113.7, 2600:4040:4023:f300::/64";
    assert.ok(isIpAllowed("160.79.111.255"));
    assert.ok(isIpAllowed("::ffff:160.79.104.1"));
    assert.ok(isIpAllowed("203.0.113.7"));
    assert.ok(isIpAllowed("2600:4040:4023:f300:1::5"));
  });

  it("rejects addresses outside the list", () => {
    process.env.ALLOWED_IPS = "160.79.104.0/21";
    assert.ok(!isIpAllowed("160.79.112.0"));
    assert.ok(!isIpAllowed("8.8.8.8"));
    assert.ok(!isIpAllowed("2600:4040:4023:f300::1"));
    assert.ok(!isIpAllowed(undefined));
  });
});

describe("requireAllowedIp", () => {
  afterEach(() => { delete process.env.ALLOWED_IPS; });

  it("blocks with 403 outside the list and lets listed IPs through", () => {
    process.env.ALLOWED_IPS = "160.79.104.0/21";
    assert.deepEqual(run(requireAllowedIp, { ip: "160.79.104.10" }), { nextCalled: true, status: undefined });
    assert.deepEqual(run(requireAllowedIp, { ip: "8.8.8.8" }), { nextCalled: false, status: 403 });
  });

  it("always lets /health through", () => {
    process.env.ALLOWED_IPS = "160.79.104.0/21";
    assert.deepEqual(run(requireAllowedIp, { ip: "127.0.0.1", path: "/health" }), { nextCalled: true, status: undefined });
  });
});

describe("requireSetupOpen", () => {
  afterEach(() => { delete process.env.SETUP_OPEN; });

  it("returns 404 unless SETUP_OPEN=true", () => {
    assert.deepEqual(run(requireSetupOpen, { path: "/login" }), { nextCalled: false, status: 404 });
    process.env.SETUP_OPEN = "false";
    assert.deepEqual(run(requireSetupOpen, { path: "/login" }), { nextCalled: false, status: 404 });
    process.env.SETUP_OPEN = "true";
    assert.deepEqual(run(requireSetupOpen, { path: "/login" }), { nextCalled: true, status: undefined });
  });
});
