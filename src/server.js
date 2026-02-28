import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import AnyListClient from "./anylist-client.js";
import { normalizeRecipe } from "./recipe-normalizer.js";

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

// ===== Elicitation helpers =====

/**
 * Check if the connected client supports elicitation.
 */
function clientSupportsElicitation() {
  try {
    const caps = server.server.getClientCapabilities();
    return !!(caps && caps.elicitation);
  } catch {
    return false;
  }
}

/**
 * Elicit user input or fall back to an error message.
 * Returns the accepted content object, or throws with fallbackError.
 * If user declines/cancels, throws with a descriptive message.
 */
async function elicitOrError(message, schema, fallbackError) {
  if (!clientSupportsElicitation()) {
    throw new Error(fallbackError);
  }
  const result = await server.server.elicitInput({
    message,
    requestedSchema: schema,
  });
  if (result.action === "accept" && result.content) {
    return result.content;
  }
  if (result.action === "decline") {
    throw new Error("User declined to provide input.");
  }
  // cancel
  throw new Error("User cancelled the operation.");
}

/**
 * Elicit a list selection when list_name is not provided.
 * Returns the chosen list name.
 */
async function elicitListName(lists) {
  const listNames = lists.map(l => l.name);
  const content = await elicitOrError(
    `Which list? Available lists:\n${listNames.map(n => `- ${n}`).join("\n")}`,
    {
      type: "object",
      properties: {
        list: { type: "string", enum: listNames, description: "The list to use" }
      },
      required: ["list"]
    },
    `Multiple lists available (${listNames.join(", ")}). Please specify a list_name.`
  );
  return content.list;
}

/**
 * Elicit item disambiguation when multiple partial matches exist.
 * Returns the chosen item name.
 */
async function elicitItemChoice(itemName, matchingNames) {
  const content = await elicitOrError(
    `Multiple items match "${itemName}". Which one did you mean?`,
    {
      type: "object",
      properties: {
        item: { type: "string", enum: matchingNames, description: "The item to select" }
      },
      required: ["item"]
    },
    `Multiple items match "${itemName}": ${matchingNames.join(", ")}. Please specify the exact item name.`
  );
  return content.item;
}

/**
 * Elicit a confirmation (boolean).
 * Returns true if confirmed, false otherwise.
 */
async function elicitConfirmation(message) {
  const content = await elicitOrError(
    message,
    {
      type: "object",
      properties: {
        confirm: { type: "boolean", description: "Confirm the action" }
      },
      required: ["confirm"]
    },
    message + " (cannot confirm without elicitation support)"
  );
  return content.confirm;
}

/**
 * Elicit a missing required string field.
 * Returns the provided value.
 */
async function elicitRequiredField(fieldName, message) {
  const content = await elicitOrError(
    message,
    {
      type: "object",
      properties: {
        [fieldName]: { type: "string", description: `The ${fieldName} to provide` }
      },
      required: [fieldName]
    },
    `Missing required parameter "${fieldName}". ${message}`
  );
  return content[fieldName];
}

/**
 * Find items on the current list that partially match a name (case-insensitive).
 */
function findPartialMatches(itemName) {
  const items = anylistClient.targetList.items || [];
  const lower = itemName.toLowerCase();
  return items
    .filter(i => !i.checked && i.name.toLowerCase().includes(lower))
    .map(i => i.name);
}

/**
 * Resolve an item name: exact match first, then partial match with disambiguation.
 */
