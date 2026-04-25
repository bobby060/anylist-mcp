/**
 * Debug script: understand how AnyList stores and looks up item categories.
 * Run: /usr/local/bin/node test/debug-categorize.js [item-name] [list-name]
 *
 * This script:
 * 1. Shows what categorized-items/all returns
 * 2. Shows categorizationRules from _userData for all lists
 * 3. Adds the item WITHOUT a category, then re-fetches the list to see
 *    if the server auto-assigned a category
 * 4. Cleans up the test item
 */
import dotenv from 'dotenv';
dotenv.config();

import AnyList from '../anylist-js/lib/index.js';
import Item from '../anylist-js/lib/item.js';

// Patch Item._encode to match our anylist-client patch
Item.prototype._encode = function() {
  return new this._protobuf.ListItem({
    identifier: this._identifier,
    listId: this._listId,
    name: this._name,
    details: this._details,
    checked: this._checked,
    category: this._category,
    userId: this._userId,
    categoryMatchId: this._categoryMatchId,
    manualSortIndex: this._manualSortIndex,
  });
};

const ITEM_NAME = process.argv[2] || 'Tomatoes';
const LIST_NAME = process.argv[3] || process.env.ANYLIST_LIST_NAME;

const username = process.env.ANYLIST_USERNAME;
const password = process.env.ANYLIST_PASSWORD;

async function main() {
  const al = new AnyList({ email: username, password });
  await al.login();
  await al.getLists();

  console.log('\n=== Available lists ===');
  al.lists.forEach(l => console.log(`  "${l.name}"  id=${l.identifier}`));

  // ── 1. getCategorizedItems() ──────────────────────────────────────────────
  console.log('\n=== getCategorizedItems() (data/categorized-items/all) ===');
  const categorized = await al.getCategorizedItems();
  console.log(`Total entries: ${categorized.length}`);
  const catMatch = categorized.filter(i => i.name && i.name.toLowerCase().includes(ITEM_NAME.toLowerCase()));
  if (catMatch.length > 0) {
    catMatch.forEach(i => console.log(`  name="${i.name}"  categoryMatchId="${i.categoryMatchId}"  listId="${i.listId}"`));
  } else {
    console.log(`  No match for "${ITEM_NAME}"`);
  }

  // ── 2. categorizationRules in _userData ───────────────────────────────────
  console.log('\n=== categorizationRules in _userData ===');
  const listResponses = (al._userData && al._userData.shoppingListsResponse && al._userData.shoppingListsResponse.listResponses) || [];
  for (const lr of listResponses) {
    const listObj = al.lists.find(l => l.identifier === lr.listId);
    const label = listObj ? listObj.name : lr.listId;
    const rules = lr.categorizationRules || [];
    const matches = rules.filter(r => r.itemName && r.itemName.toLowerCase().includes(ITEM_NAME.toLowerCase()));
    if (matches.length > 0) {
      console.log(`  List "${label}": matched rule for "${ITEM_NAME}":`);
      matches.forEach(r => console.log(`    itemName="${r.itemName}"  categoryId="${r.categoryId}"`));
    } else {
      console.log(`  List "${label}": ${rules.length} rules, none for "${ITEM_NAME}"`);
      // Print ALL rules so we can see everything
      rules.forEach(r => console.log(`    "${r.itemName}"→"${r.categoryId}"`));
    }
  }

  // ── 3. Show ALL existing items (including checked-off) matching item name ──
  console.log(`\n=== ALL items named "${ITEM_NAME}" on all lists (including checked) ===`);
  for (const list of al.lists) {
    const matches = (list.items || []).filter(i => i.name && i.name.toLowerCase() === ITEM_NAME.toLowerCase());
    if (matches.length > 0) {
      console.log(`  List "${list.name}":`);
      matches.forEach(i => console.log(`    id=${i.identifier}  checked=${i.checked}  categoryMatchId="${i.categoryMatchId}"`));
    }
  }

  // ── 4. Test adding with different categoryMatchId values ──────────────────
  const targetList = LIST_NAME ? al.getListByName(LIST_NAME) : al.lists[0];
  if (!targetList) { console.error('No target list found'); process.exit(1); }

  async function testAdd(label, categoryMatchIdOverride) {
    console.log(`\n=== ${label} ===`);
    const existing = targetList.getItemByName(ITEM_NAME);
    if (existing) { await targetList.removeItem(existing); }

    const item = al.createItem({ name: ITEM_NAME });
    // Override the categoryMatchId directly on the internal field
    item._categoryMatchId = categoryMatchIdOverride;
    console.log(`  Sending categoryMatchId=${JSON.stringify(item._categoryMatchId)}`);
    await targetList.addItem(item);

    await al.getLists(true);
    const fresh = al.getListByName(targetList.name);
    // Reset local reference for next test
    targetList.items = fresh ? fresh.items : targetList.items;
    const found = fresh ? fresh.getItemByName(ITEM_NAME) : null;
    if (found) {
      console.log(`  Server stored:  categoryMatchId="${found.categoryMatchId}"`);
    } else {
      console.log(`  Item not found after re-fetch`);
    }
    return found;
  }

  let last;
  last = await testAdd(`Adding to "${targetList.name}" with categoryMatchId=null (no category)`, null);
  last = await testAdd(`Adding to "${targetList.name}" with categoryMatchId="" (empty string)`, '');
  last = await testAdd(`Adding to "${targetList.name}" with categoryMatchId="other" (explicit)`, 'other');

  // ── 4. Clean up ──────────────────────────────────────────────────────────
  await al.getLists(true);
  const cleanupList = al.getListByName(targetList.name);
  const cleanupItem = cleanupList && cleanupList.getItemByName(ITEM_NAME);
  if (cleanupItem) {
    await cleanupList.removeItem(cleanupItem);
    console.log(`\nCleaned up: checked off "${ITEM_NAME}"`);
  }

  await al.teardown();
}

main().catch(e => { console.error('Error:', e.message, e.stack); process.exit(1); });
