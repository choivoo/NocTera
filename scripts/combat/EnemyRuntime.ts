/**
 * Server-side enemy brains. Enemies are custom entities (family "noct_enemy")
 * whose vanilla damage is disabled; HP, Break, auras and attacks are driven
 * here. Attacks are telegraphed (windup) so Dodge / Perfect Dodge are real
 * timing checks. Only tracked enemies are iterated — never all entities —
 * and far enemies update at a reduced rate (LOD).
 */
import { EntityComponentTypes, system, world, type Entity, type Vector3 } from "@minecraft/server";
import { EnemyState } from "./EnemyState";
import { Config, Enemies, getCharacter } from "../data/registry";
import type { EnemyDef } from "../data/types";
import type { Session } from "../runtime/Session";
import { game } from "../runtime/Game";
import { dist, flatDir, sub } from "../core/Vec";
import { particle, ring, sound, worldSound } from "../audio/Fx";
import { judgeIncoming } from "./DodgeJudge";
import { damageActive, onPerfectDodge } from "./CombatRuntime";
import { addCharacterExp } from "../character/CharacterManager";
import { addDailyProgress, addNexusExp } from "../account/Progression";
import { grant } from "../account/Wallet";
import { bus } from "../core/EventBus";
import { guarded } from "../core/ErrorLog";
import { rollImprint } from "../artifact/ImprintGen";
import { partyMembers } from "../party/PartyManager";
import { playAnim } from "../character/CharacterVisual";

interface Tracked {
  entity: Entity;
  state: EnemyState;
  home: Vector3;
  lastEngaged: number;
  nextThink: number;
  marks: { tick: number; center: Vector3; radius: number; mult: number }[];
  attackCount: number;
}

const byEntityType = new Map<string, EnemyDef>();
for (const d of Enemies.values()) byEntityType.set(d.entity, d);

class EnemyRuntimeImpl {
  private tracked = new Map<string, Tracked>();

  count(): number {
    return this.tracked.size;
  }

  isEnemy(e: Entity): boolean {
    return byEntityType.has(e.typeId);
  }

  /** Registers an entity (spawner passes a difficulty scale). */
  register(e: Entity, scale = 1): EnemyState | undefined {
    const def = byEntityType.get(e.typeId);
    if (!def) return undefined;
    const existing = this.tracked.get(e.id);
    if (existing) return existing.state;
    const st = new EnemyState(def, scale);
    this.tracked.set(e.id, { entity: e, state: st, marks: [], attackCount: 0, home: { ...e.location }, lastEngaged: system.currentTick, nextThink: 0 });
    try {
      e.nameTag = nameplate(st, system.currentTick);
    } catch {
      /* ignore */
    }
    return st;
  }

  state(e: Entity): EnemyState | undefined {
    return this.tracked.get(e.id)?.state ?? this.register(e);
  }

  forget(id: string): void {
    this.tracked.delete(id);
  }

  kill(e: Entity, killer: Session): void {
    const tr = this.tracked.get(e.id);
    if (!tr) return;
    if (tr.state.def.immortal) {
      tr.state.hp = tr.state.maxHp;
      return;
    }
    this.tracked.delete(e.id);
    const def = tr.state.def;
    const at = { ...e.location };
    const dim = e.dimension;
    particle(dim, "noct:rift", { x: at.x, y: at.y + 1, z: at.z }, 6);
    worldSound(dim, def.tier === "boss" ? "nocterra.gacha.five_star" : "nocterra.break", at, 0.8);
    try {
      e.remove();
    } catch {
      /* already gone */
    }
    // Co-op: every Resonator within 24 blocks shares the reward.
    for (const s of game().sessions.values()) {
      if (s !== killer && (s.player.dimension.id !== dim.id || dist(s.player.location, at) > 24)) continue;
      reward(s, def, tr.state.scale);
    }
  }

  /** Boss UI: vanilla boss bar (top center) mirrors scripted HP; name carries phase + Break. */
  syncBossBar(e: Entity, st: EnemyState): void {
    try {
      e.getComponent(EntityComponentTypes.Health)?.setCurrentValue(Math.max(1, Math.round((st.hp / st.maxHp) * 100000)));
      e.nameTag = nameplate(st, system.currentTick);
    } catch {
      /* ignore */
    }
  }

