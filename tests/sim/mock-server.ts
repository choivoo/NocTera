/**
 * Minimal in-process stand-in for @minecraft/server used by the simulation
 * tests. It implements only what NOCTERRA calls, with deterministic timing:
 * `advance(n)` runs n game ticks.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";

type Fn = (...a: any[]) => any;
class Signal {
  subs: Fn[] = [];
  subscribe(f: Fn) {
    this.subs.push(f);
    return f;
  }
  unsubscribe(f: Fn) {
    this.subs = this.subs.filter((x) => x !== f);
  }
  fire(ev: any) {
    for (const f of this.subs) f(ev);
  }
}

export const EasingType = new Proxy({}, { get: (_t, k) => k }) as any;
export const InputMode = { Touch: "Touch", KeyboardAndMouse: "KeyboardAndMouse" } as any;
export const PlatformType = { Mobile: "Mobile", Desktop: "Desktop", Console: "Console" } as any;
export const ItemLockMode = { slot: "slot", inventory: "inventory", none: "none" } as any;
export const EntityComponentTypes = { Inventory: "minecraft:inventory", Health: "minecraft:health" } as any;
export const CommandPermissionLevel = { Any: 0, GameDirectors: 1, Admin: 2, Host: 3, Owner: 4 } as any;
export const CustomCommandParamType = new Proxy({}, { get: (_t, k) => k }) as any;
export const CustomCommandStatus = { Success: 0, Failure: 1 } as any;

// ── scheduler ──
let tick = 0;
let nextId = 1;
const timers: { id: number; at: number; fn: Fn; every?: number }[] = [];
export const log: string[] = [];

export const system = {
  get currentTick() {
    return tick;
  },
  run(fn: Fn) {
    const id = nextId++;
    timers.push({ id, at: tick + 1, fn });
    return id;
  },
  runTimeout(fn: Fn, d = 1) {
    const id = nextId++;
    timers.push({ id, at: tick + Math.max(1, d), fn });
    return id;
  },
  runInterval(fn: Fn, every = 1) {
    const id = nextId++;
    timers.push({ id, at: tick + every, fn, every });
    return id;
  },
  clearRun(id: number) {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  },
  beforeEvents: { startup: new Signal(), shutdown: new Signal() },
  afterEvents: {},
};

export function advance(n: number) {
  for (let i = 0; i < n; i++) {
    tick++;
    const due = timers.filter((t) => t.at <= tick).sort((a, b) => a.at - b.at || a.id - b.id);
    for (const t of due) {
      if (t.every) t.at = tick + t.every;
      else timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  }
}
export async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

// ── entities ──
let eid = 1;
export class Entity {
  id = `e${eid++}`;
  isValid = true;
  nameTag = "";
  tags = new Set<string>();
  effects: string[] = [];
  families: string[] = [];
  props = new Map<string, any>();
  getProperty(k: string) {
    return this.props.get(k) ?? 0;
  }
  setProperty(k: string, v: any) {
    this.props.set(k, v);
  }
  getTags() {
    return [...this.tags];
  }
  getViewDirection() {
    return { x: -1, y: 0, z: 0 };
  }
  constructor(public typeId: string, public location: any, public dimension: Dimension) {}
  addTag(t: string) {
    this.tags.add(t);
    return true;
  }
  hasTag(t: string) {
    return this.tags.has(t);
  }
  addEffect(e: string) {
    this.effects.push(e);
  }
  applyKnockback() {}
  rotation = { x: 0, y: 0 };
  setRotation(r: any) {
    this.rotation = r;
  }
  applyImpulse() {}
  teleport(loc: any) {
    this.location = { ...loc };
  }
  remove() {
    if (!this.isValid) return;
    world.beforeEvents.entityRemove.fire({ removedEntity: this });
    this.isValid = false;
    this.dimension.entities.delete(this);
  }
  getComponent(_c: string): any {
    return undefined;
  }
}

class Container {
  items: any[] = new Array(36).fill(undefined);
  getItem(i: number) {
    return this.items[i];
  }
  setItem(i: number, it: any) {
    this.items[i] = it;
  }
}

export class Player extends Entity {
  name: string;
  camera = { setCamera: () => {}, clear: () => {}, fade: () => {} };
  titles: string[] = [];
  actionbar = "";
  messages: string[] = [];
  onScreenDisplay = {
    setTitle: (t: string, o?: any) => this.titles.push(`${t}|${o?.subtitle ?? ""}`),
    setActionBar: (t: string) => (this.actionbar = t),
  };
  clientSystemInfo = { platformType: "Mobile" };
  inputInfo = { lastInputModeUsed: "Touch" };
  inventory = new Container();
  selectedSlotIndex = 0;
  view = { x: 1, y: 0, z: 0 };
  constructor(id: string, name: string, dim: Dimension) {
    super("minecraft:player", { x: 0, y: 64, z: 0 }, dim);
    this.id = id;
    this.name = name;
  }
  override getViewDirection() {
    if (this.rotation.x === 0 && this.rotation.y === 0) return this.view;
    const yaw = (this.rotation.y * Math.PI) / 180;
    const pitch = (this.rotation.x * Math.PI) / 180;
    return { x: -Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  }
  getVelocity() {
    return { x: 0, y: 0, z: 0 };
  }
  playSound() {}
  sendMessage(m: string) {
    this.messages.push(m);
  }
  runCommand() {
    return { successCount: 1 };
  }
  override getComponent(c: string): any {
    if (c === "minecraft:inventory") return { container: this.inventory };
    if (c === "minecraft:health") return { resetToMaxValue() {} };
  }
}

export class Dimension {
  entities = new Set<Entity>();
  constructor(public id: string) {}
  getEntities(q: any = {}) {
    return [...this.entities].filter((e) => {
      if (!e.isValid) return false;
      if (q.type && e.typeId !== q.type) return false;
      if (q.families && !q.families.every((f: string) => e.families.includes(f))) return false;
      if (q.tags && !q.tags.every((t: string) => e.tags.has(t))) return false;
      if (q.location && q.maxDistance !== undefined) {
        const d = Math.hypot(e.location.x - q.location.x, e.location.y - q.location.y, e.location.z - q.location.z);
        if (d > q.maxDistance) return false;
      }
      return true;
    });
  }
  spawnEntity(type: string, loc: any) {
    const e = new Entity(type, { ...loc }, this);
    if (type.startsWith("noct:")) e.families = ["noct_enemy"];
    this.entities.add(e);
    world.afterEvents.entitySpawn.fire({ entity: e });
    return e;
  }
  spawnParticle() {}
  playSound() {}
  /** Test hook: blocks listed here make raycasts hit (walls). */
  walls: ((from: any, dir: any, max: number) => boolean) | null = null;
  getBlockFromRay(from: any, dir: any, o: any = {}) {
    return this.walls?.(from, dir, o.maxDistance ?? 999) ? { block: {}, faceLocation: from } : undefined;
  }
  fills = 0;
  fillBlocks() {
    this.fills++;
    return {};
  }
  getTopmostBlock(p: any) {
    return { location: { x: Math.floor(p.x), y: 63, z: Math.floor(p.z) } };
  }
}

