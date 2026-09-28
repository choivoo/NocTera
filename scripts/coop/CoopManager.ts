/**
 * Co-op groups (max 4 players). Character allowance per player:
 *   1 player → 4 characters · 2 players → 2 each · 3–4 players → 1 each.
 * Groups are session state; the membership id is saved so a reconnect rejoins.
 */
import type { Session } from "../runtime/Session";
import { game } from "../runtime/Game";
import { dist } from "../core/Vec";

export const MAX_GROUP = 4;
const groups = new Map<string, Set<string>>(); // groupId → playerIds

export function groupOf(s: Session): Set<string> | null {
  const id = s.profile.coop.groupId;
  return id ? groups.get(id) ?? null : null;
}

export function groupSize(s: Session): number {
  const g = groupOf(s);
  if (!g) return 1;
  return [...g].filter((pid) => game().sessions.has(pid)).length || 1;
}

export function characterAllowance(size: number): number {
  return size <= 1 ? 4 : size === 2 ? 2 : 1;
}

/** Party slots this player may field right now (active slot always first). */
export function allowedSlots(s: Session): number[] {
  const n = characterAllowance(groupSize(s));
  const filled = s.profile.party.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  if (n >= filled.length) return filled;
  const order = [s.profile.activeSlot, ...filled.filter((i) => i !== s.profile.activeSlot)];
  return order.slice(0, n);
}

export function createGroup(s: Session): string {
  leaveGroup(s);
  const id = `g${s.id}`;
  groups.set(id, new Set([s.id]));
  s.profile.coop.groupId = id;
  return id;
}

export type JoinError = "full" | "none_nearby";

/** Joins the nearest group within 12 blocks. */
export function joinNearby(s: Session): JoinError | string {
  let best: string | null = null;
  let bd = Infinity;
  for (const other of game().sessions.values()) {
    if (other === s || !other.profile.coop.groupId) continue;
    const g = groups.get(other.profile.coop.groupId);
    if (!g) continue;
    const d = dist(other.player.location, s.player.location);
    if (d < 12 && d < bd) (bd = d), (best = other.profile.coop.groupId);
  }
  if (!best) return "none_nearby";
  const g = groups.get(best)!;
  if (g.size >= MAX_GROUP) return "full";
  leaveGroup(s);
  g.add(s.id);
  s.profile.coop.groupId = best;
  return best;
}

export function leaveGroup(s: Session): void {
  const id = s.profile.coop.groupId;
  if (!id) return;
  groups.get(id)?.delete(s.id);
  if (groups.get(id)?.size === 0) groups.delete(id);
  s.profile.coop.groupId = null;
}

/** On login: restore membership if the group still exists, else clear it. */
export function restoreGroup(s: Session): void {
  const id = s.profile.coop.groupId;
  if (!id) return;
  const g = groups.get(id);
  if (g && g.size < MAX_GROUP) g.add(s.id);
  else s.profile.coop.groupId = null;
}

export function groupMembers(s: Session): Session[] {
  const g = groupOf(s);
  if (!g) return [s];
  return [...g].map((pid) => game().sessions.get(pid)).filter((x): x is Session => !!x);
}
