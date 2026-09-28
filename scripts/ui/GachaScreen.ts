/**
 * Gacha terminal: banner view → pull → cinematic (fade, camera, void rift,
 * light by highest rarity, card reveal) → 10-card result grid → card detail.
 * Never uses a chest inventory.
 */
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";
import { system, EasingType } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { Banners, getBanner, getCharacter, getWeapon, itemKind } from "../data/registry";
import { game } from "../runtime/Game";
import { fiveStarRate } from "../gacha/GachaEngine";
import { emptyPity } from "../account/PlayerProfile";
import type { GrantedPull } from "../gacha/GachaService";
import { showForm } from "../story/Dialogue";
import { playCutscene, orbit, type Keyframe } from "../camera/Cutscene";
import { ELEMENT_COLOR, ELEMENT_ICON, fmt, ICON, PORTRAIT, RARITY_COLOR, stars } from "./UIManager";
import { sound } from "../audio/Fx";
import { flatDir } from "../core/Vec";

function itemName(id: string): string {
  return itemKind(id) === "character" ? getCharacter(id).name : getWeapon(id).name;
}
function itemIcon(id: string): string {
  return itemKind(id) === "character" ? PORTRAIT(id) : ICON("weapon");
}

export async function openGacha(s: Session): Promise<void> {
  const banners = [...Banners.values()].filter((b) => b.active);
  const f = new ActionFormData().title("§l§fSIGNAL TERMINAL").body(`§7Astrum §f${fmt(s.profile.currency.astrum)}   §7Signal §f${s.profile.currency.signal}`);
  for (const b of banners) {
    const feat = b.featured5 ? `${RARITY_COLOR[5]}${itemName(b.featured5)}` : "§7상시";
    f.button(`§l${b.name}§r\n${feat} §8— ${b.subtitle}`, b.featured5 ? itemIcon(b.featured5) : ICON("gacha"));
  }
  f.button("§7가챠 기록", ICON("history"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection === banners.length) return openHistory(s);
  return openBanner(s, banners[r.selection].id);
}

export async function openBanner(s: Session, bannerId: string): Promise<void> {
  const b = getBanner(bannerId);
  const pity = s.profile.pity[b.type] ?? emptyPity();
  const feat = b.featured5 ? itemName(b.featured5) : "—";
  const el = b.featured5 && itemKind(b.featured5) === "character" ? getCharacter(b.featured5).element : null;
  const body = [
    `§8━━━━━━━━━━━━━━━━━━━━━━`,
    `            §7${b.name}`,
    ``,
    `            ${el ? ELEMENT_COLOR[el] + ELEMENT_ICON[el] + " " : ""}§l§f${feat}`,
    `            ${stars(5)}`,
    ``,
    `            §e${b.subtitle}`,
    `§8━━━━━━━━━━━━━━━━━━━━━━`,
    `§7PICK UP 4★  §d${b.featured4.map(itemName).join(" · ") || "—"}`,
    ``,
    `§7Astrum §f${fmt(s.profile.currency.astrum)}   §7Signal §f${s.profile.currency.signal}`,
    `§7pity §f${pity.since5}/${b.rates.hardPity5}   §7현재 5★ 확률 §f${(fiveStarRate(b, pity.since5 + 1) * 100).toFixed(1)}%`,
    b.featured5 ? (pity.guaranteed ? "§6▶ 다음 5★는 픽업 확정" : "§7다음 5★ 픽업 확률 50%") : "",
  ].join("\n");
  const q1 = game().gacha.quote(s.profile, bannerId, 1);
  const q10 = game().gacha.quote(s.profile, bannerId, 10);
  const price = (q: { signal: number; astrum: number }) => [q.signal ? `Signal ×${q.signal}` : "", q.astrum ? `Astrum ${fmt(q.astrum)}` : ""].filter(Boolean).join(" + ");
  const f = new ActionFormData()
    .title("§l§fEVENT SIGNAL")
    .body(body)
    .button(`§l1회 호출\n§r§7${price(q1)}`, ICON("pull1"))
    .button(`§l§610회 호출\n§r§7${price(q10)}`, ICON("pull10"))
    .button("§7확률 정보", ICON("info"))
    .button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  if (r.selection === 3) return openGacha(s);
  if (r.selection === 2) {
    await showForm(
      s.player,
      new MessageFormData()
        .title("확률 정보")
        .body(`5★ 기본 ${(b.rates.base5 * 100).toFixed(1)}%\n소프트 천장 ${b.rates.softPityStart}회부터 상승\n하드 천장 ${b.rates.hardPity5}회 (100%)\n4★ ${b.rates.hardPity4}회마다 확정\n${b.featured5 ? "5★ 획득 시 50% 픽업 / 실패 시 다음 5★ 픽업 확정 (계정에 영구 저장)" : ""}`)
        .button1("확인")
        .button2("닫기"),
    );
    return openBanner(s, bannerId);
  }
  const count = r.selection === 0 ? 1 : 10;
  const out = game().gacha.pull(s.profile, bannerId, count);
  if (!out.ok) {
    const msg = out.error === "insufficient" ? "Astrum이 부족합니다." : out.error === "locked" ? "이미 호출이 진행 중입니다." : `호출 실패 (${out.error})`;
    await showForm(s.player, new MessageFormData().title("SIGNAL").body(`§c${msg}`).button1("확인").button2("닫기"));
    return openBanner(s, bannerId);
  }
  await playPullCinematic(s, out.results);
  await showResults(s, out.results);
  s.syncParty();
  return openBanner(s, bannerId);
}

async function playPullCinematic(s: Session, results: GrantedPull[]): Promise<void> {
  const p = s.player;
  const best = Math.max(...results.map((r) => r.rarity));
  const color = best === 5 ? "gold" : best === 4 ? "purple" : "blue";
  const base = { ...p.location };
  const fwd = flatDir(p.getViewDirection());
  const focus = { x: base.x + fwd.x * 7, y: base.y + 3, z: base.z + fwd.z * 7 };
  const yaw = (Math.atan2(fwd.z, fwd.x) * 180) / Math.PI;
  const len = 70 + results.length * 8 + (best === 5 ? 40 : 0);
  s.busyUntil = system.currentTick + len;
  const frames: Keyframe[] = [
    { at: 1, fade: { in: 0.3, hold: 0.2, out: 0.5, color: [0.01, 0.01, 0.05] }, sound: "noct.gacha.charge" },
    { at: 8, camera: { pos: orbit(focus, yaw + 180, 7, -1), facing: focus } },
    { at: 10, camera: { pos: orbit(focus, yaw + 200, 5, 0.5), facing: focus, ease: 1.6, easeType: EasingType.InOutSine }, subtitle: "§8— SIGNAL DETECTED —" },
    { at: 14, particle: { id: "noct:rift", pos: focus, count: 12 } },
    { at: 26, particle: { id: "noct:rift", pos: focus, count: 12 } },
    { at: 38, particle: { id: `noct:gacha_${color}`, pos: focus, count: 16 }, sound: `noct.gacha.${color}` },
    { at: 44, camera: { pos: orbit(focus, yaw + 180, 3, 0.2), facing: focus, ease: 0.6, easeType: EasingType.OutExpo }, title: best === 5 ? "§6§l✦" : best === 4 ? "§d§l✦" : "§9§l✦" },
  ];
  let t = 56;
  for (const r of results) {
    const hold = r.rarity === 5 ? 40 : 8;
    const name = itemName(r.itemId);
    frames.push({
      at: t,
      title: `${RARITY_COLOR[r.rarity]}§l${name}`,
      subtitle: `${stars(r.rarity)}${r.isNew && r.kind === "character" ? "  §a§lNEW" : r.resonanceMaterial ? "  §7Resonance +1" : ""}`,
      particle: { id: `noct:gacha_${r.rarity === 5 ? "gold" : r.rarity === 4 ? "purple" : "blue"}`, pos: focus, count: r.rarity === 5 ? 20 : 6 },
      sound: r.rarity === 5 ? "noct.gacha.gold" : r.rarity === 4 ? "noct.gacha.purple" : undefined,
    });
    t += hold;
  }
  await playCutscene(p, frames, Math.max(t + 10, len));
  s.busyUntil = 0;
}

async function showResults(s: Session, results: GrantedPull[]): Promise<void> {
  for (;;) {
    const f = new ActionFormData().title(`§l결과  §r§7${results.length}회 호출`).body(results.length === 10 ? "§7카드를 눌러 확대" : "");
    for (const r of results) {
      const extra = r.kind === "character" ? (r.isNew ? " §a§lNEW" : " §7Resonance Material") : r.isNew ? "" : " §7Refine +1";
      f.button(`${RARITY_COLOR[r.rarity]}§l${itemName(r.itemId)}§r\n${stars(r.rarity)}${extra}`, itemIcon(r.itemId));
    }
    f.button("§l확인", ICON("confirm"));
    const res = await showForm(s.player, f);
    if (res.canceled || res.selection === undefined || res.selection >= results.length) return;
    await showCard(s, results[res.selection]);
  }
}

async function showCard(s: Session, r: GrantedPull): Promise<void> {
  let body: string;
  if (r.kind === "character") {
    const c = getCharacter(r.itemId);
    const inst = s.profile.characters[c.id];
    body = [
      `${stars(c.rarity)}  ${ELEMENT_COLOR[c.element]}${ELEMENT_ICON[c.element]} ${c.element}  §7${c.weapon}`,
      `§7${c.title} — ${c.role.join(" / ")}`,
      "",
      `§f${c.description}`,
      "",
      `§eSKILL §f${c.kit.skill.name}§7 — ${c.kit.skill.description}`,
      `§6ULT §f${c.kit.ultimate.name}§7 — ${c.kit.ultimate.description}`,
      "",
      `§bResonance R${inst?.resonance ?? 0}`,
    ].join("\n");
  } else {
    const w = getWeapon(r.itemId);
    body = `${stars(w.rarity)}  §7${w.type}\n\n§fATK ${w.baseAtk}  §7${w.subStat.stat} ${w.subStat.base}\n\n§e${w.passive.name}§7 — ${w.passive.description}`;
  }
  sound(s.player, "noct.ui.open");
  await showForm(s.player, new ActionFormData().title(`§l${itemName(r.itemId)}`).body(body).button("§7닫기", itemIcon(r.itemId)));
}

export async function openHistory(s: Session): Promise<void> {
  const h = [...s.profile.gachaHistory].reverse().slice(0, 60);
  const lines = h.map((x) => {
    const d = new Date(x.t);
    return `§8${d.getUTCMonth() + 1}/${d.getUTCDate()} §7#${x.pull} ${RARITY_COLOR[x.rarity]}${"★".repeat(x.rarity)} §f${itemName(x.item)} §8${x.banner}`;
  });
  await showForm(
    s.player,
    new ActionFormData()
      .title("§l가챠 기록")
      .body(`§7최근 ${h.length} / 저장 ${s.profile.gachaHistory.length}회\n\n${lines.join("\n") || "§7기록 없음"}`)
      .button("§7돌아가기", ICON("back")),
  );
  return openGacha(s);
}
