#!/usr/bin/env node
// Usage: node scripts/sync-version.mjs <version>
// Writes the given version into every place it lives besides package.json
// (which @semantic-release/npm handles): the MCPB manifest and the two
// hardcoded McpServer version strings.

import { readFileSync, writeFileSync } from "fs";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/sync-version.mjs <version>");
  process.exit(1);
}

// Each target: a file and the regex whose capture groups 1 and 2 bracket the
// version literal. Targeted replaces keep the diffs minimal.
const targets = [
  ["manifest.json", /^(\s*"version":\s*")[^"]+(")/m],
  ["src/server.js", /(name:\s*"anylist-mcp-server",\s*version:\s*")[^"]+(")/],
  ["src/http/index.js", /(name:\s*"anylist-mcp-server",\s*version:\s*")[^"]+(")/],
];

for (const [file, re] of targets) {
  const before = readFileSync(file, "utf-8");
  const after = before.replace(re, `$1${version}$2`);
  if (after === before) {
    console.error(`ERROR: could not find version string in ${file}`);
    process.exit(1);
  }
  writeFileSync(file, after);
}

console.log(`Synced version ${version} into ${targets.map(([f]) => f).join(", ")}`);
