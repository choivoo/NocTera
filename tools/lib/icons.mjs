// Procedural UI art: round glass touch buttons with glyphs, character portrait
// busts from the art palette, glass panels. Dark sci-fi, thin glowing rims.
import { png, hex, mix } from "./png.mjs";

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function blend(dst, src, a) {
  return [clamp(dst[0] + (src[0] - dst[0]) * a), clamp(dst[1] + (src[1] - dst[1]) * a), clamp(dst[2] + (src[2] - dst[2]) * a)];
}

// 9×9 glyph bitmaps
const G = {
  sword: ["........#", ".......#.", "......#..", ".....#...", "#...#....", ".#.#.....", "..#......", ".#.#.....", "#........"],
  skill: ["....#....", "...###...", "..#.#.#..", ".#..#..#.", "#########", ".#..#..#.", "..#.#.#..", "...###...", "....#...."],
  star: ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..##.##..", ".##...##.", "#.......#"],
  dodge: [".........", "..#......", ".##......", "#########", ".##......", "..#......", "......#..", "......##.", "#########"],
  menu: [".........", "#########", ".........", ".........", "#########", ".........", ".........", "#########", "........."],
  lock: ["...###...", "..#...#..", "..#...#..", ".#######.", ".#######.", ".###.###.", ".###.###.", ".#######.", "........."],
  plus: [".........", "....#....", "....#....", "....#....", ".#######.", "....#....", "....#....", "....#....", "........."],
  back: [".........", "...#.....", "..##.....", ".########", "..##.....", "...#.....", ".........", ".........", "........."],
  check: [".........", "........#", ".......##", "......##.", "#....##..", "##..##...", ".####....", "..##.....", "........."],
  info: ["....#....", ".........", "...##....", "....#....", "....#....", "....#....", "....#....", "...###...", "........."],
  diamond: ["....#....", "...###...", "..#####..", ".#######.", "#########", ".#######.", "..#####..", "...###...", "....#...."],
  ring: ["..#####..", ".#.....#.", "#.......#", "#.......#", "#...#...#", "#.......#", "#.......#", ".#.....#.", "..#####.."],
  arrow_up: ["....#....", "...###...", "..#####..", ".###.###.", "###...###", "....#....", "....#....", "....#....", "....#...."],
};

/** Round glass button: dark translucent disc, bright rim, glyph. `ready` adds an outer glow halo. */
export function roundButton(size, color, glyph, { ready = false, dim = false } = {}) {
  const c = hex(color);
  const R = size / 2 - 0.5;
  const g = G[glyph] ?? G.diamond;
  const gs = Math.floor(size / 16) || 1;
  const gx0 = Math.floor(size / 2 - (9 * gs) / 2);
  return png(size, size, (x, y) => {
    const dx = x - size / 2 + 0.5, dy = y - size / 2 + 0.5;
    const d = Math.hypot(dx, dy);
    const inner = R * (ready ? 0.82 : 0.9);
    if (d > R) return [0, 0, 0, 0];
    if (d > inner) {
      if (!ready) return [...(dim ? mix(c, [40, 40, 50], 0.6) : c), 255];
      const k = 1 - (d - inner) / (R - inner);
      return [...mix([255, 255, 255], c, 0.3 + 0.4 * (1 - k)), clamp(120 + 135 * k)];
    }
    if (d > inner - 1.2) return [...mix(c, [255, 255, 255], 0.5), 255];
    // glass body with top highlight
    let base = [16, 18, 28];
    base = blend(base, c, 0.1 + (ready ? 0.15 : 0));
    if (dy < -R * 0.35 && d < inner - 2) base = blend(base, [255, 255, 255], 0.08);
    const gxI = Math.floor((x - gx0) / gs), gyI = Math.floor((y - gx0) / gs);
    if (gxI >= 0 && gxI < 9 && gyI >= 0 && gyI < 9 && g[gyI][gxI] === "#") return [...(dim ? [90, 90, 100] : mix(c, [255, 255, 255], 0.45)), 255];
    return [...base, dim ? 150 : 215];
  });
}

/** Portrait bust (face, hair, collar) in a round element-colored frame. */
export function portrait(size, pal, elementColor, { ready = false, round = true } = {}) {
  const P = Object.fromEntries(Object.entries(pal).filter(([k]) => k !== "_").map(([k, v]) => [k, hex(v)]));
  const ring = hex(elementColor);
  const R = size / 2 - 0.5;
  const u = size / 32; // design grid 32×32
  return png(size, size, (x, y) => {
    const dx = x - size / 2 + 0.5, dy = y - size / 2 + 0.5;
    const d = Math.hypot(dx, dy);
    if (round && d > R) return [0, 0, 0, 0];
    const rimW = ready ? 2.6 * u : 1.4 * u;
    if (round && d > R - rimW) return [...(ready ? mix([255, 214, 90], [255, 255, 255], (d - (R - rimW)) / rimW * 0.6) : ring), 255];
    const gx = x / u, gy = y / u;
    // background gradient
    let col = mix([10, 12, 22], ring, 0.12 + (gy / 32) * 0.15);
    // shoulders / coat
    if (gy > 23 && Math.abs(gx - 16) < 12 - (32 - gy) * 0.2) col = gy > 25 && Math.abs(gx - 16) < 2.5 ? P.inner : P.coat;
    // neck
    if (gy > 19 && gy <= 23.5 && Math.abs(gx - 16) < 2.2) col = mix(P.skin, [0, 0, 0], 0.12);
    // hair back
    if (gy > 5 && gy < 22 && Math.abs(gx - 16) < 8.5) col = P.hair;
    // face
    if (gy > 8 && gy < 20 && Math.abs(gx - 16) < 6 - Math.max(0, gy - 16) * 0.6) col = P.skin;
    // fringe
    if (gy > 5 && gy < 10.5 + Math.sin(gx * 1.3) * 0.8 && Math.abs(gx - 16) < 7.5) col = P.hair;
    // eyes
    if (gy > 13 && gy < 15.2 && (Math.abs(gx - 13) < 1.1 || Math.abs(gx - 19) < 1.1)) col = gy < 14 ? mix(P.eye, [255, 255, 255], 0.5) : P.eye;
    // accent charm
    if (gy > 26 && gy < 28 && Math.abs(gx - 16) < 1) col = P.glow;
    return [...col, 255];
  });
}

/** Translucent glass panel (for nineslice). */
export function glassPanel(size, color, alpha = 190) {
  const c = hex(color);
  return png(size, size, (x, y) => {
    const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
    if (edge) return [...mix(c, [255, 255, 255], 0.2), 230];
    const corner = (x < 2 || x > size - 3) && (y < 2 || y > size - 3);
    if (corner) return [...c, 200];
    return [...mix([10, 12, 22], c, 0.08 + (y / size) * 0.06), alpha];
  });
}
