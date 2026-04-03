import { z } from "zod";
import { textResponse, errorResponse } from "./helpers.js";

export function register(server, getClient) {
  server.registerTool("health_check", {
    title: "AnyList Connection Test",
    description: "Test connection to AnyList and access to target shopping list",
    inputSchema: {
      list_name: z.string().optional().describe("Name of the list to use (defaults to configured default list)")
    }
  }, async ({ list_name }) => {
    try {
      const client = await getClient();
      await client.connect(list_name);
      return textResponse(`Successfully connected to AnyList and found list: "${client.targetList.name}"`);
    } catch (error) {
      return errorResponse(`Failed to connect to AnyList: ${error.message}`);
    }
  });
}
