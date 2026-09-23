import { MapGenerator, reliefZ } from './noise';
import {
  centerFor,
  panDelta,
  pickWorld,
  setViewRotation,
  visibleWorldRect,
  worldToGround,
  worldToScreen,
  type IsoView,
} from './gl/iso';
import {
  MapRenderer,
  MiniMap,
  RESOURCE_TYPE_COLORS,
  RESOURCE_TYPE_LABEL,
  TILE_TYPE_COLOR,
  TILE_TYPE_LABEL,
  TileProbe,
} from './map';
import type { TileType } from './noise';
import type { EntityInstance } from './gl/entityRenderer';
import { SHAPE } from './gl/entityRenderer';
import {
  BUILDINGS,
  BUILDING_ORDER,
  MAX_GATHERERS,
  VILLAGER,
  type BuildingType,
  type Stock,
} from './world/buildings';
import { World, type Villager } from './world/world';
import { ResourceField } from './world/resources';
import { Sound, type SoundName } from './audio';
import { GATHER_CURSOR, RALLY_CURSOR } from './cursors';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const posEl = document.getElementById('pos')!;
const sampleEl = document.getElementById('sampling')!;
const hoverCoordsEl = document.getElementById('hover-coords')!;
const camCoordsEl = document.getElementById('cam-coords')!;
const cursorCoordsEl = document.getElementById('cursor-coords')!;
const fpsEl = document.getElementById('fps')!;
const tileInfoEl = document.getElementById('tile-info')!;
const legendEl = document.getElementById('legend')!;
const zoomEl = document.getElementById('zoom')!;
const stockEl = document.getElementById('stock')!;
const buildEl = document.getElementById('build')!;
const hintEl = document.getElementById('hint')!;
const selectionEl = document.getElementById('selection')!;
const boxEl = document.getElementById('select-box')!;

// Legende aus der Palette aufbauen - so kann sie nicht aus dem Tritt geraten
legendEl.innerHTML = (Object.keys(TILE_TYPE_LABEL) as TileType[])
  .map(
    (type) =>
      `<span class="legend-item"><i style="background:${TILE_TYPE_COLOR[type].toRgbString()}"></i>${TILE_TYPE_LABEL[type]}</span>`,
  )
  .join('');

/**
 * Sichtfläche in CSS-Pixeln. tileSize und Mauskoordinaten rechnen durchgehend
 * in dieser Einheit; der Canvas-Speicher ist um pixelRatio größer.
 */
let viewWidth = 0;
let viewHeight = 0;
let pixelRatio = 1;

function applyCanvasSize() {
  pixelRatio = window.devicePixelRatio || 1;
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;

  // Gezeichnet wird in echten Bildschirmpixeln, angezeigt in CSS-Pixeln.
  // Sonst rendert der Browser das Canvas klein und skaliert es hoch.
  canvas.width = Math.round(viewWidth * pixelRatio);
  canvas.height = Math.round(viewHeight * pixelRatio);
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
}

function resize() {
  // Die Kamera beschreibt die Bildmitte - die bleibt beim Größenwechsel stehen.
  applyCanvasSize();

  renderer.pixelRatio = pixelRatio;
  minimap.setPixelRatio(pixelRatio);
}

applyCanvasSize();

function parseURL(): { seed: string; x: number; y: number; zoom: number } {
  const path = window.location.pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(window.location.search);

  let seed = 'AoE2Factorio1337';
  let x = 0;
  let y = 0;
  let zoom = 4;

  if (path.length >= 2) {
    seed = path[0];
    // Nicht an '-' aufteilen: negative Koordinaten bringen ihr eigenes
    // Minus mit ("-231--600").
    const coords = /^(-?\d+)-(-?\d+)$/.exec(path[1]);
    if (coords) {
      x = Number(coords[1]);
      y = Number(coords[2]);
    }
  }

  if (params.has('seed')) seed = params.get('seed')!;
  if (params.has('x')) x = Number(params.get('x'));
  if (params.has('y')) y = Number(params.get('y'));
  if (params.has('zoom')) zoom = Number(params.get('zoom'));

  return { seed, x, y, zoom };
}

function updateURL(seed: string, tileX: number, tileY: number, zoom: number) {
  // Der Zoom gehört mit in die Adresse - sonst geht er beim Neuladen oder
  // Weitergeben des Links verloren, weil hier der Query-Teil ersetzt wird.
  const newPath = `/${seed}/${tileX}-${tileY}`;
  const newSearch = `?zoom=${zoom}`;
  if (window.location.pathname !== newPath || window.location.search !== newSearch) {
    window.history.replaceState(null, '', newPath + newSearch);
  }
}

const { seed, x: startX, y: startY, zoom: startZoom } = parseURL();
const mapGen = new MapGenerator(seed);
const probe = new TileProbe(mapGen, seed);
const world = new World(probe, seed);
const resources = new ResourceField(probe, mapGen);
const sound = new Sound();

/**
 * Ab dieser Zoomstufe (CSS-Pixel je Tile) stehen Bäume, Felsen und Sträucher
 * als Objekte in der Landschaft. Weiter draußen wären sie ein, zwei Pixel
 * groß - dort zeigt die Einfärbung des Geländes die Vorkommen.
 */
const RESOURCE_OBJECTS_MIN_ZOOM = 4;

/** Aktuell zum Bauen ausgewählter Typ, oder null im Ansichtsmodus. */
let selected: BuildingType | null = null;

// --- Baumenü ---------------------------------------------------------------

const RESOURCE_ORDER: (keyof Stock)[] = ['wood', 'stone', 'gold', 'berries'];

const buildButtons = new Map<BuildingType, HTMLButtonElement>();

