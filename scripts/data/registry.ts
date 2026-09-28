/** Central read-only content registry built from /database JSON. */
import { CHARACTER_DATA } from "./characters.gen";
import weapons from "../../database/weapons/weapons.json";
import banners from "../../database/banners/banners.json";
import reactions from "../../database/elements/reactions.json";
import sets from "../../database/imprints/sets.json";
import enemies from "../../database/enemies/enemies.json";
import config from "../../database/config.json";
import type { BannerDef, CharacterDef, EnemyDef, ImprintSetDef, ReactionDef, WeaponDef } from "./types";

function index<T extends { id: string }>(list: T[], kind: string): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of list) {
    if (m.has(x.id)) throw new Error(`duplicate ${kind} id: ${x.id}`);
    m.set(x.id, x);
  }
  return m;
}

export const Characters = index(CHARACTER_DATA, "character");
export const Weapons = index(weapons as WeaponDef[], "weapon");
export const Banners = index(banners as BannerDef[], "banner");
export const Reactions = reactions as ReactionDef[];
export const ImprintSets = index(sets as ImprintSetDef[], "imprint set");
export const Enemies = index(enemies as EnemyDef[], "enemy");
export const Config = config;
export type GameConfig = typeof config;

export function getCharacter(id: string): CharacterDef {
  const c = Characters.get(id);
  if (!c) throw new Error(`unknown character: ${id}`);
  return c;
}
export function getWeapon(id: string): WeaponDef {
  const w = Weapons.get(id);
  if (!w) throw new Error(`unknown weapon: ${id}`);
  return w;
}
export function getBanner(id: string): BannerDef {
  const b = Banners.get(id);
  if (!b) throw new Error(`unknown banner: ${id}`);
  return b;
}
/** An item id may be a character or a weapon. */
export function itemKind(id: string): "character" | "weapon" | null {
  if (Characters.has(id)) return "character";
  if (Weapons.has(id)) return "weapon";
  return null;
}
