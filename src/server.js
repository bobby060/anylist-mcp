import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import AnyListClient from "./anylist-client.js";
import { registerAllTools } from "./tools/index.js";

dotenv.config();

// Redirect stdout logging to stderr so it doesn't corrupt the stdio protocol
console.log = console.error;
console.info = console.error;

const anylistClient = new AnyListClient();

const server = new McpServer({
  name: "anylist-mcp-server",
  version: "2.0.0",
});

registerAllTools(server, () => anylistClient);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Anylist MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
