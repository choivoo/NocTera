# Changelog

## 0.2.0 — Foundation + Character + Vertical Slice A (verified)

### 0.1 Foundation ✅
- Project layout (BP/RP/scripts/database/tools/tests/docs/builds), manifests (stable Script API 2.10 / UI 2.2), TypeScript + esbuild bundle.
- EventBus, seedable RNG, Clock, Logger, typed content registry from JSON.
- SaveManager: dirty-flag write queue, immediate critical saves, chunked A/B atomic dynamic-property store, schema migration.
- PlayerProfile covering every persisted domain (currency, characters, weapons, imprints, party, quests, story, pity, guarantee, history, settings).
- Admin debug commands `/noct:noct …`.
- Validator (JSON, manifests, cross-refs, textures) and placeholder asset generator (REPLACE_ME list).

### 0.2 Character ✅
- All 10 launch characters authored as data (kits, mechanics, QTE, passives text, R1–R6).
- Stats (level, ascension, weapon, imprints, synergy, buffs), EXP with ascension caps, ascension costs, talents 1–10, resonance with talent boosts.
- 4-slot party, element synergies, switching with out/in FX, i-frames, switch-in skills, QTE switch.

### Implemented in first-pass form (playable, needs tuning on a device)
- **Combat (0.3):** data-driven effect interpreter, per-hit combos, skills with charges, ultimates with a camera cut, energy, FROST/SHADOW/HEAT gauges, dodge and Perfect Dodge, enemy AI with telegraphed attacks and LOD, touch aim assist.
- **Elements (0.4):** 6 elements, 5 reactions, Break, statuses → QTE.
- **UI (0.5):** action-bar HUD with presets, full main menu, character, party, inventory, quest, map, event, profile and settings screens.
- **Gacha (0.6):** 3 banners, rates, soft/hard pity, 50/50 guarantee, locked transactions, 10-pull, cinematic, result grid, card detail, history (200).
- **Progression (0.7):** weapon leveling, refinement via duplicates, Memory Imprints (5 slots, main/sub stats, 2pc/4pc sets, leveling), dungeon materials.
- **World (0.8):** Astera layout, 6 Nexus Beacons (unlock, heal, teleport), zone spawner, form-based dialogue, CutsceneManager, loading intro.
- **Content (0.9):** Prologue and Act I quests, 4 wave dungeons with Flux, Frost Devourer and Void Seraph with 3 phases (AoE marks, levitation, rampage), daily tasks, weekly boss counter, shared co-op rewards and boss HP scaling.

### Verified
- 31 automated tests. Vertical Slice A end to end: join → intro → Astera → Seria+Rin → combo/skill/ultimate → switch → kill → EXP → leave → restart → state intact. Vertical Slice B: Astrum → 10-pull → new character → party via menu → field → restart.

### Not done yet (honest list)
- Playable character **models and animations** (the player skin is still visible), and custom particles and sounds (vanilla stand-ins via `audio/Fx.ts`).
- JSON UI HUD override: an edge party panel with portraits and on-screen buttons.
- Hand-built Astera terrain, city facilities as NPC entities, puzzles, treasure chests.
- Chapter 1 Acts II–III and Epilogue, a Void Seraph story step, the weekly boss reward loop.
- Co-op character-count limits (2 characters per player with 2 players, and so on). Right now each player keeps a full party.
- Passive effects are descriptive text only. Resonance effects are partly implemented (talent levels, charges, durations, drones, fields, shields, heat).
- On-device validation on a Galaxy Z Fold, and a BDS latency test.
