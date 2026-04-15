import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../../src/tools/recipe-collections.js';
import { MockAnyListClient, createMockServer } from './helpers.js';

describe('recipe_collections tool', () => {
  let client;
  let handlers;

  beforeEach(() => {
    client = new MockAnyListClient();
    const { server, handlers: h } = createMockServer();
    register(server, () => Promise.resolve(client));
    handlers = h;
  });

  describe('list', () => {
    it('returns empty message when no collections', async () => {
      const result = await handlers.recipe_collections({ action: 'list' });
      assert.ok(result.content[0].text.includes('No recipe collections'));
    });

    it('lists collections with recipe names', async () => {
      client._collections.push({ name: 'Weeknight', recipeCount: 2, recipeNames: ['Pasta', 'Salad'] });
      const result = await handlers.recipe_collections({ action: 'list' });
      assert.ok(result.content[0].text.includes('Weeknight'));
      assert.ok(result.content[0].text.includes('Pasta'));
    });
  });

  describe('create', () => {
    it('creates a collection', async () => {
      const result = await handlers.recipe_collections({ action: 'create', name: 'Quick Meals' });
      assert.ok(result.content[0].text.includes('Created recipe collection "Quick Meals"'));
    });

    it('creates collection with recipes', async () => {
      await handlers.recipe_collections({ action: 'create', name: 'Favs', recipe_names: ['Pasta'] });
      assert.equal(client._collections[client._collections.length - 1].recipeNames[0], 'Pasta');
    });
  });
});
