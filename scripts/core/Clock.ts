/** Wall-clock abstraction (ms). Swappable in tests for Flux regen / daily resets. */
export interface Clock {
  now(): number;
}
export const systemClock: Clock = { now: () => Date.now() };

export class ManualClock implements Clock {
  constructor(public t = 0) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}
