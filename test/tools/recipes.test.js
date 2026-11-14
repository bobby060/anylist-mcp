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

    it('shows ingredient notes', async () => {
      client._recipes.push({
        identifier: 'r-n',
        name: 'Sauce',
        ingredients: [{ name: 'brown sugar', quantity: '2 g', note: 'or honey, optional', rawIngredient: '2 g brown sugar' }],
      });
      const result = await handlers.recipes({ action: 'get', name: 'Sauce' });
      assert.ok(result.content[0].text.includes('- 2 g brown sugar (note: or honey, optional)'));
    });

    it('shows photos stored in AnyList', async () => {
      client._recipes.push({ identifier: 'r-s', name: 'Tart', photoIds: ['p1'] });
      const text = (await handlers.recipes({ action: 'get', name: 'Tart' })).content[0].text;
      assert.ok(text.includes('Photos: 1 stored in AnyList'));
    });

    it('shows nutrition facts', async () => {
      client._recipes.push({ identifier: 'r-z', name: 'Salad', nutritionalInfo: 'Calories: 120' });
      const text = (await handlers.recipes({ action: 'get', name: 'Salad' })).content[0].text;
      assert.ok(text.includes('Nutrition:\nCalories: 120'));
    });

    it('shows ingredient headings and photos', async () => {
      client._recipes.push({
        identifier: 'r-h',
        name: 'Pie',
        photoUrls: ['https://example.com/pie.jpg'],
        ingredients: [{ name: 'Crust', isHeading: true, rawIngredient: 'Crust' }, { name: 'flour', quantity: '250 g' }],
      });
      const text = (await handlers.recipes({ action: 'get', name: 'Pie' })).content[0].text;
      assert.ok(text.includes('### Crust'));
      assert.ok(text.includes('- 250 g flour'));
      assert.ok(text.includes('Photo links: https://example.com/pie.jpg'));
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

    it('stores ingredient notes separately from name and quantity', async () => {
      await handlers.recipes({
        action: 'create',
        name: 'Noted',
        ingredients: [
          { name: 'kosher salt', quantity: '3.5 g', note: 'about 1 1/4 tsp Diamond Crystal' },
          { name: 'flour', quantity: '15 g' },
        ],
      });
      const [salt, flour] = client._recipes[0].ingredients;
      assert.equal(salt.name, 'kosher salt');
      assert.equal(salt.quantity, '3.5 g');
      assert.equal(salt.note, 'about 1 1/4 tsp Diamond Crystal');
      assert.equal(salt.rawIngredient, '3.5 g kosher salt, about 1 1/4 tsp Diamond Crystal');
      assert.equal(flour.note, null);
      assert.equal(flour.rawIngredient, '15 g flour');
    });

    it('stores ingredient headings', async () => {
      await handlers.recipes({
        action: 'create',
        name: 'Sectioned',
        ingredients: [
          { name: 'Sauce', heading: true },
          { name: 'butter', quantity: '2 Tbsp' },
        ],
      });
      const [heading, butter] = client._recipes[0].ingredients;
      assert.equal(heading.isHeading, true);
      assert.equal(heading.name, 'Sauce');
      assert.equal(heading.rawIngredient, 'Sauce');
      assert.equal(heading.quantity, null);
      assert.ok(!butter.isHeading);
    });

    it('stores nutrition facts', async () => {
      await handlers.recipes({ action: 'create', name: 'Nutty', nutrition: 'Calories: 65\nFat: 4 g' });
      assert.equal(client._recipes[0].nutritionalInfo, 'Calories: 65\nFat: 4 g');
    });

    it('stores a photo URL', async () => {
      await handlers.recipes({ action: 'create', name: 'Pictured', photo_url: 'https://example.com/a.jpg' });
      assert.deepEqual(client._recipes[0].photoUrls, ['https://example.com/a.jpg']);
    });

    it('stores prep/cook times in seconds', async () => {
      await handlers.recipes({ action: 'create', name: 'Timed', prep_time: 5, cook_time: 30 });
      assert.equal(client._recipes[0].prepTime, 300);
      assert.equal(client._recipes[0].cookTime, 1800);
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

    it('sets and clears nutrition on update', async () => {
      client._recipes.push({ identifier: 'r-q', name: 'Stew' });
      await handlers.recipes({ action: 'update', name: 'Stew', nutrition: 'Calories: 300' });
      assert.equal(client._recipes[0].nutritionalInfo, 'Calories: 300');
      await handlers.recipes({ action: 'update', name: 'Stew', nutrition: '' });
      assert.equal(client._recipes[0].nutritionalInfo, null);
    });

    it('sets and clears the photo on update', async () => {
      client._recipes.push({ identifier: 'r-p', name: 'Soup', photoUrls: ['https://example.com/old.jpg'] });
      await handlers.recipes({ action: 'update', name: 'Soup', photo_url: 'https://example.com/new.jpg' });
      assert.deepEqual(client._recipes[0].photoUrls, ['https://example.com/new.jpg']);
      await handlers.recipes({ action: 'update', name: 'Soup', photo_url: '' });
      assert.deepEqual(client._recipes[0].photoUrls, []);
    });

    it('keeps ingredient notes on update', async () => {
      client._recipes.push({ identifier: 'r-1', name: 'Pasta', ingredients: [] });
      await handlers.recipes({
        action: 'update',
        name: 'Pasta',
        ingredients: [{ name: 'garlic', quantity: '7 g', note: 'minced' }],
      });
      assert.equal(client._recipes[0].ingredients[0].note, 'minced');
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
