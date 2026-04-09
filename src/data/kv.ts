import type { SqliteDatabase, BulkSetEntry, BulkUpdateEntry } from '../types';
import type { StatementPool } from '../core/statements';
import type { TransactionManager } from '../core/transaction';
import type { LRUCache } from '../cache/cache';
import type { Encryptor } from '../security/encryption';
import { serializeValue, deserializeValue } from '../utils';

const KV_TABLE = '_kv';

const SQL_CREATE = `
  CREATE TABLE IF NOT EXISTS ${KV_TABLE} (
    ns TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY (ns, key)
  )
`;

const SQL_CREATE_IDX = `CREATE INDEX IF NOT EXISTS idx_kv_expires ON ${KV_TABLE} (expires_at) WHERE expires_at IS NOT NULL`;

const SQL_GET = `SELECT value, expires_at FROM ${KV_TABLE} WHERE ns = ? AND key = ?`;
const SQL_SET = `INSERT OR REPLACE INTO ${KV_TABLE} (ns, key, value, expires_at) VALUES (?, ?, ?, ?)`;
const SQL_DELETE = `DELETE FROM ${KV_TABLE} WHERE ns = ? AND key = ?`;
const SQL_HAS = `SELECT 1 FROM ${KV_TABLE} WHERE ns = ? AND key = ? AND (expires_at IS NULL OR expires_at > ?)`;
const SQL_FIND = `SELECT key, value FROM ${KV_TABLE} WHERE ns = ? AND key LIKE ? AND (expires_at IS NULL OR expires_at > ?)`;
const SQL_KEYS = `SELECT key FROM ${KV_TABLE} WHERE ns = ? AND (expires_at IS NULL OR expires_at > ?)`;
const SQL_CLEANUP = `DELETE FROM ${KV_TABLE} WHERE expires_at IS NOT NULL AND expires_at <= ?`;
const SQL_COUNT = `SELECT COUNT(*) as count FROM ${KV_TABLE} WHERE ns = ? AND (expires_at IS NULL OR expires_at > ?)`;
const SQL_DELETE_NS = `DELETE FROM ${KV_TABLE} WHERE ns = ?`;

