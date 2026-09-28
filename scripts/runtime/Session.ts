/**
 * Live (non-persistent) per-player combat state. Persistent data lives in the
 * PlayerProfile; HP/energy/cooldowns are session state that resets on relog
 * (HP is restored at beacons / on login, like the reference genre).
 */
import type { Player, Vector3 } from "@minecraft/server";
import type { PlayerProfile } from "../account/PlayerProfile";
import type { StatBlock, StatKey } from "../data/types";
import { getCharacter } from "../data/registry";
import { ComboTracker } from "../combat/ComboTracker";
import { newDodgeState, type DodgeState } from "../combat/DodgeJudge";
import { addStats, computeStats, type FinalStats } from "../character/Stats";
import { partyMembers, partySynergies } from "../party/PartyManager";

export interface Buff {
  stat: StatKey | "moveSpeed" | "atkSpeed" | "dmgReduction" | "normalDmg";
  value: number;
  until: number;
  source: string;
}

export interface CharRuntime {
  id: string;
  hp: number;
  energy: number;
  skillReadyAt: number;
  skillCharges: number;
  gauge: number;
  stateUntil: number;
  shield: number;
  shieldUntil: number;
  combo: ComboTracker;
  qteReadyUntil: number;
}

export interface Summon {
  owner: string;
  kind: "drone";
  until: number;
  nextAt: number;
  interval: number;
  mult: number;
  range: number;
  index: number;
}

export interface Field {
  owner: string;
  center: Vector3;
  radius: number;
  until: number;
  nextAt: number;
  interval: number;
  mult: number;
  pull: number;
  element: string | null;
  onAttackBonusMult: number;
  healPctAtk: number;
  particle: string;
}

export class Session {
  chars = new Map<string, CharRuntime>();
  dodge: DodgeState = newDodgeState();
  buffs: Buff[] = [];
  summons: Summon[] = [];
  fields: Field[] = [];
  switchReadyAt = 0;
  lastHit = "";
  lastHitUntil = 0;
  inCombatUntil = 0;
  busyUntil = 0; // cutscene / gacha lock: inputs ignored
  setBonusUntil = new Map<string, number>(); // 4pc timed set bonuses
  private statCache = new Map<string, { at: number; stats: FinalStats }>();

  constructor(public player: Player, public profile: PlayerProfile) {
    this.syncParty();
  }

  get id(): string {
    return this.profile.playerId;
  }

  get activeId(): string | null {
    return this.profile.party[this.profile.activeSlot] ?? null;
  }

  get active(): CharRuntime | null {
    const id = this.activeId;
    return id ? this.chars.get(id) ?? null : null;
  }

  /** Ensure runtime entries exist for current party members. */
  syncParty(): void {
    for (const id of partyMembers(this.profile)) {
      if (this.chars.has(id)) continue;
      const def = getCharacter(id);
      const stats = computeStats(this.profile, this.profile.characters[id]);
      this.chars.set(id, {
        id,
        hp: stats.maxHp,
        energy: 0,
        skillReadyAt: 0,
        skillCharges: 1,
        gauge: 0,
        stateUntil: 0,
        shield: 0,
        shieldUntil: 0,
        combo: new ComboTracker(def.kit.normal.hits),
        qteReadyUntil: 0,
      });
    }
    this.invalidateStats();
  }

  invalidateStats(): void {
    this.statCache.clear();
  }

  buffTotal(stat: Buff["stat"], tick: number): number {
    let v = 0;
    for (const b of this.buffs) if (b.stat === stat && b.until > tick) v += b.value;
    return v;
  }

  /** Stats including party synergy, timed buffs, mechanic state and timed 4pc bonuses. Cached for 10 ticks. */
  stats(charId: string, tick: number): FinalStats {
    const c = this.statCache.get(charId);
    if (c && tick - c.at < 10) return c.stats;
    const inst = this.profile.characters[charId];
    const extra: StatBlock = {};
    for (const s of partySynergies(partyMembers(this.profile))) addStats(extra, s.stats);
    for (const b of this.buffs) {
      if (b.until > tick && b.stat in ({ hp: 1, hpPct: 1, atk: 1, atkPct: 1, def: 1, defPct: 1, critRate: 1, critDmg: 1, elementDmg: 1, energyRegen: 1, breakPower: 1, healBonus: 1 } as const)) {
        addStats(extra, { [b.stat]: b.value });
      }
    }
    const rt = this.chars.get(charId);
    const def = getCharacter(charId);
    if (rt && rt.stateUntil > tick && def.mechanic.state) addStats(extra, def.mechanic.state.buffs);
    const stats = computeStats(this.profile, inst, extra);
    this.statCache.set(charId, { at: tick, stats });
    return stats;
  }

  alive(charId: string): boolean {
    return (this.chars.get(charId)?.hp ?? 0) > 0;
  }

  addBuff(b: Buff): void {
    this.buffs = this.buffs.filter((x) => !(x.source === b.source && x.stat === b.stat));
    this.buffs.push(b);
    this.invalidateStats();
  }

  prune(tick: number): void {
    const before = this.buffs.length;
    this.buffs = this.buffs.filter((b) => b.until > tick);
    if (this.buffs.length !== before) this.invalidateStats();
    this.summons = this.summons.filter((s) => s.until > tick);
    this.fields = this.fields.filter((f) => f.until > tick);
  }
}
