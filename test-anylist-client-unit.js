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
      () => disconnectedClient.deleteItem("test")
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

  // Cleanup
  try {
    console.log("\n🧹 Cleaning up test data...");
    try {
      await client.deleteItem(TEST_ITEM_NAME);
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