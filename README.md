# AnyList MCP Server

This project provides a server that integrates with the [AnyList](https://www.anylist.com/) shopping list service and exposes its functionality through the Model Context Protocol (MCP). This allows language models and other applications to interact with your AnyList shopping lists programmatically.

## Features

- **Connect to AnyList:** Authenticate with your AnyList account and connect to a specific shopping list.
- **Add Items:** Add new items to your shopping list with an optional quantity.
- **Check Off Items:** Mark items as completed on your shopping list.
- **Health Check:** A simple endpoint to verify that the server is running.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- An [AnyList](https://www.anylist.com/) account

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/anylist-mcp-local.git
    cd anylist-mcp-local
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Set up environment variables:**

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

4. **Add to Claude Code**
    Add this json to your claude desktop config file

    ```json
    {
        "mcpServers": {
            "anylist": {
            "command": "node",
            "args": ["/ABSOLUTE/PATH/TO/PARENT/FOLDER/weather/build/index.js"]
            }
        }
    }
    ```

## Available Tools

The following tools are registered with the MCP server:

-   `health_check`: Check if the server is running.
-   `anylist_connect`: Test the connection to AnyList.
-   `add_item`: Add an item to the shopping list.
    -   `name` (string, required): The name of the item to add.
    -   `quantity` (number, optional): The quantity of the item.
-   `check_item`: Check off an item from the shopping list.
    -   `name` (string, required): The name of the item to check off.

## Testing

The project includes both unit and integration tests.

-   **Run all tests:**

    ```bash
    npm test
    ```

-   **Run unit tests for the AnyList client:**

    ```bash
    npm run test:unit
    ```

-   **Run integration tests for the MCP server:**

    ```bash
    npm run test:integration
    ```

