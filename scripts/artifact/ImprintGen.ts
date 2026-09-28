/** Memory Imprint (기억각인) generation and leveling (pure). */
import { allocUid, IMPRINT_SLOTS, type ImprintInstance, type ImprintSlot, type PlayerProfile } from "../account/PlayerProfile";
import type { StatKey } from "../data/types";
import { pick, type Rng } from "../core/Rng";
import { ImprintSets } from "../data/registry";

const MAIN_BY_SLOT: Record<ImprintSlot, StatKey[]> = {
  CORE: ["hp"],
  TRACE: ["atk"],
  ECHO: ["hpPct", "atkPct", "defPct", "energyRegen"],
  PRISM: ["hpPct", "atkPct", "defPct", "elementDmg", "breakPower"],
  RELIC: ["hpPct", "atkPct", "defPct", "critRate", "critDmg", "healBonus"],
};
const MAIN_VALUE: Partial<Record<StatKey, number>> = { hp: 717, atk: 47, hpPct: 7, atkPct: 7, defPct: 8.7, energyRegen: 7.8, elementDmg: 7, breakPower: 8, critRate: 4.7, critDmg: 9.3, healBonus: 5.4 };
const SUB_POOL: StatKey[] = ["hp", "hpPct", "atk", "atkPct", "def", "defPct", "critRate", "critDmg", "energyRegen", "breakPower"];
const SUB_VALUE: Partial<Record<StatKey, number>> = { hp: 254, hpPct: 5, atk: 16, atkPct: 5, def: 19, defPct: 6.2, critRate: 3.3, critDmg: 6.6, energyRegen: 5.5, breakPower: 5 };

export function rollImprint(p: PlayerProfile, rng: Rng, setId?: string, slot?: ImprintSlot): ImprintInstance {
  const sid = setId ?? pick(rng, [...ImprintSets.keys()]);
  const sl = slot ?? pick(rng, IMPRINT_SLOTS);
  const mainKey = pick(rng, MAIN_BY_SLOT[sl]);
  const subs: Partial<Record<StatKey, number>> = {};
  const count = rng.next() < 0.25 ? 4 : 3;
  while (Object.keys(subs).length < count) {
    const k = pick(rng, SUB_POOL);
    if (k === mainKey || subs[k] !== undefined) continue;
    subs[k] = +(SUB_VALUE[k]! * (0.7 + rng.next() * 0.3)).toFixed(1);
  }
  const imp: ImprintInstance = { uid: allocUid(p, "i"), setId: sid, slot: sl, rarity: 5, level: 0, main: { [mainKey]: MAIN_VALUE[mainKey] }, subs, equippedBy: null };
  p.imprints[imp.uid] = imp;
  return imp;
}

/** +4 levels: one sub roll. Main scales ~ ×(1 + 0.2 per level). */
export function levelImprint(imp: ImprintInstance, rng: Rng): void {
  if (imp.level >= 20) return;
  const [mk] = Object.keys(imp.main) as StatKey[];
  imp.level++;
  imp.main[mk] = +(MAIN_VALUE[mk]! * (1 + imp.level * 0.2)).toFixed(1);
  if (imp.level % 4 === 0) {
    const keys = Object.keys(imp.subs) as StatKey[];
    if (keys.length < 4) {
      let k: StatKey;
      do k = pick(rng, SUB_POOL);
      while (k === mk || imp.subs[k] !== undefined);
      imp.subs[k] = +(SUB_VALUE[k]! * 0.85).toFixed(1);
    } else {
      const k = pick(rng, keys);
      imp.subs[k] = +((imp.subs[k] ?? 0) + SUB_VALUE[k]! * (0.7 + rng.next() * 0.3)).toFixed(1);
    }
  }
}

export function equipImprint(p: PlayerProfile, characterId: string, uid: string): string | null {
  const c = p.characters[characterId];
  const imp = p.imprints[uid];
  if (!c || !imp) return "not_owned";
  const idx = IMPRINT_SLOTS.indexOf(imp.slot);
  if (imp.equippedBy && imp.equippedBy !== characterId) {
    const other = p.characters[imp.equippedBy];
    if (other) other.imprintUids[idx] = c.imprintUids[idx];
    const mine = c.imprintUids[idx];
    if (mine && p.imprints[mine]) p.imprints[mine].equippedBy = imp.equippedBy;
  } else {
    const mine = c.imprintUids[idx];
    if (mine && p.imprints[mine]) p.imprints[mine].equippedBy = null;
  }
  c.imprintUids[idx] = uid;
  imp.equippedBy = characterId;
  return null;
}
