/** Astera region: origin, Nexus Beacons (teleport / heal / unlock) and enemy zones. */
import { system, world, type Dimension, type Vector3 } from "@minecraft/server";
import astera from "../../database/world/astera.json";
import { game } from "../runtime/Game";
import type { Session } from "../runtime/Session";
import { enemies } from "../combat/EnemyRuntime";
import { dist } from "../core/Vec";
import { particle, sound } from "../audio/Fx";
import { Enemies } from "../data/registry";
import { logger } from "../core/Logger";
import { groupSize } from "../coop/CoopManager";
import { guarded } from "../core/ErrorLog";

const log = logger("world");
export const Region = astera;
export type BeaconDef = (typeof astera.beacons)[number];

export function origin(): Vector3 {
  const v = world.getDynamicProperty("noct:origin");
  if (v && typeof v === "object") return v as Vector3;
  const sp = world.getDefaultSpawnLocation();
  return { x: sp.x, y: sp.y > 320 ? 64 : sp.y, z: sp.z };
}

export function setOrigin(v: Vector3): void {
  world.setDynamicProperty("noct:origin", { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) });
  world.setDynamicProperty("noct:city_built", undefined);
  invalidateWorldCache();
}

function overworld(): Dimension {
  return world.getDimension("overworld");
}

/** Resolves a region offset to a standable surface position (falls back to origin height). */
// Surface heights are cached (per column) so proximity checks stay cheap on phones.
const heightCache = new Map<string, { y: number; at: number }>();
let originCache: { v: Vector3; at: number } | null = null;

export function invalidateWorldCache(): void {
  heightCache.clear();
  originCache = null;
}

export function resolve(offset: number[] | readonly number[], dim: Dimension = overworld()): Vector3 {
  const now = system.currentTick;
  if (!originCache || now - originCache.at > 200) originCache = { v: origin(), at: now };
  const o = originCache.v;
  const x = o.x + offset[0] + 0.5;
  const z = o.z + offset[2] + 0.5;
  const key = `${Math.floor(x)},${Math.floor(z)}`;
  const c = heightCache.get(key);
  if (c && now - c.at < 1200) return { x, y: c.y, z };
  try {
    const top = dim.getTopmostBlock({ x, z });
    if (top) {
      heightCache.set(key, { y: top.location.y + 1, at: now });
      return { x, y: top.location.y + 1, z };
    }
  } catch {
    /* chunk not loaded */
  }
  return { x, y: o.y + offset[1], z };
}

export function beacon(id: string): BeaconDef | undefined {
  return astera.beacons.find((b) => b.id === id);
}

export function unlockedBeacons(s: Session): BeaconDef[] {
  return astera.beacons.filter((b) => b.unlockedByDefault || s.profile.unlockedBeacons.includes(b.id));
}

export function teleportToBeacon(s: Session, id: string): boolean {
  const b = beacon(id);
  if (!b || !unlockedBeacons(s).includes(b)) return false;
  const p = s.player;
  try {
    p.camera.fade({ fadeTime: { fadeInTime: 0.3, holdTime: 0.4, fadeOutTime: 0.5 }, fadeColor: { red: 0.02, green: 0.02, blue: 0.08 } });
  } catch {
    /* ignore */
  }
  system.runTimeout(() => {
    if (!p.isValid) return;
    p.teleport(resolve(b.offset), { dimension: overworld() });
    healParty(s);
    sound(p, "nocterra.beacon");
  }, 6);
  return true;
}

export function returnToBeacon(s: Session): void {
  const last = (s.profile.story.flags as Record<string, any>).lastBeacon as string | undefined;
  teleportToBeacon(s, last && beacon(last) ? last : "astera_city");
}

export function healParty(s: Session): void {
  const t = system.currentTick;
  for (const rt of s.chars.values()) rt.hp = s.stats(rt.id, t).maxHp;
}

type BeaconListener = (s: Session, id: string) => void;
const beaconListeners: BeaconListener[] = [];
export function onBeaconActivated(fn: BeaconListener): void {
  beaconListeners.push(fn);
}

