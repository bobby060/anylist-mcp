import { createConnectedClient } from './helpers.js';
import { runShoppingListsTests } from './shopping-lists.test.js';
import { runShoppingItemsTests } from './shopping-items.test.js';
import { runRecipesTests } from './recipes.test.js';
import { runCollectionsTests } from './collections.test.js';
import { runMealPlanTests } from './meal-plan.test.js';

console.log('🧪 AnyList Client Tests\n');

const suites = [
  runShoppingListsTests,
  runShoppingItemsTests,
  runRecipesTests,
  runCollectionsTests,
  runMealPlanTests,
];

// One shared connection for the whole run — each suite gets the same client
// instead of logging in and fetching the full account from scratch itself.
const client = await createConnectedClient();

let totalFailed = 0;
for (const suite of suites) {
  try {
    totalFailed += await suite(client);
  } catch (e) {
    console.error(`\n💥 Suite crashed: ${e.message}`);
    totalFailed++;
  }
}

await client.disconnect();

console.log(`\n${totalFailed === 0 ? '🎉 All suites passed!' : `💥 ${totalFailed} suite(s) had failures`}`);
process.exit(totalFailed > 0 ? 1 : 0);
