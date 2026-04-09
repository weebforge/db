import { parseArgs } from 'util';
import { WeebDB } from '../../index';
import { performance } from 'perf_hooks';

export async function queryCommand(args: string[], config: any, defaultOptions: any) {
    if (!config || !config.dbPath) {
        throw new Error('Missing or invalid wdb.config.json. Run wdb init first.');
    }

    const { values, positionals } = parseArgs({
        args,
        options: {
            ...(defaultOptions as any)
        },
        allowPositionals: true
    }) as { values: { json?: boolean, time?: boolean }, positionals: string[] };

    const sql = positionals.join(' ');
    if (!sql) {
        throw new Error('Missing SQL query string.');
    }

    const db = new WeebDB({ path: config.dbPath });
    let result;
    const start = performance.now();

    try {
        const stmt = db.raw.prepare(sql);
        const up = sql.trim().toUpperCase();
        if (up.startsWith('SELECT') || up.startsWith('PRAGMA')) {
            result = stmt.all();
        } else {
            result = stmt.run();
        }

    } finally {
        db.close();
    }

    const end = performance.now();

    if (values.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.table(result);
    }

    if (values.time) {
        console.log(`\nQuery execution time: ${(end - start).toFixed(2)}ms`);
    }
}