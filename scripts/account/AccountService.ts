/** New-account setup and login housekeeping (pure). */
import type { PlayerProfile } from "./PlayerProfile";
import { Config, getCharacter, Weapons } from "../data/registry";
import { equipWeapon, obtainCharacter, obtainWeapon } from "../character/CharacterManager";
import { grant } from "./Wallet";
import { refreshFlux, rollDaily } from "./Progression";

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
  refreshFlux(p, now);
  rollDaily(p, now);
  // Repair: party must reference owned characters only.
  p.party = p.party.map((c) => (c && p.characters[c] ? c : null));
  if (!p.party[p.activeSlot]) p.activeSlot = Math.max(0, p.party.findIndex((c) => c));
}
