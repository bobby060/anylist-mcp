import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import AnyListClient from '../src/anylist-client.js';

// Checks the operations AnyListClient sends to add recipes to, or remove them
// from, a collection. AnyList's server adds or removes exactly the recipe IDs
// each operation carries, so every operation must carry only the recipe being
// changed. Sending the collection's full list on a remove would empty it.
const require = createRequire(new URL('../anylist-js/lib/index.js', import.meta.url));
const protobuf = require('protobufjs');
const definitions = require('./definitions.json');
const pb = protobuf.newBuilder({}).import(definitions).build('pcov.proto');

function decodeSentOperations(form) {
  const body = form.getBuffer();
  const start = body.indexOf('\r\n\r\n') + 4;
  const end = body.lastIndexOf(Buffer.from(`\r\n--${form.getBoundary()}--`));
  return pb.PBRecipeOperationList.decode(body.subarray(start, end)).operations;
}

describe('AnyListClient collection membership operations', () => {
  let client;
  let posts;

  beforeEach(() => {
    posts = [];
    client = new AnyListClient();
    client.client = {
      protobuf: pb,
      uid: 'user-1',
      client: { post: async (path, { body }) => { posts.push({ path, body }); } },
      _getUserData: async () => ({
        recipeDataResponse: {
          recipeDataId: 'data-1',
          recipes: [
            { identifier: 'r-pasta', name: 'Pasta' },
            { identifier: 'r-salad', name: 'Salad' },
            { identifier: 'r-soup', name: 'Soup' },
          ],
          recipeCollections: [
            { identifier: 'c-1', name: 'Weeknight', timestamp: 1, recipeIds: ['r-pasta', 'r-soup'] },
          ],
        },
      }),
    };
  });

  it('adds with one operation per recipe, each carrying only that recipe', async () => {
    const result = await client.addRecipesToCollection('weeknight', ['Salad', 'Pasta', 'Missing']);
    assert.deepEqual(result, { name: 'Weeknight', changed: ['Salad'], unchanged: ['Pasta'], notFound: ['Missing'] });
    assert.equal(posts.length, 1);
    assert.equal(posts[0].path, 'data/user-recipe-data/update');
    const ops = decodeSentOperations(posts[0].body);
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
    const ops = decodeSentOperations(posts[0].body);
    assert.deepEqual(ops.map(op => op.metadata.handlerId), ['remove-recipes-from-collection', 'remove-recipes-from-collection']);
    assert.deepEqual(ops.map(op => op.recipeCollection.recipeIds), [['r-pasta'], ['r-soup']]);
    assert.notEqual(ops[0].metadata.operationId, ops[1].metadata.operationId);
  });

  it('sends nothing when no recipe changes', async () => {
    const result = await client.addRecipesToCollection('Weeknight', ['Pasta', 'pasta']);
    assert.deepEqual(result.unchanged, ['Pasta', 'Pasta']);
    assert.equal(posts.length, 0);
  });

  it('throws when the collection does not exist', async () => {
    await assert.rejects(() => client.removeRecipesFromCollection('Nope', ['Pasta']), /Recipe collection "Nope" not found/);
    assert.equal(posts.length, 0);
  });
});
