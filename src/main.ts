
import { MapGenerator } from './noise';
import {
  visibleWorldRect,
} from './gl/iso';
import {
  MapRenderer,
  MiniMap,
  TILE_TYPE_LABEL,
  Terrain,
} from './map';
import type { EntityInstance } from './gl/entityRenderer';
import { setAnimationSpeed, setAnimationsPaused } from './gl/entityRenderer';
import {
  BUILDINGS,
  BUILDING_ORDER,
  CROP_ORDER,
  CROPS,
  RESOURCE_LABEL,
  type ResourceKind,
  player,
  PLAYER_COLORS,
  VILLAGER,
  type BuildingType,
  type CropType,
} from './world/catalog';
import { World } from './world/world';
import { worldInstances } from './world/render';
import { Selection } from './game/Selection';
import { Camera } from './game/Camera';
import { Picker, RESOURCE_OBJECTS_MIN_ZOOM } from './game/Picker';
import { hoverDescription, type HoverTarget } from './game/hoverInfo';
import { Compass, isDirection, rotateToFace } from './game/Compass';
import { Ground } from './game/Ground';
import { worldSounds } from './game/worldSounds';
import { minimapDots, placementOverlay, selectionOverlay } from './game/overlay';
import { selectionView } from './game/selectionView';
import type { UnitProducer } from './world/building';
import { ResourceBar } from './components/ResourceBar';
import { BuildMenu } from './components/BuildMenu';
import { mountGame } from './components/Hud';
import { renderSelection } from './components/SelectionPanel';
import { SettingsMenu } from './components/SettingsMenu';
import { StartScreen } from './components/StartScreen';
import { loadSettings, saveSettings } from './settings';
import { ResourceField } from './world/resources';
import { Sound } from './audio';
import { Music } from './music';
import { GATHER_CURSOR, RALLY_CURSOR } from './cursors';
import { currentSeed, DEFAULT_SEED, deleteSave, switchWorld, takeStartRequest } from './worlds';

// Erst Spielfeld-Canvas und Oberfläche (components/Hud.tsx) - danach werden
// ihre Teile hier über ihre IDs gefunden.
mountGame(document.getElementById('app')!);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const posEl = document.getElementById('pos')!;
const sampleEl = document.getElementById('sampling')!;
const hoverCoordsEl = document.getElementById('hover-coords')!;
const camCoordsEl = document.getElementById('cam-coords')!;
const cursorCoordsEl = document.getElementById('cursor-coords')!;
const fpsEl = document.getElementById('fps')!;
const tileInfoEl = document.getElementById('tile-info')!;
const objectLabelEl = document.getElementById('object-label')!;
const resourceInfoEl = document.getElementById('resource-info')!;
const zoomEl = document.getElementById('zoom')!;
const stockEl = document.getElementById('stock')!;
const buildEl = document.getElementById('build')!;
const hintEl = document.getElementById('hint')!;
const selectionEl = document.getElementById('selection')!;
const actionsEl = document.getElementById('actions')!;
const boxEl = document.getElementById('select-box')!;

/** Zoom beim Start: CSS-Pixel je Tile. */
const DEFAULT_ZOOM = 32;
/** Kamera: Bildmitte, Zoomstufe, Sichtfläche (game/Camera.ts). */
const camera = new Camera(DEFAULT_ZOOM);

function applyCanvasSize() {
  camera.fitWindow();

  // Gezeichnet wird in echten Bildschirmpixeln, angezeigt in CSS-Pixeln.
  // Sonst rendert der Browser das Canvas klein und skaliert es hoch.
  canvas.width = Math.round(camera.width * camera.pixelRatio);
  canvas.height = Math.round(camera.height * camera.pixelRatio);
  canvas.style.width = `${camera.width}px`;
  canvas.style.height = `${camera.height}px`;
}

function resize() {
  // Die Kamera beschreibt die Bildmitte - die bleibt beim Größenwechsel stehen.
  applyCanvasSize();

  renderer.pixelRatio = camera.pixelRatio;
  minimap.setPixelRatio(camera.pixelRatio);
}

applyCanvasSize();

/** Wo es in der Standardwelt losgeht - dort liegt ein guter Platz fürs erste Dorf. */
const DEFAULT_START = { x: 88, y: -59 };

// Die Adresse bleibt "/": Welt und Stelle stehen nicht mehr darin. Alte Links
// (/<seed>/<x>-<y>?zoom=) werden aufgeräumt; die Welt wählt man im Hauptmenü.
if (window.location.pathname !== '/' || window.location.search) window.history.replaceState(null, '', '/');

const seed = currentSeed();
const mapGen = new MapGenerator(seed);
const terrain = new Terrain(mapGen, seed);
const world = new World(terrain, seed);

/**
 * Wo es losgeht: beim ersten Hauptgebäude, in der Standardwelt bei
 * DEFAULT_START, sonst auf der nächsten Wiese um den Ursprung, um die herum
 * fester Boden liegt - der Ursprung selbst kann mitten im Meer liegen.
 */
