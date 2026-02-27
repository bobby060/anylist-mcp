# AnyList MCP Server

A local MCP server that integrates with [AnyList](https://www.anylist.com/) — shopping lists, recipes, meal planning, and more — exposed via the Model Context Protocol. Works with Claude Desktop, Claude Code, or any MCP-compatible client.

## Features

- **Shopping Lists** — Add, check off, delete items; list all lists; view favorites and recents
- **Recipes** — Browse, search, view full details, create, and delete recipes
- **Meal Planning** — View/create/delete meal plan events; list meal plan labels
- **Recipe Collections** — List and create recipe collections
- **Health Check** — Verify connection to AnyList

## Prerequisites

- [Node.js](https://nodejs.org/) v16+
- An [AnyList](https://www.anylist.com/) account

## Installation

```bash
git clone https://github.com/bobby060/anylist-mcp.git
cd anylist-mcp
npm install
```

### Environment Variables

Create a `.env` file (for local testing/debugging):

```bash
cp .env.example .env
```

```env
ANYLIST_USERNAME=your_email@example.com
ANYLIST_PASSWORD=your_password
ANYLIST_LIST_NAME=Groceries
```

### Claude Desktop / Claude Code Configuration

Add to your MCP config:

```json
{
  "mcpServers": {
    "anylist": {
      "command": "node",
      "args": ["/absolute/path/to/anylist-mcp/src/server.js"],
      "env": {
        "ANYLIST_USERNAME": "you@example.com",
        "ANYLIST_PASSWORD": "yourpassword",
        "ANYLIST_LIST_NAME": "Groceries"
      }
    }
  }
}
```

## Available Tools

### Shopping List Tools

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `health_check` | Test AnyList connection | — |
| `add_item` | Add item to shopping list | `name` |
| `check_item` | Check off (complete) an item | `name` |
| `delete_item` | Permanently remove an item | `name` |
| `list_items` | List all items grouped by category | — |
| `list_lists` | Show all lists with unchecked counts | — |
| `get_favorites` | Get favorite items for a list | — |
| `get_recents` | Get recently added items | — |

All shopping tools accept an optional `list_name` parameter (defaults to `ANYLIST_LIST_NAME` env var).

#### Example: Add an item

```json
{ "name": "add_item", "arguments": { "name": "Milk", "quantity": 2, "notes": "whole milk", "list_name": "Groceries" } }
```

#### Example: List items

```json
{ "name": "list_items", "arguments": { "include_checked": false, "include_notes": true } }
```

### Recipe Tools

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `list_recipes` | Browse recipes (summaries with rating, times, servings) | — |
| `get_recipe` | Full recipe details (ingredients + steps) | `name` |
| `create_recipe` | Create a new recipe | `name` |
| `delete_recipe` | Delete a recipe by name | `name` |

#### Example: Search recipes

```json
{ "name": "list_recipes", "arguments": { "search": "pasta" } }
```

#### Example: Create a recipe

```json
{
  "name": "create_recipe",
  "arguments": {
    "name": "Simple Pasta",
    "ingredients": ["1 lb spaghetti", "2 cloves garlic", "1/4 cup olive oil"],
    "steps": ["Boil pasta according to package", "Sauté garlic in oil", "Toss pasta with garlic oil"],
    "prep_time": 5,
    "cook_time": 15,
    "servings": "4"
  }
}
```

### Meal Planning Tools

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `list_meal_plan_events` | Show all meal plan events sorted by date | — |
| `list_meal_plan_labels` | List labels (Breakfast, Lunch, etc.) with IDs | — |
| `create_meal_plan_event` | Add a meal plan event | `date` |
| `delete_meal_plan_event` | Delete a meal plan event | `event_id` |

#### Example: Create a meal plan event

```json
{ "name": "create_meal_plan_event", "arguments": { "date": "2025-02-15", "title": "Taco Night", "label_id": "dinner-label-id" } }
```

### Recipe Collection Tools

| Tool | Description | Required Params |
|------|-------------|-----------------|
| `list_recipe_collections` | Show all collections with recipe names | — |
| `create_recipe_collection` | Create a collection | `name` |

#### Example: Create a collection

```json
{ "name": "create_recipe_collection", "arguments": { "name": "Weeknight Dinners", "recipe_names": ["Simple Pasta", "Taco Night"] } }
```

## Testing

```bash
# Unit tests (mocked, no credentials needed)
npm test

# Integration tests (requires .env with real credentials)
npm run test:integration
```

## Debugging

```bash
npx @modelcontextprotocol/inspector node src/server.js
```

## Contributing

Contributions welcome! Please add tests for new functionality.

## Credits

AnyList API from a fork of [anylist](https://github.com/codetheweb/anylist) by @codetheweb.
