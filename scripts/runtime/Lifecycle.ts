/** Player join/leave, loading intro, starter kit, per-tick session simulation. */
import { system, world, EntityComponentTypes, type Player } from "@minecraft/server";
import { game } from "./Game";
import { Session } from "./Session";
import { bootstrapAccount, onLogin } from "../account/AccountService";
import { bus } from "../core/EventBus";
import { giveControls } from "../input/Controls";
import { tickSession } from "../combat/CombatRuntime";
import { playCutscene, orbit } from "../camera/Cutscene";
import { resolve, beacon } from "../world/World";
import { startQuest, FIRST_QUEST } from "../quest/QuestManager";
import { presentStep } from "../quest/QuestRuntime";
import { abandonDungeon } from "../dungeon/DungeonManager";
import { enemies } from "../combat/EnemyRuntime";
import { logger } from "../core/Logger";

const log = logger("life");

function join(player: Player): void {
  const g = game();
  // Both the reload scan and playerSpawn can reach here for the same player.
  if (g.sessions.has(player.id)) return;
  const [profile, isNew] = g.save.load(player.id, player.name);
  const now = g.clock.now();
  const starter = bootstrapAccount(profile, now);
  onLogin(profile, now);
  if (starter) startQuest(profile, FIRST_QUEST);
  const s = new Session(player, profile);
  g.sessions.set(player.id, s);
  g.save.saveNow(player.id);
  giveControls(player);
  bus.emit("profile:loaded", { playerId: player.id, isNew });
  log.info(`${player.name} joined (new=${isNew}, chars=${Object.keys(profile.characters).length})`);
  void intro(s, starter);
}

/** "NOCTERRA" loading sequence → Astera entry. */
async function intro(s: Session, firstTime: boolean): Promise<void> {
  const p = s.player;
  const city = beacon("astera_city")!;
  const dest = resolve(city.offset);
  s.busyUntil = system.currentTick + (firstTime ? 160 : 70);
  const sky = { x: dest.x, y: dest.y + 30, z: dest.z };
  await playCutscene(
    p,
    [
      { at: 1, fade: { in: 0, hold: 1.5, out: 1.2, color: [0.01, 0.01, 0.04] }, title: "§l§fN O C T E R R A", subtitle: "§7녹테라" },
      { at: 5, camera: { pos: orbit(sky, 0, 40, 10), facing: dest } },
      { at: 8, camera: { pos: orbit(dest, 30, 18, 8), facing: dest, ease: firstTime ? 5 : 2.5 }, actionbar: "§8LOADING RESONANCE DATA ..." },
      { at: 40, title: "§bASTERA", subtitle: firstTime ? "§7CHAPTER 1 — FALLEN NIGHT" : `§7Welcome back, ${p.name}` },
      ...(firstTime ? [{ at: 110, camera: { pos: orbit(dest, 90, 5, 2), facing: { x: dest.x, y: dest.y + 1.5, z: dest.z }, ease: 2 } }] : []),
      { at: firstTime ? 150 : 60, fade: { in: 0.3, hold: 0.2, out: 0.6 } },
    ],
    firstTime ? 158 : 68,
  );
  if (!p.isValid) return;
  if (firstTime) p.teleport(dest);
  s.busyUntil = 0;
  presentStep(s);
}

function leave(playerId: string): void {
  const g = game();
  abandonDungeon(playerId);
  g.sessions.delete(playerId);
  g.save.unload(playerId);
}

export function registerLifecycle(): void {
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (initialSpawn) system.runTimeout(() => player.isValid && join(player), 20);
    else giveControls(player);
  });
  world.beforeEvents.playerLeave.subscribe(({ player }) => {
    const id = player.id;
    system.run(() => leave(id));
  });
  // Enemies deal no vanilla damage; undo any residual vanilla hurt on players.
  world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
    if (hurtEntity.typeId !== "minecraft:player") return;
    const src = damageSource.damagingEntity;
    if (src && enemies.isEnemy(src)) hurtEntity.getComponent(EntityComponentTypes.Health)?.resetToMaxValue();
  });
  // Script reload (/reload) or world already running: attach existing players.
  system.run(() => {
    for (const p of world.getAllPlayers()) if (!game().sessions.has(p.id)) join(p);
  });
  system.runInterval(() => {
    const g = game();
    for (const s of g.sessions.values()) {
      if (!s.player.isValid) continue;
      try {
        tickSession(s);
      } catch (e) {
        log.error(`tick ${s.id}: ${e}`);
      }
    }
    g.save.tick();
  }, 1);
}
