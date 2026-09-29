// Character rig QA (static, per character): bones, textures, animations, pivots,
// floating weapons, detached limbs, scale, grounding, facing, UV bounds.
import fs from "fs";

const RP = "resource_pack/NOCTERRA_RP";
const order = JSON.parse(fs.readFileSync("database/art/order.json", "utf8"));
const REQUIRED = ["root", "waist", "body", "head", "rightArm", "leftArm", "rightLeg", "leftLeg", "rightItem", "leftItem", "noct_weapon_r", "noct_weapon_l", "noct_hair", "noct_coat", "noct_extra"];
const CORE_ANIMS = ["idle", "idle2", "run", "air", "secondary", "attack1", "attack2", "attack3", "skill", "ultimate", "dodge", "perfect", "switch_in", "switch_out", "hurt", "knockback", "death", "victory", "select", "qte"];
const errors = [];
const rows = [];
const boxDist = (c, p) => {
  const d = [0, 1, 2].map((i) => Math.max(c.origin[i] - p[i], 0, p[i] - (c.origin[i] + c.size[i])));
  return Math.hypot(...d);
};
const cubeGap = (a, b) => Math.hypot(...[0, 1, 2].map((i) => Math.max(a.origin[i] - (b.origin[i] + b.size[i]), 0, b.origin[i] - (a.origin[i] + a.size[i]))));
const art = JSON.parse(fs.readFileSync("database/art/characters.json", "utf8"));
const sigs = new Map();
for (const id of order) {
  const e = (m) => errors.push(`${id}: ${m}`);
  const geo = JSON.parse(fs.readFileSync(`${RP}/models/entity/noct_char_${id}.geo.json`, "utf8"))["minecraft:geometry"][0];
  const bones = Object.fromEntries(geo.bones.map((b) => [b.name, b]));
  for (const b of REQUIRED) if (!bones[b]) e(`bone missing: ${b}`);
  for (const b of geo.bones) if (b.parent && !bones[b.parent]) e(`bone ${b.name} parent ${b.parent} missing`);
  if (!fs.existsSync(`${RP}/textures/noct/characters/${id}.png`)) e("texture missing");
  const all = geo.bones.flatMap((b) => (b.cubes ?? []).map((c) => ({ ...c, bone: b.name })));
  for (const c of all) for (const f of Object.values(c.uv)) if (f.uv[0] + f.uv_size[0] > 64 || f.uv[1] + f.uv_size[1] > 64) e(`uv out of texture in ${c.bone}`);
  // grounding + scale
  const minY = Math.min(...all.map((c) => c.origin[1]));
  const maxY = Math.max(...all.filter((c) => c.bone !== "noct_extra" && c.bone !== "noct_hair").map((c) => c.origin[1] + c.size[1]));
  if (Math.abs(minY) > 0.01) e(`feet not on ground (minY ${minY})`);
  if (maxY < 28 || maxY > 38) e(`height ${maxY} outside 28–38 px`);
  // head sits on torso, face on north
  const torsoTop = Math.max(...bones.body.cubes.map((c) => c.origin[1] + c.size[1]));
  const head = bones.head.cubes[0];
  if (Math.abs(head.origin[1] - torsoTop) > 0.5) e(`head detached (${head.origin[1]} vs torso ${torsoTop})`);
  if (head.uv.north.uv[1] !== 8) e("face texture not on north (front)");
  // limbs attached at pivots
  for (const arm of ["rightArm", "leftArm"]) {
    const c = bones[arm].cubes[0];
    if (boxDist(c, bones[arm].pivot) > 1.6) e(`${arm} detached from shoulder pivot`);
  }
  for (const leg of ["rightLeg", "leftLeg"]) if (boxDist(bones[leg].cubes[0], bones[leg].pivot) > 0.5) e(`${leg} detached from hip pivot`);
  // weapons within reach of the hand
  // Every weapon cube must connect (≤0.6px gaps) to a cube held in the hand.
  // Designed floaters (art: weapon.hold starting "float") may hover ≤ 6px from the hand.
  const floats = String(art[id].weapon.hold).startsWith("float");
  for (const [wb, hand] of [["noct_weapon_r", "rightItem"], ["noct_weapon_l", "leftItem"]]) {
    const cubes = bones[wb].cubes ?? [];
    const reach = floats ? 6 : 3.2;
    const linked = new Set(cubes.filter((c) => boxDist(c, bones[hand].pivot) <= reach));
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of cubes) if (!linked.has(c) && [...linked].some((l) => cubeGap(c, l) <= 0.6)) (linked.add(c), (grew = true));
    }
    for (const c of cubes) if (!linked.has(c)) e(`${wb} cube floating (${boxDist(c, bones[hand].pivot).toFixed(1)}px from hand, not connected)`);
  }
  if (!(bones.noct_weapon_r.cubes.length + bones.noct_weapon_l.cubes.length)) e("no weapon geometry");
  // animations
  const anims = JSON.parse(fs.readFileSync(`${RP}/animations/noct_char_${id}.animation.json`, "utf8")).animations;
  for (const a of CORE_ANIMS) if (!anims[`animation.noct.${id}.${a}`]) e(`animation missing: ${a}`);
  for (const [name, a] of Object.entries(anims)) for (const bone of Object.keys(a.bones ?? {})) if (!bones[bone]) e(`${name} animates missing bone ${bone}`);
  // individuality: signature of core motion must differ from every other character
  const sig = JSON.stringify(["attack1", "skill", "ultimate", "idle", "run"].map((k) => anims[`animation.noct.${id}.${k}`]));
  for (const [other, osig] of sigs) if (osig === sig) e(`core animations identical to ${other}`);
  sigs.set(id, sig);
  rows.push(`${id.padEnd(6)} bones ${geo.bones.length}  cubes ${all.length}  anims ${Object.keys(anims).length}  height ${maxY.toFixed(1)}`);
}
console.log(rows.join("\n"));
for (const x of errors) console.error(`ERROR ${x}`);
console.log(`[qa-rig] ${order.length} characters — ${errors.length} errors`);
process.exit(errors.length ? 1 : 0);
