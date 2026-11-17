// The model maker (phase 2 of My models): make or change a model of your own from boxes and cylinders,
// with a 3D view to turn around and tap parts in. Works on a draft in metres (see mymodels.js); saving
// hands back a checked model item. One graphics context, drawn only when something changes (wall tablets).
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { h, nodes, icon, seg, numField, textField } from './ui.js';
import { MAX_DRAFT_PARTS, draftSize, fromDraft, duplicatePart, mirrorPart, legsUnder, scaleDraft } from './mymodels.js';

const SHAPES = [['box', 'Box'], ['round', 'Rounded'], ['cylinder', 'Cylinder']];
const shapeOf = (p) => (p.shape === 'cylinder' ? 'cylinder' : p.radius ? 'round' : 'box');
const shapeName = { box: 'Box', round: 'Rounded box', cylinder: 'Cylinder' };
const toCm = (v) => Math.round(v * 1000) / 10;
const toM = (v) => Math.round(v * 10) / 1000;

/**
 * Open the maker. `draft`: what to start from. `onSave(item)` gets the finished model; `id`/`rev` keep a model's
 * identity when it is being changed. Leaving with unsaved changes asks first.
 */
export function openModelMaker({ draft, id, rev = 1, title = 'Model maker', onSave }) {
  let dr = structuredClone(draft), sel = dr.parts.length ? 0 : -1, step = 1, dirty = false;
  const past = [], future = [];
  const snapTo = (cmv) => Math.round(cmv / step) * step;
  /** Every change goes through here, so it can be undone. */
  const change = (fn, { refit = false } = {}) => {
    const before = JSON.stringify({ dr, sel });
    fn(dr);
    if (JSON.stringify({ dr, sel }) === before) return; // nothing changed (a field left without a new value): no undo step
    past.push(before); if (past.length > 80) past.shift();
    future.length = 0;
    dirty = true;
    redraw(refit);
  };
  const back = (from, to) => { if (!from.length) return; to.push(JSON.stringify({ dr, sel })); ({ dr, sel } = JSON.parse(from.pop())); dirty = true; redraw(); };

  const side = h('div', { class: 'mm-side' });
  const viewHost = h('div', { class: 'mm-view', 'aria-label': '3D view of the model: drag to turn it, tap a part to choose it' });
  const view = preview(viewHost, (i) => { sel = i; redraw(); });
  const wrap = h('div', { class: 'modal-wrap mm-wrap' }, h('div', { class: 'modal modelmaker', role: 'dialog', 'aria-label': title },
    h('div', { class: 'panel-head' }, h('h2', {}, title), h('button', { class: 'round small', 'aria-label': 'Close', onclick: () => leave() }, icon('close'))),
    h('div', { class: 'mm-main' }, h('div', { class: 'mm-left' }, viewHost,
      h('div', { class: 'btns mm-viewbtns' },
        h('button', { class: 'chip small', onclick: () => view.fit(dr) }, icon('expand'), 'Fit view'),
        h('button', { class: 'chip small', 'aria-label': 'Undo', onclick: () => back(past, future) }, icon('undo')),
        h('button', { class: 'chip small', 'aria-label': 'Redo', onclick: () => back(future, past) }, icon('redo')))), side)));
  document.getElementById('app').append(wrap);
  const close = () => { view.dispose(); wrap.remove(); };
  const leave = () => { if (!dirty || confirm('Leave the model maker without saving your changes?')) close(); };
  const save = () => {
    const item = fromDraft(dr, id, rev);
    if (!item) return void alert('The model needs at least one part with a width, depth and height.');
    if (onSave(item) !== false) close();
  };

  function partFields(p) {
    const set = (fn) => change(() => fn(p));
    const pos = (k, label) => numField(label, toCm(p.min[k]), (v) => set(() => { const w = p.max[k] - p.min[k]; p.min[k] = toM(snapTo(v)); p.max[k] = toM(toCm(p.min[k] + w)); }), { step, min: -1000, max: 5000, unit: 'cm' });
    const len = (k, label) => numField(label, toCm(p.max[k] - p.min[k]), (v) => set(() => { p.max[k] = toM(toCm(p.min[k]) + Math.max(0.5, snapTo(v))); }), { step, min: 0.5, max: 5000, unit: 'cm' });
    const shape = shapeOf(p);
    return [
      h('div', { class: 'row' }, h('div', { class: 'row-label' }, 'Shape'), seg(SHAPES, shape, (v) => set(() => {
        delete p.shape; delete p.radius;
        if (v === 'cylinder') p.shape = 'cylinder';
        if (v === 'round') p.radius = toM(Math.max(1, Math.min(5, toCm(Math.min(...[0, 1, 2].map((k) => p.max[k] - p.min[k]))) / 4)));
      }))),
      h('div', { class: 'fields' }, pos(0, 'From the left'), pos(1, 'From the back'), pos(2, 'Off the floor'), len(0, 'Width'), len(1, 'Depth'), len(2, 'Height')),
      h('div', { class: 'fields' },
        shape === 'round' ? numField('Rounding', toCm(p.radius), (v) => set(() => { p.radius = toM(Math.max(0.1, v)); }), { step: 0.5, min: 0.1, max: 100, unit: 'cm' }) : null,
        numField('See-through', p.opacity == null ? 0 : Math.round((1 - p.opacity) * 100), (v) => set(() => { if (v <= 0) delete p.opacity; else p.opacity = Math.round(100 - Math.min(95, v)) / 100; }), { step: 5, min: 0, max: 95, unit: '%' }),
        h('label', { class: 'field' }, h('span', {}, 'Colour'), h('span', { class: 'colbtn' }, h('input', { type: 'color', value: p.color, 'aria-label': 'Colour of this part', onchange: (e) => set(() => { p.color = e.target.value; }) })))),
      h('div', { class: 'btns mm-tools' },
        h('button', { class: 'chip small', onclick: () => change(() => { sel = duplicatePart(dr, sel); }), disabled: dr.parts.length >= MAX_DRAFT_PARTS }, icon('copy'), 'Duplicate'),
        h('button', { class: 'chip small', onclick: () => change(() => { sel = mirrorPart(dr, sel); }), disabled: dr.parts.length >= MAX_DRAFT_PARTS }, icon('rotate'), 'Mirror copy'),
        h('button', { class: 'chip small', title: 'Four legs from the floor up to the underside of this part', onclick: () => change(() => legsUnder(dr, sel)), disabled: p.min[2] < 0.02 || dr.parts.length > MAX_DRAFT_PARTS - 4 }, icon('plus'), 'Legs under it'),
        h('button', { class: 'chip small danger', onclick: () => change(() => { dr.parts.splice(sel, 1); sel = Math.min(sel, dr.parts.length - 1); }) }, icon('trash'), 'Delete')),
    ];
  }

  function redraw(refit = false) {
    view.update(dr, sel, refit);
    const size = draftSize(dr), p = dr.parts[sel];
    const add = (shape) => change(() => {
      const [w, d] = size, s = 0.3;
      dr.parts.push({ min: [toM(toCm(w / 2 - s / 2)), toM(toCm(Math.max(0, d / 2 - s / 2))), 0], max: [toM(toCm(w / 2 + s / 2)), toM(toCm(Math.max(0, d / 2 - s / 2) + s)), s], color: '#cfc8bd', ...(shape ? { shape } : {}) });
      sel = dr.parts.length - 1;
    });
    const full = dr.parts.length >= MAX_DRAFT_PARTS;
    side.replaceChildren(...nodes(
      textField('Name', dr.name, (v) => change(() => { dr.name = v || 'My model'; })),
      h('h3', {}, 'The whole model'),
      dr.parts.length ? h('div', { class: 'fields' },
        ...['Width', 'Depth', 'Height'].map((label, k) => numField(label, toCm(size[k]), (v) => change(() => scaleDraft(dr, k, toM(Math.max(1, v))), { refit: true }), { step, min: 1, max: 5000, unit: 'cm' })),
        numField('Placed at height', toCm(dr.z || 0), (v) => change(() => { dr.z = toM(v); }), { step, min: -500, max: 1000, unit: 'cm' })) : null,
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!dr.light, onchange: (e) => change(() => { dr.light = e.target.checked ? { z: toM(toCm(size[2] * 0.8)) } : null; }) }), 'It is a light (it can glow and be connected to a light)'),
      dr.light ? numField('Bulb height in the model', toCm(dr.light.z), (v) => change(() => { dr.light.z = toM(v); }), { step, min: -500, max: 1000, unit: 'cm' }) : null,
      h('div', { class: 'row' }, h('div', { class: 'row-label' }, 'Numbers snap to'), seg([[1, '1 cm'], [5, '5 cm']], step, (v) => { step = v; redraw(); })),
      h('h3', {}, `Parts (${dr.parts.length}${full ? ', the most a model can have' : ''})`),
      h('div', { class: 'mm-parts' }, dr.parts.map((q, i) => h('button', { class: 'chip small' + (i === sel ? ' on' : ''), onclick: () => { sel = i; redraw(); } },
        h('span', { class: 'mm-swatch', style: `background:${q.color}` }), `${i + 1} · ${shapeName[shapeOf(q)]}`))),
      h('div', { class: 'btns' },
        h('button', { class: 'wide', onclick: () => add(null), disabled: full }, icon('plus'), 'Box'),
        h('button', { class: 'wide', onclick: () => add('cylinder'), disabled: full }, icon('plus'), 'Cylinder')),
      p ? [h('h3', {}, `Part ${sel + 1}`), ...partFields(p)] : h('p', { class: 'hint' }, 'Add a box or a cylinder to start.'),
      h('div', { class: 'btns mm-foot' },
        h('button', { class: 'wide ghost', onclick: () => leave() }, 'Cancel'),
        h('button', { class: 'wide primary', onclick: save }, icon('check'), 'Save model'))));
  }
  redraw(true);
}

