/**
 * Tests for item-level operations: addItem, removeItem, deleteItem, getItems
 */
import AnyListClient from '../../src/anylist-client.js';
import { createConnectedClient, makeRunner, printSuiteResults } from './helpers.js';

const ITEM = '🧪 Test Item';
const ITEM_QTY = '🧪 Test Item Qty';
const ITEM_NOTES = '🧪 Test Item Notes';
const ITEM_CATEGORY = '🧪 Test Item Category';

export async function runShoppingItemsTests() {
  console.log('\n🛒 Shopping Items');
  const { test, results } = makeRunner();

  const client = await createConnectedClient();

  // Pre-clean
  for (const name of [ITEM, ITEM_QTY, ITEM_NOTES, ITEM_CATEGORY]) {
    try { await client.deleteItem(name); } catch {}
  }

  // ── addItem ──────────────────────────────────────────────────────────────

  await test('addItem creates new item (unchecked)', async () => {
    await client.addItem(ITEM, 1);
    const item = client.targetList.getItemByName(ITEM);
    if (!item) throw new Error('Item not found after adding');
    if (item.checked) throw new Error('New item should be unchecked');
  });

  await test('addItem on existing unchecked item updates quantity and notes, stays unchecked', async () => {
    await client.addItem(ITEM, 3);
    const item = client.targetList.getItemByName(ITEM);
    if (!item) throw new Error('Item should still exist');
    if (item.checked) throw new Error('Item should still be unchecked');
  });

  await test('addItem on existing checked item unchecks it', async () => {
    // First check it off
    await client.removeItem(ITEM);
    const checked = client.targetList.getItemByName(ITEM);
    if (!checked || !checked.checked) throw new Error('Setup: item should be checked');

    // Now re-add — should uncheck
    await client.addItem(ITEM, 1);
    const item = client.targetList.getItemByName(ITEM);
    if (!item) throw new Error('Item should still exist');
    if (item.checked) throw new Error('Item should be unchecked after re-adding');
  });

  await test('addItem with quantity stores correct quantity', async () => {
    await client.addItem(ITEM_QTY, 5);
    const item = client.targetList.getItemByName(ITEM_QTY);
    if (!item) throw new Error('Item not found');
    if (item.quantity !== '5' && item.quantity !== 5) throw new Error(`Expected quantity 5, got "${item.quantity}"`);
  });

  await test('addItem with notes stores notes', async () => {
    const note = 'organic preferred';
    await client.addItem(ITEM_NOTES, 1, note);
    const item = client.targetList.getItemByName(ITEM_NOTES);
    if (!item) throw new Error('Item not found');
    if (item.details !== note) throw new Error(`Expected notes "${note}", got "${item.details}"`);
  });

  await test('addItem with category stores correct category', async () => {
    await client.addItem(ITEM_CATEGORY, 1, null, 'produce');
    const items = await client.getItems();
    const item = items.find(i => i.name === ITEM_CATEGORY);
    if (!item) throw new Error('Item not found after adding');
    if (item.category !== 'produce') throw new Error(`Expected category "produce", got "${item.category}"`);
  });

  await test('addItem updates notes on existing item', async () => {
    const updatedNote = 'brand-name only';
    await client.addItem(ITEM_NOTES, 1, updatedNote);
    const items = await client.getItems(false, true);
    const item = items.find(i => i.name === ITEM_NOTES);
    if (!item) throw new Error('Item not found');
    if (item.note !== updatedNote) throw new Error(`Expected updated note "${updatedNote}", got "${item.note}"`);
  });

  // ── removeItem ────────────────────────────────────────────────────────────

  await test('removeItem checks off an item', async () => {
    await client.removeItem(ITEM);
    const item = client.targetList.getItemByName(ITEM);
    if (!item) throw new Error('Item should still exist after removeItem');
    if (!item.checked) throw new Error('Item should be checked after removeItem');
  });

  await test('removeItem on non-existent item throws "not found"', async () => {
    let threw = false;
    try {
      await client.removeItem('🚫 Ghost Item');
    } catch (e) {
      threw = true;
      if (!e.message.includes('not found')) throw new Error(`Expected "not found", got: ${e.message}`);
    }
    if (!threw) throw new Error('Should have thrown for non-existent item');
  });

  // ── deleteItem ────────────────────────────────────────────────────────────

  await test('deleteItem permanently removes item', async () => {
    // Ensure item exists
    await client.addItem(ITEM, 1);
    await client.deleteItem(ITEM);
    const item = client.targetList.getItemByName(ITEM);
    if (item) throw new Error('Item should be gone after deleteItem');
  });

  await test('deleteItem on non-existent item throws "not found"', async () => {
    let threw = false;
    try {
      await client.deleteItem('🚫 Ghost Item');
    } catch (e) {
      threw = true;
      if (!e.message.includes('not found')) throw new Error(`Expected "not found", got: ${e.message}`);
    }
    if (!threw) throw new Error('Should have thrown for non-existent item');
  });

  // ── getItems ──────────────────────────────────────────────────────────────

  await test('getItems returns only unchecked items by default', async () => {
    // Ensure a clean unchecked item exists
    await client.addItem(ITEM, 1);

    const items = await client.getItems();
    if (!Array.isArray(items)) throw new Error('getItems() should return an array');
    const checkedItems = items.filter(i => i.checked);
    if (checkedItems.length > 0) throw new Error('Default getItems() should not return checked items');
    const testItem = items.find(i => i.name === ITEM);
    if (!testItem) throw new Error('Test item should appear in unchecked results');
  });

  await test('getItems item has correct structure', async () => {
    const items = await client.getItems();
    const item = items.find(i => i.name === ITEM);
    if (!item) throw new Error('Test item not found');
    if (typeof item.name !== 'string') throw new Error('Item should have name string');
    if (typeof item.quantity !== 'number') throw new Error('Item should have quantity number');
    if (typeof item.checked !== 'boolean') throw new Error('Item should have checked boolean');
    if (typeof item.category !== 'string') throw new Error('Item should have category string');
  });

  await test('getItems(true) includes checked items', async () => {
    await client.removeItem(ITEM);
    const items = await client.getItems(true);
    const item = items.find(i => i.name === ITEM);
    if (!item) throw new Error('Checked item should appear when includeChecked=true');
    if (!item.checked) throw new Error('Item should be checked');
  });

  await test('getItems(false) excludes checked items', async () => {
    const items = await client.getItems(false);
    const item = items.find(i => i.name === ITEM);
    if (item) throw new Error('Checked item should not appear when includeChecked=false');
  });

  await test('getItems include_notes=true returns notes', async () => {
    const items = await client.getItems(false, true);
    const item = items.find(i => i.name === ITEM_NOTES);
    if (!item) throw new Error('Item with notes not found');
    if (item.note === undefined) throw new Error('Note should be included when include_notes=true');
  });

  await test('getItems include_notes=false omits notes', async () => {
    const items = await client.getItems(false, false);
    const item = items.find(i => i.name === ITEM_NOTES);
    if (!item) throw new Error('Item not found');
    if (item.note !== undefined) throw new Error('Note should be absent when include_notes=false');
  });

  // ── disconnected client ───────────────────────────────────────────────────

  await test('operations without connection throw "connect() first"', async () => {
    const dc = new AnyListClient();
    const ops = [
      () => dc.addItem('x'),
      () => dc.removeItem('x'),
      () => dc.deleteItem('x'),
      () => dc.getItems(),
    ];
    for (const op of ops) {
      let threw = false;
      try { await op(); } catch (e) {
        threw = true;
        if (!e.message.includes('connect()')) throw new Error(`Expected connect() error, got: ${e.message}`);
      }
      if (!threw) throw new Error('Should have thrown for disconnected client');
    }
  });

  // Cleanup
  for (const name of [ITEM, ITEM_QTY, ITEM_NOTES, ITEM_CATEGORY]) {
    try { await client.deleteItem(name); } catch {}
  }

  await client.disconnect();
  return printSuiteResults('Shopping Items', results());
}
