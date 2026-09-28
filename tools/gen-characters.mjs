// Generates playable-character visuals from database/art/characters.json:
//   RP models/entity/noct_char_<id>.geo.json      silhouette geometry (vanilla-compatible bone names)
//   RP textures/noct/characters/<id>.png          palette/face texture (only if missing → art can replace)
//   RP animations/noct_char_<id>.animation.json   ~20 individual animations
//   RP animation_controllers/noct_char.ac.json    one controller per character, driven by noct:anim
//   RP render_controllers/noct_char.rc.json       picks geometry/texture from noct:char
//   RP entity/player.entity.json                  vanilla player + NOCTERRA character layer
//   BP entities/player.json                       vanilla player + client-synced properties
// Vanilla bases: tools/vanilla/*.json (from Mojang/bedrock-samples).
import fs from "fs";
import path from "path";
import { png, hex, mix } from "./lib/png.mjs";

const BP = "behavior_pack/NOCTERRA_BP";
const RP = "resource_pack/NOCTERRA_RP";
const art = JSON.parse(fs.readFileSync("database/art/characters.json", "utf8"));
const order = JSON.parse(fs.readFileSync("database/art/order.json", "utf8")); // index → id (noct:char = index+1)
const write = (p, o) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof o === "string" ? o : JSON.stringify(o, null, 1) + "\n");
};

export const ANIM_CODES = {
  attack1: 1, attack2: 2, attack3: 3, attack4: 4, attack5: 5, attack6: 6,
  skill: 7, ultimate: 8, dodge: 9, perfect: 10, switch_in: 11, switch_out: 12,
  hurt: 13, knockback: 14, death: 15, victory: 16, select: 17, qte: 18,
};

// ───────────────────────── texture ─────────────────────────
// 64×64: row 0 swatches (8px): hair skin coat inner metal accent glow eye; row 1: face(8×8) dark shade
const SW = ["hair", "skin", "coat", "inner", "metal", "accent", "glow", "eye"];
function swatchUV(name) {
  const i = SW.indexOf(name);
  if (i >= 0) return [i * 8 + 1, 1];
  if (name === "face") return [0, 8];
  if (name === "dark") return [9, 9];
  throw new Error(name);
}
function texture(id, pal) {
  const cols = Object.fromEntries(SW.map((k) => [k, hex(pal[k])]));
  const dark = mix(hex(pal.inner), [0, 0, 0], 0.6);
  return png(64, 64, (x, y) => {
    if (y < 8) {
      const c = cols[SW[Math.floor(x / 8)]];
      const shade = 1.08 - (y / 8) * 0.22 + ((x * 7 + y * 13) % 5) * 0.01;
      return [...c.map((v) => Math.min(255, Math.round(v * shade))), 255];
    }
    if (y < 16 && x < 8) {
      // Face: skin, hair fringe, eyes with highlight, subtle mouth.
      const fy = y - 8;
      if (fy < 2 || (fy === 2 && (x < 2 || x > 5))) return [...cols.hair, 255];
      if (fy === 4 && (x === 1 || x === 2 || x === 5 || x === 6)) return x === 2 || x === 5 ? [...cols.eye, 255] : [...mix(cols.eye, [255, 255, 255], 0.6), 255];
      if (fy === 6 && (x === 3 || x === 4)) return [...mix(cols.skin, [150, 70, 70], 0.4), 255];
      return [...cols.skin, 255];
    }
    if (y < 16 && x >= 8 && x < 16) return [...dark, 255];
    return [0, 0, 0, 0];
  });
}

// ───────────────────────── geometry ─────────────────────────
function faceUV(mat, front) {
  const [u, v] = swatchUV(mat);
  const f = { uv: [u, v], uv_size: [6, 6] };
  const faces = { north: f, south: f, east: f, west: f, up: f, down: f };
  if (front) faces.north = { uv: [0, 8], uv_size: [8, 8] };
  return faces;
}
const cube = (origin, size, mat, extra = {}) => ({ origin, size, uv: faceUV(mat, extra.face), ...(extra.rotation ? { rotation: extra.rotation, pivot: extra.pivot } : {}), ...(extra.inflate ? { inflate: extra.inflate } : {}) });

function buildGeometry(id, a) {
  const h = a.body.height;
  const w = a.body.width;
  const B = {};
  const bone = (name, parent, pivot, cubes = []) => (B[name] = { name, ...(parent ? { parent } : {}), pivot, cubes });
  const bw = Math.round(8 * w);
  const half = bw / 2;
  const legH = Math.round(12 * h);
  const torsoH = Math.round(12 * h);
  const top = legH + torsoH;
  bone("root", null, [0, 0, 0]);
  bone("waist", "root", [0, legH, 0]);
  bone("body", "waist", [0, top, 0], [cube([-half, legH, -2], [bw, torsoH, 4], "coat"), cube([-half + 1, legH + 3, -2.2], [bw - 2, torsoH - 4, 0.4], "inner")]);
  bone("head", "body", [0, top, 0], [cube([-4, top, -4], [8, 8, 8], "skin", { face: true })]);
  bone("hat", "head", [0, top, 0]);
  bone("noct_hair", "head", [0, top + 8, 0], hairCubes(a.body.hair, top));
  bone("rightArm", "body", [-half - 1, top - 2, 0], [cube([-half - 3, top - 12, -1.5], [3, 12, 3], "coat"), cube([-half - 3, top - 12, -1.5], [3, 3, 3], "skin", { inflate: 0.05 })]);
  bone("leftArm", "body", [half + 1, top - 2, 0], [cube([half, top - 12, -1.5], [3, 12, 3], "coat"), cube([half, top - 12, -1.5], [3, 3, 3], "skin", { inflate: 0.05 })]);
  bone("rightItem", "rightArm", [-half - 1.5, top - 11, -1]);
  bone("leftItem", "leftArm", [half + 1.5, top - 11, -1]);
  bone("rightLeg", "root", [-1.9, legH, 0], [cube([-1.9 - 2, 0, -2], [4, legH, 4], "inner"), cube([-4, 0, -2.2], [4, 3, 4.4], "metal")]);
  bone("leftLeg", "root", [1.9, legH, 0], [cube([-0.1, 0, -2], [4, legH, 4], "inner"), cube([0, 0, -2.2], [4, 3, 4.4], "metal")]);
  bone("noct_coat", "body", [0, legH, 0], coatCubes(a.body.coat, half, legH));
  bone("noct_extra", "body", [0, top, 0], extraCubes(a.body.extras, half, top, legH));
  bone("noct_weapon_r", "rightArm", [-half - 1.5, top - 11, -1], weaponCubes(a.weapon.model, "r", half, top));
  bone("noct_weapon_l", "leftArm", [half + 1.5, top - 11, -1], weaponCubes(a.weapon.model, "l", half, top));
  return {
    format_version: "1.16.0",
    "minecraft:geometry": [
      {
        description: { identifier: `geometry.noct.char.${id}`, texture_width: 64, texture_height: 64, visible_bounds_width: 4, visible_bounds_height: 3.5, visible_bounds_offset: [0, 1.5, 0] },
        bones: Object.values(B),
      },
    ],
  };
}

