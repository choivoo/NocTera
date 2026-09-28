/**
 * Executes character actions in the world. All damage, healing, energy and
 * gauge math is done here on the server; the client only sends "intent"
 * (which control item was tapped).
 */
import { system, type Entity, type Vector3 } from "@minecraft/server";
import type { Session, CharRuntime } from "../runtime/Session";
import type { ActionDef, EffectDef, ElementId } from "../data/types";
import { Config, getCharacter } from "../data/registry";
import { effectiveTalent, resonanceValue, talentScale } from "../character/Stats";
import { applyElement } from "./Elements";
import { computeBreak, computeDamage, computeHeal } from "./DamageCalc";
import { enemies } from "./EnemyRuntime";
import { angleTo, dist, flatDir, sub } from "../core/Vec";
import { particle, ring, sound, worldSound } from "../audio/Fx";
import { game } from "../runtime/Game";
import { bus } from "../core/EventBus";
import { addDailyProgress } from "../account/Progression";
import { imprintFourPiece } from "../artifact/ImprintRuntime";

const C = () => Config.combat;
const tick = () => system.currentTick;

type HitKind = "normal" | "skill" | "ultimate" | "switch" | "qte" | "summon" | "field" | "reaction";

export function enemiesNear(s: Session, center: Vector3, radius: number): Entity[] {
  try {
    return s.player.dimension.getEntities({ location: center, maxDistance: radius, families: ["noct_enemy"] });
  } catch {
    return [];
  }
}

function targetsFor(s: Session, e: { range: number; arc?: number; radius?: number }): Entity[] {
  const pos = s.player.location;
  let list: Entity[];
  if (e.radius && e.radius > 0) list = enemiesNear(s, pos, e.radius);
  else {
    const view = s.player.getViewDirection();
    const arc = e.arc ?? 60;
    const inRange = enemiesNear(s, pos, e.range + 0.8);
    list = inRange.filter((en) => dist(pos, en.location) < 1.2 || angleTo(pos, view, en.location) <= arc / 2);
    // Touch aim-assist: narrow ranged attacks snap to the nearest enemy in a 70° cone.
    if (list.length === 0 && arc <= 30) {
      const assisted = inRange.filter((en) => angleTo(pos, view, en.location) <= 35);
      assisted.sort((a, b) => dist(pos, a.location) - dist(pos, b.location));
      list = assisted.slice(0, 1);
    }
  }
  // Nearest first; cap hits per action for performance.
  list.sort((a, b) => dist(pos, a.location) - dist(pos, b.location));
  return list.slice(0, C().maxHitsPerTick);
}

export function nearestEnemy(s: Session, range: number): Entity | undefined {
  const list = enemiesNear(s, s.player.location, range);
  let best: Entity | undefined;
  let bd = Infinity;
  for (const e of list) {
    const d = dist(s.player.location, e.location);
    if (d < bd) (bd = d), (best = e);
  }
  return best;
}

function gainEnergy(s: Session, rt: CharRuntime, amount: number): void {
  const t = tick();
  const er = s.stats(rt.id, t).energyRegen / 100;
  const def = getCharacter(rt.id);
  const cap = def.kit.ultimate.energyCost ?? 60;
  rt.energy = Math.min(cap, rt.energy + amount * er);
  // Bench members get a share, so rotations matter.
  for (const other of s.chars.values()) {
    if (other === rt || other.hp <= 0) continue;
    const ocap = getCharacter(other.id).kit.ultimate.energyCost ?? 60;
    other.energy = Math.min(ocap, other.energy + amount * 0.3 * (s.stats(other.id, t).energyRegen / 100));
  }
}

function gainGauge(s: Session, rt: CharRuntime, amount: number): void {
  const def = getCharacter(rt.id);
  const m = def.mechanic;
  if (m.type === "none" || !m.state) return;
  const t = tick();
  if (rt.stateUntil > t) return;
  rt.gauge = Math.min(m.max, rt.gauge + amount);
  if (rt.gauge >= m.max) {
    const inst = s.profile.characters[rt.id];
    const bonus = resonanceValue(inst, "winterDuration");
    rt.stateUntil = t + (m.state.duration + bonus) * 20;
    rt.gauge = 0;
    rt.energy += resonanceValue(inst, "winterEnergy");
    s.invalidateStats();
    s.player.onScreenDisplay.setTitle(" ", { subtitle: `§b${m.state.name.toUpperCase()}`, fadeInDuration: 2, stayDuration: 20, fadeOutDuration: 6 });
    ring(s.player.dimension, "noct:frost_burst", s.player.location, 2.5, 16);
    sound(s.player, "noct.perfect", 0.8);
  }
}

