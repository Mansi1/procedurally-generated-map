
import { flatten, type FlatZone } from './world/flatten';
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
  RESOURCE_TYPE_LABEL,
  TILE_TYPE_LABEL,
  TileProbe,
} from './map';
import type { EntityInstance } from './gl/entityRenderer';
import { SHAPE, TREES, modelSize, setAnimationSpeed, setAnimationsPaused } from './gl/entityRenderer';
import {
  BUILDINGS,
  ANIMALS,
  BUILDING_ORDER,
  CROPS,
  FIELD_ROWS,
  MAX_GATHERERS,
  MAX_TRAINING_QUEUE,
  player,
  PLAYER_COLORS,
  VILLAGER,
  type BuildingType,
  type CropType,
  type Stock,
} from './world/buildings';
import { World, furrowCells, type Villager } from './world/world';
import { FIELD_WINDOW } from './gl/terrainRenderer';
import { ResourceBar } from './components/ResourceBar';
import { BuildMenu } from './components/BuildMenu';
import { mountGame } from './components/Hud';
import { renderSelection, type FarmView, type SelectionView, type TrainView } from './components/SelectionPanel';
import { SettingsMenu } from './components/SettingsMenu';
import { StartScreen } from './components/StartScreen';
import { loadSettings, saveSettings } from './settings';
import { ResourceField } from './world/resources';
import { Sound, type SoundName } from './audio';
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
const boxEl = document.getElementById('select-box')!;

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

/** Wo es in der Standardwelt losgeht - dort liegt ein guter Platz fürs erste Dorf. */
const DEFAULT_START = { x: 88, y: -59 };
const DEFAULT_ZOOM = 32;

// Die Adresse bleibt "/": Welt und Stelle stehen nicht mehr darin. Alte Links
// (/<seed>/<x>-<y>?zoom=) werden aufgeräumt; die Welt wählt man im Hauptmenü.
if (window.location.pathname !== '/' || window.location.search) window.history.replaceState(null, '', '/');

const seed = currentSeed();
const mapGen = new MapGenerator(seed);
const probe = new TileProbe(mapGen, seed);
const world = new World(probe, seed);

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
    const t = probe.getTile(x, y).tileType;
    return t !== 'water' && t !== 'deep_water' && t !== 'mountain' && t !== 'snow';
  };
  for (let r = 0; r <= 600; r += 3) {
    const steps = Math.max(1, Math.round((2 * Math.PI * r) / 3));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r);
      const y = Math.round(Math.sin(a) * r);
      if (probe.getTile(x, y).tileType !== 'grass') continue;
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
// Mit derselben Feinheit wie das Geländegitter der jetzigen Zoomstufe (wie zAt).
world.groundAt = (x, y) => flatten(x, y, reliefZ(mapGen.heightAt(x, y, 4 / (tileSize * pixelRatio))), flatZones);
const resources = new ResourceField(probe, mapGen);
const sound = new Sound();
/** Hintergrundmusik aus assets/music/ - der Ton-Schalter (M) gilt auch für sie. */
const music = new Music();
music.mute = !sound.enabled;

/**
 * Ab dieser Zoomstufe (CSS-Pixel je Tile) stehen Bäume, Felsen und Sträucher
 * als Objekte in der Landschaft. Weiter draußen wären sie ein, zwei Pixel
 * groß - dort zeigt die Einfärbung des Geländes die Vorkommen.
 */
const RESOURCE_OBJECTS_MIN_ZOOM = 4;

/** Aktuell zum Bauen ausgewählter Typ, oder null im Ansichtsmodus. */
let selected: BuildingType | null = null;

// --- Baumenü ---------------------------------------------------------------

const buildMenu = new BuildMenu(buildEl, (type) => select(selected === type ? null : type));

