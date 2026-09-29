# Device Test — Galaxy Z Fold 8 Ultra (NOCTERRA v1.0.1)

Every item below is **UNVERIFIED ON DEVICE** until you tick it. Check them in order. If a step fails, run `/noct:noct report` and send the output (screenshot is fine), plus `/noct:noct selftest`.

**Setup:** Minecraft Bedrock **1.26.50 or newer** (Script API 2.10). Use a new world with no other add-ons that replace the player. Cheats can stay off, because the debug commands need operator permission, not cheats.

| # | Step | Expected result | ✔ |
|---|---|---|---|
| 01 | Open `NOCTERRA_v1.0.1.mcaddon` from Files/Downloads | Minecraft opens and shows two "Import successful" toasts (NOCTERRA BP and RP) | ☐ |
| 02 | Create a new world → Behavior Packs → activate **NOCTERRA BP** (RP is added automatically) → Create | The world loads with no "pack error" dialog. No experiments are needed | ☐ |
| 03 | Wait for the first join | A night skyline with a violet Rift glow appears, then **N O C T E R R A** / T A P T O S T A R T and a panel with the **▶ TAP TO START** button and v1.0.1 | ☐ |
| 04 | Tap START | LOADING bar 0→100% with a tip, a city fly-over, the **ASTERA / CHAPTER 1** title, then the Seria dialogue panels | ☐ |
| 05 | Look at yourself (F5 / third person) | You are **Seria**: white long coat, silver-white hair, a long blade in hand, a larger anime-proportion head. Your skin is not visible | ☐ |
| 06 | First person | Normal vanilla first-person arm. No coat, hair or sword pieces in view | ☐ |
| 07 | Hotbar | Round glass buttons: sword · skill · star · dodge · Seria portrait · Rin portrait · ＋ · ＋ · menu | ☐ |
| 08 | Tap ATTACK 5× near an enemy (they spawn just east of the plaza) | 5 different swings, floating damage numbers, the enemy name bar drops, FROST gauge rises in the left glass HUD | ☐ |
| 09 | SKILL | Dash-slash with ice particles, "SK 8s" cooldown in the HUD | ☐ |
| 10 | Fill energy (or `/noct:noct level`) → the ULT button glows gold → tap | ~2.5 s End of Winter: blue tint, face close-up, crystals, the big strike. Control returns afterwards | ☐ |
| 11 | Tap Rin's portrait | Model switches to Rin (yellow twin tails, goggles), "RIN" subtitle, switch-in shot | ☐ |
| 12 | Dodge just before the enemy's red ✖ telegraph hits | **PERFECT** + cold flash, enemies slowed, no damage | ☐ |
| 13 | Movement sanity: swim, sneak, jump, ladder, sprint, fall damage, die (/kill) and respawn | Vanilla behaviour. The model follows swim/ride poses. After respawn you are still the active character and the hotbar buttons return | ☐ |
| 14 | Armor + held items | Armor renders on the character. Held items attach to the right hand. **Known risk:** scale may look off, so screenshot it | ☐ |
| 15 | MENU → every tile | Each screen opens with a short fade. CHARACTER shows the 3D showcase before the sheet. GACHA shows 🔒 until the Prologue is done | ☐ |
| 16 | Finish Prologue (3 kills, switch, Silver Plains beacon, dialogue) | QUEST COMPLETE, Astrum +1600, "GACHA unlocked" | ☐ |
| 17 | GACHA → 10 PULL | Rift, signal, rarity light (5★: purple → gold, sting, flash, silhouette, shatter), reveal on your 3D model, then the result list | ☐ |
| 18 | Settings → UI preset **FOLD_EXPANDED**, unfold the device | The HUD shows the quest tracker, swap timer and buffs, and the character sheet is 2-column. The left panel doesn't overlap the joystick | ☐ |
| 19 | Fold closed (cover screen) → preset **COVER** | Short lines, nothing clipped at the left edge. Try Safe Area LARGE if the punch-hole overlaps | ☐ |
| 20 | Settings → Graphics PERFORMANCE, fight a group | Fewer particles and damage numbers, no FPS drops in large fights | ☐ |
| 21 | Settings → Target Lock ON | "◎ TARGET LOCK" in the HUD, attacks turn toward the enemy, the lock releases when it dies | ☐ |
| 22 | Save: close the app from recents mid-fight, reopen | Level, EXP, currency, party and quest step are kept (at most ~5 s of non-critical progress can be lost; pulls and rewards are never lost or duplicated) | ☐ |
| 23 | Reconnect during a gacha animation or ultimate (disconnect / close app) | After rejoining, the camera is normal, input works, and pulls were charged exactly once | ☐ |
| 24 | `/noct:noct selftest` | All **PASS** (WARN "errors" is fine only if you already saw errors) | ☐ |
| 25 | `/noct:noct report` | Version 1.0.1, API @minecraft/server@2.10.0, schema 3, your character, party, quest, presets, modules | ☐ |

**What to send back:** the numbers of the failed steps, a screenshot, and the output of `/noct:noct report`.
