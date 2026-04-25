import { z } from "zod";
import { textResponse, errorResponse } from "./helpers.js";
import { createElicitationHelpers } from "./elicitation.js";

export function register(server, getClient) {
  const { elicitListName, elicitItemChoice, elicitRequiredField } = createElicitationHelpers(server);

  function findPartialMatches(client, itemName) {
    const items = client.targetList.items || [];
    const lower = itemName.toLowerCase();
    return items
      .filter(i => !i.checked && i.name.toLowerCase().includes(lower))
      .map(i => i.name);
  }

  async function resolveItemName(client, itemName) {
    const exact = client.targetList.getItemByName(itemName);
    if (exact) return itemName;
    const matches = findPartialMatches(client, itemName);
    if (matches.length === 0) throw new Error(`Item "${itemName}" not found in list`);
    if (matches.length === 1) return matches[0];
    return await elicitItemChoice(itemName, matches);
  }

  server.registerTool("shopping", {
    title: "Shopping Lists & Items",
    description: `Manage AnyList shopping lists and items. Actions:
- list_lists: Show all lists with item counts
- list_items: Show items on a list (grouped by category)
- add_item: Add an item to a list
- check_item: Check off (complete) an item
- delete_item: Permanently remove an item from a list
- get_favorites: Get favorite items for a list
- get_recents: Get recently added items for a list`,
    inputSchema: {
      action: z.enum(["list_lists", "list_items", "add_item", "check_item", "delete_item", "get_favorites", "get_recents"]).describe("The shopping action to perform"),
      list_name: z.string().optional().describe("Name of the list (defaults to configured default list)"),
      name: z.string().optional().describe("Item name (required for add_item, check_item, delete_item)"),
      quantity: z.number().min(1).optional().describe("Item quantity (add_item only, defaults to 1)"),
      notes: z.string().optional().describe("Notes for the item (add_item only)"),
      category: z.string().optional().describe("Category for the item (add_item only). Use system category strings: produce, dairy, meat, bakery, beverages, breakfast-and-cereal, condiments-oils-and-salad-dressings, cooking-and-baking, deli, frozen-foods, grains-pasta-and-side-dishes, health-and-personal-care, household-and-cleaning, pet-supplies, seafood, snacks-cookies-and-candy, soups-and-canned-goods, wine-beer-spirits, baby, other. Infer the correct category from the item name when not specified by the user."),
      include_checked: z.boolean().optional().describe("Include checked-off items (list_items only, default false)"),
      include_notes: z.boolean().optional().describe("Include notes for each item (list_items only, default false)"),
    }
  }, async (params) => {
    const { action, list_name, name, quantity, notes, category, include_checked, include_notes } = params;
    try {
      const client = await getClient();
      switch (action) {
        case "list_lists": {
          await client.connect(list_name || null);
          const lists = client.getLists();
          if (lists.length === 0) return textResponse("No lists found in the account.");
          const output = lists.map(l => `- ${l.name} (${l.uncheckedCount} unchecked items)`).join("\n");
          return textResponse(`Available lists (${lists.length}):\n${output}`);
        }
        case "list_items": {
          let resolvedListName = list_name;
          if (!resolvedListName && !client.defaultListName) {
            await client.connect(null);
            const lists = client.getLists();
            if (lists.length > 1) {
              resolvedListName = await elicitListName(lists);
            }
          }
          await client.connect(resolvedListName);
          const items = await client.getItems(include_checked || false, include_notes || false);
          if (items.length === 0) {
            return textResponse(include_checked
              ? `List "${client.targetList.name}" is empty.`
              : `No unchecked items on list "${client.targetList.name}".`);
          }
          const itemsByCategory = {};
          items.forEach(item => {
            const cat = item.category || 'other';
            if (!itemsByCategory[cat]) itemsByCategory[cat] = [];
            itemsByCategory[cat].push(item);
          });
          const itemList = Object.keys(itemsByCategory).sort().map(category => {
            const categoryItems = itemsByCategory[category].map(item => {
              const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
              const status = item.checked ? " ✓" : "";
              const note = item.note ? ` [${item.note}]` : "";
              return `  - ${item.name}${qty}${status}${note}`;
            }).join("\n");
            return `**${category}**\n${categoryItems}`;
          }).join("\n\n");
          return textResponse(`Shopping list "${client.targetList.name}" (${items.length} items):\n${itemList}`);
        }
        case "add_item": {
          let itemName = name;
          if (!itemName) itemName = await elicitRequiredField("name", "What item would you like to add?");
          await client.connect(list_name);
          const resolvedCategory = await client.addItem(itemName, quantity || 1, notes || null, category || null);
          const catSuffix = resolvedCategory ? ` [${resolvedCategory}]` : '';
          return textResponse(`Successfully added "${itemName}" to list "${client.targetList.name}"${catSuffix}`);
        }
        case "check_item": {
          let itemName = name;
          if (!itemName) itemName = await elicitRequiredField("name", "What item would you like to check off?");
          await client.connect(list_name);
          const resolvedCheck = await resolveItemName(client, itemName);
          await client.removeItem(resolvedCheck);
          return textResponse(`Successfully checked off "${resolvedCheck}" from list "${client.targetList.name}"`);
        }
        case "delete_item": {
          let itemName = name;
          if (!itemName) itemName = await elicitRequiredField("name", "What item would you like to delete?");
          await client.connect(list_name);
          const resolvedDelete = await resolveItemName(client, itemName);
          await client.deleteItem(resolvedDelete);
          return textResponse(`Successfully deleted "${resolvedDelete}" from list "${client.targetList.name}"`);
        }
        case "get_favorites": {
          await client.connect(list_name || null);
          const items = await client.getFavoriteItems(list_name);
          if (items.length === 0) return textResponse(`No favorite items for list "${client.targetList.name}".`);
          const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
          return textResponse(`Favorite items for "${client.targetList.name}" (${items.length}):\n${list}`);
        }
        case "get_recents": {
          await client.connect(list_name || null);
          const items = await client.getRecentItems(list_name);
          if (items.length === 0) return textResponse(`No recent items for list "${client.targetList.name}".`);
          const list = items.map(i => `- ${i.name}${i.details ? ` [${i.details}]` : ''}`).join('\n');
          return textResponse(`Recent items for "${client.targetList.name}" (${items.length}):\n${list}`);
        }
      }
    } catch (error) {
      return errorResponse(`Shopping ${action} failed: ${error.message}`);
    }
  });
}
