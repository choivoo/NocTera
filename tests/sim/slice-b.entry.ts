/**
 * Vertical Slice B: Astrum → Gacha menu → 10 pull → cinematic → 4★ obtained →
 * Party (via menu) → deploy in field → persistent after restart.
 */
import assert from "node:assert/strict";
import fs from "fs";
import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
import "../../scripts/main";
import { game } from "../../scripts/runtime/Game";
import { openBanner } from "../../scripts/ui/GachaScreen";
import { openMainMenu } from "../../scripts/ui/Menus";
import { enemies } from "../../scripts/combat/EnemyRuntime";
import { getCharacter } from "../../scripts/data/registry";

const m = mc as unknown as typeof import("./mock-server");
const answers = (ui as unknown as typeof import("./mock-server-ui")).answers;
const [phase, file] = process.argv.slice(2);
m.loadDynamic(file);
m.boot();

async function settle(ticks: number) {
  for (let i = 0; i < ticks; i++) {
    m.advance(1);
    await m.flush();
  }
}

async function run() {
  const p = m.joinPlayer("P2", "Puller");
  await settle(200);
  const s = game().sessions.get("P2")!;
  if (phase === "1") {
    const isNew = () => Object.keys(s.profile.characters).find((id) => id !== "seria" && id !== "rin" && getCharacter(id).rarity >= 4);
    let rounds = 0;
    while (!isNew() && rounds < 10) {
      rounds++;
      s.profile.currency.astrum = 1600; // one 10-pull (quest reward amount)
      answers.push(1); // banner screen → "10회 호출"
      const flow = openBanner(s, "event_seria_01");
      await settle(400); // cinematic + reveal
      await flow;
      assert.equal(s.profile.currency.astrum, 0, "10 pulls charged");
      assert.equal(s.profile.gachaHistory.length, 10 * rounds, "history recorded");
    }
    assert.ok(p.titles.some((t) => t.includes("★")), "card reveal titles");
    const newChar = isNew();
    assert.ok(newChar, "a new ≥4★ character obtained");
    assert.ok(s.busyUntil <= m.system.currentTick, "input lock released after cinematic");

    // Main menu → PARTY → slot 3 → pick new character → back out
    const owned = Object.keys(s.profile.characters);
    answers.push(1, 2, owned.indexOf(newChar!));
    const menu = openMainMenu(s);
    await settle(10);
    await menu;
    assert.equal(s.profile.party[2], newChar, "party slot 3 set via menu");

    // Deploy in the field
    m.advance(30);
    m.tap(p, "char3");
    m.advance(5);
    assert.equal(s.activeId, newChar);
    const mob = m.overworld.spawnEntity("noct:rift_hound", { x: 2, y: 64, z: 0.5 });
    const st = enemies.state(mob as any)!;
    for (let i = 0; i < 6; i++) {
      m.tap(p, "attack");
      m.advance(9);
    }
    assert.ok(st.hp < st.maxHp || !mob.isValid, "new character fights");
    fs.writeFileSync(`${file}.expect.json`, JSON.stringify({ newChar, pity: s.profile.pity, owned: Object.keys(s.profile.characters).sort() }));
    m.world.beforeEvents.playerLeave.fire({ player: p });
    m.advance(2);
    m.dumpDynamic(file);
    console.log(`SLICE B phase 1 OK — pulled ${newChar}, pity ${JSON.stringify(s.profile.pity)}`);
  } else {
    const exp = JSON.parse(fs.readFileSync(`${file}.expect.json`, "utf8"));
    assert.deepEqual(Object.keys(s.profile.characters).sort(), exp.owned);
    assert.deepEqual(s.profile.pity, exp.pity, "pity persisted");
    assert.equal(s.profile.party[2], exp.newChar, "party persisted");
    console.log("SLICE B phase 2 OK");
  }
}
run().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
