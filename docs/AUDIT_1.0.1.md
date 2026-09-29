# v1.0.1 Audit — Bedrock compatibility and hardening

## Verification labels
- **SIMULATION VERIFIED:** passes in the mock engine test suite. The mock itself is audited against the real typings.
- **STATIC VERIFIED:** passes a static check against real Bedrock data: the official typings, Mojang vanilla particle/sound lists, the vanilla player.json.
- **UNVERIFIED ON DEVICE:** not yet run on a physical Galaxy Z Fold / Bedrock client. **Nothing in 1.0.1 is device-verified.** See DEVICE_TEST.md.

## Findings (things the mock let through, now fixed)
| # | Finding | Severity | Fix | Verification |
|---|---|---|---|---|
| 1 | `minecraft:large_smoke_particle` does not exist in Bedrock | Silent FX failure | → `minecraft:basic_smoke_particle`; the validator checks every particle against Mojang's list | STATIC |
| 2 | 5 vanilla sound events used were not real (`mob.player.hurt`, `block.beacon.activate`, `ui.toast.challenge_complete`, `block.amethyst_block.chime`, `block.beacon.power_select`) | Silent audio failure | Every sound is now a `nocterra.*` event defined in RP `sound_definitions.json`, pointing at real vanilla files. The validator checks all ids | STATIC |
| 3 | Character animations also drove the vanilla **first-person arm** (shared bone names) and fought swim/sleep/ride/glide poses | Visual break in first person | Controllers gated with `!is_first_person && !is_swimming && !is_sleeping && !is_riding && !is_gliding && !is_crawling` | STATIC · UNVERIFIED ON DEVICE |
| 4 | Registries typed as `any` (commands, item components) hid their signatures from `tsc` | Latent API mismatch | Typed as `CustomCommandRegistry` / `ItemComponentRegistry` and compiled against 2.10 typings | STATIC |
| 5 | The mock could expose APIs that don't exist | Test blind spot | `tools/audit-api.mjs` fails if any mock member is missing from the real `.d.ts` (proved with an injected fake API) | STATIC |
| 6 | The mock's `getEntities({type})` ignored `type` | Test blind spot (found during 1.0) | Fixed | SIM |
| 7 | Cover screen, FULL density, 120% scale: a 31-glyph line in a 30-glyph budget | Clipped HUD | Narrow presets drop "/max", large shields show as "12k" | SIM (UI QA matrix: 5 presets × 3 densities × 3 safe areas × 3 scales) |
| 8 | Normal-attack damage landed before the swing animation connected | Combat felt like vanilla clicking | Damage on each character's impact frame (tempo-derived). Dodge cancels recovery | SIM |
| 9 | Elite/boss rewards used the dirty queue | Up to 5 s rollback of currency after a crash | Critical save | SIM |
| 10 | Boss could be re-spawned on reconnect or quest re-present | Duplicate boss / duplicate reward | `findBoss` guard plus an existing-entity scan. Arena leash, and a reset after 30 s abandoned | SIM |

## Compatibility matrix
| Area | Status |
|---|---|
| manifest.json (BP/RP) | STATIC: UUIDs unique, BP→RP dependency, `@minecraft/server` 2.10.0 / `-ui` 2.2.0 = the compiled typings, min_engine 1.26.30 ≥ player.json format |
| Script API usage | STATIC: `tsc --strict` against the 2.10 stable typings, with no `any` on engine registries. Only stable modules. No world access during early execution |
| server-ui | STATIC: ActionFormData / MessageFormData / ModalFormData (options-object signatures from 2.x) |
| Entity definitions | STATIC: JSON schema-shaped. 17 entities, all registered in the embedded resource manifest. `/noct:noct selftest` checks `EntityTypes.get` on device |
| Render/animation controllers, geometry | STATIC: `validate` (controller ↔ animation ↔ geometry ↔ texture ↔ BP property wiring) plus `qa-rig` (bones, pivots, floating weapons, detached limbs, scale, grounding, facing, UV bounds, per-character uniqueness) |
| Particles / sounds | STATIC against the Mojang vanilla lists |
| Molang | STATIC (reviewed). `q.property`, `q.is_*`, `variable.is_first_person` are standard queries. UNVERIFIED ON DEVICE |
| Dynamic properties | SIM + selftest round-trip on device. Chunked at 30 000 chars |
| Command registration | SIM (the registered callback is invoked in tests). Permission Admin, enum `noct:sub` |
| World initialization | SIM: clean bootstrap, module-isolated boot (one failing module doesn't stop the others), error log |
| JSON UI (`hud_actionbar_text` override) | STATIC (element names from vanilla hud_screen.json). **Highest device risk**: if the HUD panel is missing on device, delete `RP/ui/hud_screen.json` and the vanilla action bar still works |

## Touch control evaluation (Phase 13)
- **Works within engine limits:** items locked in slots 1–9 with `onUse`. Bedrock gives scripts no custom on-screen buttons, and none were invented.
- **Right thumb:** slots 1–4 (ATK/SKILL/ULT/DODGE) sit left of center on the hotbar. On an unfolded Fold the right thumb reaches them. On a phone they are central. Target Lock and Aim Assist reduce the need to aim.
- **Left thumb:** the vanilla movement pad. Party switching is on slots 5–8 (right of center).
- **Known friction (UNVERIFIED ON DEVICE):** tapping a slot first selects it and a second tap uses it (Bedrock touch behaviour depends on the control scheme). If that's the case on your device, enable Settings → Touch Controls → "Split controls" / use the in-game "use" button. Report this in DEVICE_TEST step 08.
