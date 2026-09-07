# Contributing

Thanks for helping improve the Unofficial AnyList MCP Server. This document covers
the workflow and the testing bar that every contribution is held to.

## Getting started

```bash
git clone --recurse-submodules https://github.com/bobby060/anylist-mcp.git
cd anylist-mcp
make install
```

`anylist-js` is a submodule — if you cloned without `--recurse-submodules`, run
`git submodule update --init`.

## Branches and commits

- Branch from `main` using a `type/short-description` name, e.g. `feat/recipe-tags`,
  `fix/item-quantities`, `doc/contrib-guidelines`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`, `ci:`, `docs:`, `test:`). Releases and the changelog
  are generated from these prefixes by semantic-release, so the type matters:
  `feat:` triggers a minor release, `fix:` a patch.

## Testing requirements

**Every new feature and every bug fix must ship with tests.** PRs without them will
not be merged.

### 1. Unit tests — always required

- Location: `test/*.test.js`, `test/tools/*.test.js`, `test/anylist-client/*.test.js`.
- Use the `node:test` runner and the mock client helpers (`test/tools/helpers.js`,
  `test/anylist-client/helpers.js`) — no network, no credentials.
- Run with `make test` (`npm test`). This is what CI runs on every push and PR
  across Node 20, 24, and 26; it must be green.
- A new tool action needs cases for the happy path, empty/missing data, and invalid
  input. A bug fix needs a test that fails before your change and passes after.

### 2. Integration tests — required for anything that touches AnyList

If your change adds or alters behavior that calls the real AnyList API (a new tool
action, a change to `src/anylist-client.js`, request/response shaping), add
matching coverage to `test/integration.js`.

- Integration tests spawn the real MCP server and make live calls, so they need a
  real account. Copy `.env.example` to `.env` and fill in `ANYLIST_USERNAME`,
  `ANYLIST_PASSWORD`, and `ANYLIST_LIST_NAME` (a scratch list named `Test List`).
- Run with `make test-integration` (`npm run test:integration`).
- CI cannot run these (no credentials), so **paste the `make test-integration`
  output into your PR description.** The maintainer verifies new tests are present
  and re-runs the suite before merging.
- Integration tests must clean up after themselves — delete any items, recipes, or
  meal plan entries they create.

## Pull requests

1. `make test` passes locally and in CI.
2. `make test-integration` passes locally, with output pasted into the PR (when the
   change touches AnyList — see above).
3. The PR description explains what changed and why, and notes any new tool actions
   or parameters (update `docs/tools.md` if so).
4. Keep the diff surgical — unrelated refactors and formatting churn slow review.

## Questions

Open an issue. For larger changes, open one before writing code so the approach can
be discussed first.
