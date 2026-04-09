import type { ColumnDef, ColumnType } from '../types';

type TypeChecker = (v: unknown) => boolean;

const TYPE_CHECKS: Record<ColumnType, TypeChecker> = {
  TEXT: (v) => typeof v === 'string',
  INTEGER: (v) => typeof v === 'number' && Number.isInteger(v),
  REAL: (v) => typeof v === 'number',
  BLOB: (v) => Buffer.isBuffer(v),
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export class Validator {
  private readonly enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled && !IS_PRODUCTION;
  }

  validateRow(row: Record<string, unknown>, columns: Record<string, ColumnDef>): void {
    if (!this.enabled) return;

    const columnNames = Object.keys(columns);
    const rowKeys = Object.keys(row);

    for (const key of rowKeys) {
      if (!(key in columns)) {
        throw new TypeError(`Unknown column "${key}"`);
      }
    }

    for (const name of columnNames) {
      const def = columns[name];
      const value = row[name];

      if (value === undefined || value === null) {
        if (!def.nullable && def.default === undefined && !def.primaryKey) {
          throw new TypeError(`Column "${name}" is not nullable and has no default`);
        }
        continue;
      }

      const check = TYPE_CHECKS[def.type];
      if (!check(value)) {
        throw new TypeError(`Column "${name}" expects ${def.type}, got ${typeof value}`);
      }
    }
  }

  validatePartial(patch: Record<string, unknown>, columns: Record<string, ColumnDef>): void {
    if (!this.enabled) return;

    for (const [key, value] of Object.entries(patch)) {
      if (!(key in columns)) {
        throw new TypeError(`Unknown column "${key}"`);
      }

      if (value === null) {
        if (!columns[key].nullable) {
          throw new TypeError(`Column "${key}" is not nullable`);
        }
        continue;
      }

      if (value !== undefined) {
        const check = TYPE_CHECKS[columns[key].type];
        if (!check(value)) {
          throw new TypeError(`Column "${key}" expects ${columns[key].type}, got ${typeof value}`);
        }
      }
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }
}