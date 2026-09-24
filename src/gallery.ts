// gallery.ts
// Route /galerie: alle Modelle und ihre Animationen nebeneinander - ohne
// Gelände, nur die Figuren, Tiere, Gebäude, Bäume, Vorkommen und Felder auf
// ruhigem Hintergrund. Gezeichnet mit demselben EntityRenderer wie im Spiel,
// die Bewegungen laufen in Schleifen. Ziehen verschiebt, das Mausrad zoomt.

import {
  ANIMAL_POSE, BUILDING_HEADING, EntityRenderer, FALL_LYING, POSE, SHAPE, millMotion, type EntityInstance,
} from './gl/entityRenderer';
import { groundToWorld, snapCamera, worldToScreen, type IsoView } from './gl/iso';
import { ANIMALS, BUILDINGS, CROPS, FIELD_ROWS, VILLAGER, type AnimalKind, type CropType } from './world/buildings';

type RGB = [number, number, number];

/** Ein Ausstellungsstück: Beschriftung und was zur Zeit t (Sekunden) zu sehen ist. */
interface Exhibit {
  label: string;
  /** Instanzen um (x, y) - die Mitte des Stücks in Welt-Tiles. */
  draw(t: number, x: number, y: number, out: EntityInstance[]): void;
}

const PLAYER: RGB = [64, 160, 72];
const WOOD: RGB = [72, 52, 28];

/** Wiederholt 0..1 alle `period` Sekunden. */
const loop = (t: number, period: number) => (t % period) / period;

/**
 * Figuren und Tiere sind in echter Größe neben den Gebäuden winzig - in der
 * Galerie dreimal so groß, damit man die Bewegungen sieht.
 */
const ZOOMED = 3;

/** Figur: Dorfbewohner(in) in einer Pose, `rate` = Phase je Sekunde. */
function figure(label: string, female: boolean, pose: number, rate: number, heading: number, load = 0): Exhibit {
  return {
    label,
    draw: (t, x, y, out) => out.push({
      x: x - 0.5, y: y - 0.5, size: VILLAGER.size * ZOOMED, color: PLAYER,
      shape: female ? SHAPE.villagerFemale : SHAPE.villager, alpha: 1,
      motion: [heading, pose === POSE.stand ? t : t * rate, pose, load], accent: WOOD,
    }),
  };
}

/** Tier in einer Pose - Gehen und Fliehen im Takt seiner Schritte. */
function animal(kind: AnimalKind, label: string, pose: number): Exhibit {
  const def = ANIMALS[kind];
  const speed = pose === ANIMAL_POSE.flee ? def.flee : def.walk;
  const stride = def.stride * (pose === ANIMAL_POSE.flee ? 2 : 1);
  return {
    label,
    draw: (t, x, y, out) => out.push({
      x: x - 0.5, y: y - 0.5, size: def.height * ZOOMED, color: PLAYER, shape: def.shape, alpha: 1,
      motion: [-Math.PI / 4, pose === ANIMAL_POSE.walk || pose === ANIMAL_POSE.flee ? t * speed * Math.PI * 2 / stride : t, pose, 0],
    }),
  };
}

/** Gebäude oder anderes Modell, still (Mühlen drehen von selbst). */
function model(label: string, shape: number, size: number, motion?: [number, number, number, number]): Exhibit {
  return {
    label,
    draw: (_t, x, y, out) => out.push({ x: x - 0.5, y: y - 0.5, size, color: PLAYER, shape, alpha: 1, motion }),
  };
}

/** Einsturz beim Abriss, in einer Schleife: stehen, zusammensacken, stehen. */
function collapse(label: string, shape: number, size: number): Exhibit {
  return {
    label,
    draw: (t, x, y, out) => {
      const f = loop(t, 4);
      const c = f < 0.3 ? 0 : f < 0.7 ? (f - 0.3) / 0.4 : 1;
      out.push({ x: x - 0.5, y: y - 0.5, size, color: PLAYER, shape, alpha: f > 0.9 ? 1 - (f - 0.9) * 10 : 1,
        motion: [BUILDING_HEADING, 0, 0, Math.max(0.001, c * c * (3 - 2 * c))] });
    },
  };
}

