/** Shared data-definition types. All game content lives in /database JSON. */

export type ElementId = "IGNIS" | "GLACIA" | "VOLT" | "AER" | "LUX" | "UMBRA";
export const ELEMENTS: readonly ElementId[] = ["IGNIS", "GLACIA", "VOLT", "AER", "LUX", "UMBRA"];

export type ReactionId = "MELT" | "BREAK_CURRENT" | "SPREAD" | "COLLAPSE" | "OVERDRIVE";

export type WeaponType =
  | "LONGSWORD" | "GREATSWORD" | "DUAL_BLADE" | "SPEAR"
  | "GAUNTLET" | "DUAL_PISTOL" | "RIFLE" | "CATALYST" | "SWORD";

export type Role =
  | "Main DPS" | "Burst DPS" | "Sub DPS" | "Support" | "Buffer"
  | "Debuffer" | "Sustain" | "Hybrid" | "Breaker";

export type StatKey =
  | "hp" | "hpPct" | "atk" | "atkPct" | "def" | "defPct"
  | "critRate" | "critDmg" | "elementDmg" | "energyRegen" | "breakPower" | "healBonus";

export type StatBlock = Partial<Record<StatKey, number>>;

/** Combat primitives. The runtime interprets these; new characters only add data. */
export type EffectDef =
  | { type: "damage"; mult: number; range: number; arc?: number; radius?: number; element?: ElementId | null; breakDmg?: number; knockback?: number; launch?: number }
  | { type: "dash"; distance: number }
  | { type: "teleport_behind"; range: number }
  | { type: "heal"; pctAtk: number; flat?: number; target: "self" | "party" }
  | { type: "shield"; pctAtk: number; duration: number }
  | { type: "buff"; stat: StatKey | "moveSpeed" | "atkSpeed" | "dmgReduction" | "normalDmg"; value: number; duration: number; target: "self" | "party" }
  | { type: "hp_cost"; pctCurrent: number }
  | { type: "gauge"; amount: number }
  | { type: "summon"; kind: "drone"; count: number; duration: number; interval: number; mult: number; range: number }
  | { type: "field"; radius: number; duration: number; interval: number; mult: number; pull?: number; element?: ElementId | null; onAttackBonusMult?: number; healPctAtk?: number }
  | { type: "pull"; radius: number; strength: number }
  | { type: "fx"; particle?: string; sound?: string };

export interface ActionDef {
  name: string;
  nameKo?: string;
  description: string;
  cooldown?: number; // seconds
  energyCost?: number;
  energyGain?: number;
  animation?: string;
  effects: EffectDef[];
}

export interface ComboHitDef {
  mult: number;
  range: number;
  arc: number; // degrees
  hitstop: number; // ticks
  sound: string;
  particle: string;
  animation: string;
  breakDmg?: number;
  window: number; // ticks allowed until the next input continues the combo
}

export interface MechanicDef {
  type: "frost_gauge" | "shadow_gauge" | "blood_heat" | "none";
  name: string;
  max: number;
  gainPerHit: number;
  /** State entered when full. */
  state?: { name: string; duration: number; buffs: StatBlock; normalElement?: ElementId };
}

/** Machine-readable passive (see scripts/character/Passives.ts). */
export type PassiveEffect =
  | { type: "cond"; when: string; stat: "critRate" | "critDmg" | "dmgPct" | "atkPct" | "defPct" | "dmgReduction"; value: number }
  | { type: "overheal_shield" | "dodge_cd_in_state" | "skill_hit_energy" | "shield_break_heal"; value: number }
  | { type: "switch_cd"; when: string; value: number }
  | { type: "utility_speed" };

export interface CharacterDef {
  id: string;
  name: string;
  nameKo: string;
  rarity: 4 | 5;
  element: ElementId;
  weapon: WeaponType;
  role: Role[];
  title: string;
  description: string;
  base: { hp: number; atk: number; def: number };
  ascensionStat: { stat: StatKey; total: number };
  kit: {
    normal: { name: string; hits: ComboHitDef[] };
    skill: ActionDef;
    ultimate: ActionDef;
    switchIn: ActionDef;
    passives: { name: string; description: string; unlockAscension: number; effect?: PassiveEffect }[];
  };
  mechanic: MechanicDef;
  qte?: { trigger: "frozen" | "break" | "airborne" | "shocked"; action: ActionDef };
  resonance: { name: string; description: string; effect: Record<string, number> }[];
  visual: { model: string; texture: string; portrait: string; color: string; placeholder: boolean };
  sounds: { attack: string; hurt: string; skill: string; ultimate: string };
}

export interface WeaponDef {
  id: string;
  name: string;
  rarity: 3 | 4 | 5;
  type: WeaponType;
  baseAtk: number;
  subStat: { stat: StatKey; base: number };
  passive: { name: string; description: string; perRefinement: StatBlock[] };
  signatureOf?: string;
}

export interface BannerDef {
  id: string;
  type: "character" | "weapon" | "standard";
  name: string;
  subtitle: string;
  featured5: string | null;
  featured4: string[];
  pool5: string[];
  pool4: string[];
  pool3: string[];
  rates: { base5: number; base4: number; softPityStart: number; softPityStep: number; hardPity5: number; hardPity4: number; featuredChance: number };
  costPerPull: number;
  active: boolean;
}

export interface ReactionDef {
  id: ReactionId;
  name: string;
  nameKo: string;
  pair: [ElementId, ElementId | "*"];
  mult: number;
  flatScale?: number;
  breakBonus?: number;
  consumes: boolean;
  description: string;
}

export interface ImprintSetDef {
  id: string;
  name: string;
  twoPiece: { description: string; stats: StatBlock };
  fourPiece: { description: string; trigger: "skill" | "ultimate" | "always"; duration: number; stats: StatBlock };
}

export interface EnemyDef {
  id: string;
  name: string;
  tier: "normal" | "elite" | "boss";
  entity: string;
  hp: number;
  atk: number;
  def: number;
  breakGauge: number;
  element: ElementId | null;
  exp: number;
  credit: number;
  /** Training dummies: never die, never reward. */
  immortal?: boolean;
  attack: { windup: number; range: number; mult: number; cooldown: number };
}
