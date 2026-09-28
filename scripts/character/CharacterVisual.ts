/**
 * Drives the player model: `noct:char` selects the active character's geometry
 * and texture (0 = vanilla skin), `noct:anim` plays a one-shot animation
 * through that character's animation controller (see tools/gen-characters.mjs).
 */
import { system, type Player } from "@minecraft/server";
import order from "../../database/art/order.json";

export const ANIM = {
  none: 0, attack1: 1, attack2: 2, attack3: 3, attack4: 4, attack5: 5, attack6: 6,
  skill: 7, ultimate: 8, dodge: 9, perfect: 10, switch_in: 11, switch_out: 12,
  hurt: 13, knockback: 14, death: 15, victory: 16, select: 17, qte: 18,
} as const;
export type AnimName = keyof typeof ANIM;

/** Seconds each one-shot holds before returning to locomotion. */
const HOLD: Partial<Record<AnimName, number>> = { skill: 0.9, ultimate: 2.6, dodge: 0.45, perfect: 0.5, switch_in: 0.6, switch_out: 0.3, hurt: 0.25, knockback: 0.7, death: 2, victory: 2.2, select: 2.2, qte: 0.6 };

export function charIndex(characterId: string | null): number {
  return characterId ? (order as string[]).indexOf(characterId) + 1 : 0;
}

const resetAt = new Map<string, number>();

function setProp(p: Player, key: string, v: number): void {
  try {
    if (p.getProperty(key) !== v) p.setProperty(key, v);
  } catch {
    /* property missing (pack not applied) */
  }
}

export function showCharacter(p: Player, characterId: string | null): void {
  setProp(p, "noct:char", charIndex(characterId));
}

export function playAnim(p: Player, name: AnimName, holdSeconds?: number): void {
  const code = ANIM[name];
  let cur = 0;
  try {
    cur = (p.getProperty("noct:anim") as number) ?? 0;
  } catch {
    return;
  }
  // Re-trigger the same animation: drop to 0 for a tick so the controller re-enters the state.
  if (cur === code) {
    setProp(p, "noct:anim", 0);
    system.run(() => p.isValid && playAnim(p, name, holdSeconds));
    return;
  }
  setProp(p, "noct:anim", code);
  const ticks = Math.round((holdSeconds ?? HOLD[name] ?? 0.4) * 20);
  const at = system.currentTick + ticks;
  resetAt.set(p.id, at);
  system.runTimeout(() => {
    if (!p.isValid || resetAt.get(p.id) !== at) return;
    setProp(p, "noct:anim", 0);
  }, ticks);
}
