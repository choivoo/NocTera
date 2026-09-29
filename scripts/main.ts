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
import { initErrorLog } from "./core/ErrorLog";
import { markModule } from "./debug/Modules";

import { VERSION } from "./version";
import { registerCity } from "./world/City";
import { registerExploration } from "./world/Exploration";
import { registerDamageNumbers } from "./ui/DamageNumbers";
export { VERSION };
const log = logger("boot");

system.beforeEvents.startup.subscribe((ev) => {
  try {
    registerControlComponent(ev.itemComponentRegistry);
    markModule("control-component", true);
  } catch (e) {
    markModule("control-component", false, e);
  }
  try {
    registerCommands(ev.customCommandRegistry);
    markModule("commands", true);
  } catch (e) {
    markModule("commands", false, e);
  }
});

world.afterEvents.worldLoad.subscribe(() => {
  initErrorLog(
    () => world.getDynamicProperty("noct:errors") as string | undefined,
    (json) => world.setDynamicProperty("noct:errors", json),
  );
  initGame(new DynamicPropertyStorage());
  const mods: [string, () => void][] = [
    ["enemies", registerEnemyEvents],
    ["controls", registerControlEvents],
    ["world", registerWorld],
    ["quests", registerQuestRuntime],
    ["dungeons", registerDungeons],
    ["city", registerCity],
    ["exploration", registerExploration],
    ["damage-numbers", registerDamageNumbers],
    ["lifecycle", registerLifecycle],
    ["hud", () => registerHud(() => game().sessions.values())],
  ];
  // One failing module must not stop the rest from booting (reported via /noct:noct report).
  for (const [name, fn] of mods) {
    try {
      fn();
      markModule(name, true);
    } catch (e) {
      markModule(name, false, e);
    }
  }
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
