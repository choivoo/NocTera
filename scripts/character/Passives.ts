/**
 * Passive talents. Each character's passives carry a machine-readable
 * `effect` (database/characters/*.json) that unlocks at its ascension phase.
 *   cond            conditional stat while `when` holds (target_frozen, target_broken,
 *                   target_aura:<EL>, behind_target, hp_below:<pct>, in_state,
 *                   shielded, in_field, stationary, drones_active, reaction:<ID>)
 *   overheal_shield overhealing becomes a shield (value % of overheal)
 *   shield_break_heal  heal (value % ATK) when a shield breaks
 *   skill_hit_energy   extra energy per skill hit
 *   switch_cd       switch cooldown multiplier while `when` holds
 *   dodge_cd_in_state  dodge cooldown multiplier during the mechanic state
 *   utility_speed   out-of-combat Speed I (exploration)
 */
import type { Entity } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import type { EnemyState } from "../combat/EnemyState";
import type { PassiveEffect, ReactionDef } from "../data/types";
import { getCharacter } from "../data/registry";
import { angleTo, dist } from "../core/Vec";

export function activePassives(s: Session, charId: string): PassiveEffect[] {
  const inst = s.profile.characters[charId];
  if (!inst) return [];
  return getCharacter(charId).kit.passives.filter((p) => p.effect && inst.ascension >= p.unlockAscension).map((p) => p.effect!);
}

export interface PassiveCtx {
  tick: number;
  target?: Entity;
  state?: EnemyState;
  reaction?: ReactionDef | null;
}

function holds(s: Session, charId: string, when: string, c: PassiveCtx): boolean {
  const rt = s.chars.get(charId);
  const [k, arg] = when.split(":");
  switch (k) {
    case "target_frozen":
      return !!c.state?.has("frozen", c.tick);
    case "target_broken":
      return !!c.state?.isBroken(c.tick);
    case "target_aura":
      return !!c.state?.aura && c.state.aura.expiresAt > c.tick && c.state.aura.element === arg;
    case "behind_target": {
      if (!c.target) return false;
      // Behind = the target is facing away from the attacker.
      const tv = c.target.getViewDirection();
      return angleTo(c.target.location, tv, s.player.location) > 110;
    }
    case "hp_below":
      return !!rt && rt.hp / s.stats(charId, c.tick).maxHp * 100 < Number(arg);
    case "in_state":
      return !!rt && rt.stateUntil > c.tick;
    case "shielded":
      return !!rt && rt.shield > 0 && rt.shieldUntil > c.tick;
    case "in_field":
      return s.fields.some((f) => f.until > c.tick && dist(f.center, s.player.location) <= f.radius);
    case "stationary": {
      const v = s.player.getVelocity();
      return Math.hypot(v.x, v.z) < 0.02;
    }
    case "drones_active":
      return s.summons.some((d) => d.until > c.tick);
    case "reaction":
      return c.reaction?.id === arg;
    default:
      return false;
  }
}

export interface OffenseBonus {
  critRate: number;
  critDmg: number;
  dmgPct: number;
  atkPct: number;
}

export function offenseBonus(s: Session, charId: string, c: PassiveCtx): OffenseBonus {
  const b: OffenseBonus = { critRate: 0, critDmg: 0, dmgPct: 0, atkPct: 0 };
  for (const e of activePassives(s, charId)) {
    if (e.type !== "cond" || !(e.stat in b)) continue;
    if (holds(s, charId, e.when, c)) b[e.stat as keyof OffenseBonus] += e.value;
  }
  return b;
}

export function defenseBonus(s: Session, charId: string, tick: number): { defPct: number; dmgReduction: number } {
  const b = { defPct: 0, dmgReduction: 0 };
  for (const e of activePassives(s, charId)) {
    if (e.type === "cond" && (e.stat === "defPct" || e.stat === "dmgReduction") && holds(s, charId, e.when, { tick })) b[e.stat] += e.value;
  }
  return b;
}

export function passiveValue(s: Session, charId: string, type: PassiveEffect["type"], tick: number): number | null {
  for (const e of activePassives(s, charId)) {
    if (e.type !== type) continue;
    if (e.type === "switch_cd") return holds(s, charId, e.when, { tick }) ? e.value : null;
    if ("value" in e) return e.value;
    return 1;
  }
  return null;
}
