# Home Assistant Setup

This guide connects the anylist-mcp HTTP server to Home Assistant as an MCP tool server. Home Assistant uses the OAuth 2.0 authorization code flow with a confidential client (client ID + secret), so you'll go through a one-time browser login to authorize access.

## Prerequisites

- The anylist-mcp HTTP server is running and reachable over HTTPS (see [cloudflare-setup.md](cloudflare-setup.md))
- You have an account on the server (registered via the web UI)
- Home Assistant 2025.2 or later (when MCP client support was added)

---

## Step 1: Create a confidential OAuth client

Run this inside the running Docker container:

```bash
docker compose exec anylist-mcp node scripts/create-client.js you@example.com "Home Assistant"
```

Replace `you@example.com` with the email you registered on the server and give the client any descriptive name.

Output:

```
Client created successfully.

  client_id:     xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  client_secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Save the client_secret now — it is not stored and cannot be retrieved later.
```

Copy both values somewhere safe before closing the terminal.

---

## Step 2: Add the MCP server to Home Assistant

Add the anylist-mcp server via the **Settings → Devices & Services → Add Integration → MCP Server** UI (the exact path depends on your HA version).

---

## Step 3: Verify

Restart Home Assistant, then open **Developer Tools → Template** and try calling one of the AnyList tools, or just ask your assistant "What's on my grocery list?" to confirm the integration is working.

---

## Step 4: Add to Voice Agent
Go to **Settings -> Voice Assistants** and select the assistant you want to modify. Click the gear next to the assistant's **Conversation Agent** and check `anylist-mcp-server` under **Control Home Assistant**. I also updated the system instructions to route shopping list requests here. You might need to disable Shopping List entity access for the built-in Home Assistant shopping list or the conversation agent might get confused.

---

