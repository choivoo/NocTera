# Vanilla base files

`player.json`, `player.entity.json` and `hud_screen.json` are unmodified copies from
[Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples) (main branch, format 1.26.x).
`tools/gen-characters.mjs` reads them and writes the NOCTERRA versions into the packs:
- `player.json`: adds the client-synced properties `noct:char` and `noct:anim`.
- `player.entity.json`: adds the character geometries, animations, controllers and render controller.

`hud_screen.json` is only a reference for the element names that `NOCTERRA_RP/ui/hud_screen.json` overrides.
When Minecraft updates the player entity, refresh these copies and rebuild.
