import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import AnyListClient from '../src/anylist-client.js';
import { AnyList, pb, formPart, startAnyListStandIn } from './anylist-stand-in.js';

// Checks the operations AnyListClient sends to add recipes to, or remove them
// from, a collection. AnyList's server adds or removes exactly the recipe IDs
// each operation carries, so every operation must carry only the recipe being
// changed. Sending the collection's full list on a remove would empty it.
describe('AnyListClient collection membership operations', () => {
  let standIn;
  let client;

  before(async () => { standIn = await startAnyListStandIn(); });
  after(() => standIn.close());

  beforeEach(() => {
    standIn.requests = [];
    standIn.userData.recipeDataResponse = {
      recipeDataId: 'data-1',
      timestamp: 1,
      recipes: [
        { identifier: 'r-pasta', name: 'Pasta' },
        { identifier: 'r-salad', name: 'Salad' },
        { identifier: 'r-soup', name: 'Soup' },
      ],
      recipeCollections: [
        { identifier: 'c-1', name: 'Weeknight', timestamp: 1, recipeIds: ['r-pasta', 'r-soup'] },
      ],
    };
    // A real anylist-js client, signed in as user-1, without saved files.
    const anyList = standIn.attach(new AnyList({ email: 'x', password: 'x', credentialsFile: null, userDataFile: null }));
    anyList.uid = 'user-1';
    anyList.clientId = 'test-client';
    anyList.accessToken = 'test-token';
    client = new AnyListClient();
    client.client = anyList;
  });

  const posts = () => standIn.requests.filter(r => r.url === '/data/user-recipe-data/update');
  const sentOperations = (post) => pb.PBRecipeOperationList.decode(formPart(post.body, 'operations')).operations;
  const recipeData = () => standIn.userData.recipeDataResponse;

  it('adds with one operation per recipe, each carrying only that recipe', async () => {
    const result = await client.addRecipesToCollection('weeknight', ['Salad', 'Pasta', 'Missing']);
    assert.deepEqual(result, { name: 'Weeknight', changed: ['Salad'], unchanged: ['Pasta'], notFound: ['Missing'] });
    assert.equal(posts().length, 1);
    const ops = sentOperations(posts()[0]);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].metadata.handlerId, 'add-recipes-to-collection');
    assert.equal(ops[0].metadata.userId, 'user-1');
    assert.equal(ops[0].recipeDataId, 'data-1');
    assert.equal(ops[0].recipeCollection.identifier, 'c-1');
    assert.equal(ops[0].recipeCollection.name, 'Weeknight');
    assert.deepEqual(ops[0].recipeCollection.recipeIds, ['r-salad']);
  });

  it('removes without sending the recipes that should stay', async () => {
    const result = await client.removeRecipesFromCollection('Weeknight', ['Pasta', 'Soup', 'Salad']);
    assert.deepEqual(result.changed, ['Pasta', 'Soup']);
    assert.deepEqual(result.unchanged, ['Salad']);
    const ops = sentOperations(posts()[0]);
    assert.deepEqual(ops.map(op => op.metadata.handlerId), ['remove-recipes-from-collection', 'remove-recipes-from-collection']);
    assert.deepEqual(ops.map(op => op.recipeCollection.recipeIds), [['r-pasta'], ['r-soup']]);
    assert.notEqual(ops[0].metadata.operationId, ops[1].metadata.operationId);
  });

  it('sends nothing when no recipe changes', async () => {
    const result = await client.addRecipesToCollection('Weeknight', ['Pasta', 'pasta']);
    assert.deepEqual(result.unchanged, ['Pasta']);
    assert.equal(posts().length, 0);
  });

  it('reports a recipe named twice (by name and by id) once', async () => {
    const result = await client.addRecipesToCollection('Weeknight', ['Salad', 'r-salad']);
    assert.deepEqual(result, { name: 'Weeknight', changed: ['Salad'], unchanged: [], notFound: [] });
    assert.equal(sentOperations(posts()[0]).length, 1);
  });

  it('prefers the exact collection name over one differing only in case', async () => {
    recipeData().recipeCollections.push({ identifier: 'c-2', name: 'WEEKNIGHT', timestamp: 1, recipeIds: [] });
    await client.addRecipesToCollection('WEEKNIGHT', ['Salad']);
    assert.equal(sentOperations(posts()[0])[0].recipeCollection.identifier, 'c-2');
  });

  it('sends nothing when the collection name is ambiguous', async () => {
    recipeData().recipeCollections.push({ identifier: 'c-2', name: 'WEEKNIGHT', timestamp: 1, recipeIds: [] });
    await assert.rejects(() => client.removeRecipesFromCollection('weeknight', ['Pasta']), /"weeknight" matches 2/);
    assert.equal(posts().length, 0);
  });

  it('sends nothing when any recipe name is ambiguous', async () => {
    recipeData().recipes.push({ identifier: 'r-soup-2', name: 'SOUP' });
    await assert.rejects(() => client.removeRecipesFromCollection('Weeknight', ['Pasta', 'soup']), /"soup" matches 2/);
    assert.equal(posts().length, 0);
  });

  it('deletes nothing when the current collection names are ambiguous', async () => {
    // The cached list predates WEEKNIGHT; only a refreshed fetch has it.
    await client.client.getRecipeCollections();
    recipeData().recipeCollections.push({ identifier: 'c-2', name: 'WEEKNIGHT', timestamp: 1, recipeIds: [] });
    await assert.rejects(() => client.deleteRecipeCollection('weeknight'), /"weeknight" matches 2/);
    assert.equal(posts().length, 0);
    await client.deleteRecipeCollection('WEEKNIGHT');
    const [op] = sentOperations(posts()[0]);
    assert.equal(op.metadata.handlerId, 'remove-recipe-collection');
    assert.equal(op.recipeCollection.identifier, 'c-2');
  });

  it('throws when the collection does not exist', async () => {
    await assert.rejects(() => client.removeRecipesFromCollection('Nope', ['Pasta']), /Recipe collection "Nope" not found/);
    assert.equal(posts().length, 0);
  });
});
