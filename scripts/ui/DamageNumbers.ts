/**
 * Floating damage numbers (replaces vanilla hurt feedback). Small for normal
 * hits, bold gold for crits, labeled for reactions ("MELT\n18,420"). A per-
 * player and global budget keeps phones smooth.
 */
import { system, world, type Dimension, type Entity, type Vector3 } from "@minecraft/server";
import type { Session } from "../runtime/Session";

const PER_PLAYER = 6;
const GLOBAL = 36;
const LIFE = 16;
const alive: { e: Entity; owner: string; until: number; vy: number }[] = [];

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

export function spawnDamageNumber(s: Session, dim: Dimension, at: Vector3, fx: DamageFx): void {
  if (!s.profile.settings.damageNumbers) return;
  const t = system.currentTick;
  if (alive.length >= GLOBAL || alive.filter((a) => a.owner === s.id).length >= PER_PLAYER) return;
  try {
    const pos = { x: at.x + (Math.random() - 0.5) * 0.8, y: at.y + 1.6 + Math.random() * 0.4, z: at.z + (Math.random() - 0.5) * 0.8 };
    const e = dim.spawnEntity("noct:dmg_text", pos);
    e.nameTag = formatDamage(fx, s.profile.settings.damageNumberSize);
    alive.push({ e, owner: s.id, until: t + (fx.crit || fx.reaction ? LIFE + 6 : LIFE), vy: fx.crit ? 0.09 : 0.06 });
  } catch {
    /* unloaded chunk */
  }
}

export function registerDamageNumbers(): void {
  // Remove leftovers from a previous server run.
  system.run(() => {
    for (const id of ["overworld", "nether", "the_end"]) {
      try {
        for (const e of world.getDimension(id).getEntities({ type: "noct:dmg_text" })) e.remove();
      } catch {
        /* ignore */
      }
    }
  });
  system.runInterval(() => {
    const t = system.currentTick;
    for (let i = alive.length - 1; i >= 0; i--) {
      const a = alive[i];
      if (!a.e.isValid || t >= a.until) {
        try {
          if (a.e.isValid) a.e.remove();
        } catch {
          /* ignore */
        }
        alive.splice(i, 1);
        continue;
      }
      try {
        const l = a.e.location;
        a.e.teleport({ x: l.x, y: l.y + a.vy * 2, z: l.z });
        a.vy *= 0.85;
      } catch {
        /* ignore */
      }
    }
  }, 2);
}
