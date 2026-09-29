/** /noct:noct selftest + report through the registered custom command (mock engine). */
import assert from "node:assert/strict";
import * as mc from "@minecraft/server";
import "../../scripts/main";

const m = mc as unknown as typeof import("./mock-server");
m.boot();
async function settle(n: number) {
  for (let i = 0; i < n; i++) {
    m.advance(1);
    await m.flush();
  }
}
async function run() {
  const p = m.joinPlayer("DV", "Dev");
  await settle(260);
  const cmd = m.registries.commands.get("noct:noct")!;
  assert.ok(cmd, "/noct:noct registered");
  cmd({ sourceEntity: p, sourceType: "Entity" }, "selftest");
  await settle(2);
  const st = p.messages.find((x) => x.includes("SELFTEST"))!;
  assert.ok(st, "selftest printed");
  console.log(st.replace(/§./g, ""));
  assert.ok(!/§cFAIL §f/.test(st) && /FAIL 0/.test(st), "no FAIL on a clean install");
  cmd({ sourceEntity: p, sourceType: "Entity" }, "report");
  await settle(2);
  const rep = p.messages.join("\n");
  for (const k of ["NOCTERRA 1.0.1", "API @minecraft/server@2.10.0", "schema 3", "character seria", "quest prologue", "graphics BALANCED", "modules"]) assert.ok(rep.includes(k), `report has ${k}`);
  assert.ok(m.world.getDynamicProperty("noct:last_report"), "report saved");
  console.log("DEVTOOLS OK");
}
run().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
