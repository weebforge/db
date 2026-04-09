import { createHash } from 'crypto';

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Buffer) && !(v instanceof Date);
}

export function serializeValue(v: unknown): string {
  return JSON.stringify(v);
}

export function deserializeValue<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}