
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
  CROP_ORDER,
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
import { Keyboard } from './game/keyboard';
import { MouseInput } from './game/MouseInput';
import { PlayerActions } from './game/actions';
import { Placement } from './game/Placement';
import { Picker, RESOURCE_OBJECTS_MIN_ZOOM } from './game/Picker';
import { hoverDescription, type HoverTarget } from './game/hoverInfo';
import { Compass, isDirection, rotateToFace } from './game/Compass';
import { Ground } from './game/Ground';
import { worldSounds } from './game/worldSounds';
import { minimapDots, placementOverlay, selectionOverlay } from './game/overlay';
import { selectionView } from './game/selectionView';
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
/** Baumodus: welche Art gebaut wird, Felder säen, Bauplatz-Prüfung (game/Placement.ts). */
const placement = new Placement(world);

// --- Baumenü ---------------------------------------------------------------

const buildMenu = new BuildMenu(buildEl, player.color.toRGB(), {
  build: (type) => select(placement.placingType === type ? null : type),
  // Feld aus dem Untermenü: mit dieser Frucht abstecken.
  crop: (crop) => {
    world.nextFarmCrop = crop;
    select('farm');
  },
  back: () => {
    buildMenu.showFarms(false);
    if (placement.placingType === 'farm') select(null);
  },
});

function select(type: BuildingType | null) {
  placement.placingType = type;
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
  if (placement.placingType) {
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
  placement.invalidate();
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
  placement.invalidate();
}


// --- Auswahl ---------------------------------------------------------------

/** Was ausgewählt ist: Dorfbewohner, Gebäude oder ein Vorkommen (game/Selection.ts). */
const selection = new Selection(world);

function clearSelection() {
  selection.clear();
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
    actions.selectIdle(!e.shiftKey);
  });
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
  if (action === 'train') actions.trainVillagers(e.shiftKey ? 5 : 1);
  if (action === 'demolish') actions.demolishSelected();
  if (action === 'crop') {
    const crop = (e.target as HTMLElement).closest('button')?.dataset.crop as CropType | undefined;
    if (crop) actions.setFieldCrop(crop);
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

/** Was der Spieler tut: auswählen, Befehle, bauen, ausbilden, abreißen (game/actions.ts). */
const actions = new PlayerActions({ world, camera, selection, placement, picker, ground, sound }, {
  hint,
  refreshSelection: updateSelectionUI,
  refreshResources: updateResourceUI,
  refreshPointer: () => {
    if (mousePixelX !== undefined && mousePixelY !== undefined) updateHoveredTile(mousePixelX, mousePixelY);
  },
  setPlacing: select,
});

/** Die Maus über dem Spielfeld (game/MouseInput.ts) - hier, was sie im Spiel bedeutet. */
new MouseInput(canvas, boxEl, {
  // Im Baumodus setzt ein Klick das Gebäude; Felder weiter beim Ziehen (move).
  press: (p) => {
    if (!placement.isActive) return false;
    const { x, y } = picker.tile(p.x, p.y);
    placement.sowing = placement.placingType === 'farm';
    actions.placeAt(x, y);
    return true;
  },
  release: () => {
    placement.sowing = false;
  },
  click: (p, add, double) => actions.clickSelect(p.x, p.y, add, double),
  box: (a, b, add) => actions.boxSelect(a.x, a.y, b.x, b.y, add),
  rightClick: (p) => actions.rightClick(p),
  pan: (dx, dy) => camera.panPixels(dx, dy),
  panEnd: updateCursor,
  zoom: (step, p) => setZoom(camera.zoomIndex + step, p.x, p.y),
  move: (p, buttons) => {
    const [beforeX, beforeY] = [mouseTileX, mouseTileY];
    updateHoveredTile(p.x, p.y);
    // Felder markieren: jedes überstrichene Tile, auf dem gesät werden kann.
    if (placement.sowing && placement.placingType === 'farm' && (buttons & 1) && mouseTileX !== undefined && mouseTileY !== undefined
        && (mouseTileX !== beforeX || mouseTileY !== beforeY) && world.sowable(mouseTileX, mouseTileY)) {
      actions.placeAt(mouseTileX, mouseTileY, true);
    }
  },
  leave: () => {
    mouseTileX = undefined;
    mouseTileY = undefined;
    mousePixelX = undefined;
    mousePixelY = undefined;
    cursorCoordsEl.textContent = '-, -';
    tileInfoEl.textContent = '-';
    updateHoverInfo();
  },
});

window.addEventListener('resize', resize);

let mouseTileX: number | undefined;
let mouseTileY: number | undefined;
/** Letzte Mausposition auf dem Canvas in CSS-Pixeln, solange der Zeiger drauf ist. */
let mousePixelX: number | undefined;
let mousePixelY: number | undefined;


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

/** Tastatur: gehaltene Tasten und die Belegung (game/keyboard.ts) - hier, was sie im Spiel tut. */
const keyboard = new Keyboard({
  isMenuOpen: () => menu.isOpen(),
  isTitleOpen: () => start.isOpen(),
  // Im Hauptmenü ohne die Knöpfe, die nur im Spiel Sinn haben.
  toggleMenu: () => (menu.isOpen() ? menu.close() : menu.open(start.isOpen())),
  closeMenu: () => menu.close(),
  togglePause,
  toggleSound,
  zoom: (step) => setZoom(camera.zoomIndex + step),
  cancel: () => {
    if (buildMenu.farmsOpen) {
      buildMenu.showFarms(false);
      if (placement.placingType === 'farm') select(null);
    } else if (placement.isActive) select(null);
    else clearSelection();
  },
  demolish: () => actions.demolishSelected(),
  home: () => actions.cycleTownCenter(),
  toggleHelp: () => setPanels({ showHelp: !settings.showHelp }),
  toggleDebug: () => setPanels({ showDebug: !settings.showDebug }),
  selectIdle: (all) => actions.selectIdle(all),
  train: (count) => actions.trainVillagers(count),
  farmsOpen: () => buildMenu.farmsOpen,
  chooseCrop: (index) => {
    const crop = CROP_ORDER[index];
    if (!crop || !world.affordable('farm')) return;
    world.nextFarmCrop = crop;
    select('farm');
  },
  // Das Feld öffnet das Untermenü (Weizen, Mais); sonst Baumodus an oder aus.
  build: (type) => {
    if (type === 'farm') buildMenu.showFarms(true);
    else select(placement.placingType === type ? null : type);
  },
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
  if (placement.placingType !== null && mouseTileX !== undefined && mouseTileY !== undefined) {
    const blocked = placement.check(mouseTileX, mouseTileY, placement.placingType) !== null;
    placementOverlay(world, placement.placingType, mouseTileX, mouseTileY, blocked, overlay);
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
  if (keyboard.isDown('w', 'arrowup')) dy -= speed;
  if (keyboard.isDown('s', 'arrowdown')) dy += speed;
  if (keyboard.isDown('a', 'arrowleft')) dx -= speed;
  if (keyboard.isDown('d', 'arrowright')) dx += speed;
  // Hinter dem Hauptmenü zieht die Welt langsam vorbei.
  if (start.isOpen()) dx += 24 * dt;
  // Leertaste halten: Relief sinkt flach, um hinter Berge zu sehen. Weich
  // überblendet, damit man sieht, was wohin gehört. Nie ganz 0 - siehe
  // MapRenderer.relief.
  const targetRelief = keyboard.isDown(' ') ? 0.02 : 1;
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