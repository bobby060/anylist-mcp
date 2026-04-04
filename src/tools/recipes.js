import { z } from "zod";
import { textResponse, errorResponse } from "./helpers.js";
import { createElicitationHelpers } from "./elicitation.js";
import { normalizeRecipe } from "../recipe-normalizer.js";

export function register(server, getClient) {
  const { elicitRequiredField, elicitConfirmation } = createElicitationHelpers(server);

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
      ingredients: z.array(z.object({
        name: z.string().describe("Ingredient name, e.g. 'flour'"),
        quantity: z.string().describe("Quantity with unit, e.g. '2 cups'"),
      })).optional().describe("Ingredients with name and quantity (create only)"),
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
      const client = await getClient();
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
          let getRecipeName = name;
          if (!getRecipeName) getRecipeName = await elicitRequiredField("name", "Which recipe would you like to view?");
          const recipe = await client.getRecipeDetails(getRecipeName);
          let text = `# ${recipe.name}\n\n`;
          if (recipe.sourceName) text += `Source: ${recipe.sourceName}\n`;
          if (recipe.sourceUrl) text += `URL: ${recipe.sourceUrl}\n`;
          if (recipe.rating) text += `Rating: ${'⭐'.repeat(recipe.rating)}\n`;
          if (recipe.prepTime) text += `Prep: ${recipe.prepTime} min\n`;
          if (recipe.cookTime) text += `Cook: ${recipe.cookTime} min\n`;
          if (recipe.servings) text += `Servings: ${recipe.servings}\n`;
          if (recipe.createdAt) text += `Created: ${recipe.createdAt}\n`;
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
          if (!recipeName) recipeName = await elicitRequiredField("name", "What should the recipe be called?");
          const existingRecipes = await client.getRecipes(recipeName);
          const exactMatch = existingRecipes.find(r => r.name.toLowerCase() === recipeName.toLowerCase());
          if (exactMatch) {
            const confirmed = await elicitConfirmation(`Recipe "${exactMatch.name}" already exists. Overwrite?`);
            if (!confirmed) return textResponse(`Cancelled — recipe "${exactMatch.name}" was not overwritten.`);
            await client.deleteRecipe(exactMatch.name);
          }
          const result = await client.createRecipe({
            name: recipeName,
            ingredients: (ingredients || []).map(i => ({
              name: i.name,
              quantity: i.quantity,
              rawIngredient: `${i.quantity} ${i.name}`.trim(),
            })),
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
          if (!deleteRecipeName) deleteRecipeName = await elicitRequiredField("name", "Which recipe would you like to delete?");
          await client.deleteRecipe(deleteRecipeName);
          return textResponse(`Deleted recipe "${deleteRecipeName}"`);
        }
        case "import_url": {
          let importUrl = url;
          if (!importUrl) importUrl = await elicitRequiredField("url", "What URL would you like to import a recipe from?");
          const result = await client.importRecipeFromUrl(importUrl);
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
            const created = await client.createRecipe({
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
}
