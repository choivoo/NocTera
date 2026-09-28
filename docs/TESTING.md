# Test checklist

The automated suite runs with `npm test`. Every item below runs on each check unless it is marked 🔲 (manual, on a real device).

| Area | Coverage |
|---|---|
| Data save / server restart | ✅ `save.test.ts`, and both slice sims run a second process over the same saved storage |
| Atomic writes (crash mid-save) | ✅ `save.test.ts` A/B slot |
| Disconnect saves | ✅ `save.test.ts`, slice sims (`playerLeave`) |
| Character switch | ✅ slice A (Seria → Rin), slice B (switch to newly pulled character) |
| Death / party wipe | 🔲 manual: let the enemies win and confirm the return to a beacon at 30% HP |
| Gacha pity / soft / hard | ✅ 10k-pull simulation |
| 50/50 guarantee | ✅ |
| Duplicate / double-tap pull | ✅ re-entrant lock test |
| Insufficient currency | ✅ no partial deduction |
| Perfect Dodge timing | ✅ unit + slice A (live telegraph) |
| Reactions / Break / damage | ✅ `combat.test.ts` |
| Quest chain + no double reward | ✅ `quest.test.ts` |
| Network latency | 🔲 BDS with 150 ms+ ping: dodge window of 6 ticks, telegraph readability |
| Mobile touch / UI scale | 🔲 Galaxy Z Fold: hotbar reach, PHONE vs FOLD_EXPANDED presets |
| Boss with multiple players | 🔲 4 players against Frost Devourer: HP scaling (+60% per extra player or group member), shared rewards |
| Whole Chapter 1 | ✅ slice C: 5 quests, dialogues, dungeon, 2 bosses, unlocks, restart |
| UI clipping / overflow per screen class | ✅ `ui-qa`: COVER / COMPACT / PHONE / FOLD_EXPANDED / WINDOWS × HUD scale 80/100/120 |
| Touch-target layout | ✅ `ui-qa`: right-thumb actions in slots 1–4, portraits in 5–8 |
| Save migration v1 → v2 | ✅ `v1.test.ts` |
| Character rig wiring | ✅ `npm run validate`: controllers ↔ animations ↔ geometry ↔ textures ↔ BP properties |
| Character look | 🔲 manual: `/noct:noct preview <id>` on device, plus `docs/art/characters_preview.png` |
| JSON UI HUD panel on device | 🔲 manual: left glass panel visible, no overlap with the vanilla joystick on Fold unfolded or cover |
