import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../../src/tools/recipes.js';
import { MockAnyListClient, createMockServer } from './helpers.js';

describe('recipes tool', () => {
  let client;
  let handlers;

  beforeEach(() => {
    client = new MockAnyListClient();
    const { server, handlers: h } = createMockServer();
    register(server, () => Promise.resolve(client));
    handlers = h;
  });

  describe('list', () => {
    it('returns empty message when no recipes', async () => {
      const result = await handlers.recipes({ action: 'list' });
      assert.ok(result.content[0].text.includes('No recipes found'));
    });

    it('lists recipes with metadata and id', async () => {
      client._recipes.push({ identifier: 'r-abc', name: 'Pasta', rating: 5, prepTime: 10, cookTime: 20, servings: '4' });
      const result = await handlers.recipes({ action: 'list' });
      assert.ok(result.content[0].text.includes('Pasta'));
      assert.ok(result.content[0].text.includes('⭐5'));
      assert.ok(result.content[0].text.includes('r-abc'));
    });

    it('filters by search query', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'Salad' });
      const result = await handlers.recipes({ action: 'list', search: 'pasta' });
      assert.ok(result.content[0].text.includes('Pasta'));
      assert.ok(!result.content[0].text.includes('Salad'));
    });
  });

  describe('get', () => {
    it('returns full recipe details with id', async () => {
      client._recipes.push({
        identifier: 'r-xyz',
        name: 'Pasta',
        ingredients: [{ rawIngredient: '2 cups flour' }],
        preparationSteps: ['Boil water', 'Cook pasta'],
      });
      const result = await handlers.recipes({ action: 'get', name: 'Pasta' });
      assert.ok(result.content[0].text.includes('# Pasta'));
      assert.ok(result.content[0].text.includes('r-xyz'));
      assert.ok(result.content[0].text.includes('2 cups flour'));
      assert.ok(result.content[0].text.includes('Boil water'));
    });

    it('returns error for non-existent recipe', async () => {
      const result = await handlers.recipes({ action: 'get', name: 'Nope' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });
  });

  describe('create', () => {
    it('creates a recipe', async () => {
      const result = await handlers.recipes({ action: 'create', name: 'New Recipe' });
      assert.ok(result.content[0].text.includes('Created recipe "New Recipe"'));
      assert.equal(client._recipes.length, 1);
    });

    it('creates recipe with all fields', async () => {
      await handlers.recipes({
        action: 'create',
        name: 'Full Recipe',
        ingredients: [{ name: 'sugar', quantity: '1 cup' }],
        steps: ['Mix well'],
        note: 'Delicious',
        prep_time: 5,
        cook_time: 30,
        servings: '4',
      });
      assert.equal(client._recipes[0].name, 'Full Recipe');
    });
  });

  describe('import_url', () => {
    it('imports a recipe from a URL', async () => {
      client._pendingImport = {
        name: 'Chicken Tikka Masala',
        ingredientCount: 12,
        stepCount: 6,
        source: 'AllRecipes',
        sourceUrl: 'https://example.com/recipe',
      };
      const result = await handlers.recipes({ action: 'import_url', url: 'https://example.com/recipe' });
      assert.ok(result.content[0].text.includes('Imported recipe "Chicken Tikka Masala"'));
      assert.ok(result.content[0].text.includes('12 ingredients'));
      assert.ok(result.content[0].text.includes('6 steps'));
      assert.ok(result.content[0].text.includes('AllRecipes'));
    });

    it('returns error when URL cannot be parsed', async () => {
      client._pendingImport = null;
      const result = await handlers.recipes({ action: 'import_url', url: 'https://bad-site.com' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('Could not parse'));
    });
  });

  describe('update', () => {
    it('updates only the provided fields and preserves the rest', async () => {
      client._recipes.push({
        identifier: 'r-keep',
        name: 'Pasta',
        note: 'original note',
        servings: '4',
        rating: 5,
        ingredients: [{ rawIngredient: '1 lb spaghetti' }],
        preparationSteps: ['Boil'],
      });
      const result = await handlers.recipes({ action: 'update', name: 'Pasta', note: 'updated note' });
      assert.ok(result.content[0].text.includes('Updated recipe "Pasta"'));
      const r = client._recipes[0];
      assert.equal(r.note, 'updated note');
      // Untouched fields survive.
      assert.equal(r.identifier, 'r-keep');
      assert.equal(r.servings, '4');
      assert.equal(r.rating, 5);
      assert.deepEqual(r.preparationSteps, ['Boil']);
    });

    it('replaces the entire ingredient list when ingredients are provided', async () => {
      client._recipes.push({
        identifier: 'r-1',
        name: 'Pasta',
        ingredients: [{ rawIngredient: '1 lb spaghetti' }, { rawIngredient: '2 cloves garlic' }],
      });
      await handlers.recipes({
        action: 'update',
        name: 'Pasta',
        ingredients: [{ name: 'penne', quantity: '1 lb' }],
      });
      assert.equal(client._recipes[0].ingredients.length, 1);
      assert.equal(client._recipes[0].ingredients[0].name, 'penne');
    });

    it('returns error when no fields are provided', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' });
      const result = await handlers.recipes({ action: 'update', name: 'Pasta' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('at least one field'));
    });

    it('returns error for non-existent recipe', async () => {
      const result = await handlers.recipes({ action: 'update', name: 'Nope', note: 'x' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });

    it('returns error when the name matches multiple recipes', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'Pasta' });
      const result = await handlers.recipes({ action: 'update', name: 'Pasta', note: 'x' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('Multiple recipes'));
    });
  });

  describe('delete', () => {
    it('deletes an existing recipe', async () => {
      client._recipes.push({ name: 'Old Recipe' });
      const result = await handlers.recipes({ action: 'delete', name: 'Old Recipe' });
      assert.ok(result.content[0].text.includes('Deleted recipe'));
      assert.equal(client._recipes.length, 0);
    });

    it('returns error for non-existent recipe', async () => {
      const result = await handlers.recipes({ action: 'delete', name: 'Nope' });
      assert.equal(result.isError, true);
    });
  });
});
