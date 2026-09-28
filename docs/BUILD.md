# Build & Run

## Requirements
- Node 20+
- A Bedrock client or Bedrock Dedicated Server that supports `@minecraft/server` 2.10.0 and `@minecraft/server-ui` 2.2.0 (current stable)

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
4. Start the server. As an operator, stand at the spot where Astera City should be and run `/noct:noct setup`.

## Debug commands (Admin permission)
`/noct:noct debug | givechar <id> | level [id] [exp] | astrum [n] | banner <id> | boss <frost_devourer|void_seraph> | spawn <enemy> [n] | quest [id] | tp <beacon> | setup | imprint [set] [n] | save | stats | reset confirm`
