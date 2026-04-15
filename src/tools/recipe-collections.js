import { z } from "zod";
import { textResponse, errorResponse } from "./helpers.js";
import { createElicitationHelpers } from "./elicitation.js";

export function register(server, getClient) {
  const { elicitRequiredField } = createElicitationHelpers(server);

  server.registerTool("recipe_collections", {
    title: "Recipe Collections",
    description: `Manage AnyList recipe collections. Actions:
- list: Show all collections with recipe counts and names
- create: Create a new collection, optionally with recipes`,
    inputSchema: {
      action: z.enum(["list", "create", "delete"]).describe("The collection action to perform"),
      name: z.string().optional().describe("Collection name (required for create, delete)"),
      recipe_names: z.array(z.string()).optional().describe("Recipe names to include (create only)"),
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
