#!/usr/bin/env node
// Integration test — spawns the MCP server and sends real tool calls via stdio
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['src/server.js'],
  env: { ...process.env },
  cwd: fileURLToPath(new URL('..', import.meta.url)),
});

const client = new Client({ name: 'integration-test', version: '1.0.0' });

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${name}`);
    if (result) console.log(`   ${typeof result === 'string' ? result : JSON.stringify(result).slice(0, 200)}`);
    passed++;
  } catch (e) {
    console.error(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

try {
  await client.connect(transport);
  console.log('🔌 Connected to MCP server\n');

  // List available tools
  const tools = await client.listTools();
  await test('List tools', () => {
    const names = tools.tools.map(t => t.name);
    console.log(`   Tools: ${names.join(', ')}`);
    if (!names.includes('shopping')) throw new Error('Missing shopping tool');
    if (!names.includes('recipes')) throw new Error('Missing recipes tool');
    if (!names.includes('meal_plan')) throw new Error('Missing meal_plan tool');
    return `${names.length} tools found`;
  });

  // Health check
  await test('health_check', async () => {
    const r = await client.callTool({ name: 'health_check', arguments: {} });
    const text = r.content[0].text;
    if (!text.includes('Successfully')) throw new Error(text);
    return text;
  });

  // Shopping: list_lists
  await test('shopping → list_lists', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_lists' } });
    const text = r.content[0].text;
    if (!text.includes('Available lists')) throw new Error(text);
    return text.split('\n')[0];
  });

  // Shopping: list_items (Groceries)
  await test('shopping → list_items (Groceries)', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: 'Groceries' } });
    return r.content[0].text.split('\n')[0];
  });

  // Shopping: add_item, then check_item
  const testItem = `🧪 Integration Test ${Date.now()}`;
  await test(`shopping → add_item ("${testItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'add_item', name: testItem, list_name: 'Groceries' } });
    const text = r.content[0].text;
    if (!text.includes('Successfully')) throw new Error(text);
    return text;
  });

  await test(`shopping → check_item ("${testItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'check_item', name: testItem, list_name: 'Groceries' } });
    const text = r.content[0].text;
    if (!text.includes('Successfully')) throw new Error(text);
    return text;
  });

  await test(`shopping → delete_item ("${testItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'delete_item', name: testItem, list_name: 'Groceries' } });
    const text = r.content[0].text;
    if (!text.toLowerCase().includes('delet')) throw new Error(text);
    return text;
  });

  // Shopping: get_favorites
  await test('shopping → get_favorites', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'get_favorites', list_name: 'Groceries' } });
    return r.content[0].text.split('\n')[0];
  });

  // Shopping: get_recents
  await test('shopping → get_recents', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'get_recents', list_name: 'Groceries' } });
    return r.content[0].text.split('\n')[0];
  });

  // Recipes: list
  await test('recipes → list', async () => {
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'list' } });
    return r.content[0].text.split('\n')[0];
  });

  // Recipes: create, get, delete
  const testRecipe = `🧪 Test Recipe ${Date.now()}`;
  await test(`recipes → create ("${testRecipe}")`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: {
      action: 'create', name: testRecipe,
      ingredients: ['1 cup testing', '2 tbsp assertions'],
      steps: ['Mix ingredients', 'Verify results']
    }});
    const text = r.content[0].text;
    if (!text.includes('Created')) throw new Error(text);
    return text;
  });

  // Small delay to let AnyList sync
  await new Promise(r => setTimeout(r, 2000));

  await test(`recipes → get ("${testRecipe}")`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'get', name: testRecipe } });
    const text = r.content[0].text;
    if (r.isError || text.toLowerCase().includes('failed') || text.toLowerCase().includes('not found')) throw new Error(text);
    if (!text.includes(testRecipe)) throw new Error('Recipe name missing from details');
    return text.split('\n')[0];
  });

  await test(`recipes → delete ("${testRecipe}")`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'delete', name: testRecipe } });
    const text = r.content[0].text;
    if (r.isError || text.toLowerCase().includes('failed') || text.toLowerCase().includes('not found')) throw new Error(text);
    if (!text.toLowerCase().includes('delet')) throw new Error(text);
    return text;
  });

  // Meal plan: list_events
  await test('meal_plan → list_events', async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: { action: 'list_events' } });
    return r.content[0].text.split('\n')[0];
  });

  // Meal plan: list_labels
  await test('meal_plan → list_labels', async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: { action: 'list_labels' } });
    return r.content[0].text.split('\n')[0];
  });

  // Recipe collections: list
  await test('recipe_collections → list', async () => {
    const r = await client.callTool({ name: 'recipe_collections', arguments: { action: 'list' } });
    return r.content[0].text.split('\n')[0];
  });

  // Invalid action test — SDK validates enum at protocol level, so expect a thrown error
  await test('shopping → invalid action returns error', async () => {
    try {
      await client.callTool({ name: 'shopping', arguments: { action: 'nonexistent' } });
      throw new Error('Expected error for invalid action');
    } catch (e) {
      if (e.message.includes('Expected error')) throw e;
      return 'Correctly rejected invalid action at protocol level';
    }
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
  
} catch (e) {
  console.error(`Fatal: ${e.message}`);
  failed++;
} finally {
  try { await client.close(); } catch {}
  process.exit(failed > 0 ? 1 : 0);
}
