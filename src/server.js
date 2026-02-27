import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import AnyListClient from "./anylist-client.js";

dotenv.config();

const anylistClient = new AnyListClient();

const originalConsoleLog = console.log;
console.log = console.error;
console.info = console.error;

const server = new McpServer({
  name: "anylist-mcp-server",
  version: "2.0.0",
});

// Helper: standard error response
function errorResponse(msg) {
  return { content: [{ type: "text", text: msg }], isError: true };
}

// Helper: standard text response
function textResponse(msg) {
  return { content: [{ type: "text", text: msg }] };
}

// Helper: require params for an action
function requireParams(params, required, action) {
  for (const key of required) {
    if (params[key] === undefined || params[key] === null || params[key] === "") {
      throw new Error(`Action "${action}" requires parameter "${key}"`);
    }
  }
}

// ===== health_check (standalone) =====
server.registerTool("health_check", {
  title: "AnyList Connection Test",
  description: "Test connection to AnyList and access to target shopping list",
  inputSchema: {
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ list_name }) => {
  try {
    await anylistClient.connect(list_name);
    return textResponse(`Successfully connected to AnyList and found list: "${anylistClient.targetList.name}"`);
  } catch (error) {
    return errorResponse(`Failed to connect to AnyList: ${error.message}`);
  }
});

