# Key-Value Object Store

The internal KV layer operates as a fast-path abstraction over SQLite. It maintains high throughput handling serialization, deserialization, TTL expiration, and namespacing internally.

## API Reference

### Initialization

```typescript
import { WeebDB } from '@weebforge/db';

const db = new WeebDB({ path: './data.db' });
```

### Basic CRUD

```typescript
// Insert or replace a key. Values are serialized to JSON.
db.set('session:123', { user: 1, active: true });

// Retrieve a key. Fails safely to undefined.
const session = db.get<{ user: number; active: boolean }>('session:123');

// Delete
db.delete('session:123');

// Check presence
const exists = db.has('session:123'); // boolean
```

### Partial Updates

The `update` method performs a shallow merge-patch over an existing JSON object. If the key does not exist, an error is thrown.

```typescript
db.set('config:app', { port: 8080, mode: 'strict' });

// Updates only mode, preserves port
db.update('config:app', { mode: 'loose' });
```

### Bulk Operations

Batch operations utilize SQLite transactions natively, circumventing per-insert fsync penalties. For workloads >10 items, bulk operations are heavily recommended. 

```typescript
// Executes in a single transactional batch
db.setMany([
  { key: 'cache:A', value: [1, 2, 3] },
  { key: 'cache:B', value: [4, 5, 6] }
]);

const records = db.getMany(['cache:A', 'cache:B']);
db.deleteMany(['cache:A', 'cache:B']);
```

### Pattern Matching

Executes a `LIKE` query against the keyspace. In production workloads, ensure keyspace design aligns with prefix-scanning mechanics if you intend to use `find`.

```typescript
// Returns array of values for keys starting with 'user:'
const users = db.find('user:*');
```

## Time-To-Live (TTL)

TTL is handled via lazy-evaluation on `get` calls and periodically via an unreferenced interval sweep.

```typescript
// Expires in 60000ms (60 seconds)
db.set('ephemeral', { state: 1 }, 60000);
```

## Namespacing

Namespaces logically isolate KV entries into distinct partitions. Deleting a key in one namespace does not affect an identically named key in another.

```typescript
const gameStats = db.ns('game:stats');
const appMetrics = db.ns('app:metrics');

gameStats.set('player:1', { xp: 100 });
appMetrics.set('player:1', { requestCount: 5 }); // Does not override gameStats
```