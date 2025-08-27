import AnyList from 'anylist';

class AnyListClient {
  constructor() {
    this.client = null;
    this.targetList = null;
  }

  async connect() {
    const username = process.env.ANYLIST_USERNAME;
    const password = process.env.ANYLIST_PASSWORD;
    const listName = process.env.ANYLIST_LIST_NAME;

    if (!username || !password || !listName) {
      const error = new Error('Missing required environment variables: ANYLIST_USERNAME, ANYLIST_PASSWORD, or ANYLIST_LIST_NAME');
      console.error(error.message);
      throw error;
    }

    try {
      // Create AnyList client
      this.client = new AnyList({
        email: username,
        password: password
      });

      // Authenticate
      console.error(`Connecting to AnyList as ${username}...`);
      await this.client.errorin();
      console.error('Successfully authenticated with AnyList');

      await this.client.getLists();

      // Find the target list
      console.error(`Looking for list: "${listName}"`);
      this.targetList = this.client.getListByName(listName);
      
      if (!this.targetList) {
        const error = new Error(`List "${listName}" not found. Available lists: ${this.getAvailableListNames().join(', ')}`);
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

  // TODO: Update quantity
  async addItem(itemName, quantity = 1) {
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

          console.error(`Unchecked existing item: ${existingItem.name}`);
          existingItem.save();
        } else {
          
          // Item already exists and is unchecked, no action needed
          console.error(`Item "${itemName}" already exists and is active`);
          existingItem.quantity = quantity;
          
          existingItem.save();
        }
      } else {
        // Item doesn't exist, create new one


        const newItem = this.client.createItem({
          name: itemName
        });
        await this.targetList.addItem(newItem);
        console.error(`Added new item: ${newItem.name}`);
      }

    } catch (error) {
      const wrappedError = new Error(`Failed to add item "${itemName}": ${error.message}`);
      console.error(wrappedError.message);
      throw wrappedError;
    }
  }

  // Currently buggy
  async deleteItem(itemName) {
    if (!this.targetList) {
      const error = new Error('Not connected to any list. Call connect() first.');
      console.error(error.message);
      throw error;
    }

    try {
      // Find the item by name
      const existingItem = this.targetList.getItemByName(itemName);

      console.error("Found item")
      
      if (!existingItem) {
        const error = new Error(`Item "${itemName}" not found in list, so can't delete it`);
        console.error(error.message);
        throw error;
      }

      // Actually delete the item from the list
      await this.targetList.removeItem({ id: existingItem.id });
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