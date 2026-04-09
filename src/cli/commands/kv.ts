import { parseArgs } from 'util';
import { WeebDB } from '../../index';

export async function kvCommand(args: string[], config: any, defaultOptions: any) {
  if (!config || !config.dbPath) {
    throw new Error('Missing or invalid wdb.config.json. Run wdb init first.');
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      ...(defaultOptions as any)
    },
    allowPositionals: true,
  }) as { values: { json?: boolean }, positionals: string[] };

  if (positionals.length === 0) {
    throw new Error('Missing KV action. Use: wdb kv <set|get|delete> <key> [value]');
  }

  const action = positionals[0];
  const key = positionals[1];

  if (!key) {
    throw new Error(`Missing key for action: ${action}`);
  }

  const db = new WeebDB({ path: config.dbPath });

  try {
    switch (action) {
      case 'set': {
        const valStr = positionals.slice(2).join(' ');
        if (!valStr) throw new Error('Missing value for set action');
        let value;
        try {
          value = JSON.parse(valStr);
        } catch {
          value = valStr; // store as plain string if invalid JSON
        }
        db.set(key, value);
        if (!values.json) console.log(`KV SET OK: ${key}`);
        break;
      }
      case 'get': {
        const val = db.get(key);
        if (val === undefined) {
          if (!values.json) console.error(`Key not found: ${key}`);
        } else {
          console.log(values.json ? JSON.stringify(val, null, 2) : val);
        }
        break;
      }
      case 'delete': {
        const deleted = db.delete(key);
        if (!values.json) console.log(`KV DELETE ${deleted ? 'OK' : 'MISSED'}: ${key}`);
        break;
      }
      default:
        throw new Error(`Unknown KV action: ${action}`);
    }
  } finally {
    db.close();
  }
}