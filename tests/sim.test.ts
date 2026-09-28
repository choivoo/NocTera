import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

async function runSlice(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "noct-sim-"));
  const out = path.join(dir, `${name}.mjs`);
  await build({
    entryPoints: [`tests/sim/${name}.entry.ts`],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: out,
    alias: { "@minecraft/server": "./tests/sim/mock-server.ts", "@minecraft/server-ui": "./tests/sim/mock-server-ui.ts" },
    logLevel: "error",
  });
  const db = path.join(dir, "world.json");
  const r1 = execFileSync("node", [out, "1", db], { encoding: "utf8" });
  assert.match(r1, /phase 1 OK/);
  const r2 = execFileSync("node", [out, "2", db], { encoding: "utf8" });
  assert.match(r2, /phase 2 OK/);
}

test("Vertical Slice A end-to-end (mock engine, two processes = server restart)", () => runSlice("slice-a"));
test("Vertical Slice B: gacha → obtain → party → field → persist", () => runSlice("slice-b"));
