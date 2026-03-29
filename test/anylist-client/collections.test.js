/**
 * Tests for recipe collection operations: getRecipeCollections, createRecipeCollection
 */
import { createConnectedClient, makeRunner, printSuiteResults } from './helpers.js';

const COLLECTION = `🧪 Test Collection ${Date.now()}`;

export async function runCollectionsTests() {
  console.log('\n📚 Recipe Collections');
  const { test, results } = makeRunner();

  const client = await createConnectedClient();

  await test('getRecipeCollections returns array', async () => {
    const collections = await client.getRecipeCollections();
    if (!Array.isArray(collections)) throw new Error('getRecipeCollections() should return an array');
    if (collections.length > 0) {
      const c = collections[0];
      if (typeof c.identifier !== 'string') throw new Error('Collection should have identifier string');
      if (typeof c.name !== 'string') throw new Error('Collection should have name string');
      if (typeof c.recipeCount !== 'number') throw new Error('Collection should have recipeCount number');
      if (!Array.isArray(c.recipeNames)) throw new Error('Collection should have recipeNames array');
    }
  });

  await test('createRecipeCollection creates empty collection', async () => {
    const result = await client.createRecipeCollection(COLLECTION, []);
    if (!result.identifier) throw new Error('createRecipeCollection should return identifier');
    if (result.name !== COLLECTION) throw new Error(`Expected name "${COLLECTION}", got "${result.name}"`);
  });

  await test('created collection appears in getRecipeCollections', async () => {
    const collections = await client.getRecipeCollections();
    const found = collections.find(c => c.name === COLLECTION);
    if (!found) throw new Error(`Collection "${COLLECTION}" not found after creation`);
    if (found.recipeCount !== 0) throw new Error(`Expected 0 recipes, got ${found.recipeCount}`);
  });

  // Test with recipes if any exist
  await test('createRecipeCollection with existing recipe names resolves them', async () => {
    const recipes = await client.getRecipes();
    if (recipes.length === 0) {
      console.log('    (skipped — no recipes in account to add to collection)');
      return;
    }
    const firstName = recipes[0].name;
    const COLLECTION_WITH_RECIPE = `🧪 Test Collection Recipes ${Date.now()}`;
    const result = await client.createRecipeCollection(COLLECTION_WITH_RECIPE, [firstName]);
    if (!result.identifier) throw new Error('Should return identifier');

    const collections = await client.getRecipeCollections();
    const found = collections.find(c => c.name === COLLECTION_WITH_RECIPE);
    if (!found) throw new Error('Collection with recipe not found after creation');
    if (found.recipeCount !== 1) throw new Error(`Expected 1 recipe, got ${found.recipeCount}`);
    if (!found.recipeNames.includes(firstName)) throw new Error(`Expected recipe "${firstName}" in collection`);
  });

  await client.disconnect();
  return printSuiteResults('Recipe Collections', results());
}