function hairCubes(kind, top) {
  const t = top + 8;
  const base = [cube([-4.2, t - 2.5, -4.2], [8.4, 2.8, 8.4], "hair")];
  switch (kind) {
    case "long": return [...base, cube([-4.2, top - 8, 3], [8.4, 11, 1.4], "hair"), cube([-4.4, top + 1, -3.8], [1, 7, 7], "hair"), cube([3.4, top + 1, -3.8], [1, 7, 7], "hair")];
    case "spiky": return [...base, cube([-3, t, -2], [2, 3, 2], "hair", { rotation: [0, 0, 20], pivot: [-2, t, 0] }), cube([1, t, -1], [2, 3.5, 2], "hair", { rotation: [0, 0, -20], pivot: [2, t, 0] }), cube([-1, t, 1], [2, 4, 2], "hair", { rotation: [-25, 0, 0], pivot: [0, t, 2] }), cube([-4.3, top + 2, 2.5], [8.6, 5, 2], "hair")];
    case "short_hood": return [cube([-4.6, top - 0.5, -4.6], [9.2, 9.4, 9.2], "coat"), cube([-4, t - 2, -4.8], [8, 1.5, 1], "hair")];
    case "twin_tail": return [...base, cube([-6.5, top - 4, 1], [2, 9, 2], "hair", { rotation: [0, 0, 12], pivot: [-5, t - 2, 2] }), cube([4.5, top - 4, 1], [2, 9, 2], "hair", { rotation: [0, 0, -12], pivot: [5, t - 2, 2] })];
    case "ponytail": return [...base, cube([-1.5, top - 5, 4], [3, 10, 2], "hair", { rotation: [18, 0, 0], pivot: [0, t - 2, 4] })];
    case "bob": return [...base, cube([-4.5, top + 2, -3.8], [9, 5, 8.3], "hair")];
    case "braid": return [...base, cube([-1, top - 9, 3.6], [2, 12, 2], "hair"), cube([-4.3, top + 3, 2.5], [8.6, 4, 2], "hair")];
    case "swept": return [...base, cube([-4.3, t - 1, -2], [8.6, 1.5, 7], "hair", { rotation: [-15, 0, 0], pivot: [0, t, 4] }), cube([-4.3, top + 2, 3], [8.6, 5, 1.6], "hair")];
    default: return base;
  }
}

function coatCubes(kind, half, legH) {
  const y = legH;
  switch (kind) {
    case "long_split": return [cube([-half - 0.3, y - 10, 1.8], [half, 11, 0.8], "coat", { rotation: [8, 0, 3], pivot: [0, y, 2] }), cube([0.3, y - 10, 1.8], [half, 11, 0.8], "coat", { rotation: [8, 0, -3], pivot: [0, y, 2] }), cube([-half - 0.4, y - 7, -2.3], [1, 8, 4.6], "coat"), cube([half - 0.6, y - 7, -2.3], [1, 8, 4.6], "coat"), cube([-half - 0.2, y - 10.5, 2.4], [half * 2 + 0.4, 1, 0.4], "accent")];
    case "robe": return [cube([-half - 0.5, y - 11, -2.6], [half * 2 + 1, 12, 5.2], "coat"), cube([-half - 0.6, y - 11, -2.7], [half * 2 + 1.2, 1.2, 5.4], "accent")];
    case "asym_jacket": return [cube([-half - 0.3, y - 8, -2.3], [half, 9, 4.6], "coat", { rotation: [0, 0, 6], pivot: [0, y, 0] }), cube([-half, y - 1, -2.4], [half * 2, 1.5, 4.8], "accent")];
    case "tattered_shadow": return [0, 1, 2, 3, 4].map((i) => cube([-half + i * (half * 2 / 5), y - 6 - (i % 2) * 4, 1.8], [half * 2 / 5 - 0.3, 7 + (i % 2) * 4, 0.6], i % 2 ? "inner" : "coat", { rotation: [10 + i * 3, 0, 0], pivot: [0, y, 2] }));
    case "short_jacket": return [cube([-half - 0.3, y - 2, -2.3], [half * 2 + 0.6, 3, 4.6], "coat"), cube([-half, y - 2.3, -2.4], [half * 2, 0.8, 4.8], "accent")];
    case "short_skirt": return [cube([-half - 0.8, y - 5, -2.8], [half * 2 + 1.6, 6, 5.6], "coat"), cube([-half - 0.9, y - 5, -2.9], [half * 2 + 1.8, 1, 5.8], "accent")];
    case "tank_hoodie": return [cube([-half - 0.2, y - 1.5, -2.2], [half * 2 + 0.4, 2, 4.4], "inner")];
    case "long_military": return [cube([-half - 0.4, y - 9, -2.5], [half * 2 + 0.8, 10, 5], "coat"), cube([-0.3, y - 9, -2.6], [0.6, 10, 0.4], "metal")];
    case "tabard_armor": return [cube([-2.5, y - 9, -2.5], [5, 10, 0.5], "inner"), cube([-2.5, y - 9, 2], [5, 10, 0.5], "inner"), cube([-half - 0.5, y - 1, -2.5], [half * 2 + 1, 2, 5], "metal")];
    case "long_coat": return [cube([-half - 0.4, y - 11, 1.8], [half * 2 + 0.8, 12, 0.8], "coat", { rotation: [6, 0, 0], pivot: [0, y, 2] }), cube([-half - 0.4, y - 11, -2.4], [1, 12, 4.4], "coat"), cube([half - 0.6, y - 11, -2.4], [1, 12, 4.4], "coat")];
    default: return [];
  }
}

