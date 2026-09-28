/**
 * Vertical Slice A, end to end against the mocked engine:
 * join → loading intro → Astera → Seria+Rin granted → party → fight as Seria
 * (combo, skill, ultimate) → switch to Rin → kill → EXP → save → leave →
 * [new process] → rejoin → state intact.
 */
import assert from "node:assert/strict";
import fs from "fs";
import * as mc from "@minecraft/server";
import "../../scripts/main";
import { game } from "../../scripts/runtime/Game";
import { enemies } from "../../scripts/combat/EnemyRuntime";

const m = mc as unknown as typeof import("./mock-server");
const [phase, file] = process.argv.slice(2);
const expectFile = `${file}.expect.json`;
m.loadDynamic(file);
m.boot();

async function run() {
  const p = m.joinPlayer("P1", "Tester");
  m.advance(30);
  const s = game().sessions.get("P1")!;
  assert.ok(s, "session created");

  if (phase === "1") {
    assert.deepEqual(s.profile.party, ["seria", "rin", null, null], "starter party");
    assert.ok(p.titles.some((t) => t.includes("N O C T E R R A")), "loading intro shown");
    m.advance(160);
    await m.flush();
    assert.ok(p.titles.some((t) => t.includes("ASTERA")), "Astera entry");
    assert.equal(p.inventory.getItem(0)?.typeId, "noct:ctl_attack", "touch controls in hotbar");
    assert.equal(s.activeId, "seria");

    const expOf = () => ["seria", "rin"].reduce((a, id) => a + s.profile.characters[id].exp + s.profile.characters[id].level * 1e6, 0);
    const exp0 = expOf();
    // Fight as Seria
    const hound = m.overworld.spawnEntity("noct:rift_hound", { x: 2, y: 64, z: 0 });
    const st = enemies.state(hound as any)!;
    const hp0 = st.hp;
    for (let i = 0; i < 5; i++) {
      m.tap(p, "attack");
      m.advance(9);
    }
    assert.ok(st.hp < hp0, "combo damages enemy");
    const seria = s.chars.get("seria")!;
    assert.ok(seria.gauge > 0, "FROST gauge builds");
    const hpBeforeSkill = st.hp;
    m.tap(p, "skill");
    m.advance(2);
    assert.ok(st.hp < hpBeforeSkill || !hound.isValid, "Frozen Divide hits");
    assert.ok(seria.skillReadyAt > m.system.currentTick, "skill on cooldown");

    // Ultimate (charge energy through the real path: fill directly then fire)
    seria.energy = 60;
    const hound2 = m.overworld.spawnEntity("noct:shade_husk", { x: 3, y: 64, z: 0 });
    const st2 = enemies.state(hound2 as any)!;
    m.tap(p, "ultimate");
    m.advance(30);
    assert.equal(seria.energy < 60, true, "ultimate consumed energy");
    assert.ok(st2.hp < st2.maxHp || !hound2.isValid, "End of Winter hits");
    assert.ok(p.titles.some((t) => t.includes("END OF WINTER")), "ultimate cinematic title");

    // Switch to Rin and finish enemies
    m.advance(25);
    m.tap(p, "char2");
    m.advance(5);
    assert.equal(s.activeId, "rin", "switched to Rin");
    const hound3 = m.overworld.spawnEntity("noct:frost_mite", { x: 3, y: 64, z: 0.5 }); // on the firing line
    const st3 = enemies.state(hound3 as any)!;
    m.tap(p, "attack");
    m.advance(2);
    assert.ok(st3.hp < st3.maxHp, "Rin's shots land");
    for (let i = 0; i < 400 && (hound.isValid || hound2.isValid || hound3.isValid); i++) {
      m.tap(p, "attack");
      if (i % 20 === 0) m.tap(p, "skill");
      m.advance(8);
    }
    assert.ok(!hound.isValid && !hound2.isValid && !hound3.isValid, "enemies defeated");
    assert.ok(expOf() > exp0, "EXP gained");
    assert.ok(s.profile.currency.credit > 5000, "credit reward");

    // Perfect dodge against a telegraphed attack
    const brute = m.overworld.spawnEntity("noct:rift_knight", { x: 1.5, y: 64, z: 0 });
    const bs = enemies.state(brute as any)!;
    for (let i = 0; i < 80 && !bs.pendingImpact; i++) m.advance(1);
    assert.ok(bs.pendingImpact, "enemy telegraphs an attack");
    const impact = bs.pendingImpact!.tick;
    while (m.system.currentTick < impact - 3) m.advance(1);
    const hpBefore = s.active!.hp;
    m.tap(p, "dodge");
    m.advance(6);
    assert.ok(p.titles.some((t) => t.includes("PERFECT DODGE")), "perfect dodge triggers");
    assert.equal(s.active!.hp, hpBefore, "no damage taken on perfect dodge");
    brute.remove();

    // Leave → save
    const expected = { seria: s.profile.characters.seria, rin: s.profile.characters.rin, credit: s.profile.currency.credit, active: s.profile.activeSlot };
    m.world.beforeEvents.playerLeave.fire({ player: p });
    m.advance(2);
    assert.equal(game().sessions.size, 0);
    m.dumpDynamic(file);
    fs.writeFileSync(expectFile, JSON.stringify(expected));
    console.log(`SLICE A phase 1 OK — seria Lv.${expected.seria.level}, rin Lv.${expected.rin.level}, credit ${expected.credit}`);
  } else {
    const expected = JSON.parse(fs.readFileSync(expectFile, "utf8"));
    assert.deepEqual(s.profile.characters.seria, expected.seria, "Seria persisted");
    assert.deepEqual(s.profile.characters.rin, expected.rin, "Rin persisted");
    assert.equal(s.profile.currency.credit, expected.credit, "currency persisted");
    assert.equal(s.profile.activeSlot, expected.active, "active slot persisted");
    assert.ok(!p.titles.some((t) => t.includes("CHAPTER 1")), "returning player skips first-time intro");
    console.log("SLICE A phase 2 OK — state restored after restart");
  }
}
run().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