/** The 3D view: the draft drawn with the same shapes as the plan, turned by dragging, a tap chooses a part. */
function preview(host, onPick) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.append(renderer.domElement);
  const scene = new THREE.Scene(), group = new THREE.Group();
  const sun = new THREE.DirectionalLight('#fff4e6', 2.2);
  sun.position.set(-2, 5, 4);
  scene.add(new THREE.HemisphereLight('#ffffff', '#8c8378', 2.1), sun, group);
  const grid = new THREE.GridHelper(6, 60, '#9a958c', '#cfcac2');
  grid.material.transparent = true; grid.material.opacity = 0.5;
  scene.add(grid);
  const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.maxPolarAngle = Math.PI * 0.495;
  const draw = () => renderer.render(scene, cam);
  controls.addEventListener('change', draw);
  let meshes = [], fitted = false;
  const size = () => { const w = host.clientWidth || 300, hh = host.clientHeight || 300; renderer.setSize(w, hh, false); cam.aspect = w / hh; cam.updateProjectionMatrix(); draw(); };
  const ro = new ResizeObserver(size);
  ro.observe(host);

  const clear = () => { for (const o of [...group.children]) { o.traverse((x) => { x.geometry?.dispose(); x.material?.dispose?.(); }); group.remove(o); } meshes = []; };
  const centre = (dr) => { const b = new THREE.Box3(); for (const m of meshes) b.expandByObject(m); return b.isEmpty() ? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)) : b; };
  function fit(dr) {
    const b = centre(dr), mid = b.getCenter(new THREE.Vector3()), rad = Math.max(0.3, b.getSize(new THREE.Vector3()).length() / 2);
    controls.target.copy(mid);
    cam.position.copy(mid).add(new THREE.Vector3(0.6, 0.55, 1).normalize().multiplyScalar(rad / Math.sin((cam.fov * Math.PI) / 360) * 1.15));
    cam.near = rad / 100; cam.far = rad * 100; cam.updateProjectionMatrix();
    controls.update();
    draw();
  }
  function update(dr, sel, refit) {
    clear();
    // Stand the model on the grid, centred: x → x, y (to the front) → z, z (up) → y.
    const xs = dr.parts.flatMap((p) => [p.min[0], p.max[0]]), ys = dr.parts.flatMap((p) => [p.min[1], p.max[1]]);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    dr.parts.forEach((p, i) => {
      const w = p.max[0] - p.min[0], d = p.max[1] - p.min[1], hh = p.max[2] - p.min[2];
      if (w <= 0 || d <= 0 || hh <= 0) return;
      let geo;
      if (p.shape === 'cylinder') { geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); geo.scale(w, hh, d); }
      else if (p.radius) geo = new RoundedBoxGeometry(w, hh, d, 3, Math.min(p.radius, w / 2, d / 2, hh / 2) * 0.999);
      else geo = new THREE.BoxGeometry(w, hh, d);
      const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.8, transparent: p.opacity != null, opacity: p.opacity ?? 1,
        emissive: i === sel ? '#ff9a3c' : '#000000', emissiveIntensity: i === sel ? 0.12 : 0 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set((p.min[0] + p.max[0]) / 2 - cx, (p.min[2] + p.max[2]) / 2, (p.min[1] + p.max[1]) / 2 - cy);
      m.userData.part = i;
      group.add(m);
      meshes.push(m);
      if (i === sel) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: '#e07b16', depthTest: false, transparent: true }));
        edges.renderOrder = 2;
        m.add(edges);
      }
    });
    if (refit || !fitted) { fitted = true; fit(dr); } else draw();
  }
  // A tap (not a drag) on a part chooses it.
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) onPick(hit.object.userData.part);
  });
  return {
    update, fit,
    dispose: () => { ro.disconnect(); controls.dispose(); clear(); renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove(); },
  };
}