function extraCubes(extras, half, top, legH) {
  const out = [];
  for (const e of extras) {
    switch (e) {
      case "waist_cloth": out.push(cube([half - 1, legH - 9, -1], [1, 10, 2], "accent", { rotation: [0, 0, -8], pivot: [half, legH, 0] })); break;
      case "crystal_pauldron": out.push(cube([-half - 3.6, top - 3, -2], [4, 2, 4], "glow"), cube([-half - 2.6, top - 1, -1], [2, 2, 2], "accent")); break;
      case "floating_hair": out.push(cube([-3, top + 6, 4.2], [6, 1, 1], "hair", { rotation: [40, 0, 0], pivot: [0, top + 6, 4] })); break;
      case "arm_guard": out.push(cube([half - 0.2, top - 6, -2], [3.6, 5, 4], "metal")); break;
      case "waist_reactor": out.push(cube([-1.5, legH + 1, -3], [3, 3, 1.2], "glow"), cube([-half, legH, -2.3], [half * 2, 1, 4.6], "accent")); break;
      case "halo_ring": out.push(cube([-5, top + 11, 4.5], [10, 1, 0.6], "glow"), cube([-5, top + 3, 4.5], [10, 1, 0.6], "glow"), cube([-6, top + 4, 4.5], [1, 7, 0.6], "glow"), cube([5, top + 4, 4.5], [1, 7, 0.6], "glow")); break;
      case "star_charm": out.push(cube([-0.8, top - 5, -2.8], [1.6, 1.6, 0.6], "glow")); break;
      case "shadow_tatters": out.push(cube([-half - 1.4, top - 10, -1], [1, 9, 2], "inner", { rotation: [0, 0, 10], pivot: [-half, top - 2, 0] }), cube([half + 0.4, top - 10, -1], [1, 9, 2], "inner", { rotation: [0, 0, -10], pivot: [half, top - 2, 0] })); break;
      case "mask": out.push(cube([-4.1, top + 0.5, -4.4], [8.2, 3, 0.4], "dark")); break;
      case "goggles": out.push(cube([-4.3, top + 6, -4.5], [8.6, 1.6, 1], "accent")); break;
      case "tail_cable": out.push(cube([-0.5, legH - 8, 2.2], [1, 10, 1], "accent", { rotation: [20, 0, 0], pivot: [0, legH, 2] })); break;
      case "long_scarf": out.push(cube([-4.2, top - 1.5, -2.6], [8.4, 1.8, 5.2], "accent"), cube([2, top - 14, 2.4], [2.2, 13, 0.6], "accent", { rotation: [25, 0, 0], pivot: [3, top - 1, 2.4] })); break;
      case "scarf_short": out.push(cube([-4.2, top - 1.5, -2.6], [8.4, 1.8, 5.2], "accent")); break;
      case "monocle_scope": out.push(cube([1.5, top + 3.5, -4.6], [2, 2, 0.6], "glow")); break;
      case "shield_back": break;
      case "shoulder_cape": out.push(cube([-half - 0.5, top - 10, 2], [half * 2 + 1, 10, 0.6], "inner", { rotation: [8, 0, 0], pivot: [0, top, 2] })); break;
      case "big_gauntlets": break;
    }
  }
  return out;
}

function weaponCubes(model, side, half, top) {
  const hx = side === "r" ? -half - 1.5 : half + 1.5;
  const hy = top - 11;
  const blade = (len, wdt, mat = "metal") => [cube([hx - wdt / 2, hy - 0.5, -1 - len], [wdt, 1, len], mat), cube([hx - wdt / 2 - 0.1, hy - 0.2, -1 - len], [0.3, 0.4, len], "glow")];
  switch (model) {
    case "longsword":
      return side === "r" ? [...blade(17, 1.4), cube([hx - 2, hy - 0.8, -1.8], [4, 1.6, 1], "accent"), cube([hx - 0.5, hy - 0.5, -1], [1, 1, 3], "inner")] : [];
    case "greatsword":
      return side === "r" ? [cube([hx - 1.6, hy - 0.8, -24], [3.2, 1.6, 21], "metal"), cube([hx - 1.7, hy - 0.2, -24], [0.5, 1.2, 21], "accent"), cube([hx - 3, hy - 1, -3.5], [6, 2, 1.5], "inner"), cube([hx - 0.6, hy - 0.6, -2], [1.2, 1.2, 4], "dark")] : [];
    case "dual_blades":
      return [cube([hx - 0.4, hy - 9, -0.4], [0.8, 9, 1.6], "metal"), cube([hx - 0.45, hy - 9, 0.9], [0.9, 9, 0.3], "accent"), cube([hx - 1.2, hy - 0.5, -1], [2.4, 1, 2], "inner")];
    case "dual_pistols":
      return [cube([hx - 0.8, hy - 1.5, -4.5], [1.6, 2, 5], "metal"), cube([hx - 0.6, hy - 3.2, -1.5], [1.2, 2.4, 1.4], "inner"), cube([hx - 0.9, hy - 0.2, -4.6], [1.8, 0.5, 2], "accent")];
    case "rifle":
      return side === "r" ? [cube([hx - 0.8, hy - 1, -15], [1.6, 2, 15], "metal"), cube([hx - 0.9, hy + 1, -8], [1.8, 1.4, 4], "accent"), cube([hx - 0.8, hy - 3, 0], [1.6, 3, 3], "inner")] : [];
    case "catalyst_orb":
      return side === "l" ? [cube([hx - 1.5, hy + 2, -5], [3, 3, 3], "glow"), cube([hx - 2.5, hy + 3.2, -4.3], [5, 0.5, 1.5], "accent")] : [];
    case "spear":
      return side === "r" ? [cube([hx - 0.4, hy - 0.4, -22], [0.8, 0.8, 34], "metal"), cube([hx - 1, hy - 0.5, -26], [2, 1, 4], "accent"), cube([hx - 0.3, hy - 0.3, -27.5], [0.6, 0.6, 1.5], "glow")] : [];
    case "gauntlets":
      return [cube([hx - 2.5, hy - 2.5, -2.5], [5, 5, 5], "metal"), cube([hx - 2.6, hy - 0.5, -2.7], [5.2, 1, 5.4], "accent"), cube([hx - 1, hy - 1, -2.9], [2, 2, 0.4], "glow")];
    case "sword_shield":
      return side === "r" ? [...blade(11, 1.2), cube([hx - 1.6, hy - 0.8, -1.6], [3.2, 1.6, 0.8], "accent")] : [cube([hx - 0.8, hy - 3, -5], [1.2, 10, 8], "metal"), cube([hx - 1, hy + 0.5, -2], [0.4, 3, 2], "accent")];
    default:
      return [];
  }
}

