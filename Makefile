.PHONY: help install test test-integration inspect pack up dev prod down logs create-client

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

# ── Local / stdio mode ────────────────────────────────────────────────────────

install: ## Install dependencies
	npm install

test: ## Run unit tests (no credentials needed)
	npm test

test-integration: ## Run integration tests (requires .env with real credentials)
	npm run test:integration

inspect: ## Launch the MCP inspector
	npx @modelcontextprotocol/inspector node src/server.js

pack: ## Build the Claude Desktop extension (.mcpb)
	npm run pack

# ── HTTP server / Docker ──────────────────────────────────────────────────────

up: ## Start the HTTP server only (no tunnel)
	docker compose up --build

dev: ## Start HTTP server + Cloudflare quick tunnel (no Cloudflare account needed)
	docker compose --profile cloudflare-temp up --build

prod: ## Start HTTP server + named Cloudflare tunnel (requires CLOUDFLARE_TUNNEL_TOKEN in .env)
	docker compose --profile cloudflare-named up

down: ## Stop all Docker services
	docker compose down

logs: ## Tail Docker logs
	docker compose logs -f

create-client: ## Create an OAuth client. Usage: make create-client EMAIL=you@example.com NAME="App Name"
	docker compose exec anylist-mcp node scripts/create-client.js $(EMAIL) "$(NAME)"
