import { createHash } from "node:crypto";

/** Collapse whitespace, strip case, drop trailing punctuation. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")   // smart quotes -> plain
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:\s]+$/, "")
    .trim();
}

export function hashKey(input: string): string {
  return createHash("sha256").update(normalise(input)).digest("hex").slice(0, 16);
}

/** Hash any JSON-serialisable value — used for the narrative cache. */
export function hashJson(value: unknown): string {
  return hashKey(JSON.stringify(value));
}

export class MemoryCache<T> {
  private store = new Map<string, T>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxEntries = 200) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (hit !== undefined) {
      this.hits++;
      // refresh recency
      this.store.delete(key);
      this.store.set(key, hit);
    } else {
      this.misses++;
    }
    return hit;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, value);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Surface this in the demo. "14 of 16 calls served from cache." */
  stats(): { entries: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      entries: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : Math.round((this.hits / total) * 100) / 100,
    };
  }
}