// ───────────────────────── animation library ─────────────────────────
// Strike parameters per combo keyword: arm = r | l | both; a/b = arm rotations at wind-up / follow-through.
const STRIKES = {
  h_slash_r: { arm: "r", a: [-80, 60, -20], b: [-90, -70, 10], twist: [0, 25, 0], untwist: [0, -30, 0] },
  h_slash_l: { arm: "r", a: [-90, -70, 10], b: [-80, 60, -20], twist: [0, -30, 0], untwist: [0, 25, 0] },
  dash_thrust: { arm: "r", a: [-40, 0, 0], b: [-95, 0, 0], move: [0, 0, 3], untwist: [15, 0, 0] },
  spin: { arm: "r", a: [-90, 30, -60], b: [-90, -30, -80], spin: 360 },
  rising_slash: { arm: "r", a: [30, 0, 0], b: [-175, 0, 0], move: [0, 3, 1], heavy: 1.2 },
  heavy_diag: { arm: "both", a: [-160, 20, 25], b: [-40, -25, -15], twist: [0, 20, 0], untwist: [20, -25, 0], heavy: 1.4 },
  heavy_diag_back: { arm: "both", a: [-150, -25, -20], b: [-50, 30, 20], twist: [0, -20, 0], untwist: [20, 25, 0], heavy: 1.4 },
  overhead: { arm: "both", a: [-185, 0, 0], b: [-30, 0, 0], untwist: [25, 0, 0], heavy: 1.5 },
  slam: { arm: "both", a: [-190, 0, 0], b: [-10, 0, 0], move: [0, -1.5, 2], untwist: [35, 0, 0], heavy: 1.8 },
  cast_r: { arm: "r", a: [-60, 20, 0], b: [-100, 0, 0] },
  cast_l: { arm: "l", a: [-60, -20, 0], b: [-100, 0, 0] },
  cast_both: { arm: "both", a: [-50, 0, 0], b: [-120, 0, 0], move: [0, 1, 0] },
  x_slash: { arm: "both", a: [-80, -50, 0], b: [-85, 50, 0], mirror: true },
  x_slash_back: { arm: "both", a: [-85, 50, 0], b: [-80, -50, 0], mirror: true },
  spin_low: { arm: "both", a: [-60, 0, -70], b: [-60, 0, -90], spin: 360, move: [0, -0.5, 0] },
  spin_high: { arm: "both", a: [-120, 0, -60], b: [-120, 0, -90], spin: -360, move: [0, 1.5, 0] },
  flurry: { arm: "both", a: [-70, 40, 0], b: [-100, -40, 0], mirror: true, fast: 0.6 },
  cross_finish: { arm: "both", a: [-170, 40, 0], b: [-40, -40, 0], mirror: true, untwist: [25, 0, 0], heavy: 1.2 },
  shot_r: { arm: "r", a: [-90, 0, 0], b: [-110, 0, 0], recoil: true },
  shot_l: { arm: "l", a: [-90, 0, 0], b: [-110, 0, 0], recoil: true },
  double_shot: { arm: "both", a: [-90, 0, 0], b: [-115, 0, 0], recoil: true, heavy: 1.2 },
  thrust: { arm: "r", a: [-30, 0, 0], b: [-90, 0, 0], move: [0, 0, 2.5] },
  sweep: { arm: "r", a: [-80, 70, 0], b: [-80, -80, 0], twist: [0, 35, 0], untwist: [0, -35, 0] },
  sweep_back: { arm: "r", a: [-80, -80, 0], b: [-80, 70, 0], twist: [0, -35, 0], untwist: [0, 35, 0] },
  vault_strike: { arm: "r", a: [-170, 0, 0], b: [-40, 0, 0], move: [0, 4, 2], heavy: 1.5 },
  lightning_thrust: { arm: "r", a: [-20, 0, 0], b: [-95, 0, 0], move: [0, 0, 5], heavy: 1.2 },
  jab: { arm: "l", a: [-70, 0, 0], b: [-95, 0, 0], fast: 0.5 },
  cross: { arm: "r", a: [-70, 0, 0], b: [-95, 0, 0], twist: [0, -20, 0], fast: 0.55 },
  hook: { arm: "l", a: [-90, -40, -40], b: [-90, 40, -60], twist: [0, 25, 0], fast: 0.6 },
  body: { arm: "r", a: [-40, 0, 0], b: [-70, 0, 0], move: [0, -0.8, 1], fast: 0.6 },
  uppercut: { arm: "r", a: [10, 0, 0], b: [-160, 0, 0], move: [0, 2, 0.5], heavy: 1.2 },
  aim_shot: { arm: "both", a: [-90, -10, 0], b: [-100, -10, 0], recoil: true },
  charged_shot: { arm: "both", a: [-90, -10, 0], b: [-115, -10, 0], recoil: true, heavy: 1.6 },
  cut: { arm: "r", a: [-150, 30, 0], b: [-40, -20, 0] },
  cut_back: { arm: "r", a: [-60, -60, 0], b: [-90, 60, 0] },
  shield_bash: { arm: "l", a: [-60, 0, 0], b: [-90, 0, 0], move: [0, 0, 2] },
  rising_cut: { arm: "r", a: [20, 0, 0], b: [-170, 0, 0], move: [0, 2, 0.5], heavy: 1.2 },
};

