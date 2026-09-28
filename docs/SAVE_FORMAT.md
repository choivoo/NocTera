# Save Format

**Storage:** world dynamic properties. They persist with the world and survive server restarts.

**Key layout** (`ChunkedJsonStore`, with key = `noct:p:<playerId>`):
```
<key>#slot      "A" | "B"         active snapshot pointer (commit point)
<key>#An        chunk count for slot A
<key>#A0..      JSON chunks (≤ 30,000 chars)
<key>#Bn / #B0.. alternate slot
noct:origin     Vector3           Astera region origin
```
A write goes to the inactive slot first, and the pointer flips only after the write completes. If the server crashes mid-write, the previous full snapshot is still what gets read. `tests/save.test.ts` covers this.

**Profile (`scripts/account/PlayerProfile.ts`, schema 1):**
`nexusRank, nexusExp, currency{credit, astrum, signal, premiumAstrum}, materials, flux{value, updatedAt}, characters{id → CharacterInstance}, weapons{uid → WeaponInstance}, imprints{uid → ImprintInstance}, party[4], activeSlot, quests, story{chapter, flags}, unlockedBeacons, pity{group → {since5, since4, guaranteed, total}}, gachaHistory[≤200], daily, weekly, settings`.

**When the game saves:**
- Changes mark the profile dirty. `SaveManager.tick()` flushes at most 4 profiles every 100 ticks. It never writes every tick.
- Immediate saves happen on: every gacha pull, character obtain (via the pull), quest step and completion, beacon unlock, dungeon clear, menu purchases and upgrades, disconnect, and server shutdown.

**Migration:** `migrateProfile()` deep-fills missing fields from the defaults. Adding a field never wipes an account.