for (const type of BUILDING_ORDER) {
  const def = BUILDINGS[type];
  const cost = RESOURCE_ORDER.filter((r) => def.cost[r])
    .map((r) => `${def.cost[r]} ${RESOURCE_TYPE_LABEL[r]}`)
    .join(', ');
  const pop = def.provides > 0
    ? `+${def.provides} Platz`
    : def.accepts.length > 0
      ? `Lager: ${def.accepts.map((r) => RESOURCE_TYPE_LABEL[r]).join('/')}`
      : '';

  const button = document.createElement('button');
  button.className = 'build-btn';
  button.type = 'button';
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML =
    `<span class="name"><i style="background:${def.color.toRgbString()}"></i>` +
    `${def.key} ${def.label}</span>` +
    `<span class="cost">${[cost || 'kostenlos', pop].filter(Boolean).join(' · ')}</span>`;
  button.addEventListener('click', () => select(selected === type ? null : type));
  buildEl.appendChild(button);
  buildButtons.set(type, button);
}

function select(type: BuildingType | null) {
  selected = type;
  // Wer baut, wählt nicht gleichzeitig aus - sonst tut ein Klick zwei Dinge.
  if (type) clearSelection();
  for (const [key, button] of buildButtons) {
    button.setAttribute('aria-pressed', String(key === type));
  }
  updateCursor();
}

/**
 * Zeiger je nach Lage: im Baumodus ein Feld-Zeiger, mit ausgewählten
 * Dorfbewohnern über einem Vorkommen das passende Werkzeug - Axt für Holz,
 * Spitzhacke für Stein und Gold, Beeren für Beeren. Sonst das Fadenkreuz.
 */
function updateCursor() {
  let cursor = 'crosshair';
  const trainer = selectedBuilding ? world.building(selectedBuilding) : undefined;
  if (selected) {
    cursor = 'copy';
  } else if (trainer && BUILDINGS[trainer.type].trains) {
    cursor = RALLY_CURSOR;
  } else if (selectedVillagers.size > 0 && mouseTileX !== undefined && mouseTileY !== undefined) {
    const found = world.remainingAt(mouseTileX, mouseTileY);
    if (found.type && found.amount > 0 && !world.at(mouseTileX, mouseTileY)) {
      cursor = GATHER_CURSOR[found.type];
    }
  }
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
}

let hintTimer = 0;
function hint(text: string) {
  sound.play('error', 0.6);
  hintEl.textContent = text;
  hintEl.classList.add('show');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => hintEl.classList.remove('show'), 1800);
}

/** Vorrat und Verfügbarkeit der Bauknöpfe. Läuft nicht je Frame, sondern getaktet. */
function updateResourceUI() {
  const pop = world.population();
  const { counts, idle } = world.gatherers();
  // Unter jedem Vorrat, wie viele Dorfbewohner ihn gerade sammeln - wie in
  // AoE2 sieht man so auf einen Blick, wie die Arbeit verteilt ist.
  const workers = (n: number, text: string) =>
    `<span class="workers${n > 0 ? ' busy' : ''}">${text}</span>`;
  const html =
    RESOURCE_ORDER.map(
      (r) =>
        `<span class="res"><span class="amount">` +
        `<i style="background:${RESOURCE_TYPE_COLORS[r].toRgbString()}"></i>` +
        `${RESOURCE_TYPE_LABEL[r]} <b>${Math.floor(world.stock[r])}</b></span>` +
        workers(counts[r], `${counts[r]} ${VILLAGER.label}`) +
        `</span>`,
    ).join('') +
    `<span class="res"><span class="amount">Bevölkerung <b>${pop.used}/${pop.cap}</b>` +
    `${pop.training > 0 ? ` (+${pop.training})` : ''}</span>` +
    // Ein Klick darauf wählt den nächsten untätigen Dorfbewohner aus.
    (idle > 0
      ? `<button type="button" class="workers busy idle-btn" data-action="idle" title="Alle untätigen auswählen (Taste .) - mit Umschalt einzeln">${idle} untätig</button>`
      : workers(0, '0 untätig')) + `</span>`;
  if (stockEl.innerHTML !== html) stockEl.innerHTML = html;

  for (const [type, button] of buildButtons) {
    button.disabled = !world.affordable(type) || (type !== 'town_center' && !world.hasTownCenter());
  }
  updateSelectionUI();
  // Der Vorrat wächst von allein: was eben noch zu teuer war, ist es jetzt
  // vielleicht nicht mehr - die gemerkte Bauplatz-Prüfung muss also mit.
  invalidatePlacementCheck();
}

// --- Ton -------------------------------------------------------------------

const soundButton = document.getElementById('sound')!;

function updateSoundButton() {
  soundButton.classList.toggle('muted', !sound.enabled);
  soundButton.title = sound.enabled ? 'Ton aus (M)' : 'Ton an (M)';
}

function toggleSound() {
  sound.toggle();
  updateSoundButton();
}

soundButton.addEventListener('click', toggleSound);
updateSoundButton();

const GATHER_SOUND: Record<string, SoundName> = {
  wood: 'chop',
  stone: 'pick',
  gold: 'pick',
  berries: 'rustle',
};

/**
 * Geräusche aus der Welt: nur, was man sieht - leiser zum Bildrand hin und
 * nach links oder rechts verteilt, je nachdem, wo es passiert. Weit
 * herausgezoomt ist alles leiser, sonst klingt ein ganzes Dorf wie eines.
 */
