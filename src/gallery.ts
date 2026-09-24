// gallery.ts
// Route /galerie: ein Schaufenster für die Modelle - links wählt man eines
// (Mann, Frau, Reh, Hauptgebäude, Eiche, ...), es steht groß in der Mitte,
// unten wählt man seine Animation oder Variante (steht, geht, hackt, ...)
// und dreht die Ansicht. "Alle auf einmal" zeigt alle Modelle und
// Animationen nebeneinander. Ohne Gelände, auf ruhigem Hintergrund,
// gezeichnet mit demselben EntityRenderer wie im Spiel; die Bewegungen
// laufen in Schleifen. Ziehen verschiebt, das Mausrad zoomt.

import {
  ANIMAL_POSE, BUILDING_HEADING, EntityRenderer, FALL_LYING, POSE, SHAPE, millMotion, type EntityInstance,
} from './gl/entityRenderer';
import {
  groundToWorld, setViewRotation, snapCamera, viewRotation, worldToGround, worldToScreen, type IsoView,
} from './gl/iso';
import { mountGallery, type GalleryItem } from './components/GalleryOverlay';
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
        ['Alte Eiche', SHAPE.treeOakOld], ['Birke', SHAPE.treeBirch], ['Hängebirke', SHAPE.treeBirch2], ['Trauerbirke', SHAPE.treeBirch3], ['Ahorn', SHAPE.treeMaple], ['Pappel', SHAPE.treePoplar]] as [string, number][])
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

// --- Schaufenster ---------------------------------------------------------

/**
 * Ein Modell im Schaufenster: seine Animationen oder Varianten, dazu Zoom
 * (CSS-Pixel je Tile) und wie weit die Kamera über den Fuß schaut (Tiles) -
 * damit es mittig und bildfüllend steht.
 */
interface Showcase extends GalleryItem {
  exhibits: Exhibit[];
  /** Gebäude: Abriss je Variante - als Zusatz zur gewählten Variante. */
  demolish?: Exhibit[];
  zoom: number;
  lift: number;
}

/** Name ohne Präfix: "Mann · geht" -> "geht". */
const after = (label: string) => label.split(' · ').pop()!;

function showcase(group: string, label: string, exhibits: Exhibit[], zoom: number, lift: number, names?: string[]): Showcase {
  return { group, label, exhibits, animations: names ?? exhibits.map((e) => after(e.label)), zoom, lift };
}

/** Gebäude mit Varianten (Stufen) und dem Abriss als Zusatz zur gewählten. */
function building(label: string, shapes: number[], size: number, zoom: number, lift: number, motion?: (i: number) => [number, number, number, number]): Showcase {
  return {
    ...showcase('Gebäude', label, shapes.map((sh, i) => model(shapes.length > 1 ? `Stufe ${i + 1}` : 'steht', sh, size, motion?.(i))), zoom, lift),
    demolish: shapes.map((sh) => collapse('Abriss', sh, size)),
    extras: ['Abriss'],
  };
}

const walkRate = VILLAGER.speed * Math.PI * 2 / 0.6;
const people = (female: boolean) => {
  const who = female ? 'Frau' : 'Mann';
  return showcase('Dorfbewohner', who, [
    figure('steht', female, POSE.stand, 1, Math.PI * 0.25),
    figure('geht', female, POSE.walk, walkRate, -Math.PI / 4),
    figure('trägt', female, POSE.walk, walkRate, -Math.PI / 4, 1),
    figure('hackt', female, POSE.work, 6, 0.3),
    figure('pflückt', female, POSE.pick, 6, 0.3),
    figure('mäht', female, POSE.scythe, 6, 0.3),
  ], 240, 0.9);
};

const TREES: [string, number][] = [
  ['Fichte', SHAPE.tree], ['Kiefer', SHAPE.treePine], ['Eiche', SHAPE.treeOak], ['Junge Eiche', SHAPE.treeOakYoung],
  ['Alte Eiche', SHAPE.treeOakOld], ['Birke', SHAPE.treeBirch], ['Hängebirke', SHAPE.treeBirch2],
  ['Trauerbirke', SHAPE.treeBirch3], ['Ahorn', SHAPE.treeMaple], ['Pappel', SHAPE.treePoplar],
];

