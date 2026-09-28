/** Ownership, EXP/leveling, ascension, talents, resonance (duplicates). */
import { allocUid, type CharacterInstance, type PlayerProfile, type WeaponInstance } from "../account/PlayerProfile";
import { Characters, Config, getCharacter, getWeapon } from "../data/registry";
import { bus } from "../core/EventBus";
import { expToNext, levelCap } from "./Stats";
import { spend, type Cost } from "../account/Wallet";

export const MAX_RESONANCE = 6;
export const RESONANCE_MATERIAL = (id: string) => `resonance_${id}`;

export function newCharacterInstance(characterId: string, now: number): CharacterInstance {
  return {
    characterId,
    level: 1,
    exp: 0,
    ascension: 0,
    resonance: 0,
    normalAttackLevel: 1,
    skillLevel: 1,
    ultimateLevel: 1,
    weaponUid: null,
    imprintUids: [null, null, null, null, null],
    friendship: 0,
    obtainedAt: now,
  };
}

export interface ObtainResult {
  characterId: string;
  duplicate: boolean;
  /** Resonance material granted when the character is already owned. */
  resonanceMaterial: number;
}

/**
 * Grants a character. Duplicates convert to Resonance material (auto-applied
 * up to R6; beyond R6 converts to Credit-equivalent "stella" material).
 */
export function obtainCharacter(p: PlayerProfile, characterId: string, now: number): ObtainResult {
  const def = getCharacter(characterId);
  const owned = p.characters[characterId];
  if (!owned) {
    p.characters[characterId] = newCharacterInstance(characterId, now);
    bus.emit("character:obtained", { playerId: p.playerId, characterId, duplicate: false });
    return { characterId, duplicate: false, resonanceMaterial: 0 };
  }
  if (owned.resonance < MAX_RESONANCE) {
    owned.resonance++;
  } else {
    const key = def.rarity === 5 ? "stella_gold" : "stella_violet";
    p.materials[key] = (p.materials[key] ?? 0) + (def.rarity === 5 ? 10 : 2);
  }
  p.materials[RESONANCE_MATERIAL(characterId)] = (p.materials[RESONANCE_MATERIAL(characterId)] ?? 0) + 1;
  bus.emit("character:obtained", { playerId: p.playerId, characterId, duplicate: true });
  return { characterId, duplicate: true, resonanceMaterial: 1 };
}

/** Gacha weapon grant: a duplicate refines the owned copy (R1→R5); beyond R5 it becomes a new copy. */
export function obtainOrRefineWeapon(p: PlayerProfile, weaponId: string): { weapon: WeaponInstance; refined: boolean } {
  const owned = Object.values(p.weapons).filter((w) => w.weaponId === weaponId && w.refinement < 5);
  if (owned.length > 0) {
    const best = owned.sort((a, b) => b.refinement - a.refinement)[0];
    best.refinement++;
    return { weapon: best, refined: true };
  }
  return { weapon: obtainWeapon(p, weaponId), refined: false };
}

export function obtainWeapon(p: PlayerProfile, weaponId: string): WeaponInstance {
  getWeapon(weaponId);
  const uid = allocUid(p, "w");
  const w: WeaponInstance = { uid, weaponId, level: 1, exp: 0, ascension: 0, refinement: 1, equippedBy: null };
  p.weapons[uid] = w;
  return w;
}

/** Adds EXP respecting the ascension level cap. Returns levels gained. */
export function addCharacterExp(p: PlayerProfile, characterId: string, amount: number): number {
  const c = p.characters[characterId];
  if (!c || amount <= 0) return 0;
  const cap = levelCap(c.ascension);
  let gained = 0;
  c.exp += Math.floor(amount);
  while (c.level < cap && c.exp >= expToNext(c.level)) {
    c.exp -= expToNext(c.level);
    c.level++;
    gained++;
    bus.emit("character:levelup", { playerId: p.playerId, characterId, level: c.level });
  }
  if (c.level >= cap) c.exp = Math.min(c.exp, expToNext(c.level) - 1);
  return gained;
}

export function ascensionCost(c: CharacterInstance): Cost {
  const phase = c.ascension + 1;
  const def = getCharacter(c.characterId);
  return {
    credit: 20000 * phase,
    materials: { [`crystal_${def.element.toLowerCase()}`]: 2 * phase, rift_core: phase * 3 },
  };
}

export type AscendError = "not_owned" | "max" | "level" | "cost";

export function ascend(p: PlayerProfile, characterId: string): AscendError | null {
  const c = p.characters[characterId];
  if (!c) return "not_owned";
  if (c.ascension >= Config.character.ascensionCaps.length - 1) return "max";
  if (c.level < levelCap(c.ascension)) return "level";
  if (!spend(p, ascensionCost(c))) return "cost";
  c.ascension++;
  return null;
}

export function talentCost(level: number): Cost {
  return { credit: 12500 * level, materials: { talent_tome: level * 2 } };
}

export function upgradeTalent(p: PlayerProfile, characterId: string, kind: "normal" | "skill" | "ultimate"): string | null {
  const c = p.characters[characterId];
  if (!c) return "not_owned";
  const key = kind === "normal" ? "normalAttackLevel" : kind === "skill" ? "skillLevel" : "ultimateLevel";
  if (c[key] >= 10) return "max";
  // Talent cap tied to ascension like the reference genre: 1 + 2*(asc-1) … simplified.
  if (c[key] >= Math.max(1, c.ascension * 2 - 1) && c.ascension < 6) return "ascension";
  if (!spend(p, talentCost(c[key]))) return "cost";
  c[key]++;
  return null;
}

export function equipWeapon(p: PlayerProfile, characterId: string, weaponUid: string): string | null {
  const c = p.characters[characterId];
  const w = p.weapons[weaponUid];
  if (!c || !w) return "not_owned";
  if (getWeapon(w.weaponId).type !== getCharacter(characterId).weapon) return "type";
  if (w.equippedBy && w.equippedBy !== characterId) {
    const other = p.characters[w.equippedBy];
    if (other) other.weaponUid = c.weaponUid; // swap
    if (c.weaponUid && p.weapons[c.weaponUid]) p.weapons[c.weaponUid].equippedBy = w.equippedBy;
  } else if (c.weaponUid && p.weapons[c.weaponUid]) {
    p.weapons[c.weaponUid].equippedBy = null;
  }
  c.weaponUid = weaponUid;
  w.equippedBy = characterId;
  return null;
}

export function ownedCharacterIds(p: PlayerProfile): string[] {
  return Object.keys(p.characters).filter((id) => Characters.has(id));
}
