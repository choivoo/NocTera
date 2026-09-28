/** 4-slot party composition + element synergy (pure). */
import type { PlayerProfile } from "../account/PlayerProfile";
import type { ElementId, StatBlock } from "../data/types";
import { getCharacter } from "../data/registry";
import { bus } from "../core/EventBus";

export const PARTY_SIZE = 4;

export function setPartySlot(p: PlayerProfile, slot: number, characterId: string | null): string | null {
  if (slot < 0 || slot >= PARTY_SIZE) return "slot";
  if (characterId !== null) {
    if (!p.characters[characterId]) return "not_owned";
    const existing = p.party.indexOf(characterId);
    if (existing >= 0) p.party[existing] = p.party[slot]; // swap positions
  }
  p.party[slot] = characterId;
  if (!p.party.some((c) => c)) {
    // Never allow an empty party: revert.
    p.party[slot] = characterId ?? Object.keys(p.characters)[0] ?? null;
    return "empty";
  }
  if (!p.party[p.activeSlot]) p.activeSlot = p.party.findIndex((c) => c);
  bus.emit("party:changed", { playerId: p.playerId, party: p.party.filter((c): c is string => !!c) });
  return null;
}

export function partyMembers(p: PlayerProfile): string[] {
  return p.party.filter((c): c is string => !!c && !!p.characters[c]);
}

export interface Synergy {
  id: string;
  name: string;
  description: string;
  stats: StatBlock;
}

/** Element resonance: two of the same element grants a party bonus. */
export function partySynergies(members: string[]): Synergy[] {
  const count = new Map<ElementId, number>();
  for (const m of members) {
    const e = getCharacter(m).element;
    count.set(e, (count.get(e) ?? 0) + 1);
  }
  const out: Synergy[] = [];
  const table: Record<ElementId, Synergy> = {
    IGNIS: { id: "IGNIS", name: "Fervor", description: "ATK +20%", stats: { atkPct: 20 } },
    GLACIA: { id: "GLACIA", name: "Permafrost", description: "CRIT RATE +12%", stats: { critRate: 12 } },
    VOLT: { id: "VOLT", name: "Surge", description: "ENERGY REGEN +20%", stats: { energyRegen: 20 } },
    AER: { id: "AER", name: "Tailwind", description: "BREAK +20%", stats: { breakPower: 20 } },
    LUX: { id: "LUX", name: "Radiance", description: "HEAL BONUS +20%, HP +15%", stats: { healBonus: 20, hpPct: 15 } },
    UMBRA: { id: "UMBRA", name: "Hollow", description: "CRIT DMG +25%", stats: { critDmg: 25 } },
  };
  for (const [e, n] of count) if (n >= 2) out.push(table[e]);
  if (count.size >= 4) out.push({ id: "PRISM", name: "Prism", description: "ELEMENT DMG +15%", stats: { elementDmg: 15 } });
  return out;
}
