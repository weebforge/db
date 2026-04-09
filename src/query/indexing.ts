import type { SqliteDatabase } from '../types';
import { quoteIdent } from '../utils';

export class IndexManager {
  private readonly db: SqliteDatabase;
  private readonly queryUsage: Map<string, number> = new Map();

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  create(table: string, columns: string[], unique = false, name?: string): void {
    const idxName = name || `idx_${table}_${columns.join('_')}`;
    const uniqueStr = unique ? 'UNIQUE ' : '';
    const cols = columns.map(c => quoteIdent(c)).join(', ');
    this.db.exec(`CREATE ${uniqueStr}INDEX IF NOT EXISTS ${quoteIdent(idxName)} ON ${quoteIdent(table)} (${cols})`);
  }

  drop(name: string): void {
    this.db.exec(`DROP INDEX IF EXISTS ${quoteIdent(name)}`);
  }

  trackQuery(table: string, columns: string[]): void {
    const key = `${table}:${columns.slice().sort().join(',')}`;
    this.queryUsage.set(key, (this.queryUsage.get(key) || 0) + 1);
  }

  suggest(threshold = 10): Array<{ table: string; columns: string[]; hits: number }> {
    const suggestions: Array<{ table: string; columns: string[]; hits: number }> = [];

    for (const [key, hits] of this.queryUsage) {
      if (hits >= threshold) {
        const sepIdx = key.indexOf(':');
        const table = key.substring(0, sepIdx);
        const cols = key.substring(sepIdx + 1).split(',');
        suggestions.push({ table, columns: cols, hits });
      }
    }

    return suggestions.sort((a, b) => b.hits - a.hits);
  }

  list(table: string): Array<{ name: string; columns: string[] }> {
    const rows = this.db.prepare(`PRAGMA index_list(${quoteIdent(table)})`).all() as Array<{ name: string }>;
    return rows.map(row => {
      const info = this.db.prepare(`PRAGMA index_info(${quoteIdent(row.name)})`).all() as Array<{ name: string }>;
      return { name: row.name, columns: info.map(i => i.name) };
    });
  }

  resetTracking(): void {
    this.queryUsage.clear();
  }
}