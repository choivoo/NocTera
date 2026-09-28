/**
 * Dialogue UI. Uses stable @minecraft/server-ui forms (never chat). Each line
 * is a panel with the speaker as title; choices render as buttons.
 */
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { system, type Player } from "@minecraft/server";
import dialogues from "../../database/quests/dialogue.json";
import { sound } from "../audio/Fx";

export interface Line {
  speaker: string;
  text: string;
  choices?: string[];
}

const DIALOGUES = dialogues as Record<string, Line[]>;

export function hasDialogue(id: string): boolean {
  return !!DIALOGUES[id];
}

/** Shows a form, retrying while the player has another screen open (UserBusy). */
export async function showForm<T extends { show(p: Player): Promise<any> }>(player: Player, form: T): Promise<Awaited<ReturnType<T["show"]>>> {
  for (let i = 0; i < 40; i++) {
    const r = await form.show(player);
    if (!(r.canceled && r.cancelationReason === FormCancelationReason.UserBusy)) return r;
    await new Promise<void>((res) => system.runTimeout(() => res(), 5));
  }
  return form.show(player);
}

/** Plays a dialogue. Resolves with the choice indices picked (or null if the player closed it). */
export async function playDialogue(player: Player, id: string): Promise<number[] | null> {
  const lines = DIALOGUES[id];
  if (!lines) return [];
  const picks: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const f = new ActionFormData()
      .title(`§l${l.speaker}`)
      .body(`\n§f“${l.text}”\n\n§8${i + 1} / ${lines.length}`);
    const opts = l.choices ?? ["▶"];
    for (const c of opts) f.button(l.choices ? `§f> ${c}` : "§7▶ 계속");
    sound(player, "noct.ui.confirm", 1.2, 0.5);
    const r = await showForm(player, f);
    if (r.canceled) return null;
    if (l.choices) picks.push(r.selection ?? 0);
  }
  return picks;
}
