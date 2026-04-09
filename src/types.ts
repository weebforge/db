import type { DatabaseSync, StatementSync } from 'node:sqlite';

export type SqliteDatabase = DatabaseSync;
export type SqliteStatement = StatementSync;

export type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';

export interface ColumnDef {
  type: ColumnType;
  nullable?: boolean;
  default?: unknown;
  unique?: boolean;
  index?: boolean;
  primaryKey?: boolean;
}

export interface TableSchema {
  columns: Record<string, ColumnDef>;
  indexes?: IndexDef[];
  timestamps?: boolean;
}

export interface IndexDef {
  columns: string[];
  unique?: boolean;
  name?: string;
}

export interface QueryFilter {
  [key: string]: unknown;
}

export interface QueryOperators {
  $eq?: unknown;
  $ne?: unknown;
  $gt?: number;
  $lt?: number;
  $gte?: number;
  $lte?: number;
  $in?: unknown[];
  $like?: string;
}

export interface QueryOptions {
  select?: string[];
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  limit?: number;
  offset?: number;
}

export interface MigrationDef {
  version: number;
  up: (db: SqliteDatabase) => void;
  down: (db: SqliteDatabase) => void;
}

export interface DBOptions {
  path: string;
  namespace?: string;
  cache?: CacheOptions | boolean;
  encryption?: EncryptionOptions;
  validation?: boolean;
  pragmas?: Record<string, string | number>;
  mmapSize?: number;
  walMode?: boolean;
}

export interface CacheOptions {
  maxSize?: number;
  ttl?: number;
}

export interface EncryptionOptions {
  key: string;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface KVEntry<T = unknown> {
  key: string;
  value: T;
  expiresAt: number | null;
}

export interface SchemaVersionRecord {
  table_name: string;
  version: number;
  checksum: string;
  applied_at: number;
}

export interface MigrationRecord {
  version: number;
  checksum: string;
  applied_at: number;
  direction: string;
}

export interface BulkSetEntry {
  key: string;
  value: unknown;
  ttl?: number;
}