/**
 * Title → Loading → Astera.
 *   Title:   Astera night skyline with a distant Rift (camera + particles),
 *            NOCTERRA logo, "TAP TO START", version bottom line.
 *   Loading: world backdrop (slow camera drift), glass loading bar + tip.
 *   Enter:   first login plays the Prologue arrival; returning players resume.
 */
import { ActionFormData } from "@minecraft/server-ui";
import { EasingType, system } from "@minecraft/server";
import type { Session } from "../runtime/Session";
import { showForm } from "../story/Dialogue";
import { playCutscene, orbit } from "../camera/Cutscene";
import { beacon, resolve, Region } from "../world/World";
import { ICON } from "./UIManager";
import { particle, sound } from "../audio/Fx";
import tips from "../../database/art/tips.json";
import { VERSION } from "../version";

function cam(s: Session, pos: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }, ease = 0) {
  try {
    s.player.camera.setCamera("minecraft:free", { location: pos, facingLocation: look, easeOptions: ease ? { easeTime: ease, easeType: EasingType.InOutSine } : undefined });
  } catch {
    /* camera unsupported */
  }
}

export async function titleFlow(s: Session, firstTime: boolean): Promise<void> {
  const p = s.player;
  const city = resolve(beacon("astera_city")!.offset);
  const scar = resolve(Region.beacons.find((b) => b.id === "void_scar")!.offset);
  const skyline = { x: city.x - 18, y: city.y + 14, z: city.z - 18 };
  s.busyUntil = system.currentTick + 100000; // locked until entry

  // ── TITLE ──
  try {
    p.camera.fade({ fadeTime: { fadeInTime: 0, holdTime: 0.6, fadeOutTime: 1.2 }, fadeColor: { red: 0.01, green: 0.01, blue: 0.04 } });
  } catch {
    /* ignore */
  }
  cam(s, skyline, { x: scar.x, y: scar.y + 30, z: scar.z });
  system.runTimeout(() => cam(s, { x: skyline.x + 4, y: skyline.y + 2, z: skyline.z + 2 }, { x: scar.x, y: scar.y + 30, z: scar.z }, 12), 4);
  const riftFx = system.runInterval(() => {
    if (!p.isValid) return;
    const r = { x: skyline.x + (scar.x - skyline.x) * 0.25, y: skyline.y + 8, z: skyline.z + (scar.z - skyline.z) * 0.25 };
    particle(p.dimension, "noct:rift", r, 3);
    particle(p.dimension, "noct:light_orb", { x: skyline.x + (Math.random() - 0.5) * 16, y: skyline.y - 2 + Math.random() * 6, z: skyline.z + (Math.random() - 0.5) * 16 });
  }, 6);
  p.onScreenDisplay.setTitle("§l§fN O C T E R R A", { subtitle: "§7T A P   T O   S T A R T", fadeInDuration: 10, stayDuration: 600, fadeOutDuration: 10 });
  const title = new ActionFormData()
    .title("§l§fN O C T E R R A")
    .body(`\n\n\n§7              녹테라\n\n\n\n\n§8                                                   v${VERSION}`)
    .button("§l§f▶   TAP TO START", ICON("start"));
  await showForm(p, title); // any close also starts (never trap the player)
  system.clearRun(riftFx);
  if (!p.isValid) return;
  sound(p, "nocterra.gacha.charge");

  // ── LOADING ──
  const tip = tips[Math.floor(Math.random() * tips.length)];
  try {
    p.camera.fade({ fadeTime: { fadeInTime: 0.25, holdTime: 0.2, fadeOutTime: 0.5 }, fadeColor: { red: 0.01, green: 0.01, blue: 0.04 } });
  } catch {
    /* ignore */
  }
  p.onScreenDisplay.setTitle(" ", { subtitle: " ", fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
  system.runTimeout(() => cam(s, orbit(city, 200, 22, 12), city), 5);
  system.runTimeout(() => cam(s, orbit(city, 250, 18, 9), city, 3), 7);
  await new Promise<void>((res) => {
    let step = 0;
    const id = system.runInterval(() => {
      step++;
      const pct = Math.min(100, step * 10);
      const barTxt = `§b${"▰".repeat(pct / 10)}§8${"▱".repeat(10 - pct / 10)}`;
      if (p.isValid) p.onScreenDisplay.setActionBar(`§7LOADING  ${barTxt} §f${pct}%\n\n§eTIP §f${tip}`);
      if (pct >= 100) {
        system.clearRun(id);
        res();
      }
    }, 5);
  });

  // ── ENTER ──
  if (firstTime) {
    await playCutscene(p, [
      { at: 1, fade: { in: 0.3, hold: 0.3, out: 0.8 } },
      { at: 4, camera: { pos: orbit(city, 30, 16, 8), facing: city } },
      { at: 6, camera: { pos: orbit(city, 90, 5, 2), facing: { x: city.x, y: city.y + 1.5, z: city.z }, ease: 4 }, title: "§bASTERA", subtitle: "§7CHAPTER 1 — FALLEN NIGHT" },
      { at: 80, fade: { in: 0.3, hold: 0.2, out: 0.6 } },
    ], 88);
    if (p.isValid) p.teleport(city);
  } else {
    await playCutscene(p, [{ at: 1, fade: { in: 0.2, hold: 0.1, out: 0.5 }, title: "§bASTERA", subtitle: `§7Welcome back, ${p.name}` }], 10);
  }
  s.profile.titleSeen = true;
  s.busyUntil = 0;
}
