import type { Vector3 } from "@minecraft/server";

export const add = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vector3, s: number): Vector3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const len = (a: Vector3): number => Math.hypot(a.x, a.y, a.z);
export const dist = (a: Vector3, b: Vector3): number => len(sub(a, b));
export const dist2 = (a: Vector3, b: Vector3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
export function flatDir(a: Vector3): Vector3 {
  const l = Math.hypot(a.x, a.z) || 1;
  return { x: a.x / l, y: 0, z: a.z / l };
}
/** Angle in degrees between flat facing and the flat direction to `to`. */
export function angleTo(from: Vector3, facing: Vector3, to: Vector3): number {
  const d = flatDir(sub(to, from));
  const f = flatDir(facing);
  const dot = Math.max(-1, Math.min(1, d.x * f.x + d.z * f.z));
  return (Math.acos(dot) * 180) / Math.PI;
}
