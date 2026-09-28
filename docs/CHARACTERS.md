# Characters

Generated from `database/characters/*.json`. Each file is the whole character: stats, combo, skill, ultimate, switch-in, QTE, mechanic, passives, resonance and asset slots.

| | Name | Element | Weapon | Role | Skill | Ultimate | Mechanic / QTE |
|---|---|---|---|---|---|---|---|
| ★★★★★ | **KAEL** 카엘 | IGNIS | GREATSWORD | Burst DPS | Crimson Break | Solar Rupture (70 EN) | HEAT → Incandescence / QTE on break |
| ★★★★★ | **LUMIA** 루미아 | LUX | CATALYST | Support, Sustain | Halo | Eden (70 EN) | — |
| ★★★★★ | **NOX** 녹스 | UMBRA | DUAL_BLADE | Main DPS | Shadow Step | Event Horizon (60 EN) | SHADOW → Shadow Veil / QTE on airborne |
| ★★★★★ | **SERIA** 세리아 | GLACIA | LONGSWORD | Main DPS | Frozen Divide | End of Winter (60 EN) | FROST → Winter State / QTE on frozen |
| ★★★★ | **ARIA** 아리아 | AER | SPEAR | Support | Cyclone | Tempest Domain (60 EN) | — |
| ★★★★ | **EIDEN** 에이든 | IGNIS | GAUNTLET | Breaker | Meteor Knuckle | Blast Furnace (60 EN) | — / QTE on break |
| ★★★★ | **MIREL** 미렐 | GLACIA | RIFLE | Sub DPS | Cryo Round | Deadeye (60 EN) | — |
| ★★★★ | **RIN** 린 | VOLT | DUAL_PISTOL | Sub DPS | Volt Barrage | Drone Swarm (50 EN) | — / QTE on shocked |
| ★★★★ | **VELA** 벨라 | LUX | SWORD | Sustain, Buffer | Bulwark | Oath of Dawn (60 EN) | — |
| ★★★★ | **ZEON** 제온 | VOLT | SPEAR | Hybrid | Lightning Rush | Thunder Field (60 EN) | — |

## Adding a character
1. Copy a JSON file in `database/characters/` and edit it. The kit uses effect primitives (see COMBAT.md).
2. Add the id to a banner pool in `database/banners/banners.json`.
3. Run `npm run check`. It regenerates the registry, generates a placeholder portrait and validates references.

Combat core changes are not needed.
