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

  describe('add_recipes and remove_recipes', () => {
    beforeEach(() => {
      client._recipes.push({ name: 'Pasta' }, { name: 'Salad' }, { name: 'Soup' });
      client._collections.push({ name: 'Weeknight', recipeCount: 1, recipeNames: ['Pasta'] });
    });

    it('adds recipes and reports ones already in the collection', async () => {
      const result = await handlers.recipe_collections({ action: 'add_recipes', name: 'weeknight', recipe_names: ['Salad', 'Pasta'] });
      assert.equal(result.isError, undefined);
      assert.ok(result.content[0].text.includes('Added to "Weeknight": Salad'));
      assert.ok(result.content[0].text.includes('Already in "Weeknight": Pasta'));
      assert.deepEqual(client._collections[0].recipeNames, ['Pasta', 'Salad']);
    });

    it('removes recipes and reports ones not in the collection', async () => {
      const result = await handlers.recipe_collections({ action: 'remove_recipes', name: 'Weeknight', recipe_names: ['Pasta', 'Soup'] });
      assert.ok(result.content[0].text.includes('Removed from "Weeknight": Pasta'));
      assert.ok(result.content[0].text.includes('Not in "Weeknight": Soup'));
      assert.deepEqual(client._collections[0].recipeNames, []);
    });

    it('reports unknown recipe names, and errors when nothing changed', async () => {
      const result = await handlers.recipe_collections({ action: 'add_recipes', name: 'Weeknight', recipe_names: ['Nope'] });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('No recipe found named: Nope'));
    });

    it('requires recipe_names', async () => {
      const result = await handlers.recipe_collections({ action: 'add_recipes', name: 'Weeknight' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('requires recipe_names'));
    });

    it('returns error for non-existent collection', async () => {
      const result = await handlers.recipe_collections({ action: 'remove_recipes', name: 'Nope', recipe_names: ['Pasta'] });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });
  });

  describe('delete', () => {
    it('deletes an existing collection', async () => {
      client._collections.push({ name: 'Old Collection', recipeCount: 0, recipeNames: [] });
      const result = await handlers.recipe_collections({ action: 'delete', name: 'Old Collection' });
      assert.ok(result.content[0].text.includes('Deleted recipe collection'));
      assert.equal(client._collections.length, 0);
    });

    it('returns error for non-existent collection', async () => {
      const result = await handlers.recipe_collections({ action: 'delete', name: 'Nope' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });
  });
});