const SHOWCASE: Showcase[] = [
  people(false),
  people(true),
  ...(Object.keys(ANIMALS) as AnimalKind[]).map((kind) => showcase('Tiere', ANIMALS[kind].label, [
    animal(kind, 'äst', ANIMAL_POSE.graze),
    animal(kind, 'geht', ANIMAL_POSE.walk),
    animal(kind, 'flieht', ANIMAL_POSE.flee),
    animal(kind, 'erlegt', ANIMAL_POSE.dead),
  ], kind === 'hare' ? 420 : 240, kind === 'hare' ? 0.3 : 0.6)),
  building('Hauptgebäude', [SHAPE.townCenter], BUILDINGS.town_center.size, 150, 1.1),
  building('Haus', [SHAPE.house, SHAPE.house2, SHAPE.house3, SHAPE.house4], BUILDINGS.house.size, 220, 0.7),
  building('Holzlager', [SHAPE.lumberCamp, SHAPE.lumberCamp2, SHAPE.lumberCamp3, SHAPE.lumberCamp4], BUILDINGS.lumberjack.size, 220, 0.6),
  building('Minenlager', [SHAPE.miningCamp], BUILDINGS.mine.size, 200, 0.7),
  building('Mühle', [SHAPE.mill, SHAPE.mill2, SHAPE.mill3, SHAPE.mill4], BUILDINGS.forager.size, 150, 1.4, (i) => millMotion(i, 7)),
  showcase('Gebäude', 'Sammelpunkt', [model('weht', SHAPE.rallyFlag, 0.54)], 420, 0.4),
  ...TREES.map(([label, sh]) => showcase('Bäume', label, [
    model('steht', sh, 0.6, [0.4, 0, 0, 1]),
    ...(sh === SHAPE.treeOak || sh === SHAPE.tree ? [felling('gefällt', sh)] : []),
  ], 200, 1.2)),
  showcase('Vorkommen', 'Stein', [SHAPE.stoneRock, SHAPE.stoneRock2, SHAPE.stoneRock3]
    .map((sh, i) => depleting(`Fels ${i + 1}`, sh, 0.6, [158, 158, 164], true)), 360, 0.4),
  showcase('Vorkommen', 'Gold', [SHAPE.goldRock, SHAPE.goldRock2, SHAPE.goldRock3]
    .map((sh, i) => depleting(`Fels ${i + 1}`, sh, 0.56, [242, 194, 51], true)), 360, 0.4),
  showcase('Vorkommen', 'Beeren', ([['Johannisbeere', SHAPE.berryBush], ['Brombeere', SHAPE.berryBush2],
    ['Heidelbeere', SHAPE.berryBush3], ['Himbeere', SHAPE.berryBush4]] as [string, number][])
    .map(([label, sh]) => depleting(label, sh, 0.45, [62, 115, 52], false)), 400, 0.3),
  showcase('Felder', 'Weizen', [field('wheat')], 130, 0.5, ['säen, wachsen, ernten']),
  showcase('Felder', 'Mais', [field('corn')], 130, 0.6, ['säen, wachsen, ernten']),
];

// --- Seite ------------------------------------------------------------------

document.title = 'Soliva - Galerie';
document.body.style.cssText = 'margin:0;overflow:hidden;background:#20242b;font:12px ui-monospace,Menlo,monospace;color:#d8dde4';

