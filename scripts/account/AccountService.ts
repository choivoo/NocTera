/** New-account setup and login housekeeping (pure). */
import type { PlayerProfile } from "./PlayerProfile";
import { Config, getCharacter, Weapons } from "../data/registry";
import { equipWeapon, obtainCharacter, obtainWeapon } from "../character/CharacterManager";
import { grant } from "./Wallet";
import { refreshFlux, rollDaily } from "./Progression";
import { QUESTS } from "../quest/QuestManager";

/**
 * First-join bootstrap as a small state machine:
 *   created → starter_granted → ready        (normal)
 *   any failure → recovery (profile restored to the pre-step snapshot, retried next join)
 * Every step is all-or-nothing: a crash or exception mid-step can never grant the
 * starter kit twice or leave half an account.
 */
export function runBootstrap(p: PlayerProfile, now: number, afterStarter?: (p: PlayerProfile) => void): { starter: boolean; ok: boolean } {
  p.bootstrap.attempts++;
  let starter = false;
  if (p.bootstrap.stage === "ready") return { starter, ok: true };
  const snapshot = JSON.stringify(p);
  try {
    starter = bootstrapAccount(p, now);
    p.bootstrap.stage = "starter_granted";
    afterStarter?.(p);
    p.bootstrap.stage = "ready";
    p.bootstrap.lastError = null;
    return { starter, ok: true };
  } catch (e) {
    const restored = JSON.parse(snapshot) as PlayerProfile;
    for (const k of Object.keys(p) as (keyof PlayerProfile)[]) delete (p as any)[k];
    Object.assign(p, restored);
    p.bootstrap.stage = "recovery";
    p.bootstrap.lastError = String(e instanceof Error ? e.message : e).slice(0, 200);
    return { starter: false, ok: false };
  }
}

/** Gives a fresh account its starter kit. Idempotent via a story flag. */
export function bootstrapAccount(p: PlayerProfile, now: number): boolean {
  if (p.story.flags.starterGranted) return false;
  grant(p, { astrum: Config.account.startingAstrum, credit: Config.account.startingCredit });
  Config.account.starterCharacters.forEach((id, slot) => {
    obtainCharacter(p, id, now);
    const type = getCharacter(id).weapon;
    const starter = [...Weapons.values()].find((w) => w.rarity === 3 && w.type === type);
    if (starter) equipWeapon(p, id, obtainWeapon(p, starter.id).uid);
    if (slot < 4) p.party[slot] = id;
  });
  p.activeSlot = 0;
  p.story.flags.starterGranted = true;
  return true;
}

export function onLogin(p: PlayerProfile, now: number): void {
  // Story-gated features: re-derive unlocks from completed quests (covers pre-1.0 saves).
  for (const [id, q] of Object.entries(p.quests)) {
    if (q.status !== "completed") continue;
    for (const f of QUESTS.get(id)?.unlocks ?? []) p.story.flags[`unlock_${f}`] = true;
  }
  refreshFlux(p, now);
  rollDaily(p, now);
  // Repair: party must reference owned characters only.
  p.party = p.party.map((c) => (c && p.characters[c] ? c : null));
  if (!p.party[p.activeSlot]) p.activeSlot = Math.max(0, p.party.findIndex((c) => c));
}
