import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import oauthRouter, { basePath } from "../src/http/auth/oauth.js";
import onboardingRouter from "../src/http/onboarding.js";

describe("basePath", () => {
  afterEach(() => { delete process.env.BASE_URL; });

  it("is empty when BASE_URL is unset", () => {
    assert.equal(basePath(), "");
  });

  it("is empty when BASE_URL has no path", () => {
    process.env.BASE_URL = "https://anylist.example.com";
    assert.equal(basePath(), "");
    process.env.BASE_URL = "https://anylist.example.com/";
    assert.equal(basePath(), "");
  });

  it("is the path of BASE_URL, without a trailing slash", () => {
    process.env.BASE_URL = "https://example.com/anylist";
    assert.equal(basePath(), "/anylist");
    process.env.BASE_URL = "https://example.com/apps/anylist/";
    assert.equal(basePath(), "/apps/anylist");
  });

  it("throws on an invalid BASE_URL", () => {
    process.env.BASE_URL = "example.com/anylist";
    assert.throws(() => basePath(), /Invalid URL/);
  });
});

describe("redirects under a BASE_URL path", () => {
  let server, origin;

  before(async () => {
    const app = express();
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use(oauthRouter);
    app.use(onboardingRouter);
    server = app.listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());
  afterEach(() => { delete process.env.BASE_URL; });

  const locationOf = async path =>
    (await fetch(origin + path, { redirect: "manual" })).headers.get("location");

  it("prefixes internal redirects with the BASE_URL path", async () => {
    process.env.BASE_URL = "https://example.com/anylist";
    assert.equal(await locationOf("/setup"), "/anylist/login");
    assert.equal(await locationOf("/oauth/consent"), "/anylist/login");
  });

  it("keeps root redirects when BASE_URL is unset", async () => {
    assert.equal(await locationOf("/setup"), "/login");
    assert.equal(await locationOf("/oauth/consent"), "/login");
  });
});
