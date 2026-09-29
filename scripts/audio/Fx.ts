/**
 * Particle / sound indirection. Game code references logical NOCTERRA ids
 * (noct:frost_burst, noct.hit.slash); this table maps them to what currently
 * exists. Entries marked REPLACE_ME point at vanilla placeholders until the
 * custom RP particle/sound assets land. A per-tick particle budget protects
 * low-end phones.
 */
import { system, type Dimension, type Player, type Vector3 } from "@minecraft/server";

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
  "noct:shadow_puff": "minecraft:basic_smoke_particle",
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
  "noct:lava_pillar": "minecraft:lava_particle",
};

/** Graphics presets (NOCTERRA's own FX only — Minecraft video settings are never touched). */
export type GraphicsPreset = "PERFORMANCE" | "BALANCED" | "QUALITY";
export const GRAPHICS: Record<GraphicsPreset, { particlesPerSecond: number; dmgNumbers: number; fxLifetime: number; rings: number }> = {
  PERFORMANCE: { particlesPerSecond: 40, dmgNumbers: 3, fxLifetime: 0.6, rings: 0.5 },
  BALANCED: { particlesPerSecond: 80, dmgNumbers: 6, fxLifetime: 1, rings: 1 },
  QUALITY: { particlesPerSecond: 140, dmgNumbers: 10, fxLifetime: 1.3, rings: 1.25 },
};

/** ParticleBudgetManager: a rolling 20-tick window shared by the whole server (the phone renders them all). */
class ParticleBudget {
  preset: GraphicsPreset = "BALANCED";
  private windowStart = -1;
  private used = 0;
  dropped = 0;
  take(n: number): number {
    const t = system.currentTick;
    if (t - this.windowStart >= 20) {
      this.windowStart = t;
      this.used = 0;
    }
    const cap = GRAPHICS[this.preset].particlesPerSecond;
    const ok = Math.max(0, Math.min(n, cap - this.used));
    this.used += ok;
    this.dropped += n - ok;
    return ok;
  }
}
export const particleBudget = new ParticleBudget();

function resolveSound(id: string): string {
  // Legacy noct.* ids resolve to their nocterra.* event.
  return id.startsWith("noct.") ? `nocterra.${id.slice(5)}` : id;
}

export function particle(dim: Dimension, id: string, at: Vector3, count = 1): void {
  const real = PARTICLES[id] ?? id;
  const allowed = particleBudget.take(count);
  for (let i = 0; i < allowed; i++) {
    try {
      dim.spawnParticle(real, count === 1 ? at : { x: at.x + (Math.random() - 0.5) * 1.5, y: at.y + Math.random(), z: at.z + (Math.random() - 0.5) * 1.5 });
    } catch {
      /* unloaded chunk — ignore */
    }
  }
}

export function ring(dim: Dimension, id: string, center: Vector3, radius: number, points = 12): void {
  points = Math.max(4, Math.round(points * GRAPHICS[particleBudget.preset].rings));
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
