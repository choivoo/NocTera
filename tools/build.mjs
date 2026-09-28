// Build: regenerate registries/assets → bundle TypeScript → (optional) package .mcaddon.
import { build } from "esbuild";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const pkg = process.argv.includes("--package");
execSync("node tools/gen-registry.mjs", { stdio: "inherit" });
execSync("node tools/gen-assets.mjs", { stdio: "inherit" });

await build({
  entryPoints: ["scripts/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "neutral",
  outfile: "behavior_pack/NOCTERRA_BP/scripts/main.js",
  external: ["@minecraft/server", "@minecraft/server-ui"],
  sourcemap: false,
  minify: false,
  legalComments: "none",
  logLevel: "info",
});

if (pkg) {
  const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  fs.mkdirSync("builds", { recursive: true });
  const out = path.resolve(`builds/NOCTERRA_v${version}.mcaddon`);
  fs.rmSync(out, { force: true });
  // .mcaddon = zip containing both pack folders.
  execSync(`cd behavior_pack && zip -qr "${out}" NOCTERRA_BP -x "*.DS_Store"`);
  execSync(`cd resource_pack && zip -qr "${out}" NOCTERRA_RP -x "*.DS_Store"`);
  console.log(`[build] packaged ${out}`);
}
