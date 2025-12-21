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
  inputSchema: {}
}, async () => {
  try {
    await anylistClient.connect();
    return {
      content: [
        {
          type: "text",
          text: `Successfully connected to AnyList and found list: "${process.env.ANYLIST_LIST_NAME}"`,
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
    quantity: z.number().min(1).optional().describe("Quantity of the item (optional, defaults to 1)")
  }
}, async ({ name, quantity }) => {
  try {
    await anylistClient.connect();
    await anylistClient.addItem(name, quantity || 1);
    return {
      content: [
        {
          type: "text",
          text: `Successfully added "${name}" to your shopping list`,
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
    name: z.string().describe("Name of the item to check off")
  }
}, async ({ name }) => {
  try {
    await anylistClient.connect();
    await anylistClient.removeItem(name);
    return {
      content: [
        {
          type: "text",
          text: `Successfully checked off "${name}" from your shopping list`,
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
    include_checked: z.boolean().optional().describe("Include checked-off items (default: false)")
  }
}, async ({ include_checked }) => {
  try {
    await anylistClient.connect();
    const items = await anylistClient.getItems(include_checked || false);

    if (items.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: include_checked
              ? "Your shopping list is empty."
              : "No unchecked items on your shopping list.",
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
        return `  - ${item.name}${qty}${status}`;
      }).join("\n");
      return `**${category}**\n${categoryItems}`;
    }).join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Shopping list "${process.env.ANYLIST_LIST_NAME}" (${items.length} items):\n${itemList}`,
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

// Register list_lists tool
server.registerTool("list_lists", {
  title: "List Available Lists",
  description: "Get all available lists in the AnyList account with the number of unchecked items in each list",
  inputSchema: {}
}, async () => {
  try {
    // Connect without a specific list to authenticate and fetch lists
    await anylistClient.connect(process.env.ANYLIST_LIST_NAME || null);
    const lists = anylistClient.getLists();

    if (lists.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No lists found in the account.",
          },
        ],
      };
    }

    const listOutput = lists.map(list => `- ${list.name} (${list.uncheckedCount} unchecked items)`).join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Available lists (${lists.length}):\n${listOutput}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to list lists: ${error.message}`,
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