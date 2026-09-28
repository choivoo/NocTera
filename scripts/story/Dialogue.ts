/**
 * Dialogue UI (never chat). Each line is a panel: speaker name + portrait
 * icon, the line, and choices as "> " buttons. When the speaker is a
 * NOCTERRA character, the camera frames the player's avatar wearing that
 * character's model (real 3D presentation), then restores the party member.
 */
import { ActionFormData, FormCancelationReason } from "@minecraft/server-ui";
import { system, type Player } from "@minecraft/server";
import dialogues from "../../database/quests/dialogue.json";
import { sound } from "../audio/Fx";
import type { Session } from "../runtime/Session";
import { Characters } from "../data/registry";
import { endShowcase, showcase } from "../camera/Showcase";
import { PORTRAIT, ICON } from "../ui/UIManager";

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
export async function playDialogue(s: Session, id: string): Promise<number[] | null> {
  const lines = DIALOGUES[id];
  if (!lines) return [];
  const player = s.player;
  const picks: number[] = [];
  let lastSpeaker = "";
  try {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const charId = l.speaker.toLowerCase();
      const isChar = Characters.has(charId);
      if (isChar && charId !== lastSpeaker) await showcase(s, charId, { ticks: 14, hold: true, close: true, anim: "none" });
      lastSpeaker = isChar ? charId : lastSpeaker;
      const f = new ActionFormData()
        .title(`§l${l.speaker}`)
        .body(`\n§f${l.text}\n\n§8${"·".repeat(i + 1)}${"∙".repeat(lines.length - i - 1)}`);
      const icon = isChar ? PORTRAIT(charId) : ICON("dialogue");
      if (l.choices) l.choices.forEach((c, k) => f.button(`${k === 0 ? "§f" : "§7"}> ${c}`, k === 0 ? icon : undefined));
      else f.button("§7▶  계속", icon);
      sound(player, "noct.ui.confirm", 1.2, 0.5);
      const r = await showForm(player, f);
      if (r.canceled) return null;
      if (l.choices) picks.push(r.selection ?? 0);
    }
    return picks;
  } finally {
    endShowcase(s);
  }
}
