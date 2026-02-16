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



  async ensureAuthenticated() {
    if (this.client) return;

    const username = process.env.ANYLIST_USERNAME;
    const password = process.env.ANYLIST_PASSWORD;

    if (!username || !password) {
      const error = new Error('Missing required environment variables: ANYLIST_USERNAME or ANYLIST_PASSWORD');
      console.error(error.message);
      throw error;
    }

    this.client = new AnyList({
      email: username,
      password: password
    });

    console.error(`Connecting to AnyList as ${username}...`);
    await this.client.login();
    console.error('Successfully authenticated with AnyList');

    await this.client.getLists();

    // The anylist-js library never populates uid on the AnyList instance,
    // but recipe/item operations need it in their operation metadata.
    // Extract it from the first list's creator field.
    if (!this.client.uid && this.client.lists.length > 0) {
      this.client.uid = this.client.lists[0].items?.[0]?.userId
        || this.client._userData?.shoppingListsResponse?.newLists?.[0]?.creator;
      if (this.client.uid) {
        console.error(`Resolved user ID: ${this.client.uid}`);
      }
    }
  }

  async connect(listName = null) {
    const targetListName = listName || process.env.ANYLIST_LIST_NAME;

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
      await this.ensureAuthenticated();

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

  // TODO: Update quantity
  async addItem(itemName, quantity = 1, notes = null) {
    if (!this.targetList) {
      const error = new Error('Not connected to any list. Call connect() first.');
      console.error(error.message);
      throw error;
    }

    try {
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

          console.error(`Unchecked existing item: ${existingItem.name}`);
          existingItem.save();
        } else {

          // Item already exists and is unchecked, no action needed
          console.error(`Item "${itemName}" already exists and is active`);
          existingItem.quantity = quantity;
          if (notes !== null) {
            existingItem.details = notes;
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

        console.error(`Added new item: ${newItem.name}`);
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
      // Find the item by name
      const existingItem = this.targetList.getItemByName(itemName);

      if (!existingItem) {
        const error = new Error(`Item "${itemName}" not found in list, so can't delete it`);
        console.error(error.message);
        throw error;
      }

      // Actually delete the item from the list
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

  async getRecipes() {
    await this.ensureAuthenticated();

    try {
      const recipes = await this.client.getRecipes();
      return recipes.map(recipe => ({
        identifier: recipe.identifier,
        name: recipe.name,
        rating: recipe.rating || null,
        servings: recipe.servings || null,
        cookTime: recipe.cookTime ? Math.round(recipe.cookTime / 60) : null,
        prepTime: recipe.prepTime ? Math.round(recipe.prepTime / 60) : null,
      }));
    } catch (error) {
      const wrappedError = new Error(`Failed to get recipes: ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async getRecipe(identifier) {
    await this.ensureAuthenticated();

    try {
      const recipes = await this.client.getRecipes();
      const recipe = recipes.find(r =>
        r.identifier === identifier ||
        r.name.toLowerCase() === identifier.toLowerCase()
      );

      if (!recipe) {
        throw new Error(`Recipe "${identifier}" not found`);
      }

      return {
        identifier: recipe.identifier,
        name: recipe.name,
        rating: recipe.rating || null,
        servings: recipe.servings || null,
        cookTime: recipe.cookTime ? Math.round(recipe.cookTime / 60) : null,
        prepTime: recipe.prepTime ? Math.round(recipe.prepTime / 60) : null,
        sourceName: recipe.sourceName || null,
        sourceUrl: recipe.sourceUrl || null,
        note: recipe.note || null,
        nutritionalInfo: recipe.nutritionalInfo || null,
        ingredients: (recipe.ingredients || []).map(ing => ({
          rawIngredient: ing.rawIngredient || null,
          name: ing.name || null,
          quantity: ing.quantity || null,
          note: ing.note || null,
        })),
        preparationSteps: recipe.preparationSteps || [],
      };
    } catch (error) {
      const wrappedError = new Error(`Failed to get recipe: ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async addRecipe({ name, note, ingredients, preparationSteps, servings, sourceName, sourceUrl, cookTime, prepTime, rating, nutritionalInfo, scaleFactor }) {
    await this.ensureAuthenticated();

    if (!name) {
      throw new Error('Recipe name is required');
    }

    try {
      const recipeOptions = { name };
      if (note) recipeOptions.note = note;
      if (servings) recipeOptions.servings = servings;
      if (sourceName) recipeOptions.sourceName = sourceName;
      if (sourceUrl) recipeOptions.sourceUrl = sourceUrl;
      if (cookTime) recipeOptions.cookTime = cookTime;
      if (prepTime) recipeOptions.prepTime = prepTime;
      if (rating) recipeOptions.rating = rating;
      if (nutritionalInfo) recipeOptions.nutritionalInfo = nutritionalInfo;
      if (scaleFactor) recipeOptions.scaleFactor = scaleFactor;
      if (preparationSteps) recipeOptions.preparationSteps = preparationSteps;
      if (ingredients) {
        recipeOptions.ingredients = ingredients.map(ing => ({
          rawIngredient: ing.rawIngredient || null,
          name: ing.name || null,
          quantity: ing.quantity || null,
          note: ing.note || null,
        }));
      }

      const recipe = await this.client.createRecipe(recipeOptions);
      await recipe.save();

      console.error(`Added recipe: ${recipe.name}`);
      return { identifier: recipe.identifier, name: recipe.name };
    } catch (error) {
      const wrappedError = new Error(`Failed to add recipe "${name}": ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async getCalendarEvents({ startDate, endDate, includeFuture } = {}) {
    await this.ensureAuthenticated();

    try {
      const events = await this.client.getMealPlanningCalendarEvents();

      const today = new Date().toISOString().slice(0, 10);
      const defaultStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const start = startDate || defaultStart;
      const end = endDate || (includeFuture ? '9999-12-31' : today);

      const filtered = events
        .filter(e => {
          const d = e.date.toISOString().slice(0, 10);
          return d >= start && d <= end;
        })
        .sort((a, b) => a.date - b.date);

      return filtered.map(e => ({
        identifier: e.identifier,
        date: e.date.toISOString().slice(0, 10),
        dayOfWeek: e.date.toLocaleDateString('en-US', { weekday: 'short' }),
        title: e.recipe?.name || e.title || '(untitled)',
        recipeId: e.recipeId || null,
        details: e.details || null,
      }));
    } catch (error) {
      const wrappedError = new Error(`Failed to get calendar events: ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async scheduleMeal(dateStr, recipeIdentifier) {
    await this.ensureAuthenticated();

    try {
      // Look up recipe by name or UUID (reuse existing logic)
      const recipes = await this.client.getRecipes();
      const recipe = recipes.find(r =>
        r.identifier === recipeIdentifier ||
        r.name.toLowerCase() === recipeIdentifier.toLowerCase()
      );

      if (!recipe) {
        throw new Error(`Recipe "${recipeIdentifier}" not found`);
      }

      const event = await this.client.createEvent({
        date: new Date(dateStr + 'T12:00:00'),
        recipeId: recipe.identifier,
      });
      await event.save();

      const dateObj = new Date(dateStr + 'T12:00:00');
      const formatted = dateObj.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      console.error(`Scheduled "${recipe.name}" on ${formatted}`);
      return { recipeName: recipe.name, date: dateStr, formatted };
    } catch (error) {
      const wrappedError = new Error(`Failed to schedule meal: ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async scheduleNote(dateStr, title) {
    await this.ensureAuthenticated();

    try {
      const event = await this.client.createEvent({
        date: new Date(dateStr + 'T12:00:00'),
        title,
      });
      await event.save();

      const dateObj = new Date(dateStr + 'T12:00:00');
      const formatted = dateObj.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });

      console.error(`Noted "${title}" on ${formatted}`);
      return { title, date: dateStr, formatted };
    } catch (error) {
      const wrappedError = new Error(`Failed to schedule note: ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  async clearCalendarRange(startDate, endDate) {
    await this.ensureAuthenticated();

    try {
      const events = await this.client.getMealPlanningCalendarEvents();

      const toDelete = events.filter(e => {
        const d = e.date.toISOString().slice(0, 10);
        return d >= startDate && d <= endDate;
      });

      for (const event of toDelete) {
        await event.delete();
      }

      console.error(`Cleared ${toDelete.length} calendar events between ${startDate} and ${endDate}`);
      return { count: toDelete.length, startDate, endDate };
    } catch (error) {
      const wrappedError = new Error(`Failed to clear calendar range: ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
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
