import type { QueryFilter, QueryOptions } from '../types';
import type { IndexManager } from './indexing';
import { quoteIdent, isPlainObject } from '../utils';

interface CompiledQuery {
  sql: string;
  params: any[];
}

const OPERATORS: Record<string, string> = {
  $eq: '=',
  $ne: '!=',
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<=',
  $like: 'LIKE',
};

export class QueryCompiler {
  private readonly indexManager: IndexManager | null;

  constructor(indexManager?: IndexManager) {
    this.indexManager = indexManager || null;
  }

  select(table: string, filter?: QueryFilter, opts?: QueryOptions): CompiledQuery {
    const cols = opts?.select ? opts.select.map(c => quoteIdent(c)).join(', ') : '*';
    let sql = `SELECT ${cols} FROM ${quoteIdent(table)}`;
    const params: unknown[] = [];

    if (filter && Object.keys(filter).length > 0) {
      const where = this.buildWhere(filter);
      sql += ` WHERE ${where.clause}`;
      params.push(...where.values);

      if (this.indexManager) {
        this.indexManager.trackQuery(table, Object.keys(filter));
      }
    }

    if (opts?.orderBy) {
      const orders = Object.entries(opts.orderBy).map(([col, dir]) => `${quoteIdent(col)} ${dir}`);
      sql += ` ORDER BY ${orders.join(', ')}`;
    }

    if (opts?.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(opts.limit);
    }

    if (opts?.offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(opts.offset);
    }

    return { sql, params };
  }

  insert(table: string, row: Record<string, unknown>): CompiledQuery {
    const keys = Object.keys(row);
    const cols = keys.map(k => quoteIdent(k)).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${quoteIdent(table)} (${cols}) VALUES (${placeholders})`;
    return { sql, params: keys.map(k => row[k]) };
  }

  insertMany(table: string, rows: Array<Record<string, unknown>>): CompiledQuery {
    if (rows.length === 0) return { sql: '', params: [] };

    const keys = Object.keys(rows[0]);
    const cols = keys.map(k => quoteIdent(k)).join(', ');
    const rowPlaceholder = `(${keys.map(() => '?').join(', ')})`;
    const allPlaceholders = rows.map(() => rowPlaceholder).join(', ');
    const sql = `INSERT INTO ${quoteIdent(table)} (${cols}) VALUES ${allPlaceholders}`;
    const params: unknown[] = [];
    for (const row of rows) {
      for (const key of keys) {
        params.push(row[key]);
      }
    }
    return { sql, params };
  }

  update(table: string, filter: QueryFilter, patch: Record<string, unknown>): CompiledQuery {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(patch)) {
      setClauses.push(`${quoteIdent(key)} = ?`);
      params.push(value);
    }

    let sql = `UPDATE ${quoteIdent(table)} SET ${setClauses.join(', ')}`;

    if (Object.keys(filter).length > 0) {
      const where = this.buildWhere(filter);
      sql += ` WHERE ${where.clause}`;
      params.push(...where.values);
    }

    return { sql, params };
  }

  delete(table: string, filter: QueryFilter): CompiledQuery {
    let sql = `DELETE FROM ${quoteIdent(table)}`;
    const params: unknown[] = [];

    if (Object.keys(filter).length > 0) {
      const where = this.buildWhere(filter);
      sql += ` WHERE ${where.clause}`;
      params.push(...where.values);
    }

    return { sql, params };
  }

  count(table: string, filter?: QueryFilter): CompiledQuery {
    let sql = `SELECT COUNT(*) as count FROM ${quoteIdent(table)}`;
    const params: unknown[] = [];

    if (filter && Object.keys(filter).length > 0) {
      const where = this.buildWhere(filter);
      sql += ` WHERE ${where.clause}`;
      params.push(...where.values);
    }

    return { sql, params };
  }

  private buildWhere(filter: QueryFilter): { clause: string; values: unknown[] } {
    const conditions: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (value === null) {
        conditions.push(`${quoteIdent(key)} IS NULL`);
      } else if (isPlainObject(value)) {
        const ops = value as Record<string, unknown>;
        for (const [op, operand] of Object.entries(ops)) {
          if (op === '$in') {
            const arr = operand as unknown[];
            if (arr.length === 0) {
              conditions.push('0');
            } else {
              conditions.push(`${quoteIdent(key)} IN (${arr.map(() => '?').join(', ')})`);
              values.push(...arr);
            }
          } else if (op in OPERATORS) {
            conditions.push(`${quoteIdent(key)} ${OPERATORS[op]} ?`);
            values.push(operand);
          }
        }
      } else {
        conditions.push(`${quoteIdent(key)} = ?`);
        values.push(value);
      }
    }

    return { clause: conditions.length > 0 ? conditions.join(' AND ') : '1=1', values };
  }
}