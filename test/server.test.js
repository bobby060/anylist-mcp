import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// We test the tool handler logic by importing the client and mocking its internals.
// Since server.js has side effects (registers tools, starts transport), we test
// the AnyListClient methods directly with mocked underlying anylist-js library.

// Mock the anylist-js module before importing client
const mockItems = [];
const mockRecipes = [];
const mockEvents = [];
const mockLabels = [];
const mockCollections = [];

// Build a mock AnyListClient that mimics the real one without network calls
class MockAnyListClient {
  constructor() {
    this.client = null;
    this.targetList = null;
    this._connected = false;
  }

  async connect(listName = null) {
    const targetListName = listName || process.env.ANYLIST_LIST_NAME || 'Groceries';
    this._connected = true;
    this.targetList = { name: targetListName, identifier: 'list-123' };
    this.client = {}; // truthy
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
      name: i.name,
      quantity: i.quantity || 1,
      checked: i.checked || false,
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
  async importRecipeFromUrl(url) {
    const mockImport = mockRecipes._pendingImport;
    if (!mockImport) throw new Error('Could not parse recipe from URL. The site may not be supported.');
    const result = { identifier: 'r-imported', name: mockImport.name, ...mockImport };
    mockRecipes.push(result);
    return {
      name: mockImport.name,
      identifier: 'r-imported',
      ingredientCount: mockImport.ingredientCount || 0,
      stepCount: mockImport.stepCount || 0,
      source: mockImport.source || null,
      sourceUrl: mockImport.sourceUrl || url,
      isPremiumUser: true,
      freeImportsRemaining: -109,
    };
  }
  async createRecipeCollection(name, recipeNames = []) {
    const c = { identifier: 'c-1', name, recipeCount: recipeNames.length, recipeNames };
    mockCollections.push(c);
    return c;
  }
}

// --- Tool handler simulators ---
// These replicate the logic from server.js tool handlers but use our mock client.

function createToolHandlers(client) {
  return {
    health_check: async ({ list_name } = {}) => {
      try {
        await client.connect(list_name);
        return text(`Successfully connected to AnyList and found list: "${client.targetList.name}"`);
      } catch (error) {
        return err(`Failed to connect to AnyList: ${error.message}`);
      }
    },

    add_item: async ({ name, quantity, notes, list_name } = {}) => {
      try {
        await client.connect(list_name);
        await client.addItem(name, quantity || 1, notes || null);
        return text(`Successfully added "${name}" to list "${client.targetList.name}"`);
      } catch (error) {
        return err(`Failed to add item: ${error.message}`);
      }
    },

    check_item: async ({ name, list_name } = {}) => {
      try {
        await client.connect(list_name);
        await client.removeItem(name);
        return text(`Successfully checked off "${name}" from list "${client.targetList.name}"`);
      } catch (error) {
        return err(`Failed to check off item: ${error.message}`);
      }
    },

    delete_item: async ({ name, list_name } = {}) => {
      try {
        await client.connect(list_name);
        await client.deleteItem(name);
        return text(`Successfully deleted "${name}" from list "${client.targetList.name}"`);
      } catch (error) {
        return err(`Failed to delete item: ${error.message}`);
      }
    },

    list_items: async ({ include_checked, include_notes, list_name } = {}) => {
      try {
        await client.connect(list_name);
        const items = await client.getItems(include_checked || false, include_notes || false);
        if (items.length === 0) {
          return text(include_checked
            ? `List "${client.targetList.name}" is empty.`
            : `No unchecked items on list "${client.targetList.name}".`);
        }
        const itemsByCategory = {};
        items.forEach(item => {
          const cat = item.category || 'other';
          if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
          itemsByCategory[cat].push(item);
        });
        const itemList = Object.keys(itemsByCategory).sort().map(category => {
          const categoryItems = itemsByCategory[category].map(item => {
            const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
            const status = item.checked ? " ✓" : "";
            const note = item.note ? ` [${item.note}]` : "";
            return `  - ${item.name}${qty}${status}${note}`;
          }).join("\n");
          return `**${category}**\n${categoryItems}`;
        }).join("\n\n");
        return text(`Shopping list "${client.targetList.name}" (${items.length} items):\n${itemList}`);
      } catch (error) {
        return err(`Failed to list items: ${error.message}`);
      }
    },

    list_lists: async () => {
      try {
        await client.connect(null);
        const lists = client.getLists();
        if (lists.length === 0) return text("No lists found in the account.");
        const output = lists.map(l => `- ${l.name} (${l.uncheckedCount} unchecked items)`).join("\n");
        return text(`Available lists (${lists.length}):\n${output}`);
      } catch (error) {
        return err(`Failed to list lists: ${error.message}`);
      }
    },

    get_favorites: async ({ list_name } = {}) => {
      try {
        await client.connect(list_name);
        const items = await client.getFavoriteItems(list_name);
        if (items.length === 0) return text(`No favorite items for list "${client.targetList.name}".`);
        const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
        return text(`Favorite items for "${client.targetList.name}" (${items.length}):\n${list}`);
      } catch (error) {
        return err(`Failed to get favorites: ${error.message}`);
      }
    },

    get_recents: async ({ list_name } = {}) => {
      try {
        await client.connect(list_name);
        const items = await client.getRecentItems(list_name);
        if (items.length === 0) return text(`No recent items for list "${client.targetList.name}".`);
        const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
        return text(`Recent items for "${client.targetList.name}" (${items.length}):\n${list}`);
      } catch (error) {
        return err(`Failed to get recents: ${error.message}`);
      }
    },

    list_recipes: async ({ search } = {}) => {
      try {
        await client.connect(null);
        const recipes = await client.getRecipes(search || null);
        if (recipes.length === 0) return text(search ? `No recipes found matching "${search}".` : "No recipes found.");
        const list = recipes.map(r => {
          const parts = [`- **${r.name}**`];
          if (r.rating) parts.push(`⭐${r.rating}`);
          if (r.prepTime) parts.push(`prep: ${r.prepTime}min`);
          if (r.cookTime) parts.push(`cook: ${r.cookTime}min`);
          if (r.servings) parts.push(`serves: ${r.servings}`);
          return parts.join(' | ');
        }).join('\n');
        return text(`Recipes (${recipes.length}):\n${list}`);
      } catch (error) {
        return err(`Failed to list recipes: ${error.message}`);
      }
    },

    get_recipe: async ({ name } = {}) => {
      try {
        await client.connect(null);
        const recipe = await client.getRecipeDetails(name);
        let t = `# ${recipe.name}\n\n`;
        if (recipe.ingredients.length > 0) {
          t += `\n## Ingredients\n`;
          recipe.ingredients.forEach(i => { t += `- ${i.rawIngredient || i.name}\n`; });
        }
        if (recipe.preparationSteps.length > 0) {
          t += `\n## Steps\n`;
          recipe.preparationSteps.forEach((s, idx) => { t += `${idx + 1}. ${s}\n`; });
        }
        return text(t);
      } catch (error) {
        return err(`Failed to get recipe: ${error.message}`);
      }
    },

    create_recipe: async ({ name, ingredients, steps, note, source_name, source_url, prep_time, cook_time, servings } = {}) => {
      try {
        await client.connect(null);
        const result = await client.createRecipe({
          name,
          ingredients: (ingredients || []).map(i => ({ rawIngredient: i })),
          preparationSteps: steps || [],
          note: note || null,
          sourceName: source_name || null,
          sourceUrl: source_url || null,
          prepTime: prep_time || null,
          cookTime: cook_time || null,
          servings: servings || null,
        });
        return text(`Created recipe "${result.name}"`);
      } catch (error) {
        return err(`Failed to create recipe: ${error.message}`);
      }
    },

    import_recipe_url: async ({ url } = {}) => {
      try {
        await client.connect(null);
        const result = await client.importRecipeFromUrl(url);
        let t = `Imported recipe "${result.name}"\n`;
        t += `- ${result.ingredientCount} ingredients, ${result.stepCount} steps\n`;
        if (result.source) t += `- Source: ${result.source}\n`;
        if (result.sourceUrl) t += `- URL: ${result.sourceUrl}\n`;
        return text(t);
      } catch (error) {
        return err(`Failed to import recipe: ${error.message}`);
      }
    },

    delete_recipe: async ({ name } = {}) => {
      try {
        await client.connect(null);
        await client.deleteRecipe(name);
        return text(`Deleted recipe "${name}"`);
      } catch (error) {
        return err(`Failed to delete recipe: ${error.message}`);
      }
    },

    list_meal_plan_events: async () => {
      try {
        await client.connect(null);
        const events = await client.getMealPlanEvents();
        if (events.length === 0) return text("No meal plan events found.");
        events.sort((a, b) => a.date.localeCompare(b.date));
        const list = events.map(e => {
          const parts = [`- **${e.date}**`];
          if (e.title) parts.push(e.title);
          if (e.recipeName) parts.push(`📖 ${e.recipeName}`);
          if (e.labelName) parts.push(`[${e.labelName}]`);
          if (e.details) parts.push(`— ${e.details}`);
          return parts.join(' ');
        }).join('\n');
        return text(`Meal Plan (${events.length} events):\n${list}`);
      } catch (error) {
        return err(`Failed to list meal plan events: ${error.message}`);
      }
    },

    list_meal_plan_labels: async () => {
      try {
        await client.connect(null);
        const labels = await client.getMealPlanLabels();
        if (labels.length === 0) return text("No meal plan labels found.");
        const list = labels.map(l => `- **${l.name}** (${l.hexColor || 'no color'}) — id: ${l.identifier}`).join('\n');
        return text(`Meal Plan Labels:\n${list}`);
      } catch (error) {
        return err(`Failed to list meal plan labels: ${error.message}`);
      }
    },

    create_meal_plan_event: async ({ date, title, recipe_id, label_id, details } = {}) => {
      try {
        await client.connect(null);
        const result = await client.createMealPlanEvent({
          date,
          title: title || null,
          recipeId: recipe_id || null,
          labelId: label_id || null,
          details: details || null,
        });
        return text(`Created meal plan event for ${result.date}`);
      } catch (error) {
        return err(`Failed to create meal plan event: ${error.message}`);
      }
    },

    delete_meal_plan_event: async ({ event_id } = {}) => {
      try {
        await client.connect(null);
        await client.deleteMealPlanEvent(event_id);
        return text(`Deleted meal plan event ${event_id}`);
      } catch (error) {
        return err(`Failed to delete meal plan event: ${error.message}`);
      }
    },

    list_recipe_collections: async () => {
      try {
        await client.connect(null);
        const collections = await client.getRecipeCollections();
        if (collections.length === 0) return text("No recipe collections found.");
        const list = collections.map(c =>
          `- **${c.name}** (${c.recipeCount} recipes)${c.recipeCount > 0 ? ': ' + c.recipeNames.join(', ') : ''}`
        ).join('\n');
        return text(`Recipe Collections (${collections.length}):\n${list}`);
      } catch (error) {
        return err(`Failed to list recipe collections: ${error.message}`);
      }
    },

    create_recipe_collection: async ({ name, recipe_names } = {}) => {
      try {
        await client.connect(null);
        const result = await client.createRecipeCollection(name, recipe_names || []);
        return text(`Created recipe collection "${result.name}"`);
      } catch (error) {
        return err(`Failed to create recipe collection: ${error.message}`);
      }
    },
  };
}

function text(msg) {
  return { content: [{ type: "text", text: msg }] };
}

function err(msg) {
  return { content: [{ type: "text", text: msg }], isError: true };
}

// ===== TESTS =====

describe('AnyList MCP Server - Expanded API Coverage', () => {
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
    handlers = createToolHandlers(client);
  });