async function resolveItemName(itemName) {
  // Try exact match first
  const exact = anylistClient.targetList.getItemByName(itemName);
  if (exact) return itemName;

  // Try partial matches
  const matches = findPartialMatches(itemName);
  if (matches.length === 0) {
    throw new Error(`Item "${itemName}" not found in list`);
  }
  if (matches.length === 1) {
    return matches[0];
  }
  // Multiple matches — elicit
  return await elicitItemChoice(itemName, matches);
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
        // Elicit list name if not provided and multiple lists exist
        let resolvedListName = list_name;
        if (!resolvedListName && !process.env.ANYLIST_LIST_NAME) {
          await anylistClient.connect(null);
          const lists = anylistClient.getLists();
          if (lists.length > 1) {
            resolvedListName = await elicitListName(lists);
          }
        }
        await anylistClient.connect(resolvedListName);
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
        let itemName = name;
        if (!itemName) {
          itemName = await elicitRequiredField("name", "What item would you like to add?");
        }
        await anylistClient.connect(list_name);
        await anylistClient.addItem(itemName, quantity || 1, notes || null);
        return textResponse(`Successfully added "${itemName}" to list "${anylistClient.targetList.name}"`);
      }
      case "check_item": {
        let itemName = name;
        if (!itemName) {
          itemName = await elicitRequiredField("name", "What item would you like to check off?");
        }
        await anylistClient.connect(list_name);
        const resolvedCheck = await resolveItemName(itemName);
        await anylistClient.removeItem(resolvedCheck);
        return textResponse(`Successfully checked off "${resolvedCheck}" from list "${anylistClient.targetList.name}"`);
      }
      case "delete_item": {
        let itemName = name;
        if (!itemName) {
          itemName = await elicitRequiredField("name", "What item would you like to delete?");
        }
        await anylistClient.connect(list_name);
        const resolvedDelete = await resolveItemName(itemName);
        await anylistClient.deleteItem(resolvedDelete);
        return textResponse(`Successfully deleted "${resolvedDelete}" from list "${anylistClient.targetList.name}"`);
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
- delete: Delete a recipe by name
- import_url: Import a recipe from a website URL (parses ingredients, steps, etc.)
- normalize: Preview/parse a recipe from a URL or raw text without saving (set save=true to also save)`,
  inputSchema: {
    action: z.enum(["list", "get", "create", "delete", "import_url", "normalize"]).describe("The recipe action to perform"),
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
    url: z.string().optional().describe("URL to import recipe from (import_url, normalize)"),
    text: z.string().optional().describe("Raw recipe text to parse (normalize only)"),
    save: z.boolean().optional().describe("If true, also save normalized recipe to AnyList (normalize only, default false)"),
  }
}, async (params) => {
  const { action, name, search, ingredients, steps, note, source_name, source_url, prep_time, cook_time, servings, url, text: recipeText, save: saveRecipe } = params;
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
        let getRecipeName = name;
        if (!getRecipeName) {
          getRecipeName = await elicitRequiredField("name", "Which recipe would you like to view?");
        }
        const recipe = await anylistClient.getRecipeDetails(getRecipeName);
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
        let recipeName = name;
        if (!recipeName) {
          recipeName = await elicitRequiredField("name", "What should the recipe be called?");
        }
        // Check if recipe already exists
        const existingRecipes = await anylistClient.getRecipes(recipeName);
        const exactMatch = existingRecipes.find(r => r.name.toLowerCase() === recipeName.toLowerCase());
        if (exactMatch) {
          const confirmed = await elicitConfirmation(`Recipe "${exactMatch.name}" already exists. Overwrite?`);
          if (!confirmed) {
            return textResponse(`Cancelled — recipe "${exactMatch.name}" was not overwritten.`);
          }
          // Delete existing before recreating
          await anylistClient.deleteRecipe(exactMatch.name);
        }
        const result = await anylistClient.createRecipe({
          name: recipeName,
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
        let deleteRecipeName = name;
        if (!deleteRecipeName) {
          deleteRecipeName = await elicitRequiredField("name", "Which recipe would you like to delete?");
        }
        await anylistClient.deleteRecipe(deleteRecipeName);
        return textResponse(`Deleted recipe "${deleteRecipeName}"`);
      }
      case "import_url": {
        let importUrl = url;
        if (!importUrl) {
          importUrl = await elicitRequiredField("url", "What URL would you like to import a recipe from?");
        }
        const result = await anylistClient.importRecipeFromUrl(importUrl);
        let importText = `Imported recipe "${result.name}"\n`;
        importText += `- ${result.ingredientCount} ingredients, ${result.stepCount} steps\n`;
        if (result.source) importText += `- Source: ${result.source}\n`;
        if (result.sourceUrl) importText += `- URL: ${result.sourceUrl}\n`;
        if (result.method) importText += `- Method: ${result.method}\n`;
        return textResponse(importText);
      }
      case "normalize": {
        if (!url && !recipeText) {
          throw new Error('Action "normalize" requires either "url" or "text" parameter');
        }
        const input = {};
        if (url) input.url = url;
        if (recipeText) input.text = recipeText;
        const normalized = await normalizeRecipe(input);

        let output = `# ${normalized.name}\n\n`;
        if (normalized.sourceName) output += `Source: ${normalized.sourceName}\n`;
        if (normalized.sourceUrl) output += `URL: ${normalized.sourceUrl}\n`;
        if (normalized.prepTime) output += `Prep: ${normalized.prepTime}\n`;
        if (normalized.cookTime) output += `Cook: ${normalized.cookTime}\n`;
        if (normalized.servings) output += `Servings: ${normalized.servings}\n`;
        if (normalized.note) output += `Note: ${normalized.note}\n`;

        output += `\n## Ingredients (${normalized.ingredients.length})\n`;
        normalized.ingredients.forEach(i => { output += `- ${i.rawIngredient}\n`; });

        output += `\n## Steps (${normalized.preparationSteps.length})\n`;
        normalized.preparationSteps.forEach((s, idx) => { output += `${idx + 1}. ${s}\n`; });

        if (saveRecipe) {
          await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
          const created = await anylistClient.createRecipe({
            name: normalized.name,
            ingredients: normalized.ingredients,
            preparationSteps: normalized.preparationSteps,
            note: normalized.note,
            sourceName: normalized.sourceName,
            sourceUrl: normalized.sourceUrl,
            prepTime: normalized.prepTime,
            cookTime: normalized.cookTime,
            servings: normalized.servings,
          });
          output += `\n✅ Saved to AnyList as "${created.name}"`;
        }

        return textResponse(output);
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
        if (!params.date) {
          params.date = await elicitRequiredField("date", "What date for the meal plan event? (YYYY-MM-DD)");
        }
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
        if (!params.event_id) {
          params.event_id = await elicitRequiredField("event_id", "Which event ID should be deleted?");
        }
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
        let collectionName = name;
        if (!collectionName) {
          collectionName = await elicitRequiredField("name", "What should the collection be called?");
        }
        const result = await anylistClient.createRecipeCollection(collectionName, recipe_names || []);
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