export interface HitOptions {
  mult: number;
  element: ElementId | null;
  breakDmg: number;
  kind: HitKind;
  knockback?: number;
  launch?: number;
  bonusDmgPct?: number;
  charId?: string;
}

/** Applies one server-computed hit. Returns damage dealt (0 if target invalid). */
export function hitEnemy(s: Session, target: Entity, o: HitOptions): number {
  if (!target.isValid) return 0;
  const state = enemies.state(target);
  if (!state || state.hp <= 0) return 0;
  const t = tick();
  const charId = o.charId ?? s.activeId!;
  const stats = s.stats(charId, t);
  const def = getCharacter(charId);

  const el = applyElement(state.aura, o.element, t, C().elementAuraTicks);
  state.aura = el.aura;
  let bonus = o.bonusDmgPct ?? 0;
  if (o.kind === "normal") bonus += s.buffTotal("normalDmg", t);
  const res = computeDamage(
    {
      attacker: stats,
      mult: o.mult,
      elemental: o.element === def.element,
      bonusDmgPct: bonus,
      targetDef: state.def.def,
      targetBroken: state.isBroken(t),
      brokenTakenMult: C().breakDamageTaken,
      reaction: el.reaction,
      defConstant: C().defConstant,
    },
    game().rng,
  );

  state.lastHitBy = { playerId: s.id, characterId: charId };
  const killed = state.applyDamage(res.amount);
  const broke = state.applyBreak(computeBreak(o.breakDmg, stats.breakPower, el.reaction), t, C().breakDurationTicks);
  s.inCombatUntil = t + 200;

  // Feedback
  const dim = target.dimension;
  const at = { x: target.location.x, y: target.location.y + 1, z: target.location.z };
  if (res.crit) particle(dim, "noct:slash_arc", at);
  if (el.reaction) {
    particle(dim, "noct:reaction", at, 3);
    worldSound(dim, "noct.reaction", at, 1.2);
    if (el.reaction.id === "SPREAD" && el.consumed) {
      for (const other of enemiesNear(s, target.location, 4)) {
        if (other.id === target.id) continue;
        const os = enemies.state(other);
        if (!os) continue;
        os.aura = { element: el.consumed, expiresAt: t + C().elementAuraTicks };
        hitEnemy(s, other, { mult: el.reaction.flatScale ?? 0.8, element: null, breakDmg: 4, kind: "reaction", charId });
      }
    }
    if (el.reaction.id === "OVERDRIVE") {
      for (const other of enemiesNear(s, target.location, 3)) {
        if (other.id !== target.id) hitEnemy(s, other, { mult: 0.6, element: null, breakDmg: 6, kind: "reaction", charId });
      }
    }
  }
  if (broke) {
    particle(dim, "noct:break", at, 4);
    worldSound(dim, "noct.break", at);
    bus.emit("combat:break", { playerId: s.id, targetId: target.id });
    markQte(s, "break");
  }
  // Statuses (bosses resist hard CC)
  const boss = state.def.tier === "boss";
  if (o.element === "GLACIA" && (o.kind === "skill" || o.kind === "ultimate" || o.kind === "qte") && !boss) {
    state.setStatus("frozen", t + 40);
    markQte(s, "frozen");
  }
  if (o.element === "VOLT") {
    state.setStatus("shocked", t + 60);
    markQte(s, "shocked");
  }
  if (o.launch && !boss) {
    state.setStatus("airborne", t + 30);
    markQte(s, "airborne");
  }
  try {
    const dir = flatDir(sub(target.location, s.player.location));
    if ((o.knockback || o.launch) && !boss) target.applyKnockback({ x: dir.x * (o.knockback ?? 0.2), z: dir.z * (o.knockback ?? 0.2) }, o.launch ?? 0);
    if (o.kind === "normal" && !boss) target.addEffect("slowness", 4, { amplifier: 4, showParticles: false }); // hitstop feel
  } catch {
    /* entity gone */
  }

  s.lastHit = `${res.crit ? "§6✦" : "§f"}${res.amount.toLocaleString()}${el.reaction ? ` §d${el.reaction.name}` : ""}${broke ? " §cBREAK" : ""}`;
  s.lastHitUntil = t + 30;
  bus.emit("combat:damage", { playerId: s.id, characterId: charId, targetId: target.id, amount: res.amount, crit: res.crit, element: o.element, reaction: el.reaction?.id ?? null });

  // Zeon-style fields add a bolt when the active character attacks inside them.
  if (o.kind === "normal" || o.kind === "skill") {
    for (const f of s.fields) {
      if (f.onAttackBonusMult > 0 && f.until > t && dist(f.center, target.location) <= f.radius) {
        particle(dim, "noct:lightning", at, 2);
        hitEnemy(s, target, { mult: f.onAttackBonusMult, element: (f.element as ElementId) ?? null, breakDmg: 3, kind: "field", charId: f.owner });
      }
    }
  }

  if (killed || state.hp <= 0) enemies.kill(target, s);
  else if (state.def.tier === "boss" && state.updatePhase()) enemies.onPhase(target, state);
  return res.amount;
}

