/** Module boot registry for /noct:noct report and selftest. */
import { recordError } from "../core/ErrorLog";

const modules = new Map<string, boolean>();

export function markModule(name: string, ok: boolean, err?: unknown): void {
  modules.set(name, ok);
  if (!ok) recordError(`boot.${name}`, err);
}

export function moduleStatus(): [string, boolean][] {
  return [...modules];
}
