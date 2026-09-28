/** Server-side state for one combat target: HP, Break, element aura, statuses (pure). */
import type { EnemyDef } from "../data/types";
import type { Aura } from "./Elements";

export type Status = "frozen" | "shocked" | "airborne" | "broken";

export class EnemyState {
  hp: number;
  breakGauge: number;
  aura: Aura | null = null;
  brokenUntil = 0;
  statuses = new Map<Status, number>(); // status → expires tick
  nextAttackTick = 0;
  pendingImpact: { tick: number; targetId: string } | null = null;
  lastHitBy: { playerId: string; characterId: string } | null = null;
  phase = 1;

  constructor(public readonly def: EnemyDef, public readonly scale = 1) {
    this.hp = Math.round(def.hp * scale);
    this.breakGauge = def.breakGauge;
  }

  get maxHp(): number {
    return Math.round(this.def.hp * this.scale);
  }

  isBroken(tick: number): boolean {
    return tick < this.brokenUntil;
  }

  has(status: Status, tick: number): boolean {
    return (this.statuses.get(status) ?? 0) > tick;
  }

  setStatus(status: Status, until: number): void {
    this.statuses.set(status, Math.max(until, this.statuses.get(status) ?? 0));
  }

  /** Returns true when this damage broke the enemy. */
  applyBreak(amount: number, tick: number, durationTicks: number): boolean {
    if (this.def.breakGauge <= 0 || this.isBroken(tick)) return false;
    this.breakGauge -= amount;
    if (this.breakGauge > 0) return false;
    this.brokenUntil = tick + durationTicks;
    this.setStatus("broken", this.brokenUntil);
    this.breakGauge = this.def.breakGauge; // refills for the next cycle
    this.pendingImpact = null; // interrupts the current attack
    return true;
  }

  /** Returns true if this killed it. */
  applyDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp <= 0;
  }

  /** Boss phases at 66% / 33% HP. */
  updatePhase(): boolean {
    const pct = this.hp / this.maxHp;
    const next = pct <= 0.33 ? 3 : pct <= 0.66 ? 2 : 1;
    if (next !== this.phase) {
      this.phase = next;
      return true;
    }
    return false;
  }
}