function startPoint(): { x: number; y: number } {
  const home = world.townCenters()[0];
  if (home) return { x: home.x, y: home.y };
  if (seed === DEFAULT_SEED) return DEFAULT_START;
  const solid = (x: number, y: number) => {
    const t = terrain.getTile(x, y).tileType;
    return t !== 'water' && t !== 'deep_water' && t !== 'mountain' && t !== 'snow';
  };
  for (let r = 0; r <= 600; r += 3) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 3));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      if (terrain.getTile(x, y).tileType !== 'grass') continue;
      // Genug Platz für ein Dorf: ringsum im Abstand von 5 Tiles kein Wasser, kein Fels.
      if ([[5, 0], [-5, 0], [0, 5], [0, -5], [4, 4], [-4, 4], [4, -4], [-4, -4]].every(([dx, dy]) => solid(x + dx, y + dy))) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
}
const { x: startX, y: startY } = startPoint();
// Holzfäller arbeiten am liegenden Stamm - wie lang der ist, weiß die Darstellung.
world.treeLength = (x, y) => resources.treeLengthAt(x, y);
const resources = new ResourceField(terrain, mapGen);
const sound = new Sound();
/** Hintergrundmusik aus assets/music/ - der Ton-Schalter (M) gilt auch für sie. */
const music = new Music();
music.mute = !sound.enabled;


/** Aktuell zum Bauen ausgewählter Typ, oder null im Ansichtsmodus. */
let selected: BuildingType | null = null;

// --- Baumenü ---------------------------------------------------------------

const buildMenu = new BuildMenu(buildEl, player.color.toRGB(), {
  build: (type) => select(selected === type ? null : type),
  // Feld aus dem Untermenü: mit dieser Frucht abstecken.
  crop: (crop) => {
    world.nextFarmCrop = crop;
    select('farm');
  },
  back: () => {
    buildMenu.showFarms(false);
    if (selected === 'farm') select(null);
  },
});

function select(type: BuildingType | null) {
  selected = type;
  // Wer baut, wählt nicht gleichzeitig aus - sonst tut ein Klick zwei Dinge.
  if (type) clearSelection();
  // Kein Feld mehr: zurück vom Untermenü der Felder zum Baumenü.
  if (type !== 'farm') buildMenu.showFarms(false);
  buildMenu.setPressed(type, world.nextFarmCrop);
  updateCursor();
}

/**
 * Zeiger je nach Lage: im Baumodus ein Feld-Zeiger, mit ausgewählten
 * Dorfbewohnern über einem Vorkommen das passende Werkzeug - Axt für Holz,
 * Spitzhacke für Stein und Gold, Beeren für Beeren. Sonst das Fadenkreuz.
 */
