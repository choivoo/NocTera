/**
 * Owns all PlayerProfiles in memory and persists them through a dirty-flag
 * write queue. Never writes every tick: `tick()` flushes at most a small number
 * of dirty profiles per interval; `saveNow()` is used after critical actions
 * (5★ pulls, character/weapon obtain, quest completion, currency transactions).
 */
import { ChunkedJsonStore, type Storage } from "./Storage";
import { createProfile, migrateProfile, type PlayerProfile } from "../account/PlayerProfile";
import { bus } from "../core/EventBus";
import { logger } from "../core/Logger";
import type { Clock } from "../core/Clock";

const log = logger("save");

export class SaveManager {
  private store: ChunkedJsonStore;
  private profiles = new Map<string, PlayerProfile>();
  private dirty = new Set<string>();
  private ticksSinceFlush = 0;
  writeCount = 0;

  constructor(storage: Storage, private clock: Clock, private flushIntervalTicks = 100, chunkSize = 30000, private maxPerFlush = 4) {
    this.store = new ChunkedJsonStore(storage, chunkSize);
  }

  private key(playerId: string): string {
    return `noct:p:${playerId}`;
  }

  /** Loads (or creates) a profile. Returns [profile, isNew]. */
  load(playerId: string, name: string): [PlayerProfile, boolean] {
    const cached = this.profiles.get(playerId);
    if (cached) return [cached, false];
    let raw: unknown;
    try {
      raw = this.store.read(this.key(playerId));
    } catch (e) {
      log.error(`failed to read profile ${playerId}: ${e}`);
      raw = undefined;
    }
    const now = this.clock.now();
    const isNew = raw === undefined;
    const profile = isNew ? createProfile(playerId, name, now) : migrateProfile(raw, playerId, now);
    profile.name = name;
    profile.lastLogin = now;
    this.profiles.set(playerId, profile);
    if (isNew) this.saveNow(playerId);
    else this.markDirty(playerId);
    return [profile, isNew];
  }

  get(playerId: string): PlayerProfile | undefined {
    return this.profiles.get(playerId);
  }

  all(): IterableIterator<PlayerProfile> {
    return this.profiles.values();
  }

  markDirty(playerId: string): void {
    if (this.profiles.has(playerId)) this.dirty.add(playerId);
  }

  isDirty(playerId: string): boolean {
    return this.dirty.has(playerId);
  }

  saveNow(playerId: string): boolean {
    const p = this.profiles.get(playerId);
    if (!p) return false;
    try {
      this.store.write(this.key(playerId), p);
      this.writeCount++;
      this.dirty.delete(playerId);
      bus.emit("profile:saved", { playerId });
      return true;
    } catch (e) {
      log.error(`save failed for ${playerId}: ${e}`);
      this.dirty.add(playerId);
      return false;
    }
  }

  /** Called every tick; only does work every `flushIntervalTicks`. */
  tick(): void {
    if (++this.ticksSinceFlush < this.flushIntervalTicks) return;
    this.ticksSinceFlush = 0;
    let n = 0;
    for (const id of [...this.dirty]) {
      if (n++ >= this.maxPerFlush) break;
      this.saveNow(id);
    }
  }

  flushAll(): void {
    for (const id of [...this.dirty]) this.saveNow(id);
  }

  /** Save and evict (player left). */
  unload(playerId: string): void {
    if (this.dirty.has(playerId)) this.saveNow(playerId);
    this.profiles.delete(playerId);
  }

  reset(playerId: string, name: string): PlayerProfile {
    this.store.delete(this.key(playerId));
    const p = createProfile(playerId, name, this.clock.now());
    this.profiles.set(playerId, p);
    this.saveNow(playerId);
    return p;
  }
}
