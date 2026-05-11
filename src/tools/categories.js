import { z } from "zod";
import { textResponse, errorResponse } from "./helpers.js";
import { createElicitationHelpers } from "./elicitation.js";

export function register(server, getClient) {
  const { elicitListName, elicitConfirmation, elicitRequiredField } = createElicitationHelpers(server);

  async function resolveListName(client, listName) {
    if (listName) return listName;
    if (client.defaultListName) return client.defaultListName;
    await client.connect(null);
    const lists = client.getLists();
    if (lists.length > 1) {
      return await elicitListName(lists);
    }
    return lists[0]?.name || null;
  }

  function formatGroups(groups, listName) {
    if (groups.length === 0) {
      return `List "${listName}" has no category groups.`;
    }
    const total = groups.reduce((acc, g) => acc + g.categories.length, 0);
    const sections = groups.map(group => {
      const sortedCats = [...group.categories].sort((a, b) => {
        if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
        return (a.name || '').localeCompare(b.name || '');
      });
      const lines = sortedCats.map(c => {
        const tag = c.isSystem ? ' (system)' : '';
        return `  - ${c.name}${tag}`;
      }).join('\n');
      return `**${group.name}** (${sortedCats.length} categories)\n${lines || '  (empty)'}`;
    }).join('\n\n');
    return `Categories for "${listName}" (${total} across ${groups.length} group${groups.length === 1 ? '' : 's'}):\n${sections}`;
  }

  server.registerTool("categories", {
    title: "Custom Categories",
    description: `Manage custom categories on AnyList shopping lists. Actions:
- list_categories: Show all category groups and categories for a list
- create_category: Create a new custom category in a list
- rename_category: Rename an existing custom category
- delete_category: Delete a custom category. Pass confirm:true to skip the confirmation prompt (required when running in clients without elicitation support, e.g. Cowork).
- set_item_category: Move an existing item into a category. Implemented as delete-and-recreate (AnyList's API has no working in-place move handler). PRESERVES name, quantity, details/notes, and checked status. DROPS the item identifier, photos, price history, store assignments, recipe links, meal-plan links, barcode, and manual sort position. For simple grocery items this is fine; for items with rich metadata, the agent should warn the user before calling.`,
    inputSchema: {
      action: z.enum([
        "list_categories",
        "create_category",
        "rename_category",
        "delete_category",
        "set_item_category",
      ]).describe("The category action to perform"),
      list_name: z.string().optional().describe("Name of the list (defaults to configured default list)"),
      name: z.string().optional().describe("Category name (for create_category, delete_category, and as the lookup name for rename_category). Whitespace is trimmed and matching is case-insensitive."),
      new_name: z.string().optional().describe("New name (rename_category only)"),
      group_name: z.string().optional().describe("Category group name to put a new category into (create_category only; defaults to the list's first group)"),
      item_name: z.string().optional().describe("Item name (set_item_category only)"),
      category_name: z.string().optional().describe("Category to assign the item to (set_item_category only)"),
      confirm: z.boolean().optional().describe("Skip the interactive confirmation prompt (delete_category only). Required in clients without elicitation support."),
    },
  }, async (params) => {
    const { action, list_name, name, new_name, group_name, item_name, category_name, confirm } = params;
    try {
      const client = await getClient();
      const resolvedListName = await resolveListName(client, list_name);
      await client.connect(resolvedListName);

      switch (action) {
        case "list_categories": {
          const groups = await client.getCategoryGroups();
          return textResponse(formatGroups(groups, client.targetList.name));
        }
        case "create_category": {
          const catName = name || await elicitRequiredField("name", "What should the new category be called?");
          const created = await client.createCategory(catName, { groupName: group_name || null });
          return textResponse(`Created category "${created.name}" in list "${client.targetList.name}".`);
        }
        case "rename_category": {
          const oldName = name || await elicitRequiredField("name", "Which category do you want to rename?");
          const newCatName = new_name || await elicitRequiredField("new_name", `What should "${oldName}" be renamed to?`);
          await client.renameCategory(oldName, newCatName);
          return textResponse(`Renamed category "${oldName}" to "${newCatName}" in list "${client.targetList.name}".`);
        }
        case "delete_category": {
          const catName = name || await elicitRequiredField("name", "Which category do you want to delete?");
          if (confirm !== true) {
            try {
              const confirmed = await elicitConfirmation(
                `Delete category "${catName}" from list "${client.targetList.name}"? Items in this category will fall back to "other".`
              );
              if (!confirmed) {
                return textResponse(`Cancelled. Category "${catName}" was not deleted.`);
              }
            } catch (e) {
              return errorResponse(
                `Categories delete_category needs confirmation. This client doesn't support interactive prompts; ` +
                `re-run with confirm:true to actually delete "${catName}".`
              );
            }
          }
          await client.deleteCategory(catName);
          return textResponse(`Deleted category "${catName}" from list "${client.targetList.name}".`);
        }
        case "set_item_category": {
          const itName = item_name || await elicitRequiredField("item_name", "Which item should be assigned a category?");
          const catName = category_name || await elicitRequiredField("category_name", `What category should "${itName}" be assigned to?`);
          await client.setItemCategory(itName, catName);
          return textResponse(`Assigned "${itName}" to category "${catName}" in list "${client.targetList.name}".`);
        }
      }
    } catch (error) {
      return errorResponse(`Categories ${action} failed: ${error.message}`);
    }
  });
}
