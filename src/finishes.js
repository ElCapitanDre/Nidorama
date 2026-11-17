// Wall finishes (#129): each side of a wall can be painted or clad. The textures are drawn here, on a
// canvas, so nothing is downloaded and they stay light enough for a wall tablet.
import * as THREE from 'three';

/** [id, name, default colour, can it be painted any colour] */
export const FINISHES = [
  ['paint', 'Paint', '#efeae3', true],
  ['render', 'Render', '#e8e2d8', true],
  ['brick', 'Brick', '#9b4a36', true],
  ['sandstone', 'Sandstone cladding', '#cdb38a', false],
  ['weatherboard', 'Weatherboards', '#e9e6df', true],
  ['timber', 'Timber cladding', '#8a5a3b', true],
  ['stone', 'Stone', '#8f8a82', true],
  ['tiles', 'Tiles', '#f1f1ee', true],
];
/** Colours offered first for each finish (any colour can still be picked). */
export const SWATCHES = {
  paint: ['#f4f1ea', '#e9e4da', '#d6d3cc', '#a9aca7', '#5e6660', '#2f3432', '#c9b79c', '#7f9a8a'],
  render: ['#efe9df', '#e3dcd0', '#cfc7ba', '#9d9a92', '#5a5d59'],
  brick: ['#9b4a36', '#7a4e36', '#d8c7a2', '#8b8d8f', '#3d3d40', '#f2efe8'],
  sandstone: ['#cdb38a', '#d9c39b', '#bfa076'],
  weatherboard: ['#f4f1ea', '#d9d4c8', '#8ea0a8', '#4f5d58', '#2f3432'],
  timber: ['#8a5a3b', '#a8774f', '#5e3d29', '#c49a6c'],
  stone: ['#8f8a82', '#b5ada1', '#6e6a64'],
  tiles: ['#f1f1ee', '#d9e3e6', '#1f2421', '#c8d6c4'],
};
export const finishName = (id) => FINISHES.find((f) => f[0] === id)?.[1] || 'Paint';
export const finishColor = (side) => side?.color || FINISHES.find((f) => f[0] === (side?.finish || 'paint'))?.[2] || '#efeae3';

// How much wall one picture covers, in metres (width, height).
const SPAN = { brick: [1.2, 0.6], sandstone: [1.8, 0.9], weatherboard: [1.2, 0.9], timber: [1.2, 1.2], stone: [1.6, 1.0], tiles: [1.2, 1.2], render: [2, 2] };

const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return `#${c.getHexString()}`; };
const cache = new Map();
/** The picture for a finish in a colour (shared; each wall piece clones it with its own repeat). */
function picture(finish, color) {
  const key = `${finish}|${color}`;
  if (cache.has(key)) return cache.get(key);
  const W = 256, H = 128 * (finish === 'timber' || finish === 'tiles' ? 2 : 1), c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  if (finish === 'brick') {
    g.fillStyle = shade(color, 0.22); g.fillRect(0, 0, W, H); // mortar
    const bh = H / 8, bw = W / 5;
    for (let r = 0; r < 8; r++) for (let i = -1; i < 6; i++) {
      const x = i * bw + (r % 2 ? bw / 2 : 0);
      g.fillStyle = shade(color, (rnd() - 0.5) * 0.09);
      g.fillRect(x + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
  } else if (finish === 'sandstone' || finish === 'stone') {
    g.fillStyle = shade(color, -0.12); g.fillRect(0, 0, W, H);
    const rows = finish === 'stone' ? 5 : 4, rh = H / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 40;
      while (x < W) { const w = (finish === 'stone' ? 30 : 50) + rnd() * 60; g.fillStyle = shade(color, (rnd() - 0.5) * 0.12); g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4); x += w; }
    }
  } else if (finish === 'weatherboard') {
    const n = 6, bh = H / n;
    for (let r = 0; r < n; r++) {
      const grd = g.createLinearGradient(0, r * bh, 0, (r + 1) * bh);
      grd.addColorStop(0, shade(color, -0.1)); grd.addColorStop(0.18, color); grd.addColorStop(1, shade(color, 0.03));
      g.fillStyle = grd; g.fillRect(0, r * bh, W, bh);
      g.fillStyle = shade(color, -0.22); g.fillRect(0, r * bh, W, 2);
    }
  } else if (finish === 'timber') {
    const n = 8, bw = W / n;
    for (let i = 0; i < n; i++) { g.fillStyle = shade(color, (rnd() - 0.5) * 0.1); g.fillRect(i * bw, 0, bw, H); g.fillStyle = shade(color, -0.2); g.fillRect(i * bw, 0, 2, H); }
    g.globalAlpha = 0.12; g.strokeStyle = shade(color, -0.3);
    for (let i = 0; i < 40; i++) { g.beginPath(); const x = rnd() * W; g.moveTo(x, 0); g.bezierCurveTo(x + 6, H / 3, x - 6, (2 * H) / 3, x + 3, H); g.stroke(); }
    g.globalAlpha = 1;
  } else if (finish === 'tiles') {
    const n = 4, s = W / n;
    g.fillStyle = shade(color, -0.14); g.fillRect(0, 0, W, H);
    for (let r = 0; r < H / s; r++) for (let i = 0; i < n; i++) { g.fillStyle = shade(color, (rnd() - 0.5) * 0.03); g.fillRect(i * s + 1.5, r * s + 1.5, s - 3, s - 3); }
  } else if (finish === 'render') {
    for (let i = 0; i < 1400; i++) { g.fillStyle = shade(color, (rnd() - 0.5) * 0.06); g.fillRect(rnd() * W, rnd() * H, 2, 2); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
/** A texture for one piece of wall `len` × `height` metres, or null for plain paint. */
export function finishTexture(side, len, height) {
  const f = side?.finish || 'paint';
  if (f === 'paint') return null;
  const [sw, sh] = SPAN[f] || [1, 1];
  const t = picture(f, finishColor(side)).clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(0.05, len / sw), Math.max(0.05, height / sh));
  return t;
}
