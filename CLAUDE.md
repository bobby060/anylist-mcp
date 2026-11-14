# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Unofficial MCP server for AnyList (shopping lists, recipes, meal plans). Node 20+, ESM (`"type": "module"`), plain JavaScript, no build step. Two deployment modes share the same tool code:

- **stdio** — `src/server.js`, one `AnyListClient` built from `ANYLIST_USERNAME` / `ANYLIST_PASSWORD` / `ANYLIST_LIST_NAME` (`.env`). Ships as a Claude Desktop extension (`manifest.json`, `make pack` → `anylist-mcp.mcpb`).
- **HTTP** — `src/http/index.js`, multi-user Express server run in Docker behind a Cloudflare Tunnel, with its own OAuth server and SQLite DB.

## Commands

```bash
make install            # npm install (clone with --recurse-submodules, or: git submodule update --init)
make test               # unit tests: node --test test/*.test.js test/tools/*.test.js (what CI runs)
node --test test/tools/shopping.test.js                     # one file
node --test --test-name-pattern="add_item" test/tools/shopping.test.js   # one test
make test-integration   # live: spawns src/server.js over stdio, needs real creds in .env (list "Test List")
npm run test:client     # live: exercises src/anylist-client.js directly (test/anylist-client/)
make inspect            # MCP inspector against the stdio server
npm run dev / dev:http  # node --watch, stdio / HTTP
make dev                # Docker HTTP server + Cloudflare quick tunnel; `make up` = server only
make create-client EMAIL=... NAME="..."   # confidential OAuth client (e.g. Home Assistant); runs inside the container
```

There is no linter; CI runs `node --check src/server.js` plus `npm test` on Node 20/24/26. Note that `test/anylist-client/*.test.js` is **not** picked up by `npm test`: those files are live suites driven by `test/anylist-client/index.js`.

## Architecture

**Layering:** `src/tools/*` → `src/anylist-client.js` → `anylist-js/` (git submodule fork of codetheweb/anylist, imported by relative path `../anylist-js/lib/index.js`; the `anylist` npm dependency is not what's used). The submodule pin differs between branches, so check which anylist-js commit you're on before you debug protocol behavior. When possible, changes that are the result of problems in anylist-js should be made to anylist-js, we shouldn't try to fix them in this repo.

**Tools** are domain-grouped: one MCP tool per domain (`shopping`, `recipes`, `meal_plan`, `recipe_collections`, `health_check`), each taking an `action` enum plus parameters (zod schemas). Each `src/tools/<domain>.js` exports `register(server, getClient)`; `src/tools/index.js` wires them up. `getClient` is an async factory. In stdio it returns the singleton client. In HTTP it calls `getOrCreateSession(userId)`. Tool code must never assume a single user. Responses go through `textResponse` / `errorResponse` in `src/tools/helpers.js`. Ambiguous input (which list, which partial-match item, a missing required field) is resolved via `src/tools/elicitation.js`, which falls back to throwing an error when the client doesn't support elicitation. Some tools rewrite their own description at runtime through the `registeredTool.update()` handle (e.g. `shopping` lists available stores). If you add or change actions, update `docs/tools.md`.

**AnyListClient** wraps the anylist-js session: `connect(listName)` logs in lazily and selects `targetList`. Shopping actions operate on `targetList`, so switching lists means calling `connect` again. Recipes are normalized through `src/recipe-normalizer.js`. User-facing reads of recipes, collections, and meal plans force a real fetch rather than trusting cached state.

**HTTP mode** (`src/http/`):
- `auth/oauth.js` — a full OAuth 2.1 authorization server (discovery metadata, dynamic client registration, authorize/consent, token, refresh) plus `requireBearerToken` middleware, which sets `req.userId`. Login providers: `auth/providers/password.js` (bcrypt) and `google.js` (enabled when `GOOGLE_CLIENT_ID` is set). Signups are restricted by the allow-list file (`ALLOWED_EMAILS_FILE`, default `/config/allowed-emails.txt`).
- `security.js` — the **single source of truth** for allowed OAuth redirect hosts (defaults to claude.ai, claude.com, and loopback; `ALLOWED_REDIRECT_HOSTS` adds more).
- `db.js` — better-sqlite3 at `$DATA_DIR/anylist-mcp.db` (default `/data`). Migrations run on `getDb()` as `CREATE TABLE IF NOT EXISTS` plus a list of additive `ALTER TABLE` statements; add new migrations there. AnyList passwords are AES-256 encrypted with `SERVER_SECRET_KEY` (64 hex chars, required along with `SESSION_SECRET`).
- `onboarding.js` — `/setup` page where a user stores their AnyList credentials. HTML views in `views/` use a tiny custom engine defined in `index.js` (`{{key}}` substitution and `<!-- if:key -->…<!-- endif:key -->` blocks).
- `session-manager.js` — per-user `AnyListClient` cache with an idle timeout (`ANYLIST_SESSION_IDLE_MINUTES`). `mcp-sessions.js` — per-transport MCP sessions keyed by `Mcp-Session-Id` **and** owner userId (a lookup with another user's session ID returns null). This check is a security boundary, so keep it in place.
- The MCP endpoint is served at `/`, `/mcp`, and `POST /sse` (Streamable HTTP, stateful, one McpServer per session, needed for elicitation), plus legacy SSE at `GET /sse` + `POST /messages` for Home Assistant.

## Tests

Unit tests use `node:test` with mocks: `createMockServer()` captures `registerTool` handlers, and `MockAnyListClient` (in `test/tools/helpers.js`) holds in-memory state. They make no network calls. Per CONTRIBUTING.md, every feature or fix needs unit tests (happy path, empty data, invalid input; for a bug fix, a test that fails before the fix). Anything touching the AnyList API also needs coverage in `test/integration.js`, which must clean up whatever it creates. Paste the integration test output into the PR, because CI has no credentials to run it.

## Releases and commits

Branch names follow `type/short-description`. Commits use Conventional Commits, because semantic-release on `main` derives versions from them (`feat:` → minor, `fix:` → patch). The version string is hardcoded in `package.json`, `manifest.json`, `src/server.js`, and `src/http/index.js`. `scripts/sync-version.mjs` rewrites them during release, so don't bump versions by hand, and keep the `name: "anylist-mcp-server", version: "..."` literal format intact so the script's regex still matches.

---

# Working guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.