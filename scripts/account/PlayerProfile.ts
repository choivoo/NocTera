/** Persistent account data. Everything here is server-authoritative. */
import type { StatBlock } from "../data/types";

export const PROFILE_SCHEMA_VERSION = 3;

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

  settings: Settings;
  coop: { groupId: string | null };
  exploration: { treasures: string[]; motes: string[]; puzzles: string[] };
  titleSeen: boolean;
  /** First-join / recovery state machine (see AccountService.bootstrap). */
  bootstrap: BootstrapState;
  /** Gacha transaction log (see GachaService). */
  gachaTx: { seq: number; pending: GachaTxRecord | null; committed: string[] };
}

export type BootstrapStage = "created" | "starter_granted" | "ready" | "recovery";
export interface BootstrapState {
  stage: BootstrapStage;
  attempts: number;
  lastError: string | null;
  migratedFrom: number | null;
}

export type GachaTxState = "CREATED" | "CURRENCY_RESERVED" | "ROLLED" | "REWARD_GRANTED" | "COMMITTED" | "ROLLED_BACK";
export interface GachaTxRecord {
  id: string;
  state: GachaTxState;
  banner: string;
  count: number;
  price: { signal: number; astrum: number };
  /** Pre-transaction snapshot of every field a pull can change (for rollback). */
  snapshot: string;
  results?: { itemId: string; rarity: number }[];
}

export type UiPresetSetting = "AUTO" | "COVER" | "COMPACT" | "PHONE" | "FOLD_EXPANDED" | "WINDOWS";

/** HUD edit-mode data: every element has a normalized anchor + offset + scale (future JSON UI edit mode reads this). */
export interface HudElementLayout {
  anchor: "left" | "right" | "top" | "bottom" | "top_left" | "top_right" | "bottom_left" | "bottom_right" | "center";
  offset: [number, number];
  scale: number;
  visible: boolean;
}

export interface Settings {
  uiPreset: UiPresetSetting;
  hudDetail: boolean;
  cameraShake: boolean;
  bgmVolume: number;
  hudScale: number; // 80..120 (%)
  buttonSize: number; // 80..140 (%)
  buttonOpacity: number; // 30..100 (%)
  damageNumbers: boolean;
  damageNumberSize: 0 | 1 | 2;
  cameraSensitivity: number; // 50..150 (%) — cutscene/ult camera ease speed
  aimAssist: number; // 0..100 (%)
  ultCinematic: boolean;
  hudLayout: Record<string, HudElementLayout>;
  safeArea: "SMALL" | "MEDIUM" | "LARGE";
  hudDensity: "MINIMAL" | "STANDARD" | "FULL";
  graphics: "PERFORMANCE" | "BALANCED" | "QUALITY";
  targetLock: boolean;
}

export const DEFAULT_HUD_LAYOUT: Record<string, HudElementLayout> = {
  party: { anchor: "left", offset: [4, -10], scale: 1, visible: true },
  quest: { anchor: "top", offset: [0, 6], scale: 1, visible: true },
  combat: { anchor: "bottom_right", offset: [-8, -8], scale: 1, visible: true },
  boss: { anchor: "top", offset: [0, 18], scale: 1, visible: true },
  minimap: { anchor: "top_left", offset: [6, 6], scale: 1, visible: true },
};

export function defaultSettings(): Settings {
  return {
    uiPreset: "AUTO",
    hudDetail: true,
    cameraShake: true,
    bgmVolume: 1,
    hudScale: 100,
    buttonSize: 100,
    buttonOpacity: 85,
    damageNumbers: true,
    damageNumberSize: 1,
    cameraSensitivity: 100,
    aimAssist: 70,
    ultCinematic: true,
    hudLayout: structuredCloneLayout(),
    safeArea: "MEDIUM",
    hudDensity: "STANDARD",
    graphics: "BALANCED",
    targetLock: false,
  };
}

function structuredCloneLayout(): Record<string, HudElementLayout> {
  return JSON.parse(JSON.stringify(DEFAULT_HUD_LAYOUT));
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
    settings: defaultSettings(),
    coop: { groupId: null },
    exploration: { treasures: [], motes: [], puzzles: [] },
    titleSeen: false,
    bootstrap: { stage: "created", attempts: 0, lastError: null, migratedFrom: null },
    gachaTx: { seq: 0, pending: null, committed: [] },
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
  for (const k of ["currency", "flux", "story", "daily", "weekly", "settings", "coop", "exploration", "bootstrap", "gachaTx"] as const) {
    merged[k] = { ...(base as any)[k], ...(raw[k] ?? {}) };
  }
  if (!Array.isArray(merged.party) || merged.party.length !== 4) {
    const p = Array.isArray(merged.party) ? merged.party.slice(0, 4) : [];
    while (p.length < 4) p.push(null);
    merged.party = p;
  }
  // v1 → v2: expanded settings (UI scale, touch, damage numbers, HUD layout), co-op, exploration.
  merged.settings.hudLayout = { ...structuredCloneLayout(), ...(raw.settings?.hudLayout ?? {}) };
  // v2 → v3: safe area / density / graphics / target lock, bootstrap state, gacha tx log.
  const from = typeof raw.schema === "number" ? raw.schema : 1;
  if (from < PROFILE_SCHEMA_VERSION) merged.bootstrap.migratedFrom = from;
  // Pre-v3 accounts that already have their starter kit are fully bootstrapped.
  if (!raw.bootstrap && raw.story?.flags?.starterGranted) merged.bootstrap.stage = "ready";
  merged.schema = PROFILE_SCHEMA_VERSION;
  merged.playerId = playerId;
  return merged as PlayerProfile;
}

export function allocUid(p: PlayerProfile, prefix: string): string {
  return `${prefix}${(p.nextUid++).toString(36)}`;
}
