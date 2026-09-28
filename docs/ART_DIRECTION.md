# Character Art Direction

Source of truth: `database/art/characters.json` (palette, body, hair, coat, extras, weapon, motion) and `database/art/cinematics.json` (ultimate cuts).
`tools/gen-characters.mjs` turns this data into real pack content:

| Output | Path |
|---|---|
| Geometry: vanilla-compatible bones plus `noct_hair`, `noct_coat`, `noct_extra`, `noct_weapon_r/l` | `RP/models/entity/noct_char_<id>.geo.json` |
| Palette and face texture (only generated when missing, so artists can replace it) | `RP/textures/noct/characters/<id>.png` |
| Animations: idle, idle2, run, air, secondary (hair/coat/scarf), attack1–6, skill, ultimate, dodge, perfect, switch_in, switch_out, hurt, knockback, death, victory, select, qte | `RP/animations/noct_char_<id>.animation.json` |
| Controller for each character, driven by `q.property('noct:anim')` | `RP/animation_controllers/noct_char.ac.json` |
| Render controller that picks geometry and texture by `noct:char` | `RP/render_controllers/noct_char.rc.json` |

Preview sheet: `npm run preview` renders `docs/art/characters_preview.png`.

| | Concept | Palette | Silhouette | Motion signature |
|---|---|---|---|---|
| SERIA | Northern snow knight, cold noble | white · pale blue · silver · navy | Long split white coat, crystal pauldron, floating long hair, waist cloth, longsword | Blade lowered at idle; 5-hit combo: h-slash R, h-slash L, dash thrust, spin, rising slash |
| KAEL | Flame mercenary, battle maniac | black · crimson · orange · gunmetal | Wide frame (×1.15), spiky hair, asymmetric jacket, arm guard, waist reactor, greatsword | Tempo 0.7, heavy hitstop; drag-charge slam |
| LUMIA | Saint of light, astronomer | ivory · gold · pale yellow · soft blue | Robe, halo ring, star charm, floating catalyst orb | Circle cast, arms-to-sky Eden |
| NOX | Void assassin | black · purple · violet · neon magenta | Hood, mask, shadow-tatter coat strips, reverse-grip twin blades | Tempo 1.35 crouched; vanish, cross cut; rises out of shadow at selection |
| RIN | Electric hacker, drone specialist | yellow · charcoal · cyan | Twin tails, goggles, tail cable, short jacket, twin pistols | Pistol spin idle, dodge-fire |
| ARIA | Wind traveler | mint · white · teal | Ponytail, long scarf, short skirt, spear | Spear twirl, tornado raise |
| EIDEN | Street fighter, flame gauntlets | rust · black · white · orange | Wide frame, spiky hair, tank hoodie, oversized gauntlets | Tempo 1.5 boxing combo, charge straight |
| MIREL | Calm sniper | ice blue · slate · white | Bob cut, long military coat, scope monocle, rifle | Kneel shot, scope-in |
| VELA | Paladin guardian | cream · royal blue · gold | Braid, tabard armor, sword plus shield | Shield guard idle, oath plant |
| ZEON | Lightning lancer | white · navy · periwinkle | Swept hair, shoulder cape, long coat, spear | Lance-charge run, flash dash |

**Priority order:** SERIA, NOX, KAEL and LUMIA have hand-scripted multi-shot cinematics. The other six use the same system with shorter cuts.

**Replacing art:** export Blockbench files with the same identifiers (`geometry.noct.char.<id>`, `animation.noct.<id>.<name>`) and the same bone names. Delete the generated file and drop yours in. The generator never overwrites textures.
