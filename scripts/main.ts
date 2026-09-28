/**
 * NOCTERRA — script entry point.
 * Boot order: startup (custom components, commands) → world load (storage,
 * systems) → players.
 */
import { system, world } from "@minecraft/server";
import { initGame, game } from "./runtime/Game";
import { DynamicPropertyStorage } from "./save/DynamicPropertyStorage";
import { registerControlComponent, registerControlEvents } from "./input/Controls";
import { registerCommands } from "./debug/Commands";
import { registerEnemyEvents } from "./combat/EnemyRuntime";
import { registerLifecycle } from "./runtime/Lifecycle";
import { registerHud } from "./ui/Hud";
import { registerWorld } from "./world/World";
import { registerQuestRuntime } from "./quest/QuestRuntime";
import { registerDungeons } from "./dungeon/DungeonManager";
import { Characters, Banners, Enemies } from "./data/registry";
import { logger } from "./core/Logger";

import { VERSION } from "./version";
import { registerCity } from "./world/City";
import { registerExploration } from "./world/Exploration";
import { registerDamageNumbers } from "./ui/DamageNumbers";
export { VERSION };
const log = logger("boot");

system.beforeEvents.startup.subscribe((ev) => {
  registerControlComponent(ev.itemComponentRegistry);
  registerCommands(ev.customCommandRegistry);
});

world.afterEvents.worldLoad.subscribe(() => {
  initGame(new DynamicPropertyStorage());
  registerEnemyEvents();
  registerControlEvents();
  registerWorld();
  registerQuestRuntime();
  registerDungeons();
  registerCity();
  registerExploration();
  registerDamageNumbers();
  registerLifecycle();
  registerHud(() => game().sessions.values());
  log.info(`NOCTERRA ${VERSION} — ${Characters.size} characters, ${Banners.size} banners, ${Enemies.size} enemies`);
});

// Flush all dirty profiles when the server shuts down or scripts reload.
// `shutdown` exists on newer engines only; guard so older clients still boot.
(system.beforeEvents as { shutdown?: { subscribe(cb: () => void): unknown } }).shutdown?.subscribe(() => {
  try {
    game().save.flushAll();
  } catch {
    /* not initialised */
  }
});
