import AnyList from '../anylist-js/lib/index.js';
import Item from '../anylist-js/lib/item.js';

// Patch Item._encode to not include 'quantity' field which doesn't exist in protobuf schema
Item.prototype._encode = function() {
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

class AnyListClient {
  constructor() {
    this.client = null;
    this.targetList = null;
  }



  async connect(listName = null) {
    const username = process.env.ANYLIST_USERNAME;
    const password = process.env.ANYLIST_PASSWORD;
    const targetListName = listName || process.env.ANYLIST_LIST_NAME;

    if (!username || !password) {
      const error = new Error('Missing required environment variables: ANYLIST_USERNAME or ANYLIST_PASSWORD');
      console.error(error.message);
      throw error;
    }

    if (!targetListName) {
      const error = new Error('No list name provided and ANYLIST_LIST_NAME environment variable is not set');
      console.error(error.message);
      throw error;
    }

    // If already connected to the same list, skip reconnection
    if (this.client && this.targetList && this.targetList.name === targetListName) {
      return true;
    }

    try {
      // Create AnyList client if not already authenticated
      if (!this.client) {
        this.client = new AnyList({
          email: username,
          password: password
        });

        // Authenticate
        console.error(`Connecting to AnyList as ${username}...`);
        await this.client.login();
        console.error('Successfully authenticated with AnyList');

        await this.client.getLists();
      }

      // Find the target list
      console.error(`Looking for list: "${targetListName}"`);
      this.targetList = this.client.getListByName(targetListName);

      if (!this.targetList) {
        const error = new Error(`List "${targetListName}" not found. Available lists: ${this.getAvailableListNames().join(', ')}`);
        console.error(error.message);
        throw error;
      }

      console.error(`Connected to list: "${this.targetList.name}"`);

      return true;

    } catch (error) {
      const wrappedError = new Error(`Failed to connect to AnyList: ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  getAvailableListNames() {
    if (!this.client || !this.client.lists) return [];
    return this.client.lists.map(list => list.name);
  }

  getLists() {
    if (!this.client || !this.client.lists) return [];
    return this.client.lists.map(list => ({
      name: list.name,
      uncheckedCount: list.items ? list.items.filter(item => !item.checked).length : 0
    }));
  }

  /**
   * Get available categories by inspecting existing items' categoryMatchId values.
   * AnyList uses slug-based categoryMatchIds (e.g. 'dairy', 'produce', 'bakery').
   */
  getCategories() {
    if (!this.targetList) return [];
    const slugs = new Set();
    for (const item of (this.targetList.items || [])) {
      if (item._categoryMatchId) {
        slugs.add(item._categoryMatchId);
      }
    }
    return [...slugs].map(slug => this._slugToDisplayName(slug)).sort();
  }

  /**
   * Convert a category slug to a display name.
   * e.g. 'dairy' → 'Dairy', 'frozen-foods' → 'Frozen Foods'
   */
  _slugToDisplayName(slug) {
    if (!slug) return 'Other';
    return slug.split('-').map(word => {
      if (['and', 'or', 'the', 'of'].includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }

  /**
   * Convert a display name to a category slug.
   * e.g. 'Dairy' → 'dairy', 'Frozen Foods' → 'frozen-foods'
   */
  _displayNameToSlug(name) {
    if (!name) return null;
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  /**
   * Resolve a category name to its slug for categoryMatchId.
   * Accepts display names ('Dairy'), slugs ('dairy'), or partial matches.
   * Returns null if not found.
   */
  _resolveCategoryId(categoryName) {
    if (!categoryName) return null;

    const inputSlug = this._displayNameToSlug(categoryName);

    // Get all known slugs from items
    const knownSlugs = new Set();
    for (const item of (this.targetList?.items || [])) {
      if (item._categoryMatchId) {
        knownSlugs.add(item._categoryMatchId);
      }
    }

    // Exact match
    if (knownSlugs.has(inputSlug)) return inputSlug;

    // Try partial match (e.g. 'frozen' matches 'frozen-foods')
    for (const slug of knownSlugs) {
      if (slug.includes(inputSlug) || inputSlug.includes(slug)) return slug;
    }

    // If not found in existing items, still use the slug
    // (AnyList may accept new category slugs)
    return inputSlug;
  }

  // TODO: Update quantity
  async addItem(itemName, quantity = 1, notes = null, category = null) {
    if (!this.targetList) {
      const error = new Error('Not connected to any list. Call connect() first.');
      console.error(error.message);
      throw error;
    }

    try {
      // Resolve category name to ID if provided
      const categoryMatchId = this._resolveCategoryId(category);
      if (category && !categoryMatchId) {
        const available = this.getCategories();
        throw new Error(`Unknown category "${category}". Available categories: ${available.join(', ')}`);
      }

      // First, check if item already exists
      const existingItem = this.targetList.getItemByName(itemName);

      if (existingItem) {
        // Item exists - check if it's checked (completed)
        if (existingItem.checked) {
          // Uncheck the item to make it active again
          existingItem.checked = false;
          existingItem.quantity = quantity; // Update quantity if needed
          if (notes !== null) {
            existingItem.details = notes;
          }
          if (categoryMatchId) {
            existingItem._categoryMatchId = categoryMatchId;
          }

          console.error(`Unchecked existing item: ${existingItem.name}`);
          existingItem.save();
        } else {

          // Item already exists and is unchecked, no action needed
          console.error(`Item "${itemName}" already exists and is active`);
          existingItem.quantity = quantity;
          if (notes !== null) {
            existingItem.details = notes;
          }
          if (categoryMatchId) {
            existingItem._categoryMatchId = categoryMatchId;
          }

          existingItem.save();
        }
      } else {
        // Item doesn't exist, create new one
        const itemOptions = { name: itemName };
        if (notes !== null) {
          itemOptions.details = notes;
        }

        const newItem = this.client.createItem(itemOptions);
        if (categoryMatchId) {
          newItem._categoryMatchId = categoryMatchId;
        }
        await this.targetList.addItem(newItem);

        // Set quantity and notes after adding (can't be done via _encode)
        if (quantity !== 1 || notes !== null) {
          if (quantity !== 1) {
            newItem.quantity = quantity;
          }
          if (notes !== null) {
            newItem.details = notes;
          }
          await newItem.save();
        }

        console.error(`Added new item: ${newItem.name}${category ? ` (${category})` : ''}`);
      }

    } catch (error) {
      const wrappedError = new Error(`Failed to add item "${itemName}": ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async deleteItem(itemName) {
    if (!this.targetList) {
      const error = new Error('Not connected to any list. Call connect() first.');
      console.error(error.message);
      throw error;
    }

    try {
      const existingItem = this.targetList.getItemByName(itemName);

      if (!existingItem) {
        const error = new Error(`Item "${itemName}" not found in list, so can't delete it`);
        console.error(error.message);
        throw error;
      }

      await this.targetList.removeItem(existingItem);
      console.error(`Deleted item: ${existingItem.name}`);

    } catch (error) {
      const wrappedError = new Error(`Failed to delete item "${itemName}": ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async removeItem(itemName) {
    if (!this.targetList) {
      const error = new Error('Not connected to any list. Call connect() first.');
      console.error(error.message);
      throw error;
    }

    try {
      // Find the item by name
      const existingItem = this.targetList.getItemByName(itemName);

      if (!existingItem) {
        const error = new Error(`Item "${itemName}" not found in list, so can't check it`);
        console.error(error.message);
        throw error;
      }

      // Check the item (mark as completed) instead of deleting
      if (!existingItem.checked) {
        existingItem.checked = true;
        await existingItem.save();
        console.error(`Checked off item: ${existingItem.name}`);
      } else {
        console.error(`Item "${itemName}" is already checked off`);
      }
    } catch (error) {
      const wrappedError = new Error(`Failed to remove item "${itemName}": ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async getItems(includeChecked = false, includeNotes = false) {
    if (!this.targetList) {
      const error = new Error('Not connected to any list. Call connect() first.');
      console.error(error.message);
      throw error;
    }

    try {
      // Build category ID to name map from the response data
      const categoryMap = this._buildCategoryMap();

      // Get all items from the list
      const items = this.targetList.items || [];

      // Filter based on checked status
      const filteredItems = includeChecked
        ? items
        : items.filter(item => !item.checked);

      // Map to a clean format
      return filteredItems.map(item => {
        const result = {
          name: item.name,
          quantity: typeof item.quantity === 'number' ? item.quantity : 1,
          checked: item.checked || false,
          category: categoryMap[item.categoryMatchId] || 'other'
        };
        if (includeNotes && item.details) {
          result.note = item.details;
        }
        return result;
      });
    } catch (error) {
      const wrappedError = new Error(`Failed to get items: ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  _buildCategoryMap() {
    const categoryMap = {};
    try {
      // Access the raw user data from the client to get category groups
      const userData = this.client._userData;
      if (userData && userData.shoppingListsResponse && userData.shoppingListsResponse.categoryGroupResponses) {
        for (const groupResponse of userData.shoppingListsResponse.categoryGroupResponses) {
          if (groupResponse.categoryGroup && groupResponse.categoryGroup.categories) {
            for (const category of groupResponse.categoryGroup.categories) {
              if (category.identifier && category.name) {
                categoryMap[category.identifier] = category.name;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to build category map: ${error.message}`);
    }
    return categoryMap;
  }

  // ===== RECIPES =====

  async getRecipes(searchQuery = null) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const recipes = await this.client.getRecipes();
      let results = recipes.map(r => ({
        identifier: r.identifier,
        name: r.name,
        note: r.note || null,
        sourceName: r.sourceName || null,
        sourceUrl: r.sourceUrl || null,
        rating: r.rating || null,
        prepTime: r.prepTime || null,
        cookTime: r.cookTime || null,
        servings: r.servings || null,
        ingredientCount: r.ingredients ? r.ingredients.length : 0,
        stepCount: r.preparationSteps ? r.preparationSteps.length : 0,
      }));
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        results = results.filter(r => r.name && r.name.toLowerCase().includes(q));
      }
      return results;
    } catch (error) {
      throw new Error(`Failed to get recipes: ${error.message}`);
    }
  }

  async getRecipeDetails(recipeName) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const recipes = await this.client.getRecipes();
      const recipe = recipes.find(r => r.name && r.name.toLowerCase() === recipeName.toLowerCase());
      if (!recipe) {
        throw new Error(`Recipe "${recipeName}" not found`);
      }
      return {
        identifier: recipe.identifier,
        name: recipe.name,
        note: recipe.note || null,
        sourceName: recipe.sourceName || null,
        sourceUrl: recipe.sourceUrl || null,
        rating: recipe.rating || null,
        prepTime: recipe.prepTime || null,
        cookTime: recipe.cookTime || null,
        servings: recipe.servings || null,
        nutritionalInfo: recipe.nutritionalInfo || null,
        ingredients: recipe.ingredients ? recipe.ingredients.map(i => ({
          rawIngredient: i.rawIngredient || null,
          name: i.name || null,
          quantity: i.quantity || null,
          note: i.note || null,
        })) : [],
        preparationSteps: recipe.preparationSteps || [],
      };
    } catch (error) {
      throw new Error(`Failed to get recipe details: ${error.message}`);
    }
  }

  async createRecipe({ name, ingredients = [], preparationSteps = [], note = null, sourceName = null, sourceUrl = null, prepTime = null, cookTime = null, servings = null }) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const recipeObj = { name };
      if (note) recipeObj.note = note;
      if (sourceName) recipeObj.sourceName = sourceName;
      if (sourceUrl) recipeObj.sourceUrl = sourceUrl;
      if (prepTime) recipeObj.prepTime = prepTime;
      if (cookTime) recipeObj.cookTime = cookTime;
      if (servings) recipeObj.servings = servings;
      if (preparationSteps.length > 0) recipeObj.preparationSteps = preparationSteps;
      if (ingredients.length > 0) {
        recipeObj.ingredients = ingredients.map(i => ({
          rawIngredient: typeof i === 'string' ? i : i.rawIngredient || `${i.quantity || ''} ${i.name || ''}`.trim(),
          name: typeof i === 'string' ? i : i.name || null,
          quantity: typeof i === 'string' ? null : i.quantity || null,
          note: typeof i === 'string' ? null : i.note || null,
        }));
      }
      const recipe = await this.client.createRecipe(recipeObj);
      await recipe.save();
      console.error(`Created recipe: ${recipe.name}`);
      return { identifier: recipe.identifier, name: recipe.name };
    } catch (error) {
      throw new Error(`Failed to create recipe: ${error.message}`);
    }
  }

  async deleteRecipe(recipeName) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const recipes = await this.client.getRecipes();
      const recipe = recipes.find(r => r.name && r.name.toLowerCase() === recipeName.toLowerCase());
      if (!recipe) {
        throw new Error(`Recipe "${recipeName}" not found`);
      }
      await recipe.delete();
      console.error(`Deleted recipe: ${recipe.name}`);
    } catch (error) {
      throw new Error(`Failed to delete recipe: ${error.message}`);
    }
  }

  // ===== MEAL PLANNING =====

  async getMealPlanEvents() {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const events = await this.client.getMealPlanningCalendarEvents();
      return events.map(e => ({
        identifier: e.identifier,
        date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date),
        title: e.title || null,
        details: e.details || null,
        labelName: e.label ? e.label.name : null,
        labelColor: e.label ? e.label.hexColor : null,
        recipeName: e.recipe ? e.recipe.name : null,
        recipeId: e.recipeId || null,
      }));
    } catch (error) {
      throw new Error(`Failed to get meal plan events: ${error.message}`);
    }
  }

  async getMealPlanLabels() {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      await this.client.getMealPlanningCalendarEvents();
      return (this.client.mealPlanningCalendarEventLabels || []).map(l => ({
        identifier: l.identifier,
        name: l.name,
        hexColor: l.hexColor,
        sortIndex: l.sortIndex,
      }));
    } catch (error) {
      throw new Error(`Failed to get meal plan labels: ${error.message}`);
    }
  }

  async createMealPlanEvent({ date, title = null, recipeId = null, labelId = null, details = null }) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const eventObj = { date: new Date(date) };
      if (title) eventObj.title = title;
      if (recipeId) eventObj.recipeId = recipeId;
      if (labelId) eventObj.labelId = labelId;
      if (details) eventObj.details = details;
      const event = await this.client.createEvent(eventObj);
      await event.save();
      console.error(`Created meal plan event for ${date}`);
      return { identifier: event.identifier, date: date };
    } catch (error) {
      throw new Error(`Failed to create meal plan event: ${error.message}`);
    }
  }

  async deleteMealPlanEvent(eventId) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const events = await this.client.getMealPlanningCalendarEvents();
      const event = events.find(e => e.identifier === eventId);
      if (!event) {
        throw new Error(`Meal plan event "${eventId}" not found`);
      }
      await event.delete();
      console.error(`Deleted meal plan event: ${eventId}`);
    } catch (error) {
      throw new Error(`Failed to delete meal plan event: ${error.message}`);
    }
  }

  // ===== FAVORITES & RECENTS =====

  async getFavoriteItems(listName) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      await this.connect(listName);
      const favList = this.client.getFavoriteItemsByListId(this.targetList.identifier);
      if (!favList || !favList.items) {
        return [];
      }
      return favList.items.map(i => ({
        name: i.name,
        details: i.details || null,
      }));
    } catch (error) {
      throw new Error(`Failed to get favorite items: ${error.message}`);
    }
  }

  async getRecentItems(listName) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      await this.connect(listName);
      const items = this.client.getRecentItemsByListId(this.targetList.identifier);
      if (!items) {
        return [];
      }
      return items.map(i => ({
        name: i.name,
        details: i.details || null,
      }));
    } catch (error) {
      throw new Error(`Failed to get recent items: ${error.message}`);
    }
  }

  // ===== RECIPE COLLECTIONS =====

  async getRecipeCollections() {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const userData = await this.client._getUserData(true);
      const collections = userData.recipeDataResponse.recipeCollections || [];
      const recipes = await this.client.getRecipes();
      return collections.map(c => ({
        identifier: c.identifier,
        name: c.name,
        recipeCount: c.recipeIds ? c.recipeIds.length : 0,
        recipeNames: (c.recipeIds || []).map(id => {
          const r = recipes.find(r => r.identifier === id);
          return r ? r.name : id;
        }),
      }));
    } catch (error) {
      throw new Error(`Failed to get recipe collections: ${error.message}`);
    }
  }

  async createRecipeCollection(name, recipeNames = []) {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    try {
      const recipeIds = [];
      if (recipeNames.length > 0) {
        const recipes = await this.client.getRecipes();
        for (const rName of recipeNames) {
          const r = recipes.find(r => r.name && r.name.toLowerCase() === rName.toLowerCase());
          if (r) recipeIds.push(r.identifier);
        }
      }
      const collection = this.client.createRecipeCollection({ name, recipeIds });
      await collection.save();
      console.error(`Created recipe collection: ${name}`);
      return { identifier: collection.identifier, name: collection.name };
    } catch (error) {
      throw new Error(`Failed to create recipe collection: ${error.message}`);
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.teardown();
        console.error('Disconnected from AnyList');
      } catch (error) {
        const wrappedError = new Error(`Error during disconnect: ${error.message}`);
        console.error(wrappedError.message);
        throw wrappedError;
      }
    }
    this.client = null;
    this.targetList = null;
  }
}

export default AnyListClient;
