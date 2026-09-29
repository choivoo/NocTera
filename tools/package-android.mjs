// Distribution packaging for Android (and all Bedrock platforms).
// Builds every install format from the same pack folders and validates each one.
// Game code, data and save format are untouched — this only changes how packs are shipped.
//
//   NOCTERRA_v<ver>.mcaddon            both packs (each in its own folder)
//   NOCTERRA_BP_v<ver>.mcpack          behavior pack, manifest.json at archive root
//   NOCTERRA_RP_v<ver>.mcpack          resource pack, manifest.json at archive root
//   NOCTERRA_BP_v<ver>.zip             NOCTERRA_BP/manifest.json  (drop into behavior_packs/)
//   NOCTERRA_RP_v<ver>.zip             NOCTERRA_RP/manifest.json  (drop into resource_packs/)
//   NOCTERRA_ANDROID_MANUAL_INSTALL/   behavior_packs/NOCTERRA_BP, resource_packs/NOCTERRA_RP, INSTALL_ANDROID_KR.md
//   NOCTERRA_ANDROID_MANUAL_INSTALL.zip
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const BP_SRC = path.join(ROOT, "behavior_pack/NOCTERRA_BP");
const RP_SRC = path.join(ROOT, "resource_pack/NOCTERRA_RP");
const bpm = JSON.parse(fs.readFileSync(path.join(BP_SRC, "manifest.json"), "utf8"));
const rpm = JSON.parse(fs.readFileSync(path.join(RP_SRC, "manifest.json"), "utf8"));
const VER = bpm.header.version.join(".");
const OUT = path.join(ROOT, "builds", `v${VER}`);
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();

if (!fs.existsSync(path.join(BP_SRC, "scripts/main.js"))) throw new Error("scripts/main.js missing — run `npm run build` first");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const zipDir = (out, cwd, entries) => sh("zip", ["-q", "-r", "-X", out, ...entries, "-x", "*.DS_Store", "-x", "__MACOSX/*"], cwd);
const f = {
  mcaddon: path.join(OUT, `NOCTERRA_v${VER}.mcaddon`),
  bpPack: path.join(OUT, `NOCTERRA_BP_v${VER}.mcpack`),
  rpPack: path.join(OUT, `NOCTERRA_RP_v${VER}.mcpack`),
  bpZip: path.join(OUT, `NOCTERRA_BP_v${VER}.zip`),
  rpZip: path.join(OUT, `NOCTERRA_RP_v${VER}.zip`),
  manualZip: path.join(OUT, "NOCTERRA_ANDROID_MANUAL_INSTALL.zip"),
};
// .mcpack: manifest.json must sit at the archive root (zip the folder CONTENTS).
zipDir(f.bpPack, BP_SRC, ["."]);
zipDir(f.rpPack, RP_SRC, ["."]);
// .zip for manual install and .mcaddon: exactly one folder level (NOCTERRA_BP/manifest.json).
zipDir(f.bpZip, path.dirname(BP_SRC), ["NOCTERRA_BP"]);
zipDir(f.rpZip, path.dirname(RP_SRC), ["NOCTERRA_RP"]);
zipDir(f.mcaddon, path.dirname(BP_SRC), ["NOCTERRA_BP"]);
zipDir(f.mcaddon, path.dirname(RP_SRC), ["NOCTERRA_RP"]);
// Manual install folder (mirrors games/com.mojang/).
const M = path.join(OUT, "NOCTERRA_ANDROID_MANUAL_INSTALL");
fs.cpSync(BP_SRC, path.join(M, "behavior_packs/NOCTERRA_BP"), { recursive: true });
fs.cpSync(RP_SRC, path.join(M, "resource_packs/NOCTERRA_RP"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "docs/install/INSTALL_ANDROID_KR.md"), path.join(M, "INSTALL_ANDROID_KR.md"));
zipDir(f.manualZip, OUT, ["NOCTERRA_ANDROID_MANUAL_INSTALL"]);

