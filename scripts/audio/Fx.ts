/**
 * Particle / sound indirection. Game code references logical NOCTERRA ids
 * (noct:frost_burst, noct.hit.slash); this table maps them to what currently
 * exists. Entries marked REPLACE_ME point at vanilla placeholders until the
 * custom RP particle/sound assets land. A per-tick particle budget protects
 * low-end phones.
 */
import { system, type Dimension, type Player, type Vector3 } from "@minecraft/server";
import { Config } from "../data/registry";

// REPLACE_ME: swap to custom noct:* particles as RP assets are authored.
const PARTICLES: Record<string, string> = {
  "noct:slash_arc": "minecraft:critical_hit_emitter",
  "noct:frost_burst": "minecraft:snowflake_particle",
  "noct:ice_trail": "minecraft:snowflake_particle",
  "noct:giant_ice_sword": "minecraft:huge_explosion_emitter",
  "noct:fire_burst": "minecraft:lava_particle",
  "noct:solar_blast": "minecraft:huge_explosion_emitter",
  "noct:light_orb": "minecraft:villager_happy",
  "noct:halo": "minecraft:totem_particle",
  "noct:eden": "minecraft:totem_particle",
  "noct:void_slash": "minecraft:portal_reverse_particle",
  "noct:shadow_puff": "minecraft:large_smoke_particle",
  "noct:void_field": "minecraft:portal_directional",
  "noct:spark_tracer": "minecraft:electric_spark_particle",
  "noct:spark_burst": "minecraft:electric_spark_particle",
  "noct:drone_deploy": "minecraft:electric_spark_particle",
  "noct:cyclone": "minecraft:wind_explosion_emitter",
  "noct:tempest": "minecraft:wind_explosion_emitter",
  "noct:ice_tracer": "minecraft:snowflake_particle",
  "noct:ice_burst": "minecraft:snowflake_particle",
  "noct:scope": "minecraft:end_chest",
  "noct:shield": "minecraft:totem_particle",
  "noct:lightning": "minecraft:electric_spark_particle",
  "noct:switch_out": "minecraft:end_chest",
  "noct:switch_in": "minecraft:totem_particle",
  "noct:telegraph": "minecraft:villager_angry",
  "noct:perfect_dodge": "minecraft:sonic_explosion",
  "noct:break": "minecraft:critical_hit_emitter",
  "noct:reaction": "minecraft:crop_growth_emitter",
  "noct:rift": "minecraft:portal_reverse_particle",
  "noct:gacha_blue": "minecraft:blue_flame_particle",
  "noct:gacha_purple": "minecraft:dragon_breath_trail",
  "noct:gacha_gold": "minecraft:totem_particle",
  "noct:beacon": "minecraft:end_chest",
  "noct:heal": "minecraft:heart_particle",
};

// REPLACE_ME: custom noct.* sound events in NOCTERRA_RP/sounds/sound_definitions.json.
const SOUNDS: Record<string, string> = {
  "noct.hit.slash": "random.hurt",
  "noct.hit.heavy": "mob.irongolem.hit",
  "noct.hit.magic": "mob.evocation_illager.cast_spell",
  "noct.hit.shot": "crossbow.shoot",
  "noct.hit.rifle": "firework.blast",
  "noct.hit.punch": "mob.player.hurt",
  "noct.skill": "mob.evocation_illager.prepare_attack",
  "noct.ultimate": "mob.enderdragon.growl",
  "noct.switch": "item.trident.return",
  "noct.dodge": "mob.phantom.swoop",
  "noct.perfect": "block.bell.hit",
  "noct.telegraph": "mob.ravager.roar",
  "noct.break": "random.anvil_land",
  "noct.reaction": "random.orb",
  "noct.levelup": "random.levelup",
  "noct.gacha.charge": "block.beacon.activate",
  "noct.gacha.gold": "ui.toast.challenge_complete",
  "noct.gacha.purple": "block.end_portal.spawn",
  "noct.gacha.blue": "block.amethyst_block.chime",
  "noct.ui.open": "item.book.page_turn",
  "noct.ui.confirm": "random.click",
  "noct.beacon": "block.beacon.power_select",
};

let budget = 0;
let budgetTick = -1;

function resolveSound(id: string): string {
  if (SOUNDS[id]) return SOUNDS[id];
  // Character sounds (noct.seria.skill) fall back to generic slot sounds.
  const slot = id.split(".").pop() ?? "";
  if (slot === "skill") return SOUNDS["noct.skill"];
  if (slot === "ultimate") return SOUNDS["noct.ultimate"];
  if (slot === "attack") return SOUNDS["noct.hit.slash"];
  return "random.click";
}

export function particle(dim: Dimension, id: string, at: Vector3, count = 1): void {
  if (budgetTick !== system.currentTick) {
    budgetTick = system.currentTick;
    budget = Config.performance.particleBudgetPerTick;
  }
  const real = PARTICLES[id] ?? id;
  for (let i = 0; i < count && budget > 0; i++, budget--) {
    try {
      dim.spawnParticle(real, count === 1 ? at : { x: at.x + (Math.random() - 0.5) * 1.5, y: at.y + Math.random(), z: at.z + (Math.random() - 0.5) * 1.5 });
    } catch {
      /* unloaded chunk — ignore */
    }
  }
}

export function ring(dim: Dimension, id: string, center: Vector3, radius: number, points = 12): void {
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    particle(dim, id, { x: center.x + Math.cos(a) * radius, y: center.y + 0.2, z: center.z + Math.sin(a) * radius });
  }
}

export function sound(player: Player, id: string, pitch = 1, volume = 1): void {
  try {
    player.playSound(resolveSound(id), { pitch, volume });
  } catch {
    /* player left */
  }
}

export function worldSound(dim: Dimension, id: string, at: Vector3, pitch = 1): void {
  try {
    dim.playSound(resolveSound(id), at, { pitch, volume: 1 });
  } catch {
    /* ignore */
  }
}
