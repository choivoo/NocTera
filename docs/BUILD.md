# Build & Run

## Requirements
- Node 20+
- Bedrock 1.26.30+ (client or Dedicated Server) with `@minecraft/server` 2.10.0 / `@minecraft/server-ui` 2.2.0. The player entity override is based on the 1.26 vanilla player.

## Commands
| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc` strict typecheck |
| `npm run validate` | JSON syntax, manifests, data and asset cross-references |
| `npm test` | unit tests + Vertical Slice A/B simulations (mock engine, restart via a second process) |
| `npm run build` | regenerate registry and assets, bundle to `behavior_pack/NOCTERRA_BP/scripts/main.js` |
| `npm run package` | build, then zip both packs to `builds/NOCTERRA_v<ver>.mcaddon` |
| `npm run check` | all of the above except package |

## Dedicated server
1. Copy `behavior_pack/NOCTERRA_BP` to `<bds>/behavior_packs/` and `resource_pack/NOCTERRA_RP` to `<bds>/resource_packs/`.
2. Add both packs to `<bds>/worlds/<world>/world_behavior_packs.json` and `world_resource_packs.json` (uuid + version from the manifests).
3. In `server.properties`, set `texturepack-required=true`.
4. Start the server. As an operator, stand on flat ground where Astera City should be and run `/noct:noct setup`. The plaza, NPCs and beacon pillars build automatically when players come near.

**Note:** NOCTERRA overrides `minecraft:player` (behavior and resource) to add character models. Other add-ons that also replace the player entity will conflict.

## Debug commands (Admin permission)
`/noct:noct debug | unlock | preview <char> [ticks] | anim <name> | npc | coop | givechar <id> | level [id] [exp] | astrum [n] | banner <id> | boss <frost_devourer|void_seraph> | spawn <enemy> [n] | quest [id] | tp <beacon> | setup | imprint [set] [n] | save | stats | reset confirm`