const ACTIONS = {
  // skills
  iai_dash: [{ t: 0, rightArm: [-30, 40, 20], body: [15, 20, 0] }, { t: 0.22, rightArm: [-90, -80, 0], body: [5, -30, 0], root_pos: [0, 0, 6] }, { t: 0.5, rightArm: [-60, -60, 0], body: [0, 0, 0], root_pos: [0, 0, 6] }, { t: 0.8 }],
  drag_charge_slam: [{ t: 0, rightArm: [20, 0, 30], leftArm: [20, 0, -30], body: [30, 0, 0] }, { t: 0.45, rightArm: [-190, 0, 0], leftArm: [-190, 0, 0], body: [-10, 0, 0], root_pos: [0, 2, 5] }, { t: 0.65, rightArm: [-20, 0, 0], leftArm: [-20, 0, 0], body: [40, 0, 0], root_pos: [0, -1, 6] }, { t: 1.1 }],
  circle_cast: [{ t: 0, rightArm: [-60, 0, 30], leftArm: [-60, 0, -30] }, { t: 0.3, rightArm: [-150, 0, 60], leftArm: [-150, 0, -60], root_rot: [0, 180, 0] }, { t: 0.6, rightArm: [-90, 0, 90], leftArm: [-90, 0, -90], root_rot: [0, 360, 0] }, { t: 0.9 }],
  vanish_cross: [{ t: 0, body: [30, 0, 0], root_pos: [0, -1, 0] }, { t: 0.12, root_pos: [0, -3, 0], root_scale: [0.2, 0.2, 0.2] }, { t: 0.3, root_pos: [0, 0, 5], root_scale: [1, 1, 1], rightArm: [-150, 60, 0], leftArm: [-150, -60, 0] }, { t: 0.45, rightArm: [-40, -60, 0], leftArm: [-40, 60, 0], root_pos: [0, 0, 5] }, { t: 0.7 }],
  dodge_fire: [{ t: 0, body: [-20, 0, 0], root_pos: [0, 0, -3] }, { t: 0.15, rightArm: [-90, 10, 0], leftArm: [-90, -10, 0] }, { t: 0.25, rightArm: [-110, 10, 0], leftArm: [-90, -10, 0] }, { t: 0.35, rightArm: [-90, 10, 0], leftArm: [-110, -10, 0] }, { t: 0.45, rightArm: [-110, 10, 0], leftArm: [-110, -10, 0] }, { t: 0.7 }],
  spear_twirl: [{ t: 0, rightArm: [-90, 0, 0] }, { t: 0.2, rightArm: [-90, 0, 0], noct_weapon_r: [0, 0, 360] }, { t: 0.4, rightArm: [-120, 0, 0], noct_weapon_r: [0, 0, 720], root_pos: [0, 2, 0] }, { t: 0.7 }],
  charge_straight: [{ t: 0, rightArm: [10, 30, 0], body: [0, 40, 0], root_pos: [0, -0.5, -1] }, { t: 0.35, rightArm: [10, 40, 0], body: [0, 45, 0] }, { t: 0.45, rightArm: [-95, -10, 0], body: [10, -30, 0], root_pos: [0, 0, 5] }, { t: 0.85 }],
  kneel_shot: [{ t: 0, rightLeg: [-90, 0, 0], root_pos: [0, -4, 0], rightArm: [-90, -10, 0], leftArm: [-90, 20, 0] }, { t: 0.4, rightLeg: [-90, 0, 0], root_pos: [0, -4, 0], rightArm: [-120, -10, 0], leftArm: [-110, 20, 0] }, { t: 0.8 }],
  shield_raise: [{ t: 0, leftArm: [-90, 30, 0] }, { t: 0.2, leftArm: [-120, 30, 0], body: [-5, 0, 0], root_pos: [0, 0, 0] }, { t: 0.6, leftArm: [-120, 30, 0] }, { t: 0.8 }],
  flash_dash: [{ t: 0, rightArm: [-60, 0, 0], body: [30, 0, 0] }, { t: 0.1, rightArm: [-95, 0, 0], body: [35, 0, 0], root_pos: [0, 0, 7] }, { t: 0.4, rightArm: [-90, 0, 0], root_pos: [0, 0, 7] }, { t: 0.6 }],
  // ultimates (≈2–3 s; camera handled by script)
  raise_and_strike: [{ t: 0, rightArm: [-10, 0, 0] }, { t: 0.5, rightArm: [-180, 0, 10], body: [-10, 0, 0], noct_hair: [-30, 0, 0] }, { t: 1.4, rightArm: [-185, 0, 10], body: [-12, 0, 0], root_pos: [0, 1, 0], noct_hair: [-45, 0, 0] }, { t: 1.7, rightArm: [-20, 0, 0], body: [35, 0, 0], root_pos: [0, 0, 1] }, { t: 2.4 }],
  heat_raise_slam: [{ t: 0, rightArm: [-30, 0, 0], leftArm: [-30, 0, 0] }, { t: 0.8, rightArm: [-190, 0, 0], leftArm: [-190, 0, 0], body: [-15, 0, 0] }, { t: 1.6, rightArm: [-195, 0, 0], leftArm: [-195, 0, 0], body: [-18, 0, 0], root_pos: [0, 3, 0] }, { t: 1.85, rightArm: [0, 0, 0], leftArm: [0, 0, 0], body: [45, 0, 0], root_pos: [0, -1, 1] }, { t: 2.6 }],
  arms_to_sky: [{ t: 0, rightArm: [-30, 0, 20], leftArm: [-30, 0, -20] }, { t: 1.0, rightArm: [-170, 0, 30], leftArm: [-170, 0, -30], body: [-10, 0, 0], root_pos: [0, 2, 0] }, { t: 2.0, rightArm: [-170, 0, 40], leftArm: [-170, 0, -40], root_pos: [0, 2.5, 0] }, { t: 2.5 }],
  eye_glow_sphere: [{ t: 0, head: [10, 0, 0] }, { t: 0.7, head: [-5, 0, 0], rightArm: [-100, 40, 0], leftArm: [-100, -40, 0] }, { t: 1.6, rightArm: [-110, -20, 0], leftArm: [-110, 20, 0], root_pos: [0, 1, 0] }, { t: 2.0, rightArm: [-40, -70, 0], leftArm: [-40, 70, 0], body: [20, 0, 0] }, { t: 2.5 }],
  drone_call: [{ t: 0, rightArm: [-170, 0, 0] }, { t: 0.4, rightArm: [-175, 0, 0], leftArm: [-90, 0, 0] }, { t: 1.0, rightArm: [-90, 0, 0], leftArm: [-90, 0, 0] }, { t: 1.4 }],
  tornado_raise: [{ t: 0, rightArm: [-90, 0, 0] }, { t: 0.8, rightArm: [-180, 0, 0], root_rot: [0, 720, 0], root_pos: [0, 3, 0] }, { t: 1.4, rightArm: [-30, 0, 0], root_pos: [0, 0, 0] }, { t: 1.9 }],
  rush_uppercut: [{ t: 0, rightArm: [-80, 0, 0] }, { t: 0.2, leftArm: [-90, 0, 0] }, { t: 0.4, rightArm: [-90, 0, 0] }, { t: 0.6, leftArm: [-90, 0, 0] }, { t: 0.8, rightArm: [10, 0, 0], root_pos: [0, -1, 0] }, { t: 1.0, rightArm: [-170, 0, 0], root_pos: [0, 4, 0] }, { t: 1.6 }],
  scope_in: [{ t: 0, rightArm: [-90, -10, 0], leftArm: [-90, 25, 0], head: [0, 10, 0] }, { t: 1.2, rightArm: [-90, -10, 0], leftArm: [-90, 25, 0], head: [0, 10, 0] }, { t: 1.5 }],
  oath_plant: [{ t: 0, rightArm: [-170, 0, 0] }, { t: 0.7, rightArm: [-10, 0, 0], body: [25, 0, 0], root_pos: [0, -1, 0] }, { t: 1.6, rightArm: [-10, 0, 0], leftArm: [-150, 0, -20] }, { t: 2.0 }],
  spear_to_sky: [{ t: 0, rightArm: [-90, 0, 0] }, { t: 0.7, rightArm: [-180, 0, 0], root_pos: [0, 1, 0] }, { t: 1.3, rightArm: [-10, 0, 0], body: [30, 0, 0], root_pos: [0, -0.5, 0] }, { t: 1.8 }],
  // selection / victory
  raise_blade_crystal: [{ t: 0 }, { t: 0.6, rightArm: [-150, 0, 10], head: [-10, 0, 0] }, { t: 1.6, rightArm: [-150, 0, 10], head: [-10, 0, 0] }, { t: 2.2 }],
  blade_on_shoulder: [{ t: 0 }, { t: 0.5, rightArm: [-160, 0, -40], body: [0, 15, 0] }, { t: 1.8, rightArm: [-160, 0, -40], body: [0, 15, 0], head: [0, -15, 0] }, { t: 2.2 }],
  halo_bloom: [{ t: 0 }, { t: 0.8, rightArm: [-120, 0, 50], leftArm: [-120, 0, -50], root_pos: [0, 1, 0] }, { t: 1.8, rightArm: [-120, 0, 50], leftArm: [-120, 0, -50], root_pos: [0, 1.2, 0] }, { t: 2.2 }],
  rise_from_shadow: [{ t: 0, root_pos: [0, -24, 0] }, { t: 0.8, root_pos: [0, 0, 0], body: [20, 0, 0] }, { t: 1.4, rightArm: [-90, 50, 0], leftArm: [-90, -50, 0] }, { t: 2.2 }],
  twirl_guns: [{ t: 0 }, { t: 0.6, rightArm: [-90, 0, 0], leftArm: [-90, 0, 0], noct_weapon_r: [720, 0, 0], noct_weapon_l: [720, 0, 0] }, { t: 1.2, rightArm: [-150, 0, 0] }, { t: 1.8 }],
  wind_twirl: [{ t: 0 }, { t: 0.8, rightArm: [-110, 0, 0], noct_weapon_r: [0, 0, 540], root_rot: [0, 360, 0] }, { t: 1.6 }],
  knuckle_crack: [{ t: 0 }, { t: 0.4, rightArm: [-80, -40, 0], leftArm: [-80, 40, 0] }, { t: 0.8, rightArm: [-85, -45, 0], leftArm: [-85, 45, 0], head: [0, 20, 0] }, { t: 1.2, rightArm: [-150, 0, 0] }, { t: 1.8 }],
  bolt_cycle: [{ t: 0 }, { t: 0.5, rightArm: [-60, -20, 0], leftArm: [-70, 30, 0] }, { t: 1.0, rightArm: [-80, -20, 0], leftArm: [-60, 30, 0] }, { t: 1.6 }],
  shield_salute: [{ t: 0 }, { t: 0.6, rightArm: [-150, 0, 20], leftArm: [-60, 20, 0] }, { t: 1.6, rightArm: [-150, 0, 20] }, { t: 2.0 }],
  spark_spin: [{ t: 0 }, { t: 0.7, rightArm: [-150, 0, 0], noct_weapon_r: [0, 0, 720] }, { t: 1.2, rightArm: [-10, 0, 0], body: [15, 0, 0] }, { t: 1.8 }],
};
const VICTORY = { sheath: "raise_blade_crystal", plant_blade: "blade_on_shoulder", prayer: "halo_bloom", blades_crossed: "rise_from_shadow", peace: "twirl_guns", spear_plant: "wind_twirl", fist_raise: "knuckle_crack", rifle_shoulder: "bolt_cycle", salute: "shield_salute", spear_raise: "spark_spin" };
const IDLE_POSE = {
  sword_lowered_breath: { rightArm: [-15, 0, 8] },
  shoulder_rest: { rightArm: [-150, 0, -35], body: [0, 10, 0] },
  hover_orb: { leftArm: [-45, 0, -10], rightArm: [-10, 0, 10] },
  crouch_ready: { body: [15, 0, 0], rightArm: [-30, 20, 15], leftArm: [-30, -20, -15], rightLeg: [-15, 0, 0], leftLeg: [10, 0, 0] },
  spin_pistol: { rightArm: [-60, 0, 10], leftArm: [-10, 0, -10] },
  scarf_wind: { rightArm: [-20, 0, 12] },
  bounce_guard: { rightArm: [-80, -30, 0], leftArm: [-90, 30, 0] },
  rifle_rest: { rightArm: [-40, -20, 0], leftArm: [-50, 30, 0] },
  shield_guard: { leftArm: [-60, 30, 0], rightArm: [-20, 0, 10] },
  spear_spark: { rightArm: [-10, 0, 12] },
};
const RUN_POSE = {
  low_blade_back: { body: [18, 0, 0], rightArm: [30, 0, 20] },
  heavy_drag: { body: [12, 0, 0], rightArm: [20, 0, 25], leftArm: [-20, 0, -10] },
  robe_glide: { body: [6, 0, 0], leftArm: [-45, 0, -10] },
  ninja_lean: { body: [30, 0, 0], rightArm: [50, 0, 20], leftArm: [50, 0, -20] },
  light_sprint: { body: [15, 0, 0] },
  spear_back_run: { body: [12, 0, 0], rightArm: [25, 0, 15] },
  boxer_run: { body: [14, 0, 0], rightArm: [-70, -20, 0], leftArm: [-70, 20, 0] },
  rifle_run: { body: [10, 0, 0], rightArm: [-50, -20, 0], leftArm: [-60, 30, 0] },
  shield_run: { body: [10, 0, 0], leftArm: [-60, 30, 0] },
  lance_charge: { body: [20, 0, 0], rightArm: [-60, 0, 0] },
};

