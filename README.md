# @weebforge/db

A high-performance, deterministic data layer for Node.js. 
This is a controlled abstraction layer that enforces consistency and speed over SQLite via the native `node:sqlite` engine. Built with a synchronous core to guarantee predictable performance and zero event-loop blocking overhead.

**Prerequisites**: Node.js >= 22.5.0 is strictly required as it leverages the natively built-in SQLite driver.

## Installation

```bash
npm install @weebforge/db
```

## Quick Start (Code)

```typescript
import { WeebDB } from '@weebforge/db';

const db = new WeebDB({ path: './data.db' });

// KV Storage
db.set('user:id', { username: 'admin' });
const user = db.get('user:id');

// Structured Tables
db.defineTable('users', {
  columns: {
    id: { type: 'INTEGER', primaryKey: true },
    username: { type: 'TEXT', unique: true }
  }
});
db.table('users').insert({ username: 'admin' });
```

## Quick Start (CLI)

The package includes a deterministic CLI tool for management and interaction.

```bash
# Initialize a new config and database
npx wdb init

# Write and read data directly from terminal
npx wdb kv set config '{"theme":"dark"}'
npx wdb kv get config --json

# Run local benchmark suite
npx wdb bench
```

## Documentation

Full documentation is split into dedicated guides:

1. [Key-Value Store Usage](guides/kv.md)
2. [Structured Table Management](guides/tables.md)
3. [CLI Reference](guides/cli.md)

## Architecture Notes

* **Fully synchronous core**, preventing event loop context switching penalties.
* **Prepared statement pool** handles caching and execution reuse natively.
* **WAL mode** and optimized memory pragmas configured by default.