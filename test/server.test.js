import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Shared mock state
const mockItems = [];
const mockRecipes = [];
const mockEvents = [];
const mockLabels = [];
const mockCollections = [];

class MockAnyListClient {
  constructor() { this.client = null; this.targetList = null; }

  async connect(listName = null) {
    this.targetList = { name: listName || 'Groceries', identifier: 'list-123' };
    this.client = {};
    return true;
  }
  getLists() { return mockItems._lists || []; }
  async addItem(name, qty, notes) { mockItems.push({ name, quantity: qty, notes }); }
  async removeItem(name) {
    const idx = mockItems.findIndex(i => i.name === name);
    if (idx === -1) throw new Error(`Item "${name}" not found in list, so can't check it`);
    mockItems[idx].checked = true;
  }
  async deleteItem(name) {
    const idx = mockItems.findIndex(i => i.name === name);
    if (idx === -1) throw new Error(`Item "${name}" not found in list, so can't delete it`);
    mockItems.splice(idx, 1);
  }
  async getItems(includeChecked = false, includeNotes = false) {
    let items = [...mockItems];
    if (!includeChecked) items = items.filter(i => !i.checked);
    return items.map(i => ({
      name: i.name, quantity: i.quantity || 1, checked: i.checked || false,
      category: i.category || 'other',
      ...(includeNotes && i.notes ? { note: i.notes } : {}),
    }));
  }
  async getFavoriteItems() { return mockItems._favorites || []; }
  async getRecentItems() { return mockItems._recents || []; }
  async getRecipes(search = null) {
    let r = [...mockRecipes];
    if (search) r = r.filter(x => x.name.toLowerCase().includes(search.toLowerCase()));
    return r;
  }
  async getRecipeDetails(name) {
    const r = mockRecipes.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!r) throw new Error(`Recipe "${name}" not found`);
    return { ...r, ingredients: r.ingredients || [], preparationSteps: r.preparationSteps || [] };
  }
  async createRecipe(opts) { mockRecipes.push(opts); return { identifier: 'r-1', name: opts.name }; }
  async deleteRecipe(name) {
    const idx = mockRecipes.findIndex(r => r.name.toLowerCase() === name.toLowerCase());
    if (idx === -1) throw new Error(`Recipe "${name}" not found`);
    mockRecipes.splice(idx, 1);
  }
  async getMealPlanEvents() { return [...mockEvents]; }
  async getMealPlanLabels() { return [...mockLabels]; }
  async createMealPlanEvent(opts) { mockEvents.push(opts); return { identifier: 'e-1', date: opts.date }; }
  async deleteMealPlanEvent(id) {
    const idx = mockEvents.findIndex(e => e.identifier === id);
    if (idx === -1) throw new Error(`Meal plan event "${id}" not found`);
    mockEvents.splice(idx, 1);
  }
  async getRecipeCollections() { return [...mockCollections]; }
  async createRecipeCollection(name, recipeNames = []) {
    const c = { identifier: 'c-1', name, recipeCount: recipeNames.length, recipeNames };
    mockCollections.push(c);
    return c;
  }
}

// Helpers matching server.js
function textResponse(msg) { return { content: [{ type: "text", text: msg }] }; }
function errorResponse(msg) { return { content: [{ type: "text", text: msg }], isError: true }; }
function requireParams(params, required, action) {
  for (const key of required) {
    if (params[key] === undefined || params[key] === null || params[key] === "") {
      throw new Error(`Action "${action}" requires parameter "${key}"`);
    }
  }
}

