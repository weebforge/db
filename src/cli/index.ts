#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { initCommand } from './commands/init';
import { queryCommand } from './commands/query';
import { benchCommand } from './commands/bench';
import { kvCommand } from './commands/kv';

function printHelp() {
  console.log(`
wdb - @weebforge/db CLI

Usage: wdb <command> [options]

Commands:
  init            Initialize a new wdb.config.json and database
  query <sql>     Execute a raw SQL query
  kv <action>     Manage KV data (get, set, delete)
  bench           Run performance benchmarks
  schema          (WIP) Schema management
  migrate         (WIP) Migration management
  table           (WIP) Table inspection

Options:
  --json          Output results as JSON
  --time          Show query runtime
  -h, --help      Show this help message
`);
}

function loadConfig() {
  const configPath = join(process.cwd(), 'wdb.config.json');
  if (existsSync(configPath)) {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    printHelp();
    process.exit(0);
  }

  const defaultOptions = {
    json: {
      type: 'boolean' as const,
      default: false,
    },
    time: {
      type: 'boolean' as const,
      default: false,
    }
  };

  const command = args[0];
  const commandArgs = args.slice(1);
  const config = loadConfig();

  try {
    switch (command) {
      case 'init':
        await initCommand(commandArgs);
        break;
      case 'query':
        await queryCommand(commandArgs, config, defaultOptions);
        break;
      case 'bench':
        await benchCommand();
        break;
      case 'kv':
        await kvCommand(commandArgs, config, defaultOptions);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err: any) {
    if (args.includes('--debug')) {
      console.error(err);
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

main();