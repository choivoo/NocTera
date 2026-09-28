/**
 * CutsceneManager: keyframed camera (position/facing/easing), fades,
 * subtitles, sounds and particles on a tick timeline.
 */
import { EasingType, system, type Player, type Vector3 } from "@minecraft/server";
import { particle, sound } from "../audio/Fx";

export interface Keyframe {
  at: number; // tick offset
  camera?: { pos: Vector3; facing: Vector3; ease?: number; easeType?: EasingType };
  fade?: { in: number; hold: number; out: number; color?: [number, number, number] };
  title?: string;
  subtitle?: string;
  actionbar?: string;
  sound?: string;
  particle?: { id: string; pos: Vector3; count?: number };
  run?: () => void;
}

const playing = new Map<string, number>();

export function isPlaying(player: Player): boolean {
  return (playing.get(player.id) ?? 0) > system.currentTick;
}

/** Plays keyframes; returns a promise resolved when the cutscene ends. Camera is always restored. */
export function playCutscene(player: Player, frames: Keyframe[], length: number): Promise<void> {
  playing.set(player.id, system.currentTick + length);
  for (const k of frames) {
    system.runTimeout(() => {
      if (!player.isValid) return;
      try {
        if (k.fade) player.camera.fade({ fadeTime: { fadeInTime: k.fade.in, holdTime: k.fade.hold, fadeOutTime: k.fade.out }, fadeColor: { red: k.fade.color?.[0] ?? 0, green: k.fade.color?.[1] ?? 0, blue: k.fade.color?.[2] ?? 0 } });
        if (k.camera)
          player.camera.setCamera("minecraft:free", {
            location: k.camera.pos,
            facingLocation: k.camera.facing,
            easeOptions: k.camera.ease ? { easeTime: k.camera.ease, easeType: k.camera.easeType ?? EasingType.InOutSine } : undefined,
          });
      } catch {
        /* camera API unavailable on this client */
      }
      if (k.title !== undefined || k.subtitle !== undefined)
        player.onScreenDisplay.setTitle(k.title ?? " ", { subtitle: k.subtitle ?? "", fadeInDuration: 6, stayDuration: 40, fadeOutDuration: 10 });
      if (k.actionbar) player.onScreenDisplay.setActionBar(k.actionbar);
      if (k.sound) sound(player, k.sound);
      if (k.particle) particle(player.dimension, k.particle.id, k.particle.pos, k.particle.count ?? 1);
      k.run?.();
    }, Math.max(1, k.at));
  }
  return new Promise((res) =>
    system.runTimeout(() => {
      playing.delete(player.id);
      try {
        if (player.isValid) player.camera.clear();
      } catch {
        /* ignore */
      }
      res();
    }, length),
  );
}

/** Orbit helper: a point on a circle around `c` at angle (deg) and radius/height. */
export function orbit(c: Vector3, deg: number, radius: number, height: number): Vector3 {
  const a = (deg * Math.PI) / 180;
  return { x: c.x + Math.cos(a) * radius, y: c.y + height, z: c.z + Math.sin(a) * radius };
}
