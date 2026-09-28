# Combat

## Inputs (touch hotbar; see UI.md)
ATK · SKILL · ULT · DODGE · CHAR 1–4 · MENU. On keyboard and mouse, left-clicking an enemy also counts as ATK.

## Normal combo
`ComboTracker` walks the `kit.normal.hits[]` list. Each hit has its own multiplier, range, arc, hitstop, break damage, sound, particle, animation and continuation window in ticks. Input that arrives during recovery is rejected. When the window expires, the combo restarts. The last hit is the finisher: it adds knockback, a stronger camera shake and double gauge gain.

## Skill / Ultimate / Switch-in / QTE
Every action runs a list of effect primitives. Consecutive `damage` effects are spaced 3 ticks apart, which gives multi-hit rhythm. Skills have cooldowns, and resonance can add charges. Ultimates need a full energy bar and play a short camera cut plus a title card. The player has i-frames during that cut.

## Energy
Each landed normal hit gives `energyPerHit × ER`. Each skill gives `energyGain`. Bench characters receive 30%.

## Elements & reactions
IGNIS, GLACIA, VOLT, AER, LUX, UMBRA. A hit leaves an aura on the target for 200 ticks. Reaction values live in `database/elements/reactions.json`:

| Reaction | Pair | Effect |
|---|---|---|
| MELT | IGNIS + GLACIA | ×1.75 damage |
| BREAK CURRENT | VOLT + GLACIA | +1.2×ATK damage, +25 Break |
| SPREAD | AER + any | spreads the consumed element to enemies within 4 blocks, +0.8×ATK |
| COLLAPSE | LUX + UMBRA | ×1.5, ignores 40% DEF, +15 Break |
| OVERDRIVE | IGNIS + VOLT | +1.6×ATK, plus a 3-block AoE |

## Break
Elites and bosses have a Break gauge. When it reaches 0, the enemy enters BREAK STATE: it cannot act for 5 s, its current attack is cancelled, it takes ×1.3 damage, and the gauge refills.

## Statuses → QTE
- GLACIA from a skill, ultimate or QTE freezes non-boss enemies for 2 s.
- VOLT shocks the enemy.
- A `launch` effect makes the enemy airborne.
- A Break counts as a trigger too.

When a bench character's `qte.trigger` matches one of these, that character's party slot glows **QTE** for 3 s. Switching during that window runs the character's QTE action instead of the normal switch-in. It also ignores the switch cooldown.

## Dodge / Perfect Dodge
Enemy attacks have a telegraphed windup: an angry particle plus a roar sound, with the impact on a fixed tick. A dodge grants 10 i-frames. If the dodge started at most 6 ticks before impact, it is a **PERFECT DODGE**. That gives a title flash, a special sound, heavy slowness on enemies within 10 blocks, +80% normal damage for 2 s (the counter window), energy and gauge. `DodgeJudge` is pure code and unit-tested.

## Damage formula
`ATK × mult × (1 + elemDMG% + bonus%) × crit × reaction + reactionFlat`, then `× 400/(400+DEF·(1−ignore))`, then `× 1.3` if the target is Broken. Enemies deal `atk × scale × mult × 6`. The active character's DEF, damage reduction and shield reduce that.

## Death
When the active character reaches 0 HP, the next living character swaps in automatically. A party wipe fades the screen, returns the player to the last Nexus Beacon and revives everyone at 30% HP.
