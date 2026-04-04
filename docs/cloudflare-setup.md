# Cloudflare Tunnel Setup

This guide covers two scenarios:
1. **Development** — quick tunnel with no account (URL changes each restart)
2. **Production** — named tunnel with a stable custom domain

---

## Prerequisites

Clone the repo with submodules (required — the AnyList JS library is a git submodule):
```bash
git clone --recurse-submodules https://github.com/bobby060/anylist-mcp.git
cd anylist-mcp
```

If you already cloned without `--recurse-submodules`, initialize the submodule now:
```bash
git submodule update --init
```

Install `cloudflared`:
```bash
# macOS
brew install cloudflare/cloudflare/cloudflared
```

Linux: Follow instructions [here](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)

---

## Development (Quick Tunnel)

No Cloudflare account needed. Gets you a `*.trycloudflare.com` HTTPS URL instantly.

### Recommended dev workflow

`BASE_URL` is optional — the server derives it from the request's `Host` header, so cloudflared and the app can start together without either needing to know the URL upfront.

```bash
# 1. One-time setup
cp .env.http.example .env
mkdir -p config
cp allowed-emails.example.txt config/allowed-emails.txt
# Edit .env — set SERVER_SECRET_KEY and SESSION_SECRET
# Edit config/allowed-emails.txt — add your email address/es that you 
# want to be able to access the server

# 2. Start everything with the dev profile
docker compose --profile cloudflare-temp up --build
# The server starts, then cloudflared starts after it's healthy.
# Watch cloudflared logs for the tunnel URL:
#   "Your quick Tunnel has been created!"
#   "https://xxxx-xxxx-xxxx.trycloudflare.com"
# Add that URL as an MCP server in Claude
```

The tunnel URL changes every restart.

---

## Production (Existing Reverse Proxy)
To use an existing reverse proxy or existing Cloudflare tunnel, simply :

```
# 1. One-time setup
cp .env.http.example .env
mkdir -p config
cp allowed-emails.example.txt config/allowed-emails.txt
# Edit .env — set SERVER_SECRET_KEY and SESSION_SECRET
# Edit config/allowed-emails.txt — add your email address

# 2. Start everything with the dev profile
docker compose up --build
```



## Production (Named Tunnel with Custom Domain)

A named tunnel gives you a stable URL on your own domain.


### Step 1: Create a Cloudflare account and add your domain

Your domain must be on Cloudflare's DNS.

### Step 2: Authenticate cloudflared

```bash
cloudflared tunnel login
```

### Step 3: Create a named tunnel

```bash
cloudflared tunnel create anylist-mcp
# Note the tunnel ID printed (UUID format)
```

### Step 4: Create tunnel config

Create `~/.cloudflared/config.yml` (or `/etc/cloudflared/config.yml`):

```yaml
tunnel: <your-tunnel-id>
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: anylist.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### Step 5: Create a DNS record

```bash
cloudflared tunnel route dns anylist-mcp anylist.yourdomain.com
```

### Step 6: Set BASE_URL and start

In your `.env`:
```
BASE_URL=https://anylist.yourdomain.com
CLOUDFLARE_TUNNEL_TOKEN=<token from step below>
```

```bash
docker compose --profile cloudflare-named up -d
```

To get a tunnel token:
```bash
cloudflared tunnel token anylist-mcp
```

---

## Optional: Cloudflare Access on Setup/Admin pages

If you want an extra authentication layer on the `/setup` page (e.g. restrict access
to your home network or WARP-connected devices), you can enable Cloudflare Access for
specific paths while leaving the OAuth and MCP endpoints unprotected.

**Important**: Do NOT enable Cloudflare Access on:
- `/.well-known/*` — OAuth metadata discovery
- `/oauth/*` — OAuth flow endpoints
- `/mcp` — MCP API endpoint

Cloudflare Access on these paths will break Claude's OAuth login flow.

**Safe paths to protect with CF Access** (optional):
- `/setup` — AnyList credential setup page
- `/login` — login/registration page

### To configure CF Access path restrictions:

1. In the Cloudflare Zero Trust dashboard, go to **Access > Applications**
2. Create a new **Self-hosted** application
3. Set the **Application domain** to `anylist.yourdomain.com/setup`
4. Configure your preferred identity provider (Google, GitHub, OTP, etc.)
5. Create a policy allowing your email address(es)

This is purely optional — the server already restricts registration to `allowed-emails.txt`
and requires OAuth authentication for the MCP endpoint.

---

## Authentication
Currently only username/password authentication is supported. In the future I hope to add Google Oauth authentication. Warning: The authentication workflow hasn't really been validated, so insert disclaimer here about use at your own risk etc. etc.



## Troubleshooting

**"Authorization with the MCP server failed" (auth flow completes but Claude can't connect)**: Cloudflare's Bot Fight Mode blocks requests from Claude's servers by default. Fix: in the Cloudflare dashboard → **Security → Bots**, allow AI bots (or disable Bot Fight Mode for your domain). The OAuth flow works because it's browser-based, but the actual MCP API calls come from Anthropic's servers and get flagged as bots.

**`Cannot find module '/app/anylist-js/lib/index.js'`**: The `anylist-js` submodule wasn't initialized before building the Docker image. Fix:
```bash
git submodule update --init
docker compose up --build
```

**"Bad Gateway" errors**: The tunnel is running but the container isn't. Check:
```bash
docker compose ps
docker compose logs anylist-mcp
```

**OAuth redirect fails**: `BASE_URL` doesn't match the tunnel URL exactly. Make sure
there's no trailing slash and it's HTTPS.

**"allowed-emails.txt not found"**: The file isn't mounted. Check the volume path in
`docker-compose.yml` and that the file exists on the host.
