import type { QueryFilter, QueryOptions, TableSchema, RunResult } from '../types';
import type { QueryCompiler } from '../query/query';
import type { StatementPool } from '../core/statements';
import type { Validator } from '../schema/validator';
import type { LRUCache } from '../cache/cache';

export class Table {
  private readonly tableName: string;
  private readonly compiler: QueryCompiler;
  private readonly pool: StatementPool;
  private readonly schema: TableSchema | null;
  private readonly validator: Validator;
  private readonly cache: LRUCache | null;

  constructor(
    tableName: string,
    compiler: QueryCompiler,
    pool: StatementPool,
    schema: TableSchema | null,
    validator: Validator,
    cache: LRUCache | null,
  ) {
    this.tableName = tableName;
    this.compiler = compiler;
    this.pool = pool;
    this.schema = schema;
    this.validator = validator;
    this.cache = cache;
  }

  insert(row: Record<string, unknown>): RunResult {
    if (this.schema) {
      this.validator.validateRow(row, this.schema.columns);
    }

    const { sql, params } = this.compiler.insert(this.tableName, row);
    const stmt = this.pool.prepare(sql);
    const result = stmt.run(...params) as RunResult;

    this.invalidateCache();
    return result;
  }

  insertMany(rows: Array<Record<string, unknown>>): RunResult {
    if (rows.length === 0) return { changes: 0, lastInsertRowid: 0 };

    if (this.schema) {
      for (const row of rows) {
        this.validator.validateRow(row, this.schema.columns);
      }
    }

    const { sql, params } = this.compiler.insertMany(this.tableName, rows);
    if (!sql) return { changes: 0, lastInsertRowid: 0 };

    const stmt = this.pool.prepare(sql);
    const result = stmt.run(...params) as RunResult;

    this.invalidateCache();
    return result;
  }

  find(filter?: QueryFilter, opts?: QueryOptions): Record<string, unknown>[] {
    const cacheKey = filter ? `table:${this.tableName}:find:${JSON.stringify(filter)}:${JSON.stringify(opts || {})}` : null;

    if (cacheKey && this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) return cached as Record<string, unknown>[];
    }

    const { sql, params } = this.compiler.select(this.tableName, filter, opts);
    const stmt = this.pool.prepare(sql);
    const rows = stmt.all(...params) as Record<string, unknown>[];

    if (cacheKey && this.cache) {
      this.cache.set(cacheKey, rows);
    }

    return rows;
  }

  findOne(filter: QueryFilter, opts?: QueryOptions): Record<string, unknown> | null {
    const results = this.find(filter, { ...opts, limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  update(filter: QueryFilter, patch: Record<string, unknown>): RunResult {
    if (this.schema) {
      this.validator.validatePartial(patch, this.schema.columns);
    }

    const patchWithTimestamp = this.schema?.timestamps
      ? { ...patch, updated_at: Date.now() }
      : patch;

    const { sql, params } = this.compiler.update(this.tableName, filter, patchWithTimestamp);
    const stmt = this.pool.prepare(sql);
    const result = stmt.run(...params) as RunResult;

    this.invalidateCache();
    return result;
  }

  delete(filter: QueryFilter): RunResult {
    const { sql, params } = this.compiler.delete(this.tableName, filter);
    const stmt = this.pool.prepare(sql);
    const result = stmt.run(...params) as RunResult;

    this.invalidateCache();
    return result;
  }

  count(filter?: QueryFilter): number {
    const { sql, params } = this.compiler.count(this.tableName, filter);
    const stmt = this.pool.prepare(sql);
    const row = stmt.get(...params) as { count: number };
    return row.count;
  }

  truncate(): void {
    this.pool.prepare(`DELETE FROM "${this.tableName}"`).run();
    this.invalidateCache();
  }

  private invalidateCache(): void {
    if (!this.cache) return;

    const prefix = `table:${this.tableName}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.remove(key);
      }
    }
  }
}