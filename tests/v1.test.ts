import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateProfile, PROFILE_SCHEMA_VERSION } from "../scripts/account/PlayerProfile";
import { characterAllowance } from "../scripts/coop/CoopManager";
import { onLogin } from "../scripts/account/AccountService";
import { isUnlocked } from "../scripts/quest/QuestManager";
import { Characters } from "../scripts/data/registry";
import art from "../database/art/characters.json";
import cinematics from "../database/art/cinematics.json";

test("v1 → v2 migration keeps data and adds settings/co-op/exploration", () => {
  const v1 = { schema: 1, name: "Old", currency: { astrum: 42 }, characters: { seria: { level: 30 } }, settings: { uiPreset: "PHONE", cameraShake: false }, quests: { prologue: { status: "completed", step: 5, progress: {} } }, party: ["seria", null, null, null] };
  const p = migrateProfile(v1, "x", 0);
  assert.equal(p.schema, PROFILE_SCHEMA_VERSION);
  assert.equal(p.currency.astrum, 42);
  assert.equal(p.characters.seria.level, 30);
  assert.equal(p.settings.uiPreset, "PHONE");
  assert.equal(p.settings.cameraShake, false);
  assert.equal(p.settings.hudScale, 100);
  assert.ok(p.settings.hudLayout.party);
  assert.deepEqual(p.exploration.treasures, []);
  assert.equal(p.coop.groupId, null);
  onLogin(p, 0);
  assert.ok(isUnlocked(p, "gacha"), "unlock derived from completed prologue");
  assert.ok(!isUnlocked(p, "dungeon"));
});

test("co-op character allowance: 1→4, 2→2, 3–4→1", () => {
  assert.deepEqual([1, 2, 3, 4].map(characterAllowance), [4, 2, 1, 1]);
});

test("every character has art direction, cinematic ≤ 3s and passive effects", () => {
  for (const id of Characters.keys()) {
    assert.ok((art as any)[id]?.palette, `${id} palette`);
    const c = (cinematics as any)[id];
    assert.ok(c && c.length <= 60 && c.impact <= 50, `${id} cinematic ≤ 3 s`);
    const def = Characters.get(id)!;
    assert.ok(def.kit.passives.some((p) => p.effect), `${id} has a functional passive`);
  }
});
