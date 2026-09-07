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

const LIST_NAME = process.env.ANYLIST_LIST_NAME || 'Test List';

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

  // Shopping: list_items
  await test(`shopping → list_items (${LIST_NAME})`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: LIST_NAME } });
    return r.content[0].text.split('\n')[0];
  });

  // Shopping: add_item, then check_item
  const testItem = `🧪 Integration Test ${Date.now()}`;
  await test(`shopping → add_item ("${testItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'add_item', name: testItem, list_name: LIST_NAME } });
    const text = r.content[0].text;
    if (!text.includes('Successfully')) throw new Error(text);
    return text;
  });

  await test(`shopping → check_item ("${testItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'check_item', name: testItem, list_name: LIST_NAME } });
    const text = r.content[0].text;
    if (!text.includes('Successfully')) throw new Error(text);
    return text;
  });

  await test(`shopping → delete_item ("${testItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'delete_item', name: testItem, list_name: LIST_NAME } });
    const text = r.content[0].text;
    if (!text.toLowerCase().includes('delet')) throw new Error(text);
    return text;
  });

  // Shopping: check_item → uncheck_item round-trip, asserting the checked state at each step
  const uncheckItem = `🧪 Uncheck Test ${Date.now()}`;
  await test(`shopping → add_item ("${uncheckItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'add_item', name: uncheckItem, list_name: 'Test List' } });
    if (!r.content[0].text.includes('Successfully')) throw new Error(r.content[0].text);
    return r.content[0].text;
  });

  await test(`shopping → check_item then confirm ✓ in list_items`, async () => {
    await client.callTool({ name: 'shopping', arguments: { action: 'check_item', name: uncheckItem, list_name: 'Test List' } });
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: 'Test List', include_checked: true } });
    const line = r.content[0].text.split('\n').find(l => l.includes(uncheckItem));
    if (!line) throw new Error(`"${uncheckItem}" not found in list_items`);
    if (!line.includes('✓')) throw new Error(`"${uncheckItem}" not marked checked: ${line}`);
    return line.trim();
  });

  await test(`shopping → uncheck_item ("${uncheckItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'uncheck_item', name: uncheckItem, list_name: 'Test List' } });
    const text = r.content[0].text;
    if (r.isError || !text.includes('Successfully unchecked')) throw new Error(text);
    return text;
  });

  await test(`shopping → list_items shows "${uncheckItem}" active again (no ✓)`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: 'Test List', include_checked: true } });
    const line = r.content[0].text.split('\n').find(l => l.includes(uncheckItem));
    if (!line) throw new Error(`"${uncheckItem}" disappeared from list after uncheck`);
    if (line.includes('✓')) throw new Error(`"${uncheckItem}" still marked checked after uncheck: ${line}`);
    return line.trim();
  });

  await test(`shopping → uncheck_item resolves a partial name against checked items`, async () => {
    await client.callTool({ name: 'shopping', arguments: { action: 'check_item', name: uncheckItem, list_name: 'Test List' } });
    const partial = uncheckItem.slice(0, -4); // still a unique substring of the item
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'uncheck_item', name: partial, list_name: 'Test List' } });
    const text = r.content[0].text;
    if (r.isError || !text.includes('Successfully unchecked')) throw new Error(text);
    return text;
  });

  await test(`shopping → uncheck_item on an already-unchecked item errors (no checked match)`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'uncheck_item', name: uncheckItem, list_name: 'Test List' } });
    const text = r.content[0].text;
    if (!r.isError) throw new Error(`expected an error, got success: ${text}`);
    if (!text.toLowerCase().includes('no checked-off item')) throw new Error(`expected no-checked-match error, got: ${text}`);
    return 'already-unchecked item correctly rejected';
  });

  await test(`shopping → uncheck_item on a non-existent item errors`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'uncheck_item', name: `🧪 Nope ${Date.now()}`, list_name: 'Test List' } });
    const text = r.content[0].text;
    if (!r.isError) throw new Error(`expected an error, got success: ${text}`);
    if (!text.toLowerCase().includes('no checked-off item')) throw new Error(`expected error, got: ${text}`);
    return 'non-existent item correctly rejected';
  });

  await test(`shopping → delete_item ("${uncheckItem}")`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'delete_item', name: uncheckItem, list_name: 'Test List' } });
    if (!r.content[0].text.toLowerCase().includes('delet')) throw new Error(r.content[0].text);
    return r.content[0].text;
  });

  // Shopping: add_item with category, confirm via list_items, then delete
  const categoryTestItem = `🧪 Category Test ${Date.now()}`;
  await test(`shopping → add_item with category ("${categoryTestItem}", produce)`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: {
      action: 'add_item', name: categoryTestItem, list_name: LIST_NAME, category: 'produce',
    }});
    const text = r.content[0].text;
    if (!text.includes('Successfully')) throw new Error(text);
    return text;
  });

  await test(`shopping → list_items shows "${categoryTestItem}" under produce`, async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: LIST_NAME } });
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
      action: 'delete_item', name: categoryTestItem, list_name: LIST_NAME,
    }});
    const text = r.content[0].text;
    if (!text.toLowerCase().includes('delet')) throw new Error(text);
    return text;
  });

  // Shopping: add_items with plain string names
  const bulkStringItems = [`🧪 Bulk String 1 ${Date.now()}`, `🧪 Bulk String 2 ${Date.now()}`, `🧪 Bulk String 3 ${Date.now()}`];
  await test('shopping → add_items with plain string names', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: {
      action: 'add_items', list_name: 'Test List', items: bulkStringItems,
    }});
    const text = r.content[0].text;
    if (!text.includes(`Added ${bulkStringItems.length} of ${bulkStringItems.length} items`)) throw new Error(text);
    return text.split('\n')[0];
  });

  await test('shopping → list_items shows items added via add_items (string names)', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: 'Test List' } });
    const text = r.content[0].text;
    for (const itemName of bulkStringItems) {
      if (!text.includes(itemName)) throw new Error(`Item "${itemName}" not found in list`);
    }
    return 'All bulk string items found';
  });

  await test('shopping → cleanup add_items (string names)', async () => {
    for (const itemName of bulkStringItems) {
      const r = await client.callTool({ name: 'shopping', arguments: { action: 'delete_item', name: itemName, list_name: 'Test List' } });
      const text = r.content[0].text;
      if (!text.toLowerCase().includes('delet')) throw new Error(`Failed to delete "${itemName}": ${text}`);
    }
    return `Deleted ${bulkStringItems.length} items`;
  });

  // Shopping: add_items with full JSON object items (name, quantity, notes, category)
  const bulkObjectItems = [
    { name: `🧪 Bulk Object 1 ${Date.now()}`, quantity: 3, notes: 'chilled', category: 'dairy' },
    { name: `🧪 Bulk Object 2 ${Date.now()}`, quantity: 2, notes: 'ripe', category: 'produce' },
  ];
  await test('shopping → add_items with full JSON object items', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: {
      action: 'add_items', list_name: 'Test List', items: bulkObjectItems,
    }});
    const text = r.content[0].text;
    if (!text.includes(`Added ${bulkObjectItems.length} of ${bulkObjectItems.length} items`)) throw new Error(text);
    return text.split('\n')[0];
  });

  await test('shopping → list_items shows full object items with notes and category', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: 'Test List', include_notes: true } });
    const text = r.content[0].text;
    for (const item of bulkObjectItems) {
      if (!text.includes(item.name)) throw new Error(`Item "${item.name}" not found in list`);
      if (!text.includes(item.notes)) throw new Error(`Notes "${item.notes}" not found for "${item.name}"`);
    }
    return 'All bulk object items found with notes';
  });

  await test('shopping → cleanup add_items (full objects)', async () => {
    for (const item of bulkObjectItems) {
      const r = await client.callTool({ name: 'shopping', arguments: { action: 'delete_item', name: item.name, list_name: 'Test List' } });
      const text = r.content[0].text;
      if (!text.toLowerCase().includes('delet')) throw new Error(`Failed to delete "${item.name}": ${text}`);
    }
    return `Deleted ${bulkObjectItems.length} items`;
  });

  // Shopping: add_items with partial JSON object items (missing optional fields — relies on defaults)
  const bulkPartialItems = [
    { name: `🧪 Bulk Partial 1 ${Date.now()}` },
    { name: `🧪 Bulk Partial 2 ${Date.now()}`, category: 'bakery' },
  ];
  await test('shopping → add_items with partial JSON object items (missing optional fields)', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: {
      action: 'add_items', list_name: 'Test List', items: bulkPartialItems,
    }});
    const text = r.content[0].text;
    if (!text.includes(`Added ${bulkPartialItems.length} of ${bulkPartialItems.length} items`)) throw new Error(text);
    return text.split('\n')[0];
  });

  await test('shopping → list_items shows partial items with defaults applied', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'list_items', list_name: 'Test List' } });
    const text = r.content[0].text;
    for (const item of bulkPartialItems) {
      if (!text.includes(item.name)) throw new Error(`Item "${item.name}" not found in list`);
    }
    // First item had no category specified — should default to "other"
    const lower = text.toLowerCase();
    const otherIdx = lower.indexOf('other');
    const firstItemIdx = lower.indexOf(bulkPartialItems[0].name.toLowerCase());
    if (otherIdx === -1) throw new Error('"other" category heading not found for item with no category specified');
    if (firstItemIdx < otherIdx) throw new Error('Item with no category should appear under "other" heading (default category)');
    return 'Partial items found with default category applied';
  });

  await test('shopping → cleanup add_items (partial objects)', async () => {
    for (const item of bulkPartialItems) {
      const r = await client.callTool({ name: 'shopping', arguments: { action: 'delete_item', name: item.name, list_name: 'Test List' } });
      const text = r.content[0].text;
      if (!text.toLowerCase().includes('delet')) throw new Error(`Failed to delete "${item.name}": ${text}`);
    }
    return `Deleted ${bulkPartialItems.length} items`;
  });

  // Shopping: get_favorites
  await test('shopping → get_favorites', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'get_favorites', list_name: LIST_NAME } });
    return r.content[0].text.split('\n')[0];
  });

  // Shopping: get_recents
  await test('shopping → get_recents', async () => {
    const r = await client.callTool({ name: 'shopping', arguments: { action: 'get_recents', list_name: LIST_NAME } });
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

  // Recipes: update — partial, in-place. Only provided fields change; the
  // identifier and every untouched field must survive. Never delete + recreate.
  async function getRecipeText(nm) {
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'get', name: nm } });
    if (r.isError) throw new Error(r.content[0].text);
    return r.content[0].text;
  }
  function recipeField(text, label) {
    const m = text.match(new RegExp(`^${label}: (.+)$`, 'm'));
    return m ? m[1].trim() : null;
  }

  let updateCreatedAt = null;

  await test(`recipes → update single field ("${testRecipe}" servings)`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: {
      action: 'update', name: testRecipe, servings: '8',
    }});
    const text = r.content[0].text;
    if (r.isError || !text.includes('Updated')) throw new Error(text);
    return text;
  });

  await new Promise(r => setTimeout(r, 2000));

  await test(`recipes → get after single-field update — servings changed, id + ingredients + steps intact`, async () => {
    const text = await getRecipeText(testRecipe);
    if (recipeField(text, 'Servings') !== '8') throw new Error(`servings not updated to 8:\n${text}`);
    if (recipeField(text, 'ID') !== testRecipeId) throw new Error(`identifier changed: ${recipeField(text, 'ID')} != ${testRecipeId}`);
    for (const ing of testIngredients) {
      if (!text.includes(ing.name)) throw new Error(`ingredient "${ing.name}" lost after update`);
    }
    if (!text.includes('Mix ingredients') || !text.includes('Verify results')) throw new Error('steps lost after update');
    updateCreatedAt = recipeField(text, 'Created');
    return `servings=8, id ${testRecipeId} stable, ingredients + steps intact`;
  });

  await test(`recipes → update multiple fields ("${testRecipe}" note + prep_time)`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: {
      action: 'update', name: testRecipe, note: 'Updated by integration test', prep_time: 15,
    }});
    const text = r.content[0].text;
    if (r.isError || !text.includes('Updated')) throw new Error(text);
    return text;
  });

  await new Promise(r => setTimeout(r, 2000));

  await test(`recipes → get after multi-field update — note + prep set, earlier servings change persists`, async () => {
    const text = await getRecipeText(testRecipe);
    if (!text.includes('Updated by integration test')) throw new Error(`note not updated:\n${text}`);
    if (recipeField(text, 'Prep') !== '15 min') throw new Error(`prep_time not updated:\n${text}`);
    if (recipeField(text, 'Servings') !== '8') throw new Error(`servings from the earlier update was lost:\n${text}`);
    if (recipeField(text, 'ID') !== testRecipeId) throw new Error('identifier changed after multi-field update');
    if (updateCreatedAt && recipeField(text, 'Created') !== updateCreatedAt) throw new Error('Created timestamp changed on update');
    return 'note + prep updated; earlier servings change and Created timestamp preserved';
  });

  const replacedIngredients = [
    { name: 'replacement', quantity: '3 cups' },
    { name: 'newness', quantity: '4 tsp' },
  ];
  await test(`recipes → update replaces the whole ingredient list`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: {
      action: 'update', name: testRecipe, ingredients: replacedIngredients,
    }});
    const text = r.content[0].text;
    if (r.isError || !text.includes('Updated')) throw new Error(text);
    return text;
  });

  await new Promise(r => setTimeout(r, 2000));

  await test(`recipes → get after ingredient replacement — new ingredients only, steps/note/servings survive, id stable`, async () => {
    const text = await getRecipeText(testRecipe);
    for (const ing of replacedIngredients) {
      if (!text.includes(ing.name)) throw new Error(`new ingredient "${ing.name}" missing:\n${text}`);
    }
    for (const ing of testIngredients) {
      if (text.includes(ing.name)) throw new Error(`old ingredient "${ing.name}" still present — the array was merged, not replaced`);
    }
    if (!text.includes('Mix ingredients') || !text.includes('Verify results')) throw new Error('steps lost after ingredient replacement');
    if (!text.includes('Updated by integration test')) throw new Error('note lost after ingredient replacement');
    if (recipeField(text, 'Servings') !== '8') throw new Error('servings lost after ingredient replacement');
    if (recipeField(text, 'ID') !== testRecipeId) throw new Error('identifier changed after ingredient replacement');
    return 'ingredient list replaced wholesale; steps/note/servings/id all intact';
  });

  await test(`recipes → update with no fields returns a clear error`, async () => {
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'update', name: testRecipe } });
    const text = r.content[0].text;
    if (!r.isError) throw new Error(`expected an error, got success: ${text}`);
    if (!text.toLowerCase().includes('at least one field')) throw new Error(`expected no-fields error, got: ${text}`);
    return 'update with no fields rejected';
  });

  await test(`recipes → update on a non-existent name errors; the real recipe is untouched`, async () => {
    const missing = `🧪 No Such Recipe ${Date.now()}`;
    const r = await client.callTool({ name: 'recipes', arguments: { action: 'update', name: missing, note: 'x' } });
    const text = r.content[0].text;
    if (!r.isError) throw new Error(`expected an error, got success: ${text}`);
    if (!text.toLowerCase().includes('not found')) throw new Error(`expected not-found error, got: ${text}`);
    const stillThere = await getRecipeText(testRecipe);
    if (!stillThere.includes('Updated by integration test')) throw new Error('the target recipe changed after a failed update on a different name');
    return 'not-found error returned; target recipe untouched';
  });

  // The ambiguous-name path (update errors when >1 recipe shares the name) is
  // covered by the mocked unit tests — the `create` action refuses to make a
  // second recipe with an existing name, so the state can't be set up here.

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
