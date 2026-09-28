/**
 * NOCTERRA main menu and sub screens (stable server-ui forms, styled with
 * RP icons). Every mutation is validated server-side and saved.
 */
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import type { Session } from "../runtime/Session";
import { getCharacter, getWeapon, Characters, ImprintSets } from "../data/registry";
import { computeStats, levelCap, expToNext, effectiveTalent } from "../character/Stats";
import { addCharacterExp, ascend, ascensionCost, equipWeapon, upgradeTalent, talentCost } from "../character/CharacterManager";
import { partyMembers, partySynergies, setPartySlot } from "../party/PartyManager";
import { spend } from "../account/Wallet";
import { DAILY_TASKS, DAILY_REWARD_ASTRUM, dailyComplete, nexusExpToNext, refreshFlux, rollDaily } from "../account/Progression";
import { IMPRINT_SLOTS } from "../account/PlayerProfile";
import { equipImprint, levelImprint } from "../artifact/ImprintGen";
import { game } from "../runtime/Game";
import { showForm, playDialogue } from "../story/Dialogue";
import { openGacha } from "./GachaScreen";
import { ELEMENT_COLOR, ELEMENT_ICON, fmt, ICON, PORTRAIT, PRESETS, presetFor, stars } from "./UIManager";
import { sound } from "../audio/Fx";
import { activeQuest, progressText } from "../quest/QuestManager";
import { unlockedBeacons, teleportToBeacon, Region } from "../world/World";
import { DUNGEONS, enterDungeon, inDungeon, leaveDungeon } from "../dungeon/DungeonManager";
import { questSignal } from "../quest/QuestRuntime";

const save = (s: Session) => game().save.saveNow(s.id);

export async function openMainMenu(s: Session): Promise<void> {
  sound(s.player, "noct.ui.open");
  const p = s.profile;
  const flux = refreshFlux(p, game().clock.now());
  const items: [string, string, (s: Session) => Promise<void>][] = [
    ["CHARACTER", "character", openCharacterList],
    ["PARTY", "party", openParty],
    ["INVENTORY", "inventory", openInventory],
    ["QUEST", "quest", openQuest],
    ["MAP", "map", openMap],
    ["GACHA", "gacha", openGacha],
    ["EVENT", "event", openEvent],
    ["PROFILE", "profile", openProfile],
    ["SETTINGS", "settings", openSettings],
  ];
  const f = new ActionFormData()
    .title("§l§fN O C T E R R A")
    .body(`§7NR §f${p.nexusRank}   §7Astrum §f${fmt(p.currency.astrum)}   §7Credit §f${fmt(p.currency.credit)}   §7Flux §f${flux}/180\n§e◇ §f${progressText(p) || "—"}`);
  for (const [label, icon] of items) f.button(`§l${label}`, ICON(icon));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  await items[r.selection][2](s);
}

// ───────────────────────────── CHARACTER ─────────────────────────────

async function openCharacterList(s: Session): Promise<void> {
  const owned = Object.values(s.profile.characters).sort((a, b) => getCharacter(b.characterId).rarity - getCharacter(a.characterId).rarity || b.level - a.level);
  const f = new ActionFormData().title("§lCHARACTER").body(`§7보유 ${owned.length} / ${Characters.size}`);
  for (const c of owned) {
    const d = getCharacter(c.characterId);
    f.button(`${ELEMENT_COLOR[d.element]}${ELEMENT_ICON[d.element]} §l§f${d.name}§r §7Lv.${c.level} R${c.resonance}\n${stars(d.rarity)} §8${d.role.join("/")}`, PORTRAIT(d.id));
  }
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined || r.selection >= owned.length) return r.canceled ? undefined : openMainMenu(s);
  return openCharacter(s, owned[r.selection].characterId);
}