  onPhase(e: Entity, st: EnemyState): void {
    const dim = e.dimension;
    ring(dim, "noct:perfect_dodge", e.location, 4, 12);
    worldSound(dim, "nocterra.telegraph", e.location, 0.6);
    for (const s of game().sessions.values()) {
      if (dist(s.player.location, e.location) > 48) continue;
      s.player.onScreenDisplay.setTitle(`§c${st.def.name.toUpperCase()}`, { subtitle: `§7PHASE ${st.phase}${st.phase === 3 ? " — §4RAMPAGE" : ""}`, fadeInDuration: 4, stayDuration: 30, fadeOutDuration: 8 });
    }
  }

  /**
   * Update budget (called every tick):
   *   engaged (attacking / recently hit / boss in fight) → every tick
   *   near  < 16 blocks → every tick · medium < 32 → every 3 ticks · far → every 10 ticks
   */
  tick(): void {
    const t = system.currentTick;
    const sessions = [...game().sessions.values()];
    for (const [id, tr] of this.tracked) {
      const e = tr.entity;
      if (!e.isValid) {
        this.tracked.delete(id);
        continue;
      }
      if (t < tr.nextThink) continue;
      let near: Session | undefined;
      let nd = Infinity;
      for (const s of sessions) {
        if (s.player.dimension.id !== e.dimension.id) continue;
        const d = dist(s.player.location, e.location);
        if (d < nd) (nd = d), (near = s);
      }
      const st = tr.state;
      const engaged = !!st.pendingImpact || tr.marks.length > 0 || (st.lastHitBy !== null && t - tr.lastEngaged < 100);
      if (st.lastHitBy && nd < 24) tr.lastEngaged = t;
      tr.nextThink = t + (engaged || nd < 16 ? 1 : nd < 32 ? 3 : 10);
      if (t % 10 === 0) {
        try {
          e.nameTag = nameplate(st, t);
        } catch {
          /* ignore */
        }
      }
      if (st.def.tier === "boss") {
        if (t % 10 === 0) this.syncBossBar(e, st);
        this.bossArena(tr, nd, t);
      }
      if (!near || nd > Config.performance.aiFarDistance) continue;
      this.think(tr, near, nd, t);
    }
  }

  /** Arena leash + reset when abandoned (no duplicate rewards: state is reset, not respawned). */
  private bossArena(tr: Tracked, nearestPlayer: number, t: number): void {
    const e = tr.entity;
    const st = tr.state;
    if (dist(e.location, tr.home) > 26) {
      try {
        e.teleport(tr.home);
      } catch {
        /* ignore */
      }
      st.pendingImpact = null;
      tr.marks = [];
    }
    if (nearestPlayer < 48) {
      tr.lastEngaged = Math.max(tr.lastEngaged, t - 1);
      return;
    }
    if (t - tr.lastEngaged > 600 && (st.hp < st.maxHp || st.phase !== 1)) {
      st.hp = st.maxHp;
      st.phase = 1;
      st.breakGauge = st.def.breakGauge;
      st.brokenUntil = 0;
      st.aura = null;
      st.pendingImpact = null;
      tr.marks = [];
      this.syncBossBar(e, st);
    }
  }

  /** Existing live boss of this type near a point (reconnect / quest re-present guard). */
  findBoss(enemyId: string, near: Vector3, radius = 64): Entity | undefined {
    for (const tr of this.tracked.values()) {
      if (tr.state.def.id === enemyId && tr.entity.isValid && dist(tr.entity.location, near) < radius) return tr.entity;
    }
    return undefined;
  }