function updateCursor() {
  let cursor = 'crosshair';
  const trainer = selection.focused();
  if (selected) {
    cursor = 'copy';
  } else if (trainer?.isUnitProducer()) {
    cursor = RALLY_CURSOR;
  } else if (selection.villagers.size > 0 && mouseTileX !== undefined && mouseTileY !== undefined) {
    // Zeigt der Zeiger auf ein Objekt (Baumkrone, Fels), gilt dessen Feld.
    const own = world.resourceInfo(mouseTileX, mouseTileY);
    const t = world.at(mouseTileX, mouseTileY) || (own && own.type !== 'wood') ? undefined : hoverObject;
    const [tx, ty] = t ? [t.x, t.y] : [mouseTileX, mouseTileY];
    const found = world.remainingAt(tx, ty);
    if (found.type && found.amount > 0 && !world.at(tx, ty)) {
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

/** Reihenfolge in der Rohstoffleiste - wie in AoE2: Holz, Nahrung, Gold, Stein. */
const RESOURCE_BAR_ORDER: ResourceKind[] = ['wood', 'food', 'gold', 'stone'];
// Das Zahnrad am Ende öffnet das Menü (wie F10).
const resourceBar = new ResourceBar(stockEl, RESOURCE_BAR_ORDER, player.color.toRGB(), () => world.save(), () => menu.toggle());

// --- Einstellungen und Menü ------------------------------------------------

const settings = loadSettings();
/** Angehalten (F3 oder Menü): die Welt steht, Kamera und Auswahl gehen weiter. */
let paused = false;
const pausedEl = document.getElementById('paused')!;

function applySettings() {
  sound.volume = settings.volume;
  music.volume = settings.music;
  player.color = (PLAYER_COLORS[settings.playerColor] ?? PLAYER_COLORS.green).color;
  resourceBar.setPlayerColor(player.color.toRGB());
  buildMenu.setPlayerColor(player.color.toRGB());
  // Mühlenflügel und Fahnen laufen mit der Spielgeschwindigkeit.
  setAnimationSpeed(settings.speed);
  document.getElementById('ui')!.hidden = !settings.showHelp;
  document.getElementById('debug')!.hidden = !settings.showDebug;
}

// × an Tastenhilfe und Entwickler-Infos sowie die Tasten I und P: ein- und
// ausblenden wie im Menü - und so gespeichert.
function setPanels(patch: Partial<typeof settings>) {
  Object.assign(settings, patch);
  saveSettings(settings);
  applySettings();
  menu.refresh();
}
document.getElementById('help-close')!.addEventListener('click', () => setPanels({ showHelp: false }));
document.getElementById('debug-close')!.addEventListener('click', () => setPanels({ showDebug: false }));

function togglePause() {
  paused = !paused;
  pausedEl.hidden = !paused;
  // Beim Neuladen wieder angehalten, wenn es jetzt angehalten ist.
  settings.paused = paused;
  saveSettings(settings);
  // Auch Mühlenflügel und Fahnen halten an.
  setAnimationsPaused(paused);
  menu.refresh();
}

const menu = new SettingsMenu(settings, {
  apply: applySettings,
  soundEnabled: () => sound.enabled,
  toggleSound: () => toggleSound(),
  paused: () => paused,
  togglePause,
  musicTitle: () => music.title,
  nextTrack: () => {
    music.next();
    // Der Titel wechselt sofort - das Menü zeigt ihn gleich an.
    menu.refresh();
  },
  // Vorher speichern - im Hauptmenü steht der Stand dann unter Weiterspielen.
  mainMenu: () => {
    world.save();
    start.open();
  },
  save: () => world.save(),
});

function startNewGame() {
  world.reset();
  clearSelection();
  if (paused) togglePause();
  updateResourceUI();
  goToStart();
}

/** Kamera zurück an den Start - im Hauptmenü ist sie weitergezogen. */
function goToStart() {
  const home = startPoint();
  camera.moveTo(home.x, home.y);
}

/** Hauptmenü beim Öffnen der Seite; bis man spielt, steht die Welt. */
const start = new StartScreen({
  hasSave: () => world.hasTownCenter() || world.villagers.length > 0,
  world: seed,
  continueGame: goToStart,
  // Dieselbe Welt beginnt hier von vorn, eine andere nach dem Neuladen.
  newGame: (s) => (s === seed ? startNewGame() : switchWorld(s, 'new')),
  loadGame: (s) => (s === seed ? goToStart() : switchWorld(s, 'continue')),
  // Die jetzige Welt steht im Speicher und würde sich neu speichern - also leeren.
  deleteGame: (s) => (s === seed ? startNewGame() : deleteSave(s)),
  save: () => world.save(),
  openSettings: () => menu.open(true),
});

/** Vorrat und Verfügbarkeit der Bauknöpfe. Läuft nicht je Frame, sondern getaktet. */
function updateResourceUI() {
  const pop = world.population();
  const { counts, idle } = world.gatherers();
  // Wie in AoE2: Holz, Nahrung, Gold, Stein - im Symbol, wie viele
  // Dorfbewohner gerade daran sammeln.
  resourceBar.update({
    order: RESOURCE_BAR_ORDER,
    stock: world.stock,
    labels: RESOURCE_LABEL,
    gatherers: counts,
    population: pop,
    idle,
    villagerLabel: VILLAGER.label,
  });

  buildMenu.setEnabled((type) => world.affordable(type) && (type === 'town_center' || world.hasTownCenter()));
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
  music.mute = !sound.enabled;
  updateSoundButton();
  menu.refresh();
}

soundButton.addEventListener('click', toggleSound);
updateSoundButton();
applySettings();

// Geräusche aus der Welt - nur, was man sieht (game/worldSounds.ts).
world.onEvent = worldSounds(sound, camera, (x, y) => ground.heightAt(x, y));

// --- Kompass ---------------------------------------------------------------

/** Kompass über der Minimap (game/Compass.ts). */
const compass = new Compass(document.getElementById('compass')!, (dir) => faceDirection(dir));

/** Dreht die Ansicht so, dass die Richtung `dir` nach oben zeigt. */
function faceDirection(dir: string) {
  // Gedreht wird um die Stelle, die man in der Bildmitte sieht - mit ihrer
  // Geländehöhe. Um den Punkt auf Meereshöhe gedreht, wanderte ein Dorf auf
  // einem Hügel beim Drehen aus dem Bild.
  const pivot = picker.point(camera.centerX, camera.centerY);
  rotateToFace(dir);
  camera.centerOn(pivot.x, pivot.y, pivot.z);
  compass.update();
  // Die Blickrichtung bleibt beim Neuladen.
  settings.facing = dir;
  saveSettings(settings);
  // Unter dem Zeiger liegt jetzt eine andere Stelle.
  mouseTileX = undefined;
  mouseTileY = undefined;
  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  invalidatePlacementCheck();
}


// --- Auswahl ---------------------------------------------------------------

/** Was ausgewählt ist: Dorfbewohner, Gebäude oder ein Vorkommen (game/Selection.ts). */
const selection = new Selection(world);

/** Doppelklick: alle gleichartigen Gebäude in diesem Umkreis (Tiles). */
const SAME_TYPE_RADIUS = 15;

function clearSelection() {
  selection.clear();
  updateSelectionUI();
}

/**
 * Linksklick ohne Ziehen: Dorfbewohner, sonst Gebäude, sonst Vorkommen, sonst
 * nichts. Mit Umschalt (`add`) kommt es zur Auswahl dazu oder fällt heraus;
 * ein Doppelklick (`same`) auf ein Gebäude wählt alle gleichartigen in der Nähe.
 */
function clickSelect(px: number, py: number, add: boolean, same = false) {
  const villager = picker.villager(px, py);
  selection.resource = null;
  if (villager) {
    selection.clearBuildings();
    if (!add) selection.villagers.clear();
    if (add && selection.villagers.has(villager.id)) selection.villagers.delete(villager.id);
    else selection.villagers.add(villager.id);
  } else {
    const { x, y } = picker.target(px, py);
    const building = world.at(x, y);
    selection.villagers.clear();
    if (building) {
      const anchor = world.anchorOf(building);
      if (same) {
        // Felder: das ganze zusammenhängende Feld, sonst gleichartige in der Nähe.
        const near = building.isFarm() ? world.farmGroup(building) : [...world.allBuildings()].filter((b) => b.type === building.type
          && Math.hypot(b.x - building.x, b.y - building.y) <= SAME_TYPE_RADIUS);
        selection.selectBuildings([...(add ? selection.buildings : []), ...near.map((b) => world.anchorOf(b))], anchor);
      } else if (add) {
        const set = new Set(selection.buildings);
        if (set.has(anchor)) set.delete(anchor);
        else set.add(anchor);
        selection.selectBuildings(set, set.has(anchor) ? anchor : selection.focusedBuilding);
      } else {
        selection.selectBuildings([anchor], anchor);
      }
    } else if (!add) {
      selection.clearBuildings();
      if (world.resourceInfo(x, y)) selection.resource = { x, y };
    }
  }
  updateSelectionUI();
}

/** Aufziehen eines Rechtecks: alle Dorfbewohner darin. */
function boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean) {
  const [left, right] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [top, bottom] = y0 < y1 ? [y0, y1] : [y1, y0];
  if (!add) selection.villagers.clear();
  selection.clearBuildings();
  selection.resource = null;
  for (const v of world.villagers) {
    const s = picker.villagerScreen(v);
    if (s.x >= left && s.x <= right && s.y >= top && s.y <= bottom) selection.villagers.add(v.id);
  }
  updateSelectionUI();
}

/** Ab so vielen Pixeln Bewegung wird aus dem Klick ein Auswahlrechteck. */
const DRAG_THRESHOLD = 5;
let drag: { x: number; y: number; active: boolean } | null = null;
/** Felder werden Tile für Tile markiert - mit gedrückter Taste auch im Ziehen. */
let sowing = false;

/** Im Baumodus ein Gebäude bzw. Feldstück setzen; false, wenn es nicht ging. */
function placeHere(x: number, y: number, quiet = false): boolean {
  if (!selected) return false;
  const reason = world.place(x, y, selected);
  invalidatePlacementCheck();
  if (reason) {
    if (!quiet) hint(reason);
    return false;
  }
  sound.play('place');
  updateResourceUI();
  // Reicht der Vorrat nicht für ein weiteres, zurück in den Ansichtsmodus -
  // sonst klickt man ins Leere und bekommt nur Fehlermeldungen.
  if (!world.affordable(selected)) select(null);
  return true;
}

function canvasPoint(e: MouseEvent) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const p = canvasPoint(e);

  if (selected) {
    const { x, y } = picker.tile(p.x, p.y);
    sowing = selected === 'farm';
    placeHere(x, y);
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
  if (e.button === 0) sowing = false;
  if (e.button !== 0 || !drag) return;
  const p = canvasPoint(e);
  if (drag.active) boxSelect(drag.x, drag.y, p.x, p.y, e.shiftKey);
  // e.detail zählt die Klicks kurz hintereinander - 2 ist ein Doppelklick.
  else clickSelect(p.x, p.y, e.shiftKey, e.detail >= 2);
  drag = null;
  boxEl.hidden = true;
});

/**
 * Rechte Maustaste: gedrückt halten und ziehen verschiebt die Karte (wie
 * WASD), kurz klicken ist ein Befehl. Entschieden wird erst beim Loslassen -
 * das Kontextmenü-Ereignis kommt auf dem Mac schon beim Drücken.
 */
let rightDrag: { x: number; y: number; moved: boolean } | null = null;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 2) return;
  rightDrag = { x: e.clientX, y: e.clientY, moved: false };
});

