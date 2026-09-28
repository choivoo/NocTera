/** Process-wide runtime context shared by the Minecraft-facing systems. */
import type { Player } from "@minecraft/server";
import { SaveManager } from "../save/SaveManager";
import { GachaService } from "../gacha/GachaService";
import { mathRng, type Rng } from "../core/Rng";
import { systemClock } from "../core/Clock";
import type { Session } from "./Session";
import type { Storage } from "../save/Storage";
import { Config } from "../data/registry";

export class Game {
  readonly sessions = new Map<string, Session>();
  readonly save: SaveManager;
  readonly gacha: GachaService;
  readonly rng: Rng = mathRng;
  readonly clock = systemClock;

  constructor(storage: Storage) {
    this.save = new SaveManager(storage, this.clock, Config.save.flushIntervalTicks, Config.save.chunkSize);
    this.gacha = new GachaService(this.rng, this.clock, (id) => this.save.saveNow(id));
  }

  session(player: Player): Session | undefined {
    return this.sessions.get(player.id);
  }
}

let instance: Game | null = null;
export function initGame(storage: Storage): Game {
  instance = new Game(storage);
  return instance;
}
export function game(): Game {
  if (!instance) throw new Error("Game not initialised");
  return instance;
}