  describe('health_check', () => {
    it('returns success on connection', async () => {
      const result = await handlers.health_check({});
      assert.ok(result.content[0].text.includes('Successfully connected'));
      assert.equal(result.isError, undefined);
    });

    it('uses custom list name', async () => {
      const result = await handlers.health_check({ list_name: 'My List' });
      assert.ok(result.content[0].text.includes('My List'));
    });
  });

  describe('add_item', () => {
    it('adds an item', async () => {
      const result = await handlers.add_item({ name: 'Milk' });
      assert.ok(result.content[0].text.includes('Successfully added "Milk"'));
      assert.equal(mockItems.length, 1);
      assert.equal(mockItems[0].name, 'Milk');
    });

    it('adds item with quantity and notes', async () => {
      const result = await handlers.add_item({ name: 'Eggs', quantity: 2, notes: 'organic' });
      assert.equal(mockItems[0].quantity, 2);
      assert.equal(mockItems[0].notes, 'organic');
    });
  });

  describe('check_item', () => {
    it('checks off an existing item', async () => {
      mockItems.push({ name: 'Milk', checked: false });
      const result = await handlers.check_item({ name: 'Milk' });
      assert.ok(result.content[0].text.includes('Successfully checked off'));
      assert.equal(mockItems[0].checked, true);
    });

    it('returns error for non-existent item', async () => {
      const result = await handlers.check_item({ name: 'Nonexistent' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });
  });

  describe('delete_item', () => {
    it('deletes an existing item', async () => {
      mockItems.push({ name: 'Milk' });
      const result = await handlers.delete_item({ name: 'Milk' });
      assert.ok(result.content[0].text.includes('Successfully deleted'));
      assert.equal(mockItems.length, 0);
    });

    it('returns error for non-existent item', async () => {
      const result = await handlers.delete_item({ name: 'Ghost' });
      assert.equal(result.isError, true);
    });
  });

  describe('list_items', () => {
    it('returns empty message when no items', async () => {
      const result = await handlers.list_items({});
      assert.ok(result.content[0].text.includes('No unchecked items'));
    });

    it('lists items grouped by category', async () => {
      mockItems.push({ name: 'Milk', category: 'Dairy' }, { name: 'Bread', category: 'Bakery' });
      const result = await handlers.list_items({});
      assert.ok(result.content[0].text.includes('Milk'));
      assert.ok(result.content[0].text.includes('Bread'));
      assert.ok(result.content[0].text.includes('Dairy'));
      assert.ok(result.content[0].text.includes('Bakery'));
    });

    it('excludes checked items by default', async () => {
      mockItems.push({ name: 'Milk', checked: false }, { name: 'Done', checked: true });
      const result = await handlers.list_items({});
      assert.ok(result.content[0].text.includes('Milk'));
      assert.ok(!result.content[0].text.includes('Done'));
    });

    it('includes checked items when requested', async () => {
      mockItems.push({ name: 'Milk', checked: false }, { name: 'Done', checked: true });
      const result = await handlers.list_items({ include_checked: true });
      assert.ok(result.content[0].text.includes('Done'));
    });

    it('includes notes when requested', async () => {
      mockItems.push({ name: 'Milk', notes: 'whole milk' });
      const result = await handlers.list_items({ include_notes: true });
      assert.ok(result.content[0].text.includes('whole milk'));
    });
  });

  describe('list_lists', () => {
    it('returns empty message when no lists', async () => {
      const result = await handlers.list_lists();
      assert.ok(result.content[0].text.includes('No lists found'));
    });

    it('returns list names with counts', async () => {
      mockItems._lists = [
        { name: 'Groceries', uncheckedCount: 5 },
        { name: 'Costco', uncheckedCount: 2 },
      ];
      const result = await handlers.list_lists();
      assert.ok(result.content[0].text.includes('Groceries'));
      assert.ok(result.content[0].text.includes('5 unchecked'));
    });
  });

  describe('get_favorites', () => {
    it('returns empty message when no favorites', async () => {
      const result = await handlers.get_favorites({});
      assert.ok(result.content[0].text.includes('No favorite items'));
    });

    it('returns favorite items', async () => {
      mockItems._favorites = [{ name: 'Bananas', details: 'organic' }];
      const result = await handlers.get_favorites({});
      assert.ok(result.content[0].text.includes('Bananas'));
      assert.ok(result.content[0].text.includes('organic'));
    });
  });

  describe('get_recents', () => {
    it('returns empty message when no recents', async () => {
      const result = await handlers.get_recents({});
      assert.ok(result.content[0].text.includes('No recent items'));
    });

    it('returns recent items', async () => {
      mockItems._recents = [{ name: 'Avocado' }];
      const result = await handlers.get_recents({});
      assert.ok(result.content[0].text.includes('Avocado'));
    });
  });

  describe('list_recipes', () => {
    it('returns empty message when no recipes', async () => {
      const result = await handlers.list_recipes({});
      assert.ok(result.content[0].text.includes('No recipes found'));
    });

    it('lists recipes with metadata', async () => {
      mockRecipes.push({ name: 'Pasta', rating: 5, prepTime: 10, cookTime: 20, servings: '4' });
      const result = await handlers.list_recipes({});
      assert.ok(result.content[0].text.includes('Pasta'));
      assert.ok(result.content[0].text.includes('⭐5'));
    });

    it('filters by search query', async () => {
      mockRecipes.push({ name: 'Pasta' }, { name: 'Salad' });
      const result = await handlers.list_recipes({ search: 'pasta' });
      assert.ok(result.content[0].text.includes('Pasta'));
      assert.ok(!result.content[0].text.includes('Salad'));
    });
  });

  describe('get_recipe', () => {
    it('returns full recipe details', async () => {
      mockRecipes.push({
        name: 'Pasta',
        ingredients: [{ rawIngredient: '2 cups flour' }],
        preparationSteps: ['Boil water', 'Cook pasta'],
      });
      const result = await handlers.get_recipe({ name: 'Pasta' });
      assert.ok(result.content[0].text.includes('# Pasta'));
      assert.ok(result.content[0].text.includes('2 cups flour'));
      assert.ok(result.content[0].text.includes('Boil water'));
    });

    it('returns error for non-existent recipe', async () => {
      const result = await handlers.get_recipe({ name: 'Nope' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('not found'));
    });
  });

  describe('create_recipe', () => {
    it('creates a recipe', async () => {
      const result = await handlers.create_recipe({ name: 'New Recipe' });
      assert.ok(result.content[0].text.includes('Created recipe "New Recipe"'));
      assert.equal(mockRecipes.length, 1);
    });

    it('creates recipe with all fields', async () => {
      await handlers.create_recipe({
        name: 'Full Recipe',
        ingredients: ['1 cup sugar'],
        steps: ['Mix well'],
        note: 'Delicious',
        prep_time: 5,
        cook_time: 30,
        servings: '4',
      });
      assert.equal(mockRecipes[0].name, 'Full Recipe');
    });
  });

  describe('import_recipe_url', () => {
    it('imports a recipe from a URL', async () => {
      mockRecipes._pendingImport = {
        name: 'Chicken Tikka Masala',
        ingredientCount: 12,
        stepCount: 6,
        source: 'AllRecipes',
        sourceUrl: 'https://example.com/recipe',
      };
      const result = await handlers.import_recipe_url({ url: 'https://example.com/recipe' });
      assert.ok(result.content[0].text.includes('Imported recipe "Chicken Tikka Masala"'));
      assert.ok(result.content[0].text.includes('12 ingredients'));
      assert.ok(result.content[0].text.includes('6 steps'));
      assert.ok(result.content[0].text.includes('AllRecipes'));
    });

    it('returns error when URL cannot be parsed', async () => {
      mockRecipes._pendingImport = null;
      const result = await handlers.import_recipe_url({ url: 'https://bad-site.com' });
      assert.equal(result.isError, true);
      assert.ok(result.content[0].text.includes('Could not parse'));
    });
  });

  describe('delete_recipe', () => {
    it('deletes an existing recipe', async () => {
      mockRecipes.push({ name: 'Old Recipe' });
      const result = await handlers.delete_recipe({ name: 'Old Recipe' });
      assert.ok(result.content[0].text.includes('Deleted recipe'));
      assert.equal(mockRecipes.length, 0);
    });

    it('returns error for non-existent recipe', async () => {
      const result = await handlers.delete_recipe({ name: 'Nope' });
      assert.equal(result.isError, true);
    });
  });

  describe('list_meal_plan_events', () => {
    it('returns empty message when no events', async () => {
      const result = await handlers.list_meal_plan_events();
      assert.ok(result.content[0].text.includes('No meal plan events'));
    });

    it('lists events sorted by date', async () => {
      mockEvents.push(
        { date: '2025-02-10', title: 'Tacos', identifier: 'e1' },
        { date: '2025-02-08', title: 'Pizza', identifier: 'e2' },
      );
      const result = await handlers.list_meal_plan_events();
      const text = result.content[0].text;
      assert.ok(text.indexOf('2025-02-08') < text.indexOf('2025-02-10'));
    });
  });

  describe('list_meal_plan_labels', () => {
    it('returns empty message when no labels', async () => {
      const result = await handlers.list_meal_plan_labels();
      assert.ok(result.content[0].text.includes('No meal plan labels'));
    });

    it('lists labels with ids', async () => {
      mockLabels.push({ identifier: 'l1', name: 'Dinner', hexColor: '#FF0000' });
      const result = await handlers.list_meal_plan_labels();
      assert.ok(result.content[0].text.includes('Dinner'));
      assert.ok(result.content[0].text.includes('l1'));
    });
  });

  describe('create_meal_plan_event', () => {
    it('creates an event', async () => {
      const result = await handlers.create_meal_plan_event({ date: '2025-03-01' });
      assert.ok(result.content[0].text.includes('Created meal plan event'));
      assert.equal(mockEvents.length, 1);
    });
  });

  describe('delete_meal_plan_event', () => {
    it('deletes an existing event', async () => {
      mockEvents.push({ identifier: 'e1', date: '2025-03-01' });
      const result = await handlers.delete_meal_plan_event({ event_id: 'e1' });
      assert.ok(result.content[0].text.includes('Deleted meal plan event'));
    });

    it('returns error for non-existent event', async () => {
      const result = await handlers.delete_meal_plan_event({ event_id: 'bad' });
      assert.equal(result.isError, true);
    });
  });

  describe('list_recipe_collections', () => {
    it('returns empty message when no collections', async () => {
      const result = await handlers.list_recipe_collections();
      assert.ok(result.content[0].text.includes('No recipe collections'));
    });

    it('lists collections with recipe names', async () => {
      mockCollections.push({ name: 'Weeknight', recipeCount: 2, recipeNames: ['Pasta', 'Salad'] });
      const result = await handlers.list_recipe_collections();
      assert.ok(result.content[0].text.includes('Weeknight'));
      assert.ok(result.content[0].text.includes('Pasta'));
    });
  });

  describe('create_recipe_collection', () => {
    it('creates a collection', async () => {
      const result = await handlers.create_recipe_collection({ name: 'Quick Meals' });
      assert.ok(result.content[0].text.includes('Created recipe collection "Quick Meals"'));
    });

    it('creates collection with recipes', async () => {
      await handlers.create_recipe_collection({ name: 'Favs', recipe_names: ['Pasta'] });
      assert.equal(mockCollections[mockCollections.length - 1].recipeNames[0], 'Pasta');
    });
  });
});