window.addEventListener('mousemove', (e) => {
  if (!rightDrag || !(e.buttons & 2)) return;
  const dx = e.clientX - rightDrag.x;
  const dy = e.clientY - rightDrag.y;
  if (!rightDrag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
  rightDrag.moved = true;
  canvas.style.cursor = 'grabbing';
  // Die Karte folgt der Maus: die Kamera geht in die Gegenrichtung.
  camera.panPixels(-dx, -dy);
  rightDrag.x = e.clientX;
  rightDrag.y = e.clientY;
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 2 || !rightDrag) return;
  const moved = rightDrag.moved;
  rightDrag = null;
  if (moved) {
    updateCursor();
    return;
  }
  if (e.target === canvas) rightClick(canvasPoint(e));
});

/** Rechtsklick: im Baumodus abbrechen, mit Dorfbewohnern ein Befehl. */
function rightClick(p: { x: number; y: number }) {
  if (selected) {
    select(null);
    return;
  }
  // Auf das Objekt gezielt (Baumkrone, Fels) zählt dessen Feld.
  const { x, y } = picker.target(p.x, p.y);

  // Ausbildende Gebäude ausgewählt: Rechtsklick setzt den Sammelpunkt - bei
  // mehreren für alle.
  const trainers = selection.chosenBuildings().filter((b): b is UnitProducer => b.isUnitProducer());
  if (trainers.length > 0) {
    let reason: string | null = null;
    for (const t of trainers) reason = world.setRally(t, x, y) ?? reason;
    if (reason) hint(reason);
    else sound.play('click');
    updateSelectionUI();
    return;
  }

  if (selection.villagers.size === 0) return;
  // Auf ein Tier (lebend oder erlegt): jagen bzw. zerlegen.
  const at = picker.point(p.x, p.y);
  const prey = world.animalNear(at.x, at.y, 0.6);
  if (prey) {
    world.hunt(selection.villagers, prey);
    sound.play('click', 0.7);
    updateSelectionUI();
    return;
  }
  const reason = world.command(selection.villagers, x, y);
  if (reason) hint(reason);
  else sound.play('click', 0.7);
  updateSelectionUI();
}