const overworld = new Dimension("minecraft:overworld");

// ── world + persistence ──
const dyn = new Map<string, any>();
export function loadDynamic(file: string) {
  if (!fs.existsSync(file)) return;
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(file, "utf8")))) dyn.set(k, v);
}
export function dumpDynamic(file: string) {
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(dyn)));
}

const after = ["worldLoad", "playerSpawn", "playerLeave", "entitySpawn", "entityHurt", "entityHitEntity", "itemUse", "playerInteractWithEntity"];
export const world = {
  afterEvents: Object.fromEntries(after.map((k) => [k, new Signal()])) as Record<string, Signal>,
  beforeEvents: { playerLeave: new Signal(), entityRemove: new Signal() } as Record<string, Signal>,
  getDynamicProperty: (k: string) => dyn.get(k),
  setDynamicProperty: (k: string, v: any) => (v === undefined ? dyn.delete(k) : dyn.set(k, v)),
  getDynamicPropertyIds: () => [...dyn.keys()],
  getDimension: () => overworld,
  getAllPlayers: () => [...overworld.entities].filter((e) => e instanceof Player),
  getDefaultSpawnLocation: () => ({ x: 0, y: 64, z: 0 }),
  playSound() {},
};

// Type registries: in the mock every packaged id is "registered" (mirrors a correctly imported pack).
import { RESOURCES } from "../../scripts/data/resources.gen";
export const ItemTypes = { get: (id: string) => ((RESOURCES.items as readonly string[]).includes(id) ? { id } : undefined) };
export const EntityTypes = { get: (id: string) => ((RESOURCES.entities as readonly string[]).includes(id) ? { id } : undefined) };

export class BlockVolume {
  constructor(public from: any, public to: any) {}
}

export class ItemStack {
  lockMode = "none";
  keepOnDeath = false;
  constructor(public typeId: string, public amount = 1) {}
}

// ── harness helpers ──
export const registries = { components: new Map<string, any>(), commands: new Map<string, Fn>() };
export function boot() {
  system.beforeEvents.startup.fire({
    itemComponentRegistry: { registerCustomComponent: (n: string, c: any) => registries.components.set(n, c) },
    customCommandRegistry: { registerEnum() {}, registerCommand: (c: any, fn: Fn) => registries.commands.set(c.name, fn) },
  });
  world.afterEvents.worldLoad.fire({});
}
export function joinPlayer(id: string, name: string) {
  const p = new Player(id, name, overworld);
  overworld.entities.add(p);
  world.afterEvents.playerSpawn.fire({ player: p, initialSpawn: true });
  return p;
}
/** Tap the hotbar slot (uses the item currently in that slot, like a touch press). */
export function tapSlot(p: Player, slot: number) {
  p.selectedSlotIndex = slot;
  const it = p.inventory.getItem(slot);
  const action = it.typeId.includes("ctl_char") ? "char" : it.typeId.replace("noct:ctl_", "").replace("_ready", "");
  registries.components.get("noct:control").onUse({ source: p }, { params: { action } });
}
export function tap(p: Player, action: string) {
  registries.components.get("noct:control").onUse({ source: p }, { params: { action } });
}
export { overworld };