// Domain-grouped tool handlers mirroring server.js
function createDomainHandlers(client) {
  return {
    health_check: async ({ list_name } = {}) => {
      try {
        await client.connect(list_name);
        return textResponse(`Successfully connected to AnyList and found list: "${client.targetList.name}"`);
      } catch (error) { return errorResponse(`Failed to connect to AnyList: ${error.message}`); }
    },

    shopping: async (params = {}) => {
      const { action, list_name, name, quantity, notes, include_checked, include_notes } = params;
      try {
        switch (action) {
          case "list_lists": {
            await client.connect(list_name || null);
            const lists = client.getLists();
            if (lists.length === 0) return textResponse("No lists found in the account.");
            const output = lists.map(l => `- ${l.name} (${l.uncheckedCount} unchecked items)`).join("\n");
            return textResponse(`Available lists (${lists.length}):\n${output}`);
          }
          case "list_items": {
            await client.connect(list_name);
            const items = await client.getItems(include_checked || false, include_notes || false);
            if (items.length === 0) return textResponse(include_checked ? `List "${client.targetList.name}" is empty.` : `No unchecked items on list "${client.targetList.name}".`);
            const itemsByCategory = {};
            items.forEach(item => { const cat = item.category || 'other'; if (!itemsByCategory[cat]) itemsByCategory[cat] = []; itemsByCategory[cat].push(item); });
            const itemList = Object.keys(itemsByCategory).sort().map(category => {
              const categoryItems = itemsByCategory[category].map(item => {
                const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
                const status = item.checked ? " ✓" : "";
                const note = item.note ? ` [${item.note}]` : "";
                return `  - ${item.name}${qty}${status}${note}`;
              }).join("\n");
              return `**${category}**\n${categoryItems}`;
            }).join("\n\n");
            return textResponse(`Shopping list "${client.targetList.name}" (${items.length} items):\n${itemList}`);
          }
          case "add_item": {
            requireParams(params, ["name"], action);
            await client.connect(list_name);
            await client.addItem(name, quantity || 1, notes || null);
            return textResponse(`Successfully added "${name}" to list "${client.targetList.name}"`);
          }
          case "check_item": {
            requireParams(params, ["name"], action);
            await client.connect(list_name);
            await client.removeItem(name);
            return textResponse(`Successfully checked off "${name}" from list "${client.targetList.name}"`);
          }
          case "delete_item": {
            requireParams(params, ["name"], action);
            await client.connect(list_name);
            await client.deleteItem(name);
            return textResponse(`Successfully deleted "${name}" from list "${client.targetList.name}"`);
          }
          case "get_favorites": {
            await client.connect(list_name || null);
            const items = await client.getFavoriteItems(list_name);
            if (items.length === 0) return textResponse(`No favorite items for list "${client.targetList.name}".`);
            const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
            return textResponse(`Favorite items for "${client.targetList.name}" (${items.length}):\n${list}`);
          }
          case "get_recents": {
            await client.connect(list_name || null);
            const items = await client.getRecentItems(list_name);
            if (items.length === 0) return textResponse(`No recent items for list "${client.targetList.name}".`);
            const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
            return textResponse(`Recent items for "${client.targetList.name}" (${items.length}):\n${list}`);
          }
          default:
            throw new Error(`Unknown shopping action: ${action}`);
        }
      } catch (error) { return errorResponse(`Shopping ${action} failed: ${error.message}`); }
    },

    recipes: async (params = {}) => {
      const { action, name, search, ingredients, steps, note, source_name, source_url, prep_time, cook_time, servings } = params;
      try {
        await client.connect(null);
        switch (action) {
          case "list": {
            const recipes = await client.getRecipes(search || null);
            if (recipes.length === 0) return textResponse(search ? `No recipes found matching "${search}".` : "No recipes found.");
            const list = recipes.map(r => {
              const parts = [`- **${r.name}**`];
              if (r.rating) parts.push(`⭐${r.rating}`);
              if (r.prepTime) parts.push(`prep: ${r.prepTime}min`);
              if (r.cookTime) parts.push(`cook: ${r.cookTime}min`);
              if (r.servings) parts.push(`serves: ${r.servings}`);
              return parts.join(' | ');
            }).join('\n');
            return textResponse(`Recipes (${recipes.length}):\n${list}`);
          }
          case "get": {
            requireParams(params, ["name"], action);
            const recipe = await client.getRecipeDetails(name);
            let text = `# ${recipe.name}\n\n`;
            if (recipe.ingredients.length > 0) {
              text += `\n## Ingredients\n`;
              recipe.ingredients.forEach(i => { text += `- ${i.rawIngredient || i.name}\n`; });
            }
            if (recipe.preparationSteps.length > 0) {
              text += `\n## Steps\n`;
              recipe.preparationSteps.forEach((s, idx) => { text += `${idx + 1}. ${s}\n`; });
            }
            return textResponse(text);
          }
          case "create": {
            requireParams(params, ["name"], action);
            const result = await client.createRecipe({
              name, ingredients: (ingredients || []).map(i => ({ rawIngredient: i })),
              preparationSteps: steps || [], note: note || null,
              sourceName: source_name || null, sourceUrl: source_url || null,
              prepTime: prep_time || null, cookTime: cook_time || null, servings: servings || null,
            });
            return textResponse(`Created recipe "${result.name}"`);
          }
          case "delete": {
            requireParams(params, ["name"], action);
            await client.deleteRecipe(name);
            return textResponse(`Deleted recipe "${name}"`);
          }
          default:
            throw new Error(`Unknown recipes action: ${action}`);
        }
      } catch (error) { return errorResponse(`Recipes ${action} failed: ${error.message}`); }
    },

    meal_plan: async (params = {}) => {
      const { action, date, title, recipe_id, label_id, details, event_id } = params;
      try {
        await client.connect(null);
        switch (action) {
          case "list_events": {
            const events = await client.getMealPlanEvents();
            if (events.length === 0) return textResponse("No meal plan events found.");
            events.sort((a, b) => a.date.localeCompare(b.date));
            const list = events.map(e => {
              const parts = [`- **${e.date}**`];
              if (e.title) parts.push(e.title);
              if (e.recipeName) parts.push(`📖 ${e.recipeName}`);
              if (e.labelName) parts.push(`[${e.labelName}]`);
              if (e.details) parts.push(`— ${e.details}`);
              return parts.join(' ');
            }).join('\n');
            return textResponse(`Meal Plan (${events.length} events):\n${list}`);
          }
          case "list_labels": {
            const labels = await client.getMealPlanLabels();
            if (labels.length === 0) return textResponse("No meal plan labels found.");
            const list = labels.map(l => `- **${l.name}** (${l.hexColor || 'no color'}) — id: ${l.identifier}`).join('\n');
            return textResponse(`Meal Plan Labels:\n${list}`);
          }
          case "create_event": {
            requireParams(params, ["date"], action);
            const result = await client.createMealPlanEvent({
              date, title: title || null, recipeId: recipe_id || null,
              labelId: label_id || null, details: details || null,
            });
            return textResponse(`Created meal plan event for ${result.date}`);
          }
          case "delete_event": {
            requireParams(params, ["event_id"], action);
            await client.deleteMealPlanEvent(event_id);
            return textResponse(`Deleted meal plan event ${event_id}`);
          }
          default:
            throw new Error(`Unknown meal_plan action: ${action}`);
        }
      } catch (error) { return errorResponse(`Meal plan ${action} failed: ${error.message}`); }
    },

    recipe_collections: async (params = {}) => {
      const { action, name, recipe_names } = params;
      try {
        await client.connect(null);
        switch (action) {
          case "list": {
            const collections = await client.getRecipeCollections();
            if (collections.length === 0) return textResponse("No recipe collections found.");
            const list = collections.map(c => `- **${c.name}** (${c.recipeCount} recipes)${c.recipeCount > 0 ? ': ' + c.recipeNames.join(', ') : ''}`).join('\n');
            return textResponse(`Recipe Collections (${collections.length}):\n${list}`);
          }
          case "create": {
            requireParams(params, ["name"], action);
            const result = await client.createRecipeCollection(name, recipe_names || []);
            return textResponse(`Created recipe collection "${result.name}"`);
          }
          default:
            throw new Error(`Unknown recipe_collections action: ${action}`);
        }
      } catch (error) { return errorResponse(`Recipe collections ${action} failed: ${error.message}`); }
    },
  };
}