/** Einen Dorfbewohner ausbilden: im ausgewählten Hauptgebäude, sonst im nächstgelegenen. */
/** Dorfbewohner einreihen - `count` auf einmal (Umschalt: 5, wie in AoE2). */
function trainVillager(count = 1) {
  // Ausgewählte Hauptgebäude, sonst das nächstgelegene. Bei mehreren kommt
  // jeder Dorfbewohner in die kürzeste Warteschlange.
  const selectedTrainers = selection.chosenBuildings().filter((b): b is UnitProducer => b.isUnitProducer());
  const nearest = world.nearestTownCenter(camera.x, camera.y);
  const trainers = selectedTrainers.length > 0 ? selectedTrainers : nearest ? [nearest] : [];
  if (trainers.length === 0) {
    hint('Baue zuerst ein Hauptgebäude');
    return;
  }
  let reason: string | null = null;
  let queued = 0;
  for (let i = 0; i < count; i++) {
    const open = trainers.filter((b) => !b.isQueueFull);
    const building = (open.length > 0 ? open : trainers).reduce((a, b) => (b.queuedUnits < a.queuedUnits ? b : a));
    reason = world.train(building);
    if (reason) break;
    queued++;
  }
  // Ein Teil ging: kein Fehler, nur wenn gar keiner in die Schlange kam.
  if (queued === 0 && reason) hint(reason);
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
  selection.clearBuildings();
  selection.resource = null;
  let target: { x: number; y: number };
  if (all) {
    selection.villagers.clear();
    for (const v of idle) selection.villagers.add(v.id);
    // Zur Mitte der Gruppe - verteilt über die Karte zum ersten.
    const mx = idle.reduce((sum, v) => sum + v.x, 0) / idle.length;
    const my = idle.reduce((sum, v) => sum + v.y, 0) / idle.length;
    const spread = Math.max(...idle.map((v) => Math.hypot(v.x - mx, v.y - my)));
    target = spread < 40 ? { x: mx, y: my } : idle[0];
  } else {
    // Nach dem gerade ausgewählten weitermachen, damit wiederholtes Klicken
    // alle der Reihe nach durchgeht.
    const current = selection.villagers.size === 1 ? [...selection.villagers][0] : -1;
    const index = idle.findIndex((v) => v.id === current);
    const next = idle[(index + 1) % idle.length];
    target = next;
    selection.villagers.clear();
    selection.villagers.add(next.id);
  }
  camera.centerOn(target.x, target.y, ground.heightAt(target.x, target.y));
  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  updateSelectionUI();
}

// Die Knöpfe entstehen bei jeder Aktualisierung neu - darum Delegation, und
// mousedown statt click, damit ein Neuzeichnen zwischen Drücken und Loslassen
// den Klick nicht verschluckt.
for (const panel of [stockEl]) {
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
  const current = centers.findIndex((b) => world.anchorOf(b) === selection.focusedBuilding);
  const next = centers[(current + 1) % centers.length];

  selection.villagers.clear();
  selection.resource = null;
  selection.selectBuildings([world.anchorOf(next)], world.anchorOf(next));
  // Mitte des Gebäudes in die Bildmitte - mit seiner Geländehöhe, sonst
  // säße es auf einem Hügel ein gutes Stück über der Mitte.
  const x = next.x + 0.5;
  const y = next.y + 0.5;
  camera.centerOn(x, y, ground.heightAt(x, y));
  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  updateSelectionUI();
}

function demolishSelected() {
  const buildings = selection.chosenBuildings();
  if (buildings.length === 0) return;
  for (const b of buildings) world.remove(b);
  selection.clearBuildings();
  invalidatePlacementCheck();
  updateResourceUI();
}

/**
 * Knöpfe im Auswahl-Panel - per Delegation, weil das Panel neu gezeichnet
 * wird. Auf mousedown statt click: läuft gerade eine Ausbildung, ersetzt die
 * Fortschrittsanzeige das Panel fünfmal je Sekunde, und ein click, dessen
 * mousedown und mouseup auf verschiedenen Knopf-Elementen landen, fiele weg.
 */
actionsEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const action = (e.target as HTMLElement).closest('button')?.dataset.action;
  if (action === 'train') trainVillager(e.shiftKey ? 5 : 1);
  if (action === 'demolish') demolishSelected();
  if (action === 'crop') {
    const crop = (e.target as HTMLElement).closest('button')?.dataset.crop as CropType | undefined;
    if (!crop || !CROPS[crop]) return;
    // Für das ganze Feld - darauf wird gemeinsam gesät.
    const fields = new Set(selection.chosenBuildings().flatMap((b) => world.farmGroup(b)));
    for (const b of fields) world.setCrop(b, crop);
    sound.play('click');
    updateSelectionUI();
  }
});

