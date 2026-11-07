import * as THREE from 'three';
import { profile, islands } from './data.js';

// ─────────────────────────────────────────────────────────────────────────────
// THE CREATIVE ARCHIPELAGO
// Change the written content in data.js. Everything below builds the little 3D world.
// ─────────────────────────────────────────────────────────────────────────────
const $ = (selector) => document.querySelector(selector);
const worldEl = $('#world');
const labelContainer = $('#worldLabels');
const panel = $('#islandPanel');
const about = $('#aboutOverlay');
const islandMap = new Map(islands.map((island) => [island.id, island]));
const interactiveMeshes = [];
const waveDetails = [];
const hoverLabels = new Map();
const clock = new THREE.Clock();
const TAU = Math.PI * 2;
const SEA_LEVEL = -0.58;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let seaMaterial;
const wakeSparks = [];

// The ship and water shader use the same wave shape so the hull rides the swells.
function seaHeight(x, z, time) {
  const a = x * .37 + z * .13 - time * 1.07;
  const b = x * .14 - z * .32 + time * .8;
  const c = (x + z) * .68 - time * 1.9;
  return Math.sin(a) * .15 + Math.sin(b) * .095 + Math.sin(c) * .055;
}
const tmpVec = new THREE.Vector3();
const keys = new Set();
const startPosition = new THREE.Vector3(-1.3, 0, 10.7);
let boat;
let boatVisual;
let boatVelocity = 0;
let boatHeading = -0.1;
let route = null;
let selectedId = null;
let currentPanelId = null;
let scene, camera, renderer, raycaster, pointer;
let size = { width: innerWidth, height: innerHeight };
let zoom = 1;
let toastTimeout;
let elapsed = 0;
let cameraLook = new THREE.Vector3(0, 0, 0);
const cameraDirection = new THREE.Vector3(27, 36, 45).normalize();
const selectable = [];

// Seeded variation so the islands look the same after every page load.
function random(seed) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 4294967296);
}
const rng = random(23978);
const rand = (min, max) => min + rng() * (max - min);
const choose = (list) => list[Math.floor(rng() * list.length)];
const color = (hex) => new THREE.Color(hex);

function material(hex, options = {}) {
  return new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...options });
}
function mesh(geometry, mat, x = 0, y = 0, z = 0, parent = scene) {
  const object = new THREE.Mesh(geometry, mat);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}
function box(parent, w, h, d, tint, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), material(tint), x, y, z, parent);
}
function cylinder(parent, top, bottom, height, tint, x = 0, y = 0, z = 0, segments = 8) {
  return mesh(new THREE.CylinderGeometry(top, bottom, height, segments), material(tint), x, y, z, parent);
}
function cone(parent, radius, height, tint, x = 0, y = 0, z = 0, sides = 6) {
  return mesh(new THREE.ConeGeometry(radius, height, sides), material(tint), x, y, z, parent);
}
function sphere(parent, radius, tint, x = 0, y = 0, z = 0, width = 7, height = 5) {
  return mesh(new THREE.SphereGeometry(radius, width, height), material(tint), x, y, z, parent);
}
function flatCircle(parent, radius, tint, x = 0, y = 0, z = 0, segments = 16) {
  const circle = mesh(new THREE.CircleGeometry(radius, segments), material(tint, { side: THREE.DoubleSide }), x, y, z, parent);
  circle.rotation.x = -Math.PI / 2;
  circle.castShadow = false;
  return circle;
}