/** Lights up bench characters whose QTE condition is met. */
function markQte(s: Session, trigger: "frozen" | "break" | "airborne" | "shocked"): void {
  const t = tick();
  for (const rt of s.chars.values()) {
    if (rt.id === s.activeId || rt.hp <= 0) continue;
    const q = getCharacter(rt.id).qte;
    if (q?.trigger === trigger && rt.qteReadyUntil <= t) {
      rt.qteReadyUntil = t + 60;
      sound(s.player, "noct.perfect", 1.6, 0.6);
    }
  }
}

function executeEffects(s: Session, charId: string, action: ActionDef, kind: HitKind, scale: number): void {
  const player = s.player;
  const dim = player.dimension;
  let delay = 0;
  let firstDamage = true;
  for (const e of action.effects) {
    const run = () => applyEffect(s, charId, e, kind, scale);
    if (e.type === "damage") {
      if (!firstDamage) delay += 3;
      firstDamage = false;
    }
    if (delay === 0) run();
    else system.runTimeout(() => player.isValid && run(), delay);
  }
  particle(dim, kind === "ultimate" ? "noct:switch_in" : "noct:slash_arc", player.location);
}

function applyEffect(s: Session, charId: string, e: EffectDef, kind: HitKind, scale: number): void {
  const p = s.player;
  const t = tick();
  const rt = s.chars.get(charId);
  if (!rt) return;
  switch (e.type) {
    case "damage": {
      for (const target of targetsFor(s, e)) {
        hitEnemy(s, target, { mult: e.mult * scale, element: e.element ?? null, breakDmg: e.breakDmg ?? 4, kind, knockback: e.knockback, launch: e.launch, charId });
      }
      if (e.radius) ring(p.dimension, "noct:slash_arc", p.location, e.radius, 10);
      break;
    }
    case "dash": {
      const d = flatDir(p.getViewDirection());
      try {
        p.applyKnockback({ x: d.x * e.distance * 0.45, z: d.z * e.distance * 0.45 }, 0.05);
      } catch {
        /* ignore */
      }
      s.dodge.iframesUntil = Math.max(s.dodge.iframesUntil, t + 6);
      break;
    }
    case "teleport_behind": {
      const target = nearestEnemy(s, e.range);
      if (!target) break;
      const d = flatDir(sub(target.location, p.location));
      const dest = { x: target.location.x + d.x * 1.5, y: target.location.y, z: target.location.z + d.z * 1.5 };
      particle(p.dimension, "noct:shadow_puff", p.location, 3);
      try {
        p.teleport(dest, { facingLocation: target.location, checkForBlocks: true });
      } catch {
        /* blocked */
      }
      s.dodge.iframesUntil = Math.max(s.dodge.iframesUntil, t + 6);
      break;
    }
    case "heal": {
      const amount = computeHeal(s.stats(charId, t), e.pctAtk * scale, e.flat);
      const targets = e.target === "party" ? [...s.chars.values()] : [s.active!].filter(Boolean);
      for (const r of targets) {
        if (r.hp <= 0) continue;
        r.hp = Math.min(s.stats(r.id, t).maxHp, r.hp + amount);
      }
      particle(p.dimension, "noct:heal", p.location, 4);
      break;
    }
    case "shield": {
      const active = s.active;
      if (!active) break;
      active.shield = Math.round(computeHeal(s.stats(charId, t), e.pctAtk * scale) * (1 + resonanceValue(s.profile.characters[charId], "shieldPct") / 100));
      active.shieldUntil = t + e.duration * 20;
      ring(p.dimension, "noct:shield", p.location, 1.2, 8);
      break;
    }
    case "buff": {
      s.addBuff({ stat: e.stat, value: e.value, until: t + e.duration * 20, source: `${charId}:${e.stat}` });
      if (e.stat === "moveSpeed") p.addEffect("speed", e.duration * 20, { amplifier: Math.max(0, Math.round(e.value / 20) - 1), showParticles: false });
      break;
    }
    case "hp_cost": {
      const inst = s.profile.characters[charId];
      const free = resonanceValue(inst, "freeSkill") > 0 && rt.stateUntil > t && kind === "skill";
      if (!free) rt.hp = Math.max(1, Math.round(rt.hp * (1 - e.pctCurrent / 100)));
      gainGauge(s, rt, e.pctCurrent * 1.5 * (1 + resonanceValue(inst, "heatGain")));
      break;
    }
    case "gauge":
      gainGauge(s, rt, e.amount);
      break;
    case "summon": {
      const extra = resonanceValue(s.profile.characters[charId], "droneCount");
      for (let i = 0; i < e.count + extra; i++) {
        s.summons.push({ owner: charId, kind: e.kind, until: t + e.duration * 20, nextAt: t + 10 + i * 5, interval: Math.round(e.interval * 20), mult: e.mult * scale, range: e.range, index: i });
      }
      break;
    }
    case "field": {
      s.fields.push({
        owner: charId,
        center: { ...p.location },
        radius: e.radius,
        until: t + (e.duration + resonanceValue(s.profile.characters[charId], "fieldDuration")) * 20,
        nextAt: t,
        interval: Math.max(1, Math.round(e.interval * 20)),
        mult: e.mult * scale,
        pull: e.pull ?? 0,
        element: e.element ?? null,
        onAttackBonusMult: (e.onAttackBonusMult ?? 0) * scale,
        healPctAtk: e.healPctAtk ?? 0,
        particle: e.element === "UMBRA" ? "noct:void_field" : e.element === "VOLT" ? "noct:lightning" : e.element === "AER" ? "noct:cyclone" : "noct:eden",
      });
      break;
    }
    case "pull": {
      for (const en of enemiesNear(s, p.location, e.radius)) {
        const d = flatDir(sub(p.location, en.location));
        try {
          en.applyKnockback({ x: d.x * e.strength, z: d.z * e.strength }, 0.1);
        } catch {
          /* ignore */
        }
      }
      break;
    }
    case "fx":
      if (e.particle) particle(p.dimension, e.particle, p.location, 3);
      if (e.sound) sound(p, e.sound);
      break;
  }
}

