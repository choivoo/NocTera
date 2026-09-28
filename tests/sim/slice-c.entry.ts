/**
 * Vertical Slice C — full Chapter 1: Prologue → Act I (Frost Devourer) →
 * Act II (dungeon, Rift Knight) → Act III (Void Seraph) → Epilogue →
 * chapter reward + feature unlocks → persisted after restart.
 */
import assert from "node:assert/strict";
import * as mc from "@minecraft/server";
import * as ui from "@minecraft/server-ui";
import "../../scripts/main";
import { game } from "../../scripts/runtime/Game";
import { enemies } from "../../scripts/combat/EnemyRuntime";
import { activeQuest } from "../../scripts/quest/QuestManager";
import { resolve, beacon } from "../../scripts/world/World";
import { enterDungeon } from "../../scripts/dungeon/DungeonManager";
import { Enemies } from "../../scripts/data/registry";

const m = mc as unknown as typeof import("./mock-server");
const answers = (ui as unknown as typeof import("./mock-server-ui")).answers;
const [phase, file] = process.argv.slice(2);
m.loadDynamic(file);
m.boot();
for (let i = 0; i < 500; i++) answers.push(0); // tap through title + every dialogue line

async function settle(ticks: number) {
  for (let i = 0; i < ticks; i++) {
    m.advance(1);
    await m.flush();
  }
}

async function run() {
  const p = m.joinPlayer("P3", "Hero");
  await settle(260);
  const s = game().sessions.get("P3")!;
  const q = () => activeQuest(s.profile);

  if (phase === "2") {
    assert.equal(s.profile.story.chapter, 2, "chapter progress persisted");
    assert.equal(s.profile.quests.epilogue.status, "completed");
    for (const f of ["gacha", "dungeon", "coop", "weekly"]) assert.ok(s.profile.story.flags[`unlock_${f}`], `${f} unlock persisted`);
    console.log("SLICE C phase 2 OK");
    return;
  }

  const heal = () => {
    for (const rt of s.chars.values()) rt.hp = s.stats(rt.id, m.system.currentTick).maxHp;
  };
  async function kill(enemyId: string) {
    const def = Enemies.get(enemyId)!;
    const e = m.overworld.spawnEntity(def.entity, { x: p.location.x + 1.5, y: p.location.y, z: p.location.z });
    const st = enemies.state(e as any)!;
    st.hp = 1;
    for (let i = 0; i < 40 && e.isValid; i++) {
      heal();
      m.tapSlot(p, 0);
      await settle(10);
    }
    assert.ok(!e.isValid, `${enemyId} defeated`);
  }
  async function killBossInWorld(id: string) {
    await settle(5);
    const boss = m.overworld.getEntities({ families: ["noct_enemy"] }).find((e) => e.typeId === Enemies.get(id)!.entity);
    assert.ok(boss, `${id} spawned by quest`);
    p.teleport({ x: boss!.location.x - 1.5, y: boss!.location.y, z: boss!.location.z });
    enemies.state(boss as any)!.hp = 1;
    for (let i = 0; i < 40 && boss!.isValid; i++) {
      heal();
      m.tapSlot(p, 0);
      await settle(10);
    }
    assert.ok(!boss!.isValid, `${id} defeated`);
  }
  async function goBeacon(id: string) {
    p.teleport(resolve(beacon(id)!.offset));
    await settle(45);
  }
  async function killMany(id: string, n: number) {
    for (let i = 0; i < n; i++) await kill(id);
  }
  const expectStep = (quest: string, type: string) => {
    assert.equal(q()?.def.id, quest);
    assert.equal(q()?.step.type, type, `${quest} step`);
  };

  // PROLOGUE (wake dialogue auto-played after the title flow)
  await settle(40);
  expectStep("prologue", "kill");
  assert.ok(!s.profile.story.flags.unlock_gacha, "gacha locked before prologue");
  await killMany("rift_hound", 3);
  await settle(30);
  m.advance(30);
  m.tapSlot(p, 5);
  await settle(30);
  expectStep("prologue", "beacon");
  await goBeacon("silver_plains");
  await settle(60);
  assert.equal(s.profile.quests.prologue.status, "completed", "prologue complete");
  assert.ok(s.profile.story.flags.unlock_gacha, "GACHA unlocked");
  assert.ok(s.profile.currency.astrum >= 1600 + 1600, "prologue Astrum reward");

  // ACT I
  await settle(80);
  await goBeacon("frozen_forest");
  await killMany("frost_mite", 8);
  await settle(80);
  expectStep("act1_frost", "boss");
  await killBossInWorld("frost_devourer");
  await settle(120);
  assert.equal(s.profile.quests.act1_frost.status, "completed");
  assert.ok(s.profile.story.flags.unlock_dungeon, "DUNGEON unlocked");

  // ACT II
  await settle(80);
  await goBeacon("old_facility");
  await killMany("volt_drone", 10);
  await settle(80);
  expectStep("act2_facility", "dungeon");
  assert.equal(enterDungeon(s, "exp_dungeon"), null, "dungeon entry");
  await settle(80);
  for (let wave = 0; wave < 6 && q()?.step.type === "dungeon"; wave++) {
    for (const e of m.overworld.getEntities({ tags: [`dungeon:${s.id}`] })) {
      p.teleport({ x: e.location.x - 1.5, y: e.location.y, z: e.location.z });
      enemies.state(e as any)!.hp = 1;
      for (let i = 0; i < 20 && e.isValid; i++) {
        heal();
        m.tapSlot(p, 0);
        await settle(10);
      }
    }
    await settle(120);
  }
  expectStep("act2_facility", "beacon");
  assert.ok(s.profile.materials.exp_data > 0, "dungeon reward granted");
  await goBeacon("underground_ruins");
  await kill("rift_knight");
  await settle(120);
  assert.equal(s.profile.quests.act2_facility.status, "completed");
  assert.ok(s.profile.story.flags.unlock_coop, "CO-OP unlocked");

  // ACT III
  await settle(80);
  await goBeacon("void_scar");
  await killMany("shade_husk", 15);
  await settle(100);
  expectStep("act3_scar", "boss");
  await killBossInWorld("void_seraph");
  await settle(300);

  // EPILOGUE → chapter end
  assert.equal(s.profile.quests.act3_scar.status, "completed");
  assert.equal(s.profile.quests.epilogue?.status, "completed", "epilogue complete");
  assert.equal(s.profile.story.chapter, 2, "Chapter 1 cleared");
  assert.ok(s.profile.story.flags.unlock_weekly, "WEEKLY unlocked");
  assert.ok(p.titles.some((t) => t.includes("CHAPTER 1")), "chapter-end cutscene");
  m.world.beforeEvents.playerLeave.fire({ player: p });
  m.advance(2);
  m.dumpDynamic(file);
  console.log(`SLICE C phase 1 OK — astrum ${s.profile.currency.astrum}, NR ${s.profile.nexusRank}`);
}
run().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
