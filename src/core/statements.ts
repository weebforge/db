import type { SqliteDatabase, SqliteStatement } from '../types';

export class StatementPool {
  private pool: Map<string, SqliteStatement> = new Map();
  private readonly db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  prepare(sql: string): SqliteStatement {
    let stmt = this.pool.get(sql);
    if (stmt) return stmt;

    stmt = this.db.prepare(sql);
    this.pool.set(sql, stmt);
    return stmt;
  }

  invalidate(sql: string): void {
    this.pool.delete(sql);
  }

  clear(): void {
    this.pool.clear();
  }

  get size(): number {
    return this.pool.size;
  }
}