/**
 * Character showcase: the player's own avatar becomes the "3D character
 * model" of menus. Camera moves in front of the player, the model switches to
 * the showcased character, plays its Selection Animation with themed FX, then
 * the active character is restored. Used by the character screen, 5★/new
 * reveals and dialogue close-ups.
 */
import { EasingType, system, type Vector3 } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { getCharacter } from "../data/registry";
import { flatDir } from "../core/Vec";
import { playAnim, showCharacter } from "../character/CharacterVisual";
import { particle, ring, sound } from "../audio/Fx";

const THEME: Record<string, string> = { IGNIS: "noct:fire_burst", GLACIA: "noct:frost_burst", VOLT: "noct:spark_burst", AER: "noct:cyclone", LUX: "noct:halo", UMBRA: "noct:void_field" };

export interface ShowcaseOptions {
  ticks?: number;
  title?: string;
  subtitle?: string;
  /** Keep the camera and model after the timeline (caller restores via endShowcase). */
  hold?: boolean;
  close?: boolean;
  anim?: "select" | "victory" | "none";
}

function frontCam(s: Session, dist: number, height: number, side: number): { pos: Vector3; look: Vector3 } {
  const p = s.player.location;
  const f = flatDir(s.player.getViewDirection());
  const r = { x: -f.z, z: f.x };
  return {
    pos: { x: p.x + f.x * dist + r.x * side, y: p.y + height, z: p.z + f.z * dist + r.z * side },
    look: { x: p.x, y: p.y + height - 0.1, z: p.z },
  };
}

export function showcase(s: Session, characterId: string, o: ShowcaseOptions = {}): Promise<void> {
  const p = s.player;
  const def = getCharacter(characterId);
  const ticks = o.ticks ?? 44;
  const speed = Math.max(0.5, s.profile.settings.cameraSensitivity / 100);
  showCharacter(p, characterId);
  if (o.anim !== "none") playAnim(p, o.anim ?? "select", ticks / 20);
  const a = frontCam(s, o.close ? 1.6 : 3.4, o.close ? 1.6 : 1.3, o.close ? 0.2 : 0.9);
  const b = frontCam(s, o.close ? 1.3 : 2.6, o.close ? 1.62 : 1.2, o.close ? -0.2 : -0.6);
  try {
    p.camera.setCamera("minecraft:free", { location: a.pos, facingLocation: a.look, easeOptions: { easeTime: 0.35 / speed, easeType: EasingType.OutCubic } });
    system.runTimeout(() => p.isValid && p.camera.setCamera("minecraft:free", { location: b.pos, facingLocation: b.look, easeOptions: { easeTime: (ticks / 20) * 0.8, easeType: EasingType.InOutSine } }), 8);
  } catch {
    /* camera unsupported */
  }
  if (o.title !== undefined) p.onScreenDisplay.setTitle(o.title, { subtitle: o.subtitle ?? "", fadeInDuration: 4, stayDuration: ticks - 8, fadeOutDuration: 6 });
  system.runTimeout(() => p.isValid && ring(p.dimension, THEME[def.element], p.location, 1.4, 12), 10);
  system.runTimeout(() => p.isValid && particle(p.dimension, THEME[def.element], { x: p.location.x, y: p.location.y + 1.2, z: p.location.z }, 6), 22);
  sound(p, def.sounds.skill, 1.1, 0.6);
  return new Promise((res) =>
    system.runTimeout(() => {
      if (!o.hold) endShowcase(s);
      res();
    }, ticks),
  );
}

export function endShowcase(s: Session): void {
  const p = s.player;
  if (!p.isValid) return;
  showCharacter(p, s.activeId);
  try {
    p.camera.clear();
  } catch {
    /* ignore */
  }
}

/** Quick fade used for menu transitions (kept short so menus never feel slow). */
export function menuTransition(s: Session): void {
  try {
    s.player.camera.fade({ fadeTime: { fadeInTime: 0.06, holdTime: 0, fadeOutTime: 0.18 }, fadeColor: { red: 0.03, green: 0.04, blue: 0.09 } });
  } catch {
    /* ignore */
  }
}
