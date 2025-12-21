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