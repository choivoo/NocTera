/**
 * Open-field exploration: treasure caches, Astral Motes (collectibles),
 * Resonance-pad puzzles, timed Rift Trials and roaming Rift Surges
 * (world events). All proximity based — no block interaction needed on touch.
 */
import { system, world, type Vector3 } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { Region, resolve } from "./World";
import { game } from "../runtime/Game";
import { dist } from "../core/Vec";
import { particle, ring, sound } from "../audio/Fx";
import { grant, type Cost } from "../account/Wallet";
import { addNexusExp } from "../account/Progression";
import { Enemies } from "../data/registry";
import { enemies } from "../combat/EnemyRuntime";
import { bus } from "../core/EventBus";

type R = typeof Region & {
  treasures: { id: string; offset: number[]; tier: string; reward: Cost }[];
  motes: { id: string; offset: number[] }[];
  moteReward: Cost;
  puzzles: { id: string; name: string; offset: number[]; pads: number[][]; timeLimit: number; reward: Cost }[];
  trials: { id: string; name: string; offset: number[]; kills: number; timeLimit: number; enemies: string[]; reward: Cost }[];
  surgeIntervalTicks: number;
};
const W = Region as unknown as R;

const TIER_FX: Record<string, string> = { common: "noct:beacon", exquisite: "noct:gacha_purple", luxurious: "noct:gacha_gold" };

interface PuzzleRun { id: string; next: number; until: number }
interface TrialRun { id: string; kills: number; until: number }
const puzzleRuns = new Map<string, PuzzleRun>();
const trialRuns = new Map<string, TrialRun>();
let surge: { zone: string; until: number; center: Vector3 } | null = null;

function reward(s: Session, r: Cost, label: string): void {
  grant(s.profile, r);
  addNexusExp(s.profile, 60);
  game().save.saveNow(s.id);
  sound(s.player, "noct.gacha.purple");
  s.player.onScreenDisplay.setTitle(" ", { subtitle: `§e${label}  §6✦${r.astrum ?? 0}`, fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 8 });
}

export function explorationSummary(s: Session): { treasures: string; motes: string; puzzles: string } {
  const e = s.profile.exploration;
  return { treasures: `${e.treasures.length}/${W.treasures.length}`, motes: `${e.motes.length}/${W.motes.length}`, puzzles: `${e.puzzles.length}/${W.puzzles.length + W.trials.length}` };
}

