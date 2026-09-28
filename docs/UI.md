# UI / UX (mobile-first, Galaxy Z Fold)

All UI uses the **stable** `@minecraft/server-ui` API plus RP JSON UI overrides. There are no chest GUIs and no experimental DDUI dependency.

## Screens
| Screen | Implementation |
|---|---|
| **Title** | Astera night skyline and a distant Rift (free camera and particles), "N O C T E R R A", TAP TO START, version line |
| **Loading** | Slow camera drift over the city, glass loading bar and a random tip (`database/art/tips.json`) |
| **Combat HUD** | Glass panel on the left edge (`RP/ui/hud_screen.json` overrides `hud_actionbar_text`): quest line with ↗ distance marker, a party column (element, name, HP, ✦ ult, QTE, ✖, CO-OP lock), active HP/shield, ULT/SKILL/gauge, buffs, last hit |
| **Touch buttons** | Hotbar: 1 ATK · 2 SKILL · 3 ULT · 4 DODGE · 5–8 party portraits · 9 MENU. Round glass icons. ULT and portraits swap to glowing variants when ready or QTE |
| **Character** | The player's avatar becomes the 3D model (Showcase camera and Selection Animation), then a stats/gear sheet (2-column on Fold) with Weapon / Imprint / Talent / Resonance, and ◀ ▶ to cycle characters |
| **Weapon** | Large name, stars, Lv/cap, ATK, substat, passive per refinement, UPGRADE / ASCEND / swap |
| **Memory Imprint** | Constellation layout CORE / TRACE–ECHO / PRISM–RELIC, set bonuses listed below |
| **Talent** | Node graph Normal → Skill → P1/P2 → Ultimate, with node detail and upgrade |
| **Party** | 4 columns (Fold) or rows (phone): element, role, level, HP, plus Element Resonance |
| **Gacha** | Banner page (featured name, subtitle, RATE UP, pick-ups, ✦/Signal/pity, 1/10 PULL, DETAILS) |
| **Pull** | Fade → camera to the Rift → signal streaks → rarity light → 5★ only: music sting, white flash, special cut → silhouette (???) → reveal on the 3D model with Selection Animation and element FX |
| **Result** | Summary by rarity, 5★ cards marked ✦ and sorted first, NEW / R*n* Resonance / → Stella / Refine +1; tap a card for its detail and showcase |
| **Boss** | Vanilla boss bar at top center, synced to the scripted HP. Name shows `VOID SERAPH  PHASE 2  ▮▮▮▯▯▯` Break meter and aura |
| **Dialogue** | Speaker close-up on the 3D character, portrait icon, the line, "> choice" buttons |
| **Feedback** | Floating damage numbers (normal / ✦crit / reaction label / BREAK), center "BREAK", "PERFECT" plus a cold edge flash |
| **Transitions** | 0.25 s tinted fade on every menu open, kept short so input never feels slow |

## Presets
`AUTO` picks PHONE on mobile or touch and WINDOWS otherwise. Manual options:

| Preset | For | HUD |
|---|---|---|
| COVER | Z Fold cover screen or narrow ratios | ≤ 30 glyphs per line, initials only |
| COMPACT / PHONE | Normal phones | Names, 8-glyph bars |
| FOLD_EXPANDED | Z Fold 8 Ultra unfolded | Quest tracker, swap timer, buffs, 2-column sheets and party table. The layout is rearranged, not just enlarged |
| WINDOWS | Desktop | Same as Fold |

The Script API cannot tell whether a Fold is open, so **Settings → 화면 · HUD → FOLD_EXPANDED** is picked once.

## Settings
HUD Scale 80–120%, Touch Button Size, Touch Button Opacity, damage numbers on/off and size, Camera Sensitivity (cutscene and showcase ease), Aim Assist 0–100%, ultimate cinematic on/off, camera shake, quest tracker.

**HUD Edit Mode:** `settings.hudLayout` stores anchor, offset, scale and visibility for party / quest / combat / boss / minimap, and the Settings UI edits it. The 1.0 JSON UI reads the party panel position. Free placement of every element needs a JSON UI edit mode that consumes this data, which is prepared for but not wired yet.

## Platform limits (honest)
- Custom on-screen touch buttons that call scripts are not possible in Bedrock, so the hotbar is the control surface. It sits bottom-center, which is reachable with the right thumb on an unfolded Fold. The left thumb keeps the vanilla movement pad.
- A real minimap needs a map-renderer UI, which is not available. The quest marker (arrow and distance) replaces it.
- Form-based screens (character, gacha) are modal panels. The 3D model is shown by the Showcase before and around them.
