/**
 * Transactional pulls: validate → lock → deduct → roll → grant → save → unlock.
 * The per-player lock blocks double-submits (e.g. tapping "10회 호출" twice
 * while the form is still closing) from executing concurrently or twice.
 */
import type { GachaTxRecord, PlayerProfile } from "../account/PlayerProfile";
import { recordError } from "../core/ErrorLog";
import { emptyPity } from "../account/PlayerProfile";
import { getBanner, itemKind, Config } from "../data/registry";
import { rollMany, pityGroup, type PullResult } from "./GachaEngine";
import { obtainCharacter, obtainOrRefineWeapon } from "../character/CharacterManager";
import { spend, canAfford } from "../account/Wallet";
import type { Rng } from "../core/Rng";
import { bus } from "../core/EventBus";

export interface GrantedPull extends PullResult {
  kind: "character" | "weapon";
  isNew: boolean;
  resonanceMaterial: number;
}

export type PullError = "locked" | "banner_inactive" | "insufficient" | "bad_count" | "save_failed" | "duplicate" | "failed";

export interface PullOutcome {
  ok: boolean;
  error?: PullError;
  results: GrantedPull[];
  paidWith?: { signal: number; astrum: number };
  txId?: string;
}

/** Fields a pull may change — snapshotted for rollback. */
const TX_FIELDS = ["currency", "materials", "characters", "weapons", "pity", "gachaHistory", "nextUid"] as const;
const COMMITTED_KEEP = 30;

function snapshotOf(p: PlayerProfile): string {
  return JSON.stringify(Object.fromEntries(TX_FIELDS.map((k) => [k, p[k]])));
}
function restore(p: PlayerProfile, snap: string): void {
  const o = JSON.parse(snap);
  for (const k of TX_FIELDS) (p as any)[k] = o[k];
}

/**
 * Transactional pulls. Every pull is a transaction TX-<account>-<time>-<seq>:
 *   CREATED → CURRENCY_RESERVED → ROLLED → REWARD_GRANTED → COMMITTED
 * - A per-player lock rejects re-entrant/double-tap pulls.
 * - An optional client request id makes a retried request idempotent ("duplicate").
 * - Any exception before COMMITTED restores the pre-transaction snapshot (ROLLED_BACK):
 *   no currency is lost, no reward is duplicated.
 * - If the server dies with a pending tx persisted, `recover()` on next login either
 *   commits (rewards already granted) or rolls back (anything earlier).
 */
export class GachaService {
  private locks = new Set<string>();
  /** Test hook: throw right after entering this state (simulates a crash). */
  faultAt: GachaTxRecord["state"] | null = null;

  constructor(private rng: Rng, private clock: { now(): number }, private persist: (playerId: string) => boolean) {}

  isLocked(playerId: string): boolean {
    return this.locks.has(playerId);
  }

  /** Signals are consumed first, remaining pulls are paid with Astrum. */
  quote(p: PlayerProfile, bannerId: string, count: number): { signal: number; astrum: number } {
    const banner = getBanner(bannerId);
    const signal = Math.min(p.currency.signal, count);
    return { signal, astrum: (count - signal) * banner.costPerPull };
  }

  private step(tx: GachaTxRecord, state: GachaTxRecord["state"]): void {
    tx.state = state;
    if (this.faultAt === state) throw new Error(`fault injected at ${state}`);
  }

  pull(p: PlayerProfile, bannerId: string, count: number, requestId?: string): PullOutcome {
    if (count !== 1 && count !== 10) return { ok: false, error: "bad_count", results: [] };
    const banner = getBanner(bannerId);
    if (!banner.active) return { ok: false, error: "banner_inactive", results: [] };
    if (this.locks.has(p.playerId)) return { ok: false, error: "locked", results: [] };
    if (requestId && p.gachaTx.committed.includes(requestId)) return { ok: false, error: "duplicate", results: [] };
    this.recover(p);

    const price = this.quote(p, bannerId, count);
    if (!canAfford(p, price)) return { ok: false, error: "insufficient", results: [] };

    this.locks.add(p.playerId);
    const now = this.clock.now();
    const tx: GachaTxRecord = { id: requestId ?? `TX-${p.playerId}-${now}-${++p.gachaTx.seq}`, state: "CREATED", banner: bannerId, count, price, snapshot: snapshotOf(p) };
    p.gachaTx.pending = tx;
    try {
      this.step(tx, "CREATED");
      if (!spend(p, price)) throw new Error("reserve failed");
      this.step(tx, "CURRENCY_RESERVED");
      const group = pityGroup(banner);
      const pity = (p.pity[group] ??= emptyPity());
      const rolled = rollMany(banner, pity, this.rng, count);
      tx.results = rolled.map((r) => ({ itemId: r.itemId, rarity: r.rarity }));
      this.step(tx, "ROLLED");
      const granted: GrantedPull[] = rolled.map((r) => {
        const kind = itemKind(r.itemId);
        if (kind === "character") {
          const o = obtainCharacter(p, r.itemId, now);
          return { ...r, kind, isNew: !o.duplicate, resonanceMaterial: o.resonanceMaterial };
        }
        const w = obtainOrRefineWeapon(p, r.itemId);
        return { ...r, kind: "weapon", isNew: !w.refined, resonanceMaterial: 0 };
      });
      const firstPull = pity.total - count + 1;
      granted.forEach((g, i) => p.gachaHistory.push({ t: now, banner: bannerId, item: g.itemId, rarity: g.rarity, pull: firstPull + i }));
      const limit = Config.gacha.historyLimit;
      if (p.gachaHistory.length > limit) p.gachaHistory.splice(0, p.gachaHistory.length - limit);
      this.step(tx, "REWARD_GRANTED");
      this.commit(p, tx);
      // Every pull is a currency transaction → persist immediately (tx is already committed in the snapshot).
      if (!this.persist(p.playerId)) return { ok: true, error: "save_failed", results: granted, paidWith: price, txId: tx.id };
      bus.emit("gacha:pulled", { playerId: p.playerId, bannerId, results: granted.map((g) => ({ itemId: g.itemId, rarity: g.rarity })) });
      return { ok: true, results: granted, paidWith: price, txId: tx.id };
    } catch (e) {
      restore(p, tx.snapshot);
      tx.state = "ROLLED_BACK";
      p.gachaTx.pending = null;
      recordError("gacha", `${tx.id} rolled back: ${e instanceof Error ? e.message : e}`);
      return { ok: false, error: "failed", results: [], txId: tx.id };
    } finally {
      this.locks.delete(p.playerId);
    }
  }

  private commit(p: PlayerProfile, tx: GachaTxRecord): void {
    this.step(tx, "COMMITTED");
    p.gachaTx.pending = null;
    p.gachaTx.committed.push(tx.id);
    if (p.gachaTx.committed.length > COMMITTED_KEEP) p.gachaTx.committed.splice(0, p.gachaTx.committed.length - COMMITTED_KEEP);
  }

  /** Crash recovery for a transaction persisted mid-flight. Returns what happened. */
  recover(p: PlayerProfile): "none" | "committed" | "rolled_back" {
    const tx = p.gachaTx.pending;
    if (!tx || tx.state === "COMMITTED" || tx.state === "ROLLED_BACK") {
      p.gachaTx.pending = null;
      return "none";
    }
    if (tx.state === "REWARD_GRANTED") {
      p.gachaTx.pending = null;
      p.gachaTx.committed.push(tx.id);
      return "committed";
    }
    restore(p, tx.snapshot);
    p.gachaTx.pending = null;
    return "rolled_back";
  }
}