/** Zeigt, was ausgewählt ist und was man damit tun kann. Läuft getaktet mit dem Vorrat. */
function updateSelectionUI() {
  selection.prune();
  // Hat die Auswahl Befehle (ein Gebäude), zeigt die Steintafel sie statt des Baumenüs.
  const hasCommands = renderSelection(selectionEl, actionsEl, selectionView(world, selection, resources));
  actionsEl.hidden = !hasCommands;
  buildEl.hidden = hasCommands;
  // Auswahl hat sich vielleicht geändert, oder das Feld unter dem Zeiger ist
  // inzwischen leer gesammelt.
  updateCursor();
}

// Der Speicherstand liegt im localStorage, je Welt einer.
window.addEventListener('beforeunload', () => world.save());

const renderer = new MapRenderer(canvas, seed, camera.tileSize, camera.pixelRatio);
const minimap = new MiniMap(minimapCanvas, seed, camera.pixelRatio);

camera.moveTo(startX, startY);

/**
 * Geländehöhe in Tiles für die Mausabfrage. Abgetastet so grob wie das
 * Gitter des Gelände-Shaders, damit der Treffer auf derselben Fläche liegt,
 * die man sieht.
 */
let lastAnimalCheck = 0;

/** Gelände, wie man es sieht, und sein Abgleich mit dem Shader (game/Ground.ts). */
const ground = new Ground(mapGen, world, renderer, camera);
world.groundAt = (x, y) => ground.groundAt(x, y);

/** Was unter dem Zeiger liegt: Welt-Punkt, Tile, Dorfbewohner, Vorkommen (game/Picker.ts). */
const picker = new Picker(world, resources, camera, ground, () => tickAccumulator / TICK);

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
  const ax = anchorX ?? mousePixelX ?? camera.centerX;
  const ay = anchorY ?? mousePixelY ?? camera.centerY;
  // Welt-Punkt unter dem Anker vor dem Zoom ...
  const anchor = picker.point(ax, ay);
  if (!camera.setZoomIndex(index)) return;
  renderer.tileSize = camera.tileSize;
  // ... und danach wieder genau unter den Anker legen.
  camera.centerOn(anchor.x, anchor.y, anchor.z, ax, ay);

  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  zoomEl.textContent = `${camera.tileSize}px`;
}

window.addEventListener('keydown', (e) => {
  // F10 wie in AoE2: Menü. Solange es offen ist, keine Spieltasten.
  if (e.key === 'F10') {
    e.preventDefault();
    // Im Hauptmenü ohne die Knöpfe, die nur im Spiel Sinn haben.
    if (menu.isOpen()) menu.close();
    else menu.open(start.isOpen());
    return;
  }
  if (menu.isOpen()) {
    if (e.key === 'Escape') menu.close();
    // Ton (M) geht auch mit offenem Menü - dort steht der Schalter ja.
    if (e.key.toLowerCase() === 'm') toggleSound();
    return;
  }
  // Im Hauptmenü gibt es noch nichts zu steuern - nur den Ton (M).
  if (start.isOpen()) {
    if (e.key.toLowerCase() === 'm') toggleSound();
    return;
  }
  // F3 wie in AoE2: Pause.
  if (e.key === 'F3') {
    e.preventDefault();
    togglePause();
    return;
  }
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'e') setZoom(camera.zoomIndex + 1);
  if (e.key === 'q') setZoom(camera.zoomIndex - 1);
  if (e.key === 'Escape') {
    if (buildMenu.farmsOpen) {
      buildMenu.showFarms(false);
      if (selected === 'farm') select(null);
    } else if (selected) select(null);
    else clearSelection();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') demolishSelected();
  // H wie in AoE2 - "Home".
  if (e.key.toLowerCase() === 'h') cycleTownCenter();
  if (e.key.toLowerCase() === 'm') toggleSound();
  // I: Tastenhilfe (Info), P: Entwickler-Infos (Programmierer).
  if (e.key.toLowerCase() === 'i') setPanels({ showHelp: !settings.showHelp });
  if (e.key.toLowerCase() === 'p') setPanels({ showDebug: !settings.showDebug });
  // Punkt wie in AoE2: alle untätigen Dorfbewohner (mit Umschalt: einzeln reihum).
  if (e.key === '.' || e.key === ':') selectIdleVillager(!e.shiftKey);
  if (e.key === ' ') {
    // Leertaste gedrückt halten legt das Gelände flach (siehe loop). Sonst
    // scrollt die Seite oder ein fokussierter Knopf wird ausgelöst - bei
    // Knöpfen passiert das erst beim Loslassen, darum auch der Fokus weg.
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur();
  }
  if (e.key.toLowerCase() === VILLAGER.key) trainVillager(e.shiftKey ? 5 : 1);

  // Im Untermenü der Felder wählen 1, 2, ... die Frucht.
  if (buildMenu.farmsOpen) {
    const crop = CROP_ORDER[Number(e.key) - 1];
    if (crop && world.affordable('farm')) {
      world.nextFarmCrop = crop;
      select('farm');
    }
    return;
  }
  const byKey = BUILDING_ORDER.find((type) => BUILDINGS[type].key === e.key);
  // Das Feld öffnet das Untermenü (Weizen, Mais).
  if (byKey === 'farm') buildMenu.showFarms(true);
  else if (byKey) select(selected === byKey ? null : byKey);
});