  private think(tr: Tracked, s: Session, d: number, t: number): void {
    const st = tr.state;
    const e = tr.entity;
    const def = st.def;
    // Resolve AoE marks (boss phase attacks)
    for (const m of [...tr.marks]) {
      if (t < m.tick) {
        if ((m.tick - t) % 4 === 0) ring(e.dimension, "noct:telegraph", m.center, m.radius, 10);
        continue;
      }
      tr.marks.splice(tr.marks.indexOf(m), 1);
      particle(e.dimension, "noct:solar_blast", m.center);
      for (const other of game().sessions.values()) {
        if (dist(other.player.location, m.center) <= m.radius) this.resolveHit(other, st, m.tick, m.mult);
      }
    }
    if (st.isBroken(t) || st.has("frozen", t)) {
      st.pendingImpact = null;
      if (t % 10 === 0) particle(e.dimension, st.has("frozen", t) ? "noct:frost_burst" : "noct:break", { x: e.location.x, y: e.location.y + 1.5, z: e.location.z });
      try {
        e.addEffect("slowness", 12, { amplifier: 10, showParticles: false });
      } catch {
        /* ignore */
      }
      return;
    }
    if (st.pendingImpact && t >= st.pendingImpact.tick) {
      const impact = st.pendingImpact;
      st.pendingImpact = null;
      if (d <= def.attack.range + 1.2) this.resolveHit(s, st, impact.tick, def.attack.mult);
      return;
    }
    if (st.pendingImpact || t < st.nextAttackTick) return;
    const rage = st.phase === 3 ? 0.6 : 1;
    // Boss pattern: every 3rd attack in phase ≥2 is a ground AoE at the player.
    if (def.tier === "boss" && st.phase >= 2 && tr.attackCount % 3 === 2 && d < 20) {
      tr.attackCount++;
      const marks = st.phase === 3 ? 3 : 1;
      for (let i = 0; i < marks; i++) {
        const c = { x: s.player.location.x + (i ? (Math.random() - 0.5) * 8 : 0), y: s.player.location.y, z: s.player.location.z + (i ? (Math.random() - 0.5) * 8 : 0) };
        tr.marks.push({ tick: t + 30 + i * 6, center: c, radius: 3, mult: def.attack.mult * 1.2 });
      }
      if (def.id === "void_seraph") {
        try {
          e.addEffect("levitation", 30, { amplifier: 1, showParticles: false });
        } catch {
          /* ignore */
        }
      }
      worldSound(e.dimension, "nocterra.telegraph", e.location, 0.7);
      st.nextAttackTick = t + Math.round(def.attack.cooldown * rage);
      return;
    }
    if (d <= def.attack.range) {
      tr.attackCount++;
      st.pendingImpact = { tick: t + Math.round(def.attack.windup * (st.phase === 3 ? 0.8 : 1)), targetId: s.id };
      st.nextAttackTick = t + Math.round(def.attack.cooldown * rage);
      // Telegraph: flash + sound so mobile players can read the timing.
      particle(e.dimension, "noct:telegraph", { x: e.location.x, y: e.location.y + 2.2, z: e.location.z });
      worldSound(e.dimension, "nocterra.telegraph", e.location, def.tier === "boss" ? 0.7 : 1.6);
      try {
        const dir = flatDir(sub(s.player.location, e.location));
        e.applyKnockback({ x: -dir.x * 0.05, z: -dir.z * 0.05 }, 0); // wind-up lean
      } catch {
        /* ignore */
      }
    }
  }

  private resolveHit(s: Session, st: EnemyState, impactTick: number, mult: number): void {
    const verdict = judgeIncoming(s.dodge, impactTick, Config.combat.perfectDodgeWindowTicks);
    if (verdict === "perfect") return onPerfectDodge(s);
    if (verdict === "dodged") return;
    damageActive(s, st.def.atk * st.scale * mult * 6);
  }
}

export const enemies = new EnemyRuntimeImpl();