// ===== shopping — List & item management =====
server.registerTool("shopping", {
  title: "Shopping Lists & Items",
  description: `Manage AnyList shopping lists and items. Actions:
- list_lists: Show all lists with item counts
- list_items: Show items on a list (grouped by category)
- add_item: Add an item to a list
- check_item: Check off (complete) an item
- delete_item: Permanently remove an item from a list
- get_favorites: Get favorite items for a list
- get_recents: Get recently added items for a list`,
  inputSchema: {
    action: z.enum(["list_lists", "list_items", "add_item", "check_item", "delete_item", "get_favorites", "get_recents"]).describe("The shopping action to perform"),
    list_name: z.string().optional().describe("Name of the list (defaults to ANYLIST_LIST_NAME env var)"),
    name: z.string().optional().describe("Item name (required for add_item, check_item, delete_item)"),
    quantity: z.number().min(1).optional().describe("Item quantity (add_item only, defaults to 1)"),
    notes: z.string().optional().describe("Notes for the item (add_item only)"),
    include_checked: z.boolean().optional().describe("Include checked-off items (list_items only, default false)"),
    include_notes: z.boolean().optional().describe("Include notes for each item (list_items only, default false)"),
  }
}, async (params) => {
  const { action, list_name, name, quantity, notes, include_checked, include_notes } = params;
  try {
    switch (action) {
      case "list_lists": {
        await anylistClient.connect(list_name || process.env.ANYLIST_LIST_NAME || null);
        const lists = anylistClient.getLists();
        if (lists.length === 0) return textResponse("No lists found in the account.");
        const output = lists.map(l => `- ${l.name} (${l.uncheckedCount} unchecked items)`).join("\n");
        return textResponse(`Available lists (${lists.length}):\n${output}`);
      }
      case "list_items": {
        await anylistClient.connect(list_name);
        const items = await anylistClient.getItems(include_checked || false, include_notes || false);
        if (items.length === 0) {
          return textResponse(include_checked
            ? `List "${anylistClient.targetList.name}" is empty.`
            : `No unchecked items on list "${anylistClient.targetList.name}".`);
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
        return textResponse(`Shopping list "${anylistClient.targetList.name}" (${items.length} items):\n${itemList}`);
      }
      case "add_item": {
        requireParams(params, ["name"], action);
        await anylistClient.connect(list_name);
        await anylistClient.addItem(name, quantity || 1, notes || null);
        return textResponse(`Successfully added "${name}" to list "${anylistClient.targetList.name}"`);
      }
      case "check_item": {
        requireParams(params, ["name"], action);
        await anylistClient.connect(list_name);
        await anylistClient.removeItem(name);
        return textResponse(`Successfully checked off "${name}" from list "${anylistClient.targetList.name}"`);
      }
      case "delete_item": {
        requireParams(params, ["name"], action);
        await anylistClient.connect(list_name);
        await anylistClient.deleteItem(name);
        return textResponse(`Successfully deleted "${name}" from list "${anylistClient.targetList.name}"`);
      }
      case "get_favorites": {
        await anylistClient.connect(list_name || process.env.ANYLIST_LIST_NAME || null);
        const items = await anylistClient.getFavoriteItems(list_name);
        if (items.length === 0) return textResponse(`No favorite items for list "${anylistClient.targetList.name}".`);
        const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
        return textResponse(`Favorite items for "${anylistClient.targetList.name}" (${items.length}):\n${list}`);
      }
      case "get_recents": {
        await anylistClient.connect(list_name || process.env.ANYLIST_LIST_NAME || null);
        const items = await anylistClient.getRecentItems(list_name);
        if (items.length === 0) return textResponse(`No recent items for list "${anylistClient.targetList.name}".`);
        const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
        return textResponse(`Recent items for "${anylistClient.targetList.name}" (${items.length}):\n${list}`);
      }
    }
  } catch (error) {
    return errorResponse(`Shopping ${action} failed: ${error.message}`);
  }
});

// ===== recipes — Recipe CRUD =====
server.registerTool("recipes", {
  title: "Recipes",
  description: `Manage AnyList recipes. Actions:
- list: Browse recipes (returns summaries: name, rating, times, servings). Use 'search' to filter.
- get: Get full recipe details (ingredients, steps) by name
- create: Create a new recipe
- delete: Delete a recipe by name`,
  inputSchema: {
    action: z.enum(["list", "get", "create", "delete"]).describe("The recipe action to perform"),
    name: z.string().optional().describe("Recipe name (required for get, create, delete)"),
    search: z.string().optional().describe("Search query to filter recipes (list only)"),
    ingredients: z.array(z.string()).optional().describe("Ingredient strings, e.g. '2 cups flour' (create only)"),
    steps: z.array(z.string()).optional().describe("Preparation steps in order (create only)"),
    note: z.string().optional().describe("Recipe notes (create only)"),
    source_name: z.string().optional().describe("Source name (create only)"),
    source_url: z.string().optional().describe("Source URL (create only)"),
    prep_time: z.number().optional().describe("Prep time in minutes (create only)"),
    cook_time: z.number().optional().describe("Cook time in minutes (create only)"),
    servings: z.string().optional().describe("Servings, e.g. '4' or '4-6' (create only)"),
  }
}, async (params) => {
  const { action, name, search, ingredients, steps, note, source_name, source_url, prep_time, cook_time, servings } = params;
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    switch (action) {
      case "list": {
        const recipes = await anylistClient.getRecipes(search || null);
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
        const recipe = await anylistClient.getRecipeDetails(name);
        let text = `# ${recipe.name}\n\n`;
        if (recipe.sourceName) text += `Source: ${recipe.sourceName}\n`;
        if (recipe.sourceUrl) text += `URL: ${recipe.sourceUrl}\n`;
        if (recipe.rating) text += `Rating: ${'⭐'.repeat(recipe.rating)}\n`;
        if (recipe.prepTime) text += `Prep: ${recipe.prepTime} min\n`;
        if (recipe.cookTime) text += `Cook: ${recipe.cookTime} min\n`;
        if (recipe.servings) text += `Servings: ${recipe.servings}\n`;
        if (recipe.note) text += `\nNotes: ${recipe.note}\n`;
        if (recipe.ingredients.length > 0) {
          text += `\n## Ingredients\n`;
          recipe.ingredients.forEach(i => {
            text += `- ${i.rawIngredient || [i.quantity, i.name, i.note].filter(Boolean).join(' ')}\n`;
          });
        }
        if (recipe.preparationSteps.length > 0) {
          text += `\n## Steps\n`;
          recipe.preparationSteps.forEach((s, idx) => { text += `${idx + 1}. ${s}\n`; });
        }
        return textResponse(text);
      }
      case "create": {
        requireParams(params, ["name"], action);
        const result = await anylistClient.createRecipe({
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
        return textResponse(`Created recipe "${result.name}"`);
      }
      case "delete": {
        requireParams(params, ["name"], action);
        await anylistClient.deleteRecipe(name);
        return textResponse(`Deleted recipe "${name}"`);
      }
    }
  } catch (error) {
    return errorResponse(`Recipes ${action} failed: ${error.message}`);
  }
});

// ===== meal_plan — Meal planning calendar =====
server.registerTool("meal_plan", {
  title: "Meal Plan",
  description: `Manage AnyList meal planning calendar. Actions:
- list_events: Show all meal plan events (sorted by date)
- list_labels: Show available labels (Breakfast, Lunch, Dinner, etc.) with IDs
- create_event: Add a meal plan event for a date
- delete_event: Delete a meal plan event by ID`,
  inputSchema: {
    action: z.enum(["list_events", "list_labels", "create_event", "delete_event"]).describe("The meal plan action to perform"),
    date: z.string().optional().describe("Date in YYYY-MM-DD format (required for create_event)"),
    title: z.string().optional().describe("Event title (create_event; use this OR recipe_id)"),
    recipe_id: z.string().optional().describe("Recipe ID to link (create_event)"),
    label_id: z.string().optional().describe("Label ID for meal type (create_event)"),
    details: z.string().optional().describe("Additional notes (create_event)"),
    event_id: z.string().optional().describe("Event ID to delete (required for delete_event)"),
  }
}, async (params) => {
  const { action, date, title, recipe_id, label_id, details, event_id } = params;
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    switch (action) {
      case "list_events": {
        const events = await anylistClient.getMealPlanEvents();
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
        const labels = await anylistClient.getMealPlanLabels();
        if (labels.length === 0) return textResponse("No meal plan labels found.");
        const list = labels.map(l => `- **${l.name}** (${l.hexColor || 'no color'}) — id: ${l.identifier}`).join('\n');
        return textResponse(`Meal Plan Labels:\n${list}`);
      }
      case "create_event": {
        requireParams(params, ["date"], action);
        const result = await anylistClient.createMealPlanEvent({
          date,
          title: title || null,
          recipeId: recipe_id || null,
          labelId: label_id || null,
          details: details || null,
        });
        return textResponse(`Created meal plan event for ${result.date}`);
      }
      case "delete_event": {
        requireParams(params, ["event_id"], action);
        await anylistClient.deleteMealPlanEvent(event_id);
        return textResponse(`Deleted meal plan event ${event_id}`);
      }
    }
  } catch (error) {
    return errorResponse(`Meal plan ${action} failed: ${error.message}`);
  }
});

// ===== recipe_collections — Recipe organization =====
server.registerTool("recipe_collections", {
  title: "Recipe Collections",
  description: `Manage AnyList recipe collections. Actions:
- list: Show all collections with recipe counts and names
- create: Create a new collection, optionally with recipes`,
  inputSchema: {
    action: z.enum(["list", "create"]).describe("The collection action to perform"),
    name: z.string().optional().describe("Collection name (required for create)"),
    recipe_names: z.array(z.string()).optional().describe("Recipe names to include (create only)"),
  }
}, async (params) => {
  const { action, name, recipe_names } = params;
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    switch (action) {
      case "list": {
        const collections = await anylistClient.getRecipeCollections();
        if (collections.length === 0) return textResponse("No recipe collections found.");
        const list = collections.map(c => `- **${c.name}** (${c.recipeCount} recipes)${c.recipeCount > 0 ? ': ' + c.recipeNames.join(', ') : ''}`).join('\n');
        return textResponse(`Recipe Collections (${collections.length}):\n${list}`);
      }
      case "create": {
        requireParams(params, ["name"], action);
        const result = await anylistClient.createRecipeCollection(name, recipe_names || []);
        return textResponse(`Created recipe collection "${result.name}"`);
      }
    }
  } catch (error) {
    return errorResponse(`Recipe collections ${action} failed: ${error.message}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Anylist MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
