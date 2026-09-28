import { MemoryStorage } from "../scripts/save/Storage";
import { SaveManager } from "../scripts/save/SaveManager";
import { ManualClock } from "../scripts/core/Clock";

export function makeSave(chunk = 30000) {
  const storage = new MemoryStorage();
  const clock = new ManualClock(1_700_000_000_000);
  const save = new SaveManager(storage, clock, 100, chunk);
  return { storage, clock, save };
}
