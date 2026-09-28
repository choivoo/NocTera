/** Nexus Rank (account level), Flux stamina, daily/weekly resets. */
import type { PlayerProfile } from "./PlayerProfile";
import { Config } from "../data/registry";

export function nexusExpToNext(rank: number): number {
  return Math.round(375 + 60 * Math.pow(rank, 1.45));
}

/** Adds account EXP; returns ranks gained. */
export function addNexusExp(p: PlayerProfile, amount: number): number {
  if (amount <= 0) return 0;
  let gained = 0;
  p.nexusExp += Math.floor(amount);
  while (p.nexusRank < Config.account.maxNexusRank && p.nexusExp >= nexusExpToNext(p.nexusRank)) {
    p.nexusExp -= nexusExpToNext(p.nexusRank);
    p.nexusRank++;
    gained++;
  }
  if (p.nexusRank >= Config.account.maxNexusRank) p.nexusExp = 0;
  return gained;
}

const FLUX_MS = () => Config.flux.regenMinutes * 60_000;

/** Applies offline/online regeneration lazily. */
export function refreshFlux(p: PlayerProfile, now: number): number {
  const max = Config.flux.max;
  if (p.flux.value >= max) {
    p.flux.updatedAt = now;
    return p.flux.value;
  }
  const ticks = Math.floor((now - p.flux.updatedAt) / FLUX_MS());
  if (ticks > 0) {
    p.flux.value = Math.min(max, p.flux.value + ticks);
    p.flux.updatedAt = p.flux.value >= max ? now : p.flux.updatedAt + ticks * FLUX_MS();
  }
  return p.flux.value;
}

export function spendFlux(p: PlayerProfile, amount: number, now: number): boolean {
  refreshFlux(p, now);
  if (p.flux.value < amount) return false;
  const wasFull = p.flux.value >= Config.flux.max;
  p.flux.value -= amount;
  if (wasFull) p.flux.updatedAt = now;
  return true;
}

/** Server day index (UTC, reset 04:00). */
export function dayIndex(now: number): number {
  return Math.floor((now - 4 * 3600_000) / 86_400_000);
}
export function weekIndex(now: number): number {
  // Epoch day 0 was a Thursday; shift so weeks start Monday.
  return Math.floor((dayIndex(now) + 3) / 7);
}

export const DAILY_TASKS: { id: string; label: string; goal: number }[] = [
  { id: "kills", label: "적 20체 처치", goal: 20 },
  { id: "skills", label: "전투 스킬 10회 사용", goal: 10 },
  { id: "flux", label: "Flux 40 소비", goal: 40 },
  { id: "switch", label: "캐릭터 교체 15회", goal: 15 },
];
export const DAILY_REWARD_ASTRUM = 60;

export function rollDaily(p: PlayerProfile, now: number): void {
  const d = dayIndex(now);
  if (p.daily.day !== d) p.daily = { day: d, progress: {}, claimed: false };
  const w = weekIndex(now);
  if (p.weekly.week !== w) p.weekly = { week: w, bossClears: 0 };
}

export function addDailyProgress(p: PlayerProfile, task: string, n: number, now: number): void {
  rollDaily(p, now);
  p.daily.progress[task] = (p.daily.progress[task] ?? 0) + n;
}

export function dailyComplete(p: PlayerProfile): boolean {
  return DAILY_TASKS.every((t) => (p.daily.progress[t.id] ?? 0) >= t.goal);
}
