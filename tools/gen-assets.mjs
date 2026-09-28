// Generates pack content derived from /database: control items, enemy entities
// (BP + RP client entity), placeholder geometry, lang files, and placeholder
// PNG textures. PNGs are only written when missing, so replacing a placeholder
// with real art is never overwritten. Every placeholder is listed in
// docs/REPLACE_ME.md.
import fs from "fs";
import path from "path";
import zlib from "zlib";

const BP = "behavior_pack/NOCTERRA_BP";
const RP = "resource_pack/NOCTERRA_RP";
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, obj) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) + "\n");
};
const replaceMe = [];

// ───────── PNG encoder (RGBA) ─────────
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** Dark glass tile with a glowing border and a centered diamond in `color`. */
function glassIcon(size, color) {
  const [r, g, b] = hex(color);
  return png(size, size, (x, y) => {
    const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
    const inner = x === 1 || y === 1 || x === size - 2 || y === size - 2;
    const c = size / 2 - 0.5;
    const diamond = Math.abs(x - c) + Math.abs(y - c) < size * 0.28;
    if (edge) return [r, g, b, 255];
    if (inner) return [Math.round(r * 0.4), Math.round(g * 0.4), Math.round(b * 0.4), 230];
    if (diamond) return [r, g, b, 255];
    return [14, 16, 26, 220];
  });
}
function writePng(rel, buf, note) {
  const p = path.join(RP, rel);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
  }
  replaceMe.push(`- \`${RP}/${rel}\` — ${note}`);
}

// ───────── data ─────────
const chars = fs.readdirSync("database/characters").filter((f) => f.endsWith(".json")).map((f) => read(`database/characters/${f}`));
const enemies = read("database/enemies/enemies.json");
const ELEMENT_HEX = { IGNIS: "#ff6a3d", GLACIA: "#8fd6ff", VOLT: "#ffe04a", AER: "#6fffc8", LUX: "#fff1b8", UMBRA: "#9a6bff", null: "#b0b6c8" };

// ───────── control items ─────────
const controls = [
  ["attack", "§lATTACK", "#ffffff"], ["skill", "§b§lSKILL", "#8fd6ff"], ["ultimate", "§6§lULTIMATE", "#ffcc4d"], ["dodge", "§a§lDODGE", "#6fffc8"],
  ["char1", "§f§lCHARACTER 1", "#c8d0ff"], ["char2", "§f§lCHARACTER 2", "#c8d0ff"], ["char3", "§f§lCHARACTER 3", "#c8d0ff"], ["char4", "§f§lCHARACTER 4", "#c8d0ff"],
  ["menu", "§d§lNOCTERRA MENU", "#d58cff"],
];
const itemTextures = {};
for (const [id, name, color] of controls) {
  const tex = `noct_ctl_${id}`;
  itemTextures[tex] = { textures: `textures/noct/items/ctl_${id}` };
  writePng(`textures/noct/items/ctl_${id}.png`, glassIcon(16, color), `control icon ${id}`);
  write(`${BP}/items/ctl_${id}.json`, {
    format_version: "1.21.90",
    "minecraft:item": {
      description: { identifier: `noct:ctl_${id}`, menu_category: { category: "items", is_hidden_in_commands: false } },
      components: {
        "minecraft:icon": { textures: { default: tex } },
        "minecraft:display_name": { value: name },
        "minecraft:max_stack_size": 1,
        "minecraft:hand_equipped": true,
        "minecraft:use_modifiers": { use_duration: 0.05, movement_modifier: 1.0 },
        "minecraft:can_destroy_in_creative": false,
        "noct:control": { action: id },
      },
    },
  });
}
write(`${RP}/textures/item_texture.json`, { resource_pack_name: "NOCTERRA_RP", texture_name: "atlas.items", texture_data: itemTextures });

// ───────── UI icons (every ICON("x") used in scripts) ─────────
const icons = new Set();
for (const f of walk("scripts")) {
  for (const m of fs.readFileSync(f, "utf8").matchAll(/ICON\("([a-z0-9_]+)"\)/g)) icons.add(m[1]);
}
for (const i of icons) writePng(`textures/noct/ui/${i}.png`, glassIcon(32, "#9fb6ff"), `UI icon "${i}"`);
for (const c of chars) writePng(`textures/noct/portraits/${c.id}.png`, glassIcon(64, c.visual.color), `portrait ${c.name}`);

