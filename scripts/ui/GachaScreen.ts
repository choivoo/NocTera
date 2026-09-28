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
import { particle, sound } from "../audio/Fx";
import { flatDir } from "../core/Vec";
import { endShowcase, menuTransition, showcase } from "../camera/Showcase";

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
  menuTransition(s);
  const b = getBanner(bannerId);
  const pity = s.profile.pity[b.type] ?? emptyPity();
  const feat = b.featured5 ? itemName(b.featured5) : "RESONANCE";
  const el = b.featured5 && itemKind(b.featured5) === "character" ? getCharacter(b.featured5).element : null;
  const rate = (fiveStarRate(b, pity.since5 + 1) * 100).toFixed(1);
  const body = [
    `§8${b.name}`,
    "",
    `     ${el ? ELEMENT_COLOR[el] : "§6"}§l${feat.split("").join(" ")}`,
    `     §e${b.subtitle}`,
    `     ${stars(5)} §6RATE UP`,
    "",
    b.featured4.length ? `§7PICK UP  §d${b.featured4.map(itemName).join(" · ")}` : "§7상시 기원",
    "",
    `§6✦ §f${fmt(s.profile.currency.astrum)}    §bSignal §f${s.profile.currency.signal}    §7Pity §f${pity.since5}/${b.rates.hardPity5}`,
    `§8현재 5★ ${rate}%${b.featured5 ? (pity.guaranteed ? "  ·  §6다음 5★ 픽업 확정" : "  ·  픽업 50%") : ""}`,
  ].join("\n");
  const q1 = game().gacha.quote(s.profile, bannerId, 1);
  const q10 = game().gacha.quote(s.profile, bannerId, 10);
  const price = (q: { signal: number; astrum: number }) => [q.signal ? `Signal ×${q.signal}` : "", q.astrum ? `✦ ${fmt(q.astrum)}` : ""].filter(Boolean).join(" + ");
  const f = new ActionFormData()
    .title(`§l${b.name}`)
    .body(body)
    .button(`§l1 PULL\n§r§7${price(q1)}`, b.featured5 ? itemIcon(b.featured5) : ICON("pull1"))
    .button(`§l§610 PULL\n§r§7${price(q10)}`, ICON("pull10"))
    .button("§7DETAILS · 확률", ICON("info"))
    .button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  if (r.selection === 3) return openGacha(s);
  if (r.selection === 2) {
    await showForm(
      s.player,
      new MessageFormData()
        .title("DETAILS")
        .body(`§f5★ 기본 ${(b.rates.base5 * 100).toFixed(1)}%\n소프트 천장 ${b.rates.softPityStart}회부터 매 회 +${(b.rates.softPityStep * 100).toFixed(0)}%p\n하드 천장 ${b.rates.hardPity5}회 (100%)\n4★ ${b.rates.hardPity4}회마다 확정\n${b.featured5 ? "5★ 획득 시 50% 픽업 · 실패 시 다음 5★ 픽업 확정 (계정 영구 저장)" : ""}\n\n§7중복 캐릭터 → 공명 R+1 (R6 이후 Stella)\n중복 무기 → 재련 R+1 (R5까지)`)
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
  await playPullCinematic(s, out.results, b.subtitle);
  await showResults(s, out.results);
  s.syncParty();
  return openBanner(s, bannerId);
}

async function playPullCinematic(s: Session, results: GrantedPull[], bannerSubtitle: string): Promise<void> {
  const p = s.player;
  const best = Math.max(...results.map((r) => r.rarity));
  const color = best === 5 ? "gold" : best === 4 ? "purple" : "blue";
  const base = { ...p.location };
  const fwd = flatDir(p.getViewDirection());
  const rift = { x: base.x + fwd.x * 10, y: base.y + 14, z: base.z + fwd.z * 10 };
  const yaw = (Math.atan2(fwd.z, fwd.x) * 180) / Math.PI;
  s.busyUntil = system.currentTick + 100000;
  // 1–4: UI fade → camera rises to the Rift → a signal streaks in → light shifts to the rarity color.
  const frames: Keyframe[] = [
    { at: 1, fade: { in: 0.25, hold: 0.15, out: 0.5, color: [0.01, 0.01, 0.05] }, sound: "noct.gacha.charge" },
    { at: 6, camera: { pos: { x: base.x - fwd.x * 2, y: base.y + 2, z: base.z - fwd.z * 2 }, facing: rift } },
    { at: 8, camera: { pos: orbit(rift, yaw + 180, 8, -3), facing: rift, ease: 1.4, easeType: EasingType.InOutSine }, subtitle: "§8— SIGNAL DETECTED —" },
    { at: 10, particle: { id: "noct:rift", pos: rift, count: 14 } },
    { at: 18, particle: { id: "noct:spark_tracer", pos: { x: rift.x - fwd.x * 6, y: rift.y - 4, z: rift.z - fwd.z * 6 }, count: 4 } },
    { at: 24, particle: { id: "noct:spark_tracer", pos: { x: rift.x - fwd.x * 3, y: rift.y - 2, z: rift.z - fwd.z * 3 }, count: 4 } },
    { at: 30, particle: { id: "noct:rift", pos: rift, count: 16 }, sound: "noct.gacha.blue" },
    { at: 38, particle: { id: `noct:gacha_${color}`, pos: rift, count: 20 }, sound: `noct.gacha.${color}`, camera: { pos: orbit(rift, yaw + 180, 4, -1), facing: rift, ease: 0.5, easeType: EasingType.OutExpo } },
  ];
  let t = 48;
  if (best === 5) {
    // 5: music change + flash + special cut
    frames.push({ at: t, fade: { in: 0.05, hold: 0.1, out: 0.6, color: [1, 0.92, 0.6] }, sound: "noct.gacha.gold", title: "§6§l✦", camera: { pos: orbit(rift, yaw + 90, 5, 1), facing: rift, ease: 0.8 } });
    t += 18;
  }
  await playCutscene(p, frames, t);

  // 6–7: silhouette → reveal. Quick cards for 3★/4★ weapons, full showcase for 5★ and new characters.
  for (const r of results) {
    if (!p.isValid) break;
    const name = itemName(r.itemId);
    const dupe = r.kind === "character" && !r.isNew ? `  §7R${s.profile.characters[r.itemId]?.resonance ?? 0}` : "";
    if (r.kind === "character" && (r.rarity === 5 || r.isNew)) {
      const d = getCharacter(r.itemId);
      p.onScreenDisplay.setTitle("§0§l???", { subtitle: `${stars(r.rarity)}`, fadeInDuration: 0, stayDuration: 12, fadeOutDuration: 2 });
      try {
        p.camera.fade({ fadeTime: { fadeInTime: 0.05, holdTime: 0.35, fadeOutTime: 0.3 }, fadeColor: { red: 0, green: 0, blue: 0 } });
      } catch {
        /* ignore */
      }
      await new Promise<void>((res) => system.runTimeout(() => res(), 12));
      await showcase(s, r.itemId, {
        ticks: r.rarity === 5 ? 60 : 32,
        close: false,
        title: `${ELEMENT_COLOR[d.element]}§l${d.name}`,
        subtitle: `${stars(r.rarity)}   §f${r.featured ? bannerSubtitle : d.title}${r.isNew ? "   §a§lNEW" : dupe}`,
        hold: true,
      });
    } else {
      p.onScreenDisplay.setTitle(`${RARITY_COLOR[r.rarity]}§l${name}`, { subtitle: `${stars(r.rarity)}${dupe}${r.kind === "weapon" && !r.isNew ? "  §7Refine +1" : ""}`, fadeInDuration: 0, stayDuration: 7, fadeOutDuration: 2 });
      particle(p.dimension, `noct:gacha_${r.rarity === 5 ? "gold" : r.rarity === 4 ? "purple" : "blue"}`, rift, r.rarity === 4 ? 8 : 3);
      if (r.rarity === 4) sound(p, "noct.gacha.purple");
      await new Promise<void>((res) => system.runTimeout(() => res(), 9));
    }
  }
  endShowcase(s);
  s.busyUntil = 0;
}

async function showResults(s: Session, results: GrantedPull[]): Promise<void> {
  const order = results.map((r, i) => ({ r, i })).sort((a, b) => b.r.rarity - a.r.rarity || a.i - b.i);
  const summary = [5, 4, 3].map((n) => `${RARITY_COLOR[n]}${"★".repeat(n)} §f×${results.filter((r) => r.rarity === n).length}`).join("   ");
  for (;;) {
    const f = new ActionFormData().title(`§l결과  §r§7${results.length} PULL`).body(`${summary}\n§8카드를 눌러 확대`);
    for (const { r } of order) {
      let extra = "";
      if (r.kind === "character") extra = r.isNew ? "  §a§lNEW" : (s.profile.characters[r.itemId]?.resonance ?? 0) >= 6 ? "  §7→ Stella" : `  §bR${s.profile.characters[r.itemId]?.resonance ?? 0} §7Resonance`;
      else if (!r.isNew) extra = "  §7Refine +1";
      const big = r.rarity === 5 ? "§6§l✦ " : "";
      f.button(`${big}${RARITY_COLOR[r.rarity]}§l${itemName(r.itemId)}§r${extra}\n${stars(r.rarity)}`, itemIcon(r.itemId));
    }
    f.button("§l확인", ICON("confirm"));
    const res = await showForm(s.player, f);
    if (res.canceled || res.selection === undefined || res.selection >= order.length) return;
    await showCard(s, order[res.selection].r);
  }
}

async function showCard(s: Session, r: GrantedPull): Promise<void> {
  let body: string;
  if (r.kind === "character") {
    const c = getCharacter(r.itemId);
    const inst = s.profile.characters[c.id];
    await showcase(s, c.id, { ticks: 24, hold: true, anim: "select" });
    body = [
      `${stars(c.rarity)}  ${ELEMENT_COLOR[c.element]}${ELEMENT_ICON[c.element]} ${c.element}  §7${c.weapon}`,
      `§7${c.title} — ${c.role.join(" / ")}`,
      "",
      `§f${c.description}`,
      "",
      `§bSKILL §f${c.kit.skill.name}§7 — ${c.kit.skill.description}`,
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
  endShowcase(s);
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