function select(type: BuildingType | null) {
  selected = type;
  // Wer baut, wählt nicht gleichzeitig aus - sonst tut ein Klick zwei Dinge.
  if (type) clearSelection();
  buildMenu.setPressed(type);
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
const RESOURCE_BAR_ORDER: (keyof Stock)[] = ['wood', 'berries', 'gold', 'stone'];
// Das Zahnrad am Ende öffnet das Menü (wie F10).
const resourceBar = new ResourceBar(stockEl, RESOURCE_BAR_ORDER, player.color.toRGB(), () => menu.toggle());

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
  // Neues Spiel: im Hauptmenü die Welt wählen.
  newGame: () => start.open('new'),
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
  camX = home.x;
  camY = home.y;
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
    labels: RESOURCE_TYPE_LABEL,
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
/**
 * Ausgewählte Gebäude (Anker). `selectedBuilding` ist das zuletzt angeklickte
 * - dessen Einzelheiten zeigt das Panel, wenn nur eines ausgewählt ist.
 */
const selectedBuildings = new Set<string>();
let selectedBuilding: string | null = null;
let selectedResource: { x: number; y: number } | null = null;

/** Keine Gebäude mehr ausgewählt. */
function clearBuildingSelection() {
  selectedBuildings.clear();
  selectedBuilding = null;
}

/** Genau diese Gebäude auswählen, `primary` als Hauptgebäude der Auswahl. */
function selectBuildings(anchors: Iterable<string>, primary: string | null) {
  selectedBuildings.clear();
  for (const a of anchors) selectedBuildings.add(a);
  selectedBuilding = primary && selectedBuildings.has(primary) ? primary : ([...selectedBuildings][0] ?? null);
}

/** Die ausgewählten Gebäude, die es noch gibt. */
function chosenBuildings() {
  return [...selectedBuildings].map((a) => world.building(a)).filter((b) => b !== undefined);
}

/** Doppelklick: alle gleichartigen Gebäude in diesem Umkreis (Tiles). */
const SAME_TYPE_RADIUS = 15;

function clearSelection() {
  selectedVillagers.clear();
  clearBuildingSelection();
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
    if (v.inside > 0) continue;
    const s = villagerScreen(v);
    const d = Math.hypot(s.x - px, s.y - py);
    if (d < bestDistance) {
      bestDistance = d;
      best = v;
    }
  }
  return best;
}

/**
 * Vorkommen, dessen Objekt (Baum, Fels, Strauch) unter dem Zeiger steht -
 * auch an der Krone, nicht nur am Fuß. Jedes Objekt gilt als aufrechter
 * Streifen vom Fuß bis zur Spitze; der vorderste Treffer gewinnt.
 */
function resourceObjectAt(px: number, py: number): { x: number; y: number } | undefined {
  if (tileSize < RESOURCE_OBJECTS_MIN_ZOOM) return undefined;
  const v = view();
  // Etwas Rand: hohe Bäume unterhalb des Bildes ragen mit der Krone herein.
  const rect = visibleWorldRect(v);
  const margin = 4;
  const area = { x: rect.x - margin, y: rect.y - margin, width: rect.width + 2 * margin, height: rect.height + 2 * margin };
  return resources.pick(area, (inst, x, y) => {
    const dims = modelSize(inst.shape);
    if (!dims) return undefined;
    // Leer abgebaut und nicht mehr zu sehen (Bäume, Felsen) - nicht treffen.
    if (!world.resourceInfo(x, y)) return undefined;
    const cx = inst.x + 0.5;
    const cy = inst.y + 0.5;
    const z = zAt(cx, cy);
    // Ein gefällter Baum liegt flach.
    const fallen = inst.motion && inst.motion[1] > 0.5;
    const height = fallen ? 0.3 * inst.size : dims.height * inst.size;
    const base = worldToScreen(v, cx, cy, z);
    const top = worldToScreen(v, cx, cy, z + height);
    // Halbe Breite in Pixeln: ein Stück quer zur Blickrichtung am Boden.
    const w = dims.width * inst.size * 0.4;
    const side = worldToScreen(v, cx + w, cy - w, z);
    const half = Math.max(6, Math.hypot(side.x - base.x, side.y - base.y));
    // Abstand des Zeigers zum Streifen von base nach top. Bäume laufen nach
    // oben spitz zu - ihr Treffer auch, sonst verdeckte eine hohe Spitze den
    // Strauch dahinter.
    const sx = top.x - base.x;
    const sy = top.y - base.y;
    const len2 = sx * sx + sy * sy || 1;
    const t = Math.max(0, Math.min(1, ((px - base.x) * sx + (py - base.y) * sy) / len2));
    const d = Math.hypot(px - (base.x + sx * t), py - (base.y + sy * t));
    const taper = TREES.includes(inst.shape) && !fallen ? 1 - 0.75 * t : 1;
    return d <= Math.max(4, half * taper) ? base.y : undefined;
  });
}

/**
 * Tile, auf das ein Klick zielt: ein Vorkommen am Objekt getroffen, sonst der
 * Boden. Liegt direkt auf dem angeklickten Feld ein Strauch, Stein oder Gold,
 * gewinnt der - auch wenn eine Baumspitze davor ins Bild ragt.
 */