// ───────── enemy entities ─────────
const lang = { en: [], ko: [] };
for (const e of enemies) {
  const short = e.entity.split(":")[1];
  const shape = e.tier === "boss" ? "boss" : ["rift_hound", "frost_mite", "gale_wisp", "lumen_moth", "volt_drone"].includes(e.id) ? "beast" : "humanoid";
  const size = { boss: [3.2, 4.5], beast: [0.9, 0.9], humanoid: [0.7, 2.0] }[shape];
  const speed = e.tier === "boss" ? 0.22 : shape === "beast" ? 0.3 : 0.25;
  write(`${BP}/entities/${short}.json`, {
    format_version: "1.21.0",
    "minecraft:entity": {
      description: { identifier: e.entity, is_spawnable: true, is_summonable: true, is_experimental: false },
      components: {
        "minecraft:type_family": { family: ["noct_enemy", e.tier, "monster", "mob"] },
        "minecraft:health": { value: 100000, max: 100000 },
        // All vanilla damage is ignored — HP/Break are server-scripted (scripts/combat).
        "minecraft:damage_sensor": { triggers: [{ cause: "all", deals_damage: "no" }] },
        "minecraft:collision_box": { width: size[0], height: size[1] },
        "minecraft:physics": {},
        "minecraft:pushable": { is_pushable: e.tier !== "boss", is_pushable_by_piston: false },
        "minecraft:knockback_resistance": { value: e.tier === "boss" ? 1 : e.tier === "elite" ? 0.5 : 0 },
        "minecraft:movement": { value: speed },
        "minecraft:movement.basic": {},
        "minecraft:jump.static": {},
        "minecraft:navigation.walk": { can_walk: true, avoid_water: true, can_open_doors: false },
        "minecraft:follow_range": { value: 24, max: 32 },
        "minecraft:nameable": { always_show: true, allow_name_tag_renaming: false },
        "minecraft:despawn": { despawn_from_distance: { min_distance: 96, max_distance: 128 } },
        "minecraft:behavior.float": { priority: 0 },
        "minecraft:behavior.nearest_attackable_target": { priority: 1, must_see: false, reselect_targets: true, within_radius: 20, entity_types: [{ filters: { test: "is_family", subject: "other", value: "player" }, max_dist: 20 }] },
        "minecraft:behavior.move_towards_target": { priority: 2, speed_multiplier: 1.0, within_radius: 24 },
        "minecraft:behavior.look_at_player": { priority: 3, look_distance: 12 },
        "minecraft:behavior.random_stroll": { priority: 5, speed_multiplier: 0.6 },
        "minecraft:behavior.random_look_around": { priority: 6 },
        ...(e.tier === "boss" ? { "minecraft:scale": { value: 1.0 } } : {}),
      },
    },
  });
  const tex = `textures/noct/entity/${short}`;
  writePng(`${tex}.png`, glassIcon(64, ELEMENT_HEX[e.element]), `enemy texture ${e.name}`);
  write(`${RP}/entity/${short}.entity.json`, {
    format_version: "1.10.0",
    "minecraft:client_entity": {
      description: {
        identifier: e.entity,
        materials: { default: "entity_alphatest" },
        textures: { default: tex },
        geometry: { default: `geometry.noct.enemy_${shape}` },
        animations: { idle: "animation.noct.enemy.idle" },
        scripts: { animate: ["idle"] },
        render_controllers: ["controller.render.default"],
        spawn_egg: { base_color: ELEMENT_HEX[e.element], overlay_color: "#10121a" },
      },
    },
  });
  lang.en.push(`entity.${e.entity}.name=${e.name}`, `item.spawn_egg.entity.${e.entity}.name=Spawn ${e.name}`);
  lang.ko.push(`entity.${e.entity}.name=${e.name}`, `item.spawn_egg.entity.${e.entity}.name=${e.name} 소환`);
}
replaceMe.push("- `geometry.noct.enemy_{humanoid,beast,boss}` — box placeholders in models/entity/noct_enemy.geo.json");