/** Übersicht: Lage jeder Reihe (Boden-Koordinate v, auf dem Bildschirm nach unten). */
const rowV = ROWS.map((_, r) => ROWS.slice(0, r).reduce((sum, row) => sum + row.depth, 0));
/** Übersicht: Lage jedes Stücks - Reihen untereinander, die Stücke einer Reihe nebeneinander. */
const placed = ROWS.flatMap((row, r) => {
  const width = (row.items.length - 1) * row.gap;
  return row.items.map((item, i) => ({ item, ...groundToWorld(-width / 2 + i * row.gap, rowV[r]) }));
});
const titleAt = ROWS.map((row, r) => {
  const width = (row.items.length - 1) * row.gap;
  return { title: row.title, ...groundToWorld(-width / 2 - 1.2, rowV[r]) };
});

/** Gewählt: Modell (-1 = Übersicht aller), Animation und ob der Abriss läuft. */
let current = 0;
let animation = 0;
let demolishing = false;

const { canvas, labels: labelEls, titles: titleEls, show } = mountGallery(
  document.getElementById('app')!,
  SHOWCASE,
  placed.map((p) => p.item.label),
  titleAt.map((t) => t.title),
  {
    select: (i) => choose(i, 0),
    animate: (i) => choose(current, i),
    extra: () => {
      demolishing = !demolishing;
      choose(current, animation, false);
    },
    rotate: (step) => {
      setViewRotation(viewRotation() + step);
      if (current >= 0) frame0();
    },
  },
);

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

// Kamera: Mitte in Welt-Tiles, Zoom in CSS-Pixeln je Tile.
let camX = 0;
let camY = 0;
let zoom = 100;
/** Mitte der Bühne rechts der Liste - dort steht das Modell. */
const LIST_WIDTH = 224;

/** Modell `i` (-1 = Übersicht) mit Animation `a` zeigen, bei einem Wechsel die Kamera darauf, Adresse merken. */
function choose(i: number, a: number, reframe = i !== current) {
  // Ein anderes Modell beginnt ohne Abriss.
  if (i !== current) demolishing = false;
  current = Math.max(-1, Math.min(SHOWCASE.length - 1, i));
  animation = current < 0 ? 0 : Math.max(0, Math.min(SHOWCASE[current].exhibits.length - 1, a));
  if (reframe) frame0();
  show(current, animation, demolishing);
  const params = new URLSearchParams();
  if (current < 0) params.set('zeige', 'alle');
  else {
    params.set('zeige', SHOWCASE[current].label);
    params.set('animation', SHOWCASE[current].animations[animation]);
    if (demolishing) params.set('abriss', '1');
  }
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

/** Kamera auf das Gewählte: das Modell mittig über dem Fuß, die Übersicht als Ganzes. */
function frame0() {
  if (current < 0) {
    const totalV = rowV[rowV.length - 1];
    const widest = Math.max(...ROWS.map((row) => (row.items.length - 1) * row.gap)) + 4;
    const middle = groundToWorld(0, totalV / 2 - 0.5);
    camX = middle.x;
    camY = middle.y;
    zoom = Math.min((window.innerWidth - LIST_WIDTH) / widest, window.innerHeight / (totalV + 4), 140);
    return;
  }
  const s = SHOWCASE[current];
  zoom = s.zoom;
  // Danach eingepasst - nach dem, was tatsächlich gezeichnet wird (siehe fit).
  fitPasses = 4;
  // Etwas über den Fuß schauen (auf dem Bildschirm nach oben) und nach links
  // rücken, damit das Modell mittig rechts der Liste steht.
  const g = worldToGround(0, 0);
  const c = groundToWorld(g.u - LIST_WIDTH / 2 / zoom, g.v - s.lift);
  camX = c.x;
  camY = c.y;
}

/** Wie oft das Modell noch eingepasst wird - ein paar Bilder nach einem Wechsel. */
let fitPasses = 0;
const BACKGROUND = [32, 36, 43];

/**
 * Passt Zoom und Kamera an das eben Gezeichnete an: der Umriss füllt die
 * Bühne rechts der Liste und über den Knöpfen zu gut drei Vierteln. Ragt es
 * über den Rand, erst herauszoomen und im nächsten Bild noch einmal.
 */
function fit() {
  const w = canvas.width;
  const h = canvas.height;
  const pixels = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      if (Math.abs(pixels[i] - BACKGROUND[0]) + Math.abs(pixels[i + 1] - BACKGROUND[1]) + Math.abs(pixels[i + 2] - BACKGROUND[2]) < 12) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      // readPixels zählt von unten.
      y0 = Math.min(y0, h - 1 - y); y1 = Math.max(y1, h - 1 - y);
    }
  }
  if (x1 < 0) return;
  const pr = pixelRatio;
  // Bühne: rechts der Liste, unter der Hilfe, über Name und Knöpfen.
  const left = LIST_WIDTH * pr, right = w - 16 * pr, top = 50 * pr, bottom = h - 150 * pr;
  const clipped = x0 <= 2 || y0 <= 2 || x1 >= w - 3 || y1 >= h - 3;
  const f = clipped ? 0.5 : Math.min(((right - left) * 0.8) / (x1 - x0 + 1), ((bottom - top) * 0.8) / (y1 - y0 + 1));
  const newZoom = Math.min(900, Math.max(12, zoom * f));
  const scale = newZoom / zoom;
  // Mitte des Umrisses (vom Bildmittelpunkt aus) nach dem Zoomen an die Mitte der Bühne.
  const ox = ((x0 + x1) / 2 - w / 2) * scale;
  const oy = ((y0 + y1) / 2 - h / 2) * scale;
  const tx = (left + right) / 2 - w / 2;
  const ty = (top + bottom) / 2 - h / 2;
  const g = worldToGround(camX, camY);
  const c = groundToWorld(g.u + (ox - tx) / (newZoom * pr), g.v + (oy - ty) / (newZoom * pr));
  camX = c.x;
  camY = c.y;
  zoom = newZoom;
  if (clipped) fitPasses = Math.max(fitPasses, 1);
}

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
  zoom = Math.min(900, Math.max(12, zoom * Math.exp(-e.deltaY * 0.0015)));
}, { passive: false });
// Pfeiltasten: hoch/runter das Modell, links/rechts die Animation.
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    choose(current + (e.key === 'ArrowDown' ? 1 : -1), 0);
  } else if (current >= 0 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    const n = SHOWCASE[current].exhibits.length;
    choose(current, (animation + (e.key === 'ArrowRight' ? 1 : n - 1)) % n);
  }
});

