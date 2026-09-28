/** Main-quest progression (data driven: database/quests/main.json). */
import quests from "../../database/quests/main.json";
import type { PlayerProfile } from "../account/PlayerProfile";
import { grant } from "../account/Wallet";
import { addNexusExp } from "../account/Progression";

export interface QuestStep {
  type: "dialogue" | "kill" | "switch" | "beacon" | "boss";
  hint: string;
  dialogue?: string;
  count?: number;
  beacon?: string;
  boss?: string;
}
export interface QuestDef {
  id: string;
  chapter: number;
  title: string;
  steps: QuestStep[];
  reward: { astrum?: number; credit?: number; nexusExp?: number; materials?: Record<string, number> };
  next: string | null;
}

export const QUESTS = new Map((quests as unknown as QuestDef[]).map((q) => [q.id, q]));
export const FIRST_QUEST = "prologue";

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
  | { type: "dialogue"; dialogue: string };

export interface AdvanceResult {
  advanced: boolean;
  completed: QuestDef | null;
}

/** Feeds a gameplay signal into the active quest. Server authoritative. */
export function signal(p: PlayerProfile, sig: QuestSignal): AdvanceResult {
  const a = activeQuest(p);
  if (!a) return { advanced: false, completed: null };
  const st = p.quests[a.def.id];
  const step = a.step;
  let done = false;
  if (sig.type === "kill" && step.type === "kill") {
    st.progress.kills = (st.progress.kills ?? 0) + 1;
    done = st.progress.kills >= (step.count ?? 1);
  } else if (sig.type === "kill" && step.type === "boss") {
    done = sig.enemy === step.boss;
  } else if (sig.type === "switch" && step.type === "switch") {
    st.progress.switches = (st.progress.switches ?? 0) + 1;
    done = st.progress.switches >= (step.count ?? 1);
  } else if (sig.type === "beacon" && step.type === "beacon") {
    done = sig.beacon === step.beacon;
  } else if (sig.type === "dialogue" && step.type === "dialogue") {
    done = sig.dialogue === step.dialogue;
  }
  if (!done) return { advanced: false, completed: null };
  st.step++;
  st.progress = {};
  if (st.step < a.def.steps.length) return { advanced: true, completed: null };
  st.status = "completed";
  const r = a.def.reward;
  grant(p, { astrum: r.astrum ?? 0, credit: r.credit ?? 0, materials: r.materials ?? {} });
  addNexusExp(p, r.nexusExp ?? 0);
  if (a.def.next) startQuest(p, a.def.next);
  return { advanced: true, completed: a.def };
}

export function progressText(p: PlayerProfile): string {
  const a = activeQuest(p);
  if (!a) return "";
  const st = p.quests[a.def.id];
  const n = a.step.type === "kill" ? ` (${st.progress.kills ?? 0}/${a.step.count})` : a.step.type === "switch" ? ` (${st.progress.switches ?? 0}/${a.step.count})` : "";
  return `${a.step.hint}${n}`;
}
