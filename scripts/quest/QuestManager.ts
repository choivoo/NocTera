/** Main-quest progression (data driven: database/quests/main.json). Server authoritative. */
import quests from "../../database/quests/main.json";
import type { PlayerProfile } from "../account/PlayerProfile";
import { grant } from "../account/Wallet";
import { addNexusExp } from "../account/Progression";

export interface QuestStep {
  type: "dialogue" | "kill" | "switch" | "beacon" | "boss" | "dungeon";
  hint: string;
  dialogue?: string;
  count?: number;
  enemy?: string;
  beacon?: string;
  boss?: string;
  /** Marker target: "zone:<id>" | "boss:<id>" (beacon steps use the beacon). */
  target?: string;
}
export interface QuestDef {
  id: string;
  chapter: number;
  title: string;
  steps: QuestStep[];
  reward: { astrum?: number; credit?: number; signal?: number; nexusExp?: number; materials?: Record<string, number> };
  unlocks?: string[];
  chapterEnd?: number;
  next: string | null;
}

export const QUESTS = new Map((quests as unknown as QuestDef[]).map((q) => [q.id, q]));
export const FIRST_QUEST = "prologue";

/** Features gated by story: gacha, dungeon, coop, weekly. */
export function isUnlocked(p: PlayerProfile, feature: string): boolean {
  if (p.story.flags[`unlock_${feature}`]) return true;
  // Accounts created before gating existed keep access.
  return !!p.story.flags.legacyUnlocks;
}

export function activeQuest(p: PlayerProfile): { def: QuestDef; step: QuestStep; index: number } | null {
  for (const [id, st] of Object.entries(p.quests)) {
    if (st.status !== "active") continue;
    const def = QUESTS.get(id);
    if (!def) continue;
    return { def, step: def.steps[st.step], index: st.step };
  }
  return null;
}

export function startQuest(p: PlayerProfile, id: string): boolean {
  if (!QUESTS.has(id) || p.quests[id]) return false;
  p.quests[id] = { status: "active", step: 0, progress: {} };
  return true;
}

export type QuestSignal =
  | { type: "kill"; enemy: string }
  | { type: "switch" }
  | { type: "beacon"; beacon: string }
  | { type: "dialogue"; dialogue: string }
  | { type: "dungeon"; dungeon: string };

export interface AdvanceResult {
  advanced: boolean;
  completed: QuestDef | null;
}

export function signal(p: PlayerProfile, sig: QuestSignal): AdvanceResult {
  const a = activeQuest(p);
  if (!a) return { advanced: false, completed: null };
  const st = p.quests[a.def.id];
  const step = a.step;
  let done = false;
  const count = (key: string) => (st.progress[key] = (st.progress[key] ?? 0) + 1) >= (step.count ?? 1);
  if (sig.type === "kill" && step.type === "kill" && (!step.enemy || step.enemy === sig.enemy)) done = count("kills");
  else if (sig.type === "kill" && step.type === "boss") done = sig.enemy === step.boss;
  else if (sig.type === "switch" && step.type === "switch") done = count("switches");
  else if (sig.type === "beacon" && step.type === "beacon") done = sig.beacon === step.beacon;
  else if (sig.type === "dialogue" && step.type === "dialogue") done = sig.dialogue === step.dialogue;
  else if (sig.type === "dungeon" && step.type === "dungeon") done = count("dungeons");
  if (!done) return { advanced: false, completed: null };
  st.step++;
  st.progress = {};
  if (st.step < a.def.steps.length) return { advanced: true, completed: null };
  st.status = "completed";
  const r = a.def.reward;
  grant(p, { astrum: r.astrum ?? 0, credit: r.credit ?? 0, signal: r.signal ?? 0, materials: r.materials ?? {} });
  addNexusExp(p, r.nexusExp ?? 0);
  for (const f of a.def.unlocks ?? []) p.story.flags[`unlock_${f}`] = true;
  if (a.def.chapterEnd) p.story.chapter = a.def.chapterEnd + 1;
  if (a.def.next) startQuest(p, a.def.next);
  return { advanced: true, completed: a.def };
}

export function progressText(p: PlayerProfile): string {
  const a = activeQuest(p);
  if (!a) return "";
  const st = p.quests[a.def.id];
  const c = a.step.count ?? 1;
  const n = a.step.type === "kill" ? ` ${st.progress.kills ?? 0}/${c}` : a.step.type === "switch" ? ` ${st.progress.switches ?? 0}/${c}` : a.step.type === "dungeon" ? ` ${st.progress.dungeons ?? 0}/${c}` : "";
  return `${a.step.hint}${n}`;
}
