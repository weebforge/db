import type { SqliteDatabase } from '../types';

export class TransactionManager {
  private readonly db: SqliteDatabase;
  private _inTransaction = false;
  private savepointCounter = 0;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  run<T>(fn: () => T): T {
    if (this._inTransaction) {
      return this.savepoint(fn);
    }

    this.db.exec('BEGIN');
    this._inTransaction = true;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this._inTransaction = false;
    }
  }

  immediate<T>(fn: () => T): T {
    if (this._inTransaction) {
      return this.savepoint(fn);
    }

    this.db.exec('BEGIN IMMEDIATE');
    this._inTransaction = true;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    } finally {
      this._inTransaction = false;
    }
  }

  get inTransaction(): boolean {
    return this._inTransaction;
  }

  private savepoint<T>(fn: () => T): T {
    const name = `sp_${++this.savepointCounter}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try {
      const result = fn();
      this.db.exec(`RELEASE ${name}`);
      return result;
    } catch (err) {
      this.db.exec(`ROLLBACK TO ${name}`);
      this.db.exec(`RELEASE ${name}`);
      throw err;
    }
  }
}