// Placeholder geometry: simple readable silhouettes built from boxes.
const box = (origin, size, uv = [0, 0]) => ({ origin, size, uv });
const geo = (id, w, h, bones) => ({ description: { identifier: id, texture_width: 64, texture_height: 64, visible_bounds_width: w, visible_bounds_height: h, visible_bounds_offset: [0, h / 2, 0] }, bones });
write(`${RP}/models/entity/noct_enemy.geo.json`, {
  format_version: "1.12.0",
  "minecraft:geometry": [
    geo("geometry.noct.enemy_humanoid", 2, 3, [
      { name: "root", pivot: [0, 0, 0] },
      { name: "body", parent: "root", pivot: [0, 12, 0], cubes: [box([-4, 12, -2], [8, 12, 4], [16, 16])] },
      { name: "head", parent: "body", pivot: [0, 24, 0], cubes: [box([-4, 24, -4], [8, 8, 8], [0, 0])] },
      { name: "arm_l", parent: "body", pivot: [5, 22, 0], cubes: [box([4, 12, -2], [4, 12, 4], [40, 16])] },
      { name: "arm_r", parent: "body", pivot: [-5, 22, 0], cubes: [box([-8, 12, -2], [4, 12, 4], [40, 16])] },
      { name: "leg_l", parent: "root", pivot: [2, 12, 0], cubes: [box([0, 0, -2], [4, 12, 4], [0, 16])] },
      { name: "leg_r", parent: "root", pivot: [-2, 12, 0], cubes: [box([-4, 0, -2], [4, 12, 4], [0, 16])] },
    ]),
    geo("geometry.noct.enemy_beast", 2, 2, [
      { name: "root", pivot: [0, 0, 0] },
      { name: "body", parent: "root", pivot: [0, 8, 0], cubes: [box([-4, 5, -7], [8, 7, 14], [0, 32])] },
      { name: "head", parent: "body", pivot: [0, 10, -7], cubes: [box([-3, 7, -13], [6, 6, 6], [0, 0])] },
      { name: "leg_l", parent: "root", pivot: [2, 5, 0], cubes: [box([1, 0, -5], [2, 5, 2], [40, 0]), box([1, 0, 3], [2, 5, 2], [40, 0])] },
      { name: "leg_r", parent: "root", pivot: [-2, 5, 0], cubes: [box([-3, 0, -5], [2, 5, 2], [40, 0]), box([-3, 0, 3], [2, 5, 2], [40, 0])] },
    ]),
    geo("geometry.noct.enemy_boss", 6, 6, [
      { name: "root", pivot: [0, 0, 0] },
      { name: "body", parent: "root", pivot: [0, 24, 0], cubes: [box([-16, 20, -12], [32, 28, 24], [0, 0])] },
      { name: "head", parent: "body", pivot: [0, 48, -8], cubes: [box([-10, 44, -26], [20, 16, 16], [0, 0])] },
      { name: "arm_l", parent: "body", pivot: [18, 44, 0], cubes: [box([16, 8, -6], [10, 36, 12], [0, 0])] },
      { name: "arm_r", parent: "body", pivot: [-18, 44, 0], cubes: [box([-26, 8, -6], [10, 36, 12], [0, 0])] },
      { name: "leg_l", parent: "root", pivot: [8, 20, 0], cubes: [box([4, 0, -6], [10, 20, 12], [0, 0])] },
      { name: "leg_r", parent: "root", pivot: [-8, 20, 0], cubes: [box([-14, 0, -6], [10, 20, 12], [0, 0])] },
    ]),
  ],
});
write(`${RP}/animations/noct_enemy.animation.json`, {
  format_version: "1.8.0",
  animations: {
    "animation.noct.enemy.idle": {
      loop: true,
      bones: {
        body: { position: [0, "math.sin(query.anim_time * 180) * 0.4", 0] },
        leg_l: { rotation: ["math.sin(query.modified_distance_moved * 38) * 35 * query.modified_move_speed", 0, 0] },
        leg_r: { rotation: ["-math.sin(query.modified_distance_moved * 38) * 35 * query.modified_move_speed", 0, 0] },
      },
    },
  },
});

// ───────── lang ─────────
for (const [id, name] of controls) {
  const clean = name.replace(/§./g, "");
  lang.en.push(`item.noct:ctl_${id}=${clean}`);
  lang.ko.push(`item.noct:ctl_${id}=${clean}`);
}
write(`${RP}/texts/en_US.lang`, `pack.name=NOCTERRA RP\npack.description=NOCTERRA visuals\n${lang.en.join("\n")}\n`);
write(`${RP}/texts/ko_KR.lang`, `pack.name=NOCTERRA RP\npack.description=NOCTERRA 비주얼\n${lang.ko.join("\n")}\n`);
write(`${RP}/texts/languages.json`, ["en_US", "ko_KR"]);
write(`${BP}/texts/en_US.lang`, "pack.name=NOCTERRA BP\npack.description=NOCTERRA gameplay\n");
write(`${BP}/texts/languages.json`, ["en_US"]);
writePng("pack_icon.png", glassIcon(128, "#9a6bff"), "RP pack icon");
fs.copyFileSync(path.join(RP, "pack_icon.png"), path.join(BP, "pack_icon.png"));

replaceMe.push(
  "- Particles: `scripts/audio/Fx.ts` PARTICLES table maps noct:* ids to vanilla particles",
  "- Sounds: `scripts/audio/Fx.ts` SOUNDS table maps noct.* ids to vanilla sounds",
  "- Playable character models: not yet authored (players keep their skin; see docs/UI.md)",
);
write("docs/REPLACE_ME.md", `# REPLACE_ME — placeholder assets\n\nGenerated by \`tools/gen-assets.mjs\`. Replacing a PNG in place is safe: the generator never overwrites an existing file.\n\n${[...new Set(replaceMe)].sort().join("\n")}\n`);
console.log(`[gen-assets] ${controls.length} items, ${enemies.length} enemies, ${icons.size} ui icons, ${chars.length} portraits`);

function* walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) yield* walk(p);
    else if (p.endsWith(".ts")) yield p;
  }
}
