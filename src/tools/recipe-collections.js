import { z } from "zod";
import { textResponse, errorResponse } from "./helpers.js";
import { createElicitationHelpers } from "./elicitation.js";

export function register(server, getClient) {
  const { elicitRequiredField } = createElicitationHelpers(server);

  server.registerTool("recipe_collections", {
    title: "Recipe Collections",
    description: `Manage AnyList recipe collections. Actions:
- list: Show all collections with recipe counts and names
- create: Create a new collection, optionally with recipes
- add_recipes: Add existing recipes to an existing collection
- remove_recipes: Remove recipes from a collection (the recipes themselves are not deleted)
- delete: Delete a collection (its recipes are not deleted)`,
    inputSchema: {
      action: z.enum(["list", "create", "add_recipes", "remove_recipes", "delete"]).describe("The collection action to perform"),
      name: z.string().optional().describe("Collection name (required for create, add_recipes, remove_recipes, delete)"),
      recipe_names: z.array(z.string()).optional().describe("Recipe names (create: recipes to include; add_recipes, remove_recipes: required)"),
    }
  }, async (params) => {
    const { action, name, recipe_names } = params;
    try {
      const client = await getClient();
      await client.connect(null);
      switch (action) {
        case "list": {
          const collections = await client.getRecipeCollections();
          if (collections.length === 0) return textResponse("No recipe collections found.");
          const list = collections.map(c => `- **${c.name}** (${c.recipeCount} recipes)${c.recipeCount > 0 ? ': ' + c.recipeNames.join(', ') : ''}`).join('\n');
          return textResponse(`Recipe Collections (${collections.length}):\n${list}`);
        }
        case "create": {
          let collectionName = name;
          if (!collectionName) collectionName = await elicitRequiredField("name", "What should the collection be called?");
          const result = await client.createRecipeCollection(collectionName, recipe_names || []);
          return textResponse(`Created recipe collection "${result.name}"`);
        }
        case "add_recipes":
        case "remove_recipes": {
          const adding = action === "add_recipes";
          let collectionName = name;
          if (!collectionName) collectionName = await elicitRequiredField("name", adding ? "Which collection should the recipes be added to?" : "Which collection should the recipes be removed from?");
          if (!recipe_names || recipe_names.length === 0) return errorResponse(`Action "${action}" requires recipe_names.`);
          const result = adding
            ? await client.addRecipesToCollection(collectionName, recipe_names)
            : await client.removeRecipesFromCollection(collectionName, recipe_names);
          const lines = [];
          if (result.changed.length > 0) lines.push(`${adding ? 'Added to' : 'Removed from'} "${result.name}": ${result.changed.join(', ')}`);
          if (result.unchanged.length > 0) lines.push(`${adding ? 'Already in' : 'Not in'} "${result.name}": ${result.unchanged.join(', ')}`);
          if (result.notFound.length > 0) lines.push(`No recipe found named: ${result.notFound.join(', ')}`);
          const text = lines.join('\n');
          return result.changed.length === 0 && result.notFound.length > 0 ? errorResponse(text) : textResponse(text);
        }
        case "delete": {
          let deleteCollectionName = name;
          if (!deleteCollectionName) deleteCollectionName = await elicitRequiredField("name", "Which collection would you like to delete?");
          await client.deleteRecipeCollection(deleteCollectionName);
          return textResponse(`Deleted recipe collection "${deleteCollectionName}"`);
        }
      }
    } catch (error) {
      return errorResponse(`Recipe collections ${action} failed: ${error.message}`);
    }
  });
}
