import AnyList from 'anylist';
// @ts-ignore - no type declarations for internal module
import Item from 'anylist/lib/item.js';
import { UserError } from 'fastmcp';
import type {
  AnyListConfig,
  ListInfo,
  ItemInfo,
  RecipeInfo,
  RecipeCollectionInfo,
  MealEventInfo,
  CreateListRequest,
  AddItemRequest,
  UpdateItemRequest,
  CreateRecipeRequest,
  UpdateRecipeRequest,
  ImportRecipeRequest,
  CreateMealEventRequest,
} from '../types/index.js';

// Patch Item._encode to not include 'quantity' field which doesn't exist in protobuf schema
(Item as any).prototype._encode = function () {
  return new this._protobuf.ListItem({
    identifier: this._identifier,
    listId: this._listId,
    name: this._name,
    details: this._details,
    checked: this._checked,
    category: this._category,
    userId: this._userId,
    categoryMatchId: this._categoryMatchId,
    manualSortIndex: this._manualSortIndex,
  });
};

/**
 * Service class to handle all AnyList API interactions
 * Enhanced for production use with proper error handling
 */
export class AnyListService {
  private client: typeof AnyList.prototype | null = null;
  private config: AnyListConfig;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: AnyListConfig) {
    this.config = config;
  }

  /**
   * Initialize connection to AnyList with retry logic
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  private async _connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      this.client = new AnyList({
        email: this.config.email!,
        password: this.config.password!,
        ...(this.config.credentialsFile && { credentialsFile: this.config.credentialsFile }),
      });

      await this.client.login();
      this.isConnected = true;
    } catch (error) {
      this.isConnected = false;
      this.client = null;
      this.connectionPromise = null;
      
      if (error instanceof Error) {
        throw new UserError(`Failed to connect to AnyList: ${error.message}`);
      }
      throw new UserError('Failed to connect to AnyList: Unknown error');
    }
  }

  /**
   * Ensure client is connected before operations
   */
  private async ensureConnected(): Promise<typeof AnyList.prototype> {
    await this.connect();
    if (!this.client || !this.isConnected) {
      throw new UserError('Not connected to AnyList');
    }
    return this.client;
  }

  /**
   * Disconnect from AnyList
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        this.client.teardown();
      } catch (error) {
        // Ignore teardown errors
      }
    }
    this.client = null;
    this.isConnected = false;
    this.connectionPromise = null;
  }

  // List Management Methods

  /**
   * Get all lists
   */
  async getLists(): Promise<ListInfo[]> {
    const client = await this.ensureConnected();
    
    try {
      await client.getLists();
      const lists = client.lists.map((list: any) => ({
        identifier: list.identifier,
        parentId: list.parentId,
        name: list.name,
        items: list.items?.map((item: any) => this.mapItemInfo(item)) || [],
      }));

      return lists;
    } catch (error) {
      throw new UserError(`Failed to get lists: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Create a new list
   */
  async createList(_request: CreateListRequest): Promise<ListInfo> {
    // Note: The anylist library doesn't seem to support creating lists directly
    // This would need to be implemented if the API supports it
    throw new UserError('Creating lists is not currently supported by the AnyList API');
  }

  /**
   * Add item to a list
   */
  async addItem(request: AddItemRequest): Promise<ItemInfo> {
    const client = await this.ensureConnected();
    
    try {
      await client.getLists();
      const list = client.getListById(request.listId);
      if (!list) {
        throw new UserError(`List with ID ${request.listId} not found`);
      }

      const newItem = client.createItem({
        name: request.name,
        details: request.details,
      });

      const addedItem = await list.addItem(newItem);

      // Set quantity after adding (quantity not in protobuf _encode, must be saved separately)
      if (request.quantity) {
        addedItem.quantity = request.quantity;
        await addedItem.save();
      }

      return this.mapItemInfo(addedItem);
    } catch (error) {
      throw new UserError(`Failed to add item: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Update an existing item
   */
  async updateItem(request: UpdateItemRequest): Promise<ItemInfo> {
    const client = await this.ensureConnected();
    
    try {
      await client.getLists();
      const list = client.getListById(request.listId);
      if (!list) {
        throw new UserError(`List with ID ${request.listId} not found`);
      }

      const item = list.getItemById(request.itemId);
      if (!item) {
        throw new UserError(`Item with ID ${request.itemId} not found`);
      }

      // Update item properties
      if (request.name !== undefined) item.name = request.name;
      if (request.details !== undefined) item.details = request.details;
      if (request.quantity !== undefined) item.quantity = request.quantity;
      if (request.checked !== undefined) item.checked = request.checked;

      await item.save();
      return this.mapItemInfo(item);
    } catch (error) {
      throw new UserError(`Failed to update item: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Check off an item (mark as completed)
   */
  async checkItem(listId: string, itemId: string): Promise<void> {
    const client = await this.ensureConnected();

    try {
      await client.getLists();
      const list = client.getListById(listId);
      if (!list) {
        throw new UserError(`List with ID ${listId} not found`);
      }

      const item = list.getItemById(itemId);
      if (!item) {
        throw new UserError(`Item with ID ${itemId} not found`);
      }

      if (!item.checked) {
        item.checked = true;
        await item.save();
      }
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(`Failed to check item: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Remove item from a list (actually deletes it)
   */
  async removeItem(listId: string, itemId: string): Promise<void> {
    const client = await this.ensureConnected();

    try {
      await client.getLists();
      const list = client.getListById(listId);
      if (!list) {
        throw new UserError(`List with ID ${listId} not found`);
      }

      const item = list.getItemById(itemId);
      if (!item) {
        throw new UserError(`Item with ID ${itemId} not found`);
      }

      await list.removeItem(item);
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(`Failed to remove item: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Uncheck all items in a list
   */
  async uncheckAllItems(listId: string): Promise<void> {
    const client = await this.ensureConnected();
    
    try {
      await client.getLists();
      const list = client.getListById(listId);
      if (!list) {
        throw new UserError(`List with ID ${listId} not found`);
      }

      // Manually uncheck all items since uncheckAll may not exist
      for (const item of list.items) {
        if (item.checked) {
          item.checked = false;
          await item.save();
        }
      }
    } catch (error) {
      throw new UserError(`Failed to uncheck all items: ${this.getErrorMessage(error)}`);
    }
  }

  // Recipe Management Methods

  /**
   * Get all recipes
   */
  async getRecipes(): Promise<RecipeInfo[]> {
    const client = await this.ensureConnected();
    
    try {
      await client.getRecipes();
      return client.recipes.map((recipe: any) => this.mapRecipeInfo(recipe));
    } catch (error) {
      throw new UserError(`Failed to get recipes: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Create a new recipe
   */
  async createRecipe(request: CreateRecipeRequest): Promise<RecipeInfo> {
    const client = await this.ensureConnected();
    
    try {
      // Normalize ingredients: handle both string and object inputs
      const normalizedIngredients = (request.ingredients || []).map((i: any) => ({
        rawIngredient: typeof i === 'string' ? i : i.rawIngredient || `${i.quantity || ''} ${i.name || ''}`.trim(),
        name: typeof i === 'string' ? i : i.name || null,
        quantity: typeof i === 'string' ? null : i.quantity || null,
        note: typeof i === 'string' ? null : i.note || null,
      }));

      const recipeObj: Record<string, any> = { name: request.name };
      if (request.note) recipeObj['note'] = request.note;
      if (request.sourceName) recipeObj['sourceName'] = request.sourceName;
      if (request.sourceUrl) recipeObj['sourceUrl'] = request.sourceUrl;
      if (request.prepTime) recipeObj['prepTime'] = request.prepTime;
      if (request.cookTime) recipeObj['cookTime'] = request.cookTime;
      if (request.servings) recipeObj['servings'] = request.servings;
      if (request.rating) recipeObj['rating'] = request.rating;
      if (request.nutritionalInfo) recipeObj['nutritionalInfo'] = request.nutritionalInfo;
      if (request.scaleFactor) recipeObj['scaleFactor'] = request.scaleFactor;
      if (request.preparationSteps?.length) recipeObj['preparationSteps'] = request.preparationSteps;
      if (normalizedIngredients.length) recipeObj['ingredients'] = normalizedIngredients;

      const newRecipe = await client.createRecipe(recipeObj);

      await newRecipe.save();
      return this.mapRecipeInfo(newRecipe);
    } catch (error) {
      throw new UserError(`Failed to create recipe: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Update an existing recipe
   */
  async updateRecipe(recipeId: string, updates: UpdateRecipeRequest): Promise<RecipeInfo> {
    const client = await this.ensureConnected();
    
    try {
      await client.getRecipes();
      const recipe = client.recipes.find((r: any) => r.identifier === recipeId);
      if (!recipe) {
        throw new UserError(`Recipe with ID ${recipeId} not found`);
      }

      // Update recipe properties
      Object.keys(updates).forEach(key => {
        if (updates[key as keyof UpdateRecipeRequest] !== undefined) {
          (recipe as any)[key] = updates[key as keyof UpdateRecipeRequest];
        }
      });

      await recipe.save();
      return this.mapRecipeInfo(recipe);
    } catch (error) {
      throw new UserError(`Failed to update recipe: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Delete a recipe
   */
  async deleteRecipe(recipeId: string): Promise<void> {
    const client = await this.ensureConnected();

    try {
      await client.getRecipes();
      const recipe = client.recipes.find((r: any) => r.identifier === recipeId);
      if (!recipe) {
        throw new UserError(`Recipe with ID ${recipeId} not found`);
      }

      await recipe.delete();
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(`Failed to delete recipe: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Import recipe from URL using basic web scraping
   */
  async importRecipeFromUrl(request: ImportRecipeRequest): Promise<RecipeInfo> {
    try {
      // Use basic web scraping to extract recipe data
      const response = await fetch(request.url);
      const html = await response.text();
      
      // Try to extract JSON-LD structured data first
      const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/is);
      let recipeData = null;
      
      if (jsonLdMatch) {
        try {
          const data = JSON.parse(jsonLdMatch[1]);
          if (data['@type'] === 'Recipe' || (Array.isArray(data) && data.some(item => item['@type'] === 'Recipe'))) {
            recipeData = Array.isArray(data) ? data.find(item => item['@type'] === 'Recipe') : data;
          }
        } catch (e) {
          // Continue with fallback parsing
        }
      }
      
      let recipeName = request.name || '';
      let ingredients: string[] = [];
      let instructions: string[] = [];
      let prepTime: number | undefined;
      let cookTime: number | undefined;
      let servings: string | undefined;
      let description = '';
      
      if (recipeData) {
        // Extract from JSON-LD
        recipeName = recipeName || recipeData.name || '';
        servings = recipeData.recipeYield?.toString() || recipeData.servings?.toString();
        description = recipeData.description || '';
        
        if (recipeData.recipeIngredient) {
          ingredients = Array.isArray(recipeData.recipeIngredient) 
            ? recipeData.recipeIngredient 
            : [recipeData.recipeIngredient];
        }
        
        if (recipeData.recipeInstructions) {
          const instructionData = Array.isArray(recipeData.recipeInstructions) 
            ? recipeData.recipeInstructions 
            : [recipeData.recipeInstructions];
          instructions = instructionData.map((inst: any) => 
            typeof inst === 'string' ? inst : inst.text || inst.name || ''
          ).filter(Boolean);
        }
        
        // Parse time durations (ISO 8601 format like PT15M)
        if (recipeData.prepTime) {
          const prepMatch = recipeData.prepTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
          if (prepMatch) {
            const hours = parseInt(prepMatch[1] || '0');
            const minutes = parseInt(prepMatch[2] || '0');
            prepTime = (hours * 60 + minutes) * 60; // Convert to seconds
          }
        }
        
        if (recipeData.cookTime) {
          const cookMatch = recipeData.cookTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
          if (cookMatch) {
            const hours = parseInt(cookMatch[1] || '0');
            const minutes = parseInt(cookMatch[2] || '0');
            cookTime = (hours * 60 + minutes) * 60; // Convert to seconds
          }
        }
      }
      
      // Fallback: Basic HTML parsing if JSON-LD didn't work
      if (!recipeName || ingredients.length === 0 || instructions.length === 0) {
        // Extract title
        if (!recipeName) {
          const titleMatch = html.match(/<title[^>]*>([^<]+)</i);
          recipeName = request.name || (titleMatch ? titleMatch[1].trim() : 'Imported Recipe');
        }
        
        // Basic ingredient extraction (look for common patterns)
        if (ingredients.length === 0) {
          const ingredientPatterns = [
            /<li[^>]*class="[^"]*ingredient[^"]*"[^>]*>([^<]+)</gi,
            /<div[^>]*class="[^"]*ingredient[^"]*"[^>]*>([^<]+)</gi,
            /<p[^>]*class="[^"]*ingredient[^"]*"[^>]*>([^<]+)</gi,
          ];
          
          for (const pattern of ingredientPatterns) {
            const matches = Array.from(html.matchAll(pattern));
            if (matches.length > 0) {
              ingredients = matches.map(match => match[1].replace(/<[^>]*>/g, '').trim()).filter(Boolean);
              break;
            }
          }
        }
        
        // Basic instruction extraction
        if (instructions.length === 0) {
          const instructionPatterns = [
            /<li[^>]*class="[^"]*instruction[^"]*"[^>]*>([^<]+)</gi,
            /<div[^>]*class="[^"]*instruction[^"]*"[^>]*>([^<]+)</gi,
            /<p[^>]*class="[^"]*instruction[^"]*"[^>]*>([^<]+)</gi,
          ];
          
          for (const pattern of instructionPatterns) {
            const matches = Array.from(html.matchAll(pattern));
            if (matches.length > 0) {
              instructions = matches.map(match => match[1].replace(/<[^>]*>/g, '').trim()).filter(Boolean);
              break;
            }
          }
        }
      }
      
      // Validate we have minimum required data
      if (!recipeName || ingredients.length === 0 || instructions.length === 0) {
        throw new UserError(`Could not extract recipe data from URL. Found: name="${recipeName}", ingredients=${ingredients.length}, instructions=${instructions.length}`);
      }
      
      // Create the recipe using the extracted data
      const recipeRequest: CreateRecipeRequest = {
        name: recipeName,
        note: description,
        sourceName: new URL(request.url).hostname,
        sourceUrl: request.url,
        ingredients: ingredients.map(ing => ({
          rawIngredient: ing,
          name: ing.replace(/^\d+(\.\d+)?\s*(cups?|tbsp?|tsp?|oz|lbs?|g|kg|ml|l|cloves?|bunch|pinch)\s*/, '').trim(),
          quantity: ing.match(/^\d+(\.\d+)?\s*(cups?|tbsp?|tsp?|oz|lbs?|g|kg|ml|l|cloves?|bunch|pinch)/)?.[0] || undefined,
        })),
        preparationSteps: instructions,
        prepTime,
        cookTime,
        servings,
      };
      
      return await this.createRecipe(recipeRequest);
    } catch (error) {
      if (error instanceof UserError) {
        throw error;
      }
      throw new UserError(`Failed to import recipe from URL: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Get a specific recipe by ID
   */
  async getRecipe(recipeId: string): Promise<RecipeInfo> {
    const client = await this.ensureConnected();
    
    try {
      await client.getRecipes();
      const recipe = client.recipes.find((r: any) => r.identifier === recipeId);
      if (!recipe) {
        throw new UserError(`Recipe with ID ${recipeId} not found`);
      }
      return this.mapRecipeInfo(recipe);
    } catch (error) {
      throw new UserError(`Failed to get recipe: ${this.getErrorMessage(error)}`);
    }
  }

  // Meal Planning Methods

  /**
   * Get meal planning events
   */
  async getMealEvents(startDate?: string, endDate?: string): Promise<MealEventInfo[]> {
    const client = await this.ensureConnected();
    
    try {
      await client.getMealPlanningCalendarEvents();
      const events = client.mealPlanningCalendarEvents;
      let filteredEvents = events;
      
      // Filter by date range if provided
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        
        filteredEvents = events.filter((event: any) => {
          const eventDate = new Date(event.date);
          if (start && eventDate < start) return false;
          if (end && eventDate > end) return false;
          return true;
        });
      }
      
      return filteredEvents.map((event: any) => this.mapMealEventInfo(event));
    } catch (error) {
      throw new UserError(`Failed to get meal events: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Get a specific meal event by ID
   */
  async getMealEvent(eventId: string): Promise<MealEventInfo | null> {
    const client = await this.ensureConnected();

    try {
      await client.getMealPlanningCalendarEvents();
      const events = client.mealPlanningCalendarEvents;
      const event = events.find((e: any) => e.identifier === eventId);
      return event ? this.mapMealEventInfo(event) : null;
    } catch (error) {
      throw new UserError(`Failed to get meal event: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Get meal planning labels (Breakfast, Lunch, Dinner, etc.)
   */
  async getMealPlanLabels(): Promise<any[]> {
    const client = await this.ensureConnected();

    try {
      await client.getMealPlanningCalendarEvents();
      return ((client as any).mealPlanningCalendarEventLabels || []).map((l: any) => ({
        identifier: l.identifier,
        name: l.name,
        hexColor: l.hexColor,
        sortIndex: l.sortIndex,
      }));
    } catch (error) {
      throw new UserError(`Failed to get meal plan labels: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Create a meal planning event
   */
  async createMealEvent(request: CreateMealEventRequest): Promise<MealEventInfo> {
    const client = await this.ensureConnected();
    
    try {
      const eventObj: Record<string, any> = { date: new Date(request.date) };
      if (request.title) eventObj['title'] = request.title;
      if (request.recipeId) eventObj['recipeId'] = request.recipeId;
      if (request.labelId) eventObj['labelId'] = request.labelId;
      if (request.details) eventObj['details'] = request.details;
      if (request.recipeScaleFactor) eventObj['recipeScaleFactor'] = request.recipeScaleFactor;

      const event = await client.createEvent(eventObj);

      await event.save();
      return this.mapMealEventInfo(event);
    } catch (error) {
      throw new UserError(`Failed to create meal event: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Delete a meal planning event
   */
  async deleteMealEvent(eventId: string): Promise<void> {
    const client = await this.ensureConnected();

    try {
      await client.getMealPlanningCalendarEvents();
      const events = client.mealPlanningCalendarEvents;
      const event = events.find((e: any) => e.identifier === eventId);
      if (!event) {
        throw new UserError(`Meal event with ID ${eventId} not found`);
      }

      await event.delete();
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(`Failed to delete meal event: ${this.getErrorMessage(error)}`);
    }
  }

  // Recipe Collection Methods

  async createRecipeCollection(name: string): Promise<RecipeCollectionInfo> {
    const client = await this.ensureConnected();

    try {
      await client.getRecipes();
      const collection = client.createRecipeCollection({ name });
      await collection.save();
      return {
        identifier: collection.identifier,
        timestamp: collection.timestamp,
        name: collection.name,
        recipeIds: collection.recipeIds || [],
      };
    } catch (error) {
      throw new UserError(`Failed to create recipe collection: ${this.getErrorMessage(error)}`);
    }
  }

  async addRecipeToCollection(collectionId: string, recipeId: string): Promise<void> {
    const client = await this.ensureConnected();

    try {
      await client.getRecipes();
      // Access recipe collections from the decoded user data
      const userData = await (client as any)._getUserData(false);
      const collections = userData.recipeDataResponse.recipeCollections || [];
      const collectionData = collections.find((c: any) => c.identifier === collectionId);
      if (!collectionData) {
        throw new UserError(`Recipe collection with ID ${collectionId} not found`);
      }

      // Reconstruct as a RecipeCollection instance and add the recipe
      const collection = client.createRecipeCollection(collectionData);
      await collection.addRecipe(recipeId);
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(`Failed to add recipe to collection: ${this.getErrorMessage(error)}`);
    }
  }

  // Helper Methods

  private mapItemInfo(item: any): ItemInfo {
    return {
      listId: item.listId,
      identifier: item.identifier,
      name: item.name,
      details: item.details,
      quantity: item.quantity,
      checked: item.checked,
      manualSortIndex: item.manualSortIndex,
      userId: item.userId,
      categoryMatchId: item.categoryMatchId,
    };
  }

  private mapRecipeInfo(recipe: any): RecipeInfo {
    return {
      identifier: recipe.identifier,
      timestamp: recipe.timestamp,
      name: recipe.name,
      note: recipe.note,
      sourceName: recipe.sourceName,
      sourceUrl: recipe.sourceUrl,
      ingredients: recipe.ingredients || [],
      preparationSteps: recipe.preparationSteps || [],
      instructions: recipe.preparationSteps || [], // Map preparationSteps to instructions
      photoIds: recipe.photoIds,
      adCampaignId: recipe.adCampaignId,
      photoUrls: recipe.photoUrls,
      scaleFactor: recipe.scaleFactor || 1,
      rating: recipe.rating,
      creationTimestamp: recipe.creationTimestamp,
      nutritionalInfo: recipe.nutritionalInfo,
      cookTime: recipe.cookTime,
      prepTime: recipe.prepTime,
      servings: recipe.servings,
      paprikaIdentifier: recipe.paprikaIdentifier,
    };
  }

  private mapMealEventInfo(event: any): MealEventInfo {
    return {
      identifier: event.identifier,
      calendarId: event.calendarId,
      date: event.date,
      details: event.details,
      labelId: event.labelId,
      label: event.label,
      logicalTimestamp: event.logicalTimestamp,
      orderAddedSortIndex: event.orderAddedSortIndex,
      recipeId: event.recipeId,
      recipe: event.recipe,
      recipeScaleFactor: event.recipeScaleFactor,
      title: event.title,
    };
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}