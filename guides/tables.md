# Structured Table Management

The structured table layer provides strong, schema-enforced ORM-like access without the overhead of runtime reflection or proxy models. 

## Definition and Compilation

Tables must be explicitly registered via `defineTable`. The `WeebDB` engine will automatically compute differences and scaffold the physical table and indexes if they are missing or altered.

```typescript
import { WeebDB } from '@weebforge/db';

const db = new WeebDB({ path: './data.db' });

db.defineTable('users', {
  columns: {
    id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
    username: { type: 'TEXT', unique: true, notNull: true },
    reputation: { type: 'REAL', default: 0 },
    metadata: { type: 'JSON' }
  },
  indexes: [
    { columns: ['reputation'] }
  ]
});

const users = db.table('users');
```

## Data Operations

All methods proxy to the internal `QueryCompiler`, converting JavaScript objects deterministically into parameterized SQL.

### Insertion

```typescript
const rowId = users.insert({ 
  username: 'system', 
  reputation: 99.9,
  metadata: { flags: ['admin'] } 
});
```

### Retrieval

Retrieve operations support exact matches or compiler-supported condition operators.

```typescript
// Find single record
const user = users.findOne({ username: 'system' });

// Find multiple records using operators
const topUsers = users.find({
  reputation: { $gt: 50.0 }
});

// Allowed Operators:
// $eq, $ne, $gt, $lt, $gte, $lte, $in, $like
```

### Mutating

```typescript
// Update records matching filter
users.update(
  { reputation: { $lt: 0 } }, // Filter
  { reputation: 0 }           // Patch
);

// Delete records
users.delete({ username: 'system' });
```

### Counting

```typescript
const total = users.count({ reputation: { $gt: 10 } });
```

## Internal Behaviors

1. **Schema Validation**: Row inserts/updates map against internal validators to ensure runtime types match SQLite affinities. This validation is stripped out when `NODE_ENV=production` is detected to regain native speeds.
2. **LRU Entity Cache**: Table schemas mapped correctly participate in the cache engine if cache allocation is defined.