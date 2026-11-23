/**
 * A small in-process cache with a per-entry TTL and a size bound.
 *
 * For hot, cheap-to-recompute lookups on the API process (one PM2 instance),
 * where a few seconds of staleness are acceptable and writers can invalidate.
 * When full, the oldest entry is evicted (Map keeps insertion order).
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  /** Drop every entry whose value matches. */
  deleteWhere(match: (value: V, key: K) => boolean): void {
    for (const [key, entry] of this.entries) {
      if (match(entry.value, key)) this.entries.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