world.onEvent = (event) => {
  const s = worldToScreen(view(), event.x, event.y, zAt(event.x, event.y));
  const nx = (s.x - viewWidth / 2) / (viewWidth / 2);
  const ny = (s.y - viewHeight / 2) / (viewHeight / 2);
  const offscreen = Math.abs(nx) > 1.15 || Math.abs(ny) > 1.15;
  const distance = Math.min(1, Math.hypot(nx, ny) / 1.4);
  const zoom = Math.min(1, tileSize / 8);
  const volume = (1 - distance * 0.7) * (0.35 + 0.65 * zoom);

  switch (event.kind) {
    case 'strike':
      if (!offscreen) sound.play(GATHER_SOUND[event.resource], volume * 0.55, nx * 0.8);
      break;
    case 'treeFall':
      if (!offscreen) sound.play('treeFall', volume, nx * 0.8);
      break;
    case 'deliver':
      if (!offscreen) sound.play('deliver', volume * 0.6, nx * 0.8);
      break;
    case 'collapse':
      if (!offscreen) sound.play('collapse', volume, nx * 0.8);
      break;
    case 'trained':
      // Wichtige Rückmeldung - auch wenn das Hauptgebäude nicht im Bild ist.
      sound.play('trained', 0.7);
      break;
  }
};

// --- Kompass ---------------------------------------------------------------

const compassEl = document.getElementById('compass')!;

/**
 * Himmelsrichtungen als Welt-Vektoren. Norden ist, was in der Grundstellung
 * oben im Bild liegt; Osten liegt dann rechts.
 */
const COMPASS: Record<string, [number, number]> = {
  N: [-1, -1],
  E: [1, -1],
  S: [1, 1],
  W: [-1, 1],
};

/** Stellt die Buchstaben dorthin, wohin ihre Richtung gerade im Bild zeigt. */
function updateCompass() {
  const size = compassEl.clientWidth;
  for (const button of compassEl.querySelectorAll<HTMLButtonElement>('button')) {
    const [dx, dy] = COMPASS[button.dataset.dir!];
    const g = worldToGround(dx, dy);
    // u zeigt nach rechts, v nach unten; die Länge ist egal.
    const len = Math.hypot(g.u, g.v * 2);
    const x = (g.u / len) * (size / 2 - 14);
    const y = ((g.v * 2) / len) * (size / 2 - 14);
    button.style.left = `${size / 2 + x - 11}px`;
    button.style.top = `${size / 2 + y - 11}px`;
    if (button.dataset.dir === 'N') {
      const needle = compassEl.querySelector<HTMLElement>('.needle')!;
      needle.style.transform = `rotate(${Math.atan2(x, -y)}rad)`;
    }
  }
}

/** Dreht die Ansicht so, dass die Richtung `dir` nach oben zeigt. */
function faceDirection(dir: string) {
  const [dx, dy] = COMPASS[dir];
  // Gedreht wird um die Stelle, die man in der Bildmitte sieht - mit ihrer
  // Geländehöhe. Um den Punkt auf Meereshöhe gedreht, wanderte ein Dorf auf
  // einem Hügel beim Drehen aus dem Bild.
  const pivot = pick(viewWidth / 2, viewHeight / 2);
  for (let k = 0; k < 4; k++) {
    setViewRotation(k);
    const g = worldToGround(dx, dy);
    if (g.v < 0 && Math.abs(g.u) < 1e-9) break;
  }
  const center = centerFor(view(), pivot.x, pivot.y, pivot.z, viewWidth / 2, viewHeight / 2);
  camX = center.x;
  camY = center.y;
  updateCompass();
  // Unter dem Zeiger liegt jetzt eine andere Stelle.
  mouseTileX = undefined;
  mouseTileY = undefined;
  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  invalidatePlacementCheck();
}

compassEl.addEventListener('click', (e) => {
  const dir = (e.target as HTMLElement).closest('button')?.dataset.dir;
  if (dir) faceDirection(dir);
});

// --- Auswahl ---------------------------------------------------------------

/**
 * Ausgewählte Dorfbewohner (IDs), ein ausgewähltes Gebäude oder ein
 * ausgewähltes Vorkommen - immer nur eine der drei Arten.
 */
const selectedVillagers = new Set<number>();
let selectedBuilding: string | null = null;
let selectedResource: { x: number; y: number } | null = null;

function clearSelection() {
  selectedVillagers.clear();
  selectedBuilding = null;
  selectedResource = null;
  updateSelectionUI();
}

/** Bildschirmposition (CSS-Pixel) der Figurmitte - die Stelle, auf die man klickt. */
function villagerScreen(v: Villager) {
  const p = world.villagerPosition(v, tickAccumulator / TICK);
  return worldToScreen(view(), p.x, p.y, zAt(p.x, p.y) + VILLAGER.size * 0.8);
}

/** Dorfbewohner unter dem Zeiger - der nächste innerhalb eines Klick-Radius. */
function villagerAt(px: number, py: number): Villager | undefined {
  // Mindestens ein paar Pixel, damit man die Figur auch herausgezoomt trifft.
  const radius = Math.max(10, VILLAGER.size * tileSize * 1.2);
  let best: Villager | undefined;
  let bestDistance = radius;
  for (const v of world.villagers) {
    const s = villagerScreen(v);
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < bestDistance) {
      bestDistance = d;
      best = v;
    }
  }
  return best;
}

/** Linksklick ohne Ziehen: Dorfbewohner, sonst Gebäude, sonst Vorkommen, sonst nichts. */
function clickSelect(px: number, py: number, add: boolean) {
  const villager = villagerAt(px, py);
  selectedResource = null;
  if (villager) {
    selectedBuilding = null;
    if (!add) selectedVillagers.clear();
    if (add && selectedVillagers.has(villager.id)) selectedVillagers.delete(villager.id);
    else selectedVillagers.add(villager.id);
  } else {
    const { x, y } = tileAt(px, py);
    const building = world.at(x, y);
    selectedVillagers.clear();
    selectedBuilding = building ? world.anchorOf(building) : null;
    if (!building && world.resourceInfo(x, y)) selectedResource = { x, y };
  }
  updateSelectionUI();
}

/** Aufziehen eines Rechtecks: alle Dorfbewohner darin. */
function boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean) {
  const [left, right] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [top, bottom] = y0 < y1 ? [y0, y1] : [y1, y0];
  if (!add) selectedVillagers.clear();
  selectedBuilding = null;
  selectedResource = null;
  for (const v of world.villagers) {
    const s = villagerScreen(v);
    if (s.x >= left && s.x <= right && s.y >= top && s.y <= bottom) selectedVillagers.add(v.id);
  }
  updateSelectionUI();
}