function targetTileAt(px: number, py: number): { x: number; y: number } {
  const tile = tileAt(px, py);
  if (world.at(tile.x, tile.y)) return tile;
  const own = world.resourceInfo(tile.x, tile.y);
  if (own && own.type !== 'wood') return tile;
  return resourceObjectAt(px, py) ?? tile;
}

/**
 * Linksklick ohne Ziehen: Dorfbewohner, sonst Gebäude, sonst Vorkommen, sonst
 * nichts. Mit Umschalt (`add`) kommt es zur Auswahl dazu oder fällt heraus;
 * ein Doppelklick (`same`) auf ein Gebäude wählt alle gleichartigen in der Nähe.
 */
function clickSelect(px: number, py: number, add: boolean, same = false) {
  const villager = villagerAt(px, py);
  selectedResource = null;
  if (villager) {
    clearBuildingSelection();
    if (!add) selectedVillagers.clear();
    if (add && selectedVillagers.has(villager.id)) selectedVillagers.delete(villager.id);
    else selectedVillagers.add(villager.id);
  } else {
    const { x, y } = targetTileAt(px, py);
    const building = world.at(x, y);
    selectedVillagers.clear();
    if (building) {
      const anchor = world.anchorOf(building);
      if (same) {
        // Felder: das ganze zusammenhängende Feld, sonst gleichartige in der Nähe.
        const near = building.farm ? world.farmGroup(building) : [...world.allBuildings()].filter((b) => b.type === building.type
          && Math.hypot(b.x - building.x, b.y - building.y) <= SAME_TYPE_RADIUS);
        selectBuildings([...(add ? selectedBuildings : []), ...near.map((b) => world.anchorOf(b))], anchor);
      } else if (add) {
        const set = new Set(selectedBuildings);
        if (set.has(anchor)) set.delete(anchor);
        else set.add(anchor);
        selectBuildings(set, set.has(anchor) ? anchor : selectedBuilding);
      } else {
        selectBuildings([anchor], anchor);
      }
    } else if (!add) {
      clearBuildingSelection();
      if (world.resourceInfo(x, y)) selectedResource = { x, y };
    }
  }
  updateSelectionUI();
}

/** Aufziehen eines Rechtecks: alle Dorfbewohner darin. */
function boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean) {
  const [left, right] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [top, bottom] = y0 < y1 ? [y0, y1] : [y1, y0];
  if (!add) selectedVillagers.clear();
  clearBuildingSelection();
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
    const { x, y } = tileAt(p.x, p.y);
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
  const d = panDelta(tileSize, -dx, -dy);
  camX += d.x;
  camY += d.y;
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
  const { x, y } = targetTileAt(p.x, p.y);

  // Ausbildende Gebäude ausgewählt: Rechtsklick setzt den Sammelpunkt - bei
  // mehreren für alle.
  const trainers = chosenBuildings().filter((b) => BUILDINGS[b.type].trains);
  if (trainers.length > 0) {
    let reason: string | null = null;
    for (const t of trainers) reason = world.setRally(t, x, y) ?? reason;
    if (reason) hint(reason);
    else sound.play('click');
    updateSelectionUI();
    return;
  }

  if (selectedVillagers.size === 0) return;
  // Auf ein Tier (lebend oder erlegt): jagen bzw. zerlegen.
  const at = pick(p.x, p.y);
  const prey = world.animalNear(at.x, at.y, 0.6);
  if (prey) {
    world.hunt(selectedVillagers, prey);
    sound.play('click', 0.7);
    updateSelectionUI();
    return;
  }
  const reason = world.command(selectedVillagers, x, y);
  if (reason) hint(reason);
  else sound.play('click', 0.7);
  updateSelectionUI();
}

/** Einen Dorfbewohner ausbilden: im ausgewählten Hauptgebäude, sonst im nächstgelegenen. */
/** Dorfbewohner einreihen - `count` auf einmal (Umschalt: 5, wie in AoE2). */
function trainVillager(count = 1) {
  // Ausgewählte Hauptgebäude, sonst das nächstgelegene. Bei mehreren kommt
  // jeder Dorfbewohner in die kürzeste Warteschlange.
  const selectedTrainers = chosenBuildings().filter((b) => BUILDINGS[b.type].trains);
  const nearest = world.nearestTownCenter(camX, camY);
  const trainers = selectedTrainers.length > 0 ? selectedTrainers : nearest ? [nearest] : [];
  if (trainers.length === 0) {
    hint('Baue zuerst ein Hauptgebäude');
    return;
  }
  let reason: string | null = null;
  let queued = 0;
  for (let i = 0; i < count; i++) {
    const open = trainers.filter((b) => b.queue < MAX_TRAINING_QUEUE);
    const building = (open.length > 0 ? open : trainers).reduce((a, b) => (b.queue < a.queue ? b : a));
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
  clearBuildingSelection();
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
  selectBuildings([world.anchorOf(next)], world.anchorOf(next));
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
  const buildings = chosenBuildings();
  if (buildings.length === 0) return;
  for (const b of buildings) world.remove(b);
  clearBuildingSelection();
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
  if (action === 'train') trainVillager(e.shiftKey ? 5 : 1);
  if (action === 'demolish') demolishSelected();
  if (action === 'crop') {
    const crop = (e.target as HTMLElement).closest('button')?.dataset.crop as CropType | undefined;
    if (!crop || !CROPS[crop]) return;
    // Für das ganze Feld - darauf wird gemeinsam gesät.
    const fields = new Set(chosenBuildings().flatMap((b) => (b.farm ? world.farmGroup(b) : [])));
    for (const b of fields) world.setCrop(b, crop);
    sound.play('click');
    updateSelectionUI();
  }
});

