// Static validation: JSON syntax, manifests, cross-references between data,
// packs and textures. Exits non-zero on any error.
import fs from "fs";
import path from "path";

const errors = [];
const warn = [];
const err = (m) => errors.push(m);
const BP = "behavior_pack/NOCTERRA_BP";
const RP = "resource_pack/NOCTERRA_RP";

function* walk(dir, ext) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) yield* walk(p, ext);
    else if (p.endsWith(ext)) yield p;
  }
}
const json = new Map();
for (const root of [BP, RP, "database"]) {
  for (const f of walk(root, ".json")) {
    try {
      json.set(f, JSON.parse(fs.readFileSync(f, "utf8")));
    } catch (e) {
      err(`JSON syntax: ${f}: ${e.message}`);
    }
  }
}
const get = (p) => json.get(p);

// Manifests
const bpm = get(`${BP}/manifest.json`);
const rpm = get(`${RP}/manifest.json`);
const uuids = [bpm.header.uuid, ...bpm.modules.map((m) => m.uuid), rpm.header.uuid, ...rpm.modules.map((m) => m.uuid)];
if (new Set(uuids).size !== uuids.length) err("manifest: duplicate UUIDs");
for (const u of uuids) if (!/^[0-9a-f-]{36}$/.test(u)) err(`manifest: bad uuid ${u}`);
if (!bpm.dependencies.some((d) => d.uuid === rpm.header.uuid)) err("manifest: BP must depend on RP");
const script = bpm.modules.find((m) => m.type === "script");
if (!script) err("manifest: no script module");
else if (!fs.existsSync(path.join(BP, script.entry))) warn.push(`script entry ${script.entry} missing — run npm run build`);
for (const dep of ["@minecraft/server", "@minecraft/server-ui"]) if (!bpm.dependencies.some((d) => d.module_name === dep)) err(`manifest: missing ${dep}`);

// Data cross references
const chars = [...json.entries()].filter(([k]) => k.startsWith("database/characters/")).map(([, v]) => v);
const weapons = get("database/weapons/weapons.json");
const enemies = get("database/enemies/enemies.json");
const charIds = new Set(chars.map((c) => c.id));
const weaponIds = new Set(weapons.map((w) => w.id));
const ELEMENTS = ["IGNIS", "GLACIA", "VOLT", "AER", "LUX", "UMBRA"];
for (const c of chars) {
  if (!ELEMENTS.includes(c.element)) err(`character ${c.id}: bad element`);
  if (c.resonance.length !== 6) err(`character ${c.id}: needs 6 resonance entries`);
  if (!c.kit.ultimate.energyCost) err(`character ${c.id}: ultimate energyCost missing`);
  for (const a of [c.kit.skill, c.kit.ultimate, c.kit.switchIn, c.qte?.action].filter(Boolean))
    for (const e of a.effects) if (e.element && !ELEMENTS.includes(e.element)) err(`character ${c.id}: effect element ${e.element}`);
}
for (const b of get("database/banners/banners.json")) {
  const valid = b.type === "weapon" ? weaponIds : charIds;
  for (const id of [b.featured5, ...b.featured4, ...b.pool5, ...b.pool4].filter(Boolean)) if (!valid.has(id)) err(`banner ${b.id}: unknown ${id}`);
  for (const id of b.pool3) if (!weaponIds.has(id)) err(`banner ${b.id}: unknown 3★ ${id}`);
  for (const id of b.featured4) if (!b.pool4.includes(id)) warn.push(`banner ${b.id}: featured 4★ ${id} not in pool4`);
}
for (const w of weapons) if (w.passive.perRefinement.length !== 5) err(`weapon ${w.id}: needs 5 refinement entries`);
for (const c of chars) if (!weapons.some((w) => w.rarity === 3 && w.type === c.weapon)) err(`character ${c.id}: no 3★ starter weapon of type ${c.weapon}`);
const enemyIds = new Set(enemies.map((e) => e.id));
const world = get("database/world/astera.json");
for (const z of world.zones) for (const e of z.enemies) if (!enemyIds.has(e)) err(`zone ${z.id}: unknown enemy ${e}`);
for (const b of world.bosses) if (!enemyIds.has(b.id)) err(`boss ${b.id} unknown`);
for (const d of get("database/world/dungeons.json")) for (const w of d.waves) for (const e of w) if (!enemyIds.has(e)) err(`dungeon ${d.id}: unknown enemy ${e}`);
const dialogue = get("database/quests/dialogue.json");
for (const q of get("database/quests/main.json")) for (const s of q.steps) {
  if (s.dialogue && !dialogue[s.dialogue]) err(`quest ${q.id}: missing dialogue ${s.dialogue}`);
  if (s.beacon && !world.beacons.some((b) => b.id === s.beacon)) err(`quest ${q.id}: unknown beacon ${s.beacon}`);
  if (s.boss && !enemyIds.has(s.boss)) err(`quest ${q.id}: unknown boss ${s.boss}`);
}

