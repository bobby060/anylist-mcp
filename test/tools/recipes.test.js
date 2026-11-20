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

    it('prefers an exact name match over a case-insensitive one', async () => {
      client._recipes.push(
        { identifier: 'r-upper', name: 'Easy Asian Cucumber Salad' },
        { identifier: 'r-lower', name: 'easy Asian Cucumber Salad' },
      );
      const result = await handlers.recipes({ action: 'get', name: 'easy Asian Cucumber Salad' });
      assert.ok(result.content[0].text.includes('r-lower'));
    });

    it('falls back to a case-insensitive match when it is unique', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Easy Asian Cucumber Salad' });
      const result = await handlers.recipes({ action: 'get', name: 'easy asian cucumber salad' });
      assert.ok(result.content[0].text.includes('# Easy Asian Cucumber Salad'));
    });

    it('returns an error listing the candidates when the case-insensitive match is ambiguous', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'PASTA' });
      const result = await handlers.recipes({ action: 'get', name: 'pasta' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('"Pasta" (id: r-1)'));
      assert.ok(result.content[0].text.includes('"PASTA" (id: r-2)'));
    });

    it('accepts a recipe id in place of the name', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'Pasta' });
      const result = await handlers.recipes({ action: 'get', name: 'r-2' });
      assert.ok(result.content[0].text.includes('ID: r-2'));
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

    it('stores prep/cook times in seconds', async () => {
      await handlers.recipes({ action: 'create', name: 'Timed', prep_time: 5, cook_time: 30 });
      assert.equal(client._recipes[0].prepTime, 300);
      assert.equal(client._recipes[0].cookTime, 1800);
    });

    it('asks to overwrite the exact-case match, not another recipe differing only in case', async () => {
      client._recipes.push({ identifier: 'r-upper', name: 'Pasta' }, { identifier: 'r-lower', name: 'pasta' });
      const result = await handlers.recipes({ action: 'create', name: 'pasta' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('Recipe "pasta" already exists'));
      assert.equal(client._recipes.length, 2);
    });

    it('returns an error and deletes nothing when the name is ambiguous', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'PASTA' });
      const result = await handlers.recipes({ action: 'create', name: 'pasta' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('matches 2'));
      // create takes a name, not an id: passing an id would create a recipe named by it
      assert.ok(!result.content[0].text.includes('Pass one of these ids'));
      assert.equal(client._recipes.length, 2);
    });
  });

  describe('times', () => {
    it('shows stored seconds as minutes in list and get', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Chili', prepTime: 2400, cookTime: 2700 });
      const list = await handlers.recipes({ action: 'list' });
      assert.ok(list.content[0].text.includes('prep: 40min'));
      assert.ok(list.content[0].text.includes('cook: 45min'));
      const get = await handlers.recipes({ action: 'get', name: 'Chili' });
      assert.ok(get.content[0].text.includes('Prep: 40 min'));
      assert.ok(get.content[0].text.includes('Cook: 45 min'));
    });

    it('converts minutes to seconds on update', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Chili' });
      await handlers.recipes({ action: 'update', name: 'Chili', prep_time: 40, cook_time: 45 });
      assert.equal(client._recipes[0].prepTime, 2400);
      assert.equal(client._recipes[0].cookTime, 2700);
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
    it('renames a recipe with new_name and keeps its other fields', async () => {
      client._recipes.push({ identifier: 'r-keep', name: 'Arroz De Peixe', rating: 3, note: 'keep me' });
      const result = await handlers.recipes({ action: 'update', name: 'Arroz De Peixe', new_name: 'Arroz de Peixe' });
      assert.ok(result.content[0].text.includes('Renamed recipe "Arroz De Peixe" to "Arroz de Peixe"'));
      const r = client._recipes[0];
      assert.equal(r.name, 'Arroz de Peixe');
      assert.equal(r.identifier, 'r-keep');
      assert.equal(r.rating, 3);
      assert.equal(r.note, 'keep me');
    });

    it('applies new_name together with other fields', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta', servings: '2' });
      await handlers.recipes({ action: 'update', name: 'Pasta', new_name: 'Garlic Pasta', servings: '4' });
      assert.equal(client._recipes[0].name, 'Garlic Pasta');
      assert.equal(client._recipes[0].servings, '4');
    });

    it('rejects an empty new_name without touching the recipe', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' });
      const result = await handlers.recipes({ action: 'update', name: 'Pasta', new_name: '  ' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('new_name cannot be empty'));
      assert.equal(client._recipes[0].name, 'Pasta');
    });

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

    it('returns error listing the candidates when the name matches multiple recipes', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'Pasta' });
      const result = await handlers.recipes({ action: 'update', name: 'Pasta', note: 'x' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('matches 2'));
      assert.ok(result.content[0].text.includes('r-1') && result.content[0].text.includes('r-2'));
      assert.equal(client._recipes[0].note, undefined);
      assert.equal(client._recipes[1].note, undefined);
    });

    it('updates by id when names are duplicated', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'Pasta' });
      const result = await handlers.recipes({ action: 'update', name: 'r-2', note: 'x' });
      assert.ok(result.content[0].text.includes('Updated recipe "Pasta"'));
      assert.equal(client._recipes[0].note, undefined);
      assert.equal(client._recipes[1].note, 'x');
    });

    it('updates the exact-case match, not another recipe differing only in case', async () => {
      client._recipes.push(
        { identifier: 'r-upper', name: 'Easy Asian Cucumber Salad' },
        { identifier: 'r-lower', name: 'easy Asian Cucumber Salad' },
      );
      await handlers.recipes({ action: 'update', name: 'easy Asian Cucumber Salad', note: 'x' });
      assert.equal(client._recipes[0].note, undefined);
      assert.equal(client._recipes[1].note, 'x');
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

    it('deletes the exact-case match, not another recipe differing only in case', async () => {
      client._recipes.push(
        { identifier: 'r-upper', name: 'Easy Asian Cucumber Salad' },
        { identifier: 'r-lower', name: 'easy Asian Cucumber Salad' },
      );
      await handlers.recipes({ action: 'delete', name: 'easy Asian Cucumber Salad' });
      assert.deepEqual(client._recipes.map(r => r.identifier), ['r-upper']);
    });

    it('deletes nothing when the name is ambiguous', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'PASTA' });
      const result = await handlers.recipes({ action: 'delete', name: 'pasta' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('matches 2'));
      assert.equal(client._recipes.length, 2);
    });

    it('deletes by id and names the deleted recipe', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta' }, { identifier: 'r-2', name: 'Pasta' });
      const result = await handlers.recipes({ action: 'delete', name: 'r-1' });
      assert.ok(result.content[0].text.includes('Deleted recipe "Pasta"'));
      assert.deepEqual(client._recipes.map(r => r.identifier), ['r-2']);
    });
  });
});
