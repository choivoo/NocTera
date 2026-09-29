/**
 * Aim Assist 2.0 + Target Lock (mobile).
 * Candidates: tracked hostile NOCTERRA enemies, alive, inside range and a cone
 * in front of the camera, with a clear line of sight (block raycast — no
 * targeting through walls). Score (lower = better):
 *   0.55·angle/maxAngle + 0.35·distance/range − 0.25 if it is the current/locked target.
 * Used by every ranged hit (Rin, Mirel, future ranged characters) and by Target Lock.
 */
import type { Entity, Vector3 } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { enemies } from "./EnemyRuntime";
import { angleTo, dist, sub } from "../core/Vec";

export interface Candidate {
  angle: number;
  distance: number;
  preferred: boolean;
}

export function scoreTarget(c: Candidate, maxAngle: number, range: number): number {
  return 0.55 * (c.angle / Math.max(1, maxAngle)) + 0.35 * (c.distance / Math.max(1, range)) - (c.preferred ? 0.25 : 0);
}

export function eyeOf(s: Session): Vector3 {
  const l = s.player.location;
  return { x: l.x, y: l.y + 1.62, z: l.z };
}

export function hasLineOfSight(s: Session, target: Entity): boolean {
  const from = eyeOf(s);
  const to = { x: target.location.x, y: target.location.y + 1, z: target.location.z };
  const d = sub(to, from);
  const len = Math.hypot(d.x, d.y, d.z);
  if (len < 1.5) return true;
  try {
    const hit = s.player.dimension.getBlockFromRay(from, { x: d.x / len, y: d.y / len, z: d.z / len }, { maxDistance: len - 0.5, includeLiquidBlocks: false, includePassableBlocks: false });
    return !hit;
  } catch {
    return true; // unloaded chunk: don't block the attack
  }
}

export function isValidTarget(e: Entity | undefined): e is Entity {
  if (!e || !e.isValid) return false;
  const st = enemies.state(e);
  return !!st && st.hp > 0;
}

export function pickTarget(s: Session, range: number, maxAngle: number): Entity | undefined {
  if (maxAngle <= 0) return undefined;
  const pos = s.player.location;
  const view = s.player.getViewDirection();
  let best: Entity | undefined;
  let bestScore = Infinity;
  let list: Entity[] = [];
  try {
    list = s.player.dimension.getEntities({ location: pos, maxDistance: range, families: ["noct_enemy"] });
  } catch {
    return undefined;
  }
  for (const e of list) {
    if (!isValidTarget(e)) continue;
    const angle = angleTo(pos, view, e.location);
    if (angle > maxAngle) continue;
    const score = scoreTarget({ angle, distance: dist(pos, e.location), preferred: e.id === s.lockId }, maxAngle, range);
    if (score < bestScore && hasLineOfSight(s, e)) (bestScore = score), (best = e);
  }
  return best;
}

/** Target Lock: acquire / keep / release. Returns the locked entity if any. */
export function updateLock(s: Session): Entity | undefined {
  if (!s.profile.settings.targetLock) {
    s.lockId = null;
    return undefined;
  }
  let locked: Entity | undefined;
  if (s.lockId) {
    try {
      locked = s.player.dimension.getEntities({ location: s.player.location, maxDistance: 24, families: ["noct_enemy"] }).find((e) => e.id === s.lockId);
    } catch {
      locked = undefined;
    }
    if (!isValidTarget(locked) || !hasLineOfSight(s, locked)) {
      s.lockId = null;
      locked = undefined;
    }
  }
  if (!locked) {
    locked = pickTarget(s, 16, 60);
    s.lockId = locked?.id ?? null;
  }
  return locked;
}

/** Camera/attack correction: turns the player toward the locked target (yaw only, pitch softened). */
export function faceTarget(s: Session, target: Entity): void {
  const p = s.player.location;
  const d = sub(target.location, p);
  const yaw = (-Math.atan2(d.x, d.z) * 180) / Math.PI;
  const horiz = Math.hypot(d.x, d.z);
  const pitch = Math.max(-30, Math.min(30, (-Math.atan2(d.y + 0.5 - 1.2, horiz) * 180) / Math.PI));
  try {
    s.player.setRotation({ x: pitch * 0.5, y: yaw });
  } catch {
    /* ignore */
  }
}
