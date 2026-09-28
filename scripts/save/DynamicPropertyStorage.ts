/** Storage adapter over world dynamic properties (persist across server restarts). */
import { world } from "@minecraft/server";
import type { Storage } from "./Storage";

export class DynamicPropertyStorage implements Storage {
  get(key: string): string | undefined {
    const v = world.getDynamicProperty(key);
    return typeof v === "string" ? v : undefined;
  }
  set(key: string, value: string | undefined): void {
    world.setDynamicProperty(key, value);
  }
  keys(prefix: string): string[] {
    return world.getDynamicPropertyIds().filter((k) => k.startsWith(prefix));
  }
}
