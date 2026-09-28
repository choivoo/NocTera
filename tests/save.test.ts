import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSave } from "./helpers";
import { SaveManager } from "../scripts/save/SaveManager";
import { ChunkedJsonStore, MemoryStorage } from "../scripts/save/Storage";
import { migrateProfile } from "../scripts/account/PlayerProfile";
import { bootstrapAccount } from "../scripts/account/AccountService";

test("profile survives a 'server restart' (new SaveManager over same storage)", () => {
  const { storage, clock, save } = makeSave(64); // tiny chunks force multi-chunk writes
  const [p, isNew] = save.load("player-1", "Tester");
  assert.equal(isNew, true);
  bootstrapAccount(p, clock.now());
  p.currency.astrum = 12480;
  p.characters.seria.level = 37;
  save.markDirty(p.playerId);
  save.flushAll();

  const restarted = new SaveManager(storage, clock, 100, 64);
  const [q, isNew2] = restarted.load("player-1", "Tester");
  assert.equal(isNew2, false);
  assert.equal(q.currency.astrum, 12480);
  assert.equal(q.characters.seria.level, 37);
  assert.deepEqual(q.party.slice(0, 2), ["seria", "rin"]);
});

test("dirty queue: tick() does not write every tick", () => {
  const { save } = makeSave();
  const [p] = save.load("a", "A");
  const base = save.writeCount;
  for (let i = 0; i < 99; i++) {
    save.markDirty(p.playerId);
    save.tick();
  }
  assert.equal(save.writeCount, base, "no writes before flush interval");
  save.tick();
  assert.equal(save.writeCount, base + 1, "exactly one write at interval");
  assert.equal(save.isDirty("a"), false);
});

test("A/B slot commit: interrupted write keeps previous snapshot", () => {
  const storage = new MemoryStorage();
  const store = new ChunkedJsonStore(storage, 8);
  store.write("k", { v: 1, pad: "xxxxxxxxxxxxxxxx" });
  // Simulate crash: write chunks for next slot but never flip pointer.
  const origSet = storage.set.bind(storage);
  let n = 0;
  storage.set = (key, val) => {
    if (key.endsWith("#slot")) throw new Error("crash");
    n++;
    origSet(key, val);
  };
  assert.throws(() => store.write("k", { v: 2, pad: "yyyyyyyyyyyyyyyyyyyyyyyy" }));
  storage.set = origSet;
  assert.ok(n > 0);
  assert.equal(store.read<{ v: number }>("k")!.v, 1);
});

test("migration fills missing fields without wiping data", () => {
  const old = { name: "Old", currency: { astrum: 99 }, characters: { seria: { level: 5 } }, party: ["seria"] };
  const p = migrateProfile(old, "x", 0);
  assert.equal(p.currency.astrum, 99);
  assert.equal(p.currency.credit, 0);
  assert.equal(p.characters.seria.level, 5);
  assert.equal(p.party.length, 4);
  assert.ok(p.settings);
});

test("unload saves dirty profile (disconnect)", () => {
  const { storage, clock, save } = makeSave();
  const [p] = save.load("d", "D");
  p.currency.credit = 777;
  save.markDirty("d");
  save.unload("d");
  const [q] = new SaveManager(storage, clock).load("d", "D");
  assert.equal(q.currency.credit, 777);
});
