/**
 * Touch-first controls. Each action is a custom item locked into the hotbar;
 * tapping (use) triggers the action. Hotbar layout mirrors the HUD spec:
 *   1 ATK · 2 SKILL · 3 ULT · 4 DODGE · 5–8 CHAR 1–4 · 9 MENU
 * Left-click melee on enemies also triggers ATK for keyboard/mouse players.
 */
import { ItemLockMode, ItemStack, system, world, EntityComponentTypes, type Player } from "@minecraft/server";
import { game } from "../runtime/Game";
import { dodge, normalAttack, switchTo, useSkill, useUltimate } from "../combat/CombatRuntime";
import { openMainMenu } from "../ui/Menus";
import { enemies } from "../combat/EnemyRuntime";

export const HOTBAR: { item: string; action: string }[] = [
  { item: "noct:ctl_attack", action: "attack" },
  { item: "noct:ctl_skill", action: "skill" },
  { item: "noct:ctl_ultimate", action: "ultimate" },
  { item: "noct:ctl_dodge", action: "dodge" },
  { item: "noct:ctl_char1", action: "char1" },
  { item: "noct:ctl_char2", action: "char2" },
  { item: "noct:ctl_char3", action: "char3" },
  { item: "noct:ctl_char4", action: "char4" },
  { item: "noct:ctl_menu", action: "menu" },
];

export function giveControls(player: Player): void {
  const inv = player.getComponent(EntityComponentTypes.Inventory)?.container;
  if (!inv) return;
  HOTBAR.forEach((h, slot) => {
    const cur = inv.getItem(slot);
    if (cur?.typeId === h.item) return;
    const it = new ItemStack(h.item, 1);
    it.lockMode = ItemLockMode.slot;
    it.keepOnDeath = true;
    inv.setItem(slot, it);
  });
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
  // Keyboard/mouse: left-clicking an enemy is a normal attack; vanilla damage is disabled on enemies.
  world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
    if (damagingEntity.typeId !== "minecraft:player" || !enemies.isEnemy(hitEntity)) return;
    dispatch(damagingEntity as Player, "attack");
  });
}
