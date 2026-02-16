import AnyListClient from './src/anylist-client.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const TEST_ITEM_NAME = "🧪 Unit Test Item";

async function runAnyListClientUnitTests() {
  console.log("🧪 Running AnyList Client Unit Tests...");
  
  const client = new AnyListClient();
  let testsPassed = 0;
  let testsFailed = 0;

  // Helper function to run a test
  async function runTest(testName, testFn) {
    try {
      console.log(`\n🔍 Test: ${testName}`);
      await testFn();
      console.log(`✅ PASSED: ${testName}`);
      testsPassed++;
    } catch (error) {
      console.error(`❌ FAILED: ${testName} - ${error.message}`);
      testsFailed++;
    }
  }

  // Setup: Connect to AnyList
  try {
    console.log("🔌 Setting up connection to AnyList...");
    await client.connect();
    console.log("✅ Connected to AnyList successfully");
  } catch (error) {
    console.error("❌ Failed to connect to AnyList:", error.message);
    console.error("🛑 Cannot run unit tests without AnyList connection");
    process.exit(1);
  }

  // Test 1: Add new item (item doesn't exist)
  await runTest("Add new item", async () => {
    // Ensure test item doesn't exist by trying to delete it first
    try {
      await client.deleteItem(TEST_ITEM_NAME);
    } catch (error) {
      // Expected if item doesn't exist
    }

    // Add the item - should not return anything on success
    await client.addItem(TEST_ITEM_NAME, 2);
    
    // Verify item exists and is unchecked
    const item = client.targetList.getItemByName(TEST_ITEM_NAME);
    if (!item) {
      throw new Error("Item not found after adding");
    }
    if (item.checked) {
      throw new Error("New item should be unchecked");
    }
  });

  // Test 2: Add existing unchecked item (should be no-op)
  await runTest("Add existing unchecked item", async () => {
    // Should not return anything on success
    await client.addItem(TEST_ITEM_NAME, 3);

    // Verify item is still unchecked
    const item = client.targetList.getItemByName(TEST_ITEM_NAME);
    if (!item) {
      throw new Error("Item should still exist");
    }
    if (item.checked) {
      throw new Error("Item should still be unchecked");
    }
  });

  // Test 3: Check item off (removeItem)
  await runTest("Check item off", async () => {
    // Should not return anything on success
    await client.removeItem(TEST_ITEM_NAME);

    // Verify item exists and is checked
    const item = client.targetList.getItemByName(TEST_ITEM_NAME);
    if (!item) {
      throw new Error("Item should still exist after checking off");
    }
    if (!item.checked) {
      throw new Error("Item should be checked after removeItem");
    }
  });

  // Test 4: Add existing checked item (should uncheck it)
  await runTest("Add existing checked item (uncheck)", async () => {
    // Should not return anything on success
    await client.addItem(TEST_ITEM_NAME, 1);

    // Verify item exists and is unchecked
    const item = client.targetList.getItemByName(TEST_ITEM_NAME);
    if (!item) {
      throw new Error("Item should still exist");
    }
    if (item.checked) {
      throw new Error("Item should be unchecked after adding existing checked item");
    }
  });

  // Test 5: Remove non-existent item (should fail)
  await runTest("Remove non-existent item", async () => {
    const nonExistentItem = "🚫 Non-existent Item";
    
    // Ensure item doesn't exist
    try {
      await client.deleteItem(nonExistentItem);
    } catch (error) {
      // Expected if item doesn't exist
    }

    // Try to remove non-existent item
    let errorThrown = false;
    try {
      await client.removeItem(nonExistentItem);
    } catch (error) {
      errorThrown = true;
      if (!error.message.includes("not found")) {
        throw new Error(`Expected 'not found' error, got: ${error.message}`);
      }
    }

    if (!errorThrown) {
      throw new Error("Should have thrown error for non-existent item");
    }
  });

  // Test 7: Delete non-existent item (should fail)
  await runTest("Delete non-existent item", async () => {
    const nonExistentItem = "🚫 Non-existent Item";

    let errorThrown = false;
    try {
      await client.deleteItem(nonExistentItem);
    } catch (error) {
      errorThrown = true;
      if (!error.message.includes("not found")) {
        throw new Error(`Expected 'not found' error, got: ${error.message}`);
      }
    }

    if (!errorThrown) {
      throw new Error("Should have thrown error for non-existent item");
    }
  });

  // Test 8: Operations without connection (should fail)
  await runTest("Operations without connection", async () => {
    const disconnectedClient = new AnyListClient();

    const operations = [
      () => disconnectedClient.addItem("test"),
      () => disconnectedClient.removeItem("test"),
      () => disconnectedClient.deleteItem("test"),
      () => disconnectedClient.getItems()
    ];

    for (const operation of operations) {
      let errorThrown = false;
      try {
        await operation();
      } catch (error) {
        errorThrown = true;
        if (!error.message.includes("Call connect() first")) {
          throw new Error(`Expected 'connect first' error, got: ${error.message}`);
        }
      }

      if (!errorThrown) {
        throw new Error("Should have thrown error for operation without connection");
      }
    }
  });

  // Test 9: Get items (unchecked only)
  await runTest("Get items (unchecked only)", async () => {
    // Ensure test item exists and is unchecked
    await client.addItem(TEST_ITEM_NAME, 1);

    const items = await client.getItems(false);

    if (!Array.isArray(items)) {
      throw new Error("getItems should return an array");
    }

    // Verify our test item is in the list
    const testItem = items.find(item => item.name === TEST_ITEM_NAME);
    if (!testItem) {
      throw new Error("Test item should be in unchecked items list");
    }

    // Verify item structure
    if (typeof testItem.name !== 'string') {
      throw new Error("Item should have a name string");
    }
    if (typeof testItem.quantity !== 'number') {
      throw new Error("Item should have a quantity number");
    }
    if (typeof testItem.checked !== 'boolean') {
      throw new Error("Item should have a checked boolean");
    }
    if (typeof testItem.category !== 'string') {
      throw new Error("Item should have a category string");
    }

    // Verify no checked items are returned
    const checkedItems = items.filter(item => item.checked);
    if (checkedItems.length > 0) {
      throw new Error("getItems(false) should not return checked items");
    }
  });

  // Test 10: Get items (including checked)
  await runTest("Get items (including checked)", async () => {
    // Check off the test item
    await client.removeItem(TEST_ITEM_NAME);

    const items = await client.getItems(true);

    if (!Array.isArray(items)) {
      throw new Error("getItems should return an array");
    }

    // Verify our checked test item is in the list
    const testItem = items.find(item => item.name === TEST_ITEM_NAME);
    if (!testItem) {
      throw new Error("Test item should be in items list when including checked");
    }
    if (!testItem.checked) {
      throw new Error("Test item should be checked");
    }
  });

  // Test 11: Get items excludes checked by default
  await runTest("Get items excludes checked by default", async () => {
    // Test item should still be checked from previous test
    const items = await client.getItems();

    // Verify our checked test item is NOT in the list
    const testItem = items.find(item => item.name === TEST_ITEM_NAME);
    if (testItem) {
      throw new Error("Checked test item should not be in default getItems() result");
    }
  });

  // Test 12: Add new item with quantity > 1
  const TEST_ITEM_WITH_QUANTITY = "🧪 Unit Test Item With Quantity";

  await runTest("Add new item with quantity", async () => {
    // Ensure test item doesn't exist by trying to delete it first
    try {
      await client.deleteItem(TEST_ITEM_WITH_QUANTITY);
    } catch (error) {
      // Expected if item doesn't exist
    }

    // Add item with quantity of 5
    await client.addItem(TEST_ITEM_WITH_QUANTITY, 5);

    // Verify item exists with correct quantity
    const item = client.targetList.getItemByName(TEST_ITEM_WITH_QUANTITY);
    if (!item) {
      throw new Error("Item not found after adding");
    }
    // Quantity is stored as string in the library
    if (item.quantity !== '5' && item.quantity !== 5) {
      throw new Error(`Expected quantity 5, got "${item.quantity}"`);
    }
  });

  // Test 13: Add new item with notes
  const TEST_ITEM_WITH_NOTES = "🧪 Unit Test Item With Notes";
  const TEST_NOTES = "Test note content";

  await runTest("Add item with notes", async () => {
    // Ensure test item doesn't exist by trying to delete it first
    try {
      await client.deleteItem(TEST_ITEM_WITH_NOTES);
    } catch (error) {
      // Expected if item doesn't exist
    }

    // Add item with notes
    await client.addItem(TEST_ITEM_WITH_NOTES, 1, TEST_NOTES);

    // Verify item exists
    const item = client.targetList.getItemByName(TEST_ITEM_WITH_NOTES);
    if (!item) {
      throw new Error("Item not found after adding");
    }
    if (item.details !== TEST_NOTES) {
      throw new Error(`Expected notes "${TEST_NOTES}", got "${item.details}"`);
    }
  });

  // Test 14: Get items with include_notes=true returns notes
  await runTest("Get items with include_notes=true returns notes", async () => {
    const items = await client.getItems(false, true);

    const testItem = items.find(item => item.name === TEST_ITEM_WITH_NOTES);
    if (!testItem) {
      throw new Error("Test item with notes should be in items list");
    }
    if (testItem.note !== TEST_NOTES) {
      throw new Error(`Expected note "${TEST_NOTES}", got "${testItem.note}"`);
    }
  });

  // Test 15: Get items with include_notes=false does not include notes
  await runTest("Get items with include_notes=false does not include notes", async () => {
    const items = await client.getItems(false, false);

    const testItem = items.find(item => item.name === TEST_ITEM_WITH_NOTES);
    if (!testItem) {
      throw new Error("Test item should be in items list");
    }
    if (testItem.note !== undefined) {
      throw new Error("Item should not have note property when include_notes=false");
    }
  });

  // Test 16: Update existing item with notes
  await runTest("Update existing item with notes", async () => {
    const updatedNotes = "Updated test note";
    await client.addItem(TEST_ITEM_WITH_NOTES, 1, updatedNotes);

    const items = await client.getItems(false, true);
    const testItem = items.find(item => item.name === TEST_ITEM_WITH_NOTES);
    if (!testItem) {
      throw new Error("Test item should be in items list");
    }
    if (testItem.note !== updatedNotes) {
      throw new Error(`Expected updated note "${updatedNotes}", got "${testItem.note}"`);
    }
  });

  // Test 17: Connect with explicit list name
  await runTest("Connect with explicit list name", async () => {
    const listName = process.env.ANYLIST_LIST_NAME;
    const newClient = new AnyListClient();

    // Connect with explicit list name
    await newClient.connect(listName);

    if (!newClient.targetList) {
      throw new Error("Should have connected to a list");
    }
    if (newClient.targetList.name !== listName) {
      throw new Error(`Expected list "${listName}", got "${newClient.targetList.name}"`);
    }

    // Verify reconnecting to same list doesn't re-authenticate
    const clientRef = newClient.client;
    await newClient.connect(listName);
    if (newClient.client !== clientRef) {
      throw new Error("Should reuse existing client when reconnecting to same list");
    }

    await newClient.disconnect();
  });

  // ===== Recipe Tests =====

  const TEST_RECIPE_NAME = "🧪 Unit Test Recipe";

  // Test: Get recipes list
  await runTest("Get recipes list", async () => {
    const recipes = await client.getRecipes();

    if (!Array.isArray(recipes)) {
      throw new Error("getRecipes should return an array");
    }

    // Verify structure of first recipe if any exist
    if (recipes.length > 0) {
      const r = recipes[0];
      if (typeof r.identifier !== 'string') throw new Error("Recipe should have identifier string");
      if (typeof r.name !== 'string') throw new Error("Recipe should have name string");
      // cookTime/prepTime should be null or number (in minutes)
      if (r.cookTime !== null && typeof r.cookTime !== 'number') throw new Error("cookTime should be null or number");
      if (r.prepTime !== null && typeof r.prepTime !== 'number') throw new Error("prepTime should be null or number");
    }

    console.log(`    Found ${recipes.length} recipes`);
  });

  // Test: Add a recipe
  await runTest("Add a recipe", async () => {
    const result = await client.addRecipe({
      name: TEST_RECIPE_NAME,
      note: "Test recipe created by unit tests",
      servings: "2 servings",
      ingredients: [
        { rawIngredient: "1 cup test flour", name: "test flour", quantity: "1 cup" },
        { rawIngredient: "2 test eggs", name: "test eggs", quantity: "2" },
      ],
      preparationSteps: [
        "Mix test ingredients",
        "Bake at 350F for 30 minutes",
      ],
    });

    if (!result.identifier) throw new Error("addRecipe should return identifier");
    if (result.name !== TEST_RECIPE_NAME) throw new Error(`Expected name "${TEST_RECIPE_NAME}", got "${result.name}"`);
    console.log(`    Created recipe: ${result.identifier}`);
  });

  // Test: Get recipe by name
  await runTest("Get recipe by name", async () => {
    const recipe = await client.getRecipe(TEST_RECIPE_NAME);

    if (recipe.name !== TEST_RECIPE_NAME) throw new Error(`Expected name "${TEST_RECIPE_NAME}", got "${recipe.name}"`);
    if (!recipe.identifier) throw new Error("Recipe should have identifier");
    if (recipe.servings !== "2 servings") throw new Error(`Expected servings "2 servings", got "${recipe.servings}"`);
    if (!Array.isArray(recipe.ingredients)) throw new Error("Recipe should have ingredients array");
    if (recipe.ingredients.length !== 2) throw new Error(`Expected 2 ingredients, got ${recipe.ingredients.length}`);
    if (!Array.isArray(recipe.preparationSteps)) throw new Error("Recipe should have preparationSteps array");
    if (recipe.preparationSteps.length !== 2) throw new Error(`Expected 2 steps, got ${recipe.preparationSteps.length}`);
    if (recipe.note !== "Test recipe created by unit tests") throw new Error(`Unexpected note: "${recipe.note}"`);
  });

  // Test: Get recipe by identifier (UUID)
  await runTest("Get recipe by identifier", async () => {
    // First get the UUID from a name lookup
    const byName = await client.getRecipe(TEST_RECIPE_NAME);
    const byId = await client.getRecipe(byName.identifier);

    if (byId.name !== TEST_RECIPE_NAME) throw new Error(`Expected name "${TEST_RECIPE_NAME}", got "${byId.name}"`);
    if (byId.identifier !== byName.identifier) throw new Error("Identifier mismatch");
  });

  // Test: Get non-existent recipe (should fail)
  await runTest("Get non-existent recipe", async () => {
    let errorThrown = false;
    try {
      await client.getRecipe("🚫 Non-existent Recipe");
    } catch (error) {
      errorThrown = true;
      if (!error.message.includes("not found")) {
        throw new Error(`Expected 'not found' error, got: ${error.message}`);
      }
    }
    if (!errorThrown) throw new Error("Should have thrown error for non-existent recipe");
  });

  // Test: Recipe appears in list after adding
  await runTest("New recipe appears in recipes list", async () => {
    const recipes = await client.getRecipes();
    const found = recipes.find(r => r.name === TEST_RECIPE_NAME);
    if (!found) throw new Error("Test recipe should appear in recipes list");
  });

  // ===== Calendar Tests =====

  // Use a far-future date range for test events to avoid colliding with real data
  const TEST_CAL_DATE = '2099-12-25';
  const TEST_CAL_DATE_2 = '2099-12-26';

  // Test: Get calendar events (no args, defaults to past 30 days)
  await runTest("Get calendar events (default range)", async () => {
    const events = await client.getCalendarEvents();

    if (!Array.isArray(events)) {
      throw new Error("getCalendarEvents should return an array");
    }

    // Verify structure if any events exist
    if (events.length > 0) {
      const e = events[0];
      if (typeof e.date !== 'string') throw new Error("Event should have date string");
      if (typeof e.dayOfWeek !== 'string') throw new Error("Event should have dayOfWeek string");
      if (typeof e.title !== 'string') throw new Error("Event should have title string");
    }

    console.log(`    Found ${events.length} events in default range`);
  });

  // Test: Get calendar events with date range filter
  await runTest("Get calendar events (with date range)", async () => {
    // Use a range that's unlikely to have events
    const events = await client.getCalendarEvents({
      startDate: '2099-01-01',
      endDate: '2099-01-31',
    });

    if (!Array.isArray(events)) {
      throw new Error("getCalendarEvents should return an array");
    }

    // All returned events should be within the range
    for (const e of events) {
      if (e.date < '2099-01-01' || e.date > '2099-01-31') {
        throw new Error(`Event date ${e.date} is outside requested range`);
      }
    }
  });

  // We need a recipe to schedule — reuse the test recipe (re-add if cleaned up)
  let testRecipeId;
  await runTest("Setup: ensure test recipe for calendar tests", async () => {
    const result = await client.addRecipe({
      name: TEST_RECIPE_NAME,
      note: "Test recipe for calendar tests",
    });
    testRecipeId = result.identifier;
    console.log(`    Using recipe: ${result.identifier}`);
  });

  // Test: Schedule meal by recipe name
  await runTest("Schedule meal by recipe name", async () => {
    const result = await client.scheduleMeal(TEST_CAL_DATE, TEST_RECIPE_NAME);

    if (result.recipeName !== TEST_RECIPE_NAME) {
      throw new Error(`Expected recipe name "${TEST_RECIPE_NAME}", got "${result.recipeName}"`);
    }
    if (result.date !== TEST_CAL_DATE) {
      throw new Error(`Expected date "${TEST_CAL_DATE}", got "${result.date}"`);
    }
  });

  // Test: Schedule meal by UUID
  await runTest("Schedule meal by UUID", async () => {
    const result = await client.scheduleMeal(TEST_CAL_DATE_2, testRecipeId);

    if (result.recipeName !== TEST_RECIPE_NAME) {
      throw new Error(`Expected recipe name "${TEST_RECIPE_NAME}", got "${result.recipeName}"`);
    }
    if (result.date !== TEST_CAL_DATE_2) {
      throw new Error(`Expected date "${TEST_CAL_DATE_2}", got "${result.date}"`);
    }
  });

  // Test: Schedule meal with non-existent recipe
  await runTest("Schedule meal — recipe not found", async () => {
    let errorThrown = false;
    try {
      await client.scheduleMeal(TEST_CAL_DATE, "🚫 Non-existent Recipe");
    } catch (error) {
      errorThrown = true;
      if (!error.message.includes("not found")) {
        throw new Error(`Expected 'not found' error, got: ${error.message}`);
      }
    }
    if (!errorThrown) throw new Error("Should have thrown error for non-existent recipe");
  });

  // Test: Schedule a freeform note
  await runTest("Schedule a note", async () => {
    const result = await client.scheduleNote('2099-12-27', 'Scrounge');

    if (result.title !== 'Scrounge') throw new Error(`Expected title "Scrounge", got "${result.title}"`);
    if (result.date !== '2099-12-27') throw new Error(`Expected date "2099-12-27", got "${result.date}"`);
  });

  // Test: Note appears in calendar
  await runTest("Scheduled note appears in calendar", async () => {
    const events = await client.getCalendarEvents({
      startDate: '2099-12-27',
      endDate: '2099-12-27',
      includeFuture: true,
    });

    const found = events.find(e => e.title === 'Scrounge');
    if (!found) throw new Error("Scheduled note should appear in calendar events");
    if (found.recipeId !== null) throw new Error("Note event should have no recipeId");
  });

  // Test: Scheduled events appear in calendar
  await runTest("Scheduled events appear in calendar", async () => {
    const events = await client.getCalendarEvents({
      startDate: '2099-12-01',
      endDate: '2099-12-31',
      includeFuture: true,
    });

    const recipeEvents = events.filter(e => e.title === TEST_RECIPE_NAME);
    if (recipeEvents.length < 2) {
      throw new Error(`Expected at least 2 recipe events, found ${recipeEvents.length}`);
    }
  });

  // Test: Clear calendar range
  await runTest("Clear calendar range", async () => {
    const result = await client.clearCalendarRange('2099-12-01', '2099-12-31');

    if (result.count < 3) {
      throw new Error(`Expected at least 3 deleted events, got ${result.count}`);
    }
    console.log(`    Cleared ${result.count} events`);
  });

  // Test: Clear calendar range with no events
  await runTest("Clear calendar range — no events in range", async () => {
    const result = await client.clearCalendarRange('2099-12-01', '2099-12-31');

    if (result.count !== 0) {
      throw new Error(`Expected 0 deleted events, got ${result.count}`);
    }
  });

  // Cleanup
  try {
    console.log("\n🧹 Cleaning up test data...");
    try {
      await client.deleteItem(TEST_ITEM_NAME);
    } catch (error) {
      // Item might not exist, that's fine
    }
    try {
      await client.deleteItem(TEST_ITEM_WITH_QUANTITY);
    } catch (error) {
      // Item might not exist, that's fine
    }
    try {
      await client.deleteItem(TEST_ITEM_WITH_NOTES);
    } catch (error) {
      // Item might not exist, that's fine
    }
    // Clean up test recipe
    try {
      const recipes = await client.client.getRecipes();
      const testRecipes = recipes.filter(r => r.name === TEST_RECIPE_NAME);
      for (const r of testRecipes) {
        await r.delete();
        console.log("  Deleted test recipe");
      }
    } catch (error) {
      console.error("  Could not delete test recipe:", error.message);
    }

    await client.disconnect();
    console.log("✅ Cleanup completed");
  } catch (error) {
    console.error("⚠️ Cleanup had issues:", error.message);
  }

  // Results
  console.log("\n📊 Unit Test Results:");
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);

  if (testsFailed === 0) {
    console.log("🎉 All AnyList Client unit tests passed!");
    return true;
  } else {
    console.error("💥 Some unit tests failed!");
    return false;
  }
}

// Run the tests
runAnyListClientUnitTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error("💥 Unit tests crashed:", error);
  process.exit(1);
});