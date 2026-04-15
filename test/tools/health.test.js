import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../../src/tools/health.js';
import { MockAnyListClient, createMockServer } from './helpers.js';

describe('health_check tool', () => {
  let client;
  let handlers;

  beforeEach(() => {
    client = new MockAnyListClient();
    const { server, handlers: h } = createMockServer();
    register(server, () => Promise.resolve(client));
    handlers = h;
  });

  it('returns success on connection', async () => {
    const result = await handlers.health_check({});
    assert.ok(result.content[0].text.includes('Successfully connected'));
    assert.equal(result.isError, undefined);
  });

  it('uses custom list name', async () => {
    const result = await handlers.health_check({ list_name: 'My List' });
    assert.ok(result.content[0].text.includes('My List'));
  });
});
