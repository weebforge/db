import type { SqliteDatabase, MigrationDef, MigrationRecord } from '../types';
import type { StatementPool } from '../core/statements';
import type { TransactionManager } from '../core/transaction';
import { sha256 } from '../utils';

const MIGRATION_TABLE = '_migrations';

const SQL_CREATE = `
  CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
    version INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    applied_at INTEGER NOT NULL,
    direction TEXT NOT NULL
  )
`;

const SQL_GET_LATEST = `SELECT version FROM ${MIGRATION_TABLE} WHERE direction = 'up' ORDER BY version DESC LIMIT 1`;
const SQL_INSERT = `INSERT INTO ${MIGRATION_TABLE} (version, checksum, applied_at, direction) VALUES (?, ?, ?, ?)`;
const SQL_GET_ALL = `SELECT version, checksum, applied_at, direction FROM ${MIGRATION_TABLE} ORDER BY version ASC, applied_at ASC`;
const SQL_GET_CHECKSUM = `SELECT checksum FROM ${MIGRATION_TABLE} WHERE version = ? AND direction = 'up' ORDER BY applied_at DESC LIMIT 1`;

export class MigrationManager {
  private readonly db: SqliteDatabase;
  private readonly pool: StatementPool;
  private readonly txn: TransactionManager;

  constructor(db: SqliteDatabase, pool: StatementPool, txn: TransactionManager) {
    this.db = db;
    this.pool = pool;
    this.txn = txn;
    this.db.exec(SQL_CREATE);
  }

  getCurrentVersion(): number {
    const stmt = this.pool.prepare(SQL_GET_LATEST);
    const row = stmt.get() as { version: number } | undefined;
    return row?.version ?? 0;
  }

  run(migrations: MigrationDef[]): void {
    const sorted = migrations.slice().sort((a, b) => a.version - b.version);
    const currentVersion = this.getCurrentVersion();

    for (const migration of sorted) {
      if (migration.version <= currentVersion) continue;

      this.txn.immediate(() => {
        const checksum = sha256(migration.up.toString());
        migration.up(this.db);
        this.recordMigration(migration.version, checksum, 'up');
      });
    }
  }

  rollback(migrations: MigrationDef[], targetVersion: number): void {
    const sorted = migrations.slice().sort((a, b) => b.version - a.version);
    const currentVersion = this.getCurrentVersion();

    for (const migration of sorted) {
      if (migration.version <= targetVersion) break;
      if (migration.version > currentVersion) continue;

      this.txn.immediate(() => {
        const storedChecksum = this.getChecksum(migration.version);
        const currentChecksum = sha256(migration.up.toString());

        if (storedChecksum && storedChecksum !== currentChecksum) {
          throw new Error(
            `Migration checksum mismatch for version ${migration.version}. ` +
            `Expected ${storedChecksum}, got ${currentChecksum}. Migration may have been modified.`
          );
        }

        migration.down(this.db);
        this.recordMigration(migration.version, currentChecksum, 'down');
      });
    }
  }

  getHistory(): MigrationRecord[] {
    const stmt = this.pool.prepare(SQL_GET_ALL);
    return stmt.all() as unknown as MigrationRecord[];
  }

  verify(migrations: MigrationDef[]): Array<{ version: number; status: 'ok' | 'mismatch' | 'missing' }> {
    const results: Array<{ version: number; status: 'ok' | 'mismatch' | 'missing' }> = [];

    for (const migration of migrations) {
      const storedChecksum = this.getChecksum(migration.version);
      const currentChecksum = sha256(migration.up.toString());

      if (!storedChecksum) {
        results.push({ version: migration.version, status: 'missing' });
      } else if (storedChecksum !== currentChecksum) {
        results.push({ version: migration.version, status: 'mismatch' });
      } else {
        results.push({ version: migration.version, status: 'ok' });
      }
    }

    return results;
  }

  private recordMigration(version: number, checksum: string, direction: string): void {
    const stmt = this.pool.prepare(SQL_INSERT);
    stmt.run(version, checksum, Date.now(), direction);
  }

  private getChecksum(version: number): string | null {
    const stmt = this.pool.prepare(SQL_GET_CHECKSUM);
    const row = stmt.get(version) as { checksum: string } | undefined;
    return row?.checksum ?? null;
  }
}