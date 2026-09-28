/**
 * NOCTERRA menus (stable server-ui forms styled with glass icons + portraits).
 * Characters are shown on the player's own avatar via Showcase (3D model),
 * with a quick fade transition between screens. Every mutation is validated
 * server-side and saved.
 */
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import { system } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { getCharacter, getWeapon, Characters, ImprintSets, Enemies } from "../data/registry";
import { computeStats, levelCap, expToNext, effectiveTalent, weaponStats } from "../character/Stats";
import { addCharacterExp, ascend, ascensionCost, equipWeapon, upgradeTalent, talentCost } from "../character/CharacterManager";
import { partyMembers, partySynergies, setPartySlot } from "../party/PartyManager";
import { spend, grant } from "../account/Wallet";
import { DAILY_TASKS, DAILY_REWARD_ASTRUM, dailyComplete, nexusExpToNext, refreshFlux, rollDaily } from "../account/Progression";
import { IMPRINT_SLOTS, DEFAULT_HUD_LAYOUT, type HudElementLayout, type ImprintInstance } from "../account/PlayerProfile";
import { equipImprint, levelImprint } from "../artifact/ImprintGen";
import { game } from "../runtime/Game";
import { showForm, playDialogue } from "../story/Dialogue";
import { openGacha } from "./GachaScreen";
import { ELEMENT_COLOR, ELEMENT_ICON, fmt, ICON, PORTRAIT, PRESETS, presetFor, stars, bar } from "./UIManager";
import { sound } from "../audio/Fx";
import { activeQuest, progressText, isUnlocked } from "../quest/QuestManager";
import { questSignal } from "../quest/QuestRuntime";
import { unlockedBeacons, teleportToBeacon, Region } from "../world/World";
import { DUNGEONS, enterDungeon, inDungeon, leaveDungeon } from "../dungeon/DungeonManager";
import { endShowcase, menuTransition, showcase } from "../camera/Showcase";
import { createGroup, joinNearby, leaveGroup, groupMembers, characterAllowance, groupSize } from "../coop/CoopManager";
import { markerText } from "./Hud";
import { enemies } from "../combat/EnemyRuntime";
import { explorationSummary } from "../world/Exploration";
import { giveControls } from "../input/Controls";

const save = (s: Session) => game().save.saveNow(s.id);
const locked = (s: Session, f: string) => !isUnlocked(s.profile, f);

// ───────────────────────────── MAIN ─────────────────────────────

export async function openMainMenu(s: Session): Promise<void> {
  menuTransition(s);
  sound(s.player, "noct.ui.open");
  const p = s.profile;
  const flux = refreshFlux(p, game().clock.now());
  const items: [string, string, (s: Session) => Promise<void>, string?][] = [
    ["CHARACTER", "character", openCharacterList],
    ["PARTY", "party", openParty],
    ["INVENTORY", "inventory", openInventory],
    ["QUEST", "quest", openQuest],
    ["MAP", "map", openMap],
    ["GACHA", "gacha", openGacha, "gacha"],
    ["EVENT", "event", openEvent],
    ["PROFILE", "profile", openProfile],
    ["SETTINGS", "settings", openSettings],
  ];
  const f = new ActionFormData()
    .title("§l§fN O C T E R R A")
    .body(`§7NR §f${p.nexusRank}  §8|  §6✦ §f${fmt(p.currency.astrum)}  §8|  §7C §f${fmt(p.currency.credit)}  §8|  §bFlux §f${flux}/180\n§6◆ §f${progressText(p) || "—"}  ${markerText(s)}`);
  for (const [label, icon, , gate] of items) f.button(gate && locked(s, gate) ? `§8${label}  🔒` : `§l${label}`, ICON(gate && locked(s, gate) ? "locked" : icon));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  const [, , fn, gate] = items[r.selection];
  if (gate && locked(s, gate)) {
    s.player.sendMessage("§7[NEXUS] §fPrologue를 완료하면 해금됩니다.");
    return openMainMenu(s);
  }
  await fn(s);
}

/** NPC / command entry points. */
export async function openFor(s: Session, key: string): Promise<void> {
  switch (key) {
    case "quest": return openQuest(s);
    case "weapon": return openWeaponScreen(s, s.activeId!);
    case "character": return openCharacterList(s);
    case "imprint": return openImprints(s, s.activeId!);
    case "shop": return openShop(s);
    case "gacha": return locked(s, "gacha") ? void s.player.sendMessage("§7Prologue 완료 후 이용 가능합니다.") : openGacha(s);
    case "craft": return openCraft(s);
    case "training": return openTraining(s);
    case "coop": return openCoop(s);
    default: return openMainMenu(s);
  }
}

// ───────────────────────────── CHARACTER ─────────────────────────────

async function openCharacterList(s: Session): Promise<void> {
  menuTransition(s);
  const owned = Object.values(s.profile.characters).sort((a, b) => getCharacter(b.characterId).rarity - getCharacter(a.characterId).rarity || b.level - a.level);
  const f = new ActionFormData().title("§lCHARACTER").body(`§7보유 §f${owned.length}§7 / ${Characters.size}   §8▶ = 현재 조작 캐릭터`);
  for (const c of owned) {
    const d = getCharacter(c.characterId);
    const active = c.characterId === s.activeId;
    f.button(`${active ? "§f▶ " : ""}${ELEMENT_COLOR[d.element]}${ELEMENT_ICON[d.element]} §l§f${d.name}§r  §7Lv.${c.level}\n${stars(d.rarity)} §8R${c.resonance} · ${d.role[0]}`, PORTRAIT(d.id));
  }
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection >= owned.length) return openMainMenu(s);
  return openCharacter(s, owned[r.selection].characterId, owned.map((o) => o.characterId));
}