/** Baum, der gefällt wird: umkippen wie im Spiel, dann von der Spitze her absägen. */
function felling(label: string, shape: number): Exhibit {
  return {
    label,
    draw: (t, x, y, out) => {
      const s = t % 9;
      const angle = s < 1 ? 0 : s < 2.1 ? FALL_LYING * ((s - 1) / 1.1) ** 2
        : s < 2.45 ? FALL_LYING - 0.14 * Math.sin((Math.PI * (s - 2.1)) / 0.35) : FALL_LYING;
      const share = s < 3 ? 1 : Math.max(0, 1 - (s - 3) / 5);
      out.push({ x: x - 0.5, y: y - 0.5, size: 0.6, color: [42, 97, 52], shape, alpha: 1,
        motion: [0.4, share > 0 ? angle : 0, -Math.PI * 0.75, share] });
    },
  };
}

/** Vorkommen, das abgebaut wird und wiederkommt (Felsen schrumpfen, Beeren verschwinden). */
function depleting(label: string, shape: number, size: number, color: RGB, shrinks: boolean): Exhibit {
  return {
    label,
    draw: (t, x, y, out) => {
      const f = loop(t, 6);
      const share = f < 0.15 ? 1 : f < 0.8 ? 1 - (f - 0.15) / 0.65 : (f - 0.8) / 0.2;
      out.push({ x: x - 0.5, y: y - 0.5, size: shrinks ? size * (0.45 + 0.55 * share) : size, color, shape, alpha: 1,
        motion: [0.7, 0, 0, share] });
    },
  };
}

/** Feld, in einer Schleife: säen, wachsen, reifen, ernten - Furche für Furche. */
function field(crop: CropType): Exhibit {
  return {
    label: `${CROPS[crop].label}feld`,
    draw: (t, x, y, out) => {
      const f = loop(t, 16);
      for (let row = 0; row < FIELD_ROWS; row++) {
        // Säen und Ernten laufen je Furche etwas versetzt.
        const lag = row / FIELD_ROWS * 0.05;
        const stage = f < 0.15 ? 1 + Math.min(1, Math.max(0, (f - lag) / 0.1))
          : f < 0.6 ? 2 + (f - 0.15) / 0.45 : 3;
        const share = f < 0.7 ? 1 : Math.max(0, 1 - (f - 0.7 - lag) / 0.25);
        out.push({ x: x - 0.5, y: y - 0.5, size: BUILDINGS.farm.size, color: PLAYER, shape: CROPS[crop].shape + row, alpha: 1,
          motion: [row, stage, share, 511], accent: [0, 0, 0] });
      }
    },
  };
}

/**
 * Die Reihen der Galerie, von oben nach unten. `gap`: Abstand der Stücke,
 * `depth`: Platz bis zur nächsten Reihe (Tiles) - hohe Modelle brauchen mehr.
 */
