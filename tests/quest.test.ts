import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSave } from "./helpers";
import { activeQuest, signal, startQuest } from "../scripts/quest/QuestManager";

test("prologue runs start → finish, grants reward once, chains next quest", () => {
  const { save } = makeSave();
  const [p] = save.load("q", "Q");
  assert.equal(startQuest(p, "prologue"), true);
  assert.equal(startQuest(p, "prologue"), false);
  assert.equal(signal(p, { type: "kill", enemy: "rift_hound" }).advanced, false, "wrong step ignored");
  signal(p, { type: "dialogue", dialogue: "prologue_wake" });
  for (let i = 0; i < 3; i++) signal(p, { type: "kill", enemy: "rift_hound" });
  signal(p, { type: "switch" });
  signal(p, { type: "beacon", beacon: "silver_plains" });
  const r = signal(p, { type: "dialogue", dialogue: "prologue_end" });
  assert.equal(r.completed?.id, "prologue");
  assert.equal(p.currency.astrum, 1600);
  assert.equal(activeQuest(p)?.def.id, "act1_frost");
  signal(p, { type: "dialogue", dialogue: "prologue_end" });
  assert.equal(p.currency.astrum, 1600, "no double reward");
});
