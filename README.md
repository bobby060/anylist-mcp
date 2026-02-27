# AnyList MCP Server

A local MCP server that integrates with [AnyList](https://www.anylist.com/) — shopping lists, recipes, meal planning, and more — exposed via the Model Context Protocol. Works with Claude Desktop, Claude Code, or any MCP-compatible client.

## Architecture: Domain-Grouped Tools

Instead of 18+ individual tools, this branch organizes functionality into **5 domain-grouped tools** with an `action` parameter. This reduces tool clutter while keeping full coverage:

| Tool | Actions | Description |
|------|---------|-------------|
| `health_check` | — | Test AnyList connection |
| `shopping` | `list_lists`, `list_items`, `add_item`, `check_item`, `delete_item`, `get_favorites`, `get_recents` | Shopping list management |
| `recipes` | `list`, `get`, `create`, `delete` | Recipe CRUD |
| `meal_plan` | `list_events`, `list_labels`, `create_event`, `delete_event` | Meal planning calendar |
| `recipe_collections` | `list`, `create` | Recipe organization |

### Lazy Loading

- **`list` actions** return summaries (name, rating, times) — fast and lightweight
- **`get` actions** return full details (ingredients, steps) — only when you need them

This two-step pattern keeps responses small and lets the model decide when to drill down.

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

```bash
cp .env.example .env
```

```env
ANYLIST_USERNAME=your_email@example.com
ANYLIST_PASSWORD=your_password
ANYLIST_LIST_NAME=Groceries
```

### Claude Desktop / Claude Code Configuration

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

## Usage Examples

### The Action Parameter Pattern

Every domain tool takes an `action` enum plus action-specific parameters:

```json
{ "name": "shopping", "arguments": { "action": "add_item", "name": "Milk", "quantity": 2 } }
```

```json
{ "name": "recipes", "arguments": { "action": "list", "search": "pasta" } }
```

```json
{ "name": "meal_plan", "arguments": { "action": "create_event", "date": "2025-02-15", "title": "Taco Night" } }
```

### Typical Multi-Step Interaction

1. **Browse recipes** — `recipes` → `list` (get summaries)
2. **Get details** — `recipes` → `get` with `name` (full ingredients & steps)
3. **Plan the meal** — `meal_plan` → `create_event` with date and recipe
4. **Add ingredients to shopping list** — `shopping` → `add_item` for each ingredient

### Shopping Tool

```json
// List all shopping lists
{ "name": "shopping", "arguments": { "action": "list_lists" } }

// List items on a specific list
{ "name": "shopping", "arguments": { "action": "list_items", "list_name": "Costco", "include_notes": true } }

// Add an item
{ "name": "shopping", "arguments": { "action": "add_item", "name": "Eggs", "quantity": 2, "notes": "organic" } }

// Check off an item
{ "name": "shopping", "arguments": { "action": "check_item", "name": "Eggs" } }

// Delete an item permanently
{ "name": "shopping", "arguments": { "action": "delete_item", "name": "Eggs" } }
```

### Recipes Tool

```json
// Browse all recipes (summaries only — lazy loading)
{ "name": "recipes", "arguments": { "action": "list" } }

// Search recipes
{ "name": "recipes", "arguments": { "action": "list", "search": "chicken" } }

// Get full details (ingredients + steps)
{ "name": "recipes", "arguments": { "action": "get", "name": "Chicken Tikka Masala" } }

// Create a recipe
{ "name": "recipes", "arguments": {
    "action": "create",
    "name": "Simple Pasta",
    "ingredients": ["1 lb spaghetti", "2 cloves garlic", "1/4 cup olive oil"],
    "steps": ["Boil pasta", "Sauté garlic", "Toss together"],
    "servings": "4"
} }
```

### Meal Plan Tool

```json
// View meal plan
{ "name": "meal_plan", "arguments": { "action": "list_events" } }

// Get available labels (Breakfast, Lunch, Dinner, etc.)
{ "name": "meal_plan", "arguments": { "action": "list_labels" } }

// Schedule a meal
{ "name": "meal_plan", "arguments": { "action": "create_event", "date": "2025-02-15", "title": "Pizza Night", "label_id": "dinner-id" } }
```

### Recipe Collections Tool

```json
// List collections
{ "name": "recipe_collections", "arguments": { "action": "list" } }

// Create a collection
{ "name": "recipe_collections", "arguments": { "action": "create", "name": "Weeknight Dinners", "recipe_names": ["Simple Pasta"] } }
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
