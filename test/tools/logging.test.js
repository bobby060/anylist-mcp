import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerAllTools } from '../../src/tools/index.js';
import { MockAnyListClient, createMockServer } from './helpers.js';

describe('tool result logging', () => {
  it('logs the data each tool returns', async (t) => {
    const client = new MockAnyListClient();
    const { server, handlers } = createMockServer();
    registerAllTools(server, () => Promise.resolve(client));

    const logged = [];
    t.mock.method(console, 'error', (...args) => logged.push(args.join(' ')));
    const result = await handlers.health_check({ list_name: 'Grocery' });

    assert.ok(logged.includes(`[tool] health_check → ${result.content[0].text}`), logged.join('\n'));
  });
});
