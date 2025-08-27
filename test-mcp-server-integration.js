import { spawn } from "child_process";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const TEST_ITEM_NAME = "🧪 Integration Test Item";
const TEST_PORT = 3000;
const BASE_URL = `http://localhost:${TEST_PORT}`;

async function runMCPServerIntegrationTests() {
  console.log("🧪 Running MCP Server Integration Tests (HTTP)...");
  
  let testsPassed = 0;
  let testsFailed = 0;
  let serverProcess = null;

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

  // Helper to send HTTP request to MCP endpoint
  async function sendMCPMessage(message) {
    const response = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  try {
    // Start MCP server
    console.log("🚀 Starting MCP server...");
    serverProcess = spawn("node", ["src/server.js"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env }
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Server startup timeout"));
      }, 10000);

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes(`AnyList MCP server running on HTTP port ${TEST_PORT}`)) {
          clearTimeout(timeout);
          resolve();
        }
      });

      serverProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    console.log("✅ MCP server started successfully");

    // Test: Health check endpoint
    await runTest("HTTP Health check endpoint", async () => {
      const response = await fetch(`${BASE_URL}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const data = await response.json();
      if (data.status !== 'healthy') {
        throw new Error("Server not healthy");
      }
      if (data.server !== 'anylist-mcp-server') {
        throw new Error("Unexpected server name in health check");
      }
    });

  } catch (error) {
    console.error("💥 Integration tests crashed:", error);
    testsFailed++;
  } finally {
    // Cleanup: Kill server process
    if (serverProcess) {
      console.log("\n🧹 Cleaning up server process...");
      serverProcess.kill('SIGTERM');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
  }

  // Results
  console.log("\n📊 Integration Test Results (HTTP Transport):");
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);

  if (testsFailed === 0) {
    console.log("🎉 All MCP Server HTTP integration tests passed!");
    return true;
  } else {
    console.error("💥 Some HTTP integration tests failed!");
    return false;
  }
}

// Run the tests
runMCPServerIntegrationTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error("💥 Integration tests crashed:", error);
  process.exit(1);
});