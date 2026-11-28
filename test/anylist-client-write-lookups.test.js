import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AnyListClient from '../src/anylist-client.js';

// Recipe and collection writes look the target up by name. anylist-js returns
// its cached arrays when called without refreshCache, and its recipe cache
// starts as an empty array, so these lookups must force a fetch. The fake
// library below behaves the same way: a cached call returns what the cache
// holds, and only a forced call sees the account's current data.
function fakeLibrary(account) {
  const lib = {
    recipes: [],
    recipeCollections: [],
    saved: [],
    deleted: [],
    async getRecipes(refreshCache = false) {
      if (refreshCache) lib.recipes = account.recipes.map(r => ({ ...r, ingredients: [], delete: async () => lib.deleted.push(r.identifier) }));
      return lib.recipes;
    },
    async getRecipeCollections(refreshCache = false) {
      if (refreshCache) lib.recipeCollections = account.collections.map(c => ({ ...c, delete: async () => lib.deleted.push(c.identifier) }));
      return lib.recipeCollections;
    },
    async createRecipe(fields) {
      return { ...fields, save: async () => lib.saved.push(fields) };
    },
    async createRecipeCollection(fields) {
      return { identifier: 'c-new', ...fields, save: async () => lib.saved.push(fields) };
    },
  };
  return lib;
}

describe('AnyListClient write lookups', () => {
  let client;
  let account;

  beforeEach(() => {
    account = {
      recipes: [{ identifier: 'r-cake', name: 'Cake', note: 'Old note' }],
      collections: [{ identifier: 'c-desserts', name: 'Desserts', recipeIds: [] }],
    };
    client = new AnyListClient();
    client.client = fakeLibrary(account);
  });

  it('updates a recipe when nothing has been read yet', async () => {
    const result = await client.updateRecipe('cake', { servings: '8' });
    assert.equal(result.name, 'Cake');
    assert.equal(client.client.saved[0].servings, '8');
  });

  it('updates from the current recipe, not an earlier cached copy', async () => {
    await client.client.getRecipes(true);
    account.recipes = [{ identifier: 'r-cake', name: 'Cake', note: 'Edited in the app' }];
    await client.updateRecipe('Cake', { servings: '8' });
    assert.equal(client.client.saved[0].note, 'Edited in the app');
  });

  it('deletes a recipe when nothing has been read yet', async () => {
    await client.deleteRecipe('Cake');
    assert.deepEqual(client.client.deleted, ['r-cake']);
  });

  it('creates a collection with recipes when nothing has been read yet', async () => {
    await client.createRecipeCollection('Party', ['Cake']);
    assert.deepEqual(client.client.saved[0].recipeIds, ['r-cake']);
  });

  it('deletes a collection created since the last read', async () => {
    await client.client.getRecipeCollections(true);
    account.collections.push({ identifier: 'c-party', name: 'Party', recipeIds: [] });
    await client.deleteRecipeCollection('Party');
    assert.deepEqual(client.client.deleted, ['c-party']);
  });

  it('still reports a recipe that does not exist', async () => {
    await assert.rejects(client.updateRecipe('Soup', { servings: '2' }), /Recipe "Soup" not found/);
    await assert.rejects(client.deleteRecipe('Soup'), /Recipe "Soup" not found/);
  });

  it('reports not found on an account with no recipes or collections', async () => {
    account.recipes = [];
    account.collections = [];
    await assert.rejects(client.updateRecipe('Cake', { servings: '2' }), /not found/);
    await assert.rejects(client.deleteRecipeCollection('Desserts'), /not found/);
  });
});
