/**
 * Currency + material transactions. All mutations validate first and are
 * rejected atomically (no partial deduction). Every currency change is saved
 * immediately by the caller-provided `commit` hook.
 */
import type { PlayerProfile } from "./PlayerProfile";
import { bus } from "../core/EventBus";

export type Currency = keyof PlayerProfile["currency"];
export type Cost = Partial<Record<Currency, number>> & { materials?: Record<string, number> };

export function canAfford(p: PlayerProfile, cost: Cost): boolean {
  for (const [k, v] of Object.entries(cost)) {
    if (k === "materials") continue;
    if ((v as number) < 0 || !Number.isFinite(v as number)) return false;
    if (p.currency[k as Currency] < (v as number)) return false;
  }
  for (const [m, n] of Object.entries(cost.materials ?? {})) {
    if (n < 0 || (p.materials[m] ?? 0) < n) return false;
  }
  return true;
}

/** Deducts `cost` or returns false without touching the profile. */
export function spend(p: PlayerProfile, cost: Cost): boolean {
  if (!canAfford(p, cost)) return false;
  for (const [k, v] of Object.entries(cost)) {
    if (k === "materials" || !v) continue;
    p.currency[k as Currency] -= v as number;
    bus.emit("currency:changed", { playerId: p.playerId, currency: k, delta: -(v as number), balance: p.currency[k as Currency] });
  }
  for (const [m, n] of Object.entries(cost.materials ?? {})) {
    p.materials[m] = (p.materials[m] ?? 0) - n;
    if (p.materials[m] <= 0) delete p.materials[m];
  }
  return true;
}

export function grant(p: PlayerProfile, gain: Cost): void {
  for (const [k, v] of Object.entries(gain)) {
    if (k === "materials" || !v) continue;
    if ((v as number) < 0) throw new Error("grant() with negative amount");
    p.currency[k as Currency] += Math.floor(v as number);
    bus.emit("currency:changed", { playerId: p.playerId, currency: k, delta: v as number, balance: p.currency[k as Currency] });
  }
  for (const [m, n] of Object.entries(gain.materials ?? {})) {
    if (n < 0) throw new Error("grant() with negative material");
    p.materials[m] = (p.materials[m] ?? 0) + Math.floor(n);
  }
}
