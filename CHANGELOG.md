## [1.9.2](https://github.com/bobby060/anylist-mcp/compare/v1.9.1...v1.9.2) (2026-11-14)


### Bug Fixes

* **http:** always verify AnyList credentials on /setup ([df59d93](https://github.com/bobby060/anylist-mcp/commit/df59d938f6ae335e9a619af1fa89c7a1958268db))
* **http:** bind MCP sessions to the authenticating user ([23522a8](https://github.com/bobby060/anylist-mcp/commit/23522a8ac863ed1c167df623f6f7bd56f171278f))
* **http:** restrict OAuth redirect_uri and harden the container ([f5f8c28](https://github.com/bobby060/anylist-mcp/commit/f5f8c2872ce63c5f3540eab05c8b145521a044cc))

## [1.9.1](https://github.com/bobby060/anylist-mcp/compare/v1.9.0...v1.9.1) (2026-11-14)


### Bug Fixes

* force a real fetch for user-facing recipe/collection/meal-plan reads ([c09930b](https://github.com/bobby060/anylist-mcp/commit/c09930be38f6f8100509fa1336b4982409407a4e))
* load .env in the integration test runner ([ef02fec](https://github.com/bobby060/anylist-mcp/commit/ef02fec8627ebd630c678ae6cd28c7cb83726885))
* use cached getRecipeCollections() instead of reaching into raw user data ([81e673f](https://github.com/bobby060/anylist-mcp/commit/81e673fec1ce7a8a7fd46c09d62914069b770922)), closes [bobby060/anylist-js#9](https://github.com/bobby060/anylist-js/issues/9) [#11](https://github.com/bobby060/anylist-mcp/issues/11)

# [1.9.0](https://github.com/bobby060/anylist-mcp/compare/v1.8.1...v1.9.0) (2026-10-05)


### Features

* rename recipes via recipes.update new_name ([d469fe9](https://github.com/bobby060/anylist-mcp/commit/d469fe99206cb3ca7a8cda0e09178af38adb12f8))

## [1.8.1](https://github.com/bobby060/anylist-mcp/compare/v1.8.0...v1.8.1) (2026-10-05)


### Bug Fixes

* treat recipe prep/cook times as seconds ([f0b197f](https://github.com/bobby060/anylist-mcp/commit/f0b197fd022041d0ebfae31fca713fec4456fe2e))

# [1.8.0](https://github.com/bobby060/anylist-mcp/compare/v1.7.0...v1.8.0) (2026-09-07)


### Bug Fixes

* hardcoded test list is Test List not Groceries ([659c3a2](https://github.com/bobby060/anylist-mcp/commit/659c3a2b7e9425743fe93ba2844aed3ea2ca9e8b))
* remote set_item_store tool ([da67caf](https://github.com/bobby060/anylist-mcp/commit/da67cafd01c4e2e42478d243d0e60f22fb9ac76a))
* remove duplicate inputSchema keys from shopping tool ([5c1a484](https://github.com/bobby060/anylist-mcp/commit/5c1a4847aee40e7d281f5da4884b526aac088bee))
* simplify integration test to only require a Test List ([c4d3286](https://github.com/bobby060/anylist-mcp/commit/c4d3286ac1c035f03eeeab20d393f363d92bc1e3))


### Features

* add bulk add_items action to shopping tool ([f36b34d](https://github.com/bobby060/anylist-mcp/commit/f36b34de70f66ab21c581b32ece3de2b66b2c57d))
* add recipes.update and shopping.uncheck_item actions ([56884a9](https://github.com/bobby060/anylist-mcp/commit/56884a901f669f963670a7f33c4f2081724e6655))
* add recipes.update and shopping.uncheck_item actions ([866d029](https://github.com/bobby060/anylist-mcp/commit/866d029ba2379e0aac1bef743882db96e5309d55))
* add store selection ([c6649ed](https://github.com/bobby060/anylist-mcp/commit/c6649ed6aef21599ae3a690875e961ca57f6e909))

# Changelog

All notable changes to this project are documented in this file. This file is
maintained automatically by [semantic-release](https://github.com/semantic-release/semantic-release).
