interface CacheNode<T> {
  key: string;
  value: T;
  expiresAt: number | null;
  prev: CacheNode<T> | null;
  next: CacheNode<T> | null;
}

export class LRUCache<T = unknown> {
  private map: Map<string, CacheNode<T>> = new Map();
  private head: CacheNode<T> | null = null;
  private tail: CacheNode<T> | null = null;
  private readonly maxSize: number;
  private readonly defaultTTL: number | null;

  constructor(maxSize = 10000, defaultTTL: number | null = null) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  get(key: string): T | undefined {
    const node = this.map.get(key);
    if (!node) return undefined;

    if (node.expiresAt !== null && Date.now() > node.expiresAt) {
      this.remove(key);
      return undefined;
    }

    this.moveToHead(node);
    return node.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const resolvedTTL = ttl ?? this.defaultTTL;
    const expiresAt = resolvedTTL ? Date.now() + resolvedTTL : null;
    const existing = this.map.get(key);

    if (existing) {
      existing.value = value;
      existing.expiresAt = expiresAt;
      this.moveToHead(existing);
      return;
    }

    const node: CacheNode<T> = { key, value, expiresAt, prev: null, next: null };
    this.map.set(key, node);
    this.addToHead(node);

    if (this.map.size > this.maxSize) {
      this.evictTail();
    }
  }

  remove(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.detach(node);
    this.map.delete(key);
    return true;
  }

  has(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    if (node.expiresAt !== null && Date.now() > node.expiresAt) {
      this.remove(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  get size(): number {
    return this.map.size;
  }

  keys(): string[] {
    const result: string[] = [];
    let node = this.head;
    while (node) {
      if (node.expiresAt === null || Date.now() <= node.expiresAt) {
        result.push(node.key);
      }
      node = node.next;
    }
    return result;
  }

  private addToHead(node: CacheNode<T>): void {
    node.next = this.head;
    node.prev = null;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private detach(node: CacheNode<T>): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: CacheNode<T>): void {
    if (node === this.head) return;
    this.detach(node);
    this.addToHead(node);
  }

  private evictTail(): void {
    if (!this.tail) return;
    const evicted = this.tail;
    this.detach(evicted);
    this.map.delete(evicted.key);
  }
}