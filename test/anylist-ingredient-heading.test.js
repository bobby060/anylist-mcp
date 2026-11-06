import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Guards the patches/anylist+0.8.5.patch fix: without it, the library drops
// isHeading and identifier, so saving a recipe turns headings into ingredients.
const require = createRequire(import.meta.url);
const protobuf = require('protobufjs');
const definitions = require('anylist/lib/definitions.json');
const Ingredient = require('anylist/lib/ingredient.js');

describe('anylist Ingredient', () => {
  const pb = protobuf.newBuilder({}).import(definitions).build('pcov.proto');

  it('round-trips isHeading and identifier through toJSON and _encode', () => {
    const ing = new Ingredient({ name: 'Sauce', rawIngredient: 'Sauce', isHeading: true, identifier: 'abc' }, { protobuf: pb });
    assert.equal(ing.isHeading, true);
    assert.equal(ing.toJSON().isHeading, true);
    assert.equal(ing.toJSON().identifier, 'abc');
    const decoded = pb.PBIngredient.decode(ing._encode().encode());
    assert.equal(decoded.isHeading, true);
    assert.equal(decoded.identifier, 'abc');
  });
});
