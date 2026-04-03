# Unofficial AnyList MCP Server

An MCP server that integrates with [AnyList](https://www.anylist.com/) — shopping lists, recipes, and meal planning — exposed via the Model Context Protocol. Works with Claude Desktop, Claude Code, Claude Web/Mobile, or any MCP-compatible client.

Two deployment modes:
- **Local (stdio)** — runs on your machine alongside Claude Desktop or Claude Code. Fastest setup, no server required.
- **HTTP server** — runs in Docker behind a Cloudflare Tunnel. Required for Claude Web and Claude Mobile, and useful for sharing access across devices or users.

Functionality is organized into **5 domain-grouped tools** rather than 18+ individual ones. See [docs/tools.md](docs/tools.md) for the full tool reference.

---

## Installation: Claude Desktop

The fastest way to get started is to download the latest `anylist-mcp.mcpb` from the [releases page](../../releases).

1. Open Claude Desktop → Settings → Extensions
2. Drag and drop the `.mcpb` file, or click "Advanced settings" → Install extension
3. Enter your configuration when prompted:
   - **AnyList Email** — your AnyList account email
   - **AnyList Password** — your AnyList account password
   - **Default Shopping List** — optional, defaults to "Groceries"

---

## Installation: Claude Code / Claude Desktop (from source)

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- An [AnyList](https://www.anylist.com/) account

### Setup

```bash
git clone --recurse-submodules https://github.com/bobby060/anylist-mcp.git
cd anylist-mcp
npm install
```

Add to your MCP config (`~/.claude/claude_desktop_config.json` or equivalent):

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

---

## Installation: Claude Web / Claude Mobile

Claude Web and Mobile require an HTTP MCP server accessible over HTTPS. This project includes a Docker-based HTTP server designed to run behind a Cloudflare Tunnel. 

See **[docs/cloudflare-setup.md](docs/cloudflare-setup.md)** for the full setup guide, including:
- Quick tunnel for development (no Cloudflare account needed)
- Named tunnel for production (stable URL on your own domain)

**Quick start:**

```bash
git clone --recurse-submodules https://github.com/bobby060/anylist-mcp.git
cd anylist-mcp

# Configure
cp .env.http.example .env          # fill in SERVER_SECRET_KEY and SESSION_SECRET
mkdir -p config
cp allowed-emails.example.txt config/allowed-emails.txt   # add your email

# Start server + Cloudflare quick tunnel
docker compose --profile cloudflare-temp up --build
# Watch logs for the trycloudflare.com URL, then add it as an MCP server in Claude Settings/Connectors
```

---

## Development

```bash
# Unit tests (mocked, no credentials needed)
npm test

# Integration tests (requires .env with real credentials)
npm run test:integration

# Inspect with the MCP inspector
npx @modelcontextprotocol/inspector node src/server.js
```

### Building the desktop extension

```bash
npm run pack   # produces anylist-mcp.mcpb
```

---

## Roadmap

- **Google OAuth** — allow users to sign in to the HTTP MCP server with their Google account instead of a separate password.

---

## Credits

AnyList API from a fork of [anylist](https://github.com/codetheweb/anylist) by @codetheweb.

Contributions welcome — feel free to open issues and pull requests.
