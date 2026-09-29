import { test } from "node:test";
import assert from "node:assert/strict";
import { applyElement, findReaction } from "../scripts/combat/Elements";
import { ComboTracker } from "../scripts/combat/ComboTracker";
import { judgeIncoming, newDodgeState, tryDodge } from "../scripts/combat/DodgeJudge";
import { computeDamage } from "../scripts/combat/DamageCalc";
import { EnemyState } from "../scripts/combat/EnemyState";
import { getCharacter, Enemies } from "../scripts/data/registry";
import { SeededRng } from "../scripts/core/Rng";

test("reaction table", () => {
  assert.equal(findReaction("GLACIA", "IGNIS")?.id, "MELT");
  assert.equal(findReaction("IGNIS", "GLACIA")?.id, "MELT");
  assert.equal(findReaction("GLACIA", "VOLT")?.id, "BREAK_CURRENT");
  assert.equal(findReaction("UMBRA", "LUX")?.id, "COLLAPSE");
  assert.equal(findReaction("VOLT", "IGNIS")?.id, "OVERDRIVE");
  assert.equal(findReaction("IGNIS", "AER")?.id, "SPREAD");
  assert.equal(findReaction("AER", "AER"), null);
  assert.equal(findReaction("LUX", "GLACIA"), null);
});

test("aura applies, reacts, consumes, expires", () => {
  let r = applyElement(null, "GLACIA", 0, 200);
  assert.equal(r.aura?.element, "GLACIA");
  r = applyElement(r.aura, "IGNIS", 10, 200);
  assert.equal(r.reaction?.id, "MELT");
  assert.equal(r.aura, null);
  const expired = applyElement({ element: "GLACIA", expiresAt: 5 }, "IGNIS", 10, 200);
  assert.equal(expired.reaction, null);
});

test("Seria combo: 5 steps, window reset, recovery lock", () => {
  const combo = new ComboTracker(getCharacter("seria").kit.normal.hits);
  let t = 0;
  const steps: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = combo.attack(t)!;
    steps.push(a.step);
    t += 9;
  }
  assert.deepEqual(steps, [0, 1, 2, 3, 4, 0]);
  assert.equal(combo.attack(t - 8), null, "input during recovery rejected");
  combo.attack(t + 100);
  assert.equal(combo.step, 0, "window expired → restart");
});

test("perfect dodge timing", () => {
  const s = newDodgeState();
  assert.equal(judgeIncoming(s, 100, 6), "hit");
  tryDodge(s, 96, 10, 16);
  assert.equal(judgeIncoming(s, 100, 6), "perfect");
  const s2 = newDodgeState();
  tryDodge(s2, 90, 12, 16);
  assert.equal(judgeIncoming(s2, 100, 6), "dodged");
  assert.equal(tryDodge(s2, 95, 12, 16), false, "cooldown");
});

test("damage: reaction and break increase output; def reduces", () => {
  const stats = { maxHp: 1000, atk: 100, def: 50, critRate: 0, critDmg: 50, elementDmg: 0, energyRegen: 100, breakPower: 0, healBonus: 0 };
  const base = { attacker: stats, mult: 1, elemental: true, bonusDmgPct: 0, targetDef: 0, targetBroken: false, brokenTakenMult: 1.3, reaction: null, defConstant: 400 };
  const rng = new SeededRng(1);
  const plain = computeDamage(base, rng).amount;
  assert.equal(plain, 100);
  const melt = computeDamage({ ...base, reaction: findReaction("GLACIA", "IGNIS") }, rng).amount;
  assert.equal(melt, 175);
  assert.equal(computeDamage({ ...base, targetBroken: true }, rng).amount, 130);
  assert.ok(computeDamage({ ...base, targetDef: 400 }, rng).amount === 50);
});

test("enemy break + phases", () => {
  const e = new EnemyState(Enemies.get("frost_devourer")!);
  assert.equal(e.applyBreak(899, 0, 100), false);
  assert.equal(e.applyBreak(5, 1, 100), true);
  assert.ok(e.isBroken(50));
  assert.ok(!e.isBroken(101));
  e.applyDamage(e.maxHp * 0.5);
  assert.equal(e.updatePhase(), true);
  assert.equal(e.phase, 2);
});

test("dodge-cancel clears attack recovery but keeps the combo step", () => {
  const combo = new ComboTracker(getCharacter("kael").kit.normal.hits);
  combo.attack(0);
  assert.equal(combo.attack(1), null, "in recovery");
  combo.cancelRecovery();
  const next = combo.attack(2);
  assert.ok(next);
  assert.equal(next!.step, 1, "combo continues after cancel");
});
