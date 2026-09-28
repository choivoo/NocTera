/**
 * Typed synchronous event bus. Systems communicate through events instead of
 * importing each other, so each module keeps an independent API.
 */
import type { ElementId, ReactionId } from "../data/types";

export interface NocEvents {
  "profile:loaded": { playerId: string; isNew: boolean };
  "profile:saved": { playerId: string };
  "character:obtained": { playerId: string; characterId: string; duplicate: boolean };
  "character:levelup": { playerId: string; characterId: string; level: number };
  "party:changed": { playerId: string; party: string[] };
  "party:switched": { playerId: string; from: string | null; to: string };
  "combat:damage": {
    playerId: string;
    characterId: string;
    targetId: string;
    amount: number;
    crit: boolean;
    element: ElementId | null;
    reaction: ReactionId | null;
  };
  "combat:kill": { playerId: string; characterId: string; enemyType: string; exp: number };
  "combat:perfectDodge": { playerId: string; characterId: string };
  "combat:break": { playerId: string; targetId: string };
  "gacha:pulled": { playerId: string; bannerId: string; results: { itemId: string; rarity: number }[] };
  "currency:changed": { playerId: string; currency: string; delta: number; balance: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof NocEvents, Set<Handler<any>>>();

  on<K extends keyof NocEvents>(event: K, handler: Handler<NocEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof NocEvents>(event: K, payload: NocEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (e) {
        // One broken listener must never break the emitter.
        console.warn(`[NOCTERRA] event handler for ${String(event)} failed: ${e}`);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new EventBus();