export async function openCharacter(s: Session, id: string): Promise<void> {
  const p = s.profile;
  const inst = p.characters[id];
  const d = getCharacter(id);
  const st = computeStats(p, inst);
  const two = PRESETS[presetFor(s.player, p)].twoColumn;
  const weapon = inst.weaponUid ? p.weapons[inst.weaponUid] : null;
  const wdef = weapon ? getWeapon(weapon.weaponId) : null;
  const statsCol = [
    `§7HP §f${fmt(st.maxHp)}   §7ATK §f${fmt(st.atk)}   §7DEF §f${fmt(st.def)}`,
    `§7CRIT §f${st.critRate.toFixed(1)}%   §7CRIT DMG §f${st.critDmg.toFixed(1)}%`,
    `§7${d.element} DMG §f${st.elementDmg.toFixed(1)}%   §7ER §f${st.energyRegen.toFixed(0)}%   §7BREAK §f+${st.breakPower.toFixed(0)}%`,
  ];
  const gearCol = [
    `§7WEAPON §f${wdef ? `${wdef.name} Lv.${weapon!.level} R${weapon!.refinement}` : "—"}`,
    `§7IMPRINT §f${inst.imprintUids.map((u, i) => (u ? `§a${IMPRINT_SLOTS[i][0]}` : `§8${IMPRINT_SLOTS[i][0]}`)).join(" ")}`,
    `§7TALENT §fNA ${effectiveTalent(inst, "normal")} / SK ${effectiveTalent(inst, "skill")} / ULT ${effectiveTalent(inst, "ultimate")}`,
    `§7RESONANCE §bR${inst.resonance}`,
  ];
  const body = [
    `${stars(d.rarity)}  ${ELEMENT_COLOR[d.element]}${ELEMENT_ICON[d.element]} ${d.element}  §7${d.weapon}  §8${d.role.join(" / ")}`,
    `§f${d.nameKo} — §7${d.title}`,
    `§7Lv §f${inst.level}/${levelCap(inst.ascension)}  §7EXP §f${fmt(inst.exp)}/${fmt(expToNext(inst.level))}  §7돌파 §f${inst.ascension}/6`,
    "",
    ...(two ? statsCol.map((l, i) => `${l}${gearCol[i] ? "    " + gearCol[i] : ""}`).concat(gearCol.slice(statsCol.length)) : [...statsCol, "", ...gearCol]),
  ].join("\n");
  const f = new ActionFormData()
    .title(`§l${d.name}`)
    .body(body)
    .button("§l레벨업\n§r§7EXP 데이터 사용", ICON("levelup"))
    .button("§l돌파", ICON("ascend"))
    .button("§l특성", ICON("talent"))
    .button("§l무기", ICON("weapon"))
    .button("§l기억각인", ICON("imprint"))
    .button("§l공명 / 프로필", ICON("resonance"))
    .button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  switch (r.selection) {
    case 0: {
      const have = p.materials.exp_data ?? 0;
      if (have <= 0 && p.currency.credit < 5000) {
        s.player.sendMessage("§cEXP 데이터가 없습니다. (EXP 던전: Data Archive)");
      } else if (have > 0) {
        const use = Math.min(have, 5);
        if (spend(p, { credit: use * 200, materials: { exp_data: use } })) addCharacterExp(p, id, use * 2000);
      } else if (spend(p, { credit: 5000 })) addCharacterExp(p, id, 800);
      s.invalidateStats();
      save(s);
      break;
    }
    case 1: {
      const cost = ascensionCost(inst);
      const err = ascend(p, id);
      if (err) {
        const mats = Object.entries(cost.materials ?? {}).map(([k, v]) => `${k} ${p.materials[k] ?? 0}/${v}`).join(", ");
        s.player.sendMessage(`§c돌파 불가: ${err === "level" ? `레벨 ${levelCap(inst.ascension)} 필요` : err === "cost" ? `재료 부족 — Credit ${fmt(cost.credit ?? 0)}, ${mats}` : err}`);
      } else {
        sound(s.player, "noct.levelup");
        s.player.onScreenDisplay.setTitle(`§b${d.name}`, { subtitle: `§f돌파 ${inst.ascension} — Lv.${levelCap(inst.ascension)}`, fadeInDuration: 4, stayDuration: 30, fadeOutDuration: 8 });
        s.invalidateStats();
        save(s);
      }
      break;
    }
    case 2:
      await openTalents(s, id);
      break;
    case 3:
      await openWeaponSelect(s, id);
      break;
    case 4:
      await openImprints(s, id);
      break;
    case 5: {
      const res = d.resonance.map((x, i) => `${i < inst.resonance ? "§b◆" : "§8◇"} §f${x.name}§7 — ${x.description}`).join("\n");
      const passives = d.kit.passives.map((x) => `${inst.ascension >= x.unlockAscension ? "§a" : "§8"}${x.name}§7 — ${x.description}`).join("\n");
      await showForm(s.player, new ActionFormData().title(`§l${d.name} — PROFILE`).body(`§f${d.description}\n\n§ePASSIVES\n${passives}\n\n§bRESONANCE\n${res}`).button("§7닫기", ICON("back")));
      break;
    }
    default:
      return openCharacterList(s);
  }
  return openCharacter(s, id);
}

