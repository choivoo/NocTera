/** Normal-attack combo state machine (pure, tick based). */
import type { ComboHitDef } from "../data/types";

export class ComboTracker {
  private index = -1;
  private lastTick = -Infinity;
  private lockedUntil = 0;

  constructor(private hits: ComboHitDef[]) {}

  /** Returns the hit to perform, or null if still recovering from the previous hit. */
  attack(tick: number, atkSpeedPct = 0): { hit: ComboHitDef; step: number; finisher: boolean } | null {
    if (tick < this.lockedUntil) return null;
    const prev = this.index >= 0 ? this.hits[this.index] : null;
    if (!prev || tick - this.lastTick > prev.window || this.index >= this.hits.length - 1) this.index = 0;
    else this.index++;
    const hit = this.hits[this.index];
    this.lastTick = tick;
    // Minimum spacing between inputs scales with hitstop and attack speed.
    const recovery = Math.max(2, Math.round((4 + hit.hitstop) / (1 + atkSpeedPct / 100)));
    this.lockedUntil = tick + recovery;
    return { hit, step: this.index, finisher: this.index === this.hits.length - 1 };
  }

  /** Attack-cancel: clears recovery but keeps the combo step (dodge → continue combo). */
  cancelRecovery(): void {
    this.lockedUntil = 0;
  }

  reset(): void {
    this.index = -1;
    this.lastTick = -Infinity;
    this.lockedUntil = 0;
  }

  get step(): number {
    return this.index;
  }
}
