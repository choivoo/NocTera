/**
 * Floating damage numbers with an entity POOL (no spawn/remove per hit):
 *  - expired numbers are hidden (empty name) and reused by the next hit;
 *  - hits on the same target within 4 ticks COALESCE into one number (boss multi-hit
 *    and fields no longer spam entities);
 *  - live count per player follows the Graphics preset (3 / 6 / 10), lifetime scales too;
 *  - idle pooled entities are removed after 10 s (TTL), leftovers are cleaned at boot.
 */
import { system, world, type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { GRAPHICS } from "../audio/Fx";
import { guarded } from "../core/ErrorLog";

const GLOBAL_CAP = 36;
const BASE_LIFE = 16;
const COALESCE_TICKS = 4;
const IDLE_TTL = 200;

interface Slot {
  e: Entity;
  owner: string;
  until: number; // 0 = idle
  idleSince: number;
  vy: number;
  targetId: string | null;
  lastHit: number;
  total: number;
  fx: DamageFx | null;
}
const slots: Slot[] = [];
export const dmgStats = { spawned: 0, reused: 0, coalesced: 0, dropped: 0 };

export interface DamageFx {
  amount: number;
  crit: boolean;
  reaction: string | null;
  element: string | null;
  kind: "hit" | "heal" | "break" | "text";
}

const EL_COLOR: Record<string, string> = { IGNIS: "§c", GLACIA: "§b", VOLT: "§e", AER: "§a", LUX: "§f", UMBRA: "§d" };

export function formatDamage(fx: DamageFx, size: 0 | 1 | 2): string {
  const n = Math.round(fx.amount).toLocaleString("en-US");
  if (fx.kind === "heal") return `§a+${n}`;
  if (fx.kind === "break") return "§e§lBREAK";
  const col = fx.element ? EL_COLOR[fx.element] ?? "§f" : "§f";
  const num = fx.crit ? `§6§l${size > 0 ? "✦" : ""}${n}` : `${col}${n}`;
  if (fx.reaction && size > 0) return `§d§l${fx.reaction}\n${num}`;
  return size === 2 && fx.crit ? `§6§l${n}!` : num;
}

export function spawnDamageNumber(s: Session, dim: Dimension, at: Vector3, fx: DamageFx, targetId: string | null = null): void {
  if (!s.profile.settings.damageNumbers) return;
  const t = system.currentTick;
  const g = GRAPHICS[s.profile.settings.graphics] ?? GRAPHICS.BALANCED;
  const size = s.profile.settings.damageNumberSize;
  // Coalesce rapid hits on the same target (numbers add up instead of stacking entities).
  if (targetId && fx.kind === "hit") {
    const c = slots.find((x) => x.owner === s.id && x.until > t && x.targetId === targetId && t - x.lastHit <= COALESCE_TICKS && x.fx?.kind === "hit");
    if (c && c.e.isValid) {
      c.total += fx.amount;
      c.lastHit = t;
      c.fx = { ...fx, amount: c.total, crit: c.fx!.crit || fx.crit, reaction: fx.reaction ?? c.fx!.reaction };
      c.until = t + Math.round(BASE_LIFE * g.fxLifetime);
      c.e.nameTag = formatDamage(c.fx, size);
      dmgStats.coalesced++;
      return;
    }
  }
  const live = slots.filter((x) => x.owner === s.id && x.until > t).length;
  if (live >= g.dmgNumbers || slots.filter((x) => x.until > t).length >= GLOBAL_CAP) {
    dmgStats.dropped++;
    return;
  }
  const pos = { x: at.x + (Math.random() - 0.5) * 0.8, y: at.y + 1.6 + Math.random() * 0.4, z: at.z + (Math.random() - 0.5) * 0.8 };
  let slot = slots.find((x) => x.until === 0 && x.e.isValid && x.e.dimension.id === dim.id);
  try {
    if (slot) {
      slot.e.teleport(pos);
      dmgStats.reused++;
    } else {
      const e = dim.spawnEntity("noct:dmg_text", pos);
      slot = { e, owner: s.id, until: 0, idleSince: t, vy: 0, targetId: null, lastHit: t, total: 0, fx: null };
      slots.push(slot);
      dmgStats.spawned++;
    }
  } catch {
    return; // unloaded chunk
  }
  slot.owner = s.id;
  slot.until = t + Math.round((fx.crit || fx.reaction ? BASE_LIFE + 6 : BASE_LIFE) * g.fxLifetime);
  slot.vy = fx.crit ? 0.09 : 0.06;
  slot.targetId = targetId;
  slot.lastHit = t;
  slot.total = fx.amount;
  slot.fx = fx;
  slot.e.nameTag = formatDamage(fx, size);
}

export function poolSize(): { total: number; live: number } {
  const t = system.currentTick;
  return { total: slots.length, live: slots.filter((x) => x.until > t).length };
}

export function registerDamageNumbers(): void {
  system.run(() => {
    for (const id of ["overworld", "nether", "the_end"]) {
      try {
        for (const e of world.getDimension(id).getEntities({ type: "noct:dmg_text" })) e.remove();
      } catch {
        /* ignore */
      }
    }
  });
  system.runInterval(
    guarded("damage-numbers", () => {
      const t = system.currentTick;
      for (let i = slots.length - 1; i >= 0; i--) {
        const a = slots[i];
        if (!a.e.isValid) {
          slots.splice(i, 1);
          continue;
        }
        if (a.until > 0 && t >= a.until) {
          a.until = 0;
          a.idleSince = t;
          a.e.nameTag = "";
          continue;
        }
        if (a.until === 0) {
          if (t - a.idleSince > IDLE_TTL) {
            a.e.remove();
            slots.splice(i, 1);
          }
          continue;
        }
        const l = a.e.location;
        a.e.teleport({ x: l.x, y: l.y + a.vy * 2, z: l.z });
        a.vy *= 0.85;
      }
    }),
    2,
  );
}