/** Ab so vielen Pixeln Bewegung wird aus dem Klick ein Auswahlrechteck. */
const DRAG_THRESHOLD = 5;
let drag: { x: number; y: number; active: boolean } | null = null;

function canvasPoint(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const p = canvasPoint(e);

  if (selected) {
    const { x, y } = tileAt(p.x, p.y);
    const reason = world.place(x, y, selected);
    invalidatePlacementCheck();
    if (reason) {
      hint(reason);
      return;
    }
    sound.play('place');
    updateResourceUI();
    // Reicht der Vorrat nicht für ein weiteres, zurück in den Ansichtsmodus -
    // sonst klickt man ins Leere und bekommt nur Fehlermeldungen.
    if (!world.affordable(selected)) select(null);
    return;
  }
  drag = { x: p.x, y: p.y, active: false };
});

// Auf window statt canvas: das Rechteck darf über Panels und den Rand hinaus
// gezogen werden, ohne hängen zu bleiben.
window.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const p = canvasPoint(e);
  if (!drag.active && Math.hypot(p.x - drag.x, p.y - drag.y) < DRAG_THRESHOLD) return;
  drag.active = true;
  boxEl.hidden = false;
  boxEl.style.left = `${Math.min(p.x, drag.x)}px`;
  boxEl.style.top = `${Math.min(p.y, drag.y)}px`;
  boxEl.style.width = `${Math.abs(p.x - drag.x)}px`;
  boxEl.style.height = `${Math.abs(p.y - drag.y)}px`;
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 0 || !drag) return;
  const p = canvasPoint(e);
  if (drag.active) boxSelect(drag.x, drag.y, p.x, p.y, e.shiftKey);
  else clickSelect(p.x, p.y, e.shiftKey);
  drag = null;
  boxEl.hidden = true;
});

/** Rechtsklick: im Baumodus abbrechen, mit Dorfbewohnern ein Befehl. */
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (selected) {
    select(null);
    return;
  }
  const p = canvasPoint(e);
  const { x, y } = tileAt(p.x, p.y);

  // Ausbildendes Gebäude ausgewählt: Rechtsklick setzt den Sammelpunkt.
  const trainer = selectedBuilding ? world.building(selectedBuilding) : undefined;
  if (trainer && BUILDINGS[trainer.type].trains) {
    const reason = world.setRally(trainer, x, y);
    if (reason) hint(reason);
    else sound.play('click');
    updateSelectionUI();
    return;
  }

  if (selectedVillagers.size === 0) return;
  const reason = world.command(selectedVillagers, x, y);
  if (reason) hint(reason);
  else sound.play('click', 0.7);
  updateSelectionUI();
});

/** Einen Dorfbewohner ausbilden: im ausgewählten Hauptgebäude, sonst im nächstgelegenen. */
function trainVillager() {
  const chosen = selectedBuilding ? world.building(selectedBuilding) : undefined;
  const building = chosen && BUILDINGS[chosen.type].trains
    ? chosen
    : world.nearestTownCenter(camX, camY);
  if (!building) {
    hint('Baue zuerst ein Hauptgebäude');
    return;
  }
  const reason = world.train(building);
  if (reason) hint(reason);
  else sound.play('click', 0.5);
  updateResourceUI();
}

/**
 * Taste H: zum Hauptgebäude springen und es auswählen - bei mehreren reihum,
 * beginnend nach dem gerade ausgewählten.
 */
/**
 * Untätige Dorfbewohner auswählen und zu ihnen springen. Normal alle auf
 * einmal - dann genügt ein Rechtsklick, um sie an die Arbeit zu schicken.
 * Mit `all = false` nur einen, bei wiederholtem Aufruf reihum.
 */
function selectIdleVillager(all = true) {
  const idle = world.villagers.filter((v) => v.task.kind === 'idle');
  if (idle.length === 0) {
    hint('Kein Dorfbewohner ist untätig');
    return;
  }
  selectedBuilding = null;
  selectedResource = null;
  let target: Villager;
  if (all) {
    selectedVillagers.clear();
    for (const v of idle) selectedVillagers.add(v.id);
    // Zur Mitte der Gruppe - verteilt über die Karte zum ersten.
    const mx = idle.reduce((sum, v) => sum + v.x, 0) / idle.length;
    const my = idle.reduce((sum, v) => sum + v.y, 0) / idle.length;
    const spread = Math.max(...idle.map((v) => Math.hypot(v.x - mx, v.y - my)));
    target = spread < 40 ? { ...idle[0], x: mx, y: my } : idle[0];
  } else {
    // Nach dem gerade ausgewählten weitermachen, damit wiederholtes Klicken
    // alle der Reihe nach durchgeht.
    const current = selectedVillagers.size === 1 ? [...selectedVillagers][0] : -1;
    const index = idle.findIndex((v) => v.id === current);
    target = idle[(index + 1) % idle.length];
    selectedVillagers.clear();
    selectedVillagers.add(target.id);
  }
  const center = centerFor(view(), target.x, target.y, zAt(target.x, target.y),
      viewWidth / 2, viewHeight / 2);
  camX = center.x;
  camY = center.y;
  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  updateSelectionUI();
}

// Die Knöpfe entstehen bei jeder Aktualisierung neu - darum Delegation, und
// mousedown statt click, damit ein Neuzeichnen zwischen Drücken und Loslassen
// den Klick nicht verschluckt.
for (const panel of [stockEl, selectionEl]) {
  panel.addEventListener('mousedown', (e) => {
    const button = (e.target as HTMLElement).closest('button');
    if (e.button !== 0 || button?.dataset.action !== 'idle') return;
    // Kein Fokus auf dem Knopf - sonst bleibt ein Fokusrahmen stehen.
    e.preventDefault();
    e.stopPropagation();
    selectIdleVillager(!e.shiftKey);
  });
}

