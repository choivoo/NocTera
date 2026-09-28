/** Pure gacha roll logic: rates, soft/hard pity, 50/50 guarantee. */
import type { BannerDef } from "../data/types";
import type { PityState } from "../account/PlayerProfile";
import { pick, type Rng } from "../core/Rng";

export interface PullResult {
  itemId: string;
  rarity: 3 | 4 | 5;
  featured: boolean;
  /** Pull index within this pity counter when this 5★ hit (for display). */
  pityAt: number;
  lostFiftyFifty: boolean;
}

export function fiveStarRate(banner: BannerDef, pullNo: number): number {
  const r = banner.rates;
  if (pullNo >= r.hardPity5) return 1;
  if (pullNo >= r.softPityStart) return Math.min(1, r.base5 + (pullNo - r.softPityStart + 1) * r.softPityStep);
  return r.base5;
}

export function pityGroup(banner: BannerDef): string {
  return banner.type;
}

/** Mutates `pity` and returns one result. */
export function rollOnce(banner: BannerDef, pity: PityState, rng: Rng): PullResult {
  const n5 = pity.since5 + 1;
  const n4 = pity.since4 + 1;
  pity.total++;
  const roll = rng.next();

  if (roll < fiveStarRate(banner, n5)) {
    pity.since5 = 0;
    pity.since4 = 0; // a 5★ also satisfies the "≥4★ every 10" guarantee
    let featured = false;
    let lost = false;
    let itemId: string;
    if (banner.featured5 && (pity.guaranteed || rng.next() < banner.rates.featuredChance)) {
      itemId = banner.featured5;
      featured = true;
      pity.guaranteed = false;
    } else {
      itemId = pick(rng, banner.pool5);
      if (banner.featured5) {
        lost = true;
        pity.guaranteed = true;
      }
    }
    return { itemId, rarity: 5, featured, pityAt: n5, lostFiftyFifty: lost };
  }
  pity.since5 = n5;

  if (n4 >= banner.rates.hardPity4 || rng.next() < banner.rates.base4 / (1 - banner.rates.base5)) {
    pity.since4 = 0;
    const featuredHit = banner.featured4.length > 0 && rng.next() < 0.5;
    const itemId = featuredHit ? pick(rng, banner.featured4) : pick(rng, banner.pool4);
    return { itemId, rarity: 4, featured: featuredHit, pityAt: n4, lostFiftyFifty: false };
  }
  pity.since4 = n4;
  return { itemId: pick(rng, banner.pool3), rarity: 3, featured: false, pityAt: 0, lostFiftyFifty: false };
}

export function rollMany(banner: BannerDef, pity: PityState, rng: Rng, count: number): PullResult[] {
  const out: PullResult[] = [];
  for (let i = 0; i < count; i++) out.push(rollOnce(banner, pity, rng));
  return out;
}
