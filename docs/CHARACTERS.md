# Characters

This file is generated from `database/characters/*.json`. Visuals are in [ART_DIRECTION.md](ART_DIRECTION.md). The preview sheet is `docs/art/characters_preview.png`.

| | Name | Element | Weapon | Role | Skill | Ultimate | Mechanic / QTE | Functional passives |
|---|---|---|---|---|---|---|---|---|
| ★★★★★ | **KAEL** 카엘 | IGNIS | GREATSWORD | Burst DPS | Crimson Break | Solar Rupture (70 EN) | HEAT → Incandescence / QTE on break | Blood Heat (A1) |
| ★★★★★ | **LUMIA** 루미아 | LUX | CATALYST | Support, Sustain | Halo | Eden (70 EN) | — | Mercy (A1), Afterglow (A4) |
| ★★★★★ | **NOX** 녹스 | UMBRA | DUAL_BLADE | Main DPS | Shadow Step | Event Horizon (60 EN) | SHADOW → Shadow Veil / QTE on airborne | Nightborn (A1), Hollow (A4) |
| ★★★★★ | **SERIA** 세리아 | GLACIA | LONGSWORD | Main DPS | Frozen Divide | End of Winter (60 EN) | FROST → Winter State / QTE on frozen | Stillness (A4), Snowbound Steps (A0) |
| ★★★★ | **ARIA** 아리아 | AER | SPEAR | Support | Cyclone | Tempest Domain (60 EN) | — | Tailwind (A1), Eye of Storm (A4), Glide (A0) |
| ★★★★ | **EIDEN** 에이든 | IGNIS | GAUNTLET | Breaker | Meteor Knuckle | Blast Furnace (60 EN) | — / QTE on break | Crusher (A1), Grit (A4) |
| ★★★★ | **MIREL** 미렐 | GLACIA | RIFLE | Sub DPS | Cryo Round | Deadeye (60 EN) | — | Steady (A1), Cold Read (A4) |
| ★★★★ | **RIN** 린 | VOLT | DUAL_PISTOL | Sub DPS | Volt Barrage | Drone Swarm (50 EN) | — / QTE on shocked | Relay (A1), Static (A4), Courier (A0) |
| ★★★★ | **VELA** 벨라 | LUX | SWORD | Sustain, Buffer | Bulwark | Oath of Dawn (60 EN) | — | Resolve (A1), Sanctuary (A4) |
| ★★★★ | **ZEON** 제온 | VOLT | SPEAR | Hybrid | Lightning Rush | Thunder Field (60 EN) | — | Conductor (A1), Grounded (A4) |

## Adding a character
1. Add a JSON file to `database/characters/`, an entry to `database/art/characters.json` plus `order.json`, and a cinematic to `database/art/cinematics.json`.
2. Add the id to a banner pool.
3. Run `npm run check`. It generates the model, animations, portrait and buttons, and validates the wiring.
