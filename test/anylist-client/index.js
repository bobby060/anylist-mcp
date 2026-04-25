import { runShoppingListsTests } from './shopping-lists.test.js';
import { runShoppingItemsTests } from './shopping-items.test.js';
import { runRecipesTests } from './recipes.test.js';
import { runCollectionsTests } from './collections.test.js';
import { runMealPlanTests } from './meal-plan.test.js';
import { runCategoriesTests } from './categories.test.js';

console.log('🧪 AnyList Client Tests\n');

const suites = [
  runShoppingListsTests,
  runShoppingItemsTests,
  runRecipesTests,
  runCollectionsTests,
  runMealPlanTests,
  runCategoriesTests,
];

let totalFailed = 0;
for (const suite of suites) {
  try {
    totalFailed += await suite();
  } catch (e) {
    console.error(`\n💥 Suite crashed: ${e.message}`);
    totalFailed++;
  }
}

console.log(`\n${totalFailed === 0 ? '🎉 All suites passed!' : `💥 ${totalFailed} suite(s) had failures`}`);
process.exit(totalFailed > 0 ? 1 : 0);
