import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import AnyListClient from "./anylist-client.js";

// Load environment variables
dotenv.config();



// Create AnyList client
const anylistClient = new AnyListClient();

const originalConsoleLog = console.log;
console.log = console.error;
console.info = console.error;

// Create the MCP server
const server = new McpServer({
  name: "anylist-mcp-server",
  version: "1.1.0",
});


// Register AnyList connection test tool
server.registerTool("health_check", {
  title: "AnyList Connection Test",
  description: "Test connection to AnyList and access to target shopping list",
  inputSchema: {
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ list_name }) => {
  try {
    await anylistClient.connect(list_name);
    return {
      content: [
        {
          type: "text",
          text: `Successfully connected to AnyList and found list: "${anylistClient.targetList.name}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to connect to AnyList: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register add_item tool
server.registerTool("add_item", {
  title: "Add Item to Shopping List",
  description: "Add an item to the AnyList shopping list with optional quantity, notes, and category",
  inputSchema: {
    name: z.string().describe("Name of the item to add"),
    quantity: z.number().min(1).optional().describe("Quantity of the item (optional, defaults to 1)"),
    notes: z.string().optional().describe("Notes to attach to the item (optional)"),
    category: z.string().optional().describe("Category name for the item (e.g. 'Dairy', 'Produce'). Use list_categories tool to see available options."),
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ name, quantity, notes, category, list_name }) => {
  try {
    await anylistClient.connect(list_name);
    await anylistClient.addItem(name, quantity || 1, notes || null, category || null);
    const catSuffix = category ? ` in category "${category}"` : '';
    return {
      content: [
        {
          type: "text",
          text: `Successfully added "${name}" to list "${anylistClient.targetList.name}"${catSuffix}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to add item: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register list_categories tool
server.registerTool("list_categories", {
  title: "List Shopping List Categories",
  description: "Show available categories for a shopping list (e.g. Dairy, Produce, Bakery)",
  inputSchema: {
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ list_name }) => {
  try {
    await anylistClient.connect(list_name);
    const categories = anylistClient.getCategories();
    if (categories.length === 0) {
      return {
        content: [{ type: "text", text: "No categories found." }],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Available categories (${categories.length}):\n${categories.map(c => `- ${c}`).join('\n')}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to list categories: ${error.message}` }],
      isError: true,
    };
  }
});

// Register check_item tool
server.registerTool("check_item", {
  title: "Check Off Item from Shopping List",
  description: "Mark an item as completed (check it off) on the AnyList shopping list",
  inputSchema: {
    name: z.string().describe("Name of the item to check off"),
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ name, list_name }) => {
  try {
    await anylistClient.connect(list_name);
    await anylistClient.removeItem(name);
    return {
      content: [
        {
          type: "text",
          text: `Successfully checked off "${name}" from list "${anylistClient.targetList.name}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to check off item: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register delete_item tool
server.registerTool("delete_item", {
  title: "Delete Item from Shopping List",
  description: "Permanently remove an item from the AnyList shopping list",
  inputSchema: {
    name: z.string().describe("Name of the item to delete"),
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ name, list_name }) => {
  try {
    await anylistClient.connect(list_name);
    await anylistClient.deleteItem(name);
    return {
      content: [
        {
          type: "text",
          text: `Successfully deleted "${name}" from list "${anylistClient.targetList.name}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to delete item: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register list_items tool
server.registerTool("list_items", {
  title: "List Shopping List Items",
  description: "Get all items from the AnyList shopping list",
  inputSchema: {
    include_checked: z.boolean().optional().describe("Include checked-off items (default: false)"),
    include_notes: z.boolean().optional().describe("Include notes for each item (default: false)"),
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ include_checked, include_notes, list_name }) => {
  try {
    await anylistClient.connect(list_name);
    const items = await anylistClient.getItems(include_checked || false, include_notes || false);

    if (items.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: include_checked
              ? `List "${anylistClient.targetList.name}" is empty.`
              : `No unchecked items on list "${anylistClient.targetList.name}".`,
          },
        ],
      };
    }

    // Group items by category
    const itemsByCategory = {};
    items.forEach(item => {
      const cat = item.category || 'other';
      if (!itemsByCategory[cat]) {
        itemsByCategory[cat] = [];
      }
      itemsByCategory[cat].push(item);
    });

    // Format output grouped by category
    const itemList = Object.keys(itemsByCategory).sort().map(category => {
      const categoryItems = itemsByCategory[category].map(item => {
        const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
        const status = item.checked ? " ✓" : "";
        const note = item.note ? ` [${item.note}]` : "";
        return `  - ${item.name}${qty}${status}${note}`;
      }).join("\n");
      return `**${category}**\n${categoryItems}`;
    }).join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Shopping list "${anylistClient.targetList.name}" (${items.length} items):\n${itemList}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to list items: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register list_lists tool
server.registerTool("list_lists", {
  title: "List Available Lists",
  description: "Get all available lists in the AnyList account with the number of unchecked items in each list",
  inputSchema: {}
}, async () => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    const lists = anylistClient.getLists();

    if (lists.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No lists found in the account.",
          },
        ],
      };
    }

    const listOutput = lists.map(list => `- ${list.name} (${list.uncheckedCount} unchecked items)`).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Available lists (${lists.length}):\n${listOutput}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to list lists: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register get_favorites tool
server.registerTool("get_favorites", {
  title: "Get Favorite Items",
  description: "Get favorite items for a shopping list",
  inputSchema: {
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ list_name }) => {
  try {
    await anylistClient.connect(list_name || process.env.ANYLIST_LIST_NAME || null);
    const items = await anylistClient.getFavoriteItems(list_name);

    if (items.length === 0) {
      return {
        content: [{ type: "text", text: `No favorite items for list "${anylistClient.targetList.name}".` }],
      };
    }

    const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
    return {
      content: [{ type: "text", text: `Favorite items for "${anylistClient.targetList.name}" (${items.length}):\n${list}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to get favorites: ${error.message}` }],
      isError: true,
    };
  }
});

// Register get_recents tool
server.registerTool("get_recents", {
  title: "Get Recent Items",
  description: "Get recently added items for a shopping list",
  inputSchema: {
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ list_name }) => {
  try {
    await anylistClient.connect(list_name || process.env.ANYLIST_LIST_NAME || null);
    const items = await anylistClient.getRecentItems(list_name);

    if (items.length === 0) {
      return {
        content: [{ type: "text", text: `No recent items for list "${anylistClient.targetList.name}".` }],
      };
    }

    const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
    return {
      content: [{ type: "text", text: `Recent items for "${anylistClient.targetList.name}" (${items.length}):\n${list}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to get recents: ${error.message}` }],
      isError: true,
    };
  }
});

// ===== RECIPE TOOLS =====

// Register list_recipes tool
server.registerTool("list_recipes", {
  title: "List Recipes",
  description: "Browse AnyList recipes with optional search filter. Returns summaries (name, rating, times, servings).",
  inputSchema: {
    search: z.string().optional().describe("Search query to filter recipes by name")
  }
}, async ({ search }) => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    const recipes = await anylistClient.getRecipes(search || null);

    if (recipes.length === 0) {
      return {
        content: [{ type: "text", text: search ? `No recipes found matching "${search}".` : "No recipes found." }],
      };
    }

    const list = recipes.map(r => {
      const parts = [`- **${r.name}**`];
      if (r.rating) parts.push(`⭐${r.rating}`);
      if (r.prepTime) parts.push(`prep: ${r.prepTime}min`);
      if (r.cookTime) parts.push(`cook: ${r.cookTime}min`);
      if (r.servings) parts.push(`serves: ${r.servings}`);
      return parts.join(' | ');
    }).join('\n');

    return {
      content: [{ type: "text", text: `Recipes (${recipes.length}):\n${list}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to list recipes: ${error.message}` }],
      isError: true,
    };
  }
});

// Register get_recipe tool
server.registerTool("get_recipe", {
  title: "Get Recipe Details",
  description: "Get full recipe details including ingredients and preparation steps",
  inputSchema: {
    name: z.string().describe("Name of the recipe to retrieve")
  }
}, async ({ name }) => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
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

    return {
      content: [{ type: "text", text }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to get recipe: ${error.message}` }],
      isError: true,
    };
  }
});

// Register create_recipe tool
server.registerTool("create_recipe", {
  title: "Create Recipe",
  description: "Create a new recipe in AnyList",
  inputSchema: {
    name: z.string().describe("Recipe name"),
    ingredients: z.array(z.string()).optional().describe("Ingredient strings, e.g. '2 cups flour'"),
    steps: z.array(z.string()).optional().describe("Preparation steps in order"),
    note: z.string().optional().describe("Recipe notes"),
    source_name: z.string().optional().describe("Source name"),
    source_url: z.string().optional().describe("Source URL"),
    prep_time: z.number().optional().describe("Prep time in minutes"),
    cook_time: z.number().optional().describe("Cook time in minutes"),
    servings: z.string().optional().describe("Servings, e.g. '4' or '4-6'"),
  }
}, async ({ name, ingredients, steps, note, source_name, source_url, prep_time, cook_time, servings }) => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
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
    return {
      content: [{ type: "text", text: `Created recipe "${result.name}"` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to create recipe: ${error.message}` }],
      isError: true,
    };
  }
});

// Register delete_recipe tool
server.registerTool("delete_recipe", {
  title: "Delete Recipe",
  description: "Delete a recipe from AnyList by name",
  inputSchema: {
    name: z.string().describe("Name of the recipe to delete")
  }
}, async ({ name }) => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    await anylistClient.deleteRecipe(name);
    return {
      content: [{ type: "text", text: `Deleted recipe "${name}"` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to delete recipe: ${error.message}` }],
      isError: true,
    };
  }
});

// ===== MEAL PLANNING TOOLS =====

// Register list_meal_plan_events tool
server.registerTool("list_meal_plan_events", {
  title: "List Meal Plan Events",
  description: "Show all meal plan events from the AnyList meal planning calendar, sorted by date",
  inputSchema: {}
}, async () => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    const events = await anylistClient.getMealPlanEvents();

    if (events.length === 0) {
      return {
        content: [{ type: "text", text: "No meal plan events found." }],
      };
    }

    events.sort((a, b) => a.date.localeCompare(b.date));
    const list = events.map(e => {
      const parts = [`- **${e.date}**`];
      if (e.title) parts.push(e.title);
      if (e.recipeName) parts.push(`📖 ${e.recipeName}`);
      if (e.labelName) parts.push(`[${e.labelName}]`);
      if (e.details) parts.push(`— ${e.details}`);
      return parts.join(' ');
    }).join('\n');

    return {
      content: [{ type: "text", text: `Meal Plan (${events.length} events):\n${list}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to list meal plan events: ${error.message}` }],
      isError: true,
    };
  }
});

// Register list_meal_plan_labels tool
server.registerTool("list_meal_plan_labels", {
  title: "List Meal Plan Labels",
  description: "Show available meal plan labels (Breakfast, Lunch, Dinner, etc.) with their IDs",
  inputSchema: {}
}, async () => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    const labels = await anylistClient.getMealPlanLabels();

    if (labels.length === 0) {
      return {
        content: [{ type: "text", text: "No meal plan labels found." }],
      };
    }

    const list = labels.map(l => `- **${l.name}** (${l.hexColor || 'no color'}) — id: ${l.identifier}`).join('\n');
    return {
      content: [{ type: "text", text: `Meal Plan Labels:\n${list}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to list meal plan labels: ${error.message}` }],
      isError: true,
    };
  }
});

// Register create_meal_plan_event tool
server.registerTool("create_meal_plan_event", {
  title: "Create Meal Plan Event",
  description: "Add a meal plan event to the AnyList meal planning calendar",
  inputSchema: {
    date: z.string().describe("Date in YYYY-MM-DD format"),
    title: z.string().optional().describe("Event title (use this OR recipe_id)"),
    recipe_id: z.string().optional().describe("Recipe ID to link to this event"),
    label_id: z.string().optional().describe("Label ID for meal type (e.g. Breakfast, Lunch, Dinner)"),
    details: z.string().optional().describe("Additional notes"),
  }
}, async ({ date, title, recipe_id, label_id, details }) => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    const result = await anylistClient.createMealPlanEvent({
      date,
      title: title || null,
      recipeId: recipe_id || null,
      labelId: label_id || null,
      details: details || null,
    });
    return {
      content: [{ type: "text", text: `Created meal plan event for ${result.date}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to create meal plan event: ${error.message}` }],
      isError: true,
    };
  }
});

// Register delete_meal_plan_event tool
server.registerTool("delete_meal_plan_event", {
  title: "Delete Meal Plan Event",
  description: "Delete a meal plan event by its ID",
  inputSchema: {
    event_id: z.string().describe("ID of the meal plan event to delete")
  }
}, async ({ event_id }) => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    await anylistClient.deleteMealPlanEvent(event_id);
    return {
      content: [{ type: "text", text: `Deleted meal plan event ${event_id}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to delete meal plan event: ${error.message}` }],
      isError: true,
    };
  }
});

// ===== RECIPE COLLECTION TOOLS =====

// Register list_recipe_collections tool
server.registerTool("list_recipe_collections", {
  title: "List Recipe Collections",
  description: "Show all recipe collections with recipe counts and names",
  inputSchema: {}
}, async () => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    const collections = await anylistClient.getRecipeCollections();

    if (collections.length === 0) {
      return {
        content: [{ type: "text", text: "No recipe collections found." }],
      };
    }

    const list = collections.map(c =>
      `- **${c.name}** (${c.recipeCount} recipes)${c.recipeCount > 0 ? ': ' + c.recipeNames.join(', ') : ''}`
    ).join('\n');

    return {
      content: [{ type: "text", text: `Recipe Collections (${collections.length}):\n${list}` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to list recipe collections: ${error.message}` }],
      isError: true,
    };
  }
});

// Register create_recipe_collection tool
server.registerTool("create_recipe_collection", {
  title: "Create Recipe Collection",
  description: "Create a new recipe collection, optionally with recipes",
  inputSchema: {
    name: z.string().describe("Collection name"),
    recipe_names: z.array(z.string()).optional().describe("Recipe names to include in the collection"),
  }
}, async ({ name, recipe_names }) => {
  try {
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    const result = await anylistClient.createRecipeCollection(name, recipe_names || []);
    return {
      content: [{ type: "text", text: `Created recipe collection "${result.name}"` }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to create recipe collection: ${error.message}` }],
      isError: true,
    };
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
