/** Pure stat computation: character base + level + ascension + weapon + imprints + buffs. */
import type { CharacterInstance, PlayerProfile } from "../account/PlayerProfile";
import type { CharacterDef, StatBlock, StatKey } from "../data/types";
import { Config, getCharacter, getWeapon, ImprintSets } from "../data/registry";

export interface FinalStats {
  maxHp: number;
  atk: number;
  def: number;
  critRate: number; // percent
  critDmg: number; // percent
  elementDmg: number; // percent (own element)
  energyRegen: number; // percent, 100 = baseline
  breakPower: number; // percent bonus
  healBonus: number; // percent
}

export function levelCap(ascension: number): number {
  const caps = Config.character.ascensionCaps;
  return caps[Math.max(0, Math.min(ascension, caps.length - 1))];
}

export function expToNext(level: number): number {
  return Math.round(180 + 34 * Math.pow(level, 1.55));
}

export function addStats(into: StatBlock, add: StatBlock | undefined, scale = 1): StatBlock {
  if (!add) return into;
  for (const [k, v] of Object.entries(add)) into[k as StatKey] = (into[k as StatKey] ?? 0) + (v as number) * scale;
  return into;
}

export function characterBase(def: CharacterDef, level: number, ascension: number) {
  const lv = 1 + (level - 1) * 0.075;
  const asc = ascension * 0.35;
  return {
    hp: def.base.hp * (lv + asc),
    atk: def.base.atk * (lv + asc),
    def: def.base.def * (lv + asc),
  };
}

export function weaponStats(weaponId: string, level: number, ascension: number, refinement: number) {
  const w = getWeapon(weaponId);
  const atk = w.baseAtk * (1 + (level - 1) * 0.09) + 22 * ascension;
  const sub = w.subStat.base * (1 + ((level - 1) / 89) * 3.5);
  const passive = w.passive.perRefinement[Math.max(0, Math.min(4, refinement - 1))];
  return { atk, sub: { [w.subStat.stat]: sub } as StatBlock, passive };
}

/** Set bonuses active for equipped imprints (2pc always; 4pc "always" trigger only). */
export function imprintBonuses(p: PlayerProfile, inst: CharacterInstance): { stats: StatBlock; fourPieceSets: string[] } {
  const stats: StatBlock = {};
  const counts = new Map<string, number>();
  for (const uid of inst.imprintUids) {
    if (!uid) continue;
    const imp = p.imprints[uid];
    if (!imp) continue;
    addStats(stats, imp.main);
    addStats(stats, imp.subs);
    counts.set(imp.setId, (counts.get(imp.setId) ?? 0) + 1);
  }
  const four: string[] = [];
  for (const [setId, n] of counts) {
    const set = ImprintSets.get(setId);
    if (!set) continue;
    if (n >= 2) addStats(stats, set.twoPiece.stats);
    if (n >= 4) {
      four.push(setId);
      if (set.fourPiece.trigger === "always") addStats(stats, set.fourPiece.stats);
    }
  }
  return { stats, fourPieceSets: four };
}

export function computeStats(p: PlayerProfile, inst: CharacterInstance, buffs?: StatBlock): FinalStats {
  const def = getCharacter(inst.characterId);
  const base = characterBase(def, inst.level, inst.ascension);
  const bonus: StatBlock = {};
  // Ascension stat grows linearly with ascension phase.
  bonus[def.ascensionStat.stat] = (def.ascensionStat.total * inst.ascension) / 6;
  let weaponAtk = 0;
  if (inst.weaponUid) {
    const wi = p.weapons[inst.weaponUid];
    if (wi) {
      const ws = weaponStats(wi.weaponId, wi.level, wi.ascension, wi.refinement);
      weaponAtk = ws.atk;
      addStats(bonus, ws.sub);
      addStats(bonus, ws.passive);
    }
  }
  addStats(bonus, imprintBonuses(p, inst).stats);
  addStats(bonus, buffs);
  const c = Config.character;
  return {
    maxHp: Math.round(base.hp * (1 + (bonus.hpPct ?? 0) / 100) + (bonus.hp ?? 0)),
    atk: Math.round((base.atk + weaponAtk) * (1 + (bonus.atkPct ?? 0) / 100) + (bonus.atk ?? 0)),
    def: Math.round(base.def * (1 + (bonus.defPct ?? 0) / 100) + (bonus.def ?? 0)),
    critRate: Math.min(100, c.baseCritRate + (bonus.critRate ?? 0)),
    critDmg: c.baseCritDmg + (bonus.critDmg ?? 0),
    elementDmg: bonus.elementDmg ?? 0,
    energyRegen: c.baseEnergyRegen + (bonus.energyRegen ?? 0),
    breakPower: bonus.breakPower ?? 0,
    healBonus: bonus.healBonus ?? 0,
  };
}

/** Talent level including resonance boosts (R3 skill +3, R5 ult +3). */
export function effectiveTalent(inst: CharacterInstance, kind: "normal" | "skill" | "ultimate"): number {
  const def = getCharacter(inst.characterId);
  let lv = kind === "normal" ? inst.normalAttackLevel : kind === "skill" ? inst.skillLevel : inst.ultimateLevel;
  for (let r = 0; r < inst.resonance; r++) {
    const e = def.resonance[r]?.effect ?? {};
    if (kind === "skill" && e.skillLevel) lv += e.skillLevel;
    if (kind === "ultimate" && e.ultLevel) lv += e.ultLevel;
  }
  return lv;
}

export function talentScale(level: number): number {
  return 1 + (level - 1) * 0.1;
}

/** Sum of numeric resonance effects unlocked so far, e.g. resonanceValue(inst, "winterDuration"). */
export function resonanceValue(inst: CharacterInstance, key: string): number {
  const def = getCharacter(inst.characterId);
  let v = 0;
  for (let r = 0; r < inst.resonance; r++) v += def.resonance[r]?.effect?.[key] ?? 0;
  return v;
}
