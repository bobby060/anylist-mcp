# AnyList MCP Server

This project provides a local server that integrates with the [AnyList](https://www.anylist.com/) shopping list service and exposes its functionality through the Model Context Protocol (MCP). This allows language models (especially Claude Desktop or Claude Code) to interact with your AnyList shopping lists. Rather than having the LLM call the AnyList API directly, this server wraps common actions (like adding or checking off items) in a way that is more intuitive for the model to use - that is, more like how a human would interact with the service.

Tested on Windows with Claude Desktop, but should also work with Claude Code. HTTP server support is currently a work in progress, but should be able to be used with different clients that support MCP over HTTP. See the [HTTP_SERVER.md](HTTP_SERVER.md) for more details on how to use the HTTP server and current limitations.

## Features

- **Connect to AnyList:** Authenticate with your AnyList account and connect to a specific shopping list.
- **Add Items:** Add new items to your shopping list with an optional quantity.
- **Check Off Items:** Mark items as completed on your shopping list.
- **List Items:** View all items on your shopping list, grouped by category.
- **List Lists:** View all available lists in your account with unchecked item counts.
- **Health Check:** A simple endpoint to verify that the server is running.

Note: The API to anylist comes from a fork of [this repo](https://github.com/codetheweb/anylist) by @codetheweb. The only change I made was to remove console.info statements, since the writing to stdout causes issues with local STDIO MCP servers.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- An [AnyList](https://www.anylist.com/) account

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/bobby060/anylist-mcp.git
    cd anylist-mcp
    ```
2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Set up environment variables (Only needed for running tests, debugging):**
    Create a `.env` file in the root of the project by copying the example file:

    ```bash
    cp .env.example .env
    ```

    Now, edit the `.env` file with your AnyList credentials and the name of the shopping list you want to use:

    ```
    # AnyList Credentials
    ANYLIST_USERNAME=your_email@example.com
    ANYLIST_PASSWORD=your_password

    # AnyList Configuration
    ANYLIST_LIST_NAME=Shopping List
    ```

4. **Stdio Server: Claude code or Claude Desktop**
    Add this json snippet to your claude desktop config file. For information about where to find this, look [here](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

    ```json
    {
        "mcpServers": {
            "anylist": {
            "command": "node",
            "args": ["/ABSOLUTE/PATH/TO/PARENT/FOLDER/anylist-mcp/src/server.js"],
            "env": {
                "ANYLIST_USERNAME":"yourusername@youremail.com",
                "ANYLIST_PASSWORD":"yourpassword",
                "ANYLIST_LIST_NAME": "target_list"
            }
            }
        }
    }
    ```


## Available Tools

The following tools are registered with the MCP server:

-   `health_check`: Check if the server is running.
-   `add_item`: Add an item to the shopping list.
    -   `name` (string, required): The name of the item to add.
    -   `quantity` (number, optional): The quantity of the item.
-   `check_item`: Check off an item from the shopping list.
    -   `name` (string, required): The name of the item to check off.
-   `list_items`: Get all items from the shopping list, grouped by category.
    -   `include_checked` (boolean, optional): Include checked-off items (default: false).
-   `list_lists`: Get all available lists in your AnyList account.
    -   Returns each list name with its number of unchecked items.

## Testing

The project includes unit tests for the AnyList client.

-   **Run all tests:**

    ```bash
    npm test
    ```

-   **Run unit tests for the AnyList client:**

    ```bash
    npm run test:unit
    ```

## Debugging with MCP Inspector
### STDIO
```bash
npx @modelcontextprotocol/inspector node src/server.js
```

### Streamable HTTP
1. Start the server with streamable HTTP:

```bash
npm start:http
```

2. Start the inspector and connect to the server:

```bash
npx @modelcontextprotocol/inspector
```

In the MCP Inspector UI, change transport type to Streamable HTTP and connect to `http://localhost:3000/mcp`.

## Contributions
Contributions are welcome! Please feel free to submit issues and pull requests - especially if you find something off.

When adding or modifying tool calls, please ensure to add tests that cover the added functionality. This makes it easier for me to test and merge changes!