function tickPlayer(s: Session, t: number): void {
  const p = s.player;
  if (p.dimension.id !== "minecraft:overworld") return;
  const pos = p.location;
  const ex = s.profile.exploration;
  for (const tr of W.treasures) {
    if (ex.treasures.includes(tr.id)) continue;
    const at = resolve(tr.offset, p.dimension);
    const d = dist(pos, at);
    if (d < 24 && t % 20 === 0) particle(p.dimension, TIER_FX[tr.tier] ?? "noct:beacon", { x: at.x, y: at.y + 0.6, z: at.z }, 2);
    if (d < 2) {
      ex.treasures.push(tr.id);
      ring(p.dimension, TIER_FX[tr.tier], at, 1.2, 10);
      reward(s, tr.reward, `${tr.tier.toUpperCase()} CHEST`);
    }
  }
  for (const m of W.motes) {
    if (ex.motes.includes(m.id)) continue;
    const at = resolve(m.offset, p.dimension);
    const d = dist(pos, at);
    if (d < 20 && t % 10 === 0) particle(p.dimension, "noct:light_orb", { x: at.x, y: at.y + 1.2 + Math.sin(t / 10) * 0.3, z: at.z });
    if (d < 1.8) {
      ex.motes.push(m.id);
      reward(s, W.moteReward, `ASTRAL MOTE ${ex.motes.length}/${W.motes.length}`);
    }
  }
  // Resonance-pad puzzles: step on pads in order within the time limit.
  for (const pz of W.puzzles) {
    if (ex.puzzles.includes(pz.id)) continue;
    const base = resolve(pz.offset, p.dimension);
    if (dist(pos, base) > 30) continue;
    const run = puzzleRuns.get(s.id);
    pz.pads.forEach((o, i) => {
      const at = { x: base.x + o[0], y: base.y, z: base.z + o[2] };
      const lit = run?.id === pz.id && i < run.next;
      if (t % 10 === 0) particle(p.dimension, lit ? "noct:gacha_gold" : i === (run?.id === pz.id ? run.next : 0) ? "noct:spark_tracer" : "noct:beacon", { x: at.x, y: at.y + 0.2, z: at.z });
    });
    if (run && run.id === pz.id && t > run.until) {
      puzzleRuns.delete(s.id);
      s.player.onScreenDisplay.setTitle(" ", { subtitle: "§c시간 초과 — 첫 번째 패드부터 다시", fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 8 });
    }
    const cur = puzzleRuns.get(s.id);
    const idx = cur?.id === pz.id ? cur.next : 0;
    const pad = pz.pads[idx];
    if (dist(pos, { x: base.x + pad[0], y: base.y, z: base.z + pad[2] }) < 1.2) {
      const nr = { id: pz.id, next: idx + 1, until: idx === 0 ? t + pz.timeLimit * 20 : cur!.until };
      puzzleRuns.set(s.id, nr);
      sound(p, "noct.gacha.blue", 1 + idx * 0.2);
      if (nr.next >= pz.pads.length) {
        puzzleRuns.delete(s.id);
        ex.puzzles.push(pz.id);
        reward(s, pz.reward, `${pz.name} 해결`);
      }
    }
  }
  // Rift Trials: step into the circle to start; kill N within the limit.
  for (const tr of W.trials) {
    if (ex.puzzles.includes(tr.id)) continue;
    const at = resolve(tr.offset, p.dimension);
    const run = trialRuns.get(s.id);
    if (!run && dist(pos, at) < 2.5) {
      trialRuns.set(s.id, { id: tr.id, kills: 0, until: t + tr.timeLimit * 20 });
      s.player.onScreenDisplay.setTitle("§c§lRIFT TRIAL", { subtitle: `§f${tr.timeLimit}초 안에 ${tr.kills}체 처치`, fadeInDuration: 2, stayDuration: 40, fadeOutDuration: 8 });
      for (let i = 0; i < tr.kills; i++) {
        const def = Enemies.get(tr.enemies[i % tr.enemies.length])!;
        const e = p.dimension.spawnEntity(def.entity, resolve([tr.offset[0] + Math.cos(i) * 6, 0, tr.offset[2] + Math.sin(i) * 6], p.dimension));
        e.addTag(`trial:${s.id}`);
        enemies.register(e, 1 + (s.profile.nexusRank - 1) * 0.06);
      }
    } else if (!run && dist(pos, at) < 24 && t % 20 === 0) ring(p.dimension, "noct:telegraph", at, 2.5, 10);
    if (run && run.id === tr.id) {
      if (run.kills >= tr.kills) {
        trialRuns.delete(s.id);
        ex.puzzles.push(tr.id);
        reward(s, tr.reward, `${tr.name} CLEAR`);
      } else if (t > run.until) {
        trialRuns.delete(s.id);
        for (const e of p.dimension.getEntities({ tags: [`trial:${s.id}`] })) e.remove();
        s.player.onScreenDisplay.setTitle(" ", { subtitle: "§cRIFT TRIAL 실패", fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 8 });
      }
    }
  }
  // Rift Surge (world event) near the player.
  if (surge && dist(pos, surge.center) < 40 && t % 20 === 0) ring(p.dimension, "noct:rift", surge.center, 6, 10);
}

function surgeTick(t: number): void {
  const g = game();
  if (g.sessions.size === 0) return;
  if (surge && t > surge.until) surge = null;
  if (surge || t % W.surgeIntervalTicks !== 0) return;
  const zones = W.zones.filter((z) => z.cap > 1 && z.area !== "astera_city");
  const z = zones[Math.floor(Math.random() * zones.length)];
  const dim = world.getDimension("overworld");
  const center = resolve(z.offset, dim);
  surge = { zone: z.id, until: t + 3600, center };
  const elite = [...Enemies.values()].filter((e) => e.tier === "elite");
  try {
    const def = elite[Math.floor(Math.random() * elite.length)];
    const e = dim.spawnEntity(def.entity, center);
    e.addTag("surge");
    enemies.register(e, 1.3);
  } catch {
    /* unloaded */
  }
  for (const s of g.sessions.values()) s.player.sendMessage(`§5[WORLD EVENT] §fRift Surge — ${z.area.replace(/_/g, " ")} 에서 강적 출현`);
}

export function registerExploration(): void {
  bus.on("combat:kill", ({ playerId }) => {
    const run = trialRuns.get(playerId);
    if (run) run.kills++;
  });
  system.runInterval(() => {
    const t = system.currentTick;
    for (const s of game().sessions.values()) {
      try {
        tickPlayer(s, t);
      } catch {
        /* ignore */
      }
    }
    surgeTick(t);
  }, 5);
}
