import { spawn } from "child_process";

async function runTestSuite(name, scriptPath) {
  console.log(`\n🏃 Running ${name}...`);
  console.log("=".repeat(50));
  
  return new Promise((resolve) => {
    const testProcess = spawn("node", [scriptPath], {
      stdio: "inherit",
      env: { ...process.env }
    });

    testProcess.on('close', (code) => {
      console.log("=".repeat(50));
      if (code === 0) {
        console.log(`✅ ${name} completed successfully`);
        resolve(true);
      } else {
        console.error(`❌ ${name} failed with exit code ${code}`);
        resolve(false);
      }
    });

    testProcess.on('error', (error) => {
      console.error(`💥 ${name} crashed:`, error);
      resolve(false);
    });
  });
}

async function runAllTests() {
  console.log("🧪 AnyList MCP Server - Complete Test Suite");
  console.log("=" * 60);
  
  const startTime = Date.now();
  let allTestsPassed = true;
  
  // Run unit tests for AnyList client
  const unitTestsPass = await runTestSuite(
    "AnyList Client Unit Tests", 
    "test-anylist-client-unit.js"
  );
  allTestsPassed = allTestsPassed && unitTestsPass;

  // Run integration tests for MCP server
  const integrationTestsPass = await runTestSuite(
    "MCP Server Integration Tests", 
    "test-mcp-server-integration.js"
  );
  allTestsPassed = allTestsPassed && integrationTestsPass;

  // Final results
  const duration = Math.round((Date.now() - startTime) / 1000);
  
  console.log("\n🏁 Final Test Results");
  console.log("=".repeat(50));
  console.log(`⏱️  Total Duration: ${duration} seconds`);
  console.log(`🧪 Unit Tests: ${unitTestsPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔗 Integration Tests: ${integrationTestsPass ? '✅ PASS' : '❌ FAIL'}`);
  
  if (allTestsPassed) {
    console.log("\n🎉 ALL TESTS PASSED! 🎉");
    console.log("Your AnyList MCP Server is ready for production!");
  } else {
    console.error("\n💥 SOME TESTS FAILED! 💥");
    console.error("Please review the failing tests above.");
  }
  
  process.exit(allTestsPassed ? 0 : 1);
}

runAllTests().catch(error => {
  console.error("💥 Test suite crashed:", error);
  process.exit(1);
});