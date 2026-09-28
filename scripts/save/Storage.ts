/** Minimal string key-value persistence port. Adapters: DynamicPropertyStorage (game), MemoryStorage (tests). */
export interface Storage {
  get(key: string): string | undefined;
  set(key: string, value: string | undefined): void;
  keys(prefix: string): string[];
}

export class MemoryStorage implements Storage {
  readonly data = new Map<string, string>();
  writes = 0;
  get(key: string): string | undefined {
    return this.data.get(key);
  }
  set(key: string, value: string | undefined): void {
    this.writes++;
    if (value === undefined) this.data.delete(key);
    else this.data.set(key, value);
  }
  keys(prefix: string): string[] {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix));
  }
}

/**
 * Stores arbitrarily large JSON split into chunks (dynamic properties have a
 * per-value size limit). Two slots (A/B) alternate; the `#slot` pointer is
 * flipped only after the new slot is fully written, so a crash mid-write
 * always leaves the previous complete snapshot readable.
 */
export class ChunkedJsonStore {
  constructor(private storage: Storage, private chunkSize = 30000) {}

  write(key: string, value: unknown): void {
    const json = JSON.stringify(value);
    const active = this.storage.get(`${key}#slot`);
    const slot = active === "A" ? "B" : "A";
    const chunks: string[] = [];
    for (let i = 0; i < json.length; i += this.chunkSize) chunks.push(json.slice(i, i + this.chunkSize));
    if (chunks.length === 0) chunks.push("");
    const oldCount = Number(this.storage.get(`${key}#${slot}n`) ?? 0);
    chunks.forEach((c, i) => this.storage.set(`${key}#${slot}${i}`, c));
    for (let i = chunks.length; i < oldCount; i++) this.storage.set(`${key}#${slot}${i}`, undefined);
    this.storage.set(`${key}#${slot}n`, String(chunks.length));
    this.storage.set(`${key}#slot`, slot); // commit point
  }

  read<T>(key: string): T | undefined {
    const slot = this.storage.get(`${key}#slot`);
    if (!slot) return undefined;
    const n = Number(this.storage.get(`${key}#${slot}n`) ?? 0);
    let json = "";
    for (let i = 0; i < n; i++) {
      const c = this.storage.get(`${key}#${slot}${i}`);
      if (c === undefined) throw new Error(`corrupt save: ${key} slot ${slot} missing chunk ${i}`);
      json += c;
    }
    return JSON.parse(json) as T;
  }

  delete(key: string): void {
    for (const k of this.storage.keys(`${key}#`)) this.storage.set(k, undefined);
  }
}