// ───────────── validation ─────────────
const errors = [];
const ok = [];
const list = (z) => sh("unzip", ["-Z1", z]).split("\n").filter(Boolean);
const readEntry = (z, e) => sh("unzip", ["-p", z, e]);
function checkManifest(label, json, expectType) {
  let m;
  try {
    m = JSON.parse(json);
  } catch (e) {
    return errors.push(`${label}: manifest.json is not valid JSON`);
  }
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const ids = [m.header?.uuid, ...(m.modules ?? []).map((x) => x.uuid)];
  if (!ids.every((u) => uuidRe.test(u ?? ""))) errors.push(`${label}: invalid UUID`);
  if (new Set(ids).size !== ids.length) errors.push(`${label}: duplicate UUID`);
  if (m.header.version.join(".") !== VER) errors.push(`${label}: version ${m.header.version.join(".")} ≠ ${VER}`);
  if (!Array.isArray(m.header.min_engine_version) || m.header.min_engine_version.length !== 3) errors.push(`${label}: bad min_engine_version`);
  if (!m.modules.some((x) => x.type === expectType)) errors.push(`${label}: no "${expectType}" module`);
  if (expectType === "data") {
    const dep = m.dependencies.find((d) => d.uuid === rpm.header.uuid);
    if (!dep) errors.push(`${label}: BP does not depend on RP uuid`);
    else if (dep.version.join(".") !== VER) errors.push(`${label}: BP→RP dependency version ${dep.version.join(".")} ≠ ${VER}`);
  }
  return m;
}
function nested(entries, folder) {
  return entries.some((e) => e.startsWith(`${folder}/${folder}/`));
}
function check(file, spec) {
  const name = path.basename(file);
  if (!new RegExp(spec.name).test(name)) errors.push(`${name}: unexpected file name`);
  try {
    sh("unzip", ["-tq", file]);
  } catch {
    return errors.push(`${name}: ZIP integrity test failed`);
  }
  const entries = list(file);
  for (const [prefix, type, folder] of spec.packs) {
    const man = `${prefix}manifest.json`;
    if (!entries.includes(man)) errors.push(`${name}: ${man} missing (manifest must be at ${prefix || "archive root"})`);
    else checkManifest(`${name}:${man}`, readEntry(file, man), type);
    if (folder && nested(entries, folder)) errors.push(`${name}: nested ${folder}/${folder}/ folder`);
    const must = type === "data" ? ["scripts/main.js", "entities/player.json", "items/ctl_attack.json"] : ["textures/item_texture.json", "entity/player.entity.json", "sounds/sound_definitions.json", "ui/hud_screen.json"];
    for (const m of must) if (!entries.includes(prefix + m)) errors.push(`${name}: ${prefix + m} missing`);
  }
  if (spec.noRootFolder && entries.some((e) => e.startsWith("NOCTERRA_"))) errors.push(`${name}: .mcpack must not wrap the pack in a folder`);
  if (entries.some((e) => e.includes("__MACOSX") || e.endsWith(".DS_Store"))) errors.push(`${name}: OS junk files`);
  ok.push(`${name.padEnd(40)} ${(fs.statSync(file).size / 1024).toFixed(0).padStart(5)} KB  ${entries.length} entries`);
}
check(f.mcaddon, { name: `^NOCTERRA_v${VER}\\.mcaddon$`, packs: [["NOCTERRA_BP/", "data", "NOCTERRA_BP"], ["NOCTERRA_RP/", "resources", "NOCTERRA_RP"]] });
check(f.bpPack, { name: `^NOCTERRA_BP_v${VER}\\.mcpack$`, packs: [["", "data"]], noRootFolder: true });
check(f.rpPack, { name: `^NOCTERRA_RP_v${VER}\\.mcpack$`, packs: [["", "resources"]], noRootFolder: true });
check(f.bpZip, { name: `^NOCTERRA_BP_v${VER}\\.zip$`, packs: [["NOCTERRA_BP/", "data", "NOCTERRA_BP"]] });
check(f.rpZip, { name: `^NOCTERRA_RP_v${VER}\\.zip$`, packs: [["NOCTERRA_RP/", "resources", "NOCTERRA_RP"]] });
check(f.manualZip, { name: "^NOCTERRA_ANDROID_MANUAL_INSTALL\\.zip$", packs: [["NOCTERRA_ANDROID_MANUAL_INSTALL/behavior_packs/NOCTERRA_BP/", "data", "NOCTERRA_BP"], ["NOCTERRA_ANDROID_MANUAL_INSTALL/resource_packs/NOCTERRA_RP/", "resources", "NOCTERRA_RP"]] });
if (!list(f.manualZip).includes("NOCTERRA_ANDROID_MANUAL_INSTALL/INSTALL_ANDROID_KR.md")) errors.push("manual zip: INSTALL_ANDROID_KR.md missing");
// All formats must carry byte-identical manifests (same pack everywhere).
const sameBP = [readEntry(f.bpPack, "manifest.json"), readEntry(f.bpZip, "NOCTERRA_BP/manifest.json"), readEntry(f.mcaddon, "NOCTERRA_BP/manifest.json")];
if (new Set(sameBP).size !== 1) errors.push("BP manifest differs between formats");

console.log(ok.join("\n"));
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`[package-android] ${OUT} — ${errors.length} errors`);
process.exit(errors.length ? 1 : 0);