export class KVStore {
  private readonly pool: StatementPool;
  private readonly txn: TransactionManager;
  private readonly namespace: string;
  private readonly cache: LRUCache | null;
  private readonly encryptor: Encryptor | null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    db: SqliteDatabase,
    pool: StatementPool,
    txn: TransactionManager,
    namespace: string,
    cache: LRUCache | null,
    encryptor: Encryptor | null,
  ) {
    this.pool = pool;
    this.txn = txn;
    this.namespace = namespace;
    this.cache = cache;
    this.encryptor = encryptor;

    db.exec(SQL_CREATE);
    db.exec(SQL_CREATE_IDX);

    this.startCleanup();
  }

  get<T = unknown>(key: string): T | undefined {
    const cacheKey = this.cacheKey(key);

    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) return cached as T;
    }

    const stmt = this.pool.prepare(SQL_GET);
    const row = stmt.get(this.namespace, key) as { value: string; expires_at: number | null } | undefined;

    if (!row) return undefined;

    if (row.expires_at !== null && Date.now() > row.expires_at) {
      this.delete(key);
      return undefined;
    }

    let raw = row.value;
    if (this.encryptor) {
      raw = this.encryptor.decrypt(raw);
    }

    const value = deserializeValue<T>(raw);

    if (this.cache) {
      const ttl = row.expires_at ? row.expires_at - Date.now() : undefined;
      this.cache.set(cacheKey, value, ttl);
    }

    return value;
  }

  set(key: string, value: unknown, ttl?: number): void {
    let serialized = serializeValue(value);

    if (this.encryptor) {
      serialized = this.encryptor.encrypt(serialized);
    }

    const expiresAt = ttl ? Date.now() + ttl : null;
    const stmt = this.pool.prepare(SQL_SET);
    stmt.run(this.namespace, key, serialized, expiresAt);

    if (this.cache) {
      this.cache.set(this.cacheKey(key), value, ttl);
    }
  }

  delete(key: string): boolean {
    const stmt = this.pool.prepare(SQL_DELETE);
    const result = stmt.run(this.namespace, key);

    if (this.cache) {
      this.cache.remove(this.cacheKey(key));
    }

    return Number(result.changes) > 0;
  }

  has(key: string): boolean {
    if (this.cache && this.cache.has(this.cacheKey(key))) {
      return true;
    }

    const stmt = this.pool.prepare(SQL_HAS);
    const row = stmt.get(this.namespace, key, Date.now());
    return row !== undefined;
  }

  update(key: string, patch: Record<string, unknown>): void {
    const existing = this.get<Record<string, unknown>>(key);
    if (existing === undefined) {
      throw new Error(`Key "${key}" not found`);
    }
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      throw new TypeError(`Value for key "${key}" is not a plain object`);
    }

    const merged = Object.assign({}, existing, patch);
    this.set(key, merged);
  }

  updateMany(entries: BulkUpdateEntry[]): void {
    this.txn.immediate(() => {
      for (const entry of entries) {
        this.update(entry.key, entry.patch);
      }
    });
  }

  find<T = unknown>(pattern: string): Array<{ key: string; value: T }> {
    const sqlPattern = pattern.replace(/\*/g, '%').replace(/\?/g, '_');
    const stmt = this.pool.prepare(SQL_FIND);
    const rows = stmt.all(this.namespace, sqlPattern, Date.now()) as Array<{ key: string; value: string }>;

    return rows.map(row => {
      let raw = row.value;
      if (this.encryptor) {
        raw = this.encryptor.decrypt(raw);
      }
      return { key: row.key, value: deserializeValue<T>(raw) };
    });
  }

  keys(): string[] {
    const stmt = this.pool.prepare(SQL_KEYS);
    const rows = stmt.all(this.namespace, Date.now()) as Array<{ key: string }>;
    return rows.map(r => r.key);
  }

  count(): number {
    const stmt = this.pool.prepare(SQL_COUNT);
    const row = stmt.get(this.namespace, Date.now()) as { count: number };
    return row.count;
  }

  setMany(entries: BulkSetEntry[]): void {
    this.txn.immediate(() => {
      const stmt = this.pool.prepare(SQL_SET);
      for (const entry of entries) {
        let serialized = serializeValue(entry.value);
        if (this.encryptor) {
          serialized = this.encryptor.encrypt(serialized);
        }
        const expiresAt = entry.ttl ? Date.now() + entry.ttl : null;
        stmt.run(this.namespace, entry.key, serialized, expiresAt);

        if (this.cache) {
          this.cache.set(this.cacheKey(entry.key), entry.value, entry.ttl);
        }
      }
    });
  }

  getMany<T = unknown>(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();

    for (const key of keys) {
      const value = this.get<T>(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }

    return result;
  }

  deleteMany(keys: string[]): number {
    let total = 0;
    this.txn.immediate(() => {
      const stmt = this.pool.prepare(SQL_DELETE);
      for (const key of keys) {
        const result = stmt.run(this.namespace, key);
        total += Number(result.changes);
        if (this.cache) {
          this.cache.remove(this.cacheKey(key));
        }
      }
    });
    return total;
  }

  clear(): void {
    const stmt = this.pool.prepare(SQL_DELETE_NS);
    stmt.run(this.namespace);

    if (this.cache) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`kv:${this.namespace}:`)) {
          this.cache.remove(key);
        }
      }
    }
  }

  cleanup(): number {
    const stmt = this.pool.prepare(SQL_CLEANUP);
    const result = stmt.run(Date.now());
    return Number(result.changes);
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private cacheKey(key: string): string {
    return `kv:${this.namespace}:${key}`;
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      try { this.cleanup(); } catch (_) { /* db may be closed */ }
    }, 60_000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }
}