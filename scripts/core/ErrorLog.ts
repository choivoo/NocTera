/**
 * Last-errors ring buffer for on-device debugging (/noct:noct report).
 * Stores module, message and tick only — no device or personal data.
 * Persisted in one world dynamic property so errors survive a crash/restart.
 */
import { logger } from "./Logger";

export interface ErrorEntry {
  t: number; // wall clock ms
  module: string;
  msg: string;
}

const MAX = 20;
const log = logger("error");
let entries: ErrorEntry[] = [];
let persist: ((json: string) => void) | null = null;

export function initErrorLog(load: () => string | undefined, save: (json: string) => void): void {
  try {
    entries = JSON.parse(load() ?? "[]");
  } catch {
    entries = [];
  }
  persist = save;
}

export function recordError(module: string, e: unknown): void {
  const msg = (e instanceof Error ? `${e.message}` : String(e)).slice(0, 240);
  log.error(`${module}: ${msg}`);
  entries.push({ t: Date.now(), module, msg });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  try {
    persist?.(JSON.stringify(entries));
  } catch {
    /* never throw from the error path */
  }
}

export function recentErrors(): ErrorEntry[] {
  return [...entries];
}

export function clearErrors(): void {
  entries = [];
  persist?.("[]");
}

/** Wraps a loop body so one failure never kills the interval or the server tick. */
export function guarded<T extends unknown[]>(module: string, fn: (...a: T) => void): (...a: T) => void {
  return (...a: T) => {
    try {
      fn(...a);
    } catch (e) {
      recordError(module, e);
    }
  };
}
