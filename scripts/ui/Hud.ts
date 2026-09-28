/**
 * Combat HUD. The action-bar text is rendered by NOCTERRA_RP/ui/hud_screen.json
 * as a translucent glass panel on the LEFT edge (left thumb = party / switch),
 * leaving the right side free for combat. The touch buttons are the hotbar
 * items: they swap to glowing variants for ULT READY and QTE (see Controls).
 * Layout adapts to the UI preset; bar widths follow the HUD Scale setting.
 */
import { system } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { getCharacter, Config } from "../data/registry";
import { PRESETS, presetFor, bar, scaled, ELEMENT_COLOR, ELEMENT_ICON } from "./UIManager";
import { progressText } from "../quest/QuestManager";
import { questTarget } from "../quest/QuestRuntime";
import { isPlaying } from "../camera/Cutscene";
import { refreshHotbar } from "../input/Controls";
import { allowedSlots } from "../coop/CoopManager";
import { dist } from "../core/Vec";

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

export function markerText(s: Session): string {
  const target = questTarget(s);
  if (!target) return "";
  const p = s.player.location;
  const d = dist(p, target);
  const view = s.player.getViewDirection();
  const yawView = Math.atan2(view.z, view.x);
  const yawTarget = Math.atan2(target.z - p.z, target.x - p.x);
  let rel = ((yawTarget - yawView) * 180) / Math.PI;
  rel = ((rel % 360) + 360) % 360; // 0 = ahead, 90 = right (Minecraft z-forward frame)
  const arrow = ARROWS[Math.round(rel / 45) % 8];
  return `§e${arrow} §f${d < 1000 ? Math.round(d) + "m" : (d / 1000).toFixed(1) + "km"}`;
}

export function renderHud(s: Session): string {
  const t = system.currentTick;
  const preset = presetFor(s.player, s.profile);
  const spec = PRESETS[preset];
  const p = s.profile;
  const lines: string[] = [];

  if (spec.detail || p.settings.hudDetail) {
    const q = progressText(p);
    if (q) {
      const short = preset === "COVER" || preset === "COMPACT" ? q.slice(0, 18) : q;
      lines.push(`§6◆ §f${short}  ${markerText(s)}`);
    }
  }

  // Party column (one row per slot — vertical like a portrait strip).
  const allowed = allowedSlots(s);
  const w = scaled(spec.names ? 6 : 4, p);
  p.party.forEach((id, i) => {
    if (!id) return;
    const rt = s.chars.get(id);
    if (!rt) return;
    const def = getCharacter(id);
    const active = i === p.activeSlot;
    const col = ELEMENT_COLOR[def.element];
    const label = spec.names ? def.name : def.name.slice(0, 3);
    const max = s.stats(id, t).maxHp;
    const cap = def.kit.ultimate.energyCost ?? 60;
    let tag = "";
    if (!allowed.includes(i)) tag = " §8CO-OP";
    else if (rt.hp <= 0) tag = " §4✖";
    else if (rt.qteReadyUntil > t && !active) tag = " §e§lQTE";
    else if (rt.energy >= cap) tag = " §6✦";
    const hp = rt.hp <= 0 ? `§8${"▮".repeat(w)}` : bar(rt.hp, max, w, rt.hp / max < 0.3 ? "§c" : "§a");
    lines.push(`${active ? "§f▶" : "§8 "}§7${i + 1} ${active ? "§l" : ""}${col}${ELEMENT_ICON[def.element]}${label}§r ${hp}${tag}`);
  });

  const rt = s.active;
  if (rt) {
    const def = getCharacter(rt.id);
    const st = s.stats(rt.id, t);
    const cap = def.kit.ultimate.energyCost ?? 60;
    const inst = p.characters[rt.id];
    const shield = rt.shield > 0 && rt.shieldUntil > t ? ` §f⛨${rt.shield}` : "";
    lines.push(`§7Lv.${inst.level} §fHP ${bar(rt.hp, st.maxHp, scaled(spec.bar, p), "§a")} §f${rt.hp}${spec.detail ? `/${st.maxHp}` : ""}${shield}`);
    const ult = rt.energy >= cap ? "§6§l✦ULT" : `§7ULT ${bar(rt.energy, cap, scaled(Math.max(4, spec.bar / 2), p), "§6")}`;
    const skillCd = rt.skillReadyAt > t && rt.skillCharges <= 0 ? `§7SK ${Math.ceil((rt.skillReadyAt - t) / 20)}s` : "§bSK ●";
    let mech = "";
    if (def.mechanic.type !== "none") {
      mech = rt.stateUntil > t ? ` §b§l${def.mechanic.state!.name.split(" ")[0].toUpperCase()} ${Math.ceil((rt.stateUntil - t) / 20)}s` : ` §b${def.mechanic.name} ${bar(rt.gauge, def.mechanic.max, 5, "§b")}`;
    }
    lines.push(`${ult} ${skillCd}${mech}`);
    if (spec.detail) {
      const sw = s.switchReadyAt > t ? `§7SWAP ${((s.switchReadyAt - t) / 20).toFixed(1)}  ` : "";
      const buffs = [...new Set(s.buffs.filter((b) => b.until > t).map((b) => b.source.split(":").pop()))].slice(0, 4);
      if (sw || buffs.length) lines.push(`${sw}§3${buffs.map((b) => `▲${b}`).join(" ")}`);
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
        refreshHotbar(s);
      } catch {
        /* player leaving */
      }
    }
  }, Config.performance.hudIntervalTicks);
}