/**
 * Mausrad und Trackpad: jede Zoomstufe verdoppelt den Maßstab, also nicht je
 * Ereignis eine Stufe. Ein Mausrad schickt je Raste ein Ereignis (~100 px),
 * ein Trackpad beim Wischen Dutzende kleine samt Nachschwung - gesammelt
 * wird bis etwa eine Raste, dann eine Stufe und kurz Ruhe, damit der
 * Nachschwung nicht weiterzoomt. Zusammenziehen/Spreizen (Pinch, kommt als
 * Rad mit Strg) zählt stärker.
 */
const WHEEL_STEP = 100;
const WHEEL_PAUSE = 220;
let wheelSum = 0;
let wheelLast = 0;
let wheelLocked = 0;

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const now = performance.now();
  // Zeilen bzw. Seiten (Firefox mit Mausrad) in Pixel umrechnen.
  const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
  const delta = e.deltaY * unit * (e.ctrlKey ? 4 : 1);
  // Nach längerer Pause oder in die andere Richtung: von vorn zählen.
  if (now - wheelLast > 250 || Math.sign(delta) !== Math.sign(wheelSum)) wheelSum = 0;
  wheelLast = now;
  if (now < wheelLocked) return;
  wheelSum += delta;
  if (Math.abs(wheelSum) < WHEEL_STEP) return;
  const rect = canvas.getBoundingClientRect();
  setZoom(camera.zoomIndex + (wheelSum < 0 ? 1 : -1), e.clientX - rect.left, e.clientY - rect.top);
  wheelSum = 0;
  wheelLocked = now + WHEEL_PAUSE;
}, { passive: false });

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const target = minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, camera.view());
  camera.moveTo(target.x, target.y);
});

minimapCanvas.addEventListener('mousemove', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const world = minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, camera.view());

  hoverCoordsEl.textContent = `${Math.floor(world.x)}, ${Math.floor(world.y)}`;
});

minimapCanvas.addEventListener('mouseleave', () => {
  hoverCoordsEl.textContent = '-, -';
});

/** Markierung und Anzeige auf das Tile unter der angegebenen Canvas-Position setzen. */
/** Vorkommen, auf dessen Objekt der Zeiger gerade zeigt - für den Sammel-Mauszeiger. */
let hoverObject: { x: number; y: number } | undefined;

function updateHoveredTile(mouseX: number, mouseY: number) {
  mousePixelX = mouseX;
  mousePixelY = mouseY;
  // Nur mit ausgewählten Dorfbewohnern zählt, worauf der Zeiger zeigt.
  const object = selection.villagers.size > 0 ? picker.resourceObject(mouseX, mouseY) : undefined;
  if (object?.x !== hoverObject?.x || object?.y !== hoverObject?.y) {
    hoverObject = object;
    updateCursor();
  }
  const tile = picker.tile(mouseX, mouseY);
  if (tile.x === mouseTileX && tile.y === mouseTileY) return;
  mouseTileX = tile.x;
  mouseTileY = tile.y;
  updateCursor();

  cursorCoordsEl.textContent = `${mouseTileX}, ${mouseTileY}`;

  const info = terrain.getTile(mouseTileX, mouseTileY);
  tileInfoEl.textContent =
    `${TILE_TYPE_LABEL[info.tileType]} | h ${info.height.toFixed(2)}` +
    ` | Feuchte ${info.moisture.toFixed(2)} | Temp ${info.temperature.toFixed(2)}`;
  updateHoverInfo();
}

/**
 * Was unter dem Zeiger steht, in den Entwickler-Infos (game/hoverInfo.ts).
 * Läuft auch getaktet mit, weil sich Figuren bewegen und Sammler leeren,
 * während der Zeiger stillsteht.
 */
function updateHoverInfo() {
  const hovered = mouseTileX !== undefined && mouseTileY !== undefined
    && mousePixelX !== undefined && mousePixelY !== undefined;
  let target: HoverTarget = {};
  if (hovered) {
    const villager = picker.villager(mousePixelX!, mousePixelY!);
    const at = picker.point(mousePixelX!, mousePixelY!);
    target = villager ? { villager } : { animal: world.animalNear(at.x, at.y, 0.6), tile: { x: mouseTileX!, y: mouseTileY! } };
  }
  const { label, text } = hoverDescription(world, resources, target);
  setText(objectLabelEl, label);
  setText(resourceInfoEl, text);
}

/** Text nur setzen, wenn er sich ändert - getaktet sonst unnötige Layouts. */
function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const [before, beforeY] = [mouseTileX, mouseTileY];
  updateHoveredTile(e.clientX - rect.left, e.clientY - rect.top);
  // Felder markieren: jedes überstrichene Tile, auf dem gesät werden kann.
  if (sowing && selected === 'farm' && (e.buttons & 1) && mouseTileX !== undefined && mouseTileY !== undefined
      && (mouseTileX !== before || mouseTileY !== beforeY) && world.sowable(mouseTileX, mouseTileY)) {
    placeHere(mouseTileX, mouseTileY, true);
  }
});

canvas.addEventListener('mouseleave', () => {
  mouseTileX = undefined;
  mouseTileY = undefined;
  mousePixelX = undefined;
  mousePixelY = undefined;
  cursorCoordsEl.textContent = '-, -';
  tileInfoEl.textContent = '-';
  updateHoverInfo();
});