const ROWS: { title: string; gap: number; depth: number; items: Exhibit[] }[] = [
  {
    title: 'Dorfbewohner', gap: 2.7, depth: 3.2,
    items: [false, true].flatMap((female) => {
      const who = female ? 'Frau' : 'Mann';
      const walkRate = VILLAGER.speed * Math.PI * 2 / 0.6;
      return [
        figure(`${who} · steht`, female, POSE.stand, 1, Math.PI * 0.25),
        figure(`${who} · geht`, female, POSE.walk, walkRate, -Math.PI / 4),
        figure(`${who} · trägt`, female, POSE.walk, walkRate, -Math.PI / 4, 1),
        figure(`${who} · hackt`, female, POSE.work, 6, 0.3),
        figure(`${who} · pflückt`, female, POSE.pick, 6, 0.3),
        figure(`${who} · mäht`, female, POSE.scythe, 6, 0.3),
      ];
    }),
  },
  {
    title: 'Tiere', gap: 2.4, depth: 3.4,
    items: (Object.keys(ANIMALS) as AnimalKind[]).flatMap((kind) => [
      animal(kind, `${ANIMALS[kind].label} · äst`, ANIMAL_POSE.graze),
      animal(kind, `${ANIMALS[kind].label} · geht`, ANIMAL_POSE.walk),
      animal(kind, `${ANIMALS[kind].label} · flieht`, ANIMAL_POSE.flee),
      animal(kind, `${ANIMALS[kind].label} · erlegt`, ANIMAL_POSE.dead),
    ]),
  },
  {
    title: 'Gebäude', gap: 2.9, depth: 4.4,
    items: [
      model('Hauptgebäude', SHAPE.townCenter, BUILDINGS.town_center.size),
      ...[SHAPE.house, SHAPE.house2, SHAPE.house3, SHAPE.house4].map((s, i) => model(`Haus ${i + 1}`, s, BUILDINGS.house.size)),
      model('Minenlager', SHAPE.miningCamp, BUILDINGS.mine.size),
      model('Sammelpunkt', SHAPE.rallyFlag, 0.54),
      collapse('Abriss', SHAPE.house, BUILDINGS.house.size),
    ],
  },
  {
    title: 'Mühlen und Holzlager', gap: 2.4, depth: 5.2,
    items: [
      ...[SHAPE.mill, SHAPE.mill2, SHAPE.mill3, SHAPE.mill4].map((s, i) => model(`Mühle ${i + 1}`, s, BUILDINGS.forager.size, millMotion(i, 7))),
      ...[SHAPE.lumberCamp, SHAPE.lumberCamp2, SHAPE.lumberCamp3, SHAPE.lumberCamp4].map((s, i) => model(`Holzlager ${i + 1}`, s, BUILDINGS.lumberjack.size)),
    ],
  },
  {
    title: 'Bäume', gap: 2.6, depth: 3.2,
    items: [
      ...([['Fichte', SHAPE.tree], ['Kiefer', SHAPE.treePine], ['Eiche', SHAPE.treeOak], ['Junge Eiche', SHAPE.treeOakYoung],
        ['Alte Eiche', SHAPE.treeOakOld], ['Birke', SHAPE.treeBirch], ['Ahorn', SHAPE.treeMaple], ['Pappel', SHAPE.treePoplar]] as [string, number][])
        .map(([label, s]) => model(label, s, 0.6, [0.4, 0, 0, 1])),
      felling('Eiche · gefällt', SHAPE.treeOak),
      felling('Fichte · gefällt', SHAPE.tree),
    ],
  },
  {
    title: 'Vorkommen', gap: 2.4, depth: 4.6,
    items: [
      ...[SHAPE.stoneRock, SHAPE.stoneRock2, SHAPE.stoneRock3].map((s, i) => depleting(`Stein ${i + 1}`, s, 0.6, [158, 158, 164], true)),
      ...[SHAPE.goldRock, SHAPE.goldRock2, SHAPE.goldRock3].map((s, i) => depleting(`Gold ${i + 1}`, s, 0.56, [242, 194, 51], true)),
      ...([['Johannisbeere', SHAPE.berryBush], ['Brombeere', SHAPE.berryBush2], ['Heidelbeere', SHAPE.berryBush3], ['Himbeere', SHAPE.berryBush4]] as [string, number][])
        .map(([label, s]) => depleting(label, s, 0.45, [62, 115, 52], false)),
    ],
  },
  {
    title: 'Felder', gap: 4.4, depth: 0,
    items: [field('wheat'), field('corn')],
  },
];

// --- Seite ------------------------------------------------------------------

document.title = 'Galerie - alle Modelle';
document.body.innerHTML = '';
document.body.style.cssText = 'margin:0;overflow:hidden;background:#20242b;font:12px ui-monospace,Menlo,monospace;color:#d8dde4';
const canvas = document.createElement('canvas');
canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;cursor:grab';
document.body.appendChild(canvas);
const labels = document.createElement('div');
labels.style.cssText = 'position:fixed;inset:0;pointer-events:none';
document.body.appendChild(labels);
const head = document.createElement('div');
head.style.cssText = 'position:fixed;left:12px;top:10px;padding:6px 10px;border-radius:7px;background:rgba(0,0,0,0.45)';
head.innerHTML = '<b style="color:#6ee7a0">Galerie</b> · alle Modelle und Animationen · Ziehen verschiebt, Mausrad zoomt · <a href="/" style="color:#9ecbff">zum Spiel</a>';
document.body.appendChild(head);

