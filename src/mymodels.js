// "My models": furniture the user makes, kept in the home file (`home.catalog`) in the same form as the
// built-in CATALOG, so placing, resizing, recolouring, rotating, lights and renders work on them unchanged.
// Phase 1 of the model maker: save a placed piece as a model, place it again, update every placed copy.
import { uid } from './catalog.js';
import { round } from './geom.js';

export const MY_CAT = 'My models';
const MAX_ITEMS = 200, MAX_PARTS = 200;
const HEX = /^#[0-9a-f]{6}$/i;
const SHAPES = ['cylinder'];
const num = (v, lo, hi, fallback = null) => (v === '' || v == null || !Number.isFinite(+v) ? fallback : Math.min(hi, Math.max(lo, +v)));
const frac = (v) => Math.round(v * 1e4) / 1e4; // fractions need more places than metres

/** One part `[x0, y0, z0, x1, y1, z1, colour, options]` checked and tidied, or null. */
function cleanPart(p) {
  if (!Array.isArray(p) || p.length < 7) return null;
  const c = p.slice(0, 6).map((v) => num(v, -1, 2));
  if (c.some((v) => v == null) || c[3] <= c[0] || c[4] <= c[1] || c[5] <= c[2]) return null;
  const color = HEX.test(p[6]) ? p[6].toLowerCase() : '#cfc8bd';
  const o = p[7] && typeof p[7] === 'object' ? p[7] : {}, opts = {};
  if (SHAPES.includes(o.shape)) opts.shape = o.shape;
  const radius = num(o.radius, 0, 1); if (radius) opts.radius = radius;
  const opacity = num(o.opacity, 0, 1); if (opacity != null) opts.opacity = opacity;
  return Object.keys(opts).length ? [...c.map(frac), color, opts] : [...c.map(frac), color];
}

/** A model from a home file, checked and tidied (files can come from anywhere), or null if it is not one. */
export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object' || !/^my-[\w-]{1,60}$/.test(raw.id || '')) return null;
  const size = Array.isArray(raw.size) ? raw.size.slice(0, 3).map((v) => num(v, 0.01, 50)) : [];
  if (size.length !== 3 || size.some((v) => v == null)) return null;
  const parts = (Array.isArray(raw.parts) ? raw.parts : []).slice(0, MAX_PARTS).map(cleanPart).filter(Boolean);
  if (!parts.length) return null;
  const item = { id: raw.id, name: String(raw.name || 'My model').trim().slice(0, 60) || 'My model', cat: MY_CAT, size: size.map((v) => round(v)), parts, rev: Math.max(1, Math.floor(num(raw.rev, 1, 1e9, 1))) };
  const z = num(raw.z, -5, 10); if (z) item.z = round(z);
  const lz = num(raw.light?.z, -5, 10); if (lz != null) item.light = { z: round(lz) };
  return item;
}
/** A home's models, checked (unknown or broken entries dropped, one per id). */
export function cleanCatalog(list) {
  const seen = new Set(), out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const item = cleanItem(raw);
    if (item && !seen.has(item.id) && out.length < MAX_ITEMS) { seen.add(item.id); out.push(item); }
  }
  return out;
}

/**
 * A placed object turned back into a model: its parts as fractions of its box. Placed parts are stored
 * unturned (the angle is kept apart, in `rotation`), so the model faces the usual way: back to the north.
 * `light` = the object's light fixture, if it has one.
 */
export function itemFromObject(o, name, light = null, id = uid('my'), rev = 1) {
  const [x0, y0, z0] = o.bounds.min, [x1, y1, z1] = o.bounds.max;
  const w = x1 - x0 || 1, d = y1 - y0 || 1, h = z1 - z0 || 1;
  const parts = o.parts.map((p) => {
    const opts = {};
    if (p.shape) opts.shape = p.shape;
    if (p.radius) opts.radius = p.radius;
    if (p.opacity != null) opts.opacity = p.opacity;
    return [(p.min[0] - x0) / w, (p.min[1] - y0) / d, (p.min[2] - z0) / h, (p.max[0] - x0) / w, (p.max[1] - y0) / d, (p.max[2] - z0) / h, p.color, opts];
  });
  return cleanItem({ id, name, size: [w, d, h], z: z0, light: light?.position ? { z: light.position[2] - z0 } : undefined, parts, rev });
}

/** Every placed copy of a model, on every level of the home: [{ L, o }]. */
export function copiesOf(home, id) {
  const out = [];
  for (const L of home.levels || []) for (const o of L.objects || []) if (o.kind === id) out.push({ L, o });
  return out;
}
