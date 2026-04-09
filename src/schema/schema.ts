import type { SqliteDatabase, TableSchema, SchemaVersionRecord } from '../types';
import type { StatementPool } from '../core/statements';
import { sha256, quoteIdent } from '../utils';

const AFFINITY: Record<string, string> = {
  TEXT: 'TEXT',
  INTEGER: 'INTEGER',
  REAL: 'REAL',
  BLOB: 'BLOB',
};

export class SchemaManager {
  private readonly db: SqliteDatabase;
  private readonly pool: StatementPool;
  private readonly schemas: Map<string, TableSchema> = new Map();

  constructor(db: SqliteDatabase, pool: StatementPool) {
    this.db = db;
    this.pool = pool;
    this.ensureMetaTable();
  }

  private ensureMetaTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _schema_versions (
        table_name TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `);
  }

  define(tableName: string, schema: TableSchema): void {
    const existing = this.schemas.get(tableName);
    const checksum = sha256(JSON.stringify(schema));

    if (existing) {
      const currentVersion = this.getVersion(tableName);
      if (currentVersion && currentVersion.checksum === checksum) {
        return;
      }
    }

    this.schemas.set(tableName, schema);
    this.createTable(tableName, schema);
    this.createIndexes(tableName, schema);
    this.recordVersion(tableName, checksum);
  }

  getSchema(tableName: string): TableSchema | undefined {
    return this.schemas.get(tableName);
  }

  getVersion(tableName: string): SchemaVersionRecord | null {
    const stmt = this.pool.prepare(
      'SELECT table_name, version, checksum, applied_at FROM _schema_versions WHERE table_name = ?'
    );
    const row = stmt.get(tableName) as SchemaVersionRecord | undefined;
    return row || null;
  }

  private createTable(tableName: string, schema: TableSchema): void {
    const parts: string[] = [];

    for (const [name, def] of Object.entries(schema.columns)) {
      let col = `${quoteIdent(name)} ${AFFINITY[def.type]}`;

      if (def.primaryKey) {
        col += ' PRIMARY KEY';
        if (def.type === 'INTEGER') col += ' AUTOINCREMENT';
      }

      if (!def.nullable && !def.primaryKey) col += ' NOT NULL';

      if (def.default !== undefined) {
        const defaultVal = typeof def.default === 'string'
          ? `'${def.default.replace(/'/g, "''")}'`
          : String(def.default);
        col += ` DEFAULT ${defaultVal}`;
      }

      if (def.unique && !def.primaryKey) col += ' UNIQUE';

      parts.push(col);
    }

    if (schema.timestamps) {
      parts.push('"created_at" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)');
      parts.push('"updated_at" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)');
    }

    this.db.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (${parts.join(', ')})`);
  }

  private createIndexes(tableName: string, schema: TableSchema): void {
    for (const [colName, colDef] of Object.entries(schema.columns)) {
      if (colDef.index && !colDef.primaryKey) {
        const idxName = `idx_${tableName}_${colName}`;
        this.db.exec(
          `CREATE INDEX IF NOT EXISTS ${quoteIdent(idxName)} ON ${quoteIdent(tableName)} (${quoteIdent(colName)})`
        );
      }
    }

    if (schema.indexes) {
      for (const idx of schema.indexes) {
        const idxName = idx.name || `idx_${tableName}_${idx.columns.join('_')}`;
        const unique = idx.unique ? 'UNIQUE ' : '';
        const cols = idx.columns.map(c => quoteIdent(c)).join(', ');
        this.db.exec(
          `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdent(idxName)} ON ${quoteIdent(tableName)} (${cols})`
        );
      }
    }
  }

  private recordVersion(tableName: string, checksum: string): void {
    const current = this.getVersion(tableName);
    const nextVersion = current ? current.version + 1 : 1;

    const stmt = this.pool.prepare(
      'INSERT OR REPLACE INTO _schema_versions (table_name, version, checksum, applied_at) VALUES (?, ?, ?, ?)'
    );
    stmt.run(tableName, nextVersion, checksum, Date.now());
  }
}