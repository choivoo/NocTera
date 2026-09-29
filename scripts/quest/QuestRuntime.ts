/** Connects gameplay events to QuestManager: titles, markers, auto-dialogue, boss spawn, chapter end. */
import { system, type Vector3 } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { bus } from "../core/EventBus";
import { game } from "../runtime/Game";
import { activeQuest, signal, type QuestSignal } from "./QuestManager";
import { playDialogue } from "../story/Dialogue";
import { onBeaconActivated, spawnBoss, resolve, beacon, Region } from "../world/World";
import { sound } from "../audio/Fx";
import { playCutscene, orbit } from "../camera/Cutscene";
import { playAnim } from "../character/CharacterVisual";

const FEATURE_NAME: Record<string, string> = { gacha: "GACHA", dungeon: "DUNGEON", coop: "CO-OP", weekly: "WEEKLY BOSS" };
const bossSpawned = new Set<string>();

export function questSignal(s: Session, sig: QuestSignal): void {
  const res = signal(s.profile, sig);
  if (!res.advanced) return;
  game().save.saveNow(s.id);
  const p = s.player;
  if (res.completed) {
    const c = res.completed;
    sound(p, "nocterra.gacha.five_star");
    playAnim(p, "victory");
    p.onScreenDisplay.setTitle("§6§lQUEST COMPLETE", { subtitle: `§f${c.title}`, fadeInDuration: 6, stayDuration: 60, fadeOutDuration: 12 });
    const r = c.reward;
    p.sendMessage(`§6[QUEST] §f${c.title} — Astrum +${r.astrum ?? 0}, Credit +${r.credit ?? 0}${r.signal ? `, Signal +${r.signal}` : ""}`);
    for (const f of c.unlocks ?? []) p.sendMessage(`§b[NEXUS] §f신규 기능 해금 — §l${FEATURE_NAME[f] ?? f}`);
    if (c.chapterEnd) void chapterEnd(s, c.chapterEnd);
  } else sound(p, "nocterra.ui.confirm", 1.3);
  system.runTimeout(() => p.isValid && presentStep(s), res.completed ? (res.completed.chapterEnd ? 200 : 70) : 20);
}

async function chapterEnd(s: Session, chapter: number): Promise<void> {
  const p = s.player;
  const c = { ...p.location };
  s.busyUntil = system.currentTick + 160;
  await playCutscene(p, [
    { at: 1, fade: { in: 0.6, hold: 0.8, out: 1.0 }, sound: "nocterra.gacha.five_star" },
    { at: 10, camera: { pos: orbit(c, 0, 5, 3), facing: { x: c.x, y: c.y + 1.4, z: c.z } }, title: `§6§lCHAPTER ${chapter}`, subtitle: "§fFALLEN NIGHT — CLEAR" },
    { at: 12, camera: { pos: orbit(c, 180, 8, 6), facing: { x: c.x, y: c.y + 1.4, z: c.z }, ease: 6 } },
    { at: 90, title: "§b§lTO BE CONTINUED", subtitle: "§7CHAPTER 2 — 준비 중" },
  ], 150);
  s.busyUntil = 0;
}

/** Starts whatever the current step needs (dialogue auto-plays, boss spawns). */
export function presentStep(s: Session): void {
  const a = activeQuest(s.profile);
  if (!a) return;
  if (a.step.type === "dialogue" && a.step.dialogue) {
    const id = a.step.dialogue;
    playDialogue(s, id).then((picks) => {
      if (picks) questSignal(s, { type: "dialogue", dialogue: id });
    });
  } else if (a.step.type === "boss" && a.step.boss) {
    const key = `${s.id}:${a.step.boss}`;
    if (!bossSpawned.has(key) && spawnBoss(a.step.boss, s)) {
      bossSpawned.add(key);
      s.player.sendMessage(`§4[WORLD BOSS] §f${a.step.hint} — 마커를 따라가세요`);
    }
  }
}

/** World position of the current objective (for the HUD marker). */
export function questTarget(s: Session): Vector3 | null {
  const a = activeQuest(s.profile);
  if (!a) return null;
  const st = a.step;
  if (st.type === "beacon" && st.beacon) {
    const b = beacon(st.beacon);
    return b ? resolve(b.offset) : null;
  }
  const tgt = st.target ?? (st.type === "boss" ? `boss:${st.boss}` : "");
  if (tgt.startsWith("zone:")) {
    const z = Region.zones.find((x) => x.id === tgt.slice(5));
    return z ? resolve(z.offset) : null;
  }
  if (tgt.startsWith("boss:")) {
    const b = Region.bosses.find((x) => x.id === tgt.slice(5));
    return b ? resolve(b.offset) : null;
  }
  return null;
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
