/** Player join/leave, loading intro, starter kit, per-tick session simulation. */
import { system, world, EntityComponentTypes, type Player } from "@minecraft/server";
import { game } from "./Game";
import { Session } from "./Session";
import { runBootstrap, onLogin } from "../account/AccountService";
import { recordError } from "../core/ErrorLog";
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
  let profile;
  let isNew = false;
  try {
    [profile, isNew] = g.save.load(player.id, player.name);
  } catch (e) {
    recordError("join.load", e);
    player.sendMessage("§c[NOCTERRA] 프로필 로드 실패 — /noct:noct report 로 오류를 확인하세요. 재접속 시 다시 시도합니다.");
    return;
  }
  const now = g.clock.now();
  // Crash recovery before anything else touches currency.
  const tx = g.gacha.recover(profile);
  if (tx !== "none") log.warn(`${player.name}: pending gacha tx ${tx}`);
  const boot = runBootstrap(profile, now, (p) => {
    startQuest(p, FIRST_QUEST);
  });
  if (!boot.ok) recordError("join.bootstrap", profile.bootstrap.lastError);
  try {
    onLogin(profile, now);
  } catch (e) {
    recordError("join.onLogin", e);
  }
  const s = new Session(player, profile);
  g.sessions.set(player.id, s);
  g.save.saveNow(player.id);
  // Reconnect safety: never inherit a camera/animation/lock state from a dropped session.
  resetClientState(s);
  try {
    restoreGroup(s);
    giveControls(player);
  } catch (e) {
    recordError("join.controls", e);
  }
  bus.emit("profile:loaded", { playerId: player.id, isNew });
  log.info(`${player.name} joined (new=${isNew}, stage=${profile.bootstrap.stage}, chars=${Object.keys(profile.characters).length})`);
  intro(s, boot.starter).catch((e) => {
    recordError("join.title", e);
    s.busyUntil = 0; // never trap the player behind a failed title/loading screen
    resetClientState(s);
  });
}

/** Clears camera, fades, animation codes and input locks (join, respawn, recovery). */
export function resetClientState(s: Session): void {
  const p = s.player;
  try {
    p.camera.clear();
  } catch {
    /* ignore */
  }
  try {
    p.setProperty("noct:anim", 0);
  } catch {
    /* ignore */
  }
  s.busyUntil = 0;
  showCharacter(p, s.activeId);
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
      if (s) resetClientState(s);
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
        recordError("combat.tick", e);
      }
    }
    g.save.tick();
  }, 1);
}