const gl = canvas.getContext('webgl2', { antialias: true, depth: true, alpha: false })!;
const renderer = new EntityRenderer(gl);
// Kein Boden, in dem ein Sockel verschwinden könnte.
renderer.skirts = false;

let pixelRatio = window.devicePixelRatio || 1;
function resize() {
  pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * pixelRatio);
  canvas.height = Math.round(window.innerHeight * pixelRatio);
}
window.addEventListener('resize', resize);
resize();

/** Lage jeder Reihe (Boden-Koordinate v, auf dem Bildschirm nach unten). */
const rowV = ROWS.map((_, r) => ROWS.slice(0, r).reduce((sum, row) => sum + row.depth, 0));
/** Lage jedes Stücks: Reihen untereinander, die Stücke einer Reihe nebeneinander (auf dem Bildschirm). */
const placed = ROWS.flatMap((row, r) => {
  const width = (row.items.length - 1) * row.gap;
  return row.items.map((item, i) => ({ item, ...groundToWorld(-width / 2 + i * row.gap, rowV[r]) }));
});
const titleAt = ROWS.map((row, r) => {
  const width = (row.items.length - 1) * row.gap;
  return { title: row.title, ...groundToWorld(-width / 2 - 1.2, rowV[r]) };
});

const labelEls = placed.map((p) => {
  const el = document.createElement('div');
  el.textContent = p.item.label;
  el.style.cssText = 'position:absolute;transform:translate(-50%,0);white-space:nowrap;font-size:11px;opacity:0.85';
  labels.appendChild(el);
  return el;
});
const titleEls = titleAt.map((t) => {
  const el = document.createElement('div');
  el.textContent = t.title;
  el.style.cssText = 'position:absolute;transform:translate(-100%,-50%);white-space:nowrap;font-weight:600;color:#6ee7a0';
  labels.appendChild(el);
  return el;
});

// Kamera: Mitte der Galerie, Zoom in CSS-Pixeln je Tile.
const totalV = rowV[rowV.length - 1];
const widest = Math.max(...ROWS.map((row) => (row.items.length - 1) * row.gap)) + 4;
const middle = groundToWorld(0, totalV / 2 - 0.5);
let camX = middle.x;
let camY = middle.y;
let zoom = Math.min(window.innerWidth / widest, window.innerHeight / (totalV + 4), 140);

let dragging: { x: number; y: number } | null = null;
canvas.addEventListener('mousedown', (e) => {
  dragging = { x: e.clientX, y: e.clientY };
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', () => {
  dragging = null;
  canvas.style.cursor = 'grab';
});
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  // Verschieben auf dem Bildschirm = in Boden-Koordinaten (u, v).
  const du = -(e.clientX - dragging.x) / zoom;
  const dv = -(e.clientY - dragging.y) / zoom;
  const a = groundToWorld(du, dv);
  const o = groundToWorld(0, 0);
  camX += a.x - o.x;
  camY += a.y - o.y;
  dragging = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = Math.min(400, Math.max(12, zoom * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });

const instances: EntityInstance[] = [];
const start = performance.now();

function frame(now: number) {
  const t = (now - start) / 1000;
  instances.length = 0;
  for (const p of placed) p.item.draw(t, p.x, p.y, instances);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.125, 0.14, 0.17, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // Ohne Relief: alles steht auf einer flachen Ebene, die nicht gezeichnet wird.
  const camera = snapCamera({ centerX: camX, centerY: camY, pixelsPerTile: zoom * pixelRatio, reliefScale: 0 }, canvas.width, canvas.height);
  renderer.render(instances, camera, 0, pixelRatio);

  const view: IsoView = { centerX: camX, centerY: camY, tileSize: zoom, width: window.innerWidth, height: window.innerHeight };
  placed.forEach((p, i) => {
    const s = worldToScreen(view, p.x, p.y, 0);
    labelEls[i].style.left = `${s.x}px`;
    labelEls[i].style.top = `${s.y + zoom * 0.35}px`;
  });
  titleAt.forEach((tt, i) => {
    const s = worldToScreen(view, tt.x, tt.y, 0);
    titleEls[i].style.left = `${s.x}px`;
    titleEls[i].style.top = `${s.y}px`;
  });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
