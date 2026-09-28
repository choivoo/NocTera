/** Player join/leave, loading intro, starter kit, per-tick session simulation. */
import { system, world, EntityComponentTypes, type Player } from "@minecraft/server";
import { game } from "./Game";
import { Session } from "./Session";
import { bootstrapAccount, onLogin } from "../account/AccountService";
import { bus } from "../core/EventBus";
import { giveControls } from "../input/Controls";
import { tickSession } from "../combat/CombatRuntime";
import { titleFlow } from "../ui/TitleScreen";
import { showCharacter } from "../character/CharacterVisual";
import { restoreGroup, leaveGroup } from "../coop/CoopManager";
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
  restoreGroup(s);
  g.save.saveNow(player.id);
  giveControls(player);
  bus.emit("profile:loaded", { playerId: player.id, isNew });
  log.info(`${player.name} joined (new=${isNew}, chars=${Object.keys(profile.characters).length})`);
  void intro(s, starter);
}

async function intro(s: Session, firstTime: boolean): Promise<void> {
  showCharacter(s.player, s.activeId);
  await titleFlow(s, firstTime);
  if (s.player.isValid) presentStep(s);
}

function leave(playerId: string): void {
  const g = game();
  abandonDungeon(playerId);
  const s = g.sessions.get(playerId);
  if (s) {
    const gid = s.profile.coop.groupId;
    leaveGroup(s);
    s.profile.coop.groupId = gid; // remembered for reconnect
  }
  g.sessions.delete(playerId);
  g.save.unload(playerId);
}

export function registerLifecycle(): void {
  world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (initialSpawn) system.runTimeout(() => player.isValid && join(player), 20);
    else {
      giveControls(player);
      const s = game().session(player);
      if (s) showCharacter(player, s.activeId);
    }
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
