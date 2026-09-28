/** Connects gameplay events to QuestManager and presents quest flow (titles, auto-dialogue, boss spawn). */
import { system } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { bus } from "../core/EventBus";
import { game } from "../runtime/Game";
import { activeQuest, signal, type QuestSignal } from "./QuestManager";
import { playDialogue } from "../story/Dialogue";
import { onBeaconActivated, spawnBoss } from "../world/World";
import { sound } from "../audio/Fx";

export function questSignal(s: Session, sig: QuestSignal): void {
  const res = signal(s.profile, sig);
  if (!res.advanced) return;
  game().save.saveNow(s.id); // quest completion = critical save
  const p = s.player;
  if (res.completed) {
    const r = res.completed.reward;
    sound(p, "noct.gacha.gold");
    p.onScreenDisplay.setTitle("§6§lQUEST COMPLETE", { subtitle: `§f${res.completed.title}`, fadeInDuration: 6, stayDuration: 60, fadeOutDuration: 12 });
    p.sendMessage(`§6[QUEST] §f${res.completed.title} 완료 — Astrum +${r.astrum ?? 0}, Credit +${r.credit ?? 0}`);
    if (res.completed.id === "prologue") p.sendMessage("§b[NEXUS] §fGACHA 기능 해금 — 메뉴 > GACHA");
  } else {
    sound(p, "noct.ui.confirm", 1.3);
  }
  system.runTimeout(() => p.isValid && presentStep(s), res.completed ? 70 : 20);
}

/** Starts whatever the current step needs (dialogue auto-plays, boss spawns). */
export function presentStep(s: Session): void {
  const a = activeQuest(s.profile);
  if (!a) return;
  if (a.step.type === "dialogue" && a.step.dialogue) {
    const id = a.step.dialogue;
    playDialogue(s.player, id).then((picks) => {
      if (picks) questSignal(s, { type: "dialogue", dialogue: id });
    });
  } else if (a.step.type === "boss" && a.step.boss) {
    if (spawnBoss(a.step.boss, s)) s.player.sendMessage(`§4[WORLD BOSS] §f${a.step.boss} 출현 — Frozen Forest 깊은 곳`);
  }
}

export function registerQuestRuntime(): void {
  bus.on("combat:kill", ({ playerId, enemyType }) => {
    const s = game().sessions.get(playerId);
    if (s) questSignal(s, { type: "kill", enemy: enemyType });
  });
  bus.on("party:switched", ({ playerId }) => {
    const s = game().sessions.get(playerId);
    if (s) questSignal(s, { type: "switch" });
  });
  onBeaconActivated((s, id) => questSignal(s, { type: "beacon", beacon: id }));
}
