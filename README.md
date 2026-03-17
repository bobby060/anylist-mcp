# AnyList MCP Server

A Model Context Protocol (MCP) server that integrates with AnyList, enabling Claude and other MCP-compatible clients to manage grocery lists, recipes, and meal planning through natural language interactions.

## Features

### 🛒 List Management
- **Get Lists**: View all your AnyList lists with items
- **Add Items**: Add new items to any list with quantity and details
- **Update Items**: Modify item names, quantities, details, or check/uncheck status
- **Remove Items**: Delete items from lists
- **Toggle Items**: Quickly check/uncheck items
- **Bulk Operations**: Uncheck all items in a list

### 👨‍🍳 Recipe Management
- **Recipe CRUD**: Create, read, update, and delete recipes
- **Recipe Details**: Full recipe information including ingredients, instructions, prep/cook times
- **Recipe Import**: Import recipes from URLs (where supported by AnyList)
- **Recipe Collections**: Organize recipes into collections
- **Recipe Search**: Find and view specific recipes

### 📅 Meal Planning
- **Meal Events**: Create and manage meal planning events
- **Recipe Assignment**: Link recipes to specific meals
- **Daily Planning**: View meals planned for specific dates
- **Weekly Planning**: Get comprehensive weekly meal plans
- **Calendar Integration**: Schedule meals with dates and meal types

## Documentation

📚 **Complete documentation is available in the `/docs` directory:**

- **[Setup Guide](docs/SETUP_GUIDE.md)** - Comprehensive installation and configuration
- **[API Reference](docs/API_REFERENCE.md)** - Complete tool documentation with examples
- **[Authentication Guide](docs/AUTHENTICATION.md)** - Secure credential management
- **[Usage Examples](docs/EXAMPLES.md)** - Practical workflows and use cases
- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Contributing and development
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Project Completion](docs/PROJECT_COMPLETION.md)** - Final deployment and verification procedures
- **[Test Suite Documentation](docs/TEST_SUITE.md)** - Comprehensive testing guide and procedures
- **[Type Documentation](docs/types-documentation.md)** - TypeScript types and validation

## Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- An AnyList account with valid credentials
- Claude Desktop (for MCP integration) or another MCP-compatible client

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd anylist-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## Quick Configuration

**For detailed setup instructions, see the [Setup Guide](docs/SETUP_GUIDE.md)**

### Basic Environment Setup

Create a `.env` file with your AnyList credentials:

```bash
ANYLIST_EMAIL=your-email@example.com
ANYLIST_PASSWORD=your-password
```

### Claude Desktop Integration

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "anylist": {
      "command": "node",
      "args": ["/path/to/anylist-mcp/dist/index.js"],
      "env": {
        "ANYLIST_EMAIL": "your-email@example.com",
        "ANYLIST_PASSWORD": "your-password"
      }
    }
  }
}
```

**For comprehensive setup instructions including:**
- Multiple authentication methods
- Platform-specific configurations
- Troubleshooting steps
- Security best practices

**👉 See the [Setup Guide](docs/SETUP_GUIDE.md)**

## Usage

**For comprehensive usage examples and workflows, see [Usage Examples](docs/EXAMPLES.md)**

### Quick Examples

Once connected to Claude Desktop, you can use natural language to interact with AnyList:

#### List Management
```
Show me all my AnyList lists
Add milk and bread to my grocery list
Check off eggs from my shopping list
```

#### Recipe Management
```
Show me all my recipes
Create a new recipe for chocolate chip cookies
Get the details for my lasagna recipe
```

#### Meal Planning
```
What meals do I have planned for today?
Schedule chicken dinner for tomorrow
Show me my meal plan for this week
```

**👉 For detailed workflows, advanced examples, and best practices, see [Usage Examples](docs/EXAMPLES.md)**

## Development

**For comprehensive development information, see [Developer Guide](docs/DEVELOPER_GUIDE.md)**

### Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Type check
npm run type-check

# Lint code
npm run lint
```

**👉 For architecture details, contribution guidelines, and development workflows, see [Developer Guide](docs/DEVELOPER_GUIDE.md)**

## API Reference

**For complete API documentation, see [API Reference](docs/API_REFERENCE.md)**

### Available Tools

- **Authentication Tools** - Manage credentials and authentication
- **List Management** - Create, view, and manage grocery lists and items
- **Recipe Management** - Create, update, and organize recipes
- **Meal Planning** - Schedule meals and plan weekly menus
- **Bulk Operations** - Efficient multi-item operations

**👉 For detailed tool documentation with parameters and examples, see [API Reference](docs/API_REFERENCE.md)**

## Troubleshooting

**For comprehensive troubleshooting, see [Troubleshooting Guide](docs/TROUBLESHOOTING.md)**

### Quick Solutions

**Authentication Issues:**
```
# In Claude Desktop
Check my AnyList authentication status
```

**Connection Problems:**
```bash
# Test connectivity
ping api.anylist.com
```

**Configuration Issues:**
```bash
# Validate configuration
npm run type-check
```

**👉 For detailed solutions to common issues, see [Troubleshooting Guide](docs/TROUBLESHOOTING.md)**

## Contributing

**For contribution guidelines, see [Developer Guide](docs/DEVELOPER_GUIDE.md)**

1. Fork the repository
2. Create a feature branch
3. Make your changes and add tests
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [FastMCP](https://github.com/punkpeye/fastmcp) - TypeScript MCP framework
- [AnyList API](https://github.com/codetheweb/anylist) - Unofficial AnyList API wrapper
- [Model Context Protocol](https://modelcontextprotocol.io/) - Protocol specification 