async function openTalents(s: Session, id: string): Promise<void> {
  const inst = s.profile.characters[id];
  const d = getCharacter(id);
  const kinds = ["normal", "skill", "ultimate"] as const;
  const names = [d.kit.normal.name, d.kit.skill.name, d.kit.ultimate.name];
  const lv = [inst.normalAttackLevel, inst.skillLevel, inst.ultimateLevel];
  const f = new ActionFormData().title("§l특성").body(`§7talent_tome §f${s.profile.materials.talent_tome ?? 0}   §7Credit §f${fmt(s.profile.currency.credit)}`);
  kinds.forEach((k, i) => f.button(`§l${names[i]} §r§7Lv.${lv[i]}${effectiveTalent(inst, k) > lv[i] ? ` §b(+${effectiveTalent(inst, k) - lv[i]})` : ""}\n§8${fmt(talentCost(lv[i]).credit ?? 0)} Credit, tome ×${lv[i] * 2}`, ICON("talent")));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined || r.selection > 2) return;
  const err = upgradeTalent(s.profile, id, kinds[r.selection]);
  if (err) s.player.sendMessage(`§c특성 강화 불가: ${err === "ascension" ? "돌파 단계 부족" : err === "cost" ? "재료 부족" : err}`);
  else {
    sound(s.player, "noct.levelup");
    save(s);
  }
  return openTalents(s, id);
}

async function openWeaponSelect(s: Session, id: string): Promise<void> {
  const type = getCharacter(id).weapon;
  const list = Object.values(s.profile.weapons).filter((w) => getWeapon(w.weaponId).type === type).sort((a, b) => getWeapon(b.weaponId).rarity - getWeapon(a.weaponId).rarity);
  const f = new ActionFormData().title("§l무기 선택").body(`§7${type} — weapon_alloy §f${s.profile.materials.weapon_alloy ?? 0}`);
  for (const w of list) {
    const d = getWeapon(w.weaponId);
    f.button(`${stars(d.rarity)} §f${d.name}§r §7Lv.${w.level} R${w.refinement}\n§8${w.equippedBy ? `장착: ${getCharacter(w.equippedBy).name}` : d.passive.name}`, ICON("weapon"));
  }
  f.button("§l무기 강화 (장착 무기)\n§r§7weapon_alloy ×2 + 3,000 Credit → Lv+5", ICON("levelup"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  if (r.selection < list.length) {
    const err = equipWeapon(s.profile, id, list[r.selection].uid);
    if (err) s.player.sendMessage(`§c장착 실패: ${err}`);
    s.invalidateStats();
    save(s);
    return openWeaponSelect(s, id);
  }
  if (r.selection === list.length) {
    const cur = s.profile.characters[id].weaponUid;
    const w = cur ? s.profile.weapons[cur] : null;
    if (w && w.level < 90 && spend(s.profile, { credit: 3000, materials: { weapon_alloy: 2 } })) {
      w.level = Math.min(90, w.level + 5);
      // Weapon ascension follows the same caps as characters.
      if (w.level >= [20, 40, 50, 60, 70, 80, 90][w.ascension]) w.ascension = Math.min(6, w.ascension + 1);
      s.invalidateStats();
      save(s);
      sound(s.player, "noct.levelup");
    } else s.player.sendMessage("§c강화 불가 (재료 부족 또는 최대 레벨)");
    return openWeaponSelect(s, id);
  }
}

async function openImprints(s: Session, id: string): Promise<void> {
  const p = s.profile;
  const inst = p.characters[id];
  const f = new ActionFormData().title("§l기억각인").body("§7부위를 선택하세요");
  IMPRINT_SLOTS.forEach((slot, i) => {
    const uid = inst.imprintUids[i];
    const imp = uid ? p.imprints[uid] : null;
    f.button(imp ? `§l${slot}§r §f${ImprintSets.get(imp.setId)?.name} +${imp.level}\n§7${fmtStats(imp.main)}` : `§l${slot}\n§8비어 있음`, ICON("imprint"));
  });
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined || r.selection >= 5) return;
  const slot = IMPRINT_SLOTS[r.selection];
  const list = Object.values(p.imprints).filter((x) => x.slot === slot);
  const g = new ActionFormData().title(`§l${slot}`).body(`§7보유 ${list.length}`);
  for (const imp of list) g.button(`§f${ImprintSets.get(imp.setId)?.name} +${imp.level}${imp.equippedBy ? ` §8(${getCharacter(imp.equippedBy).name})` : ""}\n§7${fmtStats(imp.main)} | ${fmtStats(imp.subs)}`, ICON("imprint"));
  g.button("§l장착 각인 강화 (+4)\n§r§78,000 Credit", ICON("levelup"));
  const r2 = await showForm(s.player, g);
  if (!r2.canceled && r2.selection !== undefined) {
    if (r2.selection < list.length) equipImprint(p, id, list[r2.selection].uid);
    else {
      const uid = inst.imprintUids[r.selection];
      if (uid && spend(p, { credit: 8000 })) for (let i = 0; i < 4; i++) levelImprint(p.imprints[uid], game().rng);
    }
    s.invalidateStats();
    save(s);
  }
  return openImprints(s, id);
}

function fmtStats(b: Record<string, number | undefined>): string {
  return Object.entries(b).map(([k, v]) => `${k} ${v}`).join(", ");
}

// ───────────────────────────── PARTY ─────────────────────────────

async function openParty(s: Session): Promise<void> {
  const p = s.profile;
  const syn = partySynergies(partyMembers(p));
  const f = new ActionFormData()
    .title("§lPARTY")
    .body(`§7원소 공명: ${syn.length ? syn.map((x) => `§b${x.name}§7 (${x.description})`).join(", ") : "§8없음"}\n§7슬롯을 눌러 캐릭터 교체`);
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
    g.button(`${ELEMENT_COLOR[d.element]}${ELEMENT_ICON[d.element]} §f${d.name}${where >= 0 ? ` §8(슬롯 ${where + 1})` : ""}\n${stars(d.rarity)}`, PORTRAIT(id));
  }
  g.button("§c슬롯 비우기", ICON("empty"));
  const r2 = await showForm(s.player, g);
  if (!r2.canceled && r2.selection !== undefined) {
    const err = setPartySlot(p, slot, r2.selection < owned.length ? owned[r2.selection] : null);
    if (err === "empty") s.player.sendMessage("§c파티에는 최소 1명이 필요합니다.");
    s.syncParty();
    save(s);
  }
  return openParty(s);
}

