import dotenv from 'dotenv';
dotenv.config();
import AnyList from '../anylist-js/lib/index.js';

const al = new AnyList({ email: process.env.ANYLIST_USERNAME, password: process.env.ANYLIST_PASSWORD });
await al.login();
await al.getLists();

const ud = al._userData;
const listResponses = ud.shoppingListsResponse?.listResponses || [];

console.log(`Lists with categorizationRules:`);
for (const lr of listResponses) {
  const rules = lr.categorizationRules || [];
  const listName = al.lists.find(l => l.identifier === lr.listId)?.name || lr.listId;
  if (rules.length > 0) {
    console.log(`\n  List "${listName}" (${rules.length} rules):`);
    const breadRules = rules.filter(r => r.itemName?.toLowerCase().includes('bread'));
    if (breadRules.length > 0) {
      breadRules.forEach(r => console.log(`    itemName="${r.itemName}" categoryId="${r.categoryId}"`));
    } else {
      console.log(`    (no bread rules)`);
      // Print all rules
      rules.slice(0, 5).forEach(r => console.log(`    "${r.itemName}"→"${r.categoryId}"`));
      if (rules.length > 5) console.log(`    ... and ${rules.length - 5} more`);
    }
  }
}

// Also check items on the list for bread
for (const list of al.lists) {
  const items = list.items || [];
  const breadItems = items.filter(i => i.name?.toLowerCase().includes('bread'));
  if (breadItems.length > 0) {
    console.log(`\nList "${list.name}" has bread items:`);
    breadItems.forEach(i => console.log(`  name="${i.name}" categoryMatchId="${i.categoryMatchId}" category="${i._category}"`));
  }
}

await al.teardown();