function strikeAnim(s, tempo) {
  const k = (s.fast ?? 1) * (s.heavy ?? 1) / tempo;
  const t1 = 0.08 * k;
  const t2 = 0.18 * k;
  const end = 0.4 * k;
  const arms = (rot, mirror) => {
    const o = {};
    if (s.arm === "r" || s.arm === "both") o.rightArm = rot;
    if (s.arm === "l" || s.arm === "both") o.leftArm = mirror && s.arm === "both" ? [rot[0], -rot[1], -rot[2]] : rot;
    return o;
  };
  const frames = [
    { t: 0, ...arms(s.a, s.mirror), body: s.twist ?? [0, 0, 0] },
    { t: t1, ...arms(s.a, s.mirror), body: s.twist ?? [0, 0, 0] },
    { t: t2, ...arms(s.b, s.mirror), body: s.untwist ?? [0, 0, 0], ...(s.move ? { root_pos: s.move } : {}), ...(s.spin ? { root_rot: [0, s.spin, 0] } : {}) },
    { t: end },
  ];
  if (s.recoil) frames.splice(2, 0, { t: (t1 + t2) / 2, ...arms(s.a, s.mirror) });
  return frames;
}

const BONE_KEYS = ["root_pos", "root_rot", "root_scale", "body", "head", "rightArm", "leftArm", "rightLeg", "leftLeg", "noct_weapon_r", "noct_weapon_l", "noct_hair", "noct_coat"];
function toAnim(frames, { loop = false, lengthPad = 0 } = {}) {
  const bones = {};
  const len = frames[frames.length - 1].t + lengthPad;
  for (const key of BONE_KEYS) {
    if (!frames.some((f) => f[key])) continue;
    const [bone, chan] = key === "root_pos" ? ["root", "position"] : key === "root_rot" ? ["root", "rotation"] : key === "root_scale" ? ["root", "scale"] : [key, "rotation"];
    const neutral = chan === "scale" ? [1, 1, 1] : [0, 0, 0];
    const kf = {};
    for (const f of frames) kf[f.t.toFixed(3)] = f[key] ?? neutral;
    bones[bone] ??= {};
    bones[bone][chan] = kf;
  }
  return { loop, animation_length: +len.toFixed(3), bones };
}

