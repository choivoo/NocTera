/**
 * /noct:noct report — a compact debug report for real-device testing.
 * Contains game state only (no device model, no IP, no account identifiers
 * beyond the in-world player id). Saved to the world as `noct:last_report`.
 */
import { world, system } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { VERSION } from "../version";
import { RESOURCES } from "../data/resources.gen";
import { activeQuest } from "../quest/QuestManager";
import { presetFor } from "../ui/UIManager";
import { moduleStatus } from "./Modules";
import { recentErrors } from "../core/ErrorLog";
import { particleBudget } from "../audio/Fx";
import { poolSize } from "../ui/DamageNumbers";
import { enemies } from "../combat/EnemyRuntime";

export function buildReport(s: Session): string {
  const p = s.profile;
  const q = activeQuest(p);
  const errs = recentErrors().slice(-8);
  const lines = [
    `NOCTERRA ${VERSION} (pack ${RESOURCES.packVersion}, min engine ${RESOURCES.minEngine})`,
    `API ${Object.entries(RESOURCES.api).map(([k, v]) => `${k}@${v}`).join(" ")}`,
    `schema ${p.schema} · bootstrap ${p.bootstrap.stage} (attempts ${p.bootstrap.attempts}${p.bootstrap.migratedFrom ? `, migrated from v${p.bootstrap.migratedFrom}` : ""})`,
    `character ${s.activeId} · party ${p.party.map((c) => c ?? "-").join("/")}`,
    `quest ${q ? `${q.def.id} step ${q.index + 1}/${q.def.steps.length} (${q.step.type})` : "none"} · chapter ${p.story.chapter}`,
    `ui ${presetFor(s.player, p)} (setting ${p.settings.uiPreset}) · density ${p.settings.hudDensity} · safe ${p.settings.safeArea} · graphics ${p.settings.graphics} · lock ${p.settings.targetLock ? "on" : "off"}`,
    `fx budget ${particleBudget.preset} dropped ${particleBudget.dropped} · dmg pool ${JSON.stringify(poolSize())} · tracked enemies ${enemies.count()} · tick ${system.currentTick}`,
    `modules ${moduleStatus().map(([n, ok]) => `${n}${ok ? "" : "✗"}`).join(" ")}`,
    `errors (${recentErrors().length}):`,
    ...errs.map((e) => `  ${new Date(e.t).toISOString().slice(5, 19)} ${e.module}: ${e.msg}`),
  ];
  const text = lines.join("\n");
  try {
    world.setDynamicProperty("noct:last_report", text.slice(0, 30000));
  } catch {
    /* ignore */
  }
  return text;
}