// ?zeige=Mann&animation=geht (oder ?zeige=alle): gleich dorthin; ?zoom= zoomt.
const params = new URLSearchParams(window.location.search);
const focus = params.get('zeige')?.toLowerCase();
const startItem = focus === 'alle' ? -1 : Math.max(0, SHOWCASE.findIndex((s) => s.label.toLowerCase() === focus));
const startAnim = startItem >= 0
  ? Math.max(0, SHOWCASE[startItem].animations.findIndex((a) => a.toLowerCase() === params.get('animation')?.toLowerCase()))
  : 0;
demolishing = params.get('abriss') === '1';
current = startItem;
choose(startItem, startAnim, true);
if (params.has('zoom')) zoom = Number(params.get('zoom'));

const instances: EntityInstance[] = [];
const start = performance.now();

function frame(now: number) {
  const t = (now - start) / 1000;
  instances.length = 0;
  if (current < 0) for (const p of placed) p.item.draw(t, p.x, p.y, instances);
  else {
    const s = SHOWCASE[current];
    (demolishing && s.demolish ? s.demolish[animation] : s.exhibits[animation]).draw(t, 0, 0, instances);
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.125, 0.14, 0.17, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  // Ohne Relief: alles steht auf einer flachen Ebene, die nicht gezeichnet wird.
  const camera = snapCamera({ centerX: camX, centerY: camY, pixelsPerTile: zoom * pixelRatio, reliefScale: 0 }, canvas.width, canvas.height);
  renderer.render(instances, camera, 0, pixelRatio);
  if (fitPasses > 0 && current >= 0) {
    fitPasses--;
    fit();
  }

  if (current < 0) {
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
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
