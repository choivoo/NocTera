# Game Design

**Core loop:** Story → Exploration → Combat → Materials → Character growth → Dungeon/Boss → Astrum → Gacha → New party → Harder content.

**Setting.** After the catastrophe called **Nightfall**, *Rifts* tore open across the world. Inside a Rift, physical law breaks down and **Umbra** energy leaks out. The player wakes up as a **Resonator** in **Astera**.

**Astera (region 1):** Astera City, Silver Plains, Old Research Facility, Frozen Forest, Underground Ruins, Void Scar. The layout is in `database/world/astera.json`. It uses offsets from an origin that you set with `/noct:noct setup`, so the logical layout works on any map. Hand-built terrain is still to come.

**Economy.** Credit is the general currency. Astrum pays for gacha pulls (160 per pull). A Signal is one pull ticket. Flux is stamina: max 180, +1 every 8 minutes. It is spent only when you claim a dungeon reward, never for story content.

**Account.** Nexus Rank runs from NR1 to NR60. Rank EXP comes from kills, quests and dungeons. Enemy scaling uses NR.

**Progression.** Characters level from 1 to 90, with ascension caps at 20/40/50/60/70/80. Talents go from 1 to 10. Resonance goes from R0 to R6, and duplicates unlock it. Each character's JSON defines its mechanic-changing resonance effects. Weapons level, and weapon duplicates refine them from R1 to R5. Memory Imprints fill 5 slots (CORE/TRACE/ECHO/PRISM/RELIC) and give 2-piece and 4-piece set bonuses.

**Content in 0.2:** 10 characters, 18 weapons, 5 imprint sets, 13 enemies (8 normal, 3 elite, 2 bosses), 4 dungeons, 2 quests (Prologue, Act I), and daily tasks.
