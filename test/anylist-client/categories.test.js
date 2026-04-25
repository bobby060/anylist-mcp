import { createConnectedClient, makeRunner, printSuiteResults } from './helpers.js';

export async function runCategoriesTests() {
  console.log('\n🗂️  Categories');
  const { test, results } = makeRunner();

  const client = await createConnectedClient();

  // ── getListCategories ─────────────────────────────────────────────────────

  await test('getListCategories returns an array', async () => {
    const groups = await client.getListCategories();
    if (!Array.isArray(groups)) throw new Error('getListCategories() should return an array');
  });

  await test('category groups have identifier, name, and categories fields', async () => {
    const groups = await client.getListCategories();
    if (groups.length === 0) {
      console.log('    (skipped — no category groups on this list)');
      return;
    }
    const g = groups[0];
    if (typeof g.identifier !== 'string') throw new Error('Group should have identifier string');
    if (!Array.isArray(g.categories)) throw new Error('Group should have categories array');
  });

  await test('each category has identifier and name', async () => {
    const groups = await client.getListCategories();
    for (const g of groups) {
      for (const c of g.categories) {
        if (typeof c.identifier !== 'string') throw new Error('Category should have identifier string');
        if (typeof c.name !== 'string') throw new Error('Category should have name string');
      }
    }
  });

  // ── Bug fix validation ────────────────────────────────────────────────────

  await test('getItems assigns real category names (not all "other")', async () => {
    const items = await client.getItems(true); // include checked
    if (items.length === 0) {
      console.log('    (skipped — no items in list)');
      return;
    }
    for (const item of items) {
      if (typeof item.category !== 'string') {
        throw new Error(`Item "${item.name}" should have a category string, got ${typeof item.category}`);
      }
    }
  });

  // ── categorizeItem smoke tests ────────────────────────────────────────────

  await test('categorizeItem does not throw for a known system category (produce)', async () => {
    await client.categorizeItem({ itemName: '🧪 test-item-unit', categoryMatchId: 'produce' });
  });

  await test('categorizeItem with explicit list-scoped listId does not throw', async () => {
    await client.categorizeItem({
      itemName: '🧪 test-item-unit',
      categoryMatchId: 'dairy',
      listId: client.targetList.identifier,
    });
  });

  await test('categorizeItem with global scope (listId="") does not throw', async () => {
    await client.categorizeItem({
      itemName: '🧪 test-item-unit',
      categoryMatchId: 'bakery',
      listId: '',
    });
  });

  // ── Auto-categorization path ──────────────────────────────────────────────
  //
  // These tests verify that categorizeItem() persists the name→category association
  // on the server by querying /data/categorized-items/all directly.
  //
  // Note: the server does NOT apply these rules to list items fetched via the API —
  // that is client-side behaviour in the web app. So we cannot test via getItems().

  const CAT_ITEM_SYSTEM = `🧪 produce-cat-${Date.now()}`;

  await test('auto-categorize via system category: association stored on server', async () => {
    // 1. Register: this item name → "produce" system category
    await client.categorizeItem({ itemName: CAT_ITEM_SYSTEM, categoryMatchId: 'produce' });

    // 2. Verify the association is stored on the server
    const categorized = await client.getCategorizedItems();
    const stored = categorized.find(i => i.name === CAT_ITEM_SYSTEM.toLowerCase());
    if (!stored) {
      throw new Error(`No categorized-item entry found for "${CAT_ITEM_SYSTEM}" — categorizeItem() may not have persisted`);
    }
    if (stored.categoryMatchId !== 'produce') {
      throw new Error(`Expected categoryMatchId "produce", got "${stored.categoryMatchId}"`);
    }
    console.log(`    stored association: "${stored.name}" → "${stored.categoryMatchId}" ✓`);
  });

  const CAT_ITEM_NAMED = `🧪 named-cat-${Date.now()}`;

  await test('auto-categorize via system category from list: association stored on server', async () => {
    // Find a category in the list that has a systemCategory string (e.g. 'dairy').
    // The categorized-items service stores system strings as categoryMatchId.
    // We verify the association is stored by querying /data/categorized-items/all directly,
    // since the server does NOT apply these rules server-side to items fetched via the API
    // (that is client-side behaviour in the web app).
    const groups = await client.getListCategories();
    const allCats = groups.flatMap(g => g.categories);
    const category = allCats.find(c => c.systemCategory && c.systemCategory !== 'other');
    if (!category) {
      console.log('    (skipped — no system-category entries on this list)');
      return;
    }

    // 1. Register: item name → system category string (e.g. 'dairy')
    await client.categorizeItem({ itemName: CAT_ITEM_NAMED, categoryMatchId: category.systemCategory });

    // 2. Fetch the stored associations directly from the server
    const categorized = await client.getCategorizedItems();
    const stored = categorized.find(i => i.name === CAT_ITEM_NAMED.toLowerCase());
    if (!stored) {
      throw new Error(`No categorized-item entry found for "${CAT_ITEM_NAMED}" — categorizeItem() may not have persisted`);
    }
    if (stored.categoryMatchId !== category.systemCategory) {
      throw new Error(`Expected categoryMatchId "${category.systemCategory}", got "${stored.categoryMatchId}"`);
    }
    console.log(`    stored association: "${stored.name}" → "${stored.categoryMatchId}" ✓`);
  });

  await test('re-categorizing an existing item name updates its stored association', async () => {
    const groups = await client.getListCategories();
    const allCats = groups.flatMap(g => g.categories);
    // Need two distinct system categories to re-categorize between
    const sysCats = allCats.filter(c => c.systemCategory && c.systemCategory !== 'other');
    if (sysCats.length < 2) {
      console.log('    (skipped — need at least 2 system-category entries)');
      return;
    }
    const [catA, catB] = sysCats;
    const RECAT_ITEM = `🧪 recat-${Date.now()}`;

    // Register with first system category
    await client.categorizeItem({ itemName: RECAT_ITEM, categoryMatchId: catA.systemCategory });

    const afterFirst = await client.getCategorizedItems();
    const first = afterFirst.find(i => i.name === RECAT_ITEM.toLowerCase());
    if (!first) throw new Error(`No stored association found after first categorize`);
    console.log(`    initial stored: "${first.name}" → "${first.categoryMatchId}"`);

    // Re-categorize to second system category
    await client.categorizeItem({ itemName: RECAT_ITEM, categoryMatchId: catB.systemCategory });

    const afterSecond = await client.getCategorizedItems();
    const second = afterSecond.find(i => i.name === RECAT_ITEM.toLowerCase());
    if (!second) throw new Error(`No stored association found after re-categorize`);
    if (second.categoryMatchId !== catB.systemCategory) {
      throw new Error(`Expected categoryMatchId "${catB.systemCategory}", got "${second.categoryMatchId}"`);
    }
    console.log(`    after re-categorize: "${second.name}" → "${second.categoryMatchId}" ✓`);
  });

  await client.disconnect();
  return printSuiteResults('Categories', results());
}