function cycleTownCenter() {
  const centers = world.townCenters();
  if (centers.length === 0) {
    hint('Baue zuerst ein Hauptgebäude');
    return;
  }
  const current = centers.findIndex((b) => world.anchorOf(b) === selectedBuilding);
  const next = centers[(current + 1) % centers.length];

  selectedVillagers.clear();
  selectedResource = null;
  selectedBuilding = world.anchorOf(next);
  // Mitte des Gebäudes in die Bildmitte - mit seiner Geländehöhe, sonst
  // säße es auf einem Hügel ein gutes Stück über der Mitte.
  const x = next.x + 0.5;
  const y = next.y + 0.5;
  const center = centerFor(view(), x, y, zAt(x, y), viewWidth / 2, viewHeight / 2);
  camX = center.x;
  camY = center.y;
  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  updateSelectionUI();
}

function demolishSelected() {
  const building = selectedBuilding ? world.building(selectedBuilding) : undefined;
  if (!building) return;
  world.remove(building);
  selectedBuilding = null;
  invalidatePlacementCheck();
  updateResourceUI();
}

/**
 * Knöpfe im Auswahl-Panel - per Delegation, weil das Panel neu gezeichnet
 * wird. Auf mousedown statt click: läuft gerade eine Ausbildung, ersetzt die
 * Fortschrittsanzeige das Panel fünfmal je Sekunde, und ein click, dessen
 * mousedown und mouseup auf verschiedenen Knopf-Elementen landen, fiele weg.
 */
selectionEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const action = (e.target as HTMLElement).closest('button')?.dataset.action;
  if (action === 'train') trainVillager();
  if (action === 'demolish') demolishSelected();
});

/** Zeigt, was ausgewählt ist und was man damit tun kann. Läuft getaktet mit dem Vorrat. */
function updateSelectionUI() {
  // Wer inzwischen nicht mehr existiert, fällt aus der Auswahl.
  for (const id of selectedVillagers) {
    if (!world.villagers.some((v) => v.id === id)) selectedVillagers.delete(id);
  }
  const building = selectedBuilding ? world.building(selectedBuilding) : undefined;
  if (selectedBuilding && !building) selectedBuilding = null;

  let html: string;
  if (building) {
    const def = BUILDINGS[building.type];
    html = `<div class="title">${def.label}</div>` +
      `<div>Trefferpunkte <b>${Math.ceil(building.hp)}/${def.hp}</b></div>`;
    if (def.accepts.length > 0) {
      html += `<div class="muted">Lager für ${def.accepts.map((r) => RESOURCE_TYPE_LABEL[r]).join(', ')}</div>`;
    }
    if (def.provides > 0) html += `<div class="muted">+${def.provides} Bevölkerung</div>`;
    const actions: string[] = [];
    if (def.trains) {
      const pop = world.population();
      if (building.queue > 0) {
        const full = pop.used >= pop.cap;
        const percent = Math.floor((building.progress / VILLAGER.trainTime) * 100);
        html += `<div>In Ausbildung <b>${building.queue}</b>` +
          `${full ? ' - <span class="muted">Bevölkerung voll, baue ein Haus</span>' : ''}</div>` +
          `<div class="bar"><i style="width:${percent}%"></i></div>`;
      }
      html += building.rally
        ? `<div class="muted">Sammelpunkt gesetzt - Rechtsklick versetzt ihn, auf das Gebäude hebt ihn auf.</div>`
        : `<div class="muted">Rechtsklick auf die Karte setzt einen Sammelpunkt für neue Dorfbewohner.</div>`;
      const cost = Object.entries(VILLAGER.cost)
          .map(([r, n]) => `${n} ${RESOURCE_TYPE_LABEL[r as keyof Stock]}`).join(', ');
      actions.push(
          `<button class="build-btn" data-action="train"${world.canAffordVillager() ? '' : ' disabled'}>` +
          `<span class="name">V ${VILLAGER.label}</span><span class="cost">${cost}</span></button>`);
    }
    actions.push(
        `<button class="build-btn" data-action="demolish">` +
        `<span class="name">Entf Abreißen</span><span class="cost">50 % zurück</span></button>`);
    html += `<div class="actions">${actions.join('')}</div>`;
  } else if (selectedResource) {
    const info = world.resourceInfo(selectedResource.x, selectedResource.y);
    if (info) {
      const left = Math.ceil(info.remaining);
      const percent = Math.round((info.remaining / info.total) * 100);
      const kind = resources.kindAt(selectedResource.x, selectedResource.y);
      html = `<div class="title">${kind ?? RESOURCE_TYPE_LABEL[info.type]}` +
        `${kind ? ` <span class="muted">${RESOURCE_TYPE_LABEL[info.type]}</span>` : ''}</div>` +
        `<div>Übrig <b>${left}/${info.total}</b></div>` +
        `<div class="bar"><i style="width:${percent}%"></i></div>` +
        `<div>Sammler <b>${info.gatherers}/${MAX_GATHERERS}</b>` +
        `${info.gatherers >= MAX_GATHERERS ? ' <span class="muted">- voll besetzt</span>' : ''}</div>` +
        (info.gatherers === 0
          ? `<div class="muted">Wähle Dorfbewohner und klicke mit rechts darauf, um es zu sammeln.</div>`
          : '');
    } else {
      // Leer gesammelt, während es ausgewählt war.
      selectedResource = null;
      html = `<div class="title">Leer</div><div class="muted">Hier ist nichts mehr zu holen.</div>`;
    }
  } else if (selectedVillagers.size > 0) {
    const chosen = world.villagers.filter((v) => selectedVillagers.has(v.id));
    // Gleiche Tätigkeiten zusammenfassen: "3x sammelt Holz, 1x untätig".
    const counts = new Map<string, number>();
    for (const v of chosen) {
      const text = world.describe(v).replace(/ \(\d+\)$/, '');
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    const hp = chosen.reduce((sum, v) => sum + v.hp, 0);
    html = `<div class="title">${chosen.length} ${VILLAGER.label}</div>` +
      `<div>Trefferpunkte <b>${Math.ceil(hp)}/${chosen.length * VILLAGER.hp}</b></div>` +
      [...counts].map(([text, n]) => `<div>${n}× ${text}</div>`).join('') +
      `<div class="muted">Rechtsklick auf Holz, Stein, Gold oder Beeren: sammeln · ` +
      `auf ein Lager: abliefern · sonst: hingehen</div>`;
  } else if (!world.hasTownCenter()) {
    html = `<div class="title">Los geht's</div>` +
      `<div class="muted">Baue zuerst ein Hauptgebäude (Taste 1). Dort bildest du Dorfbewohner aus.</div>`;
  } else {
    const idle = world.villagers.filter((v) => v.task.kind === 'idle').length;
    html = `<div class="muted">Klicke auf das Hauptgebäude, um Dorfbewohner auszubilden (V), ` +
      `oder wähle Dorfbewohner aus.</div>` +
      (idle > 0
        ? `<div class="actions"><button class="build-btn" data-action="idle">` +
          `<span class="name">. Untätige</span><span class="cost">${idle} ohne Arbeit</span></button></div>`
        : '');
  }
  if (selectionEl.innerHTML !== html) selectionEl.innerHTML = html;
  // Auswahl hat sich vielleicht geändert, oder das Feld unter dem Zeiger ist
  // inzwischen leer gesammelt.
  updateCursor();
}

// Der Speicherstand liegt im localStorage, nicht in der Adresse - anders als
// Seed und Position gehört er zu diesem Browser, nicht zum geteilten Link.
window.addEventListener('beforeunload', () => world.save());

/**
 * Zoomstufen in CSS-Pixeln je Welt-Tile. Verdopplung je Stufe: die Schrittweite
 * der Abtastung ist damit immer eine Zweierpotenz, und von einem Ende zum
 * anderen sind es sieben Rasten statt Dutzender Ein-Pixel-Schritte. Erst die
 * letzte Stufe (128) zeigt die Dorfbewohner groß genug für ihre Details.
 */
const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32, 64, 128];

