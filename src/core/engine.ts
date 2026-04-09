import { DatabaseSync } from 'node:sqlite';
import type { DBOptions, SqliteDatabase } from '../types';

const DEFAULT_PRAGMAS: Record<string, string | number> = {
  journal_mode: 'WAL',
  synchronous: 'NORMAL',
  cache_size: -64000,
  temp_store: 'MEMORY',
  journal_size_limit: 67108864,
  busy_timeout: 5000,
  foreign_keys: 'ON',
};

export class Engine {
  readonly db: SqliteDatabase;
  private closed = false;
  private signalHandlers: Array<() => void> = [];

  constructor(opts: DBOptions) {
    this.db = new DatabaseSync(opts.path);
    this.applyPragmas(opts);
    this.registerShutdown();
  }

  private applyPragmas(opts: DBOptions): void {
    const pragmas = { ...DEFAULT_PRAGMAS };

    if (opts.walMode === false) {
      pragmas.journal_mode = 'DELETE';
    }

    if (opts.mmapSize) {
      pragmas.mmap_size = opts.mmapSize;
    }

    if (opts.pragmas) {
      Object.assign(pragmas, opts.pragmas);
    }

    for (const [key, value] of Object.entries(pragmas)) {
      this.db.exec(`PRAGMA ${key}=${value};`);
    }
  }

  private registerShutdown(): void {
    const handler = () => this.close();
    this.signalHandlers.push(handler);
    process.on('exit', handler);
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
  }

  checkIntegrity(): boolean {
    try {
      const stmt = this.db.prepare('PRAGMA integrity_check');
      const result = stmt.all() as Array<{ integrity_check: string }>;
      return result.length === 1 && result[0].integrity_check === 'ok';
    } catch {
      return false;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    for (const handler of this.signalHandlers) {
      process.removeListener('exit', handler);
      process.removeListener('SIGINT', handler);
      process.removeListener('SIGTERM', handler);
    }
    this.signalHandlers.length = 0;

    try {
      this.db.close();
    } catch (_) {}
  }

  get isClosed(): boolean {
    return this.closed;
  }
}