// ───────────────────────────── inputs ─────────────────────────────

function canAct(s: Session): CharRuntime | null {
  const t = tick();
  if (t < s.busyUntil) return null;
  const rt = s.active;
  if (!rt || rt.hp <= 0) return null;
  return rt;
}

export function normalAttack(s: Session): void {
  const rt = canAct(s);
  if (!rt) return;
  const t = tick();
  const def = getCharacter(rt.id);
  const step = rt.combo.attack(t, s.buffTotal("atkSpeed", t));
  if (!step) return;
  const scale = talentScale(effectiveTalent(s.profile.characters[rt.id], "normal"));
  const element = rt.stateUntil > t ? def.mechanic.state?.normalElement ?? null : null;
  const targets = targetsFor(s, step.hit);
  sound(s.player, step.hit.sound, 1 + step.step * 0.05);
  const view = s.player.getViewDirection();
  const fxAt = { x: s.player.location.x + view.x * 1.5, y: s.player.location.y + 1.2, z: s.player.location.z + view.z * 1.5 };
  particle(s.player.dimension, step.hit.particle, fxAt);
  let landed = 0;
  for (const target of targets) {
    if (hitEnemy(s, target, { mult: step.hit.mult * scale, element, breakDmg: step.hit.breakDmg ?? 4, kind: "normal", knockback: step.finisher ? 0.5 : 0.08 })) landed++;
  }
  if (landed > 0) {
    gainEnergy(s, rt, C().energyPerHit);
    gainGauge(s, rt, def.mechanic.gainPerHit * (step.finisher ? 2 : 1));
    if (step.finisher && s.profile.settings.cameraShake) shake(s, 0.08);
  }
}

