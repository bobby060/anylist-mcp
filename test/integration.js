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

  // Shopping: add_item with category, confirm via list_items, then delete
  const categoryTestItem = `🧪 Category Test ${Date.now()}`;
  await test(`shopping → add_item with category ("${categoryTestItem}", produce)`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: {
      action: 'add_item', name: categoryTestItem, list_name: 'Groceries', category: 'produce',
    }});
    const text = r.content[0].text;
    if (!text.includes('Successfully')) throw new Error(text);
    return text;
  });

  await test(`shopping → list_items shows "${categoryTestItem}" under produce`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: 'Groceries' } });
    const text = r.content[0].text;
    if (!text.includes(categoryTestItem)) throw new Error(`Item "${categoryTestItem}" not found in list`);
    const lower = text.toLowerCase();
    const produceIdx = lower.indexOf('produce');
    const itemIdx = lower.indexOf(categoryTestItem.toLowerCase());
    if (produceIdx === -1) throw new Error('"produce" category heading not found in list');
    if (itemIdx < produceIdx) throw new Error(`Item appears before the produce category heading`);
    return `"${categoryTestItem}" found under produce`;
  });

  await test(`shopping → delete_item ("${categoryTestItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: {
      action: 'delete_item', name: categoryTestItem, list_name: 'Groceries',
    }});
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

  // Recipes: list — verify IDs appear in output
  await test('recipes → list includes recipe IDs', async () => {
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'list' } });
    const text = r.content[0].text;
    if (text.includes('No recipes found')) return '(no recipes to check)';
    if (!text.includes('(id:')) throw new Error('Recipe list missing (id: ...) field');
    return text.split('\n')[0];
  });

  // Recipes: create, get, delete
  const testRecipe = `🧪 Test Recipe ${Date.now()}`;
  const testIngredients = [
    { name: 'testing', quantity: '1 cup' },
    { name: 'assertions', quantity: '2 tbsp' },
  ];
  let beforeCreate;
  await test(`recipes → create ("${testRecipe}")`, async () => {
    beforeCreate = Date.now();
    const r = await client.callTool({ name: 'recipes', arguments: {
      action: 'create', name: testRecipe,
      ingredients: testIngredients,
      steps: ['Mix ingredients', 'Verify results']
    }});
    const text = r.content[0].text;
    if (!text.includes('Created')) throw new Error(text);
    return text;
  });

  // Small delay to let AnyList sync
  await new Promise(r => setTimeout(r, 2000));

  let testRecipeId = null;
  await test(`recipes → get ("${testRecipe}") — details + ID`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'get', name: testRecipe } });
    const text = r.content[0].text;
    if (r.isError || text.toLowerCase().includes('failed') || text.toLowerCase().includes('not found')) throw new Error(text);
    if (!text.includes(testRecipe)) throw new Error('Recipe name missing from details');

    // Verify ID field is present and capture it
    const idMatch = text.match(/^ID: (.+)$/m);
    if (!idMatch) throw new Error('ID missing from recipe details');
    testRecipeId = idMatch[1].trim();

    // Verify each ingredient's name and quantity appear in the response
    for (const ingredient of testIngredients) {
      if (!text.includes(ingredient.name)) throw new Error(`Ingredient name "${ingredient.name}" missing from recipe details`);
      if (!text.includes(ingredient.quantity)) throw new Error(`Ingredient quantity "${ingredient.quantity}" missing from recipe details`);
    }

    // Verify createdAt is set and close to when create was called (within 60s)
    const createdAtMatch = text.match(/^Created: (.+)$/m);
    if (!createdAtMatch) throw new Error('createdAt missing from recipe details');
    const createdAt = new Date(createdAtMatch[1]).getTime();
    const drift = Math.abs(createdAt - beforeCreate);
    if (drift > 60_000) throw new Error(`createdAt drift too large: ${drift}ms (expected within 60s of create call)`);

    return `${text.split('\n')[0]} (id: ${testRecipeId})`;
  });

  await test(`recipes → list shows ID matching get`, async () => {
    if (!testRecipeId) return '(skipped — no recipe ID from get)';
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'list' } });
    const text = r.content[0].text;
    if (!text.includes(testRecipeId)) throw new Error(`Recipe ID "${testRecipeId}" not found in list output`);
    return `ID ${testRecipeId} confirmed in list`;
  });

  await test(`recipes → delete ("${testRecipe}")`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'delete', name: testRecipe } });
    const text = r.content[0].text;
    if (r.isError || text.toLowerCase().includes('failed') || text.toLowerCase().includes('not found')) throw new Error(text);
    if (!text.toLowerCase().includes('delet')) throw new Error(text);
    return text;
  });

  // Meal plan: list_labels
  await test('meal_plan → list_labels', async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: { action: 'list_labels' } });
    return r.content[0].text.split('\n')[0];
  });

  // Meal plan: create_event → verify in list_events (with ID + date filter) → delete_event
  // Use a far-future date to avoid collision with real events
  const testEventDate = '2099-06-15';
  const testEventDate2 = '2099-06-20';
  let testEventId = null;
  let testEventId2 = null;

  await test(`meal_plan → create_event (${testEventDate})`, async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: {
      action: 'create_event', date: testEventDate, title: '🧪 Integration Test Meal',
    }});
    const text = r.content[0].text;
    if (r.isError || !text.includes('Created')) throw new Error(text);
    return text;
  });

  await test(`meal_plan → create_event (${testEventDate2})`, async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: {
      action: 'create_event', date: testEventDate2, title: '🧪 Integration Test Meal 2',
    }});
    const text = r.content[0].text;
    if (r.isError || !text.includes('Created')) throw new Error(text);
    return text;
  });

  await test('meal_plan → list_events shows created events with IDs', async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: { action: 'list_events' } });
    const text = r.content[0].text;
    if (!text.includes(testEventDate)) throw new Error(`Date ${testEventDate} not found in list_events output`);
    if (!text.includes(testEventDate2)) throw new Error(`Date ${testEventDate2} not found in list_events output`);
    if (!text.includes('(id:')) throw new Error('Event list missing (id: ...) field');

    // Capture IDs for delete step
    for (const line of text.split('\n')) {
      const idMatch = line.match(/\(id: ([^)]+)\)/);
      if (!idMatch) continue;
      if (line.includes(testEventDate) && !testEventId) testEventId = idMatch[1];
      if (line.includes(testEventDate2) && !testEventId2) testEventId2 = idMatch[1];
    }
    if (!testEventId) throw new Error(`Could not extract ID for event on ${testEventDate}`);
    if (!testEventId2) throw new Error(`Could not extract ID for event on ${testEventDate2}`);
    return `IDs captured: ${testEventId}, ${testEventId2}`;
  });

  await test('meal_plan → list_events with start_date filter', async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: {
      action: 'list_events', start_date: testEventDate2,
    }});
    const text = r.content[0].text;
    if (text.includes(testEventDate) && !text.includes(testEventDate2))
      throw new Error(`start_date filter should exclude ${testEventDate}`);
    if (!text.includes(testEventDate2)) throw new Error(`start_date filter should include ${testEventDate2}`);
    return `start_date=${testEventDate2} correctly filtered`;
  });

  await test('meal_plan → list_events with end_date filter', async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: {
      action: 'list_events', end_date: testEventDate,
    }});
    const text = r.content[0].text;
    if (text.includes(testEventDate2)) throw new Error(`end_date filter should exclude ${testEventDate2}`);
    if (!text.includes(testEventDate)) throw new Error(`end_date filter should include ${testEventDate}`);
    return `end_date=${testEventDate} correctly filtered`;
  });

  await test(`meal_plan → delete_event (${testEventDate})`, async () => {
    if (!testEventId) throw new Error('No event ID captured — cannot delete');
    const r = await client.callTool({ name: 'meal_plan', arguments: {
      action: 'delete_event', event_id: testEventId,
    }});
    const text = r.content[0].text;
    if (r.isError || !text.includes('Deleted')) throw new Error(text);
    return text;
  });

  await test(`meal_plan → delete_event (${testEventDate2})`, async () => {
    if (!testEventId2) throw new Error('No event ID captured — cannot delete');
    const r = await client.callTool({ name: 'meal_plan', arguments: {
      action: 'delete_event', event_id: testEventId2,
    }});
    const text = r.content[0].text;
    if (r.isError || !text.includes('Deleted')) throw new Error(text);
    return text;
  });

  await test('meal_plan → deleted events no longer appear in list_events', async () => {
    const r = await client.callTool({ name: 'meal_plan', arguments: { action: 'list_events' } });
    const text = r.content[0].text;
    if (text.includes(testEventDate)) throw new Error(`${testEventDate} still appears after deletion`);
    if (text.includes(testEventDate2)) throw new Error(`${testEventDate2} still appears after deletion`);
    return 'Events absent from list after deletion';
  });

  // Recipe collections: list + create lifecycle
  await test('recipe_collections → list', async () => {
    const r = await client.callTool({ name: 'recipe_collections', arguments: { action: 'list' } });
    return r.content[0].text.split('\n')[0];
  });

  const testCollection = `🧪 Test Collection ${Date.now()}`;
  await test(`recipe_collections → create ("${testCollection}")`, async () => {
    const r = await client.callTool({ name: 'recipe_collections', arguments: {
      action: 'create', name: testCollection,
    }});
    const text = r.content[0].text;
    if (r.isError || !text.includes('Created')) throw new Error(text);
    return text;
  });

  await test(`recipe_collections → created collection appears in list`, async () => {
    const r = await client.callTool({ name: 'recipe_collections', arguments: { action: 'list' } });
    const text = r.content[0].text;
    if (!text.includes(testCollection)) throw new Error(`"${testCollection}" not found in collections list`);
    return `Collection "${testCollection}" confirmed`;
  });

  await test(`recipe_collections → delete ("${testCollection}")`, async () => {
    const r = await client.callTool({ name: 'recipe_collections', arguments: { action: 'delete', name: testCollection } });
    const text = r.content[0].text;
    if (r.isError || !text.includes('Deleted')) throw new Error(text);
    return text;
  });

  await test(`recipe_collections → deleted collection absent from list`, async () => {
    const r = await client.callTool({ name: 'recipe_collections', arguments: { action: 'list' } });
    const text = r.content[0].text;
    if (text.includes(testCollection)) throw new Error(`"${testCollection}" still appears after deletion`);
    return 'Collection absent from list after deletion';
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