// ===== TESTS =====

describe('AnyList MCP Server - Domain-Grouped Tools', () => {
  let client;
  let handlers;

  beforeEach(() => {
    mockItems.length = 0;
    mockRecipes.length = 0;
    mockEvents.length = 0;
    mockLabels.length = 0;
    mockCollections.length = 0;
    mockItems._lists = [];
    mockItems._favorites = [];
    mockItems._recents = [];
    client = new MockAnyListClient();
    handlers = createDomainHandlers(client);
  });

  // ===== health_check =====
  describe('health_check', () => {
    it('returns success', async () => {
      const r = await handlers.health_check({});
      assert.ok(r.content[0].text.includes('Successfully connected'));
    });
  });

  // ===== shopping tool =====
  describe('shopping', () => {
    describe('list_lists', () => {
      it('returns empty message', async () => {
        const r = await handlers.shopping({ action: 'list_lists' });
        assert.ok(r.content[0].text.includes('No lists found'));
      });
      it('returns lists with counts', async () => {
        mockItems._lists = [{ name: 'Groceries', uncheckedCount: 3 }];
        const r = await handlers.shopping({ action: 'list_lists' });
        assert.ok(r.content[0].text.includes('Groceries'));
      });
    });

    describe('list_items', () => {
      it('returns empty message', async () => {
        const r = await handlers.shopping({ action: 'list_items' });
        assert.ok(r.content[0].text.includes('No unchecked items'));
      });
      it('groups items by category', async () => {
        mockItems.push({ name: 'Milk', category: 'Dairy' });
        const r = await handlers.shopping({ action: 'list_items' });
        assert.ok(r.content[0].text.includes('Dairy'));
        assert.ok(r.content[0].text.includes('Milk'));
      });
      it('includes notes when requested', async () => {
        mockItems.push({ name: 'Milk', notes: 'whole' });
        const r = await handlers.shopping({ action: 'list_items', include_notes: true });
        assert.ok(r.content[0].text.includes('whole'));
      });
    });

    describe('add_item', () => {
      it('adds an item', async () => {
        const r = await handlers.shopping({ action: 'add_item', name: 'Eggs' });
        assert.ok(r.content[0].text.includes('Successfully added "Eggs"'));
        assert.equal(mockItems.length, 1);
      });
      it('requires name param', async () => {
        const r = await handlers.shopping({ action: 'add_item' });
        assert.equal(r.isError, true);
        assert.ok(r.content[0].text.includes('requires parameter "name"'));
      });
    });

    describe('check_item', () => {
      it('checks off item', async () => {
        mockItems.push({ name: 'Milk', checked: false });
        const r = await handlers.shopping({ action: 'check_item', name: 'Milk' });
        assert.ok(r.content[0].text.includes('checked off'));
      });
      it('errors on missing item', async () => {
        const r = await handlers.shopping({ action: 'check_item', name: 'Ghost' });
        assert.equal(r.isError, true);
      });
      it('requires name param', async () => {
        const r = await handlers.shopping({ action: 'check_item' });
        assert.equal(r.isError, true);
        assert.ok(r.content[0].text.includes('requires parameter "name"'));
      });
    });

    describe('delete_item', () => {
      it('deletes item', async () => {
        mockItems.push({ name: 'Milk' });
        const r = await handlers.shopping({ action: 'delete_item', name: 'Milk' });
        assert.ok(r.content[0].text.includes('deleted'));
        assert.equal(mockItems.length, 0);
      });
    });

    describe('get_favorites', () => {
      it('returns empty', async () => {
        const r = await handlers.shopping({ action: 'get_favorites' });
        assert.ok(r.content[0].text.includes('No favorite'));
      });
      it('returns items', async () => {
        mockItems._favorites = [{ name: 'Bananas', details: 'organic' }];
        const r = await handlers.shopping({ action: 'get_favorites' });
        assert.ok(r.content[0].text.includes('Bananas'));
      });
    });

    describe('get_recents', () => {
      it('returns empty', async () => {
        const r = await handlers.shopping({ action: 'get_recents' });
        assert.ok(r.content[0].text.includes('No recent'));
      });
    });

    describe('invalid action', () => {
      it('returns error for unknown action', async () => {
        const r = await handlers.shopping({ action: 'fly_to_moon' });
        assert.equal(r.isError, true);
        assert.ok(r.content[0].text.includes('Unknown shopping action'));
      });
    });
  });

  // ===== recipes tool =====
  describe('recipes', () => {
    describe('list (lazy loading - summaries only)', () => {
      it('returns empty', async () => {
        const r = await handlers.recipes({ action: 'list' });
        assert.ok(r.content[0].text.includes('No recipes found'));
      });
      it('returns summaries with metadata', async () => {
        mockRecipes.push({ name: 'Pasta', rating: 5, prepTime: 10, cookTime: 20, servings: '4' });
        const r = await handlers.recipes({ action: 'list' });
        assert.ok(r.content[0].text.includes('Pasta'));
        assert.ok(r.content[0].text.includes('⭐5'));
        // Should NOT include ingredients/steps (lazy loading)
        assert.ok(!r.content[0].text.includes('Ingredients'));
      });
      it('filters by search', async () => {
        mockRecipes.push({ name: 'Pasta' }, { name: 'Salad' });
        const r = await handlers.recipes({ action: 'list', search: 'pasta' });
        assert.ok(r.content[0].text.includes('Pasta'));
        assert.ok(!r.content[0].text.includes('Salad'));
      });
    });

    describe('get (full details)', () => {
      it('returns full recipe with ingredients and steps', async () => {
        mockRecipes.push({
          name: 'Pasta',
          ingredients: [{ rawIngredient: '2 cups flour' }],
          preparationSteps: ['Boil water', 'Cook pasta'],
        });
        const r = await handlers.recipes({ action: 'get', name: 'Pasta' });
        assert.ok(r.content[0].text.includes('# Pasta'));
        assert.ok(r.content[0].text.includes('2 cups flour'));
        assert.ok(r.content[0].text.includes('Boil water'));
      });
      it('errors on missing recipe', async () => {
        const r = await handlers.recipes({ action: 'get', name: 'Nope' });
        assert.equal(r.isError, true);
      });
      it('requires name param', async () => {
        const r = await handlers.recipes({ action: 'get' });
        assert.equal(r.isError, true);
        assert.ok(r.content[0].text.includes('requires parameter "name"'));
      });
    });

    describe('create', () => {
      it('creates a recipe', async () => {
        const r = await handlers.recipes({ action: 'create', name: 'New' });
        assert.ok(r.content[0].text.includes('Created recipe "New"'));
      });
      it('requires name', async () => {
        const r = await handlers.recipes({ action: 'create' });
        assert.equal(r.isError, true);
      });
    });

    describe('delete', () => {
      it('deletes recipe', async () => {
        mockRecipes.push({ name: 'Old' });
        const r = await handlers.recipes({ action: 'delete', name: 'Old' });
        assert.ok(r.content[0].text.includes('Deleted'));
      });
      it('errors on missing', async () => {
        const r = await handlers.recipes({ action: 'delete', name: 'X' });
        assert.equal(r.isError, true);
      });
    });

    describe('invalid action', () => {
      it('returns error', async () => {
        const r = await handlers.recipes({ action: 'explode' });
        assert.equal(r.isError, true);
        assert.ok(r.content[0].text.includes('Unknown recipes action'));
      });
    });
  });

  // ===== meal_plan tool =====
  describe('meal_plan', () => {
    describe('list_events', () => {
      it('returns empty', async () => {
        const r = await handlers.meal_plan({ action: 'list_events' });
        assert.ok(r.content[0].text.includes('No meal plan events'));
      });
      it('sorts by date', async () => {
        mockEvents.push({ date: '2025-02-10', title: 'B', identifier: 'e1' }, { date: '2025-02-08', title: 'A', identifier: 'e2' });
        const r = await handlers.meal_plan({ action: 'list_events' });
        assert.ok(r.content[0].text.indexOf('2025-02-08') < r.content[0].text.indexOf('2025-02-10'));
      });
    });

    describe('list_labels', () => {
      it('returns empty', async () => {
        const r = await handlers.meal_plan({ action: 'list_labels' });
        assert.ok(r.content[0].text.includes('No meal plan labels'));
      });
      it('lists labels', async () => {
        mockLabels.push({ identifier: 'l1', name: 'Dinner', hexColor: '#F00' });
        const r = await handlers.meal_plan({ action: 'list_labels' });
        assert.ok(r.content[0].text.includes('Dinner'));
      });
    });

    describe('create_event', () => {
      it('creates event', async () => {
        const r = await handlers.meal_plan({ action: 'create_event', date: '2025-03-01' });
        assert.ok(r.content[0].text.includes('Created meal plan event'));
      });
      it('requires date', async () => {
        const r = await handlers.meal_plan({ action: 'create_event' });
        assert.equal(r.isError, true);
        assert.ok(r.content[0].text.includes('requires parameter "date"'));
      });
    });

    describe('delete_event', () => {
      it('deletes event', async () => {
        mockEvents.push({ identifier: 'e1', date: '2025-03-01' });
        const r = await handlers.meal_plan({ action: 'delete_event', event_id: 'e1' });
        assert.ok(r.content[0].text.includes('Deleted'));
      });
      it('requires event_id', async () => {
        const r = await handlers.meal_plan({ action: 'delete_event' });
        assert.equal(r.isError, true);
      });
    });

    describe('invalid action', () => {
      it('returns error', async () => {
        const r = await handlers.meal_plan({ action: 'nope' });
        assert.equal(r.isError, true);
      });
    });
  });

  // ===== recipe_collections tool =====
  describe('recipe_collections', () => {
    describe('list', () => {
      it('returns empty', async () => {
        const r = await handlers.recipe_collections({ action: 'list' });
        assert.ok(r.content[0].text.includes('No recipe collections'));
      });
      it('lists collections', async () => {
        mockCollections.push({ name: 'Weeknight', recipeCount: 1, recipeNames: ['Pasta'] });
        const r = await handlers.recipe_collections({ action: 'list' });
        assert.ok(r.content[0].text.includes('Weeknight'));
      });
    });

    describe('create', () => {
      it('creates collection', async () => {
        const r = await handlers.recipe_collections({ action: 'create', name: 'Quick' });
        assert.ok(r.content[0].text.includes('Created recipe collection "Quick"'));
      });
      it('requires name', async () => {
        const r = await handlers.recipe_collections({ action: 'create' });
        assert.equal(r.isError, true);
      });
    });

    describe('invalid action', () => {
      it('returns error', async () => {
        const r = await handlers.recipe_collections({ action: 'bad' });
        assert.equal(r.isError, true);
      });
    });
  });
});