/** Was auf einem Feld gerade dran ist - fürs Panel. */
const FARM_PHASE_TEXT = {
  plough: 'Alle pflügen um',
  sow: 'Alle säen',
  grow: 'Wächst - die Bauern jäten',
  harvest: 'Alle ernten',
  done: 'Abgeerntet - wird neu gesät',
} as const;

/**
 * Stand eines Felds fürs Panel - des ganzen zusammenhängenden Felds, auf dem
 * alle gemeinsam arbeiten: Phase, Furchen je Arbeitsschritt, Ernte, Bauern.
 */
function farmView(building: NonNullable<ReturnType<typeof world.building>>): FarmView {
  const group = world.farmGroup(building);
  // Nur die Furchen, die es gibt - ein Feldstück hat drei.
  const furrows = group.flatMap((b) => b.farm!.furrows.filter((_, row) => furrowCells(b.farm!.tiles, row).length > 0));
  const count = (test: (f: (typeof furrows)[number]) => boolean) => furrows.filter(test).length;
  const growing = furrows.filter((f) => f.sown >= 1 && f.growth < 1);
  return {
    phase: FARM_PHASE_TEXT[world.farmPhase(building)],
    tiles: group.length,
    crops: [...new Set(furrows.map((f) => CROPS[f.crop].label))].join(', '),
    food: furrows.reduce((sum, f) => sum + (f.sown >= 1 ? f.food : 0), 0),
    rows: furrows.length,
    ploughed: count((f) => f.plough >= 1),
    sown: count((f) => f.sown >= 1),
    ripe: count((f) => f.growth >= 1 && f.food > 1e-6),
    nextRipeIn: growing.length > 0 ? Math.min(...growing.map((f) => (1 - f.growth) * CROPS[f.crop].growTime)) : undefined,
    farmers: group.flatMap((b) => world.farmers(b)).map((v) => v.name),
  };
}

/** Knopf zum Ausbilden: Kosten und ob man sie hat. */
function trainView(): TrainView {
  return {
    label: VILLAGER.label,
    cost: Object.entries(VILLAGER.cost).map(([r, n]) => `${n} ${RESOURCE_TYPE_LABEL[r as keyof Stock]}`).join(', '),
    affordable: world.canAffordVillager(),
  };
}

