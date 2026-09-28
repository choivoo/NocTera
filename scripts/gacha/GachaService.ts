/**
 * Transactional pulls: validate → lock → deduct → roll → grant → save → unlock.
 * The per-player lock blocks double-submits (e.g. tapping "10회 호출" twice
 * while the form is still closing) from executing concurrently or twice.
 */
import type { PlayerProfile } from "../account/PlayerProfile";
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

export type PullError = "locked" | "banner_inactive" | "insufficient" | "bad_count" | "save_failed";

export interface PullOutcome {
  ok: boolean;
  error?: PullError;
  results: GrantedPull[];
  paidWith?: { signal: number; astrum: number };
}

export class GachaService {
  private locks = new Set<string>();

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

  pull(p: PlayerProfile, bannerId: string, count: number): PullOutcome {
    if (count !== 1 && count !== 10) return { ok: false, error: "bad_count", results: [] };
    const banner = getBanner(bannerId);
    if (!banner.active) return { ok: false, error: "banner_inactive", results: [] };
    if (this.locks.has(p.playerId)) return { ok: false, error: "locked", results: [] };

    const price = this.quote(p, bannerId, count);
    if (!canAfford(p, price)) return { ok: false, error: "insufficient", results: [] };

    this.locks.add(p.playerId);
    try {
      if (!spend(p, price)) return { ok: false, error: "insufficient", results: [] };
      const group = pityGroup(banner);
      const pity = (p.pity[group] ??= emptyPity());
      const rolled = rollMany(banner, pity, this.rng, count);
      const now = this.clock.now();
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

      // Every pull is a currency transaction → persist immediately.
      if (!this.persist(p.playerId)) return { ok: true, error: "save_failed", results: granted, paidWith: price };
      bus.emit("gacha:pulled", { playerId: p.playerId, bannerId, results: granted.map((g) => ({ itemId: g.itemId, rarity: g.rarity })) });
      return { ok: true, results: granted, paidWith: price };
    } finally {
      this.locks.delete(p.playerId);
    }
  }
}
