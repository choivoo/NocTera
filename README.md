# NOCTERRA / 녹테라

A character-collecting action RPG that runs on Minecraft Bedrock Edition. It has a 4-character party with live switching, 6 elements with reactions, Break, Perfect Dodge, QTE switch attacks, a gacha with pity and a 50/50 guarantee, and saves that persist across restarts. It is built touch-first (Android, Galaxy Z Fold) on the stable Script API.

```
behavior_pack/NOCTERRA_BP   gameplay pack (items, entities, bundled scripts/main.js)
resource_pack/NOCTERRA_RP   visuals: textures, geometry, animations, lang (placeholders = REPLACE_ME)
scripts/                    TypeScript source (modular systems, see docs/ARCHITECTURE.md)
database/                   all game content as JSON (characters, weapons, banners, enemies, quests, world)
tools/                      build, asset generation, validation
tests/                      unit tests + end-to-end vertical-slice simulations
docs/                       design + technical docs
builds/                     packaged .mcaddon output
```

## Quick start

```bash
npm install
npm run check        # typecheck + validate + tests + build
npm run package      # → builds/NOCTERRA_v<version>.mcaddon
```

Install the `.mcaddon`, enable both packs on a world (no experimental toggles needed), and join. Full server setup is in [docs/BUILD.md](docs/BUILD.md).

## Status: v0.2.0

The foundation, character systems and Vertical Slice A are working and verified by simulation. Gacha (Slice B), progression, dungeons, bosses and quest flow are implemented in first-pass form. See [CHANGELOG.md](CHANGELOG.md) for exactly what works and what is still missing.

## Docs
[ARCHITECTURE](docs/ARCHITECTURE.md) · [GAME_DESIGN](docs/GAME_DESIGN.md) · [CHARACTERS](docs/CHARACTERS.md) · [COMBAT](docs/COMBAT.md) · [GACHA](docs/GACHA.md) · [UI](docs/UI.md) · [SAVE_FORMAT](docs/SAVE_FORMAT.md) · [BUILD](docs/BUILD.md) · [TESTING](docs/TESTING.md) · [REPLACE_ME](docs/REPLACE_ME.md)