/** Was das Auswahl-Panel zeigt - als reine Daten, gezeichnet von SelectionPanel. */
function selectionView(): SelectionView {
  const building = selectedBuilding ? world.building(selectedBuilding) : undefined;
  const many = chosenBuildings();

  if (many.length > 1) {
    // Mehrere Gebäude: Anzahl je Art, Trefferpunkte zusammen, Ausbildung und Abriss für alle.
    const kinds = new Map<string, number>();
    for (const b of many) kinds.set(BUILDINGS[b.type].label, (kinds.get(BUILDINGS[b.type].label) ?? 0) + 1);
    const trainers = many.filter((b) => BUILDINGS[b.type].trains);
    const plans = new Set(many.map((b) => b.farm?.plan));
    const plan = plans.size === 1 ? [...plans][0] : undefined;
    return {
      kind: 'buildings',
      title: kinds.size === 1 ? `${many.length} × ${[...kinds.keys()][0]}` : `${many.length} Gebäude`,
      kinds: kinds.size > 1 ? [...kinds].map(([l, n]) => `${n}× ${l}`).join(', ') : undefined,
      hp: many.reduce((sum, b) => sum + b.hp, 0),
      maxHp: many.reduce((sum, b) => sum + BUILDINGS[b.type].hp, 0),
      training: trainers.length > 0
        ? { queued: trainers.reduce((sum, b) => sum + b.queue, 0), capacity: trainers.length * MAX_TRAINING_QUEUE, train: trainView() }
        : undefined,
      farms: many.every((b) => b.farm)
        ? {
            farmers: many.reduce((sum, b) => sum + world.farmers(b).length, 0),
            rows: many.reduce((sum, b) => sum + b.farm!.furrows.filter((_, row) => furrowCells(b.farm!.tiles, row).length > 0).length, 0),
            plan: plan ?? null,
          }
        : undefined,
    };
  }
  if (building) {
    const def = BUILDINGS[building.type];
    const pop = world.population();
    return {
      kind: 'building',
      label: def.label,
      hp: building.hp,
      maxHp: def.hp,
      accepts: def.accepts.length > 0 ? def.accepts.map((r) => RESOURCE_TYPE_LABEL[r]).join(', ') : undefined,
      provides: def.provides > 0 ? def.provides : undefined,
      farm: building.farm ? { ...farmView(building), plan: building.farm.plan } : undefined,
      trainer: def.trains
        ? {
            queue: building.queue,
            max: MAX_TRAINING_QUEUE,
            full: pop.used >= pop.cap,
            percent: Math.floor((building.progress / VILLAGER.trainTime) * 100),
            rally: building.rally !== null,
            train: trainView(),
          }
        : undefined,
    };
  }
  if (selectedResource) {
    const info = world.resourceInfo(selectedResource.x, selectedResource.y);
    if (!info) {
      // Leer gesammelt, während es ausgewählt war.
      selectedResource = null;
      return { kind: 'empty' };
    }
    const left = Math.ceil(info.remaining);
    const kind = resources.kindAt(selectedResource.x, selectedResource.y);
    return {
      kind: 'resource',
      title: kind ?? RESOURCE_TYPE_LABEL[info.type],
      subtitle: kind ? RESOURCE_TYPE_LABEL[info.type] : undefined,
      left,
      total: info.total,
      percent: Math.round((info.remaining / info.total) * 100),
      // Beerensträucher wachsen nach - wie lange noch, bis er wieder voll ist.
      regrow: info.regrowIn !== undefined && info.regrowIn > 1 ? { empty: left === 0, seconds: info.regrowIn } : undefined,
      gatherers: info.gatherers,
      max: MAX_GATHERERS,
    };
  }
  if (selectedVillagers.size > 0) {
    const chosen = world.villagers.filter((v) => selectedVillagers.has(v.id));
    // Gleiche Tätigkeiten zusammenfassen: "3x sammelt Holz, 1x untätig".
    const counts = new Map<string, number>();
    for (const v of chosen) {
      const text = world.describe(v).replace(/ \(\d+\)$/, '');
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    // Einer: sein Name als Titel. Mehrere: Anzahl und darunter die Namen.
    const single = chosen.length === 1 ? chosen[0] : undefined;
    return {
      kind: 'villagers',
      single: single
        ? { name: single.name, role: single.female ? 'Dorfbewohnerin' : VILLAGER.label, doing: world.describe(single) }
        : undefined,
      count: chosen.length,
      label: VILLAGER.label,
      names: chosen.slice(0, 6).map((v) => v.name).join(', ') + (chosen.length > 6 ? ` +${chosen.length - 6}` : ''),
      hp: chosen.reduce((sum, v) => sum + v.hp, 0),
      maxHp: chosen.length * VILLAGER.hp,
      activities: [...counts],
    };
  }
  if (!world.hasTownCenter()) return { kind: 'start' };
  return { kind: 'overview', idle: world.villagers.filter((v) => v.task.kind === 'idle').length };
}

/** Zeigt, was ausgewählt ist und was man damit tun kann. Läuft getaktet mit dem Vorrat. */
function updateSelectionUI() {
  // Wer inzwischen nicht mehr existiert, fällt aus der Auswahl.
  for (const id of selectedVillagers) {
    if (!world.villagers.some((v) => v.id === id)) selectedVillagers.delete(id);
  }
  for (const a of [...selectedBuildings]) if (!world.building(a)) selectedBuildings.delete(a);
  if (selectedBuilding && !selectedBuildings.has(selectedBuilding)) selectedBuilding = [...selectedBuildings][0] ?? null;
  renderSelection(selectionEl, selectionView());
  // Auswahl hat sich vielleicht geändert, oder das Feld unter dem Zeiger ist
  // inzwischen leer gesammelt.
  updateCursor();
}

// Der Speicherstand liegt im localStorage, je Welt einer.
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

let zoomIndex = nearestZoomIndex(DEFAULT_ZOOM);
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
/**
 * Eingeebnete Flächen unter den Gebäuden (siehe world/flatten.ts), je Bild
 * neu zusammengestellt; die Höhe je Gebäude wird nur einmal gemessen.
 */
let flatZones: FlatZone[] = [];

/**
 * Äcker für den Gelände-Shader: ein Ausschnitt von FIELD_WINDOW Tiles um die
 * Kamera, neu zusammengestellt ein paarmal je Sekunde (gepflügt wird langsam)
 * oder wenn die Kamera aus dem Ausschnitt herausläuft.
 */
const fieldData = new Uint8Array(FIELD_WINDOW * FIELD_WINDOW * 4);
let fieldOrigin = { x: NaN, y: NaN };
let lastFieldUpdate = 0;
let lastAnimalCheck = 0;

function updateFields(now: number) {
  const snap = 32;
  const x = Math.floor((camX - FIELD_WINDOW / 2) / snap) * snap;
  const y = Math.floor((camY - FIELD_WINDOW / 2) / snap) * snap;
  if (x === fieldOrigin.x && y === fieldOrigin.y && now - lastFieldUpdate < 250) return;
  fieldOrigin = { x, y };
  lastFieldUpdate = now;
  renderer.setFields(x, y, world.fieldSoil(x, y, FIELD_WINDOW, fieldData));
}
const flatHeights = new Map<string, number>();

function updateFlatZones() {
  const zones: FlatZone[] = [];
  for (const b of world.allBuildings()) {
    // Felder bleiben, wie das Gelände ist - Pflanzen wachsen auch am Hang.
    if (b.farm) continue;
    const fp = BUILDINGS[b.type].footprint;
    const k = `${b.type}:${b.x},${b.y}`;
    let z = flatHeights.get(k);
    if (z === undefined) {
      // Mittel über den Grundriss: so wird bergauf etwas abgetragen und
      // bergab etwas aufgeschüttet.
      let sum = 0, n = 0;
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
        sum += reliefZ(mapGen.heightAt(b.x + 0.5 + (i - 1) * fp / 2, b.y + 0.5 + (j - 1) * fp / 2));
        n++;
      }
      z = sum / n;
      flatHeights.set(k, z);
    }
    zones.push({ x: b.x + 0.5, y: b.y + 0.5, half: fp / 2 + 0.1, z });
  }
  // Der Shader nimmt nur die der Bildmitte nächsten.
  zones.sort((a, b) => Math.hypot(a.x - camX, a.y - camY) - Math.hypot(b.x - camX, b.y - camY));
  flatZones = zones;
  renderer.setFlatZones(zones);
}

