import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { AnyListService } from '../services/anylist-service.js';
import {
  CreateListSchema,
  AddItemSchema,
  UpdateItemSchema,
  RemoveItemSchema,
  UncheckAllItemsSchema,
  GetListsSchema,
} from '../utils/validation.js';

/**
 * Register list management tools with FastMCP
 */
export function registerListTools(server: FastMCP, anylistService: AnyListService) {
  // Get all lists
  server.addTool({
    name: 'get_lists',
    description: 'Retrieve all AnyList lists with their items',
    parameters: GetListsSchema,
    execute: async (request) => {
      try {
        const lists = await anylistService.getLists();
        const includeItems = request.includeItems ?? true;
        
        return {
          content: [
            {
              type: 'text',
              text: `Found ${lists.length} lists:\n\n${lists
                .map(
                  (list) =>
                    `**${list.name}** (ID: ${list.identifier})\n` +
                    `  Items: ${list.items.length}\n` +
                    (includeItems
                      ? `  ${list.items
                        .slice(0, 5)
                        .map((item) => `  - ${item.checked ? '✓' : '○'} ${item.name}`)
                        .join('\n')}\n` +
                        (list.items.length > 5 ? `  ... and ${list.items.length - 5} more items\n` : '')
                      : '')
                )
                .join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error retrieving lists: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  // Create a new list
  server.addTool({
    name: 'create_list',
    description: 'Create a new AnyList list',
    parameters: CreateListSchema,
    execute: async (request) => {
      try {
        const list = await anylistService.createList(request as any);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully created list "${list.name}" with ID: ${list.identifier}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error creating list: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  // Add item to list
  server.addTool({
    name: 'add_item',
    description: 'Add an item to an AnyList list',
    parameters: AddItemSchema,
    execute: async (request) => {
      try {
        const item = await anylistService.addItem(request as any);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully added "${item.name}" to the list${
                item.quantity ? ` (quantity: ${item.quantity})` : ''
              }${item.details ? ` - ${item.details}` : ''}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error adding item: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  // Update/toggle item
  server.addTool({
    name: 'update_item',
    description: 'Update an item in an AnyList list (name, quantity, details, or check/uncheck)',
    parameters: UpdateItemSchema,
    execute: async (request) => {
      try {
        const item = await anylistService.updateItem(request as any);
        const updates = [];
        if (request.name !== undefined) updates.push(`name: "${item.name}"`);
        if (request.quantity !== undefined) updates.push(`quantity: ${item.quantity}`);
        if (request.details !== undefined) updates.push(`details: "${item.details}"`);
        if (request.checked !== undefined) updates.push(`status: ${item.checked ? 'checked' : 'unchecked'}`);

        return {
          content: [
            {
              type: 'text',
              text: `Successfully updated item "${item.name}"${
                updates.length > 0 ? ` (${updates.join(', ')})` : ''
              }`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error updating item: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  // Remove item from list
  server.addTool({
    name: 'remove_item',
    description: 'Remove an item from an AnyList list',
    parameters: RemoveItemSchema,
    execute: async ({ listId, itemId }) => {
      try {
        await anylistService.removeItem(listId, itemId);
        return {
          content: [
            {
              type: 'text',
              text: 'Successfully removed item from list',
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error removing item: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  // Toggle item checked status
  server.addTool({
    name: 'toggle_item',
    description: 'Toggle the checked/unchecked status of an item in an AnyList list',
    parameters: RemoveItemSchema, // Same schema as remove_item (listId, itemId)
    execute: async ({ listId, itemId }) => {
      try {
        // First get the current item to determine its current state
        const lists = await anylistService.getLists();
        const list = lists.find((l) => l.identifier === listId);
        if (!list) {
          throw new Error(`List with ID ${listId} not found`);
        }
        
        const currentItem = list.items.find((item) => item.identifier === itemId);
        if (!currentItem) {
          throw new Error(`Item with ID ${itemId} not found`);
        }

        // Toggle the checked status
        const updatedItem = await anylistService.updateItem({
          listId,
          itemId,
          checked: !currentItem.checked,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully ${updatedItem.checked ? 'checked' : 'unchecked'} "${updatedItem.name}"`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error toggling item: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  // Uncheck all items in a list
  server.addTool({
    name: 'uncheck_all_items',
    description: 'Uncheck all items in an AnyList list',
    parameters: UncheckAllItemsSchema,
    execute: async ({ listId }) => {
      try {
        await anylistService.uncheckAllItems(listId);
        return {
          content: [
            {
              type: 'text',
              text: 'Successfully unchecked all items in the list',
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error unchecking all items: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  // Bulk operations
  server.addTool({
    name: 'bulk_add_items',
    description: 'Add multiple items to an AnyList list at once',
    parameters: z.object({
      listId: z.string().describe('The ID of the list to add items to'),
      items: z.array(
        z.object({
          name: z.string().min(1).describe('The name of the item'),
          details: z.string().optional().describe('Optional details for the item'),
          quantity: z.string().optional().describe('Optional quantity for the item'),
        })
      ).min(1, 'At least one item is required'),
    }),
    execute: async ({ listId, items }) => {
      try {
        const results = [];
        let successCount = 0;
        let failCount = 0;
        
        for (const itemData of items) {
          try {
            const item = await anylistService.addItem({
              listId,
              name: itemData.name,
              details: itemData.details,
              quantity: itemData.quantity,
            });
            results.push(`✓ Added "${item.name}"`);
            successCount++;
          } catch (error) {
            results.push(`✗ Failed to add "${itemData.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
            failCount++;
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Bulk add completed: ${successCount} successful, ${failCount} failed\n\n${results.join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error in bulk add operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: 'bulk_update_items',
    description: 'Update multiple items in an AnyList list at once',
    parameters: z.object({
      listId: z.string().describe('The ID of the list containing the items'),
      updates: z.array(
        z.object({
          itemId: z.string().describe('The ID of the item to update'),
          name: z.string().optional().describe('New name for the item'),
          details: z.string().optional().describe('New details for the item'),
          quantity: z.string().optional().describe('New quantity for the item'),
          checked: z.boolean().optional().describe('New checked status for the item'),
        })
      ).min(1, 'At least one update is required'),
    }),
    execute: async ({ listId, updates }) => {
      try {
        const results = [];
        let successCount = 0;
        let failCount = 0;
        
        for (const updateData of updates) {
          try {
            const item = await anylistService.updateItem({
              listId,
              itemId: updateData.itemId,
              name: updateData.name,
              details: updateData.details,
              quantity: updateData.quantity,
              checked: updateData.checked,
            });
            results.push(`✓ Updated "${item.name}"`);
            successCount++;
          } catch (error) {
            results.push(`✗ Failed to update item ${updateData.itemId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            failCount++;
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Bulk update completed: ${successCount} successful, ${failCount} failed\n\n${results.join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error in bulk update operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: 'bulk_remove_items',
    description: 'Remove multiple items from an AnyList list at once',
    parameters: z.object({
      listId: z.string().describe('The ID of the list containing the items'),
      itemIds: z.array(z.string()).min(1, 'At least one item ID is required'),
    }),
    execute: async ({ listId, itemIds }) => {
      try {
        const results = [];
        let successCount = 0;
        let failCount = 0;
        
        for (const itemId of itemIds) {
          try {
            await anylistService.removeItem(listId, itemId);
            results.push(`✓ Removed item ${itemId}`);
            successCount++;
          } catch (error) {
            results.push(`✗ Failed to remove item ${itemId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            failCount++;
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Bulk remove completed: ${successCount} successful, ${failCount} failed\n\n${results.join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error in bulk remove operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: 'bulk_toggle_items',
    description: 'Toggle the checked status of multiple items in an AnyList list at once',
    parameters: z.object({
      listId: z.string().describe('The ID of the list containing the items'),
      itemIds: z.array(z.string()).min(1, 'At least one item ID is required'),
    }),
    execute: async ({ listId, itemIds }) => {
      try {
        // First get the current list to determine current states
        const lists = await anylistService.getLists();
        const list = lists.find((l) => l.identifier === listId);
        if (!list) {
          throw new Error(`List with ID ${listId} not found`);
        }
        
        const results = [];
        let successCount = 0;
        let failCount = 0;
        
        for (const itemId of itemIds) {
          try {
            const currentItem = list.items.find((item) => item.identifier === itemId);
            if (!currentItem) {
              throw new Error(`Item with ID ${itemId} not found`);
            }
            
            const updatedItem = await anylistService.updateItem({
              listId,
              itemId,
              checked: !currentItem.checked,
            });
            
            results.push(`✓ ${updatedItem.checked ? 'Checked' : 'Unchecked'} "${updatedItem.name}"`);
            successCount++;
          } catch (error) {
            results.push(`✗ Failed to toggle item ${itemId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            failCount++;
          }
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Bulk toggle completed: ${successCount} successful, ${failCount} failed\n\n${results.join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error in bulk toggle operation: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });

  server.addTool({
    name: 'get_list_details',
    description: 'Get detailed information about a specific AnyList list',
    parameters: z.object({
      listId: z.string().describe('The ID of the list to get details for'),
    }),
    execute: async ({ listId }) => {
      try {
        const lists = await anylistService.getLists();
        const list = lists.find((l) => l.identifier === listId);
        
        if (!list) {
          return {
            content: [
              {
                type: 'text',
                text: `List with ID ${listId} not found`,
              },
            ],
          };
        }
        
        const checkedItems = list.items.filter(item => item.checked);
        const uncheckedItems = list.items.filter(item => !item.checked);
        
        return {
          content: [
            {
              type: 'text',
              text: `**${list.name}** (ID: ${list.identifier})\n` +
                `Total items: ${list.items.length}\n` +
                `Checked items: ${checkedItems.length}\n` +
                `Unchecked items: ${uncheckedItems.length}\n\n` +
                `**Unchecked Items:**\n${uncheckedItems.map(item => 
                  `- ${item.name}${item.quantity ? ` (${item.quantity})` : ''}${item.details ? ` - ${item.details}` : ''}`
                ).join('\n')}\n\n` +
                `**Checked Items:**\n${checkedItems.map(item => 
                  `- ✓ ${item.name}${item.quantity ? ` (${item.quantity})` : ''}${item.details ? ` - ${item.details}` : ''}`
                ).join('\n')}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting list details: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    },
  });
}