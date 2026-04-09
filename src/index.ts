import type {
  DBOptions,
  TableSchema,
  MigrationDef,
  BulkSetEntry,
  CacheOptions,
} from './types';

import { Engine, StatementPool, TransactionManager } from './core';
import { SchemaManager, Validator, MigrationManager } from './schema';
import { IndexManager, QueryCompiler } from './query';
import { Table, KVStore } from './data';
import { LRUCache } from './cache';
import { Encryptor } from './security';

export class WeebDB {
  private readonly engine: Engine;
  private readonly pool: StatementPool;
  private readonly txnManager: TransactionManager;
  private readonly schemaManager: SchemaManager;
  private readonly indexManager: IndexManager;
  private readonly queryCompiler: QueryCompiler;
  private readonly migrationManager: MigrationManager;
  private readonly validator: Validator;
  private readonly kvStore: KVStore;
  private readonly tableCache: Map<string, Table> = new Map();
  private readonly cacheLayer: LRUCache | null;
  private encryptor: Encryptor | null;
  private readonly opts: DBOptions;

  constructor(opts: DBOptions | string) {
    this.opts = typeof opts === 'string' ? { path: opts } : opts;

    this.engine = new Engine(this.opts);
    this.pool = new StatementPool(this.engine.db);
    this.txnManager = new TransactionManager(this.engine.db);
    this.indexManager = new IndexManager(this.engine.db);
    this.queryCompiler = new QueryCompiler(this.indexManager);
    this.schemaManager = new SchemaManager(this.engine.db, this.pool);
    this.migrationManager = new MigrationManager(this.engine.db, this.pool, this.txnManager);
    this.validator = new Validator(this.opts.validation !== false);

    if (this.opts.cache !== false) {
      const cacheOpts: CacheOptions = typeof this.opts.cache === 'object' ? this.opts.cache : {};
      this.cacheLayer = new LRUCache(cacheOpts.maxSize ?? 10000, cacheOpts.ttl ?? null);
    } else {
      this.cacheLayer = null;
    }

    if (this.opts.encryption) {
      this.encryptor = new Encryptor(this.opts.encryption.key);
    } else {
      this.encryptor = null;
    }

    const ns = this.opts.namespace || 'default';
    this.kvStore = new KVStore(this.engine.db, this.pool, this.txnManager, ns, this.cacheLayer, this.encryptor);
  }

  // key-value

  get<T = unknown>(key: string): T | undefined {
    return this.kvStore.get<T>(key);
  }

  set(key: string, value: unknown, ttl?: number): void {
    this.kvStore.set(key, value, ttl);
  }

  delete(key: string): boolean {
    return this.kvStore.delete(key);
  }

  has(key: string): boolean {
    return this.kvStore.has(key);
  }

  update(key: string, patch: Record<string, unknown>): void {
    this.kvStore.update(key, patch);
  }

  find<T = unknown>(pattern: string): Array<{ key: string; value: T }> {
    return this.kvStore.find<T>(pattern);
  }

  keys(): string[] {
    return this.kvStore.keys();
  }

  setMany(entries: BulkSetEntry[]): void {
    this.kvStore.setMany(entries);
  }

  getMany<T = unknown>(keys: string[]): Map<string, T> {
    return this.kvStore.getMany<T>(keys);
  }

  deleteMany(keys: string[]): number {
    return this.kvStore.deleteMany(keys);
  }

  clearKV(): void {
    this.kvStore.clear();
  }

  // table

  table(name: string): Table {
    let api = this.tableCache.get(name);
    if (api) return api;

    const schema = this.schemaManager.getSchema(name);
    api = new Table(name, this.queryCompiler, this.pool, schema || null, this.validator, this.cacheLayer);
    this.tableCache.set(name, api);
    return api;
  }

  defineTable(name: string, schema: TableSchema): void {
    this.schemaManager.define(name, schema);
    this.tableCache.delete(name);
  }

  // transactions

  transaction<T>(fn: () => T): T {
    return this.txnManager.run(fn);
  }

  immediateTransaction<T>(fn: () => T): T {
    return this.txnManager.immediate(fn);
  }

  // migration

  migrate(migrations: MigrationDef[]): void {
    this.migrationManager.run(migrations);
  }

  rollback(migrations: MigrationDef[], targetVersion: number): void {
    this.migrationManager.rollback(migrations, targetVersion);
  }

  getMigrationVersion(): number {
    return this.migrationManager.getCurrentVersion();
  }

  verifyMigrations(migrations: MigrationDef[]): Array<{ version: number; status: string }> {
    return this.migrationManager.verify(migrations);
  }

  // indexing

  createIndex(table: string, columns: string[], unique = false, name?: string): void {
    this.indexManager.create(table, columns, unique, name);
  }

  dropIndex(name: string): void {
    this.indexManager.drop(name);
  }

  suggestIndexes(threshold?: number): Array<{ table: string; columns: string[]; hits: number }> {
    return this.indexManager.suggest(threshold);
  }

  // namespace

  ns(namespace: string): WeebDB {
    return new WeebDB({
      ...this.opts,
      namespace,
    });
  }

  // lifecycle

  checkIntegrity(): boolean {
    return this.engine.checkIntegrity();
  }

  close(): void {
    this.kvStore.destroy();
    this.pool.clear();
    this.engine.close();
  }

  get raw(): import('./types').SqliteDatabase {
    return this.engine.db;
  }

  // stats

  get stats() {
    return {
      statements: this.pool.size,
      cacheSize: this.cacheLayer?.size ?? 0,
      kvCount: this.kvStore.count(),
      migrationVersion: this.migrationManager.getCurrentVersion(),
    };
  }
}

export type {
  DBOptions,
  TableSchema,
  ColumnDef,
  ColumnType,
  IndexDef,
  QueryFilter,
  QueryOptions,
  QueryOperators,
  MigrationDef,
  RunResult,
  BulkSetEntry,
  CacheOptions,
  EncryptionOptions,
} from './types';

export { Table } from './data';
export { LRUCache } from './cache';
export { Encryptor } from './security';

export default WeebDB;