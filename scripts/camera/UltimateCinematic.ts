/**
 * Per-character ultimate cinematics from database/art/cinematics.json:
 * tinted flash, camera shots relative to the caster's facing, particles,
 * rings, shakes and the title card. Returns the impact tick offset.
 * Capped at 3 s so combat flow never stalls.
 */
import { EasingType, system, type Vector3 } from "@minecraft/server";
import cinematics from "../../database/art/cinematics.json";
import type { Session } from "../runtime/Session";
import { flatDir } from "../core/Vec";
import { particle, ring, sound } from "../audio/Fx";
import { shake } from "../combat/CombatRuntime";

interface Shot {
  at: number;
  fade?: number[];
  tint?: number[];
  cam?: number[];
  look?: number[];
  ease?: number;
  sound?: string;
  title?: string;
  particles?: [string, number[], number][];
  ring?: [string, number[], number];
  shake?: number;
}
interface Cinematic {
  length: number;
  impact: number;
  shots: Shot[];
}
const DATA = cinematics as unknown as Record<string, Cinematic>;

export function playUltimateCinematic(s: Session, characterId: string): number {
  const c = DATA[characterId];
  if (!c) return 14;
  const p = s.player;
  const origin = { ...p.location };
  const f = flatDir(p.getViewDirection());
  const r = { x: -f.z, y: 0, z: f.x };
  const at = (o: number[]): Vector3 => ({ x: origin.x + r.x * o[0] + f.x * o[2], y: origin.y + o[1], z: origin.z + r.z * o[0] + f.z * o[2] });
  const cinematicOn = s.profile.settings.ultCinematic !== false;
  for (const shot of c.shots) {
    system.runTimeout(() => {
      if (!p.isValid) return;
      try {
        if (shot.fade && cinematicOn) p.camera.fade({ fadeTime: { fadeInTime: shot.fade[0], holdTime: shot.fade[1], fadeOutTime: shot.fade[2] }, fadeColor: { red: shot.tint?.[0] ?? 0, green: shot.tint?.[1] ?? 0, blue: shot.tint?.[2] ?? 0 } });
        if (shot.cam && shot.look && cinematicOn) p.camera.setCamera("minecraft:free", { location: at(shot.cam), facingLocation: at(shot.look), easeOptions: { easeTime: shot.ease ?? 0.3, easeType: EasingType.OutCubic } });
      } catch {
        /* camera unsupported */
      }
      if (shot.title) p.onScreenDisplay.setTitle(" ", { subtitle: shot.title, fadeInDuration: 0, stayDuration: 30, fadeOutDuration: 8 });
      if (shot.sound) sound(p, shot.sound);
      for (const [id, o, n] of shot.particles ?? []) particle(p.dimension, id, at(o), n);
      if (shot.ring) ring(p.dimension, shot.ring[0], at(shot.ring[1]), shot.ring[2], 14);
      if (shot.shake && s.profile.settings.cameraShake) shake(s, shot.shake);
    }, Math.max(1, shot.at));
  }
  system.runTimeout(() => {
    try {
      if (p.isValid) p.camera.clear();
    } catch {
      /* ignore */
    }
  }, Math.min(60, c.length));
  return Math.min(c.impact, 50);
}
