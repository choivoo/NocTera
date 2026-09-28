/**
 * Combat HUD rendered to the action bar every few ticks. Layout adapts to the
 * UI preset (Fold expanded shows quest tracker, cooldowns and buffs; phone
 * shows a compact party strip). Updates are throttled (performance.hudIntervalTicks).
 */
import { system } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { getCharacter, Config } from "../data/registry";
import { PRESETS, presetFor, bar, ELEMENT_COLOR, ELEMENT_ICON } from "./UIManager";
import { progressText } from "../quest/QuestManager";
import { isPlaying } from "../camera/Cutscene";

export function renderHud(s: Session): string {
  const t = system.currentTick;
  const spec = PRESETS[presetFor(s.player, s.profile)];
  const p = s.profile;
  const lines: string[] = [];

  if (spec.detail || s.profile.settings.hudDetail) {
    const q = progressText(p);
    if (q) lines.push(`§e◇ §f${q}`);
  }

  // Party strip: [1] SERIA ▮▮▮ ✦
  const party: string[] = [];
  p.party.forEach((id, i) => {
    if (!id) return;
    const rt = s.chars.get(id);
    if (!rt) return;
    const def = getCharacter(id);
    const active = i === p.activeSlot;
    const col = ELEMENT_COLOR[def.element];
    const label = spec.names ? def.name : def.name.slice(0, 2);
    const max = s.stats(id, t).maxHp;
    const cap = def.kit.ultimate.energyCost ?? 60;
    let tag = "";
    if (rt.hp <= 0) tag = " §4✖";
    else if (rt.qteReadyUntil > t && !active) tag = " §e§lQTE§r";
    else if (rt.energy >= cap) tag = " §6✦";
    const hp = rt.hp <= 0 ? "§8----" : bar(rt.hp, max, 4, rt.hp / max < 0.3 ? "§c" : "§a");
    party.push(`${active ? "§l" : "§7"}[${i + 1}]${active ? col : "§7"}${label}§r ${hp}${tag}`);
  });
  lines.push(party.join(" §8| "));

  const rt = s.active;
  if (rt) {
    const def = getCharacter(rt.id);
    const st = s.stats(rt.id, t);
    const cap = def.kit.ultimate.energyCost ?? 60;
    const inst = p.characters[rt.id];
    const col = ELEMENT_COLOR[def.element];
    const skillCd = rt.skillReadyAt > t && rt.skillCharges <= 0 ? `§7${Math.ceil((rt.skillReadyAt - t) / 20)}s` : "§aREADY";
    const shield = rt.shield > 0 && rt.shieldUntil > t ? ` §f⛨${rt.shield}` : "";
    lines.push(
      `${col}${ELEMENT_ICON[def.element]} §f§l${def.name}§r §7Lv.${inst.level}  §fHP ${bar(rt.hp, st.maxHp, spec.bar, "§a")} §f${rt.hp}/${st.maxHp}${shield}`,
    );
    const ult = rt.energy >= cap ? "§6§lULT READY" : `§7ULT ${bar(rt.energy, cap, Math.max(4, spec.bar / 2), "§6")}`;
    let mech = "";
    if (def.mechanic.type !== "none") {
      mech = rt.stateUntil > t ? `  §b§l${def.mechanic.state!.name.toUpperCase()} ${Math.ceil((rt.stateUntil - t) / 20)}s` : `  §b${def.mechanic.name} ${bar(rt.gauge, def.mechanic.max, 5, "§b")}`;
    }
    const sw = s.switchReadyAt > t ? `  §7SWAP ${((s.switchReadyAt - t) / 20).toFixed(1)}` : "";
    lines.push(`${ult}  §fSKILL ${skillCd}${mech}${spec.detail ? sw : ""}`);
    if (spec.detail) {
      const buffs = [...new Set(s.buffs.filter((b) => b.until > t).map((b) => b.source.split(":").pop()))];
      if (buffs.length) lines.push(`§3${buffs.map((b) => `▲${b}`).join(" ")}`);
    }
  }
  if (s.lastHitUntil > t && s.lastHit) lines.push(s.lastHit);
  return lines.join("\n");
}

export function registerHud(sessions: () => Iterable<Session>): void {
  system.runInterval(() => {
    for (const s of sessions()) {
      if (!s.player.isValid || isPlaying(s.player) || system.currentTick < s.busyUntil) continue;
      try {
        s.player.onScreenDisplay.setActionBar(renderHud(s));
      } catch {
        /* player leaving */
      }
    }
  }, Config.performance.hudIntervalTicks);
}
