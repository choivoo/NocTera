/** Element auras and reactions (pure). Balance numbers live in database/elements/reactions.json. */
import type { ElementId, ReactionDef } from "../data/types";
import { Reactions } from "../data/registry";

export interface Aura {
  element: ElementId;
  expiresAt: number; // tick
}

export function findReaction(existing: ElementId, incoming: ElementId, table: ReactionDef[] = Reactions): ReactionDef | null {
  if (existing === incoming) return null;
  for (const r of table) {
    const [a, b] = r.pair;
    if (b === "*") {
      // Wildcard (SPREAD): the wildcard element must hit/sit with any *other* element.
      if (incoming === a && existing !== a) return r;
      if (existing === a && incoming !== a) return r;
      continue;
    }
    if ((a === existing && b === incoming) || (a === incoming && b === existing)) return r;
  }
  return null;
}

export interface ApplyResult {
  reaction: ReactionDef | null;
  /** Element that sits on the target after this hit. */
  aura: Aura | null;
  /** The element that was consumed (useful for SPREAD, which spreads it). */
  consumed: ElementId | null;
}

/** Applies `incoming` onto a target currently holding `aura` at tick `now`. */
export function applyElement(aura: Aura | null, incoming: ElementId | null, now: number, auraTicks: number): ApplyResult {
  const live = aura && aura.expiresAt > now ? aura : null;
  if (!incoming) return { reaction: null, aura: live, consumed: null };
  if (!live) return { reaction: null, aura: { element: incoming, expiresAt: now + auraTicks }, consumed: null };
  const reaction = findReaction(live.element, incoming);
  if (!reaction) return { reaction: null, aura: { element: incoming, expiresAt: now + auraTicks }, consumed: null };
  return { reaction, aura: reaction.consumes ? null : live, consumed: live.element };
}
