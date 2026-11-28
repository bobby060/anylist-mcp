import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../../src/tools/categories.js';
import { MockAnyListClient, createMockServer } from './helpers.js';

function seedGroups(client) {
  client._categoryGroups = [{
    identifier: 'g-1',
    name: 'Aisles',
    categories: [
      { identifier: 'c-1', name: 'Produce', sortIndex: 1, isSystem: true },
      { identifier: 'c-2', name: ' Bakery ', sortIndex: 0, isSystem: false },
    ],
  }];
}

describe('categories tool', () => {
  let client;
  let handlers;

  beforeEach(() => {
    client = new MockAnyListClient();
    client.defaultListName = 'Test List';
    const { server, handlers: h } = createMockServer();
    register(server, () => Promise.resolve(client));
    handlers = h;
  });

  describe('list_categories', () => {
    it('lists groups and categories, sorted, with system tags', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'list_categories' });
      const text = result.content[0].text;
      assert.ok(!result.isError);
      assert.ok(text.includes('2 across 1 group'));
      assert.ok(text.indexOf('Bakery') < text.indexOf('Produce'), 'sorted by sortIndex');
      assert.ok(text.includes('Produce (system)'));
    });

    it('reports a list with no category groups', async () => {
      const result = await handlers.categories({ action: 'list_categories' });
      assert.ok(result.content[0].text.includes('has no category groups'));
    });
  });

  describe('create_category', () => {
    it('creates a category in the first group', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'create_category', name: 'Frozen' });
      assert.ok(result.content[0].text.includes('Created category "Frozen"'));
      assert.equal(client._categoryGroups[0].categories.length, 3);
    });

    it('errors when the named group does not exist', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'create_category', name: 'Frozen', group_name: 'Nope' });
      assert.ok(result.isError);
      assert.ok(result.content[0].text.includes('Category group "Nope" not found'));
    });

    it('errors when the list has no groups', async () => {
      const result = await handlers.categories({ action: 'create_category', name: 'Frozen' });
      assert.ok(result.isError);
      assert.ok(result.content[0].text.includes('has no category groups'));
    });

    it('errors without a name when elicitation is unavailable', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'create_category' });
      assert.ok(result.isError);
    });
  });

  describe('rename_category', () => {
    it('renames using a whitespace- and case-tolerant match', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'rename_category', name: 'bakery', new_name: 'Bread' });
      assert.ok(result.content[0].text.includes('Renamed category "bakery" to "Bread"'));
      assert.equal(client._categoryGroups[0].categories[1].name, 'Bread');
    });

    it('errors when the category does not exist', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'rename_category', name: 'Nope', new_name: 'X' });
      assert.ok(result.isError);
      assert.ok(result.content[0].text.includes('Category "Nope" not found'));
    });
  });

  describe('delete_category', () => {
    it('deletes with confirm:true', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'delete_category', name: 'Bakery', confirm: true });
      assert.ok(!result.isError);
      assert.equal(client._categoryGroups[0].categories.length, 1);
    });

    it('asks for confirm:true when the client cannot prompt', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'delete_category', name: 'Bakery' });
      assert.ok(result.isError);
      assert.ok(result.content[0].text.includes('confirm:true'));
      assert.equal(client._categoryGroups[0].categories.length, 2, 'nothing deleted');
    });

    it('reports failure when AnyList silently drops the delete', async () => {
      seedGroups(client);
      client._categoryDeleteIsDropped = true;
      const result = await handlers.categories({ action: 'delete_category', name: 'Bakery', confirm: true });
      assert.ok(result.isError);
      assert.ok(result.content[0].text.includes('still present'));
    });

    it('errors when the category does not exist', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'delete_category', name: 'Nope', confirm: true });
      assert.ok(result.isError);
      assert.ok(result.content[0].text.includes('Category "Nope" not found'));
    });
  });

  describe('set_item_category', () => {
    it('moves an item into a category', async () => {
      seedGroups(client);
      client._items.push({ name: 'Bagels' });
      const result = await handlers.categories({ action: 'set_item_category', item_name: 'Bagels', category_name: 'Bakery' });
      assert.ok(result.content[0].text.includes('Assigned "Bagels" to category "Bakery"'));
      assert.equal(client._items[0].customCategory, ' Bakery ');
    });

    it('errors when the item does not exist', async () => {
      seedGroups(client);
      const result = await handlers.categories({ action: 'set_item_category', item_name: 'Nope', category_name: 'Bakery' });
      assert.ok(result.isError);
      assert.ok(result.content[0].text.includes('Item "Nope" not found'));
    });

    it('errors when the category does not exist', async () => {
      seedGroups(client);
      client._items.push({ name: 'Bagels' });
      const result = await handlers.categories({ action: 'set_item_category', item_name: 'Bagels', category_name: 'Nope' });
      assert.ok(result.isError);
      assert.ok(result.content[0].text.includes('Category "Nope" not found'));
    });
  });
});
