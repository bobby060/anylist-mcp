import { register as registerHealth } from "./health.js";
import { register as registerShopping } from "./shopping.js";
import { register as registerRecipes } from "./recipes.js";
import { register as registerMealPlan } from "./meal-plan.js";
import { register as registerRecipeCollections } from "./recipe-collections.js";

/**
 * Register all AnyList MCP tools on the given server.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {() => Promise<import("../anylist-client.js").default>} getClient
 *   Async factory that returns the AnyListClient for the current request/session.
 *   For stdio: always returns the same singleton client.
 *   For HTTP: returns the per-user client from the session manager.
 */
export function registerAllTools(server, getClient) {
  registerHealth(server, getClient);
  registerShopping(server, getClient);
  registerRecipes(server, getClient);
  registerMealPlan(server, getClient);
  registerRecipeCollections(server, getClient);
}