export function useSkill(s: Session): void {
  const rt = canAct(s);
  if (!rt) return;
  const t = tick();
  const def = getCharacter(rt.id);
  const inst = s.profile.characters[rt.id];
  const maxCharges = 1 + resonanceValue(inst, "skillCharges");
  const cdTicks = Math.round(((def.kit.skill.cooldown ?? 8) - resonanceValue(inst, "skillCdr")) * 20);
  while (rt.skillCharges < maxCharges && t >= rt.skillReadyAt) {
    rt.skillCharges++;
    if (rt.skillCharges < maxCharges) rt.skillReadyAt += cdTicks;
  }
  if (rt.skillCharges <= 0) {
    s.lastHit = `§7SKILL ${Math.ceil((rt.skillReadyAt - t) / 20)}s`;
    s.lastHitUntil = t + 20;
    return;
  }
  if (rt.skillCharges === maxCharges) rt.skillReadyAt = t + cdTicks;
  rt.skillCharges--;
  const scale = talentScale(effectiveTalent(inst, "skill"));
  executeEffects(s, rt.id, def.kit.skill, "skill", scale);
  gainEnergy(s, rt, def.kit.skill.energyGain ?? 10);
  imprintFourPiece(s, rt.id, "skill", t);
  addDailyProgress(s.profile, "skills", 1, game().clock.now());
}

export function useUltimate(s: Session): void {
  const rt = canAct(s);
  if (!rt) return;
  const t = tick();
  const def = getCharacter(rt.id);
  const cost = def.kit.ultimate.energyCost ?? 60;
  if (rt.energy < cost) {
    s.lastHit = `§7ULT ${Math.floor(rt.energy)}/${cost}`;
    s.lastHitUntil = t + 20;
    return;
  }
  rt.energy = 0;
  const inst = s.profile.characters[rt.id];
  s.busyUntil = t + 16; // brief cinematic lock
  s.dodge.iframesUntil = t + 20;
  ultimateCinematic(s, def.kit.ultimate.name, def.visual.color);
  const scale = talentScale(effectiveTalent(inst, "ultimate"));
  system.runTimeout(() => {
    if (!s.player.isValid) return;
    executeEffects(s, rt.id, def.kit.ultimate, "ultimate", scale);
    imprintFourPiece(s, rt.id, "ultimate", tick());
    if (s.profile.settings.cameraShake) shake(s, 0.25);
  }, 14);
}

function ultimateCinematic(s: Session, name: string, _color: string): void {
  const p = s.player;
  const view = flatDir(p.getViewDirection());
  const cam = { x: p.location.x + view.x * 3.2 + view.z * 1.6, y: p.location.y + 1.7, z: p.location.z + view.z * 3.2 - view.x * 1.6 };
  try {
    p.camera.setCamera("minecraft:free", { location: cam, facingLocation: { x: p.location.x, y: p.location.y + 1.3, z: p.location.z }, easeOptions: { easeTime: 0.25, easeType: "OutCubic" as any } });
    system.runTimeout(() => p.isValid && p.camera.clear(), 16);
  } catch {
    /* camera unsupported */
  }
  p.onScreenDisplay.setTitle(" ", { subtitle: `§l§f${name.toUpperCase()}`, fadeInDuration: 0, stayDuration: 14, fadeOutDuration: 6 });
  sound(p, "noct.ultimate");
}

export function shake(s: Session, intensity: number): void {
  try {
    s.player.runCommand(`camerashake add @s ${intensity.toFixed(2)} 0.15 positional`);
  } catch {
    /* ignore */
  }
}

export function dodge(s: Session): void {
  const rt = canAct(s);
  if (!rt) return;
  const t = tick();
  const cd = C().dodgeCooldownTicks * (resonanceValue(s.profile.characters[rt.id], "dodgeGauge") > 0 && rt.stateUntil > t ? 0.5 : 1);
  if (t < s.dodge.cooldownUntil) return;
  s.dodge.lastDodgeTick = t;
  s.dodge.iframesUntil = t + C().dodgeIframes;
  s.dodge.cooldownUntil = t + Math.round(cd);
  const v = s.player.getVelocity();
  const moving = Math.hypot(v.x, v.z) > 0.05;
  const d = moving ? flatDir(v) : flatDir(s.player.getViewDirection());
  const sign = moving ? 1 : -1; // standing still → backstep
  try {
    s.player.applyKnockback({ x: d.x * 1.4 * sign, z: d.z * 1.4 * sign }, 0.12);
  } catch {
    /* ignore */
  }
  particle(s.player.dimension, "noct:shadow_puff", s.player.location);
  sound(s.player, "noct.dodge");
}

