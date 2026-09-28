/**
 * /noct:noct <sub> [arg] [value] — admin-only development commands.
 * Registered through the stable CustomCommandRegistry with Admin permission,
 * so in production only operators can run them.
 */
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, system, type Player, type CustomCommandOrigin } from "@minecraft/server";
import { game } from "../runtime/Game";
import { Characters, Banners, Enemies } from "../data/registry";
import { obtainCharacter, addCharacterExp } from "../character/CharacterManager";
import { grant } from "../account/Wallet";
import { spawnBoss, setOrigin, teleportToBeacon } from "../world/World";
import { startQuest } from "../quest/QuestManager";
import { presentStep } from "../quest/QuestRuntime";
import { enemies } from "../combat/EnemyRuntime";
import { setLogLevel } from "../core/Logger";
import { openBanner } from "../ui/GachaScreen";
import { rollImprint } from "../artifact/ImprintGen";
import { respawnNpcs } from "../world/City";
import { showcase } from "../camera/Showcase";
import { playAnim, type AnimName } from "../character/CharacterVisual";
import { groupSize, characterAllowance } from "../coop/CoopManager";

const SUBS = ["debug", "givechar", "level", "astrum", "banner", "boss", "quest", "tp", "reset", "setup", "spawn", "imprint", "save", "stats", "unlock", "npc", "preview", "anim", "coop"];

export function registerCommands(registry: any): void {
  registry.registerEnum("noct:sub", SUBS);
  registry.registerCommand(
    {
      name: "noct:noct",
      description: "NOCTERRA admin/debug",
      permissionLevel: CommandPermissionLevel.Admin,
      cheatsRequired: false,
      mandatoryParameters: [{ name: "noct:sub", type: CustomCommandParamType.Enum }],
      optionalParameters: [
        { name: "arg", type: CustomCommandParamType.String },
        { name: "value", type: CustomCommandParamType.Integer },
      ],
    },
    (origin: CustomCommandOrigin, sub: string, arg?: string, value?: number) => {
      const player = origin.sourceEntity as Player | undefined;
      if (!player || player.typeId !== "minecraft:player") return { status: CustomCommandStatus.Failure, message: "player only" };
      // Commands run in restricted context; defer world mutation to the next tick.
      system.run(() => run(player, sub, arg, value));
      return { status: CustomCommandStatus.Success };
    },
  );
}

function run(player: Player, sub: string, arg?: string, value?: number): void {
  const g = game();
  const s = g.session(player);
  if (!s) return player.sendMessage("§cno session");
  const p = s.profile;
  const now = g.clock.now();
  const say = (m: string) => player.sendMessage(`§8[noct] §f${m}`);
  switch (sub) {
    case "debug":
      setLogLevel("debug");
      say(`sessions=${g.sessions.size} enemies=${enemies.count()} dirty=${g.save.isDirty(s.id)} writes=${g.save.writeCount}`);
      break;
    case "givechar":
      if (!arg || !Characters.has(arg)) return say(`chars: ${[...Characters.keys()].join(", ")}`);
      obtainCharacter(p, arg, now);
      s.syncParty();
      g.save.saveNow(s.id);
      say(`granted ${arg} (R${p.characters[arg].resonance})`);
      break;
    case "level": {
      const id = arg && p.characters[arg] ? arg : s.activeId!;
      addCharacterExp(p, id, value ?? 50000);
      s.invalidateStats();
      g.save.markDirty(s.id);
      say(`${id} Lv.${p.characters[id].level}`);
      break;
    }
    case "astrum":
      grant(p, { astrum: value ?? 16000 });
      g.save.saveNow(s.id);
      say(`astrum=${p.currency.astrum}`);
      break;
    case "banner":
      if (arg && Banners.has(arg)) void openBanner(s, arg);
      else say(`banners: ${[...Banners.keys()].join(", ")}`);
      break;
    case "boss":
      if (!arg || !Enemies.has(arg)) return say("boss: frost_devourer | void_seraph");
      spawnBoss(arg, s);
      break;
    case "spawn": {
      const def = arg ? Enemies.get(arg) : undefined;
      if (!def) return say(`enemies: ${[...Enemies.keys()].join(", ")}`);
      for (let i = 0; i < (value ?? 1); i++) {
        const e = player.dimension.spawnEntity(def.entity, { x: player.location.x + 4 + i, y: player.location.y, z: player.location.z });
        enemies.register(e);
      }
      break;
    }
    case "quest":
      if (arg) {
        startQuest(p, arg);
        presentStep(s);
      }
      say(JSON.stringify(p.quests));
      break;
    case "tp":
      if (!arg || !teleportToBeacon(s, arg)) say("unknown/locked beacon");
      break;
    case "setup":
      setOrigin(player.location);
      say(`Astera origin set to ${Math.floor(player.location.x)} ${Math.floor(player.location.y)} ${Math.floor(player.location.z)} — city builds automatically`);
      break;
    case "npc":
      respawnNpcs();
      say("NPCs respawned");
      break;
    case "unlock":
      for (const f of ["gacha", "dungeon", "coop", "weekly"]) p.story.flags[`unlock_${f}`] = true;
      g.save.saveNow(s.id);
      say("all features unlocked");
      break;
    case "preview":
      if (!arg || !Characters.has(arg)) return say(`chars: ${[...Characters.keys()].join(", ")}`);
      void showcase(s, arg, { ticks: value ?? 60, title: arg.toUpperCase() });
      break;
    case "anim":
      playAnim(player, (arg ?? "select") as AnimName);
      break;
    case "coop":
      say(`group=${p.coop.groupId} size=${groupSize(s)} allowance=${characterAllowance(groupSize(s))}`);
      break;
    case "imprint":
      for (let i = 0; i < (value ?? 5); i++) rollImprint(p, g.rng, arg);
      g.save.saveNow(s.id);
      break;
    case "save":
      say(`saved=${g.save.saveNow(s.id)}`);
      break;
    case "stats": {
      const id = s.activeId!;
      say(JSON.stringify(s.stats(id, system.currentTick)));
      break;
    }
    case "reset":
      if (arg !== "confirm") return say("§c계정 초기화: /noct:noct reset confirm");
      g.sessions.delete(player.id);
      g.save.reset(player.id, player.name);
      say("reset — rejoin to start over");
      break;
  }
}
