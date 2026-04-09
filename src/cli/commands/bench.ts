import { DatabaseSync as Database } from 'node:sqlite';
import { writeFileSync, unlinkSync, existsSync, rmSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { WeebDB } from '../../index';

const BENCH_DIR = join(process.cwd(), '.bench_data');
const ITERATIONS = 10_000;
const BULK_SIZE = 1_000;

interface BenchResult {
  name: string;
  ops: number;
  opsPerSec: number;
  avgLatencyUs: number;
  totalMs: number;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try { if (existsSync(p)) unlinkSync(p); } catch (_) { /* ignore */ }
    try { if (existsSync(p + '-wal')) unlinkSync(p + '-wal'); } catch (_) { /* ignore */ }
    try { if (existsSync(p + '-shm')) unlinkSync(p + '-shm'); } catch (_) { /* ignore */ }
  }
}

function bench(name: string, fn: () => void, ops: number): BenchResult {
  const start = process.hrtime.bigint();
  fn();
  const end = process.hrtime.bigint();

  const totalNs = Number(end - start);
  const totalMs = totalNs / 1_000_000;
  const opsPerSec = Math.round((ops / totalMs) * 1000);
  const avgLatencyUs = totalNs / ops / 1000;

  return { name, ops, opsPerSec, avgLatencyUs: Math.round(avgLatencyUs * 100) / 100, totalMs: Math.round(totalMs * 100) / 100 };
}

function printResults(results: BenchResult[]): void {
  const maxName = Math.max(...results.map(r => r.name.length), 4);

  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK RESULTS');
  console.log('='.repeat(80));
  console.log(
    'Name'.padEnd(maxName + 2) +
    'Ops'.padStart(10) +
    'Ops/sec'.padStart(14) +
    'Avg Latency'.padStart(16) +
    'Total'.padStart(12)
  );
  console.log('-'.repeat(maxName + 54));

  for (const r of results) {
    console.log(
      r.name.padEnd(maxName + 2) +
      r.ops.toLocaleString().padStart(10) +
      r.opsPerSec.toLocaleString().padStart(14) +
      `${r.avgLatencyUs}µs`.padStart(16) +
      `${r.totalMs}ms`.padStart(12)
    );
  }

  console.log('='.repeat(80) + '\n');
}

function benchWeebForgeKV(): BenchResult[] {
  const dbPath = join(BENCH_DIR, 'weebforge_kv.db');
  cleanup(dbPath);

  const db = new WeebDB({ path: dbPath, cache: { maxSize: 50000 } });
  const results: BenchResult[] = [];

  results.push(bench('WF: KV Write', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      db.set(`key:${i}`, { id: i, name: `user_${i}`, score: Math.random() * 100 });
    }
  }, ITERATIONS));

  results.push(bench('WF: KV Read (cold)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      db.get(`key:${i}`);
    }
  }, ITERATIONS));

  results.push(bench('WF: KV Read (hot)', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      db.get(`key:${i}`);
    }
  }, ITERATIONS));

  results.push(bench('WF: KV Update', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      db.update(`key:${i}`, { score: Math.random() * 200 });
    }
  }, ITERATIONS));

  results.push(bench('WF: KV Delete', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      db.delete(`key:${i}`);
    }
  }, ITERATIONS));

  results.push(bench(`WF: KV Bulk Write (${BULK_SIZE})`, () => {
    const entries = Array.from({ length: BULK_SIZE }, (_, i) => ({
      key: `bulk:${i}`,
      value: { id: i, data: `payload_${i}` },
    }));
    db.setMany(entries);
  }, BULK_SIZE));

  results.push(bench(`WF: KV Bulk Read (${BULK_SIZE})`, () => {
    const keys = Array.from({ length: BULK_SIZE }, (_, i) => `bulk:${i}`);
    db.getMany(keys);
  }, BULK_SIZE));

  results.push(bench('WF: Transaction (100 ops)', () => {
    db.transaction(() => {
      for (let i = 0; i < 100; i++) {
        db.set(`txn:${i}`, { value: i });
      }
    });
  }, 100));

  db.close();
  cleanup(dbPath);
  return results;
}

