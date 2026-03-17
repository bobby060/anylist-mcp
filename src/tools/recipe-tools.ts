import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { AnyListService } from '../services/anylist-service.js';
import {
  CreateRecipeSchema,
  UpdateRecipeSchema,
  ImportRecipeSchema,
  GetRecipesSchema,
} from '../utils/validation.js';

/**
 * Register recipe management tools with FastMCP
 */
export function registerRecipeTools(server: FastMCP, anylistService: AnyListService) {
  // Get all recipes with optional search
  server.addTool({
    name: 'get_recipes',
    description: 'Retrieve AnyList recipes with optional search filtering',
    parameters: GetRecipesSchema,
    execute: async ({ searchTerm, includeDetails = true }) => {
      const recipes = await anylistService.getRecipes();
      
      // Filter recipes by search term if provided
      let filteredRecipes = recipes;
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        filteredRecipes = recipes.filter(recipe => 
          recipe.name.toLowerCase().includes(searchLower) ||
          (recipe.note && recipe.note.toLowerCase().includes(searchLower)) ||
          (recipe.sourceName && recipe.sourceName.toLowerCase().includes(searchLower)) ||
          recipe.ingredients.some(ingredient => 
            ingredient.name.toLowerCase().includes(searchLower) ||
            ingredient.rawIngredient.toLowerCase().includes(searchLower)
          ) ||
          recipe.instructions.some(instruction => 
            instruction.toLowerCase().includes(searchLower)
          )
        );
      }

      const formatTime = (seconds?: number) => {
        if (!seconds) return 'Not specified';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
      };

      return {
        content: [
          {
            type: 'text',
            text: `Found ${filteredRecipes.length} recipes${searchTerm ? ` matching "${searchTerm}"` : ''}:\n\n${filteredRecipes
              .map(
                (recipe) =>
                  `**${recipe.name}** (ID: ${recipe.identifier})\n` +
                  `  Servings: ${recipe.servings || 'Not specified'}\n` +
                  `  Prep Time: ${formatTime(recipe.prepTime)}\n` +
                  `  Cook Time: ${formatTime(recipe.cookTime)}\n` +
                  `  Ingredients: ${recipe.ingredients.length}\n` +
                  `  Instructions: ${recipe.instructions.length} steps\n` +
                  (recipe.sourceName ? `  Source: ${recipe.sourceName}\n` : '') +
                  (recipe.rating ? `  Rating: ${recipe.rating}/5\n` : '') +
                  (includeDetails && recipe.note ? `  Note: ${recipe.note.substring(0, 100)}${recipe.note.length > 100 ? '...' : ''}\n` : '')
              )
              .join('\n')}`,
          },
        ],
      };
    },
  });

  // Get a specific recipe by ID
  server.addTool({
    name: 'get_recipe',
    description: 'Get detailed information about a specific recipe',
    parameters: z.object({
      recipeId: z.string().describe('The ID of the recipe to retrieve'),
    }),
    execute: async ({ recipeId }) => {
      const recipes = await anylistService.getRecipes();
      const recipe = recipes.find((r) => r.identifier === recipeId);
      
      if (!recipe) {
        throw new Error(`Recipe with ID ${recipeId} not found`);
      }

      const formatTime = (seconds?: number) => {
        if (!seconds) return 'Not specified';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
      };

      return {
        content: [
          {
            type: 'text',
            text: `# ${recipe.name}\n\n` +
              `**Recipe ID:** ${recipe.identifier}\n` +
              `**Servings:** ${recipe.servings || 'Not specified'}\n` +
              `**Prep Time:** ${formatTime(recipe.prepTime)}\n` +
              `**Cook Time:** ${formatTime(recipe.cookTime)}\n` +
              (recipe.sourceName ? `**Source:** ${recipe.sourceName}\n` : '') +
              (recipe.sourceUrl ? `**Source URL:** ${recipe.sourceUrl}\n` : '') +
              (recipe.rating ? `**Rating:** ${recipe.rating}/5 stars\n` : '') +
              (recipe.nutritionalInfo ? `**Nutritional Info:** ${recipe.nutritionalInfo}\n` : '') +
              `\n## Ingredients (${recipe.ingredients.length})\n${recipe.ingredients
                .map((ing) => `- ${ing.quantity || ''} ${ing.name}${ing.note ? ` (${ing.note})` : ''}`)
                .join('\n')}\n` +
              `\n## Instructions (${recipe.instructions.length} steps)\n${recipe.instructions
                .map((inst, idx) => `${idx + 1}. ${inst}`)
                .join('\n')}\n` +
              (recipe.note ? `\n## Notes\n${recipe.note}\n` : ''),
          },
        ],
      };
    },
  });

  // Create a new recipe
  server.addTool({
    name: 'create_recipe',
    description: 'Create a new recipe in AnyList',
    parameters: CreateRecipeSchema,
    execute: async (request) => {
      const recipe = await anylistService.createRecipe(request);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created recipe "${recipe.name}" with ID: ${recipe.identifier}\n` +
              `Ingredients: ${recipe.ingredients.length}\n` +
              `Instructions: ${recipe.instructions.length} steps`,
          },
        ],
      };
    },
  });

  // Update an existing recipe
  server.addTool({
    name: 'update_recipe',
    description: 'Update an existing recipe in AnyList',
    parameters: UpdateRecipeSchema,
    execute: async ({ recipeId, ...updates }) => {
      const recipe = await anylistService.updateRecipe(recipeId, updates);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully updated recipe "${recipe.name}"`,
          },
        ],
      };
    },
  });

  // Delete a recipe
  server.addTool({
    name: 'delete_recipe',
    description: 'Delete a recipe from AnyList',
    parameters: z.object({
      recipeId: z.string().describe('The ID of the recipe to delete'),
    }),
    execute: async ({ recipeId }) => {
      await anylistService.deleteRecipe(recipeId);
      return {
        content: [
          {
            type: 'text',
            text: 'Successfully deleted recipe',
          },
        ],
      };
    },
  });

  // Import recipe from URL
  server.addTool({
    name: 'import_recipe_from_url',
    description: 'Import a recipe from a URL (if supported by AnyList)',
    parameters: ImportRecipeSchema,
    execute: async (request) => {
      const recipe = await anylistService.importRecipeFromUrl(request);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully imported recipe "${recipe.name}" from ${request.url}\n` +
              `Ingredients: ${recipe.ingredients.length}\n` +
              `Instructions: ${recipe.instructions.length} steps`,
          },
        ],
      };
    },
  });

  // Create recipe collection
  server.addTool({
    name: 'create_recipe_collection',
    description: 'Create a new recipe collection in AnyList',
    parameters: z.object({
      name: z.string().describe('Name of the recipe collection'),
    }),
    execute: async ({ name }) => {
      const collection = await anylistService.createRecipeCollection(name);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully created recipe collection "${collection.name}" with ID: ${collection.identifier}`,
          },
        ],
      };
    },
  });

  // Add recipe to collection
  server.addTool({
    name: 'add_recipe_to_collection',
    description: 'Add a recipe to a recipe collection',
    parameters: z.object({
      collectionId: z.string().describe('The ID of the recipe collection'),
      recipeId: z.string().describe('The ID of the recipe to add'),
    }),
    execute: async ({ collectionId, recipeId }) => {
      await anylistService.addRecipeToCollection(collectionId, recipeId);
      return {
        content: [
          {
            type: 'text',
            text: 'Successfully added recipe to collection',
          },
        ],
      };
    },
  });

  // Export recipe as text
  server.addTool({
    name: 'export_recipe',
    description: 'Export a recipe as formatted text for sharing or backup',
    parameters: z.object({
      recipeId: z.string().describe('The ID of the recipe to export'),
      format: z.enum(['markdown', 'plain', 'json']).default('markdown').describe('Export format'),
    }),
    execute: async ({ recipeId, format }) => {
      const recipes = await anylistService.getRecipes();
      const recipe = recipes.find((r) => r.identifier === recipeId);
      
      if (!recipe) {
        throw new Error(`Recipe with ID ${recipeId} not found`);
      }

      const formatTime = (seconds?: number) => {
        if (!seconds) return 'Not specified';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
      };

      let exportText = '';

      if (format === 'json') {
        exportText = JSON.stringify(recipe, null, 2);
      } else if (format === 'markdown') {
        exportText = `# ${recipe.name}\n\n` +
          `**Servings:** ${recipe.servings || 'Not specified'}\n` +
          `**Prep Time:** ${formatTime(recipe.prepTime)}\n` +
          `**Cook Time:** ${formatTime(recipe.cookTime)}\n` +
          (recipe.sourceName ? `**Source:** ${recipe.sourceName}\n` : '') +
          (recipe.sourceUrl ? `**Source URL:** ${recipe.sourceUrl}\n` : '') +
          (recipe.rating ? `**Rating:** ${recipe.rating}/5 stars\n` : '') +
          (recipe.nutritionalInfo ? `**Nutritional Info:** ${recipe.nutritionalInfo}\n` : '') +
          `\n## Ingredients\n${recipe.ingredients
            .map((ing) => `- ${ing.quantity || ''} ${ing.name}${ing.note ? ` (${ing.note})` : ''}`)
            .join('\n')}\n` +
          `\n## Instructions\n${recipe.instructions
            .map((inst, idx) => `${idx + 1}. ${inst}`)
            .join('\n')}\n` +
          (recipe.note ? `\n## Notes\n${recipe.note}\n` : '');
      } else { // plain text
        exportText = `${recipe.name}\n${'='.repeat(recipe.name.length)}\n\n` +
          `Servings: ${recipe.servings || 'Not specified'}\n` +
          `Prep Time: ${formatTime(recipe.prepTime)}\n` +
          `Cook Time: ${formatTime(recipe.cookTime)}\n` +
          (recipe.sourceName ? `Source: ${recipe.sourceName}\n` : '') +
          (recipe.sourceUrl ? `Source URL: ${recipe.sourceUrl}\n` : '') +
          (recipe.rating ? `Rating: ${recipe.rating}/5 stars\n` : '') +
          (recipe.nutritionalInfo ? `Nutritional Info: ${recipe.nutritionalInfo}\n` : '') +
          `\nIngredients:\n${recipe.ingredients
            .map((ing) => `• ${ing.quantity || ''} ${ing.name}${ing.note ? ` (${ing.note})` : ''}`)
            .join('\n')}\n` +
          `\nInstructions:\n${recipe.instructions
            .map((inst, idx) => `${idx + 1}. ${inst}`)
            .join('\n')}\n` +
          (recipe.note ? `\nNotes:\n${recipe.note}\n` : '');
      }

      return {
        content: [
          {
            type: 'text',
            text: `Recipe exported in ${format} format:\n\n${exportText}`,
          },
        ],
      };
    },
  });

  // Search recipes by ingredients
  server.addTool({
    name: 'search_recipes_by_ingredients',
    description: 'Search recipes that contain specific ingredients',
    parameters: z.object({
      ingredients: z.array(z.string()).describe('List of ingredients to search for'),
      matchAll: z.boolean().default(false).describe('If true, recipe must contain ALL ingredients; if false, ANY ingredient matches'),
    }),
    execute: async ({ ingredients, matchAll }) => {
      const recipes = await anylistService.getRecipes();
      
      const searchIngredients = ingredients.map(ing => ing.toLowerCase());
      
      const matchingRecipes = recipes.filter(recipe => {
        const recipeIngredients = recipe.ingredients.map(ing => 
          ing.name.toLowerCase() + ' ' + ing.rawIngredient.toLowerCase()
        );
        
        if (matchAll) {
          return searchIngredients.every(searchIng => 
            recipeIngredients.some(recipeIng => recipeIng.includes(searchIng))
          );
        } else {
          return searchIngredients.some(searchIng => 
            recipeIngredients.some(recipeIng => recipeIng.includes(searchIng))
          );
        }
      });

      const formatTime = (seconds?: number) => {
        if (!seconds) return 'Not specified';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
      };

      return {
        content: [
          {
            type: 'text',
            text: `Found ${matchingRecipes.length} recipes containing ${matchAll ? 'ALL' : 'ANY'} of: ${ingredients.join(', ')}\n\n${matchingRecipes
              .map(
                (recipe) =>
                  `**${recipe.name}** (ID: ${recipe.identifier})\n` +
                  `  Servings: ${recipe.servings || 'Not specified'}\n` +
                  `  Prep Time: ${formatTime(recipe.prepTime)}\n` +
                  `  Cook Time: ${formatTime(recipe.cookTime)}\n` +
                  `  Matching ingredients: ${recipe.ingredients
                    .filter(ing => ingredients.some(searchIng => 
                      ing.name.toLowerCase().includes(searchIng.toLowerCase()) || 
                      ing.rawIngredient.toLowerCase().includes(searchIng.toLowerCase())
                    ))
                    .map(ing => ing.name)
                    .join(', ')}\n` +
                  (recipe.rating ? `  Rating: ${recipe.rating}/5 stars\n` : '')
              )
              .join('\n')}`,
          },
        ],
      };
    },
  });

  // Get recipe nutritional summary
  server.addTool({
    name: 'get_recipe_nutrition',
    description: 'Get nutritional information for a recipe',
    parameters: z.object({
      recipeId: z.string().describe('The ID of the recipe'),
    }),
    execute: async ({ recipeId }) => {
      const recipes = await anylistService.getRecipes();
      const recipe = recipes.find((r) => r.identifier === recipeId);
      
      if (!recipe) {
        throw new Error(`Recipe with ID ${recipeId} not found`);
      }

      return {
        content: [
          {
            type: 'text',
            text: `# Nutritional Information for ${recipe.name}\n\n` +
              `**Recipe ID:** ${recipe.identifier}\n` +
              `**Servings:** ${recipe.servings || 'Not specified'}\n\n` +
              `**Nutritional Info:**\n${recipe.nutritionalInfo || 'No nutritional information available'}\n\n` +
              `**Ingredients (${recipe.ingredients.length}):**\n${recipe.ingredients
                .map((ing) => `- ${ing.quantity || ''} ${ing.name}`)
                .join('\n')}\n\n` +
              '*Note: Nutritional information depends on specific brands and preparation methods used.*',
          },
        ],
      };
    },
  });
} 