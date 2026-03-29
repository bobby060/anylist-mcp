/**
 * Tests for meal planning: getMealPlanEvents, getMealPlanLabels,
 * createMealPlanEvent, deleteMealPlanEvent
 */
import { createConnectedClient, makeRunner, printSuiteResults } from './helpers.js';

// Use a future date unlikely to conflict with real events
const TEST_DATE = '2099-01-15';

export async function runMealPlanTests() {
  console.log('\n🗓️  Meal Plan');
  const { test, results } = makeRunner();

  const client = await createConnectedClient();

  // ── getMealPlanEvents ───────────────────────────────────────────────

  await test('getMealPlanEvents returns array', async () => {
    const events = await client.getMealPlanEvents();
    if (!Array.isArray(events)) throw new Error('getMealPlanEvents() should return an array');
    if (events.length > 0) {
      const e = events[0];
      if (typeof e.identifier !== 'string') throw new Error('Event should have identifier string');
      if (typeof e.date !== 'string') throw new Error('Event should have date string');
    }
  });

  await test('getMealPlanEvents event date is YYYY-MM-DD format', async () => {
    const events = await client.getMealPlanEvents();
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    for (const e of events) {
      if (!datePattern.test(e.date)) throw new Error(`Event date "${e.date}" is not YYYY-MM-DD format`);
    }
  });

  // ── getMealPlanLabels ───────────────────────────────────────────────

  await test('getMealPlanLabels returns array', async () => {
    const labels = await client.getMealPlanLabels();
    if (!Array.isArray(labels)) throw new Error('getMealPlanLabels() should return an array');
    if (labels.length > 0) {
      const l = labels[0];
      if (typeof l.identifier !== 'string') throw new Error('Label should have identifier string');
      if (typeof l.name !== 'string') throw new Error('Label should have name string');
    }
  });

  // ── createMealPlanEvent ─────────────────────────────────────────────

  let createdEventId = null;

  await test('createMealPlanEvent returns identifier and date', async () => {
    const result = await client.createMealPlanEvent({
      date: TEST_DATE,
      title: '🧪 Integration Test Meal',
    });
    if (!result.identifier) throw new Error('createMealPlanEvent should return identifier');
    if (result.date !== TEST_DATE) throw new Error(`Expected date "${TEST_DATE}", got "${result.date}"`);
    createdEventId = result.identifier;
  });

  await test('created event appears in getMealPlanEvents', async () => {
    if (!createdEventId) throw new Error('No event was created in previous test');
    const events = await client.getMealPlanEvents();
    const found = events.find(e => e.identifier === createdEventId);
    if (!found) throw new Error(`Event "${createdEventId}" not found after creation`);
    if (found.date !== TEST_DATE) throw new Error(`Expected date "${TEST_DATE}", got "${found.date}"`);
  });

  await test('createMealPlanEvent with recipe links recipeId', async () => {
    const recipes = await client.getRecipes();
    if (recipes.length === 0) {
      console.log('    (skipped — no recipes in account)');
      return;
    }
    // Use a different future date to avoid conflict
    const DATE2 = '2099-01-16';
    const recipe = recipes[0];
    const result = await client.createMealPlanEvent({
      date: DATE2,
      recipeId: recipe.identifier,
    });
    if (!result.identifier) throw new Error('Should return identifier');

    const events = await client.getMealPlanEvents();
    const found = events.find(e => e.identifier === result.identifier);
    if (!found) throw new Error('Event with recipe not found after creation');
    if (found.recipeId !== recipe.identifier && found.recipeName !== recipe.name) {
      throw new Error(`Expected linked recipe "${recipe.name}"`);
    }

    // Cleanup this extra event
    try { await client.deleteMealPlanEvent(result.identifier); } catch {}
  });

  // ── deleteMealPlanEvent ─────────────────────────────────────────────

  await test('deleteMealPlanEvent removes event', async () => {
    if (!createdEventId) throw new Error('No event was created to delete');
    await client.deleteMealPlanEvent(createdEventId);
    const events = await client.getMealPlanEvents();
    const found = events.find(e => e.identifier === createdEventId);
    if (found) throw new Error(`Event "${createdEventId}" should be gone after deletion`);
  });

  await test('deleteMealPlanEvent throws for non-existent event', async () => {
    let threw = false;
    try {
      await client.deleteMealPlanEvent('non-existent-id-🚫');
    } catch (e) {
      threw = true;
      if (!e.message.includes('not found')) throw new Error(`Expected "not found", got: ${e.message}`);
    }
    if (!threw) throw new Error('Should have thrown for non-existent event');
  });

  await client.disconnect();
  return printSuiteResults('Meal Plan', results());
}