function charAnimations(id, a) {
  const T = a.motion.tempo;
  const A = {};
  const name = (k) => `animation.noct.${id}.${k}`;
  const idle = IDLE_POSE[a.motion.idle] ?? {};
  // Loops (expressions) — idle breath, second idle, run posture, air, hair/coat secondary motion.
  const idleBones = { body: { position: [0, "math.sin(q.anim_time * 120) * 0.25", 0] } };
  for (const [b, r] of Object.entries(idle)) idleBones[b] = { rotation: [`${r[0]} + math.sin(q.anim_time * 90) * 2`, r[1], r[2]] };
  A.idle = { loop: true, bones: idleBones };
  A.idle2 = { loop: false, animation_length: 4, bones: { head: { rotation: { "0.0": [0, 0, 0], "1.0": [0, 25, 0], "2.0": [0, -25, 0], "3.0": [5, 0, 0], "4.0": [0, 0, 0] } }, ...Object.fromEntries(Object.entries(idle).map(([b, r]) => [b, { rotation: r }])) } };
  const run = RUN_POSE[a.motion.run] ?? {};
  A.run = { loop: true, bones: Object.fromEntries(Object.entries(run).map(([b, r]) => [b, { rotation: [`${r[0]} * math.min(1, q.modified_move_speed * 2.5)`, r[1], r[2]] }])) };
  A.air = { loop: true, bones: { rightArm: { rotation: [-40, 0, 25] }, leftArm: { rotation: [-40, 0, -25] }, rightLeg: { rotation: [-20, 0, 0] }, leftLeg: { rotation: [15, 0, 0] } } };
  A.secondary = {
    loop: true,
    bones: {
      noct_hair: { rotation: [`math.sin(q.anim_time * 150) * 4 + q.modified_move_speed * 25`, 0, 0] },
      noct_coat: { rotation: [`math.sin(q.anim_time * 110) * 3 + q.modified_move_speed * 30`, 0, 0] },
      noct_extra: { rotation: [`math.sin(q.anim_time * 170) * 2`, 0, 0] },
    },
  };
  // One-shots
  a.motion.combo.forEach((k, i) => (A[`attack${i + 1}`] = toAnim(strikeAnim(STRIKES[k], T))));
  const scale = (frames, k) => frames.map((f) => ({ ...f, t: f.t * k }));
  A.skill = toAnim(scale(ACTIONS[a.motion.skill], 1 / Math.sqrt(T)));
  A.ultimate = toAnim(ACTIONS[a.motion.ultimate]);
  A.select = toAnim(ACTIONS[a.motion.select]);
  A.victory = toAnim(ACTIONS[VICTORY[a.motion.victory]] ?? ACTIONS[a.motion.select]);
  A.qte = toAnim(strikeAnim(STRIKES[a.motion.combo[a.motion.combo.length - 1]], T * 0.8));
  A.dodge = toAnim([{ t: 0 }, { t: 0.1 / T, body: [-25, 0, 0], root_pos: [0, 0.5, -3] }, { t: 0.3 / T, body: [-10, 0, 0], root_pos: [0, 0, -4] }, { t: 0.45 / T }]);
  A.perfect = toAnim([{ t: 0 }, { t: 0.15, root_rot: [0, 360, 0], root_pos: [0, 1.5, -2], rightArm: [-90, 0, -40] }, { t: 0.35, root_pos: [0, 0, -2] }, { t: 0.5 }]);
  A.switch_in = toAnim([{ t: 0, root_pos: [0, 10, 0], root_scale: [0.6, 0.6, 0.6] }, { t: 0.18, root_pos: [0, 0, 0], root_scale: [1, 1, 1], body: [25, 0, 0] }, { t: 0.4, ...idle }, { t: 0.6 }]);
  A.switch_out = toAnim([{ t: 0 }, { t: 0.2, root_scale: [0.8, 1.3, 0.8], root_pos: [0, 2, 0] }, { t: 0.3, root_scale: [0.1, 1.6, 0.1], root_pos: [0, 6, 0] }]);
  A.hurt = toAnim([{ t: 0 }, { t: 0.06, body: [-15, 0, 0], head: [-15, 0, 0] }, { t: 0.25 }]);
  A.knockback = toAnim([{ t: 0 }, { t: 0.1, body: [-35, 0, 0], root_pos: [0, 1, -3] }, { t: 0.5, root_pos: [0, 0, -4] }, { t: 0.7 }]);
  A.death = toAnim([{ t: 0 }, { t: 0.3, body: [20, 0, 0], rightLeg: [-60, 0, 0], leftLeg: [-60, 0, 0], root_pos: [0, -5, 0] }, { t: 1.0, body: [80, 0, 0], root_pos: [0, -11, 3] }], { lengthPad: 1 });
  const out = {};
  for (const [k, v] of Object.entries(A)) out[name(k)] = v;
  return out;
}

