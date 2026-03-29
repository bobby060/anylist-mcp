import AnyListClient from '../../src/anylist-client.js';
import dotenv from 'dotenv';
dotenv.config();

export async function createConnectedClient(listName = null) {
  const client = new AnyListClient();
  await client.connect(listName || process.env.ANYLIST_LIST_NAME);
  return client;
}

export function makeRunner() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ ${name}: ${e.message}`);
      failed++;
    }
  }

  function results() {
    return { passed, failed };
  }

  return { test, results };
}

export function printSuiteResults(suiteName, { passed, failed }) {
  const total = passed + failed;
  const rate = total > 0 ? Math.round((passed / total) * 100) : 0;
  const status = failed === 0 ? '✅' : '❌';
  console.log(`${status} ${suiteName}: ${passed}/${total} (${rate}%)`);
  return failed;
}
