/**
 * Astera City: builds a plaza at the region origin (once, when a player is
 * near so chunks are loaded), places the facility NPCs, and raises light
 * pillars at Nexus Beacons as players approach them. NPC taps open menus.
 */
import { BlockVolume, system, world, type Dimension } from "@minecraft/server";
import npcs from "../../database/world/npcs.json";
import { Region, origin, resolve } from "./World";
import { game } from "../runtime/Game";
import { dist } from "../core/Vec";
import { logger } from "../core/Logger";
import { openFor } from "../ui/Menus";
import { sound } from "../audio/Fx";

const log = logger("city");
type CityCfg = { plazaRadius: number; floor: string; trim: string; light: string; pillar: string };
const CITY = (Region as unknown as { city: CityCfg }).city;

function fill(dim: Dimension, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, block: string): void {
  dim.fillBlocks(new BlockVolume(a, b), block);
}

export function buildPlaza(dim: Dimension): boolean {
  const o = origin();
  const r = CITY.plazaRadius;
  const y = Math.floor(o.y) - 1;
  try {
    fill(dim, { x: o.x - r, y, z: o.z - r }, { x: o.x + r, y, z: o.z + r }, CITY.floor);
    fill(dim, { x: o.x - r, y: y + 1, z: o.z - r }, { x: o.x + r, y: y + 5, z: o.z + r }, "minecraft:air");
    // Trim ring + cross paths
    fill(dim, { x: o.x - r, y, z: o.z - r }, { x: o.x + r, y, z: o.z - r }, CITY.trim);
    fill(dim, { x: o.x - r, y, z: o.z + r }, { x: o.x + r, y, z: o.z + r }, CITY.trim);
    fill(dim, { x: o.x - r, y, z: o.z - r }, { x: o.x - r, y, z: o.z + r }, CITY.trim);
    fill(dim, { x: o.x + r, y, z: o.z - r }, { x: o.x + r, y, z: o.z + r }, CITY.trim);
    fill(dim, { x: o.x - r, y, z: o.z }, { x: o.x + r, y, z: o.z }, CITY.trim);
    fill(dim, { x: o.x, y, z: o.z - r }, { x: o.x, y, z: o.z + r }, CITY.trim);
    // Lamp posts at the corners
    for (const [dx, dz] of [[-r + 2, -r + 2], [r - 2, -r + 2], [-r + 2, r - 2], [r - 2, r - 2]]) {
      fill(dim, { x: o.x + dx, y: y + 1, z: o.z + dz }, { x: o.x + dx, y: y + 3, z: o.z + dz }, CITY.pillar);
      fill(dim, { x: o.x + dx, y: y + 4, z: o.z + dz }, { x: o.x + dx, y: y + 4, z: o.z + dz }, CITY.light);
    }
    // Central Nexus Beacon dais
    fill(dim, { x: o.x - 1, y, z: o.z - 1 }, { x: o.x + 1, y, z: o.z + 1 }, CITY.light);
    return true;
  } catch (e) {
    log.warn(`plaza build deferred: ${e}`);
    return false;
  }
}

function spawnNpcs(dim: Dimension): void {
  for (const e of dim.getEntities({ type: "noct:npc" })) e.remove();
  npcs.forEach((n, i) => {
    const pos = resolve(n.offset, dim);
    try {
      const e = dim.spawnEntity("noct:npc", pos);
      e.nameTag = `§l${n.nameKo}\n§r§7${n.name}`;
      e.addTag(`npc:${n.opens}`);
      e.setProperty("noct:look", i);
    } catch (err) {
      log.warn(`npc ${n.id}: ${err}`);
    }
  });
}

const pillarsBuilt = new Set<string>();
function beaconPillar(dim: Dimension, id: string, offset: number[]): void {
  if (pillarsBuilt.has(id) || world.getDynamicProperty(`noct:pillar:${id}`)) return;
  const at = resolve(offset, dim);
  try {
    const x = Math.floor(at.x), y = Math.floor(at.y) - 1, z = Math.floor(at.z);
    fill(dim, { x: x - 1, y, z: z - 1 }, { x: x + 1, y, z: z + 1 }, CITY.pillar);
    fill(dim, { x, y, z }, { x, y, z }, CITY.light);
    pillarsBuilt.add(id);
    world.setDynamicProperty(`noct:pillar:${id}`, true);
  } catch {
    /* not loaded yet */
  }
}

function cityTick(): void {
  const g = game();
  const dim = world.getDimension("overworld");
  const o = origin();
  for (const s of g.sessions.values()) {
    if (s.player.dimension.id !== "minecraft:overworld") continue;
    if (!world.getDynamicProperty("noct:city_built") && dist(s.player.location, o) < 40) {
      if (buildPlaza(dim)) {
        world.setDynamicProperty("noct:city_built", true);
        system.runTimeout(() => spawnNpcs(dim), 10);
        log.info("Astera City plaza built");
      }
    }
    for (const b of Region.beacons) {
      if (b.id === "astera_city") continue;
      if (dist(s.player.location, resolve(b.offset, dim)) < 32) beaconPillar(dim, b.id, b.offset);
    }
  }
}

export function respawnNpcs(): void {
  spawnNpcs(world.getDimension("overworld"));
}

export function registerCity(): void {
  system.runInterval(cityTick, 40);
  world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
    if (target.typeId !== "noct:npc") return;
    const tag = target.getTags().find((t: string) => t.startsWith("npc:"));
    const s = game().session(player);
    if (!s || !tag) return;
    sound(player, "noct.ui.open");
    void openFor(s, tag.slice(4));
  });
}

