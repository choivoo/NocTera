/** Persistent account data. Everything here is server-authoritative. */
import type { StatBlock } from "../data/types";

export const PROFILE_SCHEMA_VERSION = 1;

export interface CharacterInstance {
  characterId: string;
  level: number;
  exp: number;
  ascension: number;
  resonance: number; // R0..R6 (a.k.a. constellations)
  normalAttackLevel: number;
  skillLevel: number;
  ultimateLevel: number;
  weaponUid: string | null;
  imprintUids: (string | null)[]; // CORE, TRACE, ECHO, PRISM, RELIC
  friendship: number;
  obtainedAt: number;
}

export interface WeaponInstance {
  uid: string;
  weaponId: string;
  level: number;
  exp: number;
  ascension: number;
  refinement: number; // 1..5
  equippedBy: string | null;
}

export type ImprintSlot = "CORE" | "TRACE" | "ECHO" | "PRISM" | "RELIC";
export const IMPRINT_SLOTS: readonly ImprintSlot[] = ["CORE", "TRACE", "ECHO", "PRISM", "RELIC"];

export interface ImprintInstance {
  uid: string;
  setId: string;
  slot: ImprintSlot;
  rarity: number;
  level: number;
  main: StatBlock;
  subs: StatBlock;
  equippedBy: string | null;
}

export interface PityState {
  since5: number;
  since4: number;
  guaranteed: boolean; // lost 50/50 → next 5★ is featured
  total: number;
}

export interface GachaRecord {
  t: number;
  banner: string;
  item: string;
  rarity: number;
  pull: number;
}

export interface QuestState {
  status: "active" | "completed";
  step: number;
  progress: Record<string, number>;
}

export interface PlayerProfile {
  schema: number;
  playerId: string;
  name: string;
  createdAt: number;
  lastLogin: number;

  nexusRank: number;
  nexusExp: number;

  currency: { credit: number; astrum: number; signal: number; premiumAstrum: number };
  materials: Record<string, number>;
  flux: { value: number; updatedAt: number };

  characters: Record<string, CharacterInstance>;
  weapons: Record<string, WeaponInstance>;
  imprints: Record<string, ImprintInstance>;
  nextUid: number;

  party: (string | null)[]; // 4 slots of characterId
  activeSlot: number;

  quests: Record<string, QuestState>;
  story: { chapter: number; flags: Record<string, boolean> };
  unlockedBeacons: string[];

  pity: Record<string, PityState>; // keyed by banner "pity group" (character / weapon / standard)
  gachaHistory: GachaRecord[];

  daily: { day: number; progress: Record<string, number>; claimed: boolean };
  weekly: { week: number; bossClears: number };

  settings: { uiPreset: "AUTO" | "COMPACT" | "PHONE" | "FOLD_EXPANDED" | "WINDOWS"; hudDetail: boolean; cameraShake: boolean; bgmVolume: number };
}

export function emptyPity(): PityState {
  return { since5: 0, since4: 0, guaranteed: false, total: 0 };
}

export function createProfile(playerId: string, name: string, now: number): PlayerProfile {
  return {
    schema: PROFILE_SCHEMA_VERSION,
    playerId,
    name,
    createdAt: now,
    lastLogin: now,
    nexusRank: 1,
    nexusExp: 0,
    currency: { credit: 0, astrum: 0, signal: 0, premiumAstrum: 0 },
    materials: {},
    flux: { value: 180, updatedAt: now },
    characters: {},
    weapons: {},
    imprints: {},
    nextUid: 1,
    party: [null, null, null, null],
    activeSlot: 0,
    quests: {},
    story: { chapter: 1, flags: {} },
    unlockedBeacons: [],
    pity: {},
    gachaHistory: [],
    daily: { day: 0, progress: {}, claimed: false },
    weekly: { week: 0, bossClears: 0 },
    settings: { uiPreset: "AUTO", hudDetail: true, cameraShake: true, bgmVolume: 1 },
  };
}

/**
 * Upgrades any older/partial profile to the current schema. Missing fields are
 * filled from defaults so adding new fields never wipes existing accounts.
 */
export function migrateProfile(raw: any, playerId: string, now: number): PlayerProfile {
  const base = createProfile(playerId, raw?.name ?? "Resonator", now);
  if (!raw || typeof raw !== "object") return base;
  const merged: any = { ...base, ...raw };
  for (const k of ["currency", "flux", "story", "daily", "weekly", "settings"] as const) {
    merged[k] = { ...(base as any)[k], ...(raw[k] ?? {}) };
  }
  if (!Array.isArray(merged.party) || merged.party.length !== 4) {
    const p = Array.isArray(merged.party) ? merged.party.slice(0, 4) : [];
    while (p.length < 4) p.push(null);
    merged.party = p;
  }
  merged.schema = PROFILE_SCHEMA_VERSION;
  merged.playerId = playerId;
  return merged as PlayerProfile;
}

export function allocUid(p: PlayerProfile, prefix: string): string {
  return `${prefix}${(p.nextUid++).toString(36)}`;
}