function nameplate(st: EnemyState, t: number): string {
  if (st.def.tier === "boss") {
    const brk = st.isBroken(t) ? "§e§lBREAK" : `§e${"▮".repeat(Math.ceil((st.breakGauge / st.def.breakGauge) * 6))}§8${"▮".repeat(6 - Math.ceil((st.breakGauge / st.def.breakGauge) * 6))}`;
    const aura = st.aura && st.aura.expiresAt > t ? ` ${auraIcon(st.aura.element)}` : "";
    return `§l§f${st.def.name.toUpperCase()}§r  §7PHASE ${st.phase}  ${brk}${aura}`;
  }
  const pct = st.hp / st.maxHp;
  const bars = 10;
  const filled = Math.ceil(pct * bars);
  const hp = `§c${"▮".repeat(filled)}§8${"▮".repeat(bars - filled)}`;
  const brk = st.def.breakGauge > 0 ? (st.isBroken(t) ? " §e§lBREAK" : ` §e${"▮".repeat(Math.ceil((st.breakGauge / st.def.breakGauge) * 5))}`) : "";
  const aura = st.aura && st.aura.expiresAt > t ? ` ${auraIcon(st.aura.element)}` : "";
  const tier = st.def.tier === "elite" ? "§6◆ " : "";
  return `${tier}§f${st.def.name}${aura}\n${hp}${brk}`;
}

function auraIcon(e: string): string {
  return ({ IGNIS: "§c🔥", GLACIA: "§b❄", VOLT: "§e⚡", AER: "§a≋", LUX: "§f✧", UMBRA: "§5◐" } as Record<string, string>)[e] ?? "";
}

function reward(s: Session, def: EnemyDef, scale: number): void {
  const p = s.profile;
  const now = game().clock.now();
  const exp = Math.round(def.exp * scale);
  const members = partyMembers(p);
  for (const id of members) {
    const gained = addCharacterExp(p, id, id === s.activeId ? exp : Math.round(exp * 0.8));
    if (gained > 0) {
      const inst = p.characters[id];
      s.player.onScreenDisplay.setTitle(" ", { subtitle: `§a${getCharacter(id).name} Lv.${inst.level}`, fadeInDuration: 2, stayDuration: 20, fadeOutDuration: 6 });
      sound(s.player, "nocterra.levelup");
      s.invalidateStats();
    }
  }
  const ranks = addNexusExp(p, Math.max(1, Math.round(def.exp * 0.25)));
  if (ranks > 0) s.player.sendMessage(`§b[NEXUS] §fNexus Rank ${p.nexusRank} 달성!`);
  const materials: Record<string, number> = {};
  if (def.element && Math.random() < (def.tier === "normal" ? 0.25 : 1)) materials[`crystal_${def.element.toLowerCase()}`] = def.tier === "boss" ? 6 : def.tier === "elite" ? 2 : 1;
  if (def.tier !== "normal") materials.rift_core = def.tier === "boss" ? 5 : 2;
  if (Math.random() < (def.tier === "normal" ? 0.1 : 0.6)) materials.talent_tome = def.tier === "boss" ? 3 : 1;
  grant(p, { credit: def.credit, materials });
  if (def.tier !== "normal") {
    const imp = rollImprint(p, game().rng);
    s.player.sendMessage(`§d[기억각인] §f${imp.setId.toUpperCase()} — ${imp.slot} 획득`);
  }
  addDailyProgress(p, "kills", 1, now);
  if (def.tier === "boss") {
    if (p.story.flags.unlock_weekly && p.weekly.bossClears < 3) {
      grant(p, { astrum: 60, materials: { rift_core: 3, talent_tome: 2 } });
      s.player.sendMessage(`§6[WEEKLY] §f주간 보스 보상 ${p.weekly.bossClears + 1}/3 — Astrum +60`);
    }
    p.weekly.bossClears++;
    playAnim(s.player, "victory");
  }
  // Elite/boss drops are currency + item grants → critical save; normal kills use the dirty queue.
  if (def.tier === "normal") game().save.markDirty(p.playerId);
  else game().save.saveNow(p.playerId);
  bus.emit("combat:kill", { playerId: s.id, characterId: s.activeId ?? "", enemyType: def.id, exp });
}

export function registerEnemyEvents(): void {
  world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    if (entity.isValid && enemies.isEnemy(entity)) enemies.register(entity);
  });
  world.beforeEvents.entityRemove.subscribe(({ removedEntity }) => enemies.forget(removedEntity.id));
  system.runInterval(guarded("enemies.tick", () => enemies.tick()), 1);
}