function zAt(x: number, y: number): number {
  // Mit der aktuellen Reliefstärke - flachgelegt trifft der Klick sonst
  // die Stelle, an der der Berg stünde.
  return flatten(x, y, reliefZ(mapGen.heightAt(x, y, 4 / (tileSize * pixelRatio))), flatZones) * renderer.relief;
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
    return;
  }
  // Im Hauptmenü gibt es noch nichts zu steuern.
  if (start.isOpen()) return;
  // F3 wie in AoE2: Pause.
  if (e.key === 'F3') {
    e.preventDefault();
    togglePause();
    return;
  }
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

  const byKey = BUILDING_ORDER.find((type) => BUILDINGS[type].key === e.key);
  if (byKey) select(selected === byKey ? null : byKey);
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
  setZoom(zoomIndex + (wheelSum < 0 ? 1 : -1), e.clientX - rect.left, e.clientY - rect.top);
  wheelSum = 0;
  wheelLocked = now + WHEEL_PAUSE;
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
/** Vorkommen, auf dessen Objekt der Zeiger gerade zeigt - für den Sammel-Mauszeiger. */
let hoverObject: { x: number; y: number } | undefined;

function updateHoveredTile(mouseX: number, mouseY: number) {
  mousePixelX = mouseX;
  mousePixelY = mouseY;
  // Nur mit ausgewählten Dorfbewohnern zählt, worauf der Zeiger zeigt.
  const object = selectedVillagers.size > 0 ? resourceObjectAt(mouseX, mouseY) : undefined;
  if (object?.x !== hoverObject?.x || object?.y !== hoverObject?.y) {
    hoverObject = object;
    updateCursor();
  }
  const tile = tileAt(mouseX, mouseY);
  if (tile.x === mouseTileX && tile.y === mouseTileY) return;
  mouseTileX = tile.x;
  mouseTileY = tile.y;
  updateCursor();

  cursorCoordsEl.textContent = `${mouseTileX}, ${mouseTileY}`;

  const info = probe.getTile(mouseTileX, mouseTileY);
  tileInfoEl.textContent =
    `${TILE_TYPE_LABEL[info.tileType]} | h ${info.height.toFixed(2)}` +
    ` | Feuchte ${info.moisture.toFixed(2)} | Temp ${info.temperature.toFixed(2)}`;
  updateHoverInfo();
}