function nearestZoomIndex(pixelsPerTile: number): number {
  let best = 0;
  for (let i = 1; i < ZOOM_LEVELS.length; i++) {
    if (Math.abs(ZOOM_LEVELS[i] - pixelsPerTile) < Math.abs(ZOOM_LEVELS[best] - pixelsPerTile)) {
      best = i;
    }
  }
  return best;
}

let zoomIndex = nearestZoomIndex(startZoom || 8);
let tileSize = ZOOM_LEVELS[zoomIndex];
const renderer = new MapRenderer(canvas, seed, tileSize, pixelRatio);
const minimap = new MiniMap(minimapCanvas, seed, pixelRatio);

/** Welt-Tile in der Bildmitte. */
let camX = startX;
let camY = startY;

function view(): IsoView {
  return { centerX: camX, centerY: camY, tileSize, width: viewWidth, height: viewHeight };
}

/**
 * Geländehöhe in Tiles für die Mausabfrage. Abgetastet so grob wie das
 * Gitter des Gelände-Shaders, damit der Treffer auf derselben Fläche liegt,
 * die man sieht.
 */
function zAt(x: number, y: number): number {
  // Mit der aktuellen Reliefstärke - flachgelegt trifft der Klick sonst
  // die Stelle, an der der Berg stünde.
  return reliefZ(mapGen.heightAt(x, y, 4 / (tileSize * pixelRatio))) * renderer.relief;
}

/** Welt-Punkt unter einer Canvas-Position (CSS-Pixel), mit Relief. */
function pick(px: number, py: number) {
  return pickWorld(view(), px, py, zAt);
}

function tileAt(px: number, py: number) {
  const p = pick(px, py);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}

window.addEventListener('resize', resize);

let mouseTileX: number | undefined;
let mouseTileY: number | undefined;
/** Letzte Mausposition auf dem Canvas in CSS-Pixeln, solange der Zeiger drauf ist. */
let mousePixelX: number | undefined;
let mousePixelY: number | undefined;

const keys: Record<string, boolean> = {};

/**
 * Zoomt so, dass das Welt-Tile unter dem Ankerpunkt dort stehen bleibt.
 * Anker ist der Mauszeiger, solange er über der Karte ist, sonst die Bildmitte.
 */
function setZoom(index: number, anchorX?: number, anchorY?: number) {
  const clamped = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index));
  if (clamped === zoomIndex) return;

  const ax = anchorX ?? mousePixelX ?? viewWidth / 2;
  const ay = anchorY ?? mousePixelY ?? viewHeight / 2;

  // Welt-Punkt unter dem Anker vor dem Zoom ...
  const anchor = pick(ax, ay);

  zoomIndex = clamped;
  tileSize = ZOOM_LEVELS[zoomIndex];
  renderer.tileSize = tileSize;

  // ... und danach wieder genau unter den Anker legen
  const center = centerFor(view(), anchor.x, anchor.y, anchor.z, ax, ay);
  camX = center.x;
  camY = center.y;

  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  zoomEl.textContent = `${tileSize}px`;
}

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'e') setZoom(zoomIndex + 1);
  if (e.key === 'q') setZoom(zoomIndex - 1);
  if (e.key === 'Escape') {
    if (selected) select(null);
    else clearSelection();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') demolishSelected();
  // H wie in AoE2 - "Home".
  if (e.key.toLowerCase() === 'h') cycleTownCenter();
  if (e.key.toLowerCase() === 'm') toggleSound();
  // Punkt wie in AoE2: alle untätigen Dorfbewohner (mit Umschalt: einzeln reihum).
  if (e.key === '.' || e.key === ':') selectIdleVillager(!e.shiftKey);
  if (e.key === ' ') {
    // Leertaste gedrückt halten legt das Gelände flach (siehe loop). Sonst
    // scrollt die Seite oder ein fokussierter Knopf wird ausgelöst - bei
    // Knöpfen passiert das erst beim Loslassen, darum auch der Fokus weg.
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
  }
  if (e.key.toLowerCase() === VILLAGER.key) trainVillager();

  const byKey = BUILDING_ORDER.find((type) => BUILDINGS[type].key === e.key);
  if (byKey) select(selected === byKey ? null : byKey);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  setZoom(
      zoomIndex + (e.deltaY < 0 ? 1 : -1),
      e.clientX - rect.left,
      e.clientY - rect.top,
  );
}, { passive: false });

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const target = minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, view());
  camX = target.x;
  camY = target.y;
});

