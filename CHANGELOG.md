# Changelog

## 1.0.0 — Release build: Character design + Mobile UI/UX

Built on top of 0.2 without resetting anything. Save schema 1 → 2 migrates automatically. See docs/AUDIT.md.

### Characters (Part A)
- **Playable 3D characters:** a player-entity override adds `noct:char` / `noct:anim`. There are 10 generated silhouettes with individual body scale, hair, coat, accessories and weapon models, per-character palette textures, and **213 animations** (≈21 each: idle, idle2, run posture, air, secondary cloth/hair, 3–6 combo hits, skill, ultimate, dodge, perfect, switch in/out, hurt, knockback, death, victory, select, qte), plus one animation controller per character.
- **Ultimate cinematics** from data. They are ≤ 3 s and include a tinted flash, relative camera shots, particles, rings and shake. Seria (9-beat End of Winter), Kael, Lumia and Nox have multi-shot cuts; the other six have shorter cuts.
- **Showcase:** the player's avatar serves as the "3D model" for the character screen, the gacha reveal and dialogue close-ups, with each character's Selection Animation and element FX.
- **Passives are now functional:** 20 machine-readable effects (conditional crit/damage/defense, overheal → shield, shield-break heal, skill energy, switch cooldown, dodge cooldown in state, exploration speed).

### UI/UX (Part B)
- Title screen (TAP TO START, Astera night, Rift, version), a loading screen with a bar and tips, and a first-entry cutscene.
- Combat HUD in a glass JSON-UI panel on the left edge, quest marker (arrow and distance), round glass touch buttons, portrait party buttons with ULT/QTE glow and a co-op lock.
- Damage numbers (normal / crit / reaction / BREAK), BREAK and PERFECT center feedback, boss bar synced to scripted HP with phase and Break meter.
- Redesigned screens: character (2-column on Fold), weapon, Memory Imprint constellation, talent node graph, party table with Element Resonance, gacha banner/pull/5★ reveal/results, dialogue, settings.
- Presets: COVER (Fold cover), COMPACT, PHONE, FOLD_EXPANDED, WINDOWS. Settings for HUD scale, touch button size/opacity, damage numbers, camera sensitivity, aim assist, ult cinematic, and HUD edit-mode layout data.

### Content to 1.0
- **Chapter 1 complete:** Prologue → Act I (Frost Devourer) → Act II (facility, dungeon, Rift Knight) → Act III (Void Seraph) → Epilogue, with a chapter-end cutscene. Story-gated unlocks: GACHA, DUNGEON, CO-OP, WEEKLY.
- **Astera City:** procedural plaza, 9 facility NPCs (Quest Guild, Weapon Lab, Character Upgrade, Artifact Lab, Shop, Signal Terminal, Crafting, Training with an immortal dummy, Co-op Lobby), and beacon pillars.
- **Exploration:** 8 treasure caches (3 tiers), 15 Astral Motes, 2 resonance-pad puzzles, a Rift Trial, and roaming Rift Surge world events.
- **Co-op:** groups of up to 4, character allowance 4/2/1, boss scaling by group, shared rewards.
- **Weekly:** 3 boss reward claims per week after Chapter 1.

### Verified
- 36 automated tests. New ones: **Vertical Slice C** (the whole Chapter 1 end to end across a restart), **UI QA** (HUD fits every preset at 80–120% scale; touch-slot layout; damage text width), v1→v2 migration, co-op allowance, and art/cinematic coverage.
- The validator now checks the character rig wiring (controllers ↔ animations ↔ geometry ↔ textures ↔ BP properties).

### Known limits (not fixable from an add-on, or needing a real device)
- Not yet run on a physical Galaxy Z Fold 8 Ultra or a live BDS. Everything above is verified in the simulated engine and by static validation only.
- Character models and animations are generated block art (the silhouettes, palettes and motion differ per character). Hand-authored Blockbench art can replace them 1:1 (docs/ART_DIRECTION.md).
- Particles and sounds still map to vanilla stand-ins (`audio/Fx.ts`, docs/REPLACE_ME.md).
- Touch buttons are hotbar items. Bedrock gives scripts no custom on-screen buttons, and there is no minimap renderer (the quest marker replaces it).
- HUD edit mode stores full layout data, but only the party panel position is applied by the 1.0 JSON UI.


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