function benchWeebForgeTable(): BenchResult[] {
  const dbPath = join(BENCH_DIR, 'weebforge_table.db');
  cleanup(dbPath);

  const db = new WeebDB({ path: dbPath, cache: { maxSize: 50000 } });
  db.defineTable('users', {
    columns: {
      id: { type: 'INTEGER', primaryKey: true },
      name: { type: 'TEXT' },
      email: { type: 'TEXT', unique: true },
      score: { type: 'REAL', default: 0 },
    },
    indexes: [{ columns: ['name'] }],
  });

  const users = db.table('users');
  const results: BenchResult[] = [];

  results.push(bench('WF: Table Insert', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      users.insert({ name: `user_${i}`, email: `user_${i}@test.com`, score: Math.random() * 100 });
    }
  }, ITERATIONS));

  results.push(bench('WF: Table Find by filter', () => {
    for (let i = 0; i < 1000; i++) {
      users.find({ name: `user_${i}` });
    }
  }, 1000));

  results.push(bench('WF: Table FindOne', () => {
    for (let i = 0; i < 1000; i++) {
      users.findOne({ email: `user_${i}@test.com` });
    }
  }, 1000));

  results.push(bench('WF: Table Update', () => {
    for (let i = 0; i < 1000; i++) {
      users.update({ name: `user_${i}` }, { score: Math.random() * 200 });
    }
  }, 1000));

  results.push(bench('WF: Table Count', () => {
    for (let i = 0; i < 1000; i++) {
      users.count({ score: { $gt: 50 } });
    }
  }, 1000));

  db.close();
  cleanup(dbPath);
  return results;
}

function benchRawSQLite(): BenchResult[] {
  const dbPath = join(BENCH_DIR, 'raw_sqlite.db');
  cleanup(dbPath);

  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA synchronous=NORMAL');
  db.exec('PRAGMA cache_size=-64000');
  db.exec('PRAGMA temp_store=MEMORY');

  db.exec('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)');
  const results: BenchResult[] = [];

  const insertStmt = db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)');
  const selectStmt = db.prepare('SELECT value FROM kv WHERE key = ?');
  const deleteStmt = db.prepare('DELETE FROM kv WHERE key = ?');

  results.push(bench('Raw SQLite: Write', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      insertStmt.run(`key:${i}`, JSON.stringify({ id: i, name: `user_${i}`, score: Math.random() * 100 }));
    }
  }, ITERATIONS));

  results.push(bench('Raw SQLite: Read', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const row = selectStmt.get(`key:${i}`) as { value: string } | undefined;
      if (row) JSON.parse(row.value);
    }
  }, ITERATIONS));

  results.push(bench('Raw SQLite: Delete', () => {
    for (let i = 0; i < ITERATIONS; i++) {
      deleteStmt.run(`key:${i}`);
    }
  }, ITERATIONS));

  const batchInsert = () => {
    db.exec('BEGIN');
    try {
      for (let i = 0; i < BULK_SIZE; i++) {
        insertStmt.run(`bulk:${i}`, JSON.stringify({ id: i, data: `payload_${i}` }));
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  results.push(bench(`Raw SQLite: Batch Write (${BULK_SIZE})`, () => {
    batchInsert();
  }, BULK_SIZE));

  db.close();
  cleanup(dbPath);
  return results;
}

function benchJSONFile(): BenchResult[] {
  const filePath = join(BENCH_DIR, 'json_store.json');
  const results: BenchResult[] = [];
  const SMALL_ITERS = 1000;

  let store: Record<string, unknown> = {};

  results.push(bench(`JSON File: Write (${SMALL_ITERS})`, () => {
    for (let i = 0; i < SMALL_ITERS; i++) {
      store[`key:${i}`] = { id: i, name: `user_${i}`, score: Math.random() * 100 };
    }
    writeFileSync(filePath, JSON.stringify(store));
  }, SMALL_ITERS));

  results.push(bench(`JSON File: Read (${SMALL_ITERS})`, () => {
    const raw = readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    for (let i = 0; i < SMALL_ITERS; i++) {
      void data[`key:${i}`];
    }
  }, SMALL_ITERS));

  results.push(bench(`JSON File: Update + Flush (${SMALL_ITERS})`, () => {
    for (let i = 0; i < SMALL_ITERS; i++) {
      store[`key:${i}`] = { ...store[`key:${i}`] as Record<string, unknown>, score: Math.random() * 200 };
    }
    writeFileSync(filePath, JSON.stringify(store));
  }, SMALL_ITERS));

  cleanup(filePath);
  return results;
}

export async function benchCommand() {
  ensureDir(BENCH_DIR);

  console.log(`\nRunning benchmarks: ${ITERATIONS.toLocaleString()} iterations (KV), ${BULK_SIZE.toLocaleString()} bulk\n`);

  const wfKV = benchWeebForgeKV();
  const wfTable = benchWeebForgeTable();
  const raw = benchRawSQLite();
  const json = benchJSONFile();

  printResults([...wfKV, ...wfTable]);
  printResults(raw);
  printResults(json);

  try {
    rmSync(BENCH_DIR, { recursive: true, force: true });
  } catch (_) { /* ignore */ }
}