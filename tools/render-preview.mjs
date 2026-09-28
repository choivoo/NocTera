// Renders an orthographic 3/4-view preview sheet of all character geometries
// (docs/art/characters_preview.png) for art review without launching the game.
import fs from "fs";
import { png, hex } from "./lib/png.mjs";

const order = JSON.parse(fs.readFileSync("database/art/order.json", "utf8"));
const art = JSON.parse(fs.readFileSync("database/art/characters.json", "utf8"));
const SW = ["hair", "skin", "coat", "inner", "metal", "accent", "glow", "eye"];
const S = 7; // px per model unit
const CW = 34, CH = 44;
const W = CW * S * 5, H = CH * S * 2;
const buf = new Uint8ClampedArray(W * H * 4);
const zb = new Float32Array(W * H).fill(-1e9);
for (let i = 0; i < W * H; i++) buf.set([12, 14, 22, 255], i * 4);

function colorFor(pal, uv) {
  const [u, v] = uv;
  if (v >= 8) return u < 8 ? hex(pal.skin) : [30, 30, 40];
  return hex(pal[SW[Math.floor(u / 8)]]);
}
const yaw = (145 * Math.PI) / 180;
const pitch = (12 * Math.PI) / 180;
function project([x, y, z]) {
  const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
  const rz = x * Math.sin(yaw) + z * Math.cos(yaw);
  const ry = y * Math.cos(pitch) + rz * Math.sin(pitch);
  const dz = -y * Math.sin(pitch) + rz * Math.cos(pitch);
  return [rx, ry, -dz];
}
order.forEach((id, idx) => {
  const geo = JSON.parse(fs.readFileSync(`resource_pack/NOCTERRA_RP/models/entity/noct_char_${id}.geo.json`, "utf8"))["minecraft:geometry"][0];
  const pal = art[id].palette;
  const ox = (idx % 5) * CW * S + (CW * S) / 2;
  const oy = Math.floor(idx / 5) * CH * S + CH * S - 20;
  for (const b of geo.bones) for (const c of b.cubes ?? []) {
    const col = colorFor(pal, c.uv.north.uv);
    const [x0, y0, z0] = c.origin, [sx, sy, sz] = c.size;
    // sample the cube volume surface densely and splat with z-buffer + simple lighting per face
    const faces = [[0, 1, 2, [0, 0, -1]], [0, 1, 2, [0, 0, 1]], [1, 2, 0, [-1, 0, 0]], [1, 2, 0, [1, 0, 0]], [0, 2, 1, [0, 1, 0]]];
    for (const [, , , n] of faces) {
      const light = 0.55 + 0.45 * Math.max(0, n[0] * -0.5 + n[1] * 0.8 + n[2] * -0.6);
      const steps = [Math.max(2, sx * 3), Math.max(2, sy * 3), Math.max(2, sz * 3)];
      for (let i = 0; i <= steps[0]; i++) for (let j = 0; j <= steps[1]; j++) for (let k = 0; k <= steps[2]; k++) {
        const on = (n[0] ? (n[0] < 0 ? i === 0 : i === steps[0]) : true) && (n[1] ? (n[1] < 0 ? j === 0 : j === steps[1]) : true) && (n[2] ? (n[2] < 0 ? k === 0 : k === steps[2]) : true);
        if (!on) continue;
        const p = project([-(x0 + (sx * i) / steps[0]), y0 + (sy * j) / steps[1], -(z0 + (sz * k) / steps[2])]);
        const px = Math.round(ox + p[0] * S), py = Math.round(oy - p[1] * S);
        for (let a = 0; a < 2; a++) for (let bb = 0; bb < 2; bb++) {
          const X = px + a, Y = py + bb;
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const o = Y * W + X;
          if (p[2] <= zb[o]) continue;
          zb[o] = p[2];
          buf.set([col[0] * light, col[1] * light, col[2] * light, 255], o * 4);
        }
      }
    }
  }
});
fs.mkdirSync("docs/art", { recursive: true });
fs.writeFileSync("docs/art/characters_preview.png", png(W, H, (x, y) => Array.from(buf.subarray((y * W + x) * 4, (y * W + x) * 4 + 4))));
console.log("[render-preview] docs/art/characters_preview.png");