minimapCanvas.addEventListener('mousemove', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const world = minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, view());

  hoverCoordsEl.textContent = `${Math.floor(world.x)}, ${Math.floor(world.y)}`;
});

minimapCanvas.addEventListener('mouseleave', () => {
  hoverCoordsEl.textContent = '-, -';
});

/** Markierung und Anzeige auf das Tile unter der angegebenen Canvas-Position setzen. */
function updateHoveredTile(mouseX: number, mouseY: number) {
  mousePixelX = mouseX;
  mousePixelY = mouseY;
  const tile = tileAt(mouseX, mouseY);
  if (tile.x === mouseTileX && tile.y === mouseTileY) return;
  mouseTileX = tile.x;
  mouseTileY = tile.y;
  updateCursor();

  cursorCoordsEl.textContent = `${mouseTileX}, ${mouseTileY}`;

  const info = probe.getTile(mouseTileX, mouseTileY);
  // Baum- oder Straucharten dazu, z. B. "Holz (Eiche)".
  const kind = resources.kindAt(mouseTileX, mouseTileY);
  const resource =
    info.resource === 'none'
      ? ''
      : ` | ${RESOURCE_TYPE_LABEL[info.resource]}${kind ? ` (${kind})` : ''} ${info.resourceAmount}`;
  const building = world.at(mouseTileX, mouseTileY);
  const built = building ? ` | ${BUILDINGS[building.type].label}` : '';
  tileInfoEl.textContent =
    `${TILE_TYPE_LABEL[info.tileType]} | h ${info.height.toFixed(2)}` +
    ` | Feuchte ${info.moisture.toFixed(2)} | Temp ${info.temperature.toFixed(2)}${resource}${built}`;
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  updateHoveredTile(e.clientX - rect.left, e.clientY - rect.top);
});

canvas.addEventListener('mouseleave', () => {
  mouseTileX = undefined;
  mouseTileY = undefined;
  mousePixelX = undefined;
  mousePixelY = undefined;
  cursorCoordsEl.textContent = '-, -';
  tileInfoEl.textContent = '-';
});

// FPS Counter
let lastTime = performance.now();
let lastFpsUpdate = performance.now();
let frames = 0;
let fps = 0;
let lastUrlUpdate = 0;
let lastUiUpdate = 0;
let lastSave = 0;

/**
 * Die Wirtschaft läuft in festen Schritten, unabhängig von der Bildrate. Sonst
 * fördert ein schneller Rechner mehr als ein langsamer - und beim Zurückkehren
 * aus einem anderen Tab würde ein einzelner riesiger Schritt alles leerräumen.
 */
const TICK = 0.1;
let tickAccumulator = 0;

/** Wird je Frame neu befüllt statt neu angelegt. */
const overlay: EntityInstance[] = [];
const minimapOverlay: EntityInstance[] = [];

/**
 * canPlace() sucht den ganzen Umkreis nach Vorkommen ab - bei Radius 4 sind
 * das 81 Geländeabfragen. Für die Vorschau wird das Ergebnis gemerkt, solange
 * Feld und Gebäudetyp gleich bleiben; sonst liefe die Suche je Bild neu.
 */
let lastCheck = { x: NaN, y: NaN, type: '' as string, result: null as string | null };

function placementCheck(x: number, y: number, type: BuildingType): string | null {
  if (lastCheck.x !== x || lastCheck.y !== y || lastCheck.type !== type) {
    lastCheck = { x, y, type, result: world.canPlace(x, y, type) };
  }
  return lastCheck.result;
}

/** Nach jedem Eingriff verwerfen - Vorrat und belegte Felder haben sich geändert. */
function invalidatePlacementCheck() {
  lastCheck.x = NaN;
}

