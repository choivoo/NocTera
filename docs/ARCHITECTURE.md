# Architecture

## Layers

```
database/*.json  ──►  scripts/data (registry, typed defs)
                          │
      pure core (no @minecraft imports, unit-tested in Node)
      ├─ core/       EventBus, Rng (seedable), Clock, Logger
      ├─ save/       Storage port, ChunkedJsonStore (A/B atomic), SaveManager (dirty queue)
      ├─ account/    PlayerProfile + migration, Wallet (atomic spend/grant), Progression (NR, Flux, daily)
      ├─ character/  Stats (final stat calc), CharacterManager (obtain/EXP/ascend/talent/resonance/weapons)
      ├─ party/      PartyManager (slots, element synergy)
      ├─ gacha/      GachaEngine (rates/pity/50-50), GachaService (locked transaction)
      ├─ combat/     Elements, DamageCalc, ComboTracker, DodgeJudge, EnemyState
      ├─ artifact/   ImprintGen (Memory Imprint roll/level/equip)
      └─ quest/      QuestManager
                          │
      engine adapters (@minecraft/server, @minecraft/server-ui)
      ├─ runtime/    Game (context), Session (live HP/energy/cooldowns), Lifecycle (join/leave/tick)
      ├─ combat/     CombatRuntime (action execution), EnemyRuntime (AI, telegraphs, rewards)
      ├─ input/      Controls (touch hotbar items → actions)
      ├─ ui/         UIManager (presets), Hud, Menus, GachaScreen
      ├─ camera/     Cutscene (keyframed camera/fade/titles)
      ├─ story/      Dialogue (form-based dialogue UI)
      ├─ world/      World (Astera origin, beacons, zone spawner, bosses)
      ├─ dungeon/    DungeonManager (instanced waves)
      ├─ quest/      QuestRuntime (events → quest signals, auto dialogue, boss spawn)
      ├─ character/  CharacterVisual (noct:char / noct:anim), Passives
      ├─ camera/     UltimateCinematic, Showcase (3D model presentation)
      ├─ coop/       CoopManager (groups, 4/2/1 allowance)
      ├─ world/      City (plaza, NPCs, pillars), Exploration (treasure, motes, puzzles, trials, surges)
      ├─ ui/         TitleScreen, DamageNumbers
      ├─ audio/      Fx (particle/sound indirection + per-tick particle budget)
      ├─ save/       DynamicPropertyStorage
      └─ debug/      Commands (/noct:noct …, Admin permission)
```

Systems communicate through `core/EventBus` events (`combat:kill`, `party:switched`, `gacha:pulled`, …), not by importing each other.

## Server authority
The client only sends intent: which control item was tapped, or a left-click on an enemy. The server computes everything else. That covers damage, crits, reactions, Break, energy, gauges, HP, currency, gacha rolls, ownership, quest progress and rewards. Enemy entities ignore all vanilla damage (`minecraft:damage_sensor`), and only script math changes their HP.

## Data-driven content
Characters are JSON files in `database/characters/`. A kit is a list of **effect primitives** (`damage`, `dash`, `teleport_behind`, `heal`, `shield`, `buff`, `hp_cost`, `gauge`, `summon`, `field`, `pull`, `fx`), and `CombatRuntime` interprets them. Adding a character does not require changes to the combat core. `tools/gen-registry.mjs` picks up new files automatically.

## Performance rules
- The HUD refreshes every 4 ticks, and enemy AI every 2 ticks. Enemies farther than 32 blocks update every 10 ticks (LOD).
- AI loops only over **tracked** enemies and never scans all entities. Hit detection uses bounded `getEntities({location, maxDistance, families})` queries.
- `performance.particleBudgetPerTick` caps particles per tick.
- The save queue flushes at most 4 dirty profiles every 100 ticks. Critical actions save immediately.

## Asset pipeline
`npm run build` runs `gen-registry`, `gen-assets` (items, enemies, NPCs, icons, portraits, glass UI), `gen-characters` (player rig), `render-preview` and then the esbuild bundle. Generated PNGs are never overwritten, so real art can replace them. Vanilla bases live in `tools/vanilla/`.
