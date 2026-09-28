/** Timed 4-piece Memory Imprint set bonuses (e.g. WINTER DREAM: Skill → CRIT RATE +20% for 8s). */
import type { Session } from "../runtime/Session";
import { ImprintSets } from "../data/registry";
import { imprintBonuses } from "../character/Stats";

export function imprintFourPiece(s: Session, charId: string, trigger: "skill" | "ultimate", tick: number): void {
  const inst = s.profile.characters[charId];
  if (!inst) return;
  for (const setId of imprintBonuses(s.profile, inst).fourPieceSets) {
    const set = ImprintSets.get(setId);
    if (!set || set.fourPiece.trigger !== trigger) continue;
    for (const [stat, value] of Object.entries(set.fourPiece.stats)) {
      s.addBuff({ stat: stat as any, value: value as number, until: tick + set.fourPiece.duration * 20, source: `set:${setId}` });
    }
  }
}
