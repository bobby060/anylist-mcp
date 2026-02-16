import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import AnyListClient from "./anylist-client.js";

// Load environment variables
dotenv.config();



// Create Express app

// Create AnyList client
const anylistClient = new AnyListClient();

const originalConsoleLog = console.log;
console.log = console.error;
console.info = console.error;

// Create the MCP server
const server = new McpServer({
  name: "anylist-mcp-server",
  version: "1.0.0",
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
  description: "Add an item to the AnyList shopping list with optional quantity and notes",
  inputSchema: {
    name: z.string().describe("Name of the item to add"),
    quantity: z.number().min(1).optional().describe("Quantity of the item (optional, defaults to 1)"),
    notes: z.string().optional().describe("Notes to attach to the item (optional)"),
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ name, quantity, notes, list_name }) => {
  try {
    await anylistClient.connect(list_name);
    await anylistClient.addItem(name, quantity || 1, notes || null);
    return {
      content: [
        {
          type: "text",
          text: `Successfully added "${name}" to list "${anylistClient.targetList.name}"`,
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
    // Connect without a specific list to authenticate and fetch lists
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

// Register list_recipes tool
server.registerTool("list_recipes", {
  title: "List Recipes",
  description: "Get all recipes from the AnyList account with summary info",
  inputSchema: {}
}, async () => {
  try {
    const recipes = await anylistClient.getRecipes();

    if (recipes.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No recipes found in the account.",
          },
        ],
      };
    }

    const recipeList = recipes.map(r => {
      const details = [];
      if (r.rating) details.push(`rating: ${r.rating}/5`);
      if (r.servings) details.push(`servings: ${r.servings}`);
      if (r.prepTime) details.push(`prep: ${r.prepTime}min`);
      if (r.cookTime) details.push(`cook: ${r.cookTime}min`);
      const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
      return `- ${r.name}${suffix}`;
    }).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Recipes (${recipes.length}):\n${recipeList}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to list recipes: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register get_recipe tool
server.registerTool("get_recipe", {
  title: "Get Recipe Details",
  description: "Get full details of a recipe by name or identifier",
  inputSchema: {
    identifier: z.string().describe("Recipe name or UUID identifier")
  }
}, async ({ identifier }) => {
  try {
    const recipe = await anylistClient.getRecipe(identifier);

    const lines = [`# ${recipe.name}`];
    if (recipe.note) lines.push(`\n${recipe.note}`);

    const meta = [];
    if (recipe.rating) meta.push(`Rating: ${recipe.rating}/5`);
    if (recipe.servings) meta.push(`Servings: ${recipe.servings}`);
    if (recipe.prepTime) meta.push(`Prep time: ${recipe.prepTime} min`);
    if (recipe.cookTime) meta.push(`Cook time: ${recipe.cookTime} min`);
    if (recipe.sourceName) meta.push(`Source: ${recipe.sourceName}`);
    if (recipe.sourceUrl) meta.push(`URL: ${recipe.sourceUrl}`);
    if (recipe.nutritionalInfo) meta.push(`Nutrition: ${recipe.nutritionalInfo}`);
    if (meta.length > 0) lines.push(`\n${meta.join('\n')}`);

    if (recipe.ingredients.length > 0) {
      lines.push('\n## Ingredients');
      recipe.ingredients.forEach(ing => {
        const text = ing.rawIngredient || [ing.quantity, ing.name].filter(Boolean).join(' ');
        const note = ing.note ? ` (${ing.note})` : '';
        lines.push(`- ${text}${note}`);
      });
    }

    if (recipe.preparationSteps.length > 0) {
      lines.push('\n## Steps');
      recipe.preparationSteps.forEach((step, i) => {
        lines.push(`${i + 1}. ${step}`);
      });
    }

    return {
      content: [
        {
          type: "text",
          text: lines.join('\n'),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to get recipe: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register add_recipe tool
server.registerTool("add_recipe", {
  title: "Add Recipe",
  description: "Add a new recipe to AnyList",
  inputSchema: {
    name: z.string().describe("Name of the recipe"),
    note: z.string().optional().describe("Recipe description or notes"),
    ingredients: z.array(z.object({
      rawIngredient: z.string().optional().describe("Full ingredient text (e.g. '2 cups flour')"),
      name: z.string().optional().describe("Ingredient name"),
      quantity: z.string().optional().describe("Ingredient quantity"),
      note: z.string().optional().describe("Ingredient note"),
    })).optional().describe("List of ingredients"),
    preparationSteps: z.array(z.string()).optional().describe("List of preparation steps"),
    servings: z.string().optional().describe("Number of servings (e.g. '4 servings')"),
    sourceName: z.string().optional().describe("Source name (e.g. cookbook or website name)"),
    sourceUrl: z.string().optional().describe("Source URL"),
    cookTime: z.number().optional().describe("Cook time in seconds"),
    prepTime: z.number().optional().describe("Prep time in seconds"),
    rating: z.number().min(0).max(5).optional().describe("Rating from 0-5"),
    nutritionalInfo: z.string().optional().describe("Nutritional information"),
    scaleFactor: z.number().optional().describe("Scale factor for the recipe"),
  }
}, async ({ name, note, ingredients, preparationSteps, servings, sourceName, sourceUrl, cookTime, prepTime, rating, nutritionalInfo, scaleFactor }) => {
  try {
    const result = await anylistClient.addRecipe({
      name, note, ingredients, preparationSteps, servings,
      sourceName, sourceUrl, cookTime, prepTime, rating,
      nutritionalInfo, scaleFactor
    });
    return {
      content: [
        {
          type: "text",
          text: `Successfully added recipe "${result.name}" (id: ${result.identifier})`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to add recipe: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register get_calendar_events tool
server.registerTool("get_calendar_events", {
  title: "Get Meal Planning Calendar Events",
  description: "Get meal planning calendar events, optionally filtered by date range. Defaults to past 30 days.",
  inputSchema: {
    start_date: z.string().optional().describe("Start date filter, ISO format YYYY-MM-DD (optional)"),
    end_date: z.string().optional().describe("End date filter, ISO format YYYY-MM-DD (optional)"),
    include_future: z.boolean().optional().describe("Include future events (default: false — past events only)"),
  }
}, async ({ start_date, end_date, include_future }) => {
  try {
    const events = await anylistClient.getCalendarEvents({
      startDate: start_date,
      endDate: end_date,
      includeFuture: include_future,
    });

    if (events.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No meal planning calendar events found for the specified range.",
          },
        ],
      };
    }

    const eventList = events.map(e =>
      `${e.date} (${e.dayOfWeek}): ${e.title}`
    ).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Meal planning calendar events (${events.length}):\n\n${eventList}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to get calendar events: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register schedule_meal tool
server.registerTool("schedule_meal", {
  title: "Schedule a Meal",
  description: "Add a meal to the calendar for a specific date, linked to a recipe by name or UUID",
  inputSchema: {
    date: z.string().describe("Date in ISO format YYYY-MM-DD"),
    recipe_identifier: z.string().describe("Recipe name or UUID to schedule"),
  }
}, async ({ date, recipe_identifier }) => {
  try {
    const result = await anylistClient.scheduleMeal(date, recipe_identifier);
    return {
      content: [
        {
          type: "text",
          text: `Successfully scheduled "${result.recipeName}" on ${result.formatted}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to schedule meal: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register schedule_note tool
server.registerTool("schedule_note", {
  title: "Schedule a Note on Calendar",
  description: "Add a freeform (non-recipe) entry to the meal planning calendar, e.g. 'Scrounge' or 'Takeout'",
  inputSchema: {
    date: z.string().describe("Date in ISO format YYYY-MM-DD"),
    title: z.string().describe("Freeform title for the calendar entry (e.g. 'Scrounge', 'Takeout')"),
  }
}, async ({ date, title }) => {
  try {
    const result = await anylistClient.scheduleNote(date, title);
    return {
      content: [
        {
          type: "text",
          text: `Noted "${result.title}" on ${result.formatted}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to schedule note: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register clear_calendar_range tool
server.registerTool("clear_calendar_range", {
  title: "Clear Calendar Range",
  description: "Delete all meal planning calendar events within a date range. This is destructive and cannot be undone.",
  inputSchema: {
    start_date: z.string().describe("Start date of range to clear, ISO format YYYY-MM-DD"),
    end_date: z.string().describe("End date of range to clear, ISO format YYYY-MM-DD"),
  }
}, async ({ start_date, end_date }) => {
  try {
    const result = await anylistClient.clearCalendarRange(start_date, end_date);
    return {
      content: [
        {
          type: "text",
          text: `Cleared ${result.count} calendar event${result.count !== 1 ? 's' : ''} between ${result.startDate} and ${result.endDate}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to clear calendar range: ${error.message}`,
        },
      ],
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