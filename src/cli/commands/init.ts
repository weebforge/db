import { parseArgs } from 'util';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { WeebDB } from '../../index';
import * as p from '@clack/prompts';
import pc from 'picocolors';

export async function initCommand(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      path: { type: 'string', short: 'p' },
      force: { type: 'boolean', short: 'f', default: false },
      silent: { type: 'boolean', short: 's', default: false },
    },
  });

  const configPath = join(process.cwd(), 'wdb.config.json');

  if (existsSync(configPath) && !values.force) {
    if (values.silent) {
      throw new Error('Config file already exists. Use --force to overwrite.');
    }
  }

  let dbPath = values.path as string;
  let journalMode = 'WAL';
  let enableCache = true;
  let createMigrations = true;

  if (values.silent || (values.path && values.force)) {
    dbPath = dbPath || './db.sqlite';
  } else {
    console.log();
    p.intro(pc.bgCyan(pc.black(' Initialization of a new @weebforge/db project ')));

    if (existsSync(configPath) && !values.force) {
      const overwrite = await p.confirm({
        message: 'A wdb.config.json already exists. Do you want to overwrite it?',
        initialValue: false
      });

      if (p.isCancel(overwrite) || !overwrite) {
        p.cancel('Operation cancelled.');
        process.exit(0);
      }
    }

    const pathAns = await p.text({
      message: 'Where should the database be created? (absolute or relative path)',
      placeholder: './db.sqlite',
      initialValue: './db.sqlite',
    });

    if (p.isCancel(pathAns)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
    dbPath = pathAns as string;

    const modeAns = await p.select({
      message: 'Which journaling mode do you prefer?',
      options: [
        { value: 'WAL', label: 'WAL (Write-Ahead Logging)', hint: 'fastest, recommended' },
        { value: 'DELETE', label: 'DELETE (Standard)' }
      ]
    });

    if (p.isCancel(modeAns)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
    journalMode = modeAns as string;

    const cacheAns = await p.confirm({
      message: 'Should we enable in-memory caching?',
      initialValue: true
    });

    if (p.isCancel(cacheAns)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
    enableCache = cacheAns as boolean;

    const migAns = await p.confirm({
      message: 'Should we initialize a migrations directory?',
      initialValue: true
    });

    if (p.isCancel(migAns)) {
      p.cancel('Operation cancelled.');
      process.exit(0);
    }
    createMigrations = migAns as boolean;
  }

  const s = p.spinner();
  if (!values.silent) s.start('Writing configuration and initializing database');

  const config = {
    dbPath: dbPath,
    pragmas: {
      journal_mode: journalMode,
      synchronous: 'NORMAL',
    },
    cache: enableCache ? { maxSize: 10000 } : false,
    migrations: createMigrations ? './migrations' : undefined,
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2));

  if (createMigrations) {
    const migDir = join(process.cwd(), 'migrations');
    if (!existsSync(migDir)) {
      mkdirSync(migDir, { recursive: true });
    }
  }

  const db = new WeebDB({ path: dbPath });
  db.close();

  if (!values.silent) {
    s.stop('Database initialized successfully!');
  }
}