function addTriangle(positions, colors, a, b, c, tint) {
  const col = color(tint);
  for (const point of [a, b, c]) {
    positions.push(point[0], point[1], point[2]);
    colors.push(col.r, col.g, col.b);
  }
}
function makeTerrain(radius, topY, bottomY, topPalette, sidePalette, noiseSeed = 0) {
  const randTerrain = random(1000 + noiseSeed);
  const edges = 13;
  const positions = [];
  const colors = [];
  const points = Array.from({ length: edges }, (_, i) => {
    const a = (i / edges) * TAU;
    const r = radius * (0.91 + randTerrain() * .15);
    return [Math.cos(a) * r, topY + (randTerrain() - .5) * .12, Math.sin(a) * r];
  });
  for (let i = 0; i < edges; i++) {
    const p = points[i];
    const q = points[(i + 1) % edges];
    const topTint = topPalette[i % topPalette.length];
    const sideTint = sidePalette[i % sidePalette.length];
    const pBottom = [p[0] * 1.075, bottomY, p[2] * 1.075];
    const qBottom = [q[0] * 1.075, bottomY, q[2] * 1.075];
    addTriangle(positions, colors, [0, topY, 0], q, p, topTint);
    addTriangle(positions, colors, p, q, pBottom, sideTint);
    addTriangle(positions, colors, q, qBottom, pBottom, sideTint);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
}
function addIslet(group, scale = 1, type = 'grass', seed = 1) {
  const colors = type === 'grass'
    ? { grass: ['#78b89b', '#83c4a0', '#78b394', '#92c9a2'], rock: ['#638988', '#5a8181', '#71938a'] }
    : { grass: ['#ebc992', '#f5d6a5', '#eacb93'], rock: ['#647b7e', '#57737a', '#6c8d8a'] };
  const stone = makeTerrain(5.0 * scale, -.23 * scale, -1.50 * scale, ['#748f87', '#647f80'], colors.rock, seed);
  const beach = makeTerrain(4.83 * scale, .08 * scale, -.25 * scale, ['#eed39d', '#e3bd85', '#f0d3a0'], ['#c39b70', '#dfb486'], seed + 2);
  const land = makeTerrain(3.84 * scale, .55 * scale, .06 * scale, colors.grass, ['#4b977f', '#65aa86', '#4c9b80'], seed + 4);
  scene.remove(stone, beach, land);
  group.add(stone, beach, land);
  group.userData.radius = 5.0 * scale;
  // Stones and shrubs along the coast make the silhouettes a little less regular.
  for (let i = 0; i < Math.ceil(11 * scale); i++) {
    const a = rand(0, TAU);
    const r = rand(3.55, 4.45) * scale;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (rng() < .52) {
      const stoneObj = sphere(group, rand(.18, .42) * scale, choose(['#d4d0ae', '#b5c5ad', '#98b5a8']), x, .27 * scale, z, 5, 4);
      stoneObj.scale.set(1.4, .7, 1);
    } else {
      sphere(group, rand(.18, .36) * scale, choose(['#5ea987', '#62a286', '#97cc9a']), x, .50 * scale, z, 5, 4);
    }
  }
}
function tree(parent, x, z, size = 1, variation = false) {
  const baseY = .58;
  const t = new THREE.Group();
  t.position.set(x, 0, z);
  parent.add(t);
  if (variation) {
    const trunk = cylinder(t, .11 * size, .14 * size, 1.5 * size, '#987451', 0, baseY + .68 * size, 0, 5);
    trunk.rotation.z = .12;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const frond = cone(t, .38 * size, 1.4 * size, choose(['#69b79a', '#70bd98', '#519c86']), Math.cos(a) * .40 * size, baseY + 1.63 * size, Math.sin(a) * .40 * size, 5);
      frond.rotation.z = Math.cos(a) * -.7;
      frond.rotation.x = Math.sin(a) * .7;
    }
  } else {
    cylinder(t, .10 * size, .14 * size, 1.1 * size, '#997752', 0, baseY + .55 * size, 0, 6);
    cone(t, .63 * size, 1.6 * size, choose(['#3c917f', '#51a286', '#4e9c8f', '#398479']), 0, baseY + 1.25 * size, 0, 6);
    cone(t, .48 * size, 1.27 * size, choose(['#4fae91', '#5aaf92', '#59b39b']), 0, baseY + 1.92 * size, 0, 6);
  }
  return t;
}
function addTrees(group, count = 9, clearCenter = 2.0, palm = false) {
  for (let i = 0; i < count; i++) {
    let x, z, tries = 0;
    do { x = rand(-3.1, 3.1); z = rand(-3.1, 3.1); tries++; }
    while (Math.hypot(x, z) < clearCenter && tries < 25);
    if (Math.hypot(x, z) > 3.5) continue;
    tree(group, x, z, rand(.7, 1.16), palm && rng() > .4);
  }
}
function addDock(group, from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  const ux = dx / distance;
  const uz = dz / distance;
  const angle = Math.atan2(ux, uz);
  const dock = new THREE.Group();
  dock.rotation.y = angle;
  group.add(dock);
  const start = 3.3;
  const end = Math.min(distance + .55, 7.5);
  for (let d = start; d < end; d += .49) {
    const plank = box(dock, 1.85, .18, .42, choose(['#ba8162', '#d19a70', '#dca77a']), 0, -.16, d);
    plank.rotation.y = rand(-.02,.02);
  }
  for (let d = start + .5; d < end; d += 1.7) {
    for (const x of [-.78, .78]) {
      cylinder(dock, .105, .12, .95, '#88634e', x, -.52, d, 6);
      cylinder(dock, .13, .13, .14, '#e5c69a', x, -.02, d, 6);
    }
  }
}
function castle(group) {
  box(group, 2.9, 1.55, 2.7, '#e5b69a', -.10, 1.33, -.25);
  box(group, 3.1, .18, 3.0, '#a85f64', -.10, 2.14, -.25);
  for (const x of [-1.5, 1.32]) {
    for (const z of [-1.46, .96]) {
      cylinder(group, .58, .69, 2.35, '#c4a5a0', x, 1.75, z, 7);
      cone(group, .86, 1.2, '#c67a72', x, 3.49, z, 7);
    }
  }
  box(group, .60, 1.07, .12, '#5c697e', 0, 1.10, 1.13);
  box(group, .70, .13, .10, '#ffdc9e', 0, 1.57, 1.20);
  cylinder(group, .06, .06, 1.58, '#e9e5d1', 0, 3.15, -1.1);
  const flag = box(group, .9, .47, .06, '#f5ad79', .48, 3.6, -1.10);
  flag.rotation.y = -.1;
  for (let i = 0; i < 4; i++) sphere(group, .26, '#f6c7a5', -2.3 + i * 1.5, .8, 2.5);
}
function techTower(group) {
  const base = cylinder(group, 2.1, 2.45, .45, '#7c97a4', 0, .84, 0, 8);
  base.rotation.y = .2;
  const core = cylinder(group, .95, 1.18, 2.8, '#5a718d', 0, 2.29, 0, 6);
  core.rotation.y = Math.PI / 6;
  cylinder(group, 1.26, 1.22, .33, '#c9dcda', 0, 3.86, 0, 7);
  cone(group, 1.3, 3.3, '#b0a3ec', 0, 5.58, 0, 5);
  cone(group, .7, 2.2, '#d9d6ff', 1.70, 2.05, .8, 5);
  cone(group, .60, 1.9, '#9db4ee', -1.9, 1.85, -.8, 5);
  cylinder(group, .09, .09, 2, '#eedfcb', -1.55, 3.2, 1.45, 5);
  sphere(group, .35, '#fde6ac', -1.55, 4.18, 1.45);
  for (let j = 0; j < 5; j++) {
    const x = rand(-1.1, 1.1);
    const z = rand(-1.0, 1.0);
    box(group, .16, .23, .04, '#d7e6f5', x, rand(1.4, 3.2), 1.01 + z * .1);
  }
}
function lighthouse(group) {
  cylinder(group, 1.02, 1.27, 3.5, '#f5e7ce', 0, 2.32, 0, 9);
  cylinder(group, 1.15, 1.2, .44, '#f1a0a0', 0, 2.0, 0, 9);
  cylinder(group, 1.12, 1.12, .38, '#f1a0a0', 0, 3.20, 0, 9);
  cylinder(group, 1.2, 1.16, .43, '#547c82', 0, 4.27, 0, 9);
  cylinder(group, .82, .86, .8, '#ffdc95', 0, 4.8, 0, 9);
  cylinder(group, 1.33, 1.17, .31, '#b76b6c', 0, 5.37, 0, 9);
  cone(group, 1.16, .95, '#ce7775', 0, 6.01, 0, 9);
  box(group, .46, 1.20, .07, '#5e7781', 0, 1.22, 1.25);
  for (let k = 0; k < 4; k++) box(group, .32, .44, .08, '#84a4a1', 0, 2.4 + k * .6, 1.04 - k * .09);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.55, .16, 7, 13), material('#ffede0'));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(2.0, .75, 1.4);
  group.add(ring);
}
function summit(group) {
  const mountains = [
    [-.9, -.3, 2.0, 4.8, '#8aa9a2'],
    [.95, .15, 1.75, 3.9, '#739898'],
    [0, -1.25, 1.5, 3.5, '#aac3ad'],
  ];
  for (const [x,z,r,h,tint] of mountains) {
    const m = cone(group, r, h, tint, x, .65 + h / 2, z, 5);
    m.rotation.y = .3;
    cone(group, r * .42, h * .38, '#f0f2e4', x, .65 + h * .84, z, 5);
  }
  for (let i = 0; i < 4; i++) {
    box(group, .65, .16, .85, choose(['#cb9b75', '#96a9b7', '#e2bc90', '#c1bdd2']), 1.2 + (i % 2) * .7, .69 + i * .18, 2.2 - Math.floor(i / 2) * .8);
  }
  cylinder(group, .05, .05, 1.18, '#916a50', 1.8, 1.24, -.8, 6);
  box(group, 1.05, .60, .08, '#f3dba4', 2.3, 1.62, -.8);
}
function lifesaver(group, x, z) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.46, .14, 9, 20), material('#fff4df'));
  ring.position.set(x, .72, z);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  group.add(ring);
  for (let i = 0; i < 4; i++) {
    const red = mesh(new THREE.TorusGeometry(.46, .155, 7, 4, Math.PI / 3), material('#e47775'), x, .72, z, group);
    red.rotation.x = Math.PI / 2;
    red.rotation.z = i * (Math.PI / 2);
  }
}
function certificationTower(group) {
  for (const x of [-.85,.85]) for (const z of [-.78,.78]) {
    box(group, .17, 2.4, .17, '#ad7c58', x, 1.65, z);
  }
  box(group, 2.30, .27, 2.10, '#d9a476', 0, 2.6, 0);
  for (const z of [-.87,.87]) box(group, 2.38, .15, .12, '#a97b53', 0, 3.48, z);
  box(group, 2.4, .24, 2.3, '#fae4b7', 0, 4.05, 0);
  cone(group, 1.8, 1.33, '#e8a87d', 0, 4.65, 0, 4).rotation.y = Math.PI / 4;
  cylinder(group, .045, .045, 2.55, '#f8e8cd', 1.05, 5.0, -.2, 6);
  box(group, 1.05, .62, .09, '#e2766f', 1.58, 5.84, -.2);
  box(group, .56, .18, .12, '#f8eee0', 1.75, 5.87, -.12);
  for (let j = 0; j < 4; j++) box(group, .62, .12, .20, '#ba8964', -1.5 - j * .15, .64 + j * .45, .38);
  lifesaver(group, 2.4, 2.0);
}
// The harbor still has a lighthouse, plus small details from real pool work.
function harborDetails(group) {
  // Lifeguard chair
  const chair = new THREE.Group();
  chair.position.set(-2.35, .5, -.65);
  group.add(chair);
  for (const x of [-.40,.40]) for (const z of [-.40,.40])
    box(chair,.12,1.55,.12,'#9f755d',x,.8,z);
  box(chair,1.1,.15,1.0,'#f1d5ac',0,1.55,0);
  box(chair,1.1,1.0,.12,'#f1d5ac',0,2.07,-.43);
  box(chair,1.3,.10,.24,'#db9a80',0,1.55,.51);
  // A tiny board with a pinboard / QA ticket silhouette.
  box(group,1.35,1.0,.12,'#e6d7b8',2.35,1.35,-.45);
  box(group,1.02,.13,.14,'#4e7a82',2.35,1.65,-.35);
  for (let row=0;row<2;row++)
    box(group,.7,.07,.14,row===0?'#e8a28c':'#7abca5',2.35,1.35-row*.23,-.32);
}
function addCoastalReef(group, type) {
  for (let i = 0; i < 9; i++) {
    const a = i * TAU / 9 + rand(-.24,.24);
    const distance = rand(4.4,5.0);
    const x = Math.cos(a) * distance;
    const z = Math.sin(a) * distance;
    const stone = sphere(group, rand(.2, .42), type === 'qa' ? '#f2baa7' : '#c7baa1', x, -.22, z, 5, 4);
    stone.scale.y = .46;
  }
}
function buildIsland(island, index) {
  const group = new THREE.Group();
  group.name = island.name;
  group.position.set(island.position.x, 0, island.position.z);
  group.userData.islandId = island.id;
  scene.add(group);
  addIslet(group, 1, 'grass', 100 + index * 70);
  addCoastalReef(group, island.id);
  if (island.id === 'games') { castle(group); addTrees(group, 8, 2.5); }
  if (island.id === 'software') { techTower(group); addTrees(group, 7, 2.6); }
  if (island.id === 'qa') { lighthouse(group); harborDetails(group); addTrees(group, 8, 2.7, true); }
  if (island.id === 'skills') { summit(group); addTrees(group, 7, 3.0); }
  if (island.id === 'certs') { certificationTower(group); addTrees(group, 9, 2.65, true); }
  addDock(group, island.position, island.dock);
  group.traverse((object) => {
    if (object.isMesh) {
      object.userData.islandId = island.id;
      interactiveMeshes.push(object);
    }
  });
  island.group = group;
  const label = document.createElement('button');
  label.className = 'world-label';
  label.innerHTML = `<span class="island-dot" style="background:${island.color}"></span><strong>${island.shortName}</strong><span class="label-arrow">↗</span>`;
  label.setAttribute('aria-label', `Sail to ${island.name}`);
  label.addEventListener('click', () => sailTo(island.id));
  labelContainer.appendChild(label);
  hoverLabels.set(island.id, label);
}
function buildHomePort() {
  const home = new THREE.Group();
  home.position.set(-4.6, 0, 14.7);
  scene.add(home);
  addIslet(home, .50, 'sand', 573);
  cylinder(home, .47, .6, 1.80, '#f2e4c8', 0, 1.03, -.2);
  cone(home, .7, .8, '#da8e7e', 0, 2.30, -.2);
  cylinder(home, .08, .09, 1.8, '#c89976', 1.0, 1.00, .7, 5);
  box(home, .75, .46, .08, '#fbe0a5', 1.4, 1.60, .7);
  tree(home, -1.0, -.9, .83, true);
  tree(home, 1.05, -.8, .7, true);
  // Small rocks in the sea near the starting harbor.
  for (let j=0;j<5;j++) {
    const b = sphere(scene, rand(.26, .47), '#89b6a6', -8.0+rand(-1.2,1.2), -.4, 17.7+rand(-.9,.9), 6, 4);
    b.scale.y=.55;
  }
}
function boatGeometry() {
  boat = new THREE.Group();
  boat.position.copy(startPosition);
  scene.add(boat);
  boatVisual = new THREE.Group();
  boat.add(boatVisual);
  // A little handcrafted hull, with a pointy bow and raised sides.
  const vertices = [
    [-.84,.35, .93], [.84,.35,.93], [.69,.36,-.87], [0,.36,-1.62], [-.69,.36,-.87],
    [-.57,-.24,.72], [.57,-.24,.72], [.45,-.23,-.81], [0,-.22,-1.3], [-.45,-.23,-.81]
  ];
  const indices = [];
  for(let i=0;i<5;i++) {
    const j=(i+1)%5;
    indices.push(i,j,5+i, j,5+j,5+i);
  }
  indices.push(0,1,2,0,2,3,0,3,4);
  const positions=[];
  indices.forEach(i => positions.push(...vertices[i]));
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.computeVertexNormals();
  mesh(geo, material('#b76555',{side:THREE.DoubleSide}),0,0,0,boatVisual);
  box(boatVisual, 1.30, .14, 1.70, '#f4cb8d', 0,.39,-.11);
  box(boatVisual, 1.55, .17, .20, '#f9ddad', 0,.46,.7);
  cylinder(boatVisual,.075,.095,3.15,'#8a5e50',0,1.98,.05,7);
  // Two cream sails: triangular 3D meshes, slightly translucent and double-sided.
  const sailMat=material('#fff2d6',{side:THREE.DoubleSide});
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    .08,3.40,.05, .10,.80,.05, 1.55,1.01,.05,
    -.09,2.95,.05, -.12,1.00,.05, -.95,1.25,.05,
  ],3));
  sailGeo.computeVertexNormals();
  mesh(sailGeo,sailMat,0,0,0,boatVisual);
  const mastFlag=box(boatVisual,.70,.36,.055,'#ffad7d',.38,3.47,.05);
  mastFlag.rotation.z=.10;
  box(boatVisual,.13,.10,.85,'#7b5551',0,.43,-1.04);
  // Wake trails are attached to the ship and pulse as it moves.
  for(let i=0;i<5;i++) {
    const trail = new THREE.Mesh(new THREE.TorusGeometry(.33+i*.13,.026,3,18,Math.PI*.92),
      new THREE.MeshBasicMaterial({color:'#d7f0de',transparent:true,opacity:.33,side:THREE.DoubleSide}));
    trail.rotation.x = -Math.PI/2;
    trail.rotation.z = -Math.PI/2;
    trail.position.set(0,-.48,1.35+i*.33);
    trail.userData.baseZ=trail.position.z;
    boat.add(trail);
    selectable.push(trail);
  }
}
function makeSea() {
  // A gently displaced surface with shifting normals, sun glints, and shallow-water foam.
  // It's not a heavy fluid simulation: these small waves keep the site fast on laptops.
  const coastTests = islands.map((island) =>
    `shore = min(shore, abs(length(vWorld.xz - vec2(${island.position.x.toFixed(2)}, ${island.position.z.toFixed(2)})) - 5.25));`
  ).join('\n');
  seaMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBoat: { value: new THREE.Vector2(startPosition.x, startPosition.z) },
      uWakeStrength: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2 uBoat;
      uniform float uWakeStrength;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vRipple;
      void main(){
        vec4 world = modelMatrix * vec4(position, 1.0);
        float a = world.x * .37 + world.z * .13 - uTime * 1.07;
        float b = world.x * .14 - world.z * .32 + uTime * .8;
        float c = (world.x + world.z) * .68 - uTime * 1.9;
        float h = sin(a)*.15 + sin(b)*.095 + sin(c)*.055;
        float dx = cos(a)*.0555 + cos(b)*.0133 + cos(c)*.0374;
        float dz = cos(a)*.0195 - cos(b)*.0304 + cos(c)*.0374;
        float dist = length(world.xz - uBoat);
        vRipple = uWakeStrength * exp(-dist*.53) * sin(dist*4.3 - uTime*9.0);
        h += vRipple*.11;
        world.y += h;
        vWorld = world.xyz;
        vNormal = normalize(vec3(-dx, 1.0, -dz));
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uBoat;
      uniform float uWakeStrength;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vRipple;
      void main(){
        vec3 normal = normalize(vNormal);
        vec3 lightDirection = normalize(vec3(-.42, 1.0, .36));
        vec3 viewDirection = normalize(cameraPosition - vWorld);
        float diff = max(dot(normal, lightDirection), 0.0);
        float spark = pow(max(dot(reflect(-lightDirection, normal), viewDirection), 0.0), 58.0);
        float slow = sin(vWorld.x*.12 + vWorld.z*.095 - uTime*.25) * .5 + .5;
        vec3 deep = vec3(.025,.255,.335);
        vec3 aqua = vec3(.065,.415,.453);
        vec3 water = mix(deep, aqua, .21 + slow*.35 + diff*.19);
        water += vec3(.54,.53,.34) * spark*.45;
        float shore = 200.0;
        ${coastTests}
        shore = min(shore, abs(length(vWorld.xz - vec2(-4.60, 14.70)) - 2.63));
        float waveFoam = 1.0 - smoothstep(.13, .71, shore);
        float broken = sin(vWorld.x*2.7 + vWorld.z*2.2 + uTime*2.25) * .5 + .5;
        float foam = waveFoam * (.38 + broken * .35);
        float shallow = 1.0 - smoothstep(.5, 3.7, shore);
        water = mix(water, vec3(.11,.52,.50), shallow*.16);
        water = mix(water, vec3(.72,.89,.76), foam*.51);
        float wakeDist = length(vWorld.xz - uBoat);
        float wakeFoam = uWakeStrength * exp(-wakeDist*.31) * (.5+.5*sin(wakeDist*4.3-uTime*9.0));
        water += vec3(.29,.47,.42) * wakeFoam*.16;
        float glitter = pow(max(0.0, sin(vWorld.x*4.3+uTime*1.9)*sin(vWorld.z*3.0-uTime*1.45)), 16.0);
        water += vec3(.30,.37,.30)*glitter*.11;
        gl_FragColor = vec4(water,1.0);
      }`,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
  const water = mesh(new THREE.PlaneGeometry(240, 240, 170, 170), seaMaterial, 0, SEA_LEVEL, 0);
  water.rotation.x = -Math.PI / 2;
  water.castShadow = false;
  water.receiveShadow = false;
  const waveMat = new THREE.LineBasicMaterial({color:'#d5f7e6',transparent:true,opacity:.27,depthWrite:false});
  for (let i = 0; i < 155; i++) {
    const x = rand(-62,62), z = rand(-62,62);
    if (islands.some(island => Math.hypot(island.position.x-x,island.position.z-z)<6.6)) continue;
    const length = rand(.6,1.8);
    const pts = [];
    for (let j=0; j<9; j++) {
      const t=j/8;
      pts.push(new THREE.Vector3((t-.5)*length, Math.sin(t*Math.PI)*.014, Math.sin(t*Math.PI)*.10));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), waveMat);
    line.position.set(x, SEA_LEVEL+.12, z);
    line.rotation.y = rand(-.45,.45);
    line.userData.offset = rand(0,TAU);
    line.userData.baseX = x;
    scene.add(line);
    waveDetails.push(line);
  }
  // Little submerged rocks, far away from the docks.
  for(let i=0;i<18;i++) {
    const x=rand(-46,48),z=rand(-42,44);
    if(islands.some(island=>Math.hypot(island.position.x-x,island.position.z-z)<6.5))continue;
    const rock=sphere(scene,rand(.13,.30),choose(['#8ab5a8','#91b6aa','#b7b99c']),x,-.44,z,5,4);
    rock.scale.y=.65;
  }
}
function addBuoys() {
  const spots=[[-3,-4],[5,1],[-3,5],[16,10],[-20,4],[2,-18]];
  for(const [x,z] of spots){
    const buoy=new THREE.Group(); buoy.position.set(x,-.33,z); scene.add(buoy);
    cylinder(buoy,.18,.28,.58,'#faad82',0,.17,0,6);
    cone(buoy,.24,.33,'#f6edd0',0,.62,0,6);
    cylinder(buoy,.035,.035,.6,'#8f7467',0,.98,0,5);
  }
}
function addClouds() {
  for(let i=0;i<15;i++){
    const cloud=new THREE.Group();
    cloud.position.set(rand(-52,52),rand(12,19),rand(-50,50));
    const count=3+Math.floor(rng()*3);
    for(let j=0;j<count;j++){
      const puff=sphere(cloud,rand(.95,1.7),'#f2f3dd',j*1.33,rand(-.1,.2),rand(-.6,.6),7,5);
      puff.scale.y=.57; puff.castShadow=false;
    }
    cloud.userData.floatPhase=rand(0,TAU);
    cloud.userData.baseY=cloud.position.y;
    scene.add(cloud);
    selectable.push(cloud);
  }
}
function initThree() {
  scene=new THREE.Scene();
  scene.background=color('#2d8795');
  scene.fog=new THREE.FogExp2('#2d8795',.009);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
  renderer.setSize(size.width,size.height);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.6;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label','Interactive three-dimensional scene of the portfolio islands');
  worldEl.appendChild(renderer.domElement);
  const ambient=new THREE.AmbientLight('#c2f5f5',2.05);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#ffe1ad',3.5);
  sun.position.set(-18,34,19);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-37;sun.shadow.camera.right=37;
  sun.shadow.camera.top=37;sun.shadow.camera.bottom=-37;
  sun.shadow.camera.near=.2;sun.shadow.camera.far=100;
  sun.shadow.bias=-.001;
  scene.add(sun);
  const light=new THREE.HemisphereLight('#ecf6ff','#416979',1.0);scene.add(light);
  camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,400);
  raycaster=new THREE.Raycaster();pointer=new THREE.Vector2();
  onResize();
  makeSea();
  islands.forEach(buildIsland);
  buildHomePort();
  addBuoys();
  addClouds();
  boatGeometry();
  updateCamera(1);
  renderer.domElement.addEventListener('pointerdown',onWorldPointerDown);
  renderer.domElement.addEventListener('pointermove',onWorldPointerMove);
  renderer.setAnimationLoop(animate);
}

function onResize() {
  size.width=worldEl.clientWidth || window.innerWidth;
  size.height=worldEl.clientHeight || window.innerHeight;
  if (!camera || !renderer) return;
  const portrait=size.width<700;
  const vertical=portrait?52:39;
  const aspect=size.width/size.height;
  camera.left=-vertical*aspect/2;
  camera.right=vertical*aspect/2;
  camera.top=vertical/2;
  camera.bottom=-vertical/2;
  camera.updateProjectionMatrix();
  renderer.setSize(size.width,size.height);
}
function updateCamera(delta=1/60) {
  if(!camera||!boat) return;
  const target=new THREE.Vector3(2.6,0,-.1);
  if(size.width<700){target.set(1.0,0,1.0);} // Keep a broader mobile overview.
  if(route || selectedId){
    target.x+=boat.position.x*.17;
    target.z+=boat.position.z*.14;
  }
  const smooth=Math.min(1,delta*2.25);
  cameraLook.lerp(target,smooth);
  camera.position.copy(cameraLook).addScaledVector(cameraDirection,65);
  camera.lookAt(cameraLook);
  const targetZoom=zoom * (panel.classList.contains('open')?1.04:1);
  camera.zoom=THREE.MathUtils.lerp(camera.zoom,targetZoom,Math.min(1,delta*2.4));
  camera.updateProjectionMatrix();
}
function updateLabels() {
  for(const island of islands){
    const label=hoverLabels.get(island.id);
    tmpVec.set(island.position.x,6.7,island.position.z).project(camera);
    const x=(tmpVec.x*.5+.5)*size.width;
    const y=(-tmpVec.y*.5+.5)*size.height;
    const behind=tmpVec.z>1||tmpVec.z< -1;
    const overlayed=x<365 && y>116 && size.width>800;
    const panelBlocking=panel.classList.contains('open')&&x>size.width-425;
    const hide=behind||x<4||x>size.width-4||y<80||y>size.height-65||overlayed||panelBlocking;
    label.style.left=`${x}px`;
    label.style.top=`${y}px`;
    label.classList.toggle('hidden',hide);
    label.classList.toggle('selected',selectedId===island.id);
  }
}
function animate() {
  const delta=Math.min(clock.getDelta(),.05);
  elapsed+=delta;
  if(route){
    route.progress=Math.min(1,route.progress+delta/route.duration);
    const t=route.progress;
    const smoothed=t*t*(3-2*t);
    const a=route.start, b=route.control, c=route.end;
    const px=(1-smoothed)**2*a.x + 2*(1-smoothed)*smoothed*b.x + smoothed**2*c.x;
    const pz=(1-smoothed)**2*a.z + 2*(1-smoothed)*smoothed*b.z + smoothed**2*c.z;
    const dx=2*(1-smoothed)*(b.x-a.x)+2*smoothed*(c.x-b.x);
    const dz=2*(1-smoothed)*(b.z-a.z)+2*smoothed*(c.z-b.z);
    boat.position.set(px,0,pz);
    const wanted=Math.atan2(-dx,-dz);
    boatHeading+=Math.atan2(Math.sin(wanted-boatHeading),Math.cos(wanted-boatHeading))*Math.min(1,delta*4.5);
    boatVelocity=Math.min(6,Math.hypot(dx,dz)*6*t*(1-t)/route.duration);
    if(t>=1){
      const arrived=route.destination;
      route=null;
      boatVelocity=0;
      setSeaStatus(arrived ? 'NOW DOCKED' : 'FREE TO EXPLORE');
      if(arrived) showIsland(arrived);
    }
  } else {
    let throttle=0;
    if(keys.has('w')||keys.has('arrowup')||keys.has('forward')) throttle+=1;
    if(keys.has('s')||keys.has('arrowdown')||keys.has('back')) throttle-=.65;
    if(keys.has('a')||keys.has('arrowleft')||keys.has('left')) boatHeading+=delta*1.7;
    if(keys.has('d')||keys.has('arrowright')||keys.has('right')) boatHeading-=delta*1.7;
    boatVelocity=THREE.MathUtils.lerp(boatVelocity,throttle*5.6,Math.min(1,delta*1.9));
    const nextX=boat.position.x-Math.sin(boatHeading)*boatVelocity*delta;
    const nextZ=boat.position.z-Math.cos(boatHeading)*boatVelocity*delta;
    const collision=islands.some((island)=>Math.hypot(nextX-island.position.x,nextZ-island.position.z)<3.6);
    const homeCollision=Math.hypot(nextX+4.6,nextZ-14.7)<1.5;
    if(!collision&&!homeCollision && Math.abs(nextX)<58 && Math.abs(nextZ)<58){
      boat.position.x=nextX;boat.position.z=nextZ;
    } else if(Math.abs(boatVelocity)>1) boatVelocity=0;
    if(Math.abs(boatVelocity)>.9&&!panel.classList.contains('open')){
      const close=islands.find((island)=>Math.hypot(boat.position.x-island.dock.x,boat.position.z-island.dock.z)<2.0);
      if(close&&selectedId!==close.id){selectedId=close.id;showIsland(close.id);}
    }
  }
  boat.rotation.y=boatHeading;
  const waveTime = reducedMotion ? 0 : elapsed;
  const forwardX=-Math.sin(boatHeading), forwardZ=-Math.cos(boatHeading);
  const rightX=Math.cos(boatHeading), rightZ=-Math.sin(boatHeading);
  const bx=boat.position.x, bz=boat.position.z;
  const front=seaHeight(bx+forwardX*1.1,bz+forwardZ*1.1,waveTime);
  const back=seaHeight(bx-forwardX*1.1,bz-forwardZ*1.1,waveTime);
  const right=seaHeight(bx+rightX*.75,bz+rightZ*.75,waveTime);
  const left=seaHeight(bx-rightX*.75,bz-rightZ*.75,waveTime);
  const waveAtShip=seaHeight(bx,bz,waveTime);
  boat.position.y=THREE.MathUtils.lerp(boat.position.y,waveAtShip,Math.min(1,delta*3));
  boatVisual.position.y=-.17;
  boatVisual.rotation.x=THREE.MathUtils.lerp(boatVisual.rotation.x,(front-back)/2.35,Math.min(1,delta*2));
  boatVisual.rotation.z=THREE.MathUtils.lerp(boatVisual.rotation.z,(right-left)/1.7 + Math.sin(waveTime*.55)*.009,Math.min(1,delta*2));
  if(seaMaterial){
    seaMaterial.uniforms.uTime.value=waveTime;
    seaMaterial.uniforms.uBoat.value.set(bx,bz);
    seaMaterial.uniforms.uWakeStrength.value=THREE.MathUtils.lerp(
      seaMaterial.uniforms.uWakeStrength.value,Math.min(1,Math.abs(boatVelocity)/5.6),Math.min(1,delta*2));
  }
  for(let i=0;i<5;i++){
    const wake=boat.children.find(o=>o.userData?.baseZ !== undefined && o.userData.baseZ===1.35+i*.33);
    if(wake)wake.material.opacity=.08+Math.abs(boatVelocity)*.27*Math.max(.2,(1-i/6));
  }
  waveDetails.forEach(w=>{w.position.y=SEA_LEVEL+.12+seaHeight(w.position.x,w.position.z,waveTime);w.position.x=w.userData.baseX+Math.sin(waveTime*.32+w.userData.offset)*.23;});
  selectable.forEach((obj)=>{
    if(obj.userData.baseY){obj.position.y=obj.userData.baseY+Math.sin(elapsed*.4+obj.userData.floatPhase)*.12;}
  });
  updateCamera(delta);
  updateLabels();
  renderer.render(scene,camera);
}
function onWorldPointerMove(e){
  const rectangle=renderer.domElement.getBoundingClientRect();
  pointer.x=((e.clientX-rectangle.left)/rectangle.width)*2-1;
  pointer.y=-((e.clientY-rectangle.top)/rectangle.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(interactiveMeshes,false).find(h=>h.object.userData.islandId);
  renderer.domElement.style.cursor=hit?'pointer':'grab';
}
function onWorldPointerDown(e) {
  if(e.button!==0) return;
  const rect=renderer.domElement.getBoundingClientRect();
  pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer,camera);
  const hit=raycaster.intersectObjects(interactiveMeshes,false).find(h=>h.object.userData.islandId);
  if(hit)sailTo(hit.object.userData.islandId);
}

function escapeHtml(raw) {
  return String(raw).replace(/[&<>"']/g, (char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
const icons={
 'gamepad-2': '<rect x="2" y="8" width="20" height="11" rx="4"/><path d="M7 12v5M4.5 14.5h5M16.5 13h.01M19 16h.01"/>',
 'code-2':'<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-15-2 22"/>',
 'briefcase':'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12c4 4 14 4 18 0"/>',
 'scan-search':'<path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3"/><circle cx="11" cy="11" r="4"/><path d="m14.2 14.2 4.3 4.3"/>',
 mountain:'<path d="m8 3 4 7 3-4 7 14H2L8 3Z"/><path d="m5 14 3-3 4 4"/>',
 award:'<circle cx="12" cy="8" r="5"/><path d="m8.5 12-2 9L12 18l5.5 3-2-9"/>'
};
function renderNavigation(){
  $('#introText').textContent=profile.intro;
  $('#destinationList').innerHTML=islands.map(island=>`
    <button class="destination" data-id="${island.id}" aria-label="Sail to ${escapeHtml(island.name)}">
      <span class="destination-num">${island.number}</span>
      <span class="destination-icon" style="background:${island.color}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[island.symbol]}</svg></span>
      <span class="destination-copy"><strong>${escapeHtml(island.name)}</strong><small>${escapeHtml(island.subtitle)}</small></span>
      <span class="destination-arrow" aria-hidden="true">↗</span>
    </button>`).join('');
  $('#destinationList').addEventListener('click',e=>{
    const button=e.target.closest('.destination');
    if(button)sailTo(button.dataset.id);
  });
  $('#aboutNote').textContent=profile.availability;
  const links=[];
  if(profile.email)links.push(`<a href="mailto:${encodeURIComponent(profile.email)}">✉ Email me</a>`);
  if(profile.github)links.push(`<a href="${escapeHtml(profile.github)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a>`);
  if(profile.linkedin)links.push(`<a href="${escapeHtml(profile.linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>`);
  if(profile.resume)links.push(`<a href="${escapeHtml(profile.resume)}" target="_blank" rel="noopener noreferrer">Résumé ↗</a>`);
  $('#contactLinks').innerHTML=links.join('');
}
function setSeaStatus(status){$('#seaStatus').textContent=status;}
function toast(message){
  clearTimeout(toastTimeout);
  const el=$('#toast');
  el.textContent=message;
  el.classList.add('show');
  toastTimeout=setTimeout(()=>el.classList.remove('show'),2400);
}
function clearPanel(){
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden','true');
  panel.inert=true;
  currentPanelId=null;
}
function sailTo(id){
  const island=islandMap.get(id);
  if(!island || !boat)return;
  closeAbout();
  clearPanel();
  selectedId=id;
  document.querySelectorAll('.destination').forEach(button=>button.classList.toggle('active',button.dataset.id===id));
  const start=boat.position.clone();
  const end=new THREE.Vector3(island.dock.x,0,island.dock.z);
  const distance=start.distanceTo(end);
  if(distance<1.1){showIsland(id);setSeaStatus('NOW DOCKED');return;}
  const mid=start.clone().lerp(end,.5);
  const drift=Math.min(3.4,distance*.15);
  const perpX=-(end.z-start.z)/distance;
  const perpZ=(end.x-start.x)/distance;
  mid.x+=perpX*drift;
  mid.z+=perpZ*drift;
  route={start,end,control:mid,destination:id,progress:0,duration:Math.max(1.65,Math.min(4.2,distance*.20))};
  boatVelocity=.9;
  setSeaStatus(`SAILING TO ${island.shortName.toUpperCase()}`);
  toast(`Setting sail to ${island.name} ⛵`);
}
function showIsland(id){
  const island=islandMap.get(id);
  if(!island)return;
  selectedId=id;
  currentPanelId=id;
  panel.style.setProperty('--island-color',island.color);
  $('#panelNumeral').textContent=`ISLAND ${island.number} / ${String(islands.length).padStart(2,'0')}`;
  $('#panelTag').textContent=island.tag;
  $('#panelTitle').textContent=island.name;
  $('#panelSubtitle').textContent=island.subtitle;
  $('#panelSummary').textContent=island.summary;
  $('#itemCount').textContent=String(island.items.length).padStart(2,'0');
  $('#projectList').innerHTML=island.items.map((item,index)=>`
    <article class="project-card ${index===0?'open':''}">
      <button class="project-trigger" aria-expanded="${index===0}" aria-label="${escapeHtml(item.title)} details">
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.type)}</small></span><span class="accordion-icon" aria-hidden="true">+</span>
      </button>
      <div class="project-preview"><p>${escapeHtml(item.description)}</p>
        <div class="chip-row">${item.chips.map(chip=>`<span class="chip">${escapeHtml(chip)}</span>`).join('')}</div>
        <div class="project-more">${escapeHtml(item.detail||'')}${item.url?`<div><a class="project-url" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">View project ↗</a></div>`:''}</div>
      </div>
    </article>`).join('');
  $('#projectList').querySelectorAll('.project-trigger').forEach(button=>button.addEventListener('click',()=>{
    const card=button.closest('.project-card');
    const expanded=card.classList.toggle('open');
    button.setAttribute('aria-expanded',String(expanded));
  }));
  const next=islands[(islands.findIndex(entry=>entry.id===id)+1)%islands.length];
  $('#nextIslandName').textContent=next.name;
  $('#nextIsland').dataset.next=next.id;
  panel.inert=false;
  panel.setAttribute('aria-hidden','false');
  panel.classList.add('open');
  panel.querySelector('.panel-scroll').scrollTop=0;
  document.querySelectorAll('.destination').forEach(button=>button.classList.toggle('active',button.dataset.id===id));
}
function openAbout(){
  clearPanel();
  about.classList.add('open');
  about.inert=false;
  about.setAttribute('aria-hidden','false');
  $('#aboutClose').focus();
}
function closeAbout(){
  about.classList.remove('open');
  about.inert=true;
  about.setAttribute('aria-hidden','true');
}
function cancelNavigation(){
  route=null;
  selectedId=null;
  clearPanel();
  setSeaStatus('FREE TO EXPLORE');
  document.querySelectorAll('.destination').forEach(button=>button.classList.remove('active'));
}
function wireUi(){
  $('#homeButton').addEventListener('click',()=>{
    cancelNavigation();
    closeAbout();
    const start=boat.position.clone(),end=startPosition.clone();
    if(start.distanceTo(end)>1) {
      const control=start.clone().lerp(end,.5);
      route={start,end,control,destination:null,progress:0,duration:2.4};
      setSeaStatus('RETURNING TO PORT');
    }
    toast('Heading back to the starting harbor');
  });
  $('#aboutButton').addEventListener('click',openAbout);
  $('#aboutClose').addEventListener('click',closeAbout);
  $('#aboutDismiss').addEventListener('click',closeAbout);
  $('#aboutBackdrop').addEventListener('click',closeAbout);
  $('#closePanel').addEventListener('click',clearPanel);
  $('#nextIsland').addEventListener('click',e=>sailTo(e.currentTarget.dataset.next));
  $('#zoomIn').addEventListener('click',()=>zoom=Math.min(1.65,zoom+.15));
  $('#zoomOut').addEventListener('click',()=>zoom=Math.max(.65,zoom-.15));
  $('#resetCamera').addEventListener('click',()=>{zoom=1;cancelNavigation();toast('Map view reset');});
  window.addEventListener('resize',onResize);
  window.addEventListener('keydown',e=>{
    const key=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();
    if((e.target instanceof HTMLElement)&&['INPUT','TEXTAREA'].includes(e.target.tagName))return;
    if(key==='escape'){closeAbout();clearPanel();return;}
    if(key>='1'&&key<='5'){sailTo(islands[Number(key)-1].id);return;}
    if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){
      if(route)cancelNavigation();
      keys.add(key);
    }
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>keys.clear());
  document.querySelectorAll('.touch-key').forEach(button=>{
    const key=button.dataset.steer;
    const press=e=>{e.preventDefault();if(route)cancelNavigation();keys.add(key);button.setPointerCapture(e.pointerId);};
    const release=e=>{e.preventDefault();keys.delete(key);};
    button.addEventListener('pointerdown',press);
    button.addEventListener('pointerup',release);
    button.addEventListener('pointercancel',release);
    button.addEventListener('lostpointercapture',()=>keys.delete(key));
  });
}

window.__ARCHIPELAGO_FALLBACK_DESTROY?.();
renderNavigation();
wireUi();
try {
  initThree();
  window.__ARCHIPELAGO_3D_READY = true;
  requestAnimationFrame(()=>setTimeout(()=>$('#loadingCover').classList.add('loaded'),450));
} catch (error) {
  console.error(error);
  $('#loadingCover').innerHTML=`<div style="max-width:360px;text-align:center;line-height:1.8;padding:20px"><h2>The sea needs WebGL 🌊</h2><p>Try opening this page in an up-to-date browser with hardware acceleration enabled.</p><small>${escapeHtml(error.message||'3D renderer unavailable')}</small></div>`;
}
