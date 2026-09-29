import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSave } from "./helpers";
import { SaveManager } from "../scripts/save/SaveManager";
import { GachaService } from "../scripts/gacha/GachaService";
import { SeededRng } from "../scripts/core/Rng";
import { runBootstrap, bootstrapAccount } from "../scripts/account/AccountService";
import { migrateProfile } from "../scripts/account/PlayerProfile";
import { signal, startQuest } from "../scripts/quest/QuestManager";

const STATES = ["CREATED", "CURRENCY_RESERVED", "ROLLED", "REWARD_GRANTED"] as const;

for (const st of STATES) {
  test(`gacha crash at ${st}: full rollback, no currency loss, no reward`, () => {
    const { save, clock } = makeSave();
    const [p] = save.load("tx", "T");
    bootstrapAccount(p, clock.now());
    p.currency.astrum = 1600;
    const before = JSON.stringify({ c: p.currency, ch: p.characters, w: p.weapons, pity: p.pity, h: p.gachaHistory });
    const svc = new GachaService(new SeededRng(1), clock, (id) => save.saveNow(id));
    svc.faultAt = st;
    const out = svc.pull(p, "event_seria_01", 10);
    assert.equal(out.ok, false);
    assert.equal(out.error, "failed");
    assert.equal(JSON.stringify({ c: p.currency, ch: p.characters, w: p.weapons, pity: p.pity, h: p.gachaHistory }), before);
    assert.equal(p.gachaTx.pending, null);
    assert.equal(svc.isLocked("tx"), false, "lock released");
    svc.faultAt = null;
    assert.equal(svc.pull(p, "event_seria_01", 10).ok, true, "next pull works");
  });
}

test("gacha tx ids are unique and a retried request id is rejected as duplicate", () => {
  const { save, clock } = makeSave();
  const [p] = save.load("dup", "D");
  p.currency.astrum = 16000;
  const svc = new GachaService(new SeededRng(2), clock, (id) => save.saveNow(id));
  const a = svc.pull(p, "standard", 10, "REQ-1");
  const b = svc.pull(p, "standard", 10, "REQ-1");
  assert.equal(a.ok, true);
  assert.equal(b.error, "duplicate");
  assert.equal(p.currency.astrum, 16000 - 1600);
  const c = svc.pull(p, "standard", 1);
  const d = svc.pull(p, "standard", 1);
  assert.notEqual(c.txId, d.txId);
  assert.match(c.txId!, /^TX-dup-\d+-\d+$/);
});

test("persisted mid-flight tx: CURRENCY_RESERVED rolls back, REWARD_GRANTED commits (no double reward)", () => {
  const { save, clock, storage } = makeSave();
  const [p] = save.load("rc", "R");
  p.currency.astrum = 1600;
  const svc = new GachaService(new SeededRng(3), clock, () => true);
  // Simulate a server kill after the reserve step was persisted.
  const snap = JSON.stringify({ currency: p.currency, materials: p.materials, characters: p.characters, weapons: p.weapons, pity: p.pity, gachaHistory: p.gachaHistory, nextUid: p.nextUid });
  p.currency.astrum = 0;
  p.gachaTx.pending = { id: "TX-rc-1-1", state: "CURRENCY_RESERVED", banner: "standard", count: 10, price: { signal: 0, astrum: 1600 }, snapshot: snap };
  save.saveNow("rc");
  const [q] = new SaveManager(storage, clock).load("rc", "R");
  assert.equal(svc.recover(q), "rolled_back");
  assert.equal(q.currency.astrum, 1600, "refunded");
  q.gachaTx.pending = { id: "TX-rc-1-2", state: "REWARD_GRANTED", banner: "standard", count: 1, price: { signal: 0, astrum: 160 }, snapshot: snap };
  q.currency.astrum = 1440;
  assert.equal(svc.recover(q), "committed");
  assert.equal(q.currency.astrum, 1440, "no re-grant, no refund");
  assert.ok(q.gachaTx.committed.includes("TX-rc-1-2"));
});

test("first-join failure never half-grants; next join recovers", () => {
  const { save, clock } = makeSave();
  const [p] = save.load("boot", "B");
  const r1 = runBootstrap(p, clock.now(), () => {
    throw new Error("resource init failed");
  });
  assert.equal(r1.ok, false);
  assert.equal(p.bootstrap.stage, "recovery");
  assert.equal(Object.keys(p.characters).length, 0, "starter kit rolled back");
  assert.equal(p.currency.astrum, 0);
  save.saveNow("boot");
  const r2 = runBootstrap(p, clock.now());
  assert.equal(r2.ok, true);
  assert.equal(p.bootstrap.stage, "ready");
  assert.deepEqual(Object.keys(p.characters).sort(), ["rin", "seria"]);
  assert.equal(p.currency.astrum, 1600, "granted exactly once");
  assert.equal(runBootstrap(p, clock.now()).starter, false);
  assert.equal(p.currency.astrum, 1600);
});

test("v2 save with starter kit migrates to v3 as bootstrapped", () => {
  const p = migrateProfile({ schema: 2, story: { chapter: 1, flags: { starterGranted: true } }, characters: { seria: {} } }, "m", 0);
  assert.equal(p.schema, 3);
  assert.equal(p.bootstrap.stage, "ready");
  assert.equal(p.bootstrap.migratedFrom, 2);
  assert.equal(p.settings.graphics, "BALANCED");
  assert.equal(p.settings.hudDensity, "STANDARD");
});

// ── Save stress: "server killed" = drop the SaveManager without flushing, then reload.
function crashReload(storage: any, clock: any, id: string) {
  return new SaveManager(storage, clock).load(id, "X")[0];
}

test("stress: kill right after a gacha → pull and payment are both persisted (no dup, no loss)", () => {
  const { save, clock, storage } = makeSave();
  const [p] = save.load("s1", "X");
  p.currency.astrum = 1600;
  save.saveNow("s1");
  new GachaService(new SeededRng(4), clock, (id) => save.saveNow(id)).pull(p, "standard", 10);
  const q = crashReload(storage, clock, "s1");
  assert.equal(q.currency.astrum, 0);
  assert.equal(q.gachaHistory.length, 10);
  assert.equal(q.gachaTx.pending, null);
});

test("stress: kill after quest reward → reward persisted exactly once", () => {
  const { save, clock, storage } = makeSave();
  const [p] = save.load("s2", "X");
  startQuest(p, "epilogue");
  signal(p, { type: "dialogue", dialogue: "epilogue" });
  save.saveNow("s2"); // QuestRuntime saves immediately on completion
  const q = crashReload(storage, clock, "s2");
  assert.equal(q.currency.astrum, 1600);
  signal(q, { type: "dialogue", dialogue: "epilogue" });
  assert.equal(q.currency.astrum, 1600, "replayed signal cannot re-grant");
});

test("stress: kill after character switch (non-critical) → at most the switch rolls back, nothing duplicates", () => {
  const { save, clock, storage } = makeSave();
  const [p] = save.load("s3", "X");
  bootstrapAccount(p, clock.now());
  save.saveNow("s3");
  p.activeSlot = 1;
  save.markDirty("s3"); // switch only marks dirty
  const q = crashReload(storage, clock, "s3");
  assert.ok([0, 1].includes(q.activeSlot));
  assert.equal(Object.keys(q.characters).length, 2);
});