// FPS Counter
let lastTime = performance.now();
let lastFpsUpdate = performance.now();
let frames = 0;
let fps = 0;
let lastUiUpdate = 0;
let lastSave = 0;
/**
 * Einmal je Minute speichern (ms) - der Spielstand wird mit der Welt immer
 * größer, ihn alle paar Sekunden zu schreiben kostet unnötig. Beim Verlassen
 * der Seite wird zusätzlich gespeichert (beforeunload).
 */
const SAVE_INTERVAL = 60_000;

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

/** Alles, was über dem Gelände gezeichnet wird: Vorkommen, Welt, Auswahl und - im Baumodus - die Vorschau. */
function collectOverlay(blend: number) {
  overlay.length = 0;
  const visible = visibleWorldRect(camera.view());
  if (camera.tileSize >= RESOURCE_OBJECTS_MIN_ZOOM) {
    resources.update(visible, camera.x, camera.y);
    resources.instances(visible, world, overlay, selection.resource, blend);
  }
  worldInstances(world, visible, overlay, blend, selection);
  selectionOverlay(world, selection, blend, overlay);
  if (selected !== null && mouseTileX !== undefined && mouseTileY !== undefined) {
    const blocked = placementCheck(mouseTileX, mouseTileY, selected) !== null;
    placementOverlay(world, selected, mouseTileX, mouseTileY, blocked, overlay);
  }
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
  const speed = Math.min(400 * (camera.tileSize / 4), 3200) * dt * settings.scroll;
  let dx = 0;
  let dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= speed;
  if (keys['s'] || keys['arrowdown']) dy += speed;
  if (keys['a'] || keys['arrowleft']) dx -= speed;
  if (keys['d'] || keys['arrowright']) dx += speed;
  // Hinter dem Hauptmenü zieht die Welt langsam vorbei.
  if (start.isOpen()) dx += 24 * dt;
  // Leertaste halten: Relief sinkt flach, um hinter Berge zu sehen. Weich
  // überblendet, damit man sieht, was wohin gehört. Nie ganz 0 - siehe
  // MapRenderer.relief.
  const targetRelief = keys[' '] ? 0.02 : 1;
  const reliefBefore = renderer.relief;
  renderer.relief += (targetRelief - renderer.relief) * Math.min(1, dt * 10);
  if (Math.abs(targetRelief - renderer.relief) < 0.002) renderer.relief = targetRelief;
  const reliefChanged = renderer.relief !== reliefBefore;

  if (dx !== 0 || dy !== 0 || reliefChanged) {
    camera.panPixels(dx, dy);
    // Unter dem stehenden Zeiger zieht jetzt anderes Gelände durch.
    if (mousePixelX !== undefined && mousePixelY !== undefined) {
      updateHoveredTile(mousePixelX, mousePixelY);
    }
  }

  // Feste Schritte. Der Rest bleibt für den nächsten Frame liegen, damit über
  // die Zeit weder etwas verloren geht noch doppelt gefördert wird.
  if (!paused && !start.isOpen()) tickAccumulator += dt * settings.speed;
  while (tickAccumulator >= TICK) {
    world.tick(TICK);
    tickAccumulator -= TICK;
  }

  ground.update(now);
  // Wild rund um die Kamera - neue Stücke nur ab und zu prüfen.
  if (now - lastAnimalCheck > 500) {
    lastAnimalCheck = now;
    world.ensureAnimals(camera.x, camera.y);
  }
  collectOverlay(tickAccumulator / TICK);
  renderer.setPlayerColor(player.color.toRGB());
  renderer.render(camera.x, camera.y, mouseTileX, mouseTileY, overlay);

  const current = camera.view();
  minimapDots(world, minimap, current, minimapOverlay);
  minimap.render(current, minimapOverlay);

  const camCenterTileX = Math.round(camera.x);
  const camCenterTileY = Math.round(camera.y);
  posEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;
  sampleEl.textContent = (1 / (camera.tileSize * camera.pixelRatio)).toFixed(4);
  camCoordsEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;

  // Der Vorrat wächst kontinuierlich, aber fünfmal je Sekunde abzulesen reicht -
  // je Frame wäre es nur unruhig und würde das Layout ständig neu rechnen.
  if (now - lastUiUpdate > 200) {
    updateResourceUI();
    updateHoverInfo();
    lastUiUpdate = now;
  }
  if (now - lastSave > SAVE_INTERVAL) {
    world.save();
    lastSave = now;
  }

  requestAnimationFrame(loop);
}

zoomEl.textContent = `${camera.tileSize}px`;
// Blickrichtung und Pause wie beim letzten Mal. Die Kamera bleibt auf dem
// Feld aus der Adresse - gedreht wird nur die Ansicht.
if (isDirection(settings.facing)) rotateToFace(settings.facing);
if (settings.paused && !paused) togglePause();
compass.update();
updateResourceUI();
// Wer die Seite aufmacht, landet im Hauptmenü - wie bei einem Spiel. Nach
// der Wahl einer anderen Welt geht es dort gleich los - neu oder geladen.
const request = takeStartRequest();
if (request === 'new') startNewGame();
else if (request !== 'continue') start.open();
requestAnimationFrame(loop);
document.title = `Soliva - ${seed}`;