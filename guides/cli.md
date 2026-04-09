# Command Line Interface (wdb)

`wdb` is a strict, deterministically compiled command line tool for @weebforge/db databases. It provides direct database state manipulation bypassing write-time code requirements.

## Architecture Guidelines

* Execution operates synchronously.
* No internal mutable stat.
* Fails fast on improper parameters.
* Direct bindings to the core engine module.

## Initialization

Sets up base folders, config file (`wdb.config.json`) and database engine parameters. Outputs config options including WAL configuration and synchronous PRAGMA tuning.

```bash
# Interactive setup
wdb init

# Headless / deterministic initialization
wdb init --path ./mydata.db --force --silent
```

## Key-Value Control

Provides direct read, write, and deletion controls over the internal `_kv` storage table. Values input must be valid JSON strings, or they will be committed as plain text strings natively.

```bash
# Insertion
wdb kv set config "{\"active\":true, \"limit\": 500}"

# Retrieval (Prints raw table value)
wdb kv get config

# Retrieval parsed specifically as JSON block
wdb kv get config --json

# Deletion
wdb kv delete config
```

## Raw Query Transport

Executes plain SQL queries against the bound database. Read queries return formatted output data. Write queries execute natively.

```bash
# Standard table read
wdb query "SELECT * FROM _kv LIMIT 10;"

# Detailed execution with timing metrics
wdb query "SELECT COUNT(*) FROM _kv;" --time

# Output JSON structure explicitly 
wdb query "SELECT * FROM _kv;" --json
```

## Process Diagnostics

Runs internal engine stress tests across simulated datasets (10,000 passes defaults) testing sequential writes, bulk inserts, cached queries, and comparisons to raw logic.

```bash
wdb bench
```