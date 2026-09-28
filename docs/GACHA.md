# Gacha

## Rates (character event banner `event_seria_01`)
- 5★: 0.8% base. Soft pity starts at pull 65 and adds 6 percentage points per pull. Hard pity is pull 80 (100%).
- 4★: at least one in every 10 pulls, and 50% of them are the featured 4★ characters.
- 5★ outcome: 50% featured, 50% standard pool. After a loss, the next 5★ is **guaranteed featured**. The `pity.guaranteed` flag is saved on the account.
- Pity counters are grouped by banner type (`character`, `weapon`, `standard`) and persist permanently.

A simulation in `tests/gacha.test.ts` runs 10,000 pulls. It confirms no streak goes past 80, an effective 5★ rate of about 1.6%, and that the guarantee holds.

## Transaction
`validate currency → lock(player) → deduct → roll → grant → history → save now → unlock`. A second request that arrives while the lock is held is rejected with `locked`, which prevents double-tap exploits. There is a test for this. Signal tickets are used before Astrum.

## Duplicates
- A duplicate character becomes Resonance (R+1, up to R6) and gives 1 resonance material. Past R6 it converts to Stella.
- A duplicate weapon refines the owned copy, up to R5.

## History
The last 200 pulls are kept, each with date, banner, item, rarity and pull number. The terminal shows the most recent 60.

## Presentation
Banner screen → 1 or 10 pull → fade → free camera pushing in on a rift → a light burst colored by the best rarity (blue, purple or gold) → a card reveal for each result (5★ cards hold longer) → a 10-card result list → tap a card to see its detail. Input stays locked for the whole cinematic.