// ───────────────────────────── INVENTORY ─────────────────────────────

async function openInventory(s: Session): Promise<void> {
  const p = s.profile;
  const mats = Object.entries(p.materials).sort().map(([k, v]) => `§7${k} §f×${v}`).join("\n") || "§8없음";
  const weapons = Object.values(p.weapons).map((w) => `${stars(getWeapon(w.weaponId).rarity)} §f${getWeapon(w.weaponId).name} §7Lv.${w.level} R${w.refinement}`).join("\n");
  const body = `§eCURRENCY\n§7Credit §f${fmt(p.currency.credit)}  §7Astrum §f${fmt(p.currency.astrum)}  §7Signal §f${p.currency.signal}\n\n§eMATERIALS\n${mats}\n\n§eWEAPONS (${Object.keys(p.weapons).length})\n${weapons}\n\n§eMEMORY IMPRINTS §f${Object.keys(p.imprints).length}`;
  const r = await showForm(s.player, new ActionFormData().title("§lINVENTORY").body(body).button("§7돌아가기", ICON("back")));
  if (!r.canceled) return openMainMenu(s);
}

// ───────────────────────────── QUEST / MAP / EVENT ─────────────────────────────

async function openQuest(s: Session): Promise<void> {
  const a = activeQuest(s.profile);
  const done = Object.entries(s.profile.quests).filter(([, q]) => q.status === "completed").map(([id]) => id);
  const f = new ActionFormData().title("§lQUEST").body(a ? `§6${a.def.title}\n\n§e◇ §f${progressText(s.profile)}\n\n§7단계 ${a.index + 1} / ${a.def.steps.length}\n\n§8완료: ${done.join(", ") || "—"}` : `§7진행 중인 퀘스트가 없습니다.\n§8완료: ${done.join(", ")}`);
  const canTalk = a?.step.type === "dialogue";
  if (canTalk) f.button("§l대화 진행", ICON("dialogue"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  if (canTalk && r.selection === 0) {
    const picks = await playDialogue(s.player, a!.step.dialogue!);
    if (picks) questSignal(s, { type: "dialogue", dialogue: a!.step.dialogue! });
    return;
  }
  return openMainMenu(s);
}

async function openMap(s: Session): Promise<void> {
  const unlocked = unlockedBeacons(s);
  const f = new ActionFormData().title(`§l${Region.name}`).body("§7Nexus Beacon — 이동 / 회복\n§8잠긴 비콘은 현장에서 활성화");
  for (const b of Region.beacons) {
    const ok = unlocked.includes(b);
    f.button(ok ? `§l§b◆ ${b.name}` : `§8◇ ${b.name} (잠김)`, ICON(ok ? "beacon" : "locked"));
  }
  f.button("§l§eDUNGEON", ICON("dungeon"));
  if (inDungeon(s)) f.button("§c던전 포기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  const n = Region.beacons.length;
  if (r.selection < n) {
    if (!teleportToBeacon(s, Region.beacons[r.selection].id)) s.player.sendMessage("§c아직 활성화되지 않은 비콘입니다.");
    return;
  }
  if (r.selection === n) return openDungeons(s);
  leaveDungeon(s);
}

async function openDungeons(s: Session): Promise<void> {
  const flux = refreshFlux(s.profile, game().clock.now());
  const f = new ActionFormData().title("§lDUNGEON").body(`§7Flux §f${flux}/180 §8(보상 획득 시 소비)`);
  for (const d of DUNGEONS) f.button(`§l${d.name}§r §7${d.type}\n§8Flux ${d.flux} · ${d.waves.length} waves`, ICON("dungeon"));
  const r = await showForm(s.player, f);
  if (r.canceled || r.selection === undefined) return;
  const err = enterDungeon(s, DUNGEONS[r.selection].id);
  if (err) s.player.sendMessage(`§c입장 불가: ${err === "flux" ? "Flux 부족" : err}`);
}

async function openEvent(s: Session): Promise<void> {
  const p = s.profile;
  rollDaily(p, game().clock.now());
  const rows = DAILY_TASKS.map((t) => {
    const v = Math.min(t.goal, p.daily.progress[t.id] ?? 0);
    return `${v >= t.goal ? "§a✔" : "§7○"} §f${t.label} §7${v}/${t.goal}`;
  }).join("\n");
  const complete = dailyComplete(p);
  const f = new ActionFormData().title("§lEVENT — DAILY").body(`${rows}\n\n§7보상: Astrum ${DAILY_REWARD_ASTRUM}\n§7주간 보스 처치: §f${p.weekly.bossClears}`);
  f.button(p.daily.claimed ? "§8수령 완료" : complete ? "§6§l보상 수령" : "§7진행 중", ICON("event"));
  f.button("§7돌아가기", ICON("back"));
  const r = await showForm(s.player, f);
  if (r.canceled) return;
  if (r.selection === 0 && complete && !p.daily.claimed) {
    p.daily.claimed = true;
    p.currency.astrum += DAILY_REWARD_ASTRUM;
    save(s);
    sound(s.player, "noct.gacha.gold");
    return openEvent(s);
  }
  return openMainMenu(s);
}

async function openProfile(s: Session): Promise<void> {
  const p = s.profile;
  const body = [
    `§f${p.name}`,
    `§7Nexus Rank §f${p.nexusRank} §8(${fmt(p.nexusExp)}/${fmt(nexusExpToNext(p.nexusRank))})`,
    `§7Characters §f${Object.keys(p.characters).length}   §7Weapons §f${Object.keys(p.weapons).length}   §7Imprints §f${Object.keys(p.imprints).length}`,
    `§7Beacons §f${unlockedBeacons(s).length}/${Region.beacons.length}`,
    `§7Total pulls §f${Object.values(p.pity).reduce((a, x) => a + x.total, 0)}`,
    `§8UID ${p.playerId}`,
  ].join("\n");
  const r = await showForm(s.player, new ActionFormData().title("§lPROFILE").body(body).button("§7돌아가기", ICON("back")));
  if (!r.canceled) return openMainMenu(s);
}

async function openSettings(s: Session): Promise<void> {
  const st = s.profile.settings;
  const presets = ["AUTO", "COMPACT", "PHONE", "FOLD_EXPANDED", "WINDOWS"] as const;
  const f = new ModalFormData()
    .title("§lSETTINGS")
    .dropdown("UI 프리셋 (Galaxy Fold 펼침 → FOLD_EXPANDED)", [...presets], { defaultValueIndex: presets.indexOf(st.uiPreset) })
    .toggle("HUD 퀘스트 트래커", { defaultValue: st.hudDetail })
    .toggle("카메라 흔들림", { defaultValue: st.cameraShake });
  const r = await showForm(s.player, f);
  if (r.canceled || !r.formValues) return;
  st.uiPreset = presets[r.formValues[0] as number];
  st.hudDetail = r.formValues[1] as boolean;
  st.cameraShake = r.formValues[2] as boolean;
  save(s);
  await showForm(s.player, new MessageFormData().title("SETTINGS").body(`§a저장됨 — 현재 프리셋: ${presetFor(s.player, s.profile)}`).button1("확인").button2("닫기"));
}