function controller(id, a, index) {
  const q = (code) => `q.property('noct:anim') == ${code}`;
  const actions = ["skill", "ultimate", "dodge", "perfect", "switch_in", "switch_out", "hurt", "knockback", "death", "victory", "select", "qte", ...a.motion.combo.map((_, i) => `attack${i + 1}`)];
  const toAction = actions.map((s) => ({ [s]: q(ANIM_CODES[s]) }));
  const states = {
    default: {
      animations: [{ idle: "q.modified_move_speed < 0.1 && q.is_on_ground" }, { run: "q.is_on_ground" }, { air: "!q.is_on_ground" }, "secondary"],
      transitions: [...toAction, { idle_alt: "q.modified_move_speed < 0.05 && math.mod(q.life_time, 20) > 19.5" }],
      blend_transition: 0.12,
    },
    idle_alt: { animations: ["idle2"], transitions: [...toAction, { default: "q.modified_move_speed > 0.05 || q.all_animations_finished" }], blend_transition: 0.3 },
  };
  for (const s of actions) {
    states[s] = {
      animations: [s, "secondary"],
      transitions: [...toAction.filter((t) => Object.keys(t)[0] !== s), { default: `q.property('noct:anim') == 0` }],
      blend_transition: s.startsWith("attack") ? 0.05 : 0.1,
    };
  }
  return { [`controller.animation.noct.char.${id}`]: { initial_state: "default", states } };
}

// ───────────────────────── emit ─────────────────────────
const acs = {};
const allAnims = {};
const geoKeys = {};
const texKeys = {};
const replaceMe = [];
order.forEach((id, i) => {
  const a = art[id];
  write(`${RP}/models/entity/noct_char_${id}.geo.json`, buildGeometry(id, a));
  const tex = `${RP}/textures/noct/characters/${id}.png`;
  if (!fs.existsSync(tex)) {
    fs.mkdirSync(path.dirname(tex), { recursive: true });
    fs.writeFileSync(tex, texture(id, a.palette));
  }
  replaceMe.push(`- \`${tex}\` + \`geometry.noct.char.${id}\` + \`animation.noct.${id}.*\` — generated from database/art/characters.json (${a.concept})`);
  const anims = charAnimations(id, a);
  write(`${RP}/animations/noct_char_${id}.animation.json`, { format_version: "1.8.0", animations: anims });
  Object.assign(acs, controller(id, a, i + 1));
  for (const k of Object.keys(anims)) allAnims[`${k.split(".").pop()}_${id}`] = k;
  geoKeys[`noct_${id}`] = `geometry.noct.char.${id}`;
  texKeys[`noct_${id}`] = `textures/noct/characters/${id}`;
});
write(`${RP}/animation_controllers/noct_char.ac.json`, { format_version: "1.10.0", animation_controllers: acs });

// Render controller: pick geometry/texture by noct:char (1-based).
write(`${RP}/render_controllers/noct_char.rc.json`, {
  format_version: "1.10.0",
  render_controllers: {
    "controller.render.noct.character": {
      arrays: {
        geometries: { "Array.geo": order.map((id) => `Geometry.noct_${id}`) },
        textures: { "Array.tex": order.map((id) => `Texture.noct_${id}`) },
      },
      geometry: "Array.geo[math.clamp(q.property('noct:char') - 1, 0, " + (order.length - 1) + ")]",
      materials: [{ "*": "Material.default" }],
      textures: ["Array.tex[math.clamp(q.property('noct:char') - 1, 0, " + (order.length - 1) + ")]"],
    },
  },
});

// Player client entity = vanilla + character layer. Each character's controller is
// namespaced animation keys (idle_seria …) and only runs when its index is active.
const vanillaRP = JSON.parse(fs.readFileSync("tools/vanilla/player.entity.json", "utf8"));
const d = vanillaRP["minecraft:client_entity"].description;
Object.assign(d.geometry, geoKeys);
Object.assign(d.textures, texKeys);
order.forEach((id) => {
  const prefix = `animation.noct.${id}.`;
  const map = {};
  for (const [short, full] of Object.entries(allAnims)) if (full.startsWith(prefix)) map[short] = full;
  // Controllers reference short names (idle, run…). Bedrock resolves names per entity,
  // so each character gets its own controller key and a disjoint name set via `ctrl_<id>`.
  Object.assign(d.animations, map);
  d.animations[`ctrl_${id}`] = `controller.animation.noct.char.${id}`;
});
// Rewrite each controller to use the suffixed animation names.
for (const [cid, c] of Object.entries(acs)) {
  const id = cid.split(".").pop();
  for (const st of Object.values(c.states)) {
    st.animations = st.animations.map((x) => (typeof x === "string" ? `${x}_${id}` : Object.fromEntries(Object.entries(x).map(([k, v]) => [`${k}_${id}`, v]))));
  }
}
write(`${RP}/animation_controllers/noct_char.ac.json`, { format_version: "1.10.0", animation_controllers: acs });
d.scripts.animate = [...d.scripts.animate, ...order.map((id, i) => ({ [`ctrl_${id}`]: `q.property('noct:char') == ${i + 1}` }))];
// Vanilla third-person rendering only when no NOCTERRA character is active.
d.render_controllers = d.render_controllers.map((rc) => {
  const [k, v] = Object.entries(rc)[0];
  return k === "controller.render.player.third_person" ? { [k]: `(${v}) && q.property('noct:char') == 0` } : rc;
});
d.render_controllers.push({ "controller.render.noct.character": "!variable.is_first_person && !variable.map_face_icon && !query.is_spectator && q.property('noct:char') > 0" });
write(`${RP}/entity/player.entity.json`, vanillaRP);

// Behavior player = vanilla + client-synced properties.
const vanillaBP = JSON.parse(fs.readFileSync("tools/vanilla/player.json", "utf8"));
vanillaBP["minecraft:entity"].description.properties = {
  "noct:char": { type: "int", range: [0, 32], default: 0, client_sync: true },
  "noct:anim": { type: "int", range: [0, 31], default: 0, client_sync: true },
};
write(`${BP}/entities/player.json`, vanillaBP);
write("docs/generated/characters_replace_me.md", replaceMe.join("\n") + "\n");
console.log(`[gen-characters] ${order.length} characters, ${Object.keys(allAnims).length} animations`);
