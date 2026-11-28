import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerAllTools } from '../../src/tools/index.js';
import { MockAnyListClient, createMockServer } from './helpers.js';

describe('tool actions', () => {
  it('every advertised action has a handler', async () => {
    const { server, handlers, schemas } = createMockServer();
    const client = new MockAnyListClient();
    registerAllTools(server, () => Promise.resolve(client));

    const unhandled = [];
    for (const [tool, schema] of Object.entries(schemas)) {
      for (const action of schema.inputSchema.action?.options ?? []) {
        // A missing parameter is an error response or a throw; a dead action is neither.
        const result = await handlers[tool]({ action }).catch((error) => error);
        if (result === undefined) unhandled.push(`${tool}.${action}`);
      }
    }
    assert.deepEqual(unhandled, []);
  });
});