/** Once per second: beacon proximity (unlock/heal), beacon FX, zone spawning. */
function worldTick(): void {
  const t = system.currentTick;
  const g = game();
  for (const s of g.sessions.values()) {
    const p = s.player;
    if (p.dimension.id !== "minecraft:overworld") continue;
    for (const b of astera.beacons) {
      const pos = resolve(b.offset, p.dimension);
      const d = dist(p.location, pos);
      if (d < 40 && t % 40 === 0) {
        for (let y = 0; y < 4; y++) particle(p.dimension, "noct:beacon", { x: pos.x, y: pos.y + y, z: pos.z });
      }
      if (d > 3) continue;
      const flags = s.profile.story.flags as Record<string, any>;
      const fresh = !b.unlockedByDefault && !s.profile.unlockedBeacons.includes(b.id);
      if (fresh) {
        s.profile.unlockedBeacons.push(b.id);
        p.onScreenDisplay.setTitle("§bNEXUS BEACON", { subtitle: `§f${b.name} 활성화`, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
        sound(p, "nocterra.beacon");
        g.save.saveNow(s.id);
      }
      if (flags.lastBeacon !== b.id) {
        flags.lastBeacon = b.id;
        g.save.markDirty(s.id);
      }
      if (fresh || t % 100 === 0) healParty(s);
      for (const fn of beaconListeners) fn(s, b.id);
    }
  }
  spawnTick(t);
}

const zoneCooldown = new Map<string, number>();

function spawnTick(t: number): void {
  const g = game();
  if (g.sessions.size === 0) return;
  const dim = overworld();
  for (const z of astera.zones) {
    const center = resolve(z.offset, dim);
    let nearest: Session | undefined;
    for (const s of g.sessions.values()) if (dist(s.player.location, center) < 48) nearest = s;
    if (!nearest) continue;
    if ((zoneCooldown.get(z.id) ?? 0) > t) continue;
    let live = 0;
    try {
      live = dim.getEntities({ location: center, maxDistance: z.radius + 16, families: ["noct_enemy"], tags: [`zone:${z.id}`] }).length;
    } catch {
      continue;
    }
    if (live >= z.cap) continue;
    const id = z.enemies[Math.floor(Math.random() * z.enemies.length)];
    const def = Enemies.get(id);
    if (!def) continue;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * z.radius;
    const pos = resolve([z.offset[0] + Math.cos(a) * r, 0, z.offset[2] + Math.sin(a) * r], dim);
    try {
      const e = dim.spawnEntity(def.entity, pos);
      e.addTag(`zone:${z.id}`);
      enemies.register(e, 1 + (nearest.profile.nexusRank - 1) * 0.06);
      particle(dim, "noct:rift", { x: pos.x, y: pos.y + 1, z: pos.z }, 4);
    } catch (err) {
      log.warn(`spawn ${def.entity} failed: ${err}`);
    }
    zoneCooldown.set(z.id, t + Math.max(40, Math.round(z.respawnTicks / z.cap)));
  }
}

export function spawnBoss(id: string, s: Session): boolean {
  const b = astera.bosses.find((x) => x.id === id);
  const def = Enemies.get(id);
  if (!def) return false;
  const dim = s.player.dimension;
  const pos = b ? resolve(b.offset, dim) : { x: s.player.location.x + 6, y: s.player.location.y, z: s.player.location.z };
  // Reconnect / re-present guard: never spawn a second copy of a live boss.
  if (enemies.findBoss(id, pos)) return true;
  try {
    for (const ex of dim.getEntities({ type: def.entity, location: pos, maxDistance: 64 })) {
      enemies.register(ex);
      return true;
    }
  } catch {
    /* unloaded */
  }
  const e = dim.spawnEntity(def.entity, pos);
  e.addTag("boss");
  const players = Math.max(groupSize(s), [...game().sessions.values()].filter((x) => dist(x.player.location, pos) < 64).length);
  enemies.register(e, 1 + Math.max(0, players - 1) * 0.6 + (s.profile.nexusRank - 1) * 0.05);
  return true;
}

export function registerWorld(): void {
  system.runInterval(guarded("world.tick", worldTick), 20);
}
