/**
 * UI QA across screen classes: renders the combat HUD for every preset with a
 * worst-case state (4-member party, long quest, buffs, shield, QTE, last hit)
 * and checks visible line width against each class's budget (clipping /
 * overflow), line count (overlap with the hotbar), and touch-target rules.
 */
import assert from "node:assert/strict";
import * as mc from "@minecraft/server";
import "../../scripts/main";
import { game } from "../../scripts/runtime/Game";
import { renderHud } from "../../scripts/ui/Hud";
import { obtainCharacter } from "../../scripts/character/CharacterManager";
import { HOTBAR_ACTIONS } from "../../scripts/input/Controls";
import { formatDamage } from "../../scripts/ui/DamageNumbers";

const m = mc as unknown as typeof import("./mock-server");
m.boot();

// Visible character budget per line (≈ glyphs that fit the left glass panel at 100% HUD scale).
const BUDGET: Record<string, { width: number; lines: number }> = {
  COVER: { width: 30, lines: 8 },
  COMPACT: { width: 34, lines: 8 },
  PHONE: { width: 42, lines: 9 },
  FOLD_EXPANDED: { width: 64, lines: 10 },
  WINDOWS: { width: 64, lines: 10 },
};
const visible = (l: string) => [...l.replace(/§./g, "")].length;

async function run() {
  const p = m.joinPlayer("QA", "QA");
  for (let i = 0; i < 260; i++) {
    m.advance(1);
    await m.flush();
  }
  const s = game().sessions.get("QA")!;
  for (const id of ["nox", "lumia"]) obtainCharacter(s.profile, id, 0);
  s.profile.party = ["seria", "rin", "nox", "lumia"];
  s.syncParty();
  const t = m.system.currentTick;
  s.chars.get("nox")!.qteReadyUntil = t + 100;
  s.chars.get("lumia")!.energy = 999;
  s.active!.shield = 12345;
  s.active!.shieldUntil = t + 100;
  s.addBuff({ stat: "atkPct", value: 25, until: t + 200, source: "lumia:atkPct" });
  s.addBuff({ stat: "critRate", value: 20, until: t + 200, source: "set:winter_dream" });
  s.lastHit = "§6✦123,456 §dBREAK CURRENT §cBREAK";
  s.lastHitUntil = t + 100;
  const report: string[] = [];
  for (const preset of Object.keys(BUDGET)) {
    for (const scale of [80, 100, 120]) {
      s.profile.settings.uiPreset = preset as any;
      s.profile.settings.hudScale = scale;
      s.invalidateStats();
      const lines = renderHud(s).split("\n");
      const widest = Math.max(...lines.map(visible));
      const b = BUDGET[preset];
      const widthBudget = Math.round((b.width * 120) / Math.max(100, scale));
      report.push(`${preset.padEnd(14)} ${scale}%  lines ${lines.length}/${b.lines}  widest ${widest}/${widthBudget}`);
      assert.ok(lines.length <= b.lines, `${preset}@${scale}: ${lines.length} lines overlaps hotbar`);
      assert.ok(widest <= widthBudget, `${preset}@${scale}: line of ${widest} glyphs clips\n${lines.find((l) => visible(l) === widest)}`);
    }
  }
  // Touch targets: every combat action is one hotbar slot; right-thumb actions occupy the first 4 slots.
  assert.deepEqual(HOTBAR_ACTIONS.slice(0, 4), ["attack", "skill", "ultimate", "dodge"]);
  assert.equal(HOTBAR_ACTIONS.filter((a) => a === "char").length, 4);
  // Damage numbers stay short (≤ 2 lines, ≤ 14 glyphs per line).
  for (const size of [0, 1, 2] as const) {
    const txt = formatDamage({ amount: 1234567, crit: true, reaction: "BREAK CURRENT", element: "VOLT", kind: "hit" }, size);
    for (const l of txt.split("\n")) assert.ok(visible(l) <= 14, `damage text too wide: ${l}`);
  }
  console.log(report.join("\n"));
  console.log("UI QA OK");
}
run().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
