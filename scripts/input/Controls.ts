/**
 * Touch-first controls. Each action is a custom item locked into the hotbar;
 * tapping (use) triggers it. Layout (right thumb = combat, left = party):
 *   1 ATK · 2 SKILL · 3 ULT · 4 DODGE · 5–8 party portraits · 9 MENU
 * Buttons are live: ULT swaps to a glowing "ready" icon, party portraits swap
 * to a glowing frame on Ultimate Ready / QTE, co-op-locked slots dim.
 * Left-click on an enemy also performs ATK (keyboard/mouse).
 */
import { ItemLockMode, ItemStack, system, world, EntityComponentTypes, type Player } from "@minecraft/server";
import { game } from "../runtime/Game";
import { dodge, normalAttack, switchTo, useSkill, useUltimate } from "../combat/CombatRuntime";
import { openMainMenu } from "../ui/Menus";
import { enemies } from "../combat/EnemyRuntime";
import type { Session } from "../runtime/Session";
import { getCharacter } from "../data/registry";
import { allowedSlots } from "../coop/CoopManager";

export const CHAR_SLOT_BASE = 4;
/** Action per hotbar slot (right thumb: 1–4, party: 5–8, menu: 9). */
export const HOTBAR_ACTIONS = ["attack", "skill", "ultimate", "dodge", "char", "char", "char", "char", "menu"] as const;

function desired(s: Session | undefined, slot: number): string {
  switch (slot) {
    case 0:
      return "noct:ctl_attack";
    case 1:
      return "noct:ctl_skill";
    case 2: {
      const rt = s?.active;
      const ready = rt && rt.energy >= (getCharacter(rt.id).kit.ultimate.energyCost ?? 60);
      return ready ? "noct:ctl_ultimate_ready" : "noct:ctl_ultimate";
    }
    case 3:
      return "noct:ctl_dodge";
    case 8:
      return "noct:ctl_menu";
    default: {
      const i = slot - CHAR_SLOT_BASE;
      const id = s?.profile.party[i];
      if (!s || !id) return "noct:ctl_char_empty";
      if (!allowedSlots(s).includes(i)) return "noct:ctl_char_locked";
      const rt = s.chars.get(id);
      const t = system.currentTick;
      const glow = rt && rt.hp > 0 && i !== s.profile.activeSlot && (rt.qteReadyUntil > t || rt.energy >= (getCharacter(id).kit.ultimate.energyCost ?? 60));
      return `noct:ctl_char_${id}${glow ? "_ready" : ""}`;
    }
  }
}

function place(player: Player, slot: number, typeId: string): void {
  const inv = player.getComponent(EntityComponentTypes.Inventory)?.container;
  if (!inv) return;
  if (inv.getItem(slot)?.typeId === typeId) return;
  const it = new ItemStack(typeId, 1);
  it.lockMode = ItemLockMode.slot;
  it.keepOnDeath = true;
  inv.setItem(slot, it);
}

export function giveControls(player: Player): void {
  const s = game().session(player);
  for (let slot = 0; slot < 9; slot++) place(player, slot, desired(s, slot));
}

/** Called from the HUD loop; only writes slots whose icon changed. */
export function refreshHotbar(s: Session): void {
  for (let slot = 2; slot < 8; slot++) if (slot !== 3) place(s.player, slot, desired(s, slot));
}

export function dispatch(player: Player, action: string): void {
  const s = game().session(player);
  if (!s) return;
  switch (action) {
    case "attack":
      return normalAttack(s);
    case "skill":
      return useSkill(s);
    case "ultimate":
      return useUltimate(s);
    case "dodge":
      return dodge(s);
    case "menu":
      if (system.currentTick >= s.busyUntil) void openMainMenu(s);
      return;
    case "char": {
      const slot = player.selectedSlotIndex - CHAR_SLOT_BASE;
      if (slot >= 0 && slot < 4) switchTo(s, slot);
      return;
    }
    default:
      if (action.startsWith("char")) switchTo(s, Number(action.slice(4)) - 1);
  }
}

/** Must be called from system.beforeEvents.startup. */
export function registerControlComponent(registry: { registerCustomComponent(name: string, c: any): void }): void {
  registry.registerCustomComponent("noct:control", {
    onUse(ev: { source: Player }, params: { params: unknown }) {
      const action = (params?.params as { action?: string })?.action;
      if (action) dispatch(ev.source, action);
    },
  });
}

export function registerControlEvents(): void {
  world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
    if (damagingEntity.typeId !== "minecraft:player" || !enemies.isEnemy(hitEntity)) return;
    dispatch(damagingEntity as Player, "attack");
  });
}
