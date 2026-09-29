/**
 * Instanced wave dungeons. Flux is consumed only when the reward is claimed
 * (clearing), matching the design: story never costs Flux.
 */
import { system, world, type Entity } from "@minecraft/server";
import dungeons from "../../database/world/dungeons.json";
import type { Session } from "../runtime/Session";
import { resolve, returnToBeacon, healParty } from "../world/World";
import { enemies } from "../combat/EnemyRuntime";
import { Enemies } from "../data/registry";
import { game } from "../runtime/Game";
import { refreshFlux, spendFlux, addDailyProgress } from "../account/Progression";
import { grant } from "../account/Wallet";
import { rollImprint } from "../artifact/ImprintGen";
import { particle, sound } from "../audio/Fx";
import { questSignal } from "../quest/QuestRuntime";
import { playAnim } from "../character/CharacterVisual";

export type DungeonDef = (typeof dungeons)[number];
export const DUNGEONS = dungeons as DungeonDef[];

interface Run {
  def: DungeonDef;
  wave: number;
  alive: Set<string>;
  startedAt: number;
  arenaOffset: number[];
}

const runs = new Map<string, Run>();

export function inDungeon(s: Session): boolean {
  return runs.has(s.id);
}

export function enterDungeon(s: Session, id: string): string | null {
  const def = DUNGEONS.find((d) => d.id === id);
  if (!def) return "unknown";
  if (runs.has(s.id)) return "already";
  if (refreshFlux(s.profile, game().clock.now()) < def.flux) return "flux";
  // Each concurrent player gets their own lane so instances never overlap.
  const lane = [...runs.values()].length;
  const arenaOffset = [def.offset[0], def.offset[1], def.offset[2] - lane * 64];
  const run: Run = { def, wave: -1, alive: new Set(), startedAt: system.currentTick, arenaOffset };
  runs.set(s.id, run);
  const p = s.player;
  try {
    p.camera.fade({ fadeTime: { fadeInTime: 0.4, holdTime: 0.6, fadeOutTime: 0.6 }, fadeColor: { red: 0, green: 0, blue: 0.05 } });
  } catch {
    /* ignore */
  }
  system.runTimeout(() => {
    if (!p.isValid) return;
    p.teleport(resolve(arenaOffset), { dimension: world.getDimension("overworld") });
    healParty(s);
    p.onScreenDisplay.setTitle(`§l${def.name}`, { subtitle: `§7${def.type} DUNGEON`, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
    system.runTimeout(() => nextWave(s), 50);
  }, 10);
  return null;
}

function nextWave(s: Session): void {
  const run = runs.get(s.id);
  if (!run || !s.player.isValid) return;
  run.wave++;
  if (run.wave >= run.def.waves.length) return clear(s, run);
  const dim = s.player.dimension;
  s.player.onScreenDisplay.setTitle(" ", { subtitle: `§eWAVE ${run.wave + 1} / ${run.def.waves.length}`, fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 6 });
  const scale = 1 + (s.profile.nexusRank - 1) * 0.07;
  run.def.waves[run.wave].forEach((id, i) => {
    const def = Enemies.get(id);
    if (!def) return;
    const a = (i / run.def.waves[run.wave].length) * Math.PI * 2;
    const pos = resolve([run.arenaOffset[0] + Math.cos(a) * 7, 0, run.arenaOffset[2] + Math.sin(a) * 7], dim);
    try {
      const e: Entity = dim.spawnEntity(def.entity, pos);
      e.addTag(`dungeon:${s.id}`);
      enemies.register(e, scale);
      run.alive.add(e.id);
      particle(dim, "noct:rift", pos, 4);
    } catch {
      /* chunk not loaded */
    }
  });
}

function clear(s: Session, run: Run): void {
  runs.delete(s.id);
  const p = s.profile;
  const now = game().clock.now();
  if (!spendFlux(p, run.def.flux, now)) {
    s.player.sendMessage("§cFlux 부족 — 보상을 받을 수 없습니다.");
  } else {
    grant(p, { credit: run.def.reward.credit, materials: (run.def.reward as any).materials ?? {} });
    for (let i = 0; i < ((run.def.reward as any).imprints ?? 0); i++) rollImprint(p, game().rng);
    addDailyProgress(p, "flux", run.def.flux, now);
    game().save.saveNow(s.id);
    const secs = Math.round((system.currentTick - run.startedAt) / 20);
    s.player.onScreenDisplay.setTitle("§6§lCLEAR", { subtitle: `§7${run.def.name} — ${secs}s`, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
    sound(s.player, "nocterra.gacha.five_star");
    playAnim(s.player, "victory");
    questSignal(s, { type: "dungeon", dungeon: run.def.id });
  }
  system.runTimeout(() => s.player.isValid && returnToBeacon(s), 80);
}

export function leaveDungeon(s: Session): void {
  const run = runs.get(s.id);
  if (!run) return;
  runs.delete(s.id);
  const dim = s.player.dimension;
  for (const e of dim.getEntities({ tags: [`dungeon:${s.id}`] })) e.remove();
  returnToBeacon(s);
}

/** Called on every enemy removal to progress waves. */
export function registerDungeons(): void {
  world.beforeEvents.entityRemove.subscribe(({ removedEntity }) => {
    const id = removedEntity.id;
    for (const [pid, run] of runs) {
      if (!run.alive.delete(id)) continue;
      if (run.alive.size === 0) {
        system.run(() => {
          const s = game().sessions.get(pid);
          if (s) system.runTimeout(() => nextWave(s), 40);
        });
      }
    }
  });
}

/** Player disconnected mid-run: drop the instance and its enemies. */
export function abandonDungeon(playerId: string): void {
  if (!runs.delete(playerId)) return;
  try {
    for (const e of world.getDimension("overworld").getEntities({ tags: [`dungeon:${playerId}`] })) e.remove();
  } catch {
    /* ignore */
  }
}
