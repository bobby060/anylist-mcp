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

// Register health check tool
server.registerTool("health_check", {
  title: "Health Check",
  description: "Check if the AnyList MCP server is running",
  inputSchema: {}
}, async () => ({
  content: [
    {
      type: "text",
      text: "AnyList MCP Server is running successfully!",
    },
  ],
}));

// Register AnyList connection test tool
server.registerTool("anylist_connect", {
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Anylist MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});