/** Called by EnemyRuntime when an attack is dodged inside the perfect window. */
export function onPerfectDodge(s: Session): void {
  const rt = s.active;
  if (!rt) return;
  const t = tick();
  s.dodge.iframesUntil = t + 20;
  particle(s.player.dimension, "noct:perfect_dodge", s.player.location);
  sound(s.player, "noct.perfect", 1.4);
  s.player.onScreenDisplay.setTitle(" ", { subtitle: "§b§lPERFECT DODGE", fadeInDuration: 0, stayDuration: 16, fadeOutDuration: 6 });
  // "Time slow": enemies around are slowed hard, next normal attack is a counter.
  for (const en of enemiesNear(s, s.player.location, 10)) {
    try {
      en.addEffect("slowness", 50, { amplifier: 6, showParticles: false });
    } catch {
      /* ignore */
    }
  }
  s.addBuff({ stat: "normalDmg", value: 80, until: t + 40, source: "perfect_counter" });
  gainEnergy(s, rt, 6);
  gainGauge(s, rt, 15 + resonanceValue(s.profile.characters[rt.id], "dodgeGauge"));
  bus.emit("combat:perfectDodge", { playerId: s.id, characterId: rt.id });
}

/** Switches to party slot `slot`. Handles out/in FX, i-frames, switch-in skill and QTE. */
export function switchTo(s: Session, slot: number): void {
  const t = tick();
  if (t < s.busyUntil) return;
  const targetId = s.profile.party[slot];
  if (!targetId || !s.profile.characters[targetId]) return;
  if (slot === s.profile.activeSlot) return;
  const target = s.chars.get(targetId);
  if (!target || target.hp <= 0) {
    s.lastHit = "§c전투 불능";
    s.lastHitUntil = t + 20;
    return;
  }
  const qte = target.qteReadyUntil > t;
  if (t < s.switchReadyAt && !qte) return;
  const fromId = s.activeId;
  const p = s.player;
  particle(p.dimension, "noct:switch_out", p.location, 3);
  s.profile.activeSlot = slot;
  s.switchReadyAt = t + C().switchCooldownTicks;
  s.dodge.iframesUntil = Math.max(s.dodge.iframesUntil, t + C().switchIframes);
  s.invalidateStats();
  if (fromId) s.chars.get(fromId)?.combo.reset();
  const def = getCharacter(targetId);
  sound(p, "noct.switch", qte ? 1.5 : 1.1);
  p.onScreenDisplay.setTitle(" ", { subtitle: `${qte ? "§e§lQTE  " : "§f"}${def.name}`, fadeInDuration: 0, stayDuration: 10, fadeOutDuration: 5 });
  system.runTimeout(() => {
    if (!p.isValid) return;
    particle(p.dimension, "noct:switch_in", p.location, 3);
    if (qte && def.qte) {
      target.qteReadyUntil = 0;
      executeEffects(s, targetId, def.qte.action, "qte", talentScale(effectiveTalent(s.profile.characters[targetId], "skill")));
      gainEnergy(s, target, 8);
    } else executeEffects(s, targetId, def.kit.switchIn, "switch", 1);
  }, 3);
  addDailyProgress(s.profile, "switch", 1, game().clock.now());
  bus.emit("party:switched", { playerId: s.id, from: fromId, to: targetId });
}

/** Incoming damage to the active character (from EnemyRuntime). */
export function damageActive(s: Session, raw: number): void {
  const rt = s.active;
  if (!rt || rt.hp <= 0) return;
  const t = tick();
  const stats = s.stats(rt.id, t);
  let dmg = raw * (C().defConstant / (C().defConstant + stats.def));
  dmg *= 1 - Math.min(80, s.buffTotal("dmgReduction", t)) / 100;
  dmg = Math.max(1, Math.round(dmg));
  if (rt.shield > 0 && rt.shieldUntil > t) {
    const absorbed = Math.min(rt.shield, dmg);
    rt.shield -= absorbed;
    dmg -= absorbed;
  }
  rt.hp = Math.max(0, rt.hp - dmg);
  s.inCombatUntil = t + 200;
  sound(s.player, getCharacter(rt.id).sounds.hurt);
  try {
    s.player.runCommand("camerashake add @s 0.15 0.12 positional");
  } catch {
    /* ignore */
  }
  if (rt.hp <= 0) onCharacterDown(s);
}

