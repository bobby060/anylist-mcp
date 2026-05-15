#!/usr/bin/env node
/**
 * One-time setup script: prompts for AnyList credentials and stores them in the
 * macOS Keychain (or platform equivalent) via @napi-rs/keyring.
 *
 * Usage:
 *   npm run set-credentials                # interactive prompts
 *   npm run set-credentials -- --show      # print currently-stored values
 *   npm run set-credentials -- --delete    # remove all stored credentials
 *
 * Service / account naming MUST match the values in src/anylist-client.js.
 */

import { Entry } from '@napi-rs/keyring';
import readline from 'node:readline';

const KEYRING_SERVICE = 'anylist-mcp';
const FIELDS = [
  { key: 'username', label: 'AnyList email', secret: false },
  { key: 'password', label: 'AnyList password', secret: true },
  { key: 'default-list', label: 'Default list name (e.g. "Grocery List")', secret: false, optional: true },
];

function makeEntry(account) {
  return new Entry(KEYRING_SERVICE, account);
}

function promptVisible(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptSecret(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let buf = '';
    const originalRawMode = stdin.isRaw;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const finish = () => {
      stdin.setRawMode?.(originalRawMode ?? false);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(buf);
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === 13 || code === 10 || code === 4) {
          // Enter (CR/LF) or ctrl-D submits.
          finish();
          return;
        }
        if (code === 3) {
          // ctrl-C aborts.
          process.stdout.write('\n');
          process.exit(130);
        }
        if (code === 127 || code === 8) {
          // Backspace / delete.
          if (buf.length > 0) buf = buf.slice(0, -1);
          continue;
        }
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

function prompt(question, { secret = false } = {}) {
  return secret ? promptSecret(question) : promptVisible(question);
}

async function showStored() {
  console.log(`Service: ${KEYRING_SERVICE}`);
  for (const { key, label, secret } of FIELDS) {
    const entry = makeEntry(key);
    const value = entry.getPassword();
    if (value == null) {
      console.log(`  ${label.padEnd(40)} (not set)`);
    } else if (secret) {
      console.log(`  ${label.padEnd(40)} ${'*'.repeat(Math.min(value.length, 12))} (length ${value.length})`);
    } else {
      console.log(`  ${label.padEnd(40)} ${value}`);
    }
  }
}

async function deleteStored() {
  for (const { key, label } of FIELDS) {
    const entry = makeEntry(key);
    try {
      const existed = entry.deletePassword();
      console.log(existed ? `Deleted: ${label}` : `Not set: ${label}`);
    } catch (err) {
      console.log(`Skip (${label}): ${err.message}`);
    }
  }
}

async function setStored() {
  console.log(`Storing AnyList credentials in Keychain under service "${KEYRING_SERVICE}".`);
  console.log('Leave a value blank to keep the existing entry (or skip optional fields).\n');

  for (const { key, label, secret, optional } of FIELDS) {
    const entry = makeEntry(key);
    const existing = entry.getPassword();
    const hint = existing != null ? ' [keep existing]' : optional ? ' [optional]' : '';
    const answer = await prompt(`${label}${hint}: `, { secret });

    if (!answer) {
      if (existing != null) {
        console.log(`  Kept existing ${label}.`);
      } else if (optional) {
        console.log(`  Skipped ${label}.`);
      } else {
        console.error(`  ${label} is required.`);
        process.exit(1);
      }
      continue;
    }

    entry.setPassword(answer);
    console.log(`  Stored ${label}.`);
  }

  console.log('\nDone. Verify with: npm run set-credentials -- --show');
}

const arg = process.argv[2];
try {
  if (arg === '--show') {
    await showStored();
  } else if (arg === '--delete') {
    await deleteStored();
  } else {
    await setStored();
  }
} catch (err) {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
}
