/**
 * /noct:noct selftest — on-device PASS / WARN / FAIL checks.
 * Verifies what only the real game can answer (types registered, player
 * override active, dynamic-property save round-trip) plus data ↔ packaged
 * resource consistency via the embedded resource manifest.
 */
import { EntityTypes, ItemTypes, world } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { RESOURCES } from "../data/resources.gen";
import { Banners, Characters, Enemies, itemKind } from "../data/registry";
import { PROFILE_SCHEMA_VERSION } from "../account/PlayerProfile";
import { QUESTS } from "../quest/QuestManager";
import { hasDialogue } from "../story/Dialogue";
import { moduleStatus } from "./Modules";
import { recentErrors } from "../core/ErrorLog";
import art from "../../database/art/order.json";

export type Verdict = "PASS" | "WARN" | "FAIL";
export interface Check {
  name: string;
  verdict: Verdict;
  detail: string;
}

const has = (list: readonly string[], x: string) => list.includes(x);

export function runSelfTest(s: Session | null): Check[] {
  const out: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, warnOnly = false) => out.push({ name, verdict: ok ? "PASS" : warnOnly ? "WARN" : "FAIL", detail });

  // profile + save
  if (s) {
    const p = s.profile;
    add("profile.schema", p.schema === PROFILE_SCHEMA_VERSION, `schema ${p.schema}/${PROFILE_SCHEMA_VERSION}`);
    add("profile.bootstrap", p.bootstrap.stage === "ready", `stage ${p.bootstrap.stage}${p.bootstrap.lastError ? " · " + p.bootstrap.lastError : ""}`);
    add("profile.gachaTx", !p.gachaTx.pending, p.gachaTx.pending ? `pending ${p.gachaTx.pending.id} ${p.gachaTx.pending.state}` : "no pending transaction");
    const bad = Object.keys(p.characters).filter((id) => !Characters.has(id));
    add("characters.owned", bad.length === 0 && Object.keys(p.characters).length > 0, bad.length ? `unknown: ${bad.join(",")}` : `${Object.keys(p.characters).length} owned`);
    const party = p.party.filter(Boolean) as string[];
    add("party", party.length > 0 && party.every((c) => p.characters[c]), party.join(", ") || "empty");
    let prop: unknown;
    try {
      prop = s.player.getProperty("noct:char");
    } catch (e) {
      prop = e;
    }
    add("player.override", typeof prop === "number", typeof prop === "number" ? `noct:char=${prop}` : "player.json override NOT active (another add-on replaces minecraft:player?)");
  } else add("profile", false, "no session for this player");
  try {
    const k = "noct:selftest";
    world.setDynamicProperty(k, "ok");
    const r = world.getDynamicProperty(k);
    world.setDynamicProperty(k, undefined);
    add("save.dynamic_properties", r === "ok", r === "ok" ? "write/read/delete OK" : `read back ${String(r)}`);
  } catch (e) {
    add("save.dynamic_properties", false, String(e));
  }

  // registered types (engine side)
  const missingItems = RESOURCES.items.filter((i) => !ItemTypes.get(i));
  add("bp.items", missingItems.length === 0, missingItems.length ? `not registered: ${missingItems.slice(0, 4).join(",")}` : `${RESOURCES.items.length} items registered`);
  const missingEnt = RESOURCES.entities.filter((e) => e !== "minecraft:player" && !EntityTypes.get(e));
  add("bp.entities", missingEnt.length === 0, missingEnt.length ? `not registered: ${missingEnt.slice(0, 4).join(",")}` : `${RESOURCES.entities.length} entities registered`);

  // characters ↔ packaged resources
  const charIssues: string[] = [];
  for (const id of art as string[]) {
    if (!Characters.has(id)) charIssues.push(`${id}: no data`);
    if (!has(RESOURCES.geometries, `geometry.noct.char.${id}`)) charIssues.push(`${id}: geometry`);
    if (!has(RESOURCES.textures, `textures/noct/characters/${id}`)) charIssues.push(`${id}: texture`);
    for (const a of ["idle", "run", "attack1", "skill", "ultimate", "dodge", "switch_in", "select"]) if (!has(RESOURCES.animations, `animation.noct.${id}.${a}`)) charIssues.push(`${id}: anim ${a}`);
    const d = Characters.get(id);
    if (d) for (const k of ["attack", "skill", "ultimate", "hurt"] as const) if (!has(RESOURCES.sounds, d.sounds[k])) charIssues.push(`${id}: sound ${d.sounds[k]}`);
  }
  add("characters.resources", charIssues.length === 0, charIssues.slice(0, 5).join("; ") || `${(art as string[]).length} rigs complete`);
  add("ui.resources", ["textures/noct/ui/glass_panel", "textures/ui/hud_tip_text_background", "textures/noct/items/ctl_attack"].every((t) => has(RESOURCES.textures, t)), "glass HUD + buttons packaged");

  // content
  const bannerIssues: string[] = [];
  for (const b of Banners.values()) for (const id of [b.featured5, ...b.pool5, ...b.pool4, ...b.pool3].filter(Boolean) as string[]) if (!itemKind(id)) bannerIssues.push(`${b.id}:${id}`);
  add("banners", bannerIssues.length === 0, bannerIssues.join(",") || `${Banners.size} banners valid`);
  const questIssues: string[] = [];
  for (const q of QUESTS.values()) for (const st of q.steps) {
    if (st.dialogue && !hasDialogue(st.dialogue)) questIssues.push(`${q.id}: dialogue ${st.dialogue}`);
    if (st.boss && !Enemies.has(st.boss)) questIssues.push(`${q.id}: boss ${st.boss}`);
  }
  add("quests", questIssues.length === 0, questIssues.join(",") || `${QUESTS.size} quests valid`);
  const bosses = [...Enemies.values()].filter((e) => e.tier === "boss");
  add("bosses", bosses.every((b) => EntityTypes.get(b.entity)), bosses.map((b) => b.id).join(", "));
  const failedMods = moduleStatus().filter(([, ok]) => !ok).map(([n]) => n);
  add("modules", failedMods.length === 0, failedMods.length ? `failed: ${failedMods.join(",")}` : `${moduleStatus().length} booted`);
  add("errors", recentErrors().length === 0, `${recentErrors().length} recent errors (see report)`, true);
  return out;
}

export function formatChecks(checks: Check[]): string {
  const col = { PASS: "§a", WARN: "§e", FAIL: "§c" };
  const sum = (v: Verdict) => checks.filter((c) => c.verdict === v).length;
  return [`§fSELFTEST  §aPASS ${sum("PASS")}  §eWARN ${sum("WARN")}  §cFAIL ${sum("FAIL")}`, ...checks.map((c) => `${col[c.verdict]}${c.verdict} §f${c.name} §7${c.detail}`)].join("\n");
}
