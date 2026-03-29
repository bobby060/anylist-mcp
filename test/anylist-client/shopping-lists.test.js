/**
 * Tests for list-level operations: connect, getLists, getFavoriteItems, getRecentItems
 */
import { createConnectedClient, makeRunner, printSuiteResults } from './helpers.js';

export async function runShoppingListsTests() {
  console.log('\n📋 Shopping Lists');
  const { test, results } = makeRunner();

  const client = await createConnectedClient();

  await test('getLists returns array with name and uncheckedCount', async () => {
    const lists = client.getLists();
    if (!Array.isArray(lists)) throw new Error('getLists() should return an array');
    if (lists.length === 0) throw new Error('Expected at least one list');
    const list = lists[0];
    if (typeof list.name !== 'string') throw new Error('List should have a name string');
    if (typeof list.uncheckedCount !== 'number') throw new Error('List should have uncheckedCount number');
  });

  await test('getAvailableListNames returns array of strings', async () => {
    const names = client.getAvailableListNames();
    if (!Array.isArray(names)) throw new Error('getAvailableListNames() should return an array');
    if (names.length === 0) throw new Error('Expected at least one list name');
    if (!names.every(n => typeof n === 'string')) throw new Error('All list names should be strings');
  });

  await test('connect with explicit list name switches to that list', async () => {
    const listName = process.env.ANYLIST_LIST_NAME;
    const fresh = await createConnectedClient(listName);
    if (!fresh.targetList) throw new Error('Should have a targetList after connect');
    if (fresh.targetList.name !== listName) throw new Error(`Expected "${listName}", got "${fresh.targetList.name}"`);
    await fresh.disconnect();
  });

  await test('connect to same list is idempotent (reuses client)', async () => {
    const listName = process.env.ANYLIST_LIST_NAME;
    const fresh = await createConnectedClient(listName);
    const clientRef = fresh.client;
    await fresh.connect(listName);
    if (fresh.client !== clientRef) throw new Error('Should reuse existing client when reconnecting to same list');
    await fresh.disconnect();
  });

  await test('connect fails without credentials gracefully', async () => {
    const noEnv = new (await import('../../src/anylist-client.js')).default();
    const origUser = process.env.ANYLIST_USERNAME;
    delete process.env.ANYLIST_USERNAME;
    let threw = false;
    try {
      await noEnv.connect('some list');
    } catch (e) {
      threw = true;
      if (!e.message.includes('ANYLIST_USERNAME') && !e.message.includes('Missing')) {
        throw new Error(`Expected credentials error, got: ${e.message}`);
      }
    } finally {
      process.env.ANYLIST_USERNAME = origUser;
    }
    if (!threw) throw new Error('Should have thrown for missing credentials');
  });

  await test('getFavoriteItems returns array', async () => {
    const listName = process.env.ANYLIST_LIST_NAME;
    const items = await client.getFavoriteItems(listName);
    if (!Array.isArray(items)) throw new Error('getFavoriteItems() should return an array');
    if (items.length > 0) {
      const item = items[0];
      if (typeof item.name !== 'string') throw new Error('Favorite item should have a name string');
    }
  });

  await test('getRecentItems returns array', async () => {
    const listName = process.env.ANYLIST_LIST_NAME;
    const items = await client.getRecentItems(listName);
    if (!Array.isArray(items)) throw new Error('getRecentItems() should return an array');
    if (items.length > 0) {
      const item = items[0];
      if (typeof item.name !== 'string') throw new Error('Recent item should have a name string');
    }
  });

  await client.disconnect();
  return printSuiteResults('Shopping Lists', results());
}
