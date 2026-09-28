import { test } from "node:test";
import assert from "node:assert/strict";
import { SeededRng } from "../scripts/core/Rng";
import { fiveStarRate, rollOnce } from "../scripts/gacha/GachaEngine";
import { GachaService } from "../scripts/gacha/GachaService";
import { getBanner } from "../scripts/data/registry";
import { emptyPity } from "../scripts/account/PlayerProfile";
import { makeSave } from "./helpers";
import { bootstrapAccount } from "../scripts/account/AccountService";
import { SaveManager } from "../scripts/save/SaveManager";

const banner = getBanner("event_seria_01");

test("rates: base below soft pity, ramps, hard pity = 100%", () => {
  assert.equal(fiveStarRate(banner, 1), 0.008);
  assert.equal(fiveStarRate(banner, 64), 0.008);
  assert.ok(fiveStarRate(banner, 65) > 0.008);
  assert.equal(fiveStarRate(banner, 80), 1);
});

test("hard pity: never more than 80 pulls without a 5★ (10k sims)", () => {
  const rng = new SeededRng(42);
  const pity = emptyPity();
  let since = 0;
  let max = 0;
  let fives = 0;
  for (let i = 0; i < 10000; i++) {
    const r = rollOnce(banner, pity, rng);
    since++;
    if (r.rarity === 5) {
      max = Math.max(max, since);
      since = 0;
      fives++;
    }
  }
  assert.ok(max <= 80, `max streak ${max}`);
  // Effective rate with soft pity should land around 1.5–2.2%.
  const rate = fives / 10000;
  assert.ok(rate > 0.012 && rate < 0.025, `rate ${rate}`);
});

test("4★ guaranteed at least every 10 pulls", () => {
  const rng = new SeededRng(7);
  const pity = emptyPity();
  let since = 0;
  for (let i = 0; i < 5000; i++) {
    const r = rollOnce(banner, pity, rng);
    since = r.rarity >= 4 ? 0 : since + 1;
    assert.ok(since < 10);
  }
});

test("50/50 loss guarantees next 5★ is featured", () => {
  const rng = new SeededRng(99);
  const pity = emptyPity();
  let checked = 0;
  let lastLost = false;
  for (let i = 0; i < 20000; i++) {
    const r = rollOnce(banner, pity, rng);
    if (r.rarity !== 5) continue;
    if (lastLost) {
      assert.equal(r.itemId, "seria");
      checked++;
    }
    lastLost = r.lostFiftyFifty;
  }
  assert.ok(checked > 10);
});

test("transaction: insufficient funds changes nothing", () => {
  const { save, clock } = makeSave();
  const [p] = save.load("g1", "G");
  const svc = new GachaService(new SeededRng(1), clock, (id) => save.saveNow(id));
  p.currency.astrum = 100;
  const before = JSON.stringify(p);
  const out = svc.pull(p, "event_seria_01", 10);
  assert.equal(out.ok, false);
  assert.equal(out.error, "insufficient");
  assert.equal(JSON.stringify(p), before);
});

test("transaction: 10 pull deducts exactly, grants 10, records history, persists immediately", () => {
  const { save, clock } = makeSave();
  const [p] = save.load("g2", "G");
  bootstrapAccount(p, clock.now());
  p.currency.astrum = 1600;
  p.currency.signal = 3;
  const svc = new GachaService(new SeededRng(5), clock, (id) => save.saveNow(id));
  const writes = save.writeCount;
  const out = svc.pull(p, "event_seria_01", 10);
  assert.equal(out.ok, true);
  assert.equal(out.results.length, 10);
  assert.equal(p.currency.signal, 0);
  assert.equal(p.currency.astrum, 1600 - 7 * 160);
  assert.equal(p.gachaHistory.length, 10);
  assert.deepEqual(p.gachaHistory.map((h) => h.pull), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.ok(out.results.some((r) => r.rarity >= 4));
  assert.equal(save.writeCount, writes + 1);
  assert.equal(save.isDirty("g2"), false);
});

test("transaction: re-entrant pull while locked is rejected (double-tap exploit)", () => {
  const { save, clock } = makeSave();
  const [p] = save.load("g3", "G");
  p.currency.astrum = 1_000_000;
  let inner: ReturnType<GachaService["pull"]> | null = null;
  const svc: GachaService = new GachaService(new SeededRng(3), clock, (id) => {
    inner = svc.pull(p, "event_seria_01", 10); // second tap arrives during commit
    return save.saveNow(id);
  });
  const out = svc.pull(p, "event_seria_01", 10);
  assert.equal(out.ok, true);
  assert.equal(inner!.ok, false);
  assert.equal(inner!.error, "locked");
  assert.equal(p.currency.astrum, 1_000_000 - 1600);
});

test("pity and guarantee persist across restart", () => {
  const { save, clock, storage } = makeSave();
  const [p] = save.load("g4", "G");
  p.currency.astrum = 160 * 30;
  const svc = new GachaService(new SeededRng(11), clock, (id) => save.saveNow(id));
  for (let i = 0; i < 3; i++) svc.pull(p, "event_seria_01", 10);
  const snapshot = JSON.stringify(p.pity);
  const [q] = new SaveManager(storage, clock).load("g4", "G");
  assert.equal(JSON.stringify(q.pity), snapshot);
});

test("history is capped at 200", () => {
  const { save, clock } = makeSave();
  const [p] = save.load("g5", "G");
  p.currency.astrum = 160 * 250;
  const svc = new GachaService(new SeededRng(12), clock, (id) => save.saveNow(id));
  for (let i = 0; i < 25; i++) svc.pull(p, "standard", 10);
  assert.equal(p.gachaHistory.length, 200);
  assert.equal(p.gachaHistory[199].pull, 250);
});
