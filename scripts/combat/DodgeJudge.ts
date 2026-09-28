/**
 * Dodge / Perfect Dodge timing (pure). Enemy attacks announce an impact tick
 * during their windup; a dodge whose start lies within `perfectWindow` ticks
 * before impact is PERFECT.
 */
export interface DodgeState {
  lastDodgeTick: number;
  iframesUntil: number;
  cooldownUntil: number;
}

export function newDodgeState(): DodgeState {
  return { lastDodgeTick: -9999, iframesUntil: 0, cooldownUntil: 0 };
}

export function tryDodge(s: DodgeState, tick: number, iframes: number, cooldown: number): boolean {
  if (tick < s.cooldownUntil) return false;
  s.lastDodgeTick = tick;
  s.iframesUntil = tick + iframes;
  s.cooldownUntil = tick + cooldown;
  return true;
}

export type HitJudgement = "hit" | "dodged" | "perfect";

export function judgeIncoming(s: DodgeState, impactTick: number, perfectWindow: number): HitJudgement {
  if (impactTick >= s.iframesUntil) return "hit";
  const lead = impactTick - s.lastDodgeTick;
  return lead >= 0 && lead <= perfectWindow ? "perfect" : "dodged";
}
