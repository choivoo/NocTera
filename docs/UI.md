# UI

## Principles
Everything uses the **stable** `@minecraft/server-ui` forms plus the action bar and title/subtitle channels. There are no chest-GUI menus, and no experimental DDUI/CustomForm dependency. Experimental work goes in a separate `experimental/` module if it is ever added.

## Controls (touch hotbar)
| Slot | 1 | 2 | 3 | 4 | 5–8 | 9 |
|---|---|---|---|---|---|---|
| Item | ATTACK | SKILL | ULTIMATE | DODGE | CHARACTER 1–4 | MENU |

The items are locked in their slots and kept on death, so a tap on a slot always means one action. Narrow ranged attacks get **aim assist**: if the aim cone is empty, they snap to the nearest enemy within 35°.

## HUD (action bar, refreshed every 4 ticks)
```
◇ Silver Plains Nexus Beacon 활성화                 (quest tracker: FOLD/WINDOWS or setting)
[1]SERIA ▮▮▮▮ ✦ | [2]RIN ▮▮▮▮ QTE | [3]…           (party: HP, ult-ready ✦, QTE, ✖ down)
❄ SERIA Lv.20  HP ▮▮▮▮▮▮▮▮▮▮▮▮ 2310/2400 ⛨300       (active character)
ULT READY  SKILL 3s  FROST ▮▮▮▯▯  SWAP 0.6          (resources)
✦12,480 MELT BREAK                                  (last hit)
```

## Presets (`scripts/ui/UIManager.ts`, Settings → UI 프리셋)
| Preset | Bars | Detail | Menus |
|---|---|---|---|
| COMPACT | 6 | – | tabbed |
| PHONE | 8 | – | tabbed |
| FOLD_EXPANDED | 12 | quest tracker, swap timer, buffs | 2-column character sheet |
| WINDOWS | 12 | same as Fold | 2-column |

AUTO picks PHONE on mobile or touch input, and WINDOWS otherwise. The Script API cannot tell whether a Fold is open or closed, so Fold players select FOLD_EXPANDED once in Settings.

## Main menu
CHARACTER · PARTY · INVENTORY · QUEST · MAP (beacons + dungeons) · GACHA · EVENT (daily) · PROFILE · SETTINGS

## Known gaps (tracked in CHANGELOG)
- A left or right edge party panel with portraits needs a JSON UI `hud_screen` override. Right now the HUD is centered text.
- Playable characters are not yet visible models. The player keeps their own skin, and switching is shown through FX and titles. The planned approach is a player-entity override with a `noct:char` client-synced property that selects geometry and texture.
