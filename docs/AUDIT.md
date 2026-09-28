# Current Build Audit (0.2 → 1.0)

This audit was done before the 1.0 / Character-Design / Mobile-UX pass. Every item lists its resolution. Nothing was reset, and the 0.2 save format migrates forward.

| Area | 0.2 state | Issue | 1.0 resolution |
|---|---|---|---|
| Character visuals | player skin only | "캐릭터가 단순 스킨 교체처럼 느껴지는가" → YES | Player-entity override (`noct:char` / `noct:anim`), 10 distinct silhouettes, 213 per-character animations, per-character controllers |
| Ultimates | shared 0.8 s camera cut | no per-character identity | Data-driven cinematics (`database/art/cinematics.json`), all ≤ 3 s. Seria's follows the 9-beat End of Winter script |
| HUD | centered action-bar text | vanilla look, overlaps the center | Glass panel on the left edge (JSON UI override), vanilla title/actionbar background replaced with glass, quest marker with direction and distance |
| Touch buttons | 4 generic "CHARACTER n" items | no portrait, no ready feedback | Round glass buttons, per-character portrait buttons, glow variants for ULT READY and QTE, co-op lock icon |
| Damage feedback | text in the action bar only | no custom damage numbers | Floating damage entities: normal / crit / reaction / BREAK, with budget |
| Boss UI | name tag only | no top-center bar | Vanilla boss bar synced to the scripted HP, name shows PHASE and Break meter |
| Title / loading | cutscene + title | no TAP TO START, no loading screen or tips | Title screen (Astera night, Rift, logo, version) → loading bar + tip → entry |
| Dialogue | text forms | no character presence | Speaker close-up on the 3D model, portrait icons, "> choice" buttons |
| Passives | description text only | "TODO/stub" violation | Machine-readable `effect` on 20 passives, implemented in `character/Passives.ts` |
| Co-op | full parties for everyone | spec 48 not enforced | CoopManager groups, 4/2/1 character allowance, boss scaling by group |
| Chapter 1 | Prologue + Act I | Acts II–III and Epilogue missing | 5 quests, 12 dialogues, dungeon step, feature unlocks, chapter-end cutscene |
| City / world | coordinates only | no facilities | Procedural plaza, 9 facility NPCs, beacon pillars, treasures, motes, pad puzzles, Rift Trials, Rift Surge events |
| Settings | preset + 2 toggles | no scale, touch or damage options | HUD scale, button size and opacity, damage numbers and size, camera sensitivity, aim assist, ult cinematic, HUD edit-mode layout data |
| Duplicates | `char1..4` items | — | Replaced by per-character items. The old item files are deleted on build |
| Mobile risk | narrow cone for guns | shots whiff on touch | Aim assist (setting-controlled) |
| Mock gap | `getEntities({type})` unsupported | cleanup "removed" players in sims | Mock fixed. A game bug was ruled out |