/** Gebäude, erschöpfte Felder und - im Baumodus - die Vorschau. */
function collectOverlay(blend: number) {
  overlay.length = 0;
  const visible = visibleWorldRect(view());
  if (tileSize >= RESOURCE_OBJECTS_MIN_ZOOM) {
    resources.update(visible, camX, camY);
    resources.instances(visible, world, overlay, selectedResource, blend);
  }
  world.instances(visible, overlay, blend,
      { villagers: selectedVillagers, building: selectedBuilding });

  // Auswahl: grüner Ring unter jedem Dorfbewohner, Fläche unter dem Gebäude.
  for (const v of world.villagers) {
    if (!selectedVillagers.has(v.id)) continue;
    const p = world.villagerPosition(v, blend);
    overlay.push({
      x: p.x - 0.5, y: p.y - 0.5, size: VILLAGER.size * 1.5,
      color: [110, 231, 160], shape: SHAPE.flat, alpha: 0.5,
    });
  }
  const building = selectedBuilding ? world.building(selectedBuilding) : undefined;
  if (building) {
    overlay.push({
      x: building.x, y: building.y, size: BUILDINGS[building.type].footprint + 0.4,
      color: [110, 231, 160], shape: SHAPE.flat, alpha: 0.35,
    });
    // Sammelpunkt: Fahne in der Spielerfarbe, nur solange das Gebäude
    // ausgewählt ist - sonst stünden überall Fahnen herum.
    if (building.rally) {
      overlay.push({
        // Etwas zur Kamera hin versetzt: auf einem Vorkommen steht sie so vor
        // dem Baum oder Fels statt dahinter.
        x: building.rally.x + 0.3, y: building.rally.y + 0.3, size: 0.54,
        color: BUILDINGS.town_center.color.toRGB(), shape: SHAPE.rallyFlag, alpha: 1,
      });
      overlay.push({
        x: building.rally.x, y: building.rally.y, size: 0.5,
        color: [110, 231, 160], shape: SHAPE.flat, alpha: 0.35,
      });
    }
  }
  if (selectedResource) {
    overlay.push({
      x: selectedResource.x, y: selectedResource.y, size: 1,
      color: [110, 231, 160], shape: SHAPE.flat, alpha: 0.3,
    });
  }

  if (selected === null || mouseTileX === undefined || mouseTileY === undefined) return;
  const def = BUILDINGS[selected];
  const blocked = placementCheck(mouseTileX, mouseTileY, selected);

  // Die belegte Fläche wird mit eingefärbt: bei einem 3x3-Gebäude sieht man
  // sonst nicht, welche Felder es tatsächlich beansprucht.
  overlay.push({
    x: mouseTileX,
    y: mouseTileY,
    size: def.footprint,
    color: blocked ? [220, 70, 80] : [110, 231, 160],
    shape: SHAPE.flat,
    alpha: 0.22,
  });
  overlay.push({
    x: mouseTileX,
    y: mouseTileY,
    size: def.size,
    color: blocked ? [220, 70, 80] : def.color.toRGB(),
    shape: def.shape,
    alpha: 0.7,
  });
}

function loop(now: number) {
  // Begrenzt, damit die Kamera nach einem Tab-Wechsel nicht quer über die Karte
  // springt (dt wäre dann die gesamte Zeit im Hintergrund).
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  // FPS berechnen
  frames++;
  if (now - lastFpsUpdate >= 500) {
    fps = Math.round((frames * 1000) / (now - lastFpsUpdate));
    fpsEl.textContent = fps.toString();
    frames = 0;
    lastFpsUpdate = now;
  }

  // Gescrollt wird in Bildschirmrichtung, nicht entlang der Weltachsen - die
  // liegen in der Rautenansicht diagonal. Das Tempo ist in Tiles je Sekunde
  // gleich, aber auf 3200 Pixel je Sekunde gedeckelt: ganz nah heran zoomt
  // man, um genau hinzusehen - dort flöge die Karte sonst in einem
  // Zehntel einer Sekunde vorbei.
  const speed = Math.min(400 * (tileSize / 4), 3200) * dt;
  let dx = 0;
  let dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= speed;
  if (keys['s'] || keys['arrowdown']) dy += speed;
  if (keys['a'] || keys['arrowleft']) dx -= speed;
  if (keys['d'] || keys['arrowright']) dx += speed;
  // Leertaste halten: Relief sinkt flach, um hinter Berge zu sehen. Weich
  // überblendet, damit man sieht, was wohin gehört. Nie ganz 0 - siehe
  // MapRenderer.relief.
  const targetRelief = keys[' '] ? 0.02 : 1;
  const reliefBefore = renderer.relief;
  renderer.relief += (targetRelief - renderer.relief) * Math.min(1, dt * 10);
  if (Math.abs(targetRelief - renderer.relief) < 0.002) renderer.relief = targetRelief;
  const reliefChanged = renderer.relief !== reliefBefore;

  if (dx !== 0 || dy !== 0 || reliefChanged) {
    const d = panDelta(tileSize, dx, dy);
    camX += d.x;
    camY += d.y;
    // Unter dem stehenden Zeiger zieht jetzt anderes Gelände durch.
    if (mousePixelX !== undefined && mousePixelY !== undefined) {
      updateHoveredTile(mousePixelX, mousePixelY);
    }
  }

  // Feste Schritte. Der Rest bleibt für den nächsten Frame liegen, damit über
  // die Zeit weder etwas verloren geht noch doppelt gefördert wird.
  tickAccumulator += dt;
  while (tickAccumulator >= TICK) {
    world.tick(TICK);
    tickAccumulator -= TICK;
  }

  collectOverlay(tickAccumulator / TICK);
  renderer.render(camX, camY, mouseTileX, mouseTileY, overlay);

  const current = view();
  minimapOverlay.length = 0;
  world.instances(minimap.viewRectOf(current), minimapOverlay, tickAccumulator / TICK);
  minimap.render(current, minimapOverlay);

  const camCenterTileX = Math.round(camX);
  const camCenterTileY = Math.round(camY);
  posEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;
  sampleEl.textContent = (1 / (tileSize * pixelRatio)).toFixed(4);
  camCoordsEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;

  if (now - lastUrlUpdate > 500) {
    updateURL(seed, camCenterTileX, camCenterTileY, tileSize);
    lastUrlUpdate = now;
  }

  // Der Vorrat wächst kontinuierlich, aber fünfmal je Sekunde abzulesen reicht -
  // je Frame wäre es nur unruhig und würde das Layout ständig neu rechnen.
  if (now - lastUiUpdate > 200) {
    updateResourceUI();
    lastUiUpdate = now;
  }
  if (now - lastSave > 3000) {
    world.save();
    lastSave = now;
  }

  requestAnimationFrame(loop);
}

zoomEl.textContent = `${tileSize}px`;
updateCompass();
updateResourceUI();
requestAnimationFrame(loop);
document.title = `Map - ${seed}`;