// Packs: every enemy has BP + RP entity; textures exist
for (const e of enemies) {
  const short = e.entity.split(":")[1];
  if (!get(`${BP}/entities/${short}.json`)) err(`enemy ${e.id}: BP entity missing`);
  const ce = get(`${RP}/entity/${short}.entity.json`);
  if (!ce) err(`enemy ${e.id}: RP client entity missing`);
  else for (const t of Object.values(ce["minecraft:client_entity"].description.textures)) if (!fs.existsSync(`${RP}/${t}.png`)) err(`missing texture ${t}.png`);
}
const geos = new Set(["geometry.humanoid.custom", "geometry.humanoid.customSlim", "geometry.cape"]); // vanilla
for (const [f, v] of json) if (f.startsWith(`${RP}/models/`)) for (const g of v["minecraft:geometry"] ?? []) geos.add(g.description.identifier);
for (const [f, v] of json) if (f.startsWith(`${RP}/entity/`)) for (const g of Object.values(v["minecraft:client_entity"].description.geometry)) if (!geos.has(g)) err(`${f}: unknown geometry ${g}`);
const itemTex = get(`${RP}/textures/item_texture.json`).texture_data;
for (const [k, v] of Object.entries(itemTex)) if (!fs.existsSync(`${RP}/${v.textures}.png`)) err(`item texture ${k} → ${v.textures}.png missing`);
for (const [f, v] of json) {
  if (!f.startsWith(`${BP}/items/`)) continue;
  const icon = v["minecraft:item"].components["minecraft:icon"]?.textures?.default;
  if (icon && !itemTex[icon]) err(`${f}: icon ${icon} not in item_texture.json`);
}
// UI icon / portrait references from scripts
for (const f of walk("scripts", ".ts")) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/ICON\("([a-z0-9_]+)"\)/g)) if (!fs.existsSync(`${RP}/textures/noct/ui/${m[1]}.png`)) err(`${f}: missing UI icon ${m[1]}`);
}
for (const c of charIds) if (!fs.existsSync(`${RP}/textures/noct/portraits/${c}.png`)) err(`portrait missing: ${c}`);

// Player rig: every controller animation key and render-controller array entry must resolve.
const pe = get(`${RP}/entity/player.entity.json`)?.["minecraft:client_entity"]?.description;
if (pe) {
  const animKeys = new Set(Object.keys(pe.animations));
  const allAnims = new Set();
  for (const [f, v] of json) if (f.startsWith(`${RP}/animations/`)) for (const k of Object.keys(v.animations ?? {})) allAnims.add(k);
  for (const [k, full] of Object.entries(pe.animations)) if (full.startsWith("animation.noct.") && !allAnims.has(full)) err(`player.entity: ${k} → missing ${full}`);
  const acs = get(`${RP}/animation_controllers/noct_char.ac.json`)?.animation_controllers ?? {};
  for (const [cid, c] of Object.entries(acs)) {
    if (!Object.values(pe.animations).includes(cid)) err(`controller ${cid} not referenced by player.entity`);
    for (const [sn, st] of Object.entries(c.states)) {
      for (const a of st.animations) for (const k of typeof a === "string" ? [a] : Object.keys(a)) if (!animKeys.has(k)) err(`${cid}.${sn}: animation key ${k} not in player.entity`);
      for (const tr of st.transitions ?? []) for (const target of Object.keys(tr)) if (!c.states[target]) err(`${cid}.${sn}: transition to missing state ${target}`);
    }
  }
  const rc = get(`${RP}/render_controllers/noct_char.rc.json`)?.render_controllers?.["controller.render.noct.character"];
  for (const g of rc?.arrays?.geometries?.["Array.geo"] ?? []) if (!pe.geometry[g.replace("Geometry.", "")]) err(`render controller geometry ${g} missing`);
  for (const t of rc?.arrays?.textures?.["Array.tex"] ?? []) {
    const path = pe.textures[t.replace("Texture.", "")];
    if (!path || !fs.existsSync(`${RP}/${path}.png`)) err(`render controller texture ${t} missing`);
  }
  for (const g of Object.values(pe.geometry)) if (!geos.has(g)) err(`player.entity geometry ${g} undefined`);
  const bpPlayer = get(`${BP}/entities/player.json`);
  const props = bpPlayer?.["minecraft:entity"]?.description?.properties ?? {};
  for (const k of ["noct:char", "noct:anim"]) if (!props[k]?.client_sync) err(`BP player.json missing client_sync property ${k}`);
}

for (const w of warn) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`[validate] ${json.size} JSON files, ${charIds.size} characters, ${weaponIds.size} weapons, ${enemyIds.size} enemies — ${errors.length} errors, ${warn.length} warnings`);
process.exit(errors.length ? 1 : 0);
