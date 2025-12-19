import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import AnyListClient from "./anylist-client.js";

// Load environment variables
dotenv.config();



// Create Express app

// Create AnyList client
const anylistClient = new AnyListClient();

const originalConsoleLog = console.log;
console.log = console.error;
console.info = console.error;

// Create the MCP server
const server = new McpServer({
  name: "anylist-mcp-server",
  version: "1.0.0",
});


// Register AnyList connection test tool
server.registerTool("health_check", {
  title: "AnyList Connection Test",
  description: "Test connection to AnyList and access to target shopping list",
  inputSchema: {
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ list_name }) => {
  try {
    await anylistClient.connect(list_name);
    return {
      content: [
        {
          type: "text",
          text: `Successfully connected to AnyList and found list: "${anylistClient.targetList.name}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to connect to AnyList: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register add_item tool
server.registerTool("add_item", {
  title: "Add Item to Shopping List",
  description: "Add an item to the AnyList shopping list with optional quantity",
  inputSchema: {
    name: z.string().describe("Name of the item to add"),
    quantity: z.number().min(1).optional().describe("Quantity of the item (optional, defaults to 1)"),
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ name, quantity, list_name }) => {
  try {
    await anylistClient.connect(list_name);
    await anylistClient.addItem(name, quantity || 1);
    return {
      content: [
        {
          type: "text",
          text: `Successfully added "${name}" to list "${anylistClient.targetList.name}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to add item: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register check_item tool
server.registerTool("check_item", {
  title: "Check Off Item from Shopping List",
  description: "Mark an item as completed (check it off) on the AnyList shopping list",
  inputSchema: {
    name: z.string().describe("Name of the item to check off"),
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ name, list_name }) => {
  try {
    await anylistClient.connect(list_name);
    await anylistClient.removeItem(name);
    return {
      content: [
        {
          type: "text",
          text: `Successfully checked off "${name}" from list "${anylistClient.targetList.name}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to check off item: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Register list_items tool
server.registerTool("list_items", {
  title: "List Shopping List Items",
  description: "Get all items from the AnyList shopping list",
  inputSchema: {
    include_checked: z.boolean().optional().describe("Include checked-off items (default: false)"),
    include_notes: z.boolean().optional().describe("Include notes associated with each item (default: false)"),
    list_name: z.string().optional().describe("Name of the list to use (defaults to ANYLIST_LIST_NAME env var)")
  }
}, async ({ include_checked, include_notes, list_name }) => {
  try {
    await anylistClient.connect(list_name);
    const items = await anylistClient.getItems(include_checked || false, include_notes || false);

    if (items.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: include_checked
              ? `List "${anylistClient.targetList.name}" is empty.`
              : `No unchecked items on list "${anylistClient.targetList.name}".`,
          },
        ],
      };
    }

    // Group items by category
    const itemsByCategory = {};
    items.forEach(item => {
      const cat = item.category || 'other';
      if (!itemsByCategory[cat]) {
        itemsByCategory[cat] = [];
      }
      itemsByCategory[cat].push(item);
    });

    // Format output grouped by category
    const itemList = Object.keys(itemsByCategory).sort().map(category => {
      const categoryItems = itemsByCategory[category].map(item => {
        const qty = item.quantity > 1 ? ` (x${item.quantity})` : "";
        const status = item.checked ? " ✓" : "";
        const note = item.note ? ` [${item.note}]` : "";
        return `  - ${item.name}${qty}${status}${note}`;
      }).join("\n");
      return `**${category}**\n${categoryItems}`;
    }).join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Shopping list "${anylistClient.targetList.name}" (${items.length} items):\n${itemList}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to list items: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Anylist MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});