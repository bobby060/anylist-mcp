import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// db.js reads DATA_DIR at import time, so set it before loading the router.
const dataDir = mkdtempSync(path.join(tmpdir(), 'anylist-mcp-oauth-'));
process.env.DATA_DIR = dataDir;
process.env.BASE_URL = 'https://mcp.example.com';

const { default: express } = await import('express');
const { default: oauthRouter } = await import('../src/http/auth/oauth.js');

describe('OAuth dynamic client registration', () => {
  let server;
  let base;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use(oauthRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function register(body) {
    const res = await fetch(`${base}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: await res.json() };
  }

  // Body ChatGPT's connector platform sends when registering.
  const chatgptBody = {
    redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: 'ChatGPT',
  };

  it('omits client_secret for public clients instead of returning null', async () => {
    const { status, json } = await register(chatgptBody);
    assert.equal(status, 201);
    assert.equal(typeof json.client_id, 'string');
    assert.ok(!('client_secret' in json), 'client_secret must be omitted, not null');
    assert.equal(json.token_endpoint_auth_method, 'none');
    assert.deepEqual(json.redirect_uris, chatgptBody.redirect_uris);
  });

  it('returns client_id_issued_at as a unix timestamp', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { json } = await register(chatgptBody);
    assert.equal(typeof json.client_id_issued_at, 'number');
    assert.ok(json.client_id_issued_at >= before);
  });

  it('echoes the requested scope, defaulting to mcp', async () => {
    assert.equal((await register(chatgptBody)).json.scope, 'mcp');
    assert.equal((await register({ ...chatgptBody, scope: 'mcp' })).json.scope, 'mcp');
  });

  it('advertises scopes_supported in authorization server metadata', async () => {
    const res = await fetch(`${base}/.well-known/oauth-authorization-server`);
    const json = await res.json();
    assert.deepEqual(json.scopes_supported, ['mcp']);
    assert.equal(json.registration_endpoint, 'https://mcp.example.com/oauth/register');
  });
});
