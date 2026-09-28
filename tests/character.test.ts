import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSave } from "./helpers";
import { bootstrapAccount } from "../scripts/account/AccountService";
import { addCharacterExp, ascend, obtainCharacter } from "../scripts/character/CharacterManager";
import { computeStats, effectiveTalent, expToNext } from "../scripts/character/Stats";
import { partySynergies, setPartySlot } from "../scripts/party/PartyManager";
import { Characters } from "../scripts/data/registry";

function fresh() {
  const { save, clock } = makeSave();
  const [p] = save.load("c", "C");
  bootstrapAccount(p, clock.now());
  return { p, now: clock.now() };
}

test("starter kit: Seria + Rin, 2-person party, weapons equipped, idempotent", () => {
  const { p, now } = fresh();
  assert.deepEqual(Object.keys(p.characters).sort(), ["rin", "seria"]);
  assert.deepEqual(p.party, ["seria", "rin", null, null]);
  assert.ok(p.characters.seria.weaponUid);
  assert.equal(bootstrapAccount(p, now), false);
});

test("all 10 characters load with complete kits", () => {
  assert.equal(Characters.size, 10);
  for (const c of Characters.values()) {
    assert.ok(c.kit.normal.hits.length >= 3, c.id);
    assert.ok(c.kit.skill.effects.length > 0, c.id);
    assert.ok((c.kit.ultimate.energyCost ?? 0) > 0, c.id);
    assert.equal(c.resonance.length, 6, c.id);
  }
});

test("EXP respects ascension cap 20", () => {
  const { p } = fresh();
  addCharacterExp(p, "seria", 10_000_000);
  assert.equal(p.characters.seria.level, 20);
  assert.ok(p.characters.seria.exp < expToNext(20));
});

test("ascension requires cap + materials, raises cap", () => {
  const { p } = fresh();
  addCharacterExp(p, "seria", 10_000_000);
  assert.equal(ascend(p, "seria"), "cost");
  p.currency.credit = 1e6;
  p.materials = { crystal_glacia: 10, rift_core: 10 };
  assert.equal(ascend(p, "seria"), null);
  assert.equal(p.characters.seria.ascension, 1);
  addCharacterExp(p, "seria", 10_000_000);
  assert.equal(p.characters.seria.level, 40);
});

test("stats grow with level and weapon", () => {
  const { p } = fresh();
  const s1 = computeStats(p, p.characters.seria);
  addCharacterExp(p, "seria", 10_000_000);
  const s20 = computeStats(p, p.characters.seria);
  assert.ok(s20.atk > s1.atk && s20.maxHp > s1.maxHp);
  assert.equal(s1.critRate, 5);
});

test("duplicates → resonance up to R6, talent boosts at R3/R5", () => {
  const { p, now } = fresh();
  for (let i = 0; i < 8; i++) obtainCharacter(p, "rin", now);
  assert.equal(p.characters.rin.resonance, 6);
  assert.equal(effectiveTalent(p.characters.rin, "skill"), 4);
  assert.equal(effectiveTalent(p.characters.rin, "ultimate"), 4);
  assert.ok((p.materials.stella_violet ?? 0) > 0);
});

test("party: cannot add unowned, swap on duplicate, synergy", () => {
  const { p, now } = fresh();
  assert.equal(setPartySlot(p, 2, "nox"), "not_owned");
  obtainCharacter(p, "mirel", now);
  assert.equal(setPartySlot(p, 2, "mirel"), null);
  assert.deepEqual(partySynergies(["seria", "mirel"]).map((s) => s.id), ["GLACIA"]);
  assert.equal(setPartySlot(p, 3, "seria"), null);
  assert.deepEqual(p.party, [null, "rin", "mirel", "seria"]);
});

test("weapon duplicates refine up to R5, then add a new copy", async () => {
  const { obtainOrRefineWeapon } = await import("../scripts/character/CharacterManager");
  const { p } = fresh();
  const first = obtainOrRefineWeapon(p, "eternal_snow");
  assert.equal(first.refined, false);
  for (let i = 0; i < 4; i++) assert.equal(obtainOrRefineWeapon(p, "eternal_snow").refined, true);
  assert.equal(first.weapon.refinement, 5);
  assert.equal(obtainOrRefineWeapon(p, "eternal_snow").refined, false);
});
