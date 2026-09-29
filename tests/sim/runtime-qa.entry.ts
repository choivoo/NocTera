/** Runtime hardening QA in the mock engine (SIMULATION VERIFIED, not device-verified). */
import assert from "node:assert/strict";
import * as mc from "@minecraft/server";
import "../../scripts/main";
import { game } from "../../scripts/runtime/Game";
import { enemies } from "../../scripts/combat/EnemyRuntime";
import { pickTarget, scoreTarget } from "../../scripts/combat/Targeting";
import { poolSize, dmgStats } from "../../scripts/ui/DamageNumbers";
import { spawnBoss } from "../../scripts/world/World";
import { particleBudget } from "../../scripts/audio/Fx";

const m = mc as unknown as typeof import("./mock-server");
m.boot();
async function settle(n: number) {
  for (let i = 0; i < n; i++) {
    m.advance(1);
    await m.flush();
  }
}
const out: string[] = [];

async function run() {
  const p = m.joinPlayer("RT", "RT");
  await settle(260);
  const s = game().sessions.get("RT")!;
  const t0 = m.system.currentTick;
  // Isolate from zone spawns (all zones are within ~200 blocks of the origin).
  p.teleport({ x: 3000.5, y: 64, z: 3000.5 });
  for (const e of m.overworld.getEntities({ families: ["noct_enemy"] })) e.remove();
  await settle(2);

  // Aim assist: prefer smaller angle/closer; never through walls.
  assert.ok(scoreTarget({ angle: 5, distance: 5, preferred: false }, 35, 14) < scoreTarget({ angle: 30, distance: 5, preferred: false }, 35, 14));
  assert.ok(scoreTarget({ angle: 20, distance: 10, preferred: true }, 35, 14) < scoreTarget({ angle: 15, distance: 10, preferred: false }, 35, 14), "current target preference");
  const a = m.overworld.spawnEntity("noct:rift_hound", { x: p.location.x + 8, y: p.location.y, z: p.location.z + 2 });
  enemies.register(a as any);
  assert.equal(pickTarget(s, 14, 35)?.id, a.id, "assist finds enemy in cone");
  m.overworld.walls = () => true;
  assert.equal(pickTarget(s, 14, 35), undefined, "no target through walls");
  m.overworld.walls = null;
  s.profile.settings.aimAssist = 0;
  assert.equal(pickTarget(s, 14, (35 * s.profile.settings.aimAssist) / 70), undefined, "assist off");
  s.profile.settings.aimAssist = 70;
  out.push("aim assist: cone, preference, LOS, off — OK");

  // Target lock: acquires, rotates toward an enemy off to the side, releases on death.
  a.remove();
  const b = m.overworld.spawnEntity("noct:rift_hound", { x: p.location.x + 1.6, y: p.location.y, z: p.location.z + 1.6 });
  enemies.register(b as any);
  s.profile.settings.targetLock = true;
  m.tapSlot(p, 0);
  assert.ok(s.lockId, "lock acquired");
  const a2 = m.overworld.getEntities({}).find((e) => e.id === s.lockId)!;
  assert.ok(a2 && (a2 === b || Math.hypot(a2.location.x - p.location.x, a2.location.z - p.location.z) <= 16), "locked a nearby enemy");
  if (Math.hypot(a2.location.x - p.location.x, a2.location.z - p.location.z) > 2.5) p.teleport({ x: a2.location.x - 1.5, y: a2.location.y, z: a2.location.z - 1.5 });
  assert.notDeepEqual(p.rotation, { x: 0, y: 0 }, "camera/attack corrected");
  enemies.state(a2 as any)!.hp = 1;
  for (let i = 0; i < 30 && a2.isValid; i++) {
    m.tapSlot(p, 0);
    await settle(9);
  }
  assert.ok(!a2.isValid, "locked target defeated");
  m.tapSlot(p, 0);
  assert.equal(s.lockId, null, "lock released on death");
  s.profile.settings.targetLock = false;
  out.push("target lock: acquire, face, auto-release — OK");

  // Damage number pool under boss multi-hit spam stays bounded and reuses entities.
  const boss = m.overworld.spawnEntity("noct:frost_devourer", { x: p.location.x + 2, y: p.location.y, z: p.location.z });
  enemies.register(boss as any);
  for (let i = 0; i < 60; i++) {
    for (const rt of s.chars.values()) rt.hp = 99999;
    m.tapSlot(p, 0);
    await settle(3);
  }
  const pool = poolSize();
  assert.ok(pool.total <= 10, `pool bounded (${pool.total})`);
  assert.ok(dmgStats.coalesced + dmgStats.reused > 0, "numbers coalesced/reused");
  out.push(`damage numbers: pool ${pool.total}, spawned ${dmgStats.spawned}, reused ${dmgStats.reused}, coalesced ${dmgStats.coalesced}`);

  // Boss: no duplicate on re-present, arena leash, reset when abandoned.
  assert.equal(spawnBoss("frost_devourer", s), true);
  const bossCount = m.overworld.getEntities({ type: "noct:frost_devourer" }).length;
  spawnBoss("frost_devourer", s);
  assert.equal(m.overworld.getEntities({ type: "noct:frost_devourer" }).length, bossCount, "no duplicate boss");
  const bs = enemies.state(boss as any)!;
  bs.hp = Math.round(bs.maxHp * 0.3);
  bs.updatePhase();
  boss.teleport({ x: boss.location.x + 60, y: boss.location.y, z: boss.location.z });
  await settle(2);
  assert.ok(Math.abs(boss.location.x - (p.location.x + 2)) < 1, "leashed back to arena");
  p.teleport({ x: p.location.x + 500, y: p.location.y, z: p.location.z + 500 });
  await settle(700);
  assert.equal(bs.hp, bs.maxHp, "boss reset after being abandoned");
  assert.equal(bs.phase, 1);
  out.push("boss: no duplicate, leash, reset — OK");
  p.teleport({ x: 0.5, y: 64, z: 0.5 });

  // Reconnect mid-ultimate: leave during the cinematic, rejoin → no stuck lock/camera/anim.
  const seria = s.chars.get("seria")!;
  s.profile.activeSlot = 0;
  seria.energy = 60;
  m.tapSlot(p, 2);
  await settle(5);
  assert.ok(s.busyUntil > m.system.currentTick, "ultimate cinematic in progress");
  m.world.beforeEvents.playerLeave.fire({ player: p });
  await settle(3);
  const p2 = m.joinPlayer("RT", "RT");
  await settle(260);
  const s2 = game().sessions.get("RT")!;
  assert.ok(s2.busyUntil <= m.system.currentTick, "no stale input lock after reconnect");
  assert.equal(p2.getProperty("noct:anim"), 0, "animation state reset");
  assert.equal(s2.profile.bootstrap.stage, "ready");
  out.push("reconnect mid-ultimate — OK");

  // Budgets
  s2.profile.settings.graphics = "PERFORMANCE";
  await settle(5);
  assert.equal(particleBudget.preset, "PERFORMANCE", "global FX budget follows lowest preset");
  out.push(`particle budget preset ${particleBudget.preset}, dropped ${particleBudget.dropped}`);
  out.push(`elapsed ${m.system.currentTick - t0} ticks`);
  console.log(out.join("\n"));
  console.log("RUNTIME QA OK");
}
run().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