/**
 * Was unter dem Zeiger steht, in den Entwickler-Infos - in dieser Reihenfolge:
 * ein Dorfbewohner (Name, Leben, was er tut), ein Tier (Leben, erlegt: die
 * Nahrung am Kadaver), ein Gebäude mit seinen Trefferpunkten, sonst eine
 * Ressource - Art (Baum- oder Strauchart, z. B. "Heidelbeere") und wie viel
 * Nahrung, Holz, Stein oder Gold noch da ist. Läuft auch getaktet mit, weil
 * sich Figuren bewegen und Sammler leeren, während der Zeiger stillsteht.
 */
function updateHoverInfo() {
  const hovered = mouseTileX !== undefined && mouseTileY !== undefined
    && mousePixelX !== undefined && mousePixelY !== undefined;
  const villager = hovered ? villagerAt(mousePixelX!, mousePixelY!) : undefined;
  if (villager) {
    const role = villager.female ? 'Dorfbewohnerin' : VILLAGER.label;
    setText(objectLabelEl, 'Einheit');
    setText(resourceInfoEl,
      `${villager.name} (${role}) | Leben ${Math.ceil(villager.hp)}/${VILLAGER.hp} | ${world.describe(villager)}`);
    return;
  }
  const at = hovered ? pick(mousePixelX!, mousePixelY!) : undefined;
  const animal = at ? world.animalNear(at.x, at.y, 0.6) : undefined;
  if (animal) {
    const def = ANIMALS[animal.kind];
    setText(objectLabelEl, 'Tier');
    setText(resourceInfoEl, animal.state === 'dead'
      ? `${def.label} (erlegt) | Nahrung ${Math.ceil(animal.food)}/${def.food}`
      : `${def.label} | Leben ${Math.ceil(animal.hp)}/${def.hp}`);
    return;
  }
  const building = hovered ? world.at(mouseTileX!, mouseTileY!) : undefined;
  if (building) {
    const def = BUILDINGS[building.type];
    setText(objectLabelEl, 'Gebäude');
    setText(resourceInfoEl, `${def.label} | Leben ${Math.ceil(building.hp)}/${def.hp}`);
    return;
  }
  setText(objectLabelEl, 'Ressource');
  const found = hovered ? world.resourceInfo(mouseTileX!, mouseTileY!) : null;
  if (!found) {
    setText(resourceInfoEl, '-');
    return;
  }
  // Was man davon bekommt: Beeren sind Nahrung, sonst Holz, Stein oder Gold.
  const yields = found.type === 'berries' ? 'Nahrung' : RESOURCE_TYPE_LABEL[found.type];
  const amount = `${yields} ${Math.ceil(found.remaining)}/${found.total}`;
  // Baum- und Straucharten mit Namen davor; Stein und Gold heißen wie ihr Ertrag.
  const kind = resources.kindAt(mouseTileX!, mouseTileY!);
  setText(resourceInfoEl, kind ? `${kind} | ${amount}` : amount);
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

/**
 * Minimap wie in AoE2: jedes Gebäude ein Quadrat, jede Einheit ein Punkt, in
 * der Spielerfarbe mit dunklem Rand - in fester Pixelgröße, damit man sie bei
 * jeder Zoomstufe sieht. Felder etwas blasser, sie sind groß und zahlreich.
 */
function minimapDots(current: IsoView) {
  minimapOverlay.length = 0;
  const rect = minimap.viewRectOf(current);
  const ppt = minimap.pixelsPerTile(current);
  const color = player.color.toRGB();
  const dark: [number, number, number] = [20, 20, 20];
  const inside = (x: number, y: number) => x >= rect.x - 3 && x <= rect.x + rect.width + 3 && y >= rect.y - 3 && y <= rect.y + rect.height + 3;
  const dot = (x: number, y: number, px: number, c: [number, number, number], alpha = 1) => {
    const size = px / ppt;
    const border = 2 / ppt;
    minimapOverlay.push({ x, y, size: size + border, color: dark, shape: SHAPE.flat, alpha: 0.8 * alpha });
    minimapOverlay.push({ x, y, size, color: c, shape: SHAPE.flat, alpha });
  };
  for (const b of world.allBuildings()) {
    if (!inside(b.x, b.y)) continue;
    const fp = BUILDINGS[b.type].footprint;
    // Größer von beidem: echte Fläche oder Mindestgröße in Pixeln.
    dot(b.x, b.y, Math.max(fp * ppt, b.farm ? 4 : 6), color, b.farm ? 0.55 : 1);
  }
  for (const v of world.villagers) {
    if (v.inside > 0 || !inside(v.x, v.y)) continue;
    dot(v.x - 0.5, v.y - 0.5, 3, color);
  }
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
      { villagers: selectedVillagers, buildings: selectedBuildings });

  // Auswahl: grüner Ring unter jedem Dorfbewohner, Fläche unter dem Gebäude.
  for (const v of world.villagers) {
    if (!selectedVillagers.has(v.id)) continue;
    const p = world.villagerPosition(v, blend);
    overlay.push({
      x: p.x - 0.5, y: p.y - 0.5, size: VILLAGER.size * 2,
      color: [110, 231, 160], shape: SHAPE.ring, alpha: 1,
      ground: world.groundAt!(p.x, p.y),
    });
  }
  for (const building of chosenBuildings()) {
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
        color: player.color.toRGB(), shape: SHAPE.rallyFlag, alpha: 1,
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

  // Felder: rund um den Zeiger zeigen, wo gesät werden kann.
  if (selected === 'farm') {
    const R = 9;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const [x, y] = [mouseTileX + dx, mouseTileY + dy];
        if (!world.sowable(x, y)) continue;
        overlay.push({ x, y, size: 0.92, color: [150, 220, 90], shape: SHAPE.flat, alpha: 0.16 });
      }
    }
  }
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
  if (selected === 'farm') {
    // Felder zeigen die Frucht, die gesät wird - Furche für Furche, nur auf
    // den Tiles, die sie bekämen.
    const outline = world.fieldOutline(mouseTileX, mouseTileY, world.farmTiles(mouseTileX, mouseTileY) || 16);
    for (let row = 0; row < FIELD_ROWS; row++) {
      overlay.push({
        x: mouseTileX, y: mouseTileY, size: def.size, color: player.color.toRGB(),
        shape: CROPS[world.farmCrop].shape + row, alpha: 0.7, motion: [row, 3, 1, outline.mask],
        accent: [outline.others, 0, 0],
      });
    }
    return;
  }
  overlay.push({
    x: mouseTileX,
    y: mouseTileY,
    size: def.size,
    color: blocked ? [220, 70, 80] : player.color.toRGB(),
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
  const speed = Math.min(400 * (tileSize / 4), 3200) * dt * settings.scroll;
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
  if (!paused && !start.isOpen()) tickAccumulator += dt * settings.speed;
  while (tickAccumulator >= TICK) {
    world.tick(TICK);
    tickAccumulator -= TICK;
  }

  updateFlatZones();
  updateFields(now);
  // Wild rund um die Kamera - neue Stücke nur ab und zu prüfen.
  if (now - lastAnimalCheck > 500) {
    lastAnimalCheck = now;
    world.ensureAnimals(camX, camY);
  }
  collectOverlay(tickAccumulator / TICK);
  renderer.setPlayerColor(player.color.toRGB());
  renderer.render(camX, camY, mouseTileX, mouseTileY, overlay);

  const current = view();
  minimapDots(current);
  minimap.render(current, minimapOverlay);

  const camCenterTileX = Math.round(camX);
  const camCenterTileY = Math.round(camY);
  posEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;
  sampleEl.textContent = (1 / (tileSize * pixelRatio)).toFixed(4);
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

zoomEl.textContent = `${tileSize}px`;
// Blickrichtung und Pause wie beim letzten Mal. Die Kamera bleibt auf dem
// Feld aus der Adresse - gedreht wird nur die Ansicht.
if (settings.facing in COMPASS) {
  const [dx, dy] = COMPASS[settings.facing];
  for (let k = 0; k < 4; k++) {
    setViewRotation(k);
    const g = worldToGround(dx, dy);
    if (g.v < 0 && Math.abs(g.u) < 1e-9) break;
  }
}
if (settings.paused && !paused) togglePause();
updateCompass();
updateResourceUI();
// Wer die Seite aufmacht, landet im Hauptmenü - wie bei einem Spiel. Nach
// der Wahl einer anderen Welt geht es dort gleich los - neu oder geladen.
const request = takeStartRequest();
if (request === 'new') startNewGame();
else if (request !== 'continue') start.open();
requestAnimationFrame(loop);
document.title = `Soliva - ${seed}`;