// API / Bedrock compatibility audit (runs in `npm run check`).
//  1. Manifest script-module versions == the installed stable typings the code is compiled against.
//  2. min_engine_version ≥ the vanilla player.json format we override (player entity safety).
//  3. The simulation mock may only expose members that exist in the real typings —
//     otherwise tests could pass on APIs that don't exist in Bedrock.
//  4. No beta/preview packages; no `@minecraft/server-gametest` or other non-stable modules.
//  5. Early-execution rule: world/entity access is forbidden in system.beforeEvents.startup handlers.
import fs from "fs";

const errors = [];
const notes = [];
const bp = JSON.parse(fs.readFileSync("behavior_pack/NOCTERRA_BP/manifest.json", "utf8"));
const rp = JSON.parse(fs.readFileSync("resource_pack/NOCTERRA_RP/manifest.json", "utf8"));
const pkgVer = (n) => JSON.parse(fs.readFileSync(`node_modules/${n}/package.json`, "utf8")).version;

for (const dep of bp.dependencies.filter((d) => d.module_name)) {
  const installed = pkgVer(dep.module_name);
  if (/beta|preview|rc|internal/.test(dep.version)) errors.push(`${dep.module_name}: non-stable version ${dep.version}`);
  if (dep.version !== installed) errors.push(`${dep.module_name}: manifest ${dep.version} ≠ typings ${installed}`);
  else notes.push(`${dep.module_name} ${dep.version} (stable, matches typings)`);
  if (!["@minecraft/server", "@minecraft/server-ui"].includes(dep.module_name)) errors.push(`unexpected module ${dep.module_name}`);
}

const ver = (a) => a.map(Number);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const playerFmt = ver(JSON.parse(fs.readFileSync("tools/vanilla/player.json", "utf8")).format_version.split("."));
for (const [name, m] of [["BP", bp], ["RP", rp]]) {
  if (cmp(m.header.min_engine_version, playerFmt) < 0) errors.push(`${name} min_engine_version ${m.header.min_engine_version} < player.json format ${playerFmt.join(".")}`);
}
notes.push(`min_engine_version ${bp.header.min_engine_version.join(".")} (player.json format ${playerFmt.join(".")})`);

// 3. mock ⊆ real typings
const dts = fs.readFileSync("node_modules/@minecraft/server/index.d.ts", "utf8") + fs.readFileSync("node_modules/@minecraft/server-ui/index.d.ts", "utf8");
const HARNESS = new Set(["advance", "flush", "boot", "joinPlayer", "tap", "tapSlot", "loadDynamic", "dumpDynamic", "registries", "log", "titles", "messages", "actionbar", "props", "inventory", "items", "fills", "view", "entities", "subs", "fire", "answers", "overworld", "families", "tags", "effects", "constructor", "Signal", "Container", "Base", "walls", "rotation"]);
for (const f of ["tests/sim/mock-server.ts", "tests/sim/mock-server-ui.ts"]) {
  const src = fs.readFileSync(f, "utf8");
  const names = new Set();
  for (const m of src.matchAll(/^\s{2}(?:override\s+)?(?:get\s+)?([a-zA-Z_]\w*)\s*(?:\(|=|:)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export (?:class|const|function) ([A-Za-z_]\w*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s{4}([a-zA-Z_]\w*): \(/gm)) names.add(m[1]);
  notes.push(`${f}: ${names.size} members checked`);
  for (const n of names) {
    if (HARNESS.has(n)) continue;
    if (!new RegExp(`\\b${n}\\b`).test(dts)) errors.push(`${f}: mock member "${n}" does not exist in the real API`);
  }
}

// 5. early execution
const main = fs.readFileSync("scripts/main.ts", "utf8");
const startup = main.match(/beforeEvents\.startup\.subscribe\(\(ev\) => \{([\s\S]*?)\n\}\);/);
if (startup && /world\.|getDimension|getPlayers/.test(startup[1])) errors.push("world access inside startup (early execution) handler");

for (const n of notes) console.log(`  ok  ${n}`);
for (const e of errors) console.error(`ERROR ${e}`);
console.log(`[audit-api] ${errors.length} errors`);
process.exit(errors.length ? 1 : 0);