function onCharacterDown(s: Session): void {
  const next = s.profile.party.findIndex((id, i) => id && i !== s.profile.activeSlot && s.alive(id));
  const p = s.player;
  if (next >= 0) {
    p.onScreenDisplay.setTitle("§c전투 불능", { subtitle: `${getCharacter(s.activeId!).name}`, fadeInDuration: 0, stayDuration: 20, fadeOutDuration: 10 });
    s.switchReadyAt = 0;
    switchTo(s, next);
    return;
  }
  // Party wipe → fade, return to last beacon, revive at 30%.
  s.busyUntil = tick() + 60;
  try {
    p.camera.fade({ fadeTime: { fadeInTime: 0.5, holdTime: 1.5, fadeOutTime: 1 }, fadeColor: { red: 0, green: 0, blue: 0 } });
  } catch {
    /* ignore */
  }
  p.onScreenDisplay.setTitle("§4PARTY DEFEATED", { subtitle: "§7Nexus Beacon으로 귀환합니다", fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
  system.runTimeout(() => {
    if (!p.isValid) return;
    for (const rt of s.chars.values()) rt.hp = Math.round(s.stats(rt.id, tick()).maxHp * 0.3);
    s.profile.activeSlot = Math.max(0, s.profile.party.findIndex((c) => c));
    import("../world/World").then((w) => w.returnToBeacon(s));
  }, 30);
}

// ───────────────────────── per-tick simulation ─────────────────────────

/** Drones, fields, timed state. Called for each session every 2 ticks. */
export function tickSession(s: Session): void {
  const t = tick();
  s.prune(t);
  const p = s.player;
  const dim = p.dimension;
  for (const d of s.summons) {
    const a = (t / 10 + (d.index * Math.PI * 2) / 3) % (Math.PI * 2);
    const pos = { x: p.location.x + Math.cos(a) * 1.4, y: p.location.y + 2.2, z: p.location.z + Math.sin(a) * 1.4 };
    if (t % 4 === 0) particle(dim, "noct:spark_tracer", pos);
    if (t >= d.nextAt) {
      d.nextAt = t + d.interval;
      const target = nearestEnemy(s, d.range);
      if (target) {
        particle(dim, "noct:spark_burst", { x: target.location.x, y: target.location.y + 1, z: target.location.z });
        hitEnemy(s, target, { mult: d.mult, element: "VOLT", breakDmg: 3, kind: "summon", charId: d.owner });
      }
    }
  }
  for (const f of s.fields) {
    if (t % 6 === 0) ring(dim, f.particle, f.center, f.radius, 8);
    if (t < f.nextAt) continue;
    f.nextAt = t + f.interval;
    if (f.healPctAtk > 0) {
      const amount = computeHeal(s.stats(f.owner, t), f.healPctAtk);
      const a = s.active;
      if (a && a.hp > 0 && dist(p.location, f.center) <= f.radius) a.hp = Math.min(s.stats(a.id, t).maxHp, a.hp + amount);
    }
    for (const en of enemiesNear(s, f.center, f.radius)) {
      if (f.pull > 0) {
        const d = flatDir(sub(f.center, en.location));
        try {
          en.applyKnockback({ x: d.x * f.pull, z: d.z * f.pull }, 0);
        } catch {
          /* ignore */
        }
      }
      if (f.mult > 0) hitEnemy(s, en, { mult: f.mult, element: (f.element as ElementId) ?? null, breakDmg: 2, kind: "field", charId: f.owner });
    }
  }
  // Out-of-combat regen for bench and active characters.
  if (t > s.inCombatUntil && t % 20 === 0) {
    for (const rt of s.chars.values()) {
      if (rt.hp <= 0) continue;
      const max = s.stats(rt.id, t).maxHp;
      rt.hp = Math.min(max, rt.hp + Math.round(max * 0.02));
    }
  }
}