export async function openCharacter(s: Session, id: string, roster?: string[], skipShowcase = false): Promise<void> {
  const p = s.profile;
  const inst = p.characters[id];
  const d = getCharacter(id);
  if (!skipShowcase) await showcase(s, id, { ticks: 26, hold: true, title: `${ELEMENT_COLOR[d.element]}§l${d.name}`, subtitle: `${stars(d.rarity)}  §7${d.title}` });
  const st = computeStats(p, inst);
  const two = PRESETS[presetFor(s.player, p)].twoColumn;
  const weapon = inst.weaponUid ? p.weapons[inst.weaponUid] : null;
  const wdef = weapon ? getWeapon(weapon.weaponId) : null;
  const L = [
    `§l§f${d.name}  §r${ELEMENT_COLOR[d.element]}${ELEMENT_ICON[d.element]} ${d.element}`,
    `§7Lv §f${inst.level}§7/${levelCap(inst.ascension)}  ${bar(inst.exp, expToNext(inst.level), 8, "§b")}`,
    `§7돌파 §f${"◆".repeat(inst.ascension)}§8${"◇".repeat(6 - inst.ascension)}`,
  ];
  const S = [`§7HP    §f${fmt(st.maxHp)}`, `§7ATK   §f${fmt(st.atk)}`, `§7DEF   §f${fmt(st.def)}`, `§7CRIT  §f${st.critRate.toFixed(1)}%`, `§7C.DMG §f${st.critDmg.toFixed(1)}%`, `§7${d.element.slice(0, 4)}  §f+${st.elementDmg.toFixed(0)}%   §7ER §f${st.energyRegen.toFixed(0)}%`];
  const G = [`§7WEAPON  §f${wdef ? `${wdef.name} §7Lv.${weapon!.level} R${weapon!.refinement}` : "—"}`, `§7IMPRINT §f${inst.imprintUids.map((u, i) => (u ? `§d${IMPRINT_SLOTS[i][0]}` : `§8${IMPRINT_SLOTS[i][0]}`)).join(" ")}`, `§7TALENT  §f${effectiveTalent(inst, "normal")}/${effectiveTalent(inst, "skill")}/${effectiveTalent(inst, "ultimate")}`, `§7RESON.  §bR${inst.resonance}`];
  const body = two ? [...L, "", ...S.map((l, i) => `${l.padEnd(26)}${G[i] ?? ""}`)].join("\n") : [...L, "", ...S, "", ...G].join("\n");
  const f = new ActionFormData()
    .title(`§l${d.name}  §r${stars(d.rarity)}`)
    .body(body)
    .button("§l무기  §r§7WEAPON", ICON("weapon"))
    .button("§l기억각인  §r§7IMPRINT", ICON("imprint"))
    .button("§l특성  §r§7TALENT", ICON("talent"))
    .button("§l공명 · 프로필  §r§7RESONANCE", ICON("resonance"))
    .button("§l레벨업\n§r§7EXP 데이터 사용", ICON("levelup"))
    .button("§l돌파  §r§7ASCEND", ICON("ascend"));
  const list = roster ?? Object.keys(p.characters);
  const idx = list.indexOf(id);
  if (list.length > 1) f.button(`§7◀ ${getCharacter(list[(idx - 1 + list.length) % list.length]).name}   |   ${getCharacter(list[(idx + 1) % list.length]).name} ▶`, ICON("resonance"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return endShowcase(s);
  let reshow = true;
  switch (r.selection) {
    case 0: await openWeaponScreen(s, id); break;
    case 1: await openImprints(s, id); break;
    case 2: await openTalents(s, id); break;
    case 3: await openResonance(s, id); break;
    case 4: levelUp(s, id); reshow = false; break;
    case 5: doAscend(s, id); break;
    case 6:
      if (list.length > 1) return openCharacter(s, list[(idx + 1) % list.length], list);
      endShowcase(s);
      return openCharacterList(s);
    default:
      endShowcase(s);
      return openCharacterList(s);
  }
  return openCharacter(s, id, list, !reshow);
}

function levelUp(s: Session, id: string): void {
  const p = s.profile;
  const have = p.materials.exp_data ?? 0;
  if (have > 0) {
    const use = Math.min(have, 5);
    if (spend(p, { credit: use * 200, materials: { exp_data: use } })) addCharacterExp(p, id, use * 2000);
  } else if (!spend(p, { credit: 5000 })) {
    s.player.sendMessage("§cEXP 데이터 / Credit 부족 (EXP 던전: Data Archive)");
    return;
  } else addCharacterExp(p, id, 800);
  sound(s.player, "noct.levelup");
  s.invalidateStats();
  save(s);
}

function doAscend(s: Session, id: string): void {
  const p = s.profile;
  const inst = p.characters[id];
  const cost = ascensionCost(inst);
  const err = ascend(p, id);
  if (err) {
    const mats = Object.entries(cost.materials ?? {}).map(([k, v]) => `${k} ${p.materials[k] ?? 0}/${v}`).join(", ");
    s.player.sendMessage(`§c돌파 불가: ${err === "level" ? `레벨 ${levelCap(inst.ascension)} 필요` : err === "cost" ? `재료 부족 — Credit ${fmt(cost.credit ?? 0)}, ${mats}` : err}`);
    return;
  }
  sound(s.player, "noct.gacha.purple");
  s.player.onScreenDisplay.setTitle("§b§lASCENSION", { subtitle: `§f돌파 ${inst.ascension} — Lv.${levelCap(inst.ascension)}`, fadeInDuration: 4, stayDuration: 30, fadeOutDuration: 8 });
  s.invalidateStats();
  save(s);
}

async function openResonance(s: Session, id: string): Promise<void> {
  const d = getCharacter(id);
  const inst = s.profile.characters[id];
  const res = d.resonance.map((x, i) => `${i < inst.resonance ? "§b◆" : "§8◇"} §f${x.name}\n   §7${x.description}`).join("\n");
  const passives = d.kit.passives.map((x) => `${inst.ascension >= x.unlockAscension ? "§a●" : "§8○"} §f${x.name}§7 — ${x.description}`).join("\n");
  await showForm(s.player, new ActionFormData().title(`§l${d.name} — RESONANCE`).body(`§7${d.nameKo} · ${d.title}\n§f${d.description}\n\n§ePASSIVE\n${passives}\n\n§bRESONANCE  R${inst.resonance}/6\n${res}`).button("§7닫기", ICON("back")));
}

async function openTalents(s: Session, id: string): Promise<void> {
  const inst = s.profile.characters[id];
  const d = getCharacter(id);
  const lv = (k: "normal" | "skill" | "ultimate") => effectiveTalent(inst, k);
  const p1 = d.kit.passives[0], p2 = d.kit.passives[1];
  const on = (n: { unlockAscension: number }) => (inst.ascension >= n.unlockAscension ? "§a" : "§8");
  const graph = [
    `            §f[ NORMAL §e${lv("normal")}§f ]`,
    `                  §8│`,
    `            §b[ SKILL §e${lv("skill")}§b ]`,
    `              §8╱       ╲`,
    `     ${on(p1)}[ P1 ${p1.name} ]   ${on(p2)}[ P2 ${p2.name} ]`,
    `              §8╲       ╱`,
    `           §6[ ULTIMATE §e${lv("ultimate")}§6 ]`,
  ].join("\n");
  const f = new ActionFormData().title("§l특성 · TALENT").body(`${graph}\n\n§7talent_tome §f${s.profile.materials.talent_tome ?? 0}   §7Credit §f${fmt(s.profile.currency.credit)}`);
  const nodes: [string, "normal" | "skill" | "ultimate" | null, string][] = [
    [`§lNORMAL §r§7${d.kit.normal.name}`, "normal", d.kit.normal.hits.length + "연속 기본 공격"],
    [`§lSKILL §r§7${d.kit.skill.name}`, "skill", d.kit.skill.description],
    [`§lP1 §r§7${p1.name}`, null, p1.description],
    [`§lP2 §r§7${p2.name}`, null, p2.description],
    [`§lULTIMATE §r§7${d.kit.ultimate.name}`, "ultimate", d.kit.ultimate.description],
  ];
  for (const [label, k] of nodes) f.button(k ? `${label}\n§8Lv.${lv(k)} · 강화 ${fmt(talentCost(k === "normal" ? inst.normalAttackLevel : k === "skill" ? inst.skillLevel : inst.ultimateLevel).credit ?? 0)}C` : `${label}\n§8패시브`, ICON("talent"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined || r.selection >= nodes.length) return;
  const [label, kind, desc] = nodes[r.selection];
  const detail = new MessageFormData().title(label.replace(/§./g, "")).body(`§f${desc}`).button1(kind ? "§l강화" : "확인").button2("닫기");
  const r2 = await showForm(s.player, detail);
  if (kind && !r2.canceled && r2.selection === 0) {
    const err = upgradeTalent(s.profile, id, kind);
    if (err) s.player.sendMessage(`§c특성 강화 불가: ${err === "ascension" ? "돌파 단계 부족" : err === "cost" ? "재료 부족" : err}`);
    else {
      sound(s.player, "noct.levelup");
      save(s);
    }
  }
  return openTalents(s, id);
}

async function openWeaponScreen(s: Session, id: string): Promise<void> {
  const p = s.profile;
  const inst = p.characters[id];
  const w = inst.weaponUid ? p.weapons[inst.weaponUid] : null;
  const f = new ActionFormData().title("§lWEAPON");
  if (w) {
    const d = getWeapon(w.weaponId);
    const ws = weaponStats(w.weaponId, w.level, w.ascension, w.refinement);
    const cap = [20, 40, 50, 60, 70, 80, 90][w.ascension];
    f.body([
      `§l§f${d.name.toUpperCase()}`,
      `${stars(d.rarity)}   §7${d.type}`,
      "",
      `§7Lv. §f${w.level} §7/ ${cap}     §7R§f${w.refinement}`,
      `§7ATK      §f${fmt(ws.atk)}`,
      `§7${d.subStat.stat.padEnd(8)} §f${Object.values(ws.sub)[0]!.toFixed(1)}`,
      "",
      `§e${d.passive.name}`,
      `§7${d.passive.description}`,
      `§8R${w.refinement}: ${Object.entries(ws.passive).map(([k, v]) => `${k} +${v}`).join(", ")}`,
      "",
      `§7weapon_alloy §f${p.materials.weapon_alloy ?? 0}   §7Credit §f${fmt(p.currency.credit)}`,
    ].join("\n"));
    f.button("§lUPGRADE §r§7Lv +5\n§8weapon_alloy ×2 · 3,000C", ICON("levelup"));
    f.button(`§lASCEND\n§8rift_core ×${w.ascension + 1} · ${fmt(10000 * (w.ascension + 1))}C`, ICON("ascend"));
  } else f.body("§7장착한 무기가 없습니다.");
  f.button("§l무기 교체", ICON("weapon"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  const sel = w ? r.selection : r.selection + 2;
  if (sel === 0 && w) {
    const cap = [20, 40, 50, 60, 70, 80, 90][w.ascension];
    if (w.level >= cap) s.player.sendMessage("§c돌파가 필요합니다 (ASCEND).");
    else if (spend(p, { credit: 3000, materials: { weapon_alloy: 2 } })) {
      w.level = Math.min(cap, w.level + 5);
      sound(s.player, "noct.levelup");
    } else s.player.sendMessage("§c재료 부족");
  } else if (sel === 1 && w) {
    const cap = [20, 40, 50, 60, 70, 80, 90][w.ascension];
    if (w.ascension >= 6 || w.level < cap) s.player.sendMessage("§c최대 레벨 도달 후 돌파할 수 있습니다.");
    else if (spend(p, { credit: 10000 * (w.ascension + 1), materials: { rift_core: w.ascension + 1 } })) {
      w.ascension++;
      sound(s.player, "noct.gacha.purple");
    } else s.player.sendMessage("§c재료 부족");
  } else if (sel === 2) await openWeaponSelect(s, id);
  else return;
  s.invalidateStats();
  save(s);
  return openWeaponScreen(s, id);
}

async function openWeaponSelect(s: Session, id: string): Promise<void> {
  const type = getCharacter(id).weapon;
  const list = Object.values(s.profile.weapons).filter((w) => getWeapon(w.weaponId).type === type).sort((a, b) => getWeapon(b.weaponId).rarity - getWeapon(a.weaponId).rarity || b.level - a.level);
  const f = new ActionFormData().title("§l무기 교체").body(`§7${type}`);
  for (const w of list) {
    const d = getWeapon(w.weaponId);
    f.button(`${stars(d.rarity)} §f${d.name}§r §7Lv.${w.level} R${w.refinement}\n§8${w.equippedBy ? `장착: ${getCharacter(w.equippedBy).name}` : d.passive.name}`, ICON("weapon"));
  }
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined || r.selection >= list.length) return;
  const err = equipWeapon(s.profile, id, list[r.selection].uid);
  if (err) s.player.sendMessage(`§c장착 실패: ${err}`);
}

function fmtStats(b: Record<string, number | undefined>): string {
  return Object.entries(b).map(([k, v]) => `${k} ${v}`).join(", ");
}

async function openImprints(s: Session, id: string): Promise<void> {
  const p = s.profile;
  const inst = p.characters[id];
  const slot = (i: number) => {
    const uid = inst.imprintUids[i];
    const imp = uid ? p.imprints[uid] : null;
    return imp ? `§d◆${IMPRINT_SLOTS[i]}+${imp.level}` : `§8◇${IMPRINT_SLOTS[i]}`;
  };
  const counts = new Map<string, number>();
  for (const u of inst.imprintUids) if (u && p.imprints[u]) counts.set(p.imprints[u].setId, (counts.get(p.imprints[u].setId) ?? 0) + 1);
  const sets = [...counts].map(([sid, n]) => {
    const set = ImprintSets.get(sid)!;
    return `${n >= 2 ? "§a" : "§8"}${set.name} ${n}/4  §7${n >= 2 ? set.twoPiece.description : ""}${n >= 4 ? " · " + set.fourPiece.description : ""}`;
  });
  const constellation = [
    `                 ${slot(0)}`,
    `                   §8│`,
    `      ${slot(1)} §8──────── ${slot(2)}`,
    `          §8╲           ╱`,
    `      ${slot(3)}      ${slot(4)}`,
  ].join("\n");
  const f = new ActionFormData().title("§l기억각인 · MEMORY IMPRINT").body(`${constellation}\n\n§eSET\n${sets.join("\n") || "§8세트 효과 없음"}`);
  IMPRINT_SLOTS.forEach((sl, i) => {
    const uid = inst.imprintUids[i];
    const imp = uid ? p.imprints[uid] : null;
    f.button(imp ? `§l${sl}§r §f${ImprintSets.get(imp.setId)?.name} +${imp.level}\n§7${fmtStats(imp.main)}` : `§l${sl}\n§8비어 있음`, ICON("imprint"));
  });
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined || r.selection >= 5) return;
  const slotName = IMPRINT_SLOTS[r.selection];
  const list: ImprintInstance[] = Object.values(p.imprints).filter((x) => x.slot === slotName).sort((a, b) => b.level - a.level);
  const g = new ActionFormData().title(`§l${slotName}`).body(`§7보유 ${list.length}  ·  Credit ${fmt(p.currency.credit)}`);
  for (const imp of list) g.button(`§f${ImprintSets.get(imp.setId)?.name} +${imp.level}${imp.equippedBy ? ` §8(${getCharacter(imp.equippedBy).name})` : ""}\n§7${fmtStats(imp.main)} | ${fmtStats(imp.subs)}`, ICON("imprint"));
  g.button("§l장착 각인 강화 (+4)\n§r§78,000 Credit", ICON("levelup"));
  const r2 = await showForm(s.player, g);
  if (!r2.canceled && r2.selection !== undefined) {
    if (r2.selection < list.length) equipImprint(p, id, list[r2.selection].uid);
    else {
      const uid = inst.imprintUids[r.selection];
      if (uid && spend(p, { credit: 8000 })) for (let i = 0; i < 4; i++) levelImprint(p.imprints[uid], game().rng);
      else s.player.sendMessage("§c강화 불가");
    }
    s.invalidateStats();
    save(s);
  }
  return openImprints(s, id);
}

// ───────────────────────────── PARTY ─────────────────────────────

async function openParty(s: Session): Promise<void> {
  menuTransition(s);
  const p = s.profile;
  const syn = partySynergies(partyMembers(p));
  const cols = p.party.map((id, i) => {
    if (!id) return [`§8[${i + 1}] ——`, "", "", ""];
    const d = getCharacter(id);
    const st = computeStats(p, p.characters[id]);
    return [`§7[${i + 1}] ${ELEMENT_COLOR[d.element]}§l${d.name}`, `${ELEMENT_COLOR[d.element]}${ELEMENT_ICON[d.element]} ${d.element}`, `§7${d.role[0]}`, `§fLv.${p.characters[id].level} §7HP ${fmt(st.maxHp)}`];
  });
  const two = PRESETS[presetFor(s.player, p)].twoColumn;
  const rows = two ? [0, 1, 2, 3].map((r) => cols.map((c) => (c[r] ?? "").padEnd(18)).join("§8│ ")) : cols.map((c) => c.filter(Boolean).join("  "));
  const f = new ActionFormData()
    .title("§lPARTY SETUP")
    .body(`${rows.join("\n")}\n\n§eELEMENT RESONANCE\n${syn.length ? syn.map((x) => `§b◆ ${x.name}§7 — ${x.description}`).join("\n") : "§8같은 원소 2명 이상 편성 시 발동"}`);
  for (let i = 0; i < 4; i++) {
    const id = p.party[i];
    if (id) {
      const d = getCharacter(id);
      f.button(`§7[${i + 1}] ${ELEMENT_COLOR[d.element]}${ELEMENT_ICON[d.element]} §l§f${d.name}§r §7Lv.${p.characters[id].level}\n${stars(d.rarity)}`, PORTRAIT(id));
    } else f.button(`§7[${i + 1}] §8— 비어 있음 —`, ICON("empty"));
  }
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection >= 4) return openMainMenu(s);
  const slot = r.selection;
  const owned = Object.keys(p.characters);
  const g = new ActionFormData().title(`§l슬롯 ${slot + 1}`);
  for (const id of owned) {
    const d = getCharacter(id);
    const where = p.party.indexOf(id);
    g.button(`${ELEMENT_COLOR[d.element]}${ELEMENT_ICON[d.element]} §f${d.name}${where >= 0 ? ` §8(슬롯 ${where + 1})` : ""}\n${stars(d.rarity)} §8${d.role[0]}`, PORTRAIT(id));
  }
  g.button("§c슬롯 비우기", ICON("empty"));
  const r2 = await showForm(s.player, g);
  if (!r2.canceled && r2.selection !== undefined) {
    const err = setPartySlot(p, slot, r2.selection < owned.length ? owned[r2.selection] : null);
    if (err === "empty") s.player.sendMessage("§c파티에는 최소 1명이 필요합니다.");
    s.syncParty();
    giveControls(s.player);
    save(s);
  }
  return openParty(s);
}

// ───────────────────────────── INVENTORY / QUEST / MAP / EVENT ─────────────────────────────

async function openInventory(s: Session): Promise<void> {
  menuTransition(s);
  const p = s.profile;
  const mats = Object.entries(p.materials).sort().map(([k, v]) => `§7${k} §f×${v}`).join("   ") || "§8없음";
  const weapons = Object.values(p.weapons).sort((a, b) => getWeapon(b.weaponId).rarity - getWeapon(a.weaponId).rarity).slice(0, 20).map((w) => `${stars(getWeapon(w.weaponId).rarity)} §f${getWeapon(w.weaponId).name} §7Lv.${w.level} R${w.refinement}`).join("\n");
  const body = `§eCURRENCY\n§6✦ Astrum §f${fmt(p.currency.astrum)}   §7Credit §f${fmt(p.currency.credit)}   §bSignal §f${p.currency.signal}\n\n§eMATERIALS\n${mats}\n\n§eWEAPONS §7(${Object.keys(p.weapons).length})\n${weapons}\n\n§eMEMORY IMPRINTS §f${Object.keys(p.imprints).length}`;
  const r = await showForm(s.player, new ActionFormData().title("§lINVENTORY").body(body).button("§7돌아가기", ICON("back")));
  if (!r.canceled) return openMainMenu(s);
}

async function openQuest(s: Session): Promise<void> {
  menuTransition(s);
  const a = activeQuest(s.profile);
  const done = Object.entries(s.profile.quests).filter(([, q]) => q.status === "completed").map(([id]) => id);
  const steps = a ? a.def.steps.map((st, i) => `${i < a.index ? "§a✔" : i === a.index ? "§e▶" : "§8○"} §f${st.hint}`).join("\n") : "";
  const f = new ActionFormData().title("§lQUEST").body(a ? `§6${a.def.title}\n\n${steps}\n\n§e◆ §f${progressText(s.profile)}  ${markerText(s)}\n\n§8완료: ${done.join(", ") || "—"}` : `§7진행 중인 퀘스트가 없습니다.\n§8완료: ${done.join(", ")}`);
  const canTalk = a?.step.type === "dialogue";
  if (canTalk) f.button("§l대화 진행", ICON("dialogue"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  if (canTalk && r.selection === 0) {
    const picks = await playDialogue(s, a!.step.dialogue!);
    if (picks) questSignal(s, { type: "dialogue", dialogue: a!.step.dialogue! });
    return;
  }
  return openMainMenu(s);
}

async function openMap(s: Session): Promise<void> {
  menuTransition(s);
  const unlocked = unlockedBeacons(s);
  const ex = explorationSummary(s);
  const f = new ActionFormData().title(`§l${Region.name}`).body(`§7Nexus Beacon — 이동 · 회복\n§7보물 §f${ex.treasures}  §7Astral Mote §f${ex.motes}  §7퍼즐 §f${ex.puzzles}`);
  for (const b of Region.beacons) {
    const ok = unlocked.includes(b);
    f.button(ok ? `§l§b◆ ${b.name}` : `§8◇ ${b.name}  🔒`, ICON(ok ? "beacon" : "locked"));
  }
  f.button(locked(s, "dungeon") ? "§8DUNGEON  🔒" : "§l§eDUNGEON", ICON(locked(s, "dungeon") ? "locked" : "dungeon"));
  if (inDungeon(s)) f.button("§c던전 포기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  const n = Region.beacons.length;
  if (r.selection < n) {
    if (!teleportToBeacon(s, Region.beacons[r.selection].id)) s.player.sendMessage("§c아직 활성화되지 않은 비콘입니다.");
    return;
  }
  if (r.selection === n) {
    if (locked(s, "dungeon")) return void s.player.sendMessage("§7ACT I 완료 후 해금됩니다.");
    return openDungeons(s);
  }
  leaveDungeon(s);
}

async function openDungeons(s: Session): Promise<void> {
  const flux = refreshFlux(s.profile, game().clock.now());
  const f = new ActionFormData().title("§lDUNGEON").body(`§bFlux §f${flux}/180 §8(클리어 보상 수령 시 소비)`);
  for (const d of DUNGEONS) f.button(`§l${d.name}§r §7${d.type}\n§8Flux ${d.flux} · ${d.waves.length} waves`, ICON("dungeon"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  const err = enterDungeon(s, DUNGEONS[r.selection].id);
  if (err) s.player.sendMessage(`§c입장 불가: ${err === "flux" ? "Flux 부족" : err}`);
}

async function openEvent(s: Session): Promise<void> {
  menuTransition(s);
  const p = s.profile;
  rollDaily(p, game().clock.now());
  const rows = DAILY_TASKS.map((t) => {
    const v = Math.min(t.goal, p.daily.progress[t.id] ?? 0);
    return `${v >= t.goal ? "§a✔" : "§7○"} §f${t.label}  ${bar(v, t.goal, 6, "§a")} §7${v}/${t.goal}`;
  }).join("\n");
  const complete = dailyComplete(p);
  const weekly = isUnlocked(p, "weekly") ? `§7주간 보스 보상 §f${Math.min(3, p.weekly.bossClears)}/3 §8(Frost Devourer · Void Seraph)` : "§8주간 보스: CHAPTER 1 완료 후 해금";
  const f = new ActionFormData().title("§lEVENT").body(`§eDAILY\n${rows}\n\n§7보상 §6✦ ${DAILY_REWARD_ASTRUM}\n\n§eWEEKLY\n${weekly}`);
  f.button(p.daily.claimed ? "§8수령 완료" : complete ? "§6§l보상 수령" : "§7진행 중", ICON("event"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  if (r.selection === 0 && complete && !p.daily.claimed) {
    p.daily.claimed = true;
    grant(p, { astrum: DAILY_REWARD_ASTRUM });
    save(s);
    sound(s.player, "noct.gacha.gold");
    return openEvent(s);
  }
  return openMainMenu(s);
}

async function openProfile(s: Session): Promise<void> {
  menuTransition(s);
  const p = s.profile;
  const body = [
    `§l§f${p.name}`,
    `§7Nexus Rank §f${p.nexusRank}  ${bar(p.nexusExp, nexusExpToNext(p.nexusRank), 10, "§b")}`,
    `§7Chapter §f${p.story.chapter}   §7Beacons §f${unlockedBeacons(s).length}/${Region.beacons.length}`,
    `§7Characters §f${Object.keys(p.characters).length}/${Characters.size}   §7Weapons §f${Object.keys(p.weapons).length}   §7Imprints §f${Object.keys(p.imprints).length}`,
    `§7Total pulls §f${Object.values(p.pity).reduce((a, x) => a + x.total, 0)}`,
    `§8UID ${p.playerId}`,
  ].join("\n");
  const r = await showForm(s.player, new ActionFormData().title("§lPROFILE").body(body).button("§7돌아가기", ICON("back")));
  if (!r.canceled) return openMainMenu(s);
}

// ───────────────────────────── SETTINGS ─────────────────────────────

export async function openSettings(s: Session): Promise<void> {
  menuTransition(s);
  const f = new ActionFormData().title("§lSETTINGS").body(`§7현재 프리셋 §f${presetFor(s.player, s.profile)}`);
  f.button("§l화면 · HUD\n§r§8프리셋 · 스케일 · 데미지 숫자", ICON("settings"));
  f.button("§l조작 · 카메라\n§r§8버튼 · 에임 보정 · 카메라", ICON("settings"));
  f.button("§lHUD 편집\n§r§8요소 위치 · 크기 (레이아웃 데이터)", ICON("settings"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection === 0) await settingsDisplay(s);
  else if (r.selection === 1) await settingsControl(s);
  else if (r.selection === 2) await settingsHudEdit(s);
  else return openMainMenu(s);
  return openSettings(s);
}

const PRESET_LIST = ["AUTO", "COVER", "COMPACT", "PHONE", "FOLD_EXPANDED", "WINDOWS"] as const;
async function settingsDisplay(s: Session): Promise<void> {
  const st = s.profile.settings;
  const f = new ModalFormData()
    .title("§l화면 · HUD")
    .dropdown("UI 프리셋\n§7Z Fold 펼침 → FOLD_EXPANDED · 커버 화면 → COVER", [...PRESET_LIST], { defaultValueIndex: PRESET_LIST.indexOf(st.uiPreset) })
    .slider("HUD Scale (%)", 80, 120, { valueStep: 10, defaultValue: st.hudScale })
    .toggle("퀘스트 트래커", { defaultValue: st.hudDetail })
    .toggle("데미지 숫자", { defaultValue: st.damageNumbers })
    .dropdown("데미지 숫자 크기", ["작게", "보통", "크게"], { defaultValueIndex: st.damageNumberSize })
    .toggle("궁극기 컷신", { defaultValue: st.ultCinematic });
  const r = await showForm(s.player, f);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  st.uiPreset = PRESET_LIST[v[0] as number];
  st.hudScale = v[1] as number;
  st.hudDetail = v[2] as boolean;
  st.damageNumbers = v[3] as boolean;
  st.damageNumberSize = v[4] as 0 | 1 | 2;
  st.ultCinematic = v[5] as boolean;
  save(s);
}

async function settingsControl(s: Session): Promise<void> {
  const st = s.profile.settings;
  const f = new ModalFormData()
    .title("§l조작 · 카메라")
    .slider("Touch Button Size (%) §8— HUD 편집 데이터", 80, 140, { valueStep: 10, defaultValue: st.buttonSize })
    .slider("Touch Button Opacity (%) §8— HUD 편집 데이터", 30, 100, { valueStep: 5, defaultValue: st.buttonOpacity })
    .slider("Camera Sensitivity (%) §8— 컷신/쇼케이스 카메라 속도", 50, 150, { valueStep: 10, defaultValue: st.cameraSensitivity })
    .slider("Aim Assist (%) §8— 원거리 자동 조준 각도", 0, 100, { valueStep: 10, defaultValue: st.aimAssist })
    .toggle("카메라 흔들림", { defaultValue: st.cameraShake });
  const r = await showForm(s.player, f);
  if (r.canceled || !r.formValues) return;
  const v = r.formValues;
  st.buttonSize = v[0] as number;
  st.buttonOpacity = v[1] as number;
  st.cameraSensitivity = v[2] as number;
  st.aimAssist = v[3] as number;
  st.cameraShake = v[4] as boolean;
  save(s);
}

const ANCHORS: HudElementLayout["anchor"][] = ["left", "right", "top", "bottom", "top_left", "top_right", "bottom_left", "bottom_right", "center"];
async function settingsHudEdit(s: Session): Promise<void> {
  const layout = s.profile.settings.hudLayout;
  const keys = Object.keys(DEFAULT_HUD_LAYOUT);
  const f = new ActionFormData().title("§lHUD 편집").body("§7요소를 선택해 위치/크기를 조정합니다.\n§8현재 빌드는 party 패널(좌측 글라스)과 버튼 배치를 적용하며, 전체 자유 배치는 JSON UI 편집 모드에서 이 데이터를 읽습니다.");
  for (const k of keys) f.button(`§l${k}\n§8${layout[k].anchor} ${layout[k].offset.join(",")} ×${layout[k].scale}${layout[k].visible ? "" : " (숨김)"}`, ICON("settings"));
  f.button("§c기본값 복원", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection >= keys.length) {
    s.profile.settings.hudLayout = JSON.parse(JSON.stringify(DEFAULT_HUD_LAYOUT));
    save(s);
    return;
  }
  const k = keys[r.selection];
  const cur = layout[k];
  const g = new ModalFormData()
    .title(`§l${k}`)
    .dropdown("Anchor", ANCHORS, { defaultValueIndex: Math.max(0, ANCHORS.indexOf(cur.anchor)) })
    .slider("Offset X (px)", -60, 60, { valueStep: 2, defaultValue: cur.offset[0] })
    .slider("Offset Y (px)", -60, 60, { valueStep: 2, defaultValue: cur.offset[1] })
    .slider("Scale (%)", 60, 160, { valueStep: 10, defaultValue: Math.round(cur.scale * 100) })
    .toggle("표시", { defaultValue: cur.visible });
  const r2 = await showForm(s.player, g);
  if (r2.canceled || !r2.formValues) return;
  const v = r2.formValues;
  layout[k] = { anchor: ANCHORS[v[0] as number], offset: [v[1] as number, v[2] as number], scale: (v[3] as number) / 100, visible: v[4] as boolean };
  save(s);
}

// ───────────────────────────── CITY SERVICES ─────────────────────────────

const SHOP: { id: string; label: string; cost: number; gives: Record<string, number> }[] = [
  { id: "exp_data", label: "EXP 데이터 ×5", cost: 6000, gives: { exp_data: 5 } },
  { id: "talent_tome", label: "특성 교본 ×2", cost: 9000, gives: { talent_tome: 2 } },
  { id: "weapon_alloy", label: "무기 합금 ×4", cost: 8000, gives: { weapon_alloy: 4 } },
  { id: "rift_core", label: "Rift Core ×1", cost: 15000, gives: { rift_core: 1 } },
];

async function openShop(s: Session): Promise<void> {
  const f = new ActionFormData().title("§lSHOP").body(`§7Credit §f${fmt(s.profile.currency.credit)}\n§8Stella → Signal 교환 가능`);
  for (const it of SHOP) f.button(`§l${it.label}\n§r§7${fmt(it.cost)} Credit`, ICON("shop"));
  f.button(`§l§6Signal ×1\n§r§7Stella(금) ×10 · 보유 ${s.profile.materials.stella_gold ?? 0}`, ICON("gacha"));
  f.button("§7닫기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined || r.selection > SHOP.length) return;
  if (r.selection === SHOP.length) {
    if (spend(s.profile, { materials: { stella_gold: 10 } })) grant(s.profile, { signal: 1 });
    else s.player.sendMessage("§cStella 부족");
  } else {
    const it = SHOP[r.selection];
    if (spend(s.profile, { credit: it.cost })) grant(s.profile, { materials: it.gives });
    else s.player.sendMessage("§cCredit 부족");
  }
  sound(s.player, "noct.ui.confirm");
  save(s);
  return openShop(s);
}

async function openCraft(s: Session): Promise<void> {
  const els = ["ignis", "glacia", "volt", "aer", "lux", "umbra"];
  const f = new ActionFormData().title("§l합성 공방").body(`§7Rift Core ×1 → 원소 결정 ×2\n§7보유 Rift Core §f${s.profile.materials.rift_core ?? 0}`);
  for (const e of els) f.button(`§lcrystal_${e}\n§r§8보유 ${s.profile.materials[`crystal_${e}`] ?? 0}`, ICON("craft"));
  f.button("§7닫기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined || r.selection >= els.length) return;
  if (spend(s.profile, { credit: 1000, materials: { rift_core: 1 } })) grant(s.profile, { materials: { [`crystal_${els[r.selection]}`]: 2 } });
  else s.player.sendMessage("§c재료 부족 (Rift Core ×1, 1,000C)");
  save(s);
  return openCraft(s);
}

async function openTraining(s: Session): Promise<void> {
  const f = new ActionFormData().title("§l훈련장").body("§7허수아비를 소환해 콤보 · 반응 · Break를 연습합니다.\n§8(피해를 주지 않으며 쓰러지지 않습니다)").button("§l허수아비 소환", ICON("train")).button("§c허수아비 정리", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  const dim = s.player.dimension;
  if (r.selection === 0) {
    const v = s.player.getViewDirection();
    const e = dim.spawnEntity(Enemies.get("training_dummy")!.entity, { x: s.player.location.x + v.x * 3, y: s.player.location.y, z: s.player.location.z + v.z * 3 });
    e.addTag(`dummy:${s.id}`);
    enemies.register(e);
  } else for (const e of dim.getEntities({ tags: [`dummy:${s.id}`] })) e.remove();
}

async function openCoop(s: Session): Promise<void> {
  if (locked(s, "coop")) return void s.player.sendMessage("§7ACT II 완료 후 협동이 해금됩니다.");
  const members = groupMembers(s);
  const size = groupSize(s);
  const f = new ActionFormData()
    .title("§lCO-OP LOBBY")
    .body(`§7그룹 §f${s.profile.coop.groupId ? `${size}/4` : "없음"}\n${members.map((m) => `§f· ${m.player.name}`).join("\n")}\n\n§7인원별 캐릭터 수: 1명 4 · 2명 2 · 3~4명 1\n§7현재 편성 가능 §f${characterAllowance(size)}명`)
    .button("§l그룹 만들기", ICON("coop"))
    .button("§l근처 그룹 참가", ICON("coop"))
    .button("§c그룹 나가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  if (r.selection === 0) createGroup(s);
  else if (r.selection === 1) {
    const res = joinNearby(s);
    if (res === "full") s.player.sendMessage("§c그룹이 가득 찼습니다 (4/4).");
    else if (res === "none_nearby") s.player.sendMessage("§c12블록 안에 그룹이 없습니다.");
  } else leaveGroup(s);
  for (const m of groupMembers(s)) giveControls(m.player);
  system.run(() => save(s));
}
