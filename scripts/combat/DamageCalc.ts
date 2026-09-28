/** Server-side damage formula (pure). */
import type { FinalStats } from "../character/Stats";
import type { ReactionDef } from "../data/types";
import type { Rng } from "../core/Rng";

export interface DamageInput {
  attacker: FinalStats;
  mult: number; // skill multiplier (already talent-scaled)
  elemental: boolean; // does this hit carry the character's element (gets elementDmg)
  bonusDmgPct: number; // additive dmg% buffs (normalDmg etc.)
  targetDef: number;
  targetBroken: boolean;
  brokenTakenMult: number;
  reaction: ReactionDef | null;
  defConstant: number;
  defIgnorePct?: number;
}

export interface DamageOutput {
  amount: number;
  crit: boolean;
  reactionBonus: number;
}

export function computeDamage(i: DamageInput, rng: Rng): DamageOutput {
  const crit = rng.next() * 100 < i.attacker.critRate;
  let dmg = i.attacker.atk * i.mult;
  dmg *= 1 + ((i.elemental ? i.attacker.elementDmg : 0) + i.bonusDmgPct) / 100;
  if (crit) dmg *= 1 + i.attacker.critDmg / 100;
  let reactionBonus = 0;
  let defIgnore = i.defIgnorePct ?? 0;
  if (i.reaction) {
    dmg *= i.reaction.mult;
    if (i.reaction.flatScale) reactionBonus = i.attacker.atk * i.reaction.flatScale;
    if (i.reaction.id === "COLLAPSE") defIgnore = Math.max(defIgnore, 40);
  }
  const def = i.targetDef * (1 - defIgnore / 100);
  const defMult = i.defConstant / (i.defConstant + def);
  let total = (dmg + reactionBonus) * defMult;
  if (i.targetBroken) total *= i.brokenTakenMult;
  return { amount: Math.max(1, Math.round(total)), crit, reactionBonus: Math.round(reactionBonus * defMult) };
}

export function computeBreak(base: number, breakPower: number, reaction: ReactionDef | null): number {
  return base * (1 + breakPower / 100) + (reaction?.breakBonus ?? 0);
}

export function computeHeal(stats: FinalStats, pctAtk: number, flat = 0): number {
  return Math.round((stats.atk * pctAtk) / 100 * (1 + stats.healBonus / 100) + flat);
}
