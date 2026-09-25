
import { MapGenerator } from './noise';
import {
  type IsoView,
  visibleWorldRect,
} from './gl/iso';
import {
  MapRenderer,
  MiniMap,
  Terrain,
} from './map';
import type { EntityInstance, StaticBatch } from './gl/entityRenderer';
import { setAnimationSpeed, setAnimationsPaused } from './gl/entityRenderer';
import {
  player,
  PLAYER_COLORS,
} from './world/catalog';
import { World } from './world/world';
import { worldInstances } from './world/render';
import { Selection } from './game/Selection';
import { Camera } from './game/Camera';
import { GameUi } from './game/ui';
import { steerCamera } from './game/cameraControl';
import { startPoint } from './game/startPoint';
import { FixedStep, Interval } from './game/timing';
import { Pointer } from './game/Pointer';
import { DevPanel } from './game/DevPanel';
import { Keyboard } from './game/keyboard';
import { MouseInput } from './game/MouseInput';
import { PlayerActions } from './game/actions';
import { Placement } from './game/Placement';
import { Picker, RESOURCE_OBJECTS_MIN_ZOOM } from './game/Picker';
import { hoverDescription, type HoverTarget } from './game/hoverInfo';
import { Compass, directionAt, isDirection, rotateToFace } from './game/Compass';
import { Ground } from './game/Ground';
import { worldSounds } from './game/worldSounds';
import { minimapDots, placementOverlay, selectionOverlay } from './game/overlay';
import { mountGame } from './components/Hud';
import { SettingsMenu } from './components/SettingsMenu';
import { StartScreen } from './components/StartScreen';
import { treeBillboards } from './components/billboards';
import { loadSettings, saveSettings } from './settings';
import { ResourceField } from './world/resources';
import { Sound } from './audio';
import { Music } from './music';
import { currentSeed, deleteSave, switchWorld, takeStartRequest } from './worlds';

// Erst Spielfeld-Canvas und Oberfläche (components/Hud.tsx) - danach werden
// ihre Teile hier über ihre IDs gefunden.
mountGame(document.getElementById('app')!);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const boxEl = document.getElementById('select-box')!;
/** Entwickler-Infos oben links (game/DevPanel.ts). */
const devPanel = new DevPanel();
/** Wo der Mauszeiger auf dem Spielfeld steht (game/Pointer.ts). */
const pointer = new Pointer();

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

// Die Adresse bleibt "/": Welt und Stelle stehen nicht mehr darin. Alte Links
// (/<seed>/<x>-<y>?zoom=) werden aufgeräumt; die Welt wählt man im Hauptmenü.
if (window.location.pathname !== '/' || window.location.search) window.history.replaceState(null, '', '/');

const seed = currentSeed();
const mapGen = new MapGenerator(seed);
const terrain = new Terrain(mapGen, seed);
const world = new World(terrain, seed);

const { x: startX, y: startY } = startPoint(world, terrain, seed);
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

// --- Auswahl ---------------------------------------------------------------

/** Was ausgewählt ist: Dorfbewohner, Gebäude oder ein Vorkommen (game/Selection.ts). */
const selection = new Selection(world);

/** Die Oberfläche im Spiel: Leisten, Baumenü, Auswahl-Panel, Hinweise, Mauszeiger (game/ui.ts). */
const ui = new GameUi({ world, selection, placement, pointer, resources, sound, canvas }, {
  toggleMenu: () => menu.toggle(),
  save: () => world.save(),
  selectIdle: (all) => actions.selectIdle(all),
  train: (count) => actions.trainVillagers(count),
  demolish: () => actions.demolishSelected(),
  setFieldCrop: (crop) => actions.setFieldCrop(crop),
}, player.color.toRGB());

// --- Einstellungen und Menü ------------------------------------------------

const settings = loadSettings();
/** Angehalten (F3 oder Menü): die Welt steht, Kamera und Auswahl gehen weiter. */
let paused = false;
const pausedEl = document.getElementById('paused')!;

function applySettings() {
  sound.volume = settings.volume;
  music.volume = settings.music;
  player.color = (PLAYER_COLORS[settings.playerColor] ?? PLAYER_COLORS.green).color;
  ui.setPlayerColor(player.color.toRGB());
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
  ui.clearSelection();
  if (paused) togglePause();
  ui.refreshResources();
  goToStart();
}

/** Kamera zurück an den Start - im Hauptmenü ist sie weitergezogen. */
function goToStart() {
  const home = startPoint(world, terrain, seed);
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

/** Kompass auf dem Ring der Minimap (game/Compass.ts) - Radius wie in Hud.tsx. */
const compass = new Compass(document.getElementById('compass')!, 146, (dir) => faceDirection(dir));
// Die Pfeile unter der Minimap drehen um eine Vierteldrehung: was rechts bzw. links liegt, kommt nach oben.
document.getElementById('turn-left')!.addEventListener('click', () => faceDirection(directionAt(1)));
document.getElementById('turn-right')!.addEventListener('click', () => faceDirection(directionAt(-1)));

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
  pointer.tile = null;
  refreshPointer();
  placement.invalidate();
}



// Der Speicherstand liegt im localStorage, je Welt einer.
window.addEventListener('beforeunload', () => world.save());

const renderer = new MapRenderer(canvas, seed, camera.tileSize, camera.pixelRatio);
renderer.setBillboards(treeBillboards);
const minimap = new MiniMap(minimapCanvas, seed, camera.pixelRatio);

camera.moveTo(startX, startY);


/** Gelände, wie man es sieht, und sein Abgleich mit dem Shader (game/Ground.ts). */
const ground = new Ground(mapGen, world, renderer, camera);
world.groundAt = (x, y) => ground.groundAt(x, y);

/** Was unter dem Zeiger liegt: Welt-Punkt, Tile, Dorfbewohner, Vorkommen (game/Picker.ts). */
const picker = new Picker(world, resources, camera, ground, () => simulation.blend);

/** Was der Spieler tut: auswählen, Befehle, bauen, ausbilden, abreißen (game/actions.ts). */
const actions = new PlayerActions({ world, camera, selection, placement, picker, ground, sound }, {
  hint: (text) => ui.hint(text),
  refreshSelection: () => ui.refreshSelection(),
  refreshResources: () => ui.refreshResources(),
  refreshPointer,
  setPlacing: (type) => ui.setPlacing(type),
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
  panEnd: () => ui.updateCursor(),
  zoom: (step, p) => setZoom(camera.zoomIndex + step, p.x, p.y),
  move: (p, buttons) => {
    const tileChanged = updateHoveredTile(p.x, p.y);
    // Felder markieren: jedes überstrichene Tile, auf dem gesät werden kann.
    const tile = pointer.tile;
    if (tileChanged && tile && placement.sowing && placement.placingType === 'farm' && (buttons & 1) && world.sowable(tile.x, tile.y)) {
      actions.placeAt(tile.x, tile.y, true);
    }
  },
  leave: () => {
    pointer.clear();
    devPanel.showTile();
    updateHoverInfo();
  },
});

window.addEventListener('resize', resize);



/**
 * Zoomt so, dass das Welt-Tile unter dem Ankerpunkt dort stehen bleibt.
 * Anker ist der Mauszeiger, solange er über der Karte ist, sonst die Bildmitte.
 */
function setZoom(index: number, anchorX?: number, anchorY?: number) {
  const ax = anchorX ?? pointer.pixel?.x ?? camera.centerX;
  const ay = anchorY ?? pointer.pixel?.y ?? camera.centerY;
  // Welt-Punkt unter dem Anker vor dem Zoom ...
  const anchor = picker.point(ax, ay);
  if (!camera.setZoomIndex(index)) return;
  renderer.tileSize = camera.tileSize;
  // ... und danach wieder genau unter den Anker legen.
  camera.centerOn(anchor.x, anchor.y, anchor.z, ax, ay);

  refreshPointer();
  devPanel.showZoom(camera.tileSize);
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
  cancel: () => ui.cancel(),
  demolish: () => actions.demolishSelected(),
  home: () => actions.cycleTownCenter(),
  toggleHelp: () => setPanels({ showHelp: !settings.showHelp }),
  toggleDebug: () => setPanels({ showDebug: !settings.showDebug }),
  selectIdle: (all) => actions.selectIdle(all),
  train: (count) => actions.trainVillagers(count),
  farmsOpen: () => ui.farmsOpen,
  chooseCrop: (index) => ui.chooseCrop(index),
  // Das Feld öffnet das Untermenü (Weizen, Mais); sonst Baumodus an oder aus.
  build: (type) => {
    if (type === 'farm') ui.openFarms();
    else ui.setPlacing(placement.placingType === type ? null : type);
  },
});



/**
 * Die Ansicht, um die sich die Minimap legt: mittig auf der Stelle, die man in
 * der Bildmitte wirklich sieht - mit ihrer Geländehöhe. camera.x/y ist der
 * Punkt auf Meereshöhe; auf einem Gebirge liegt der weit hinter dem, was im
 * Bild ist, und die flache Minimap zeigte dann die falsche Gegend.
 */
function minimapView(): IsoView {
  const seen = picker.point(camera.centerX, camera.centerY);
  return { ...camera.view(), centerX: seen.x, centerY: seen.y };
}

minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  // Nur die Raute ist Karte - die Ecken des Canvas gehören zum Rahmen.
  if (!minimap.inside(e.clientX - rect.left, e.clientY - rect.top)) return;
  const target = minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, minimapView());
  // Die angeklickte Stelle mit ihrer Höhe in die Bildmitte - nicht den Punkt auf Meereshöhe.
  camera.centerOn(target.x, target.y, ground.heightAt(target.x, target.y));
  refreshPointer();
});

minimapCanvas.addEventListener('mousemove', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  devPanel.showMinimapPointer(minimap.toWorld(e.clientX - rect.left, e.clientY - rect.top, minimapView()));
});
minimapCanvas.addEventListener('mouseleave', () => devPanel.showMinimapPointer());

/**
 * Zeiger auf die Canvas-Stelle (mouseX, mouseY) setzen: Objekt und Tile
 * darunter, Mauszeiger und Entwickler-Infos. true, wenn das Tile wechselte.
 */
function updateHoveredTile(mouseX: number, mouseY: number): boolean {
  pointer.pixel = { x: mouseX, y: mouseY };
  // Nur mit ausgewählten Dorfbewohnern zählt, worauf der Zeiger zeigt.
  const object = selection.villagers.size > 0 ? picker.resourceObject(mouseX, mouseY) : undefined;
  if (pointer.setObject(object)) ui.updateCursor();
  const tile = picker.tile(mouseX, mouseY);
  if (!pointer.setTile(tile)) return false;
  ui.updateCursor();
  devPanel.showTile({ ...terrain.getTile(tile.x, tile.y), x: tile.x, y: tile.y });
  updateHoverInfo();
  return true;
}

/** Die Kamera hat sich bewegt: unter dem stehenden Zeiger liegt jetzt anderes. */
function refreshPointer() {
  if (pointer.pixel) updateHoveredTile(pointer.pixel.x, pointer.pixel.y);
}

/**
 * Was unter dem Zeiger steht, in den Entwickler-Infos (game/hoverInfo.ts).
 * Läuft auch getaktet mit, weil sich Figuren bewegen und Sammler leeren,
 * während der Zeiger stillsteht.
 */
function updateHoverInfo() {
  const { pixel, tile } = pointer;
  let target: HoverTarget = {};
  if (pixel && tile) {
    const villager = picker.villager(pixel.x, pixel.y);
    const at = picker.point(pixel.x, pixel.y);
    target = villager ? { villager } : { animal: world.animalNear(at.x, at.y, 0.6), tile };
  }
  const { label, text } = hoverDescription(world, resources, target);
  devPanel.showObject(label, text);
}

let lastTime = performance.now();
/** Die Simulation läuft in festen Schritten von 0.1 s (game/timing.ts). */
const simulation = new FixedStep(0.1);
/** Vorrat, Auswahl und Hover fünfmal je Sekunde - je Bild wäre es nur unruhig und teuer. */
const uiRefresh = new Interval(200);
/** Neue Stücke mit Wild nahe der Kamera nur ab und zu prüfen. */
const animalCheck = new Interval(500);
/**
 * Einmal je Minute speichern - der Spielstand wird mit der Welt immer
 * größer, ihn alle paar Sekunden zu schreiben kostet unnötig. Beim Verlassen
 * der Seite wird zusätzlich gespeichert (beforeunload).
 */
const autosave = new Interval(60_000);

/** Wird je Frame neu befüllt statt neu angelegt. */
const overlay: EntityInstance[] = [];
/** Feste Puffer der Vorkommen, an denen niemand arbeitet (world/resources.ts). */
const staticBatches: StaticBatch[] = [];
const minimapOverlay: EntityInstance[] = [];

/**
 * canPlace() sucht den ganzen Umkreis nach Vorkommen ab - bei Radius 4 sind
 * das 81 Geländeabfragen. Für die Vorschau wird das Ergebnis gemerkt, solange
 * Feld und Gebäudetyp gleich bleiben; sonst liefe die Suche je Bild neu.
 */

/** Alles, was über dem Gelände gezeichnet wird: Vorkommen, Welt, Auswahl und - im Baumodus - die Vorschau. */
function collectOverlay(blend: number) {
  overlay.length = 0;
  staticBatches.length = 0;
  const visible = visibleWorldRect(camera.view());
  if (camera.tileSize >= RESOURCE_OBJECTS_MIN_ZOOM) {
    resources.update(visible, camera.x, camera.y);
    resources.instances(visible, world, overlay, selection.resource, blend, { batcher: renderer, out: staticBatches });
  }
  const hovered = pointer.tile ? world.at(pointer.tile.x, pointer.tile.y)?.anchor : undefined;
  worldInstances(world, visible, overlay, blend, selection, hovered);
  selectionOverlay(world, selection, blend, overlay);
  const tile = pointer.tile;
  if (placement.placingType !== null && tile) {
    const blocked = placement.check(tile.x, tile.y, placement.placingType) !== null;
    placementOverlay(world, placement.placingType, tile.x, tile.y, blocked, overlay);
  }
}

function loop(now: number) {
  // Begrenzt, damit die Kamera nach einem Tab-Wechsel nicht quer über die Karte
  // springt (dt wäre dann die gesamte Zeit im Hintergrund).
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;


  // WASD, Leertaste, hinter dem Hauptmenü langsam vorbeiziehen (game/cameraControl.ts).
  if (steerCamera(camera, renderer, keyboard, dt, settings.scroll, start.isOpen())) refreshPointer();

  simulation.advance(paused || start.isOpen() ? 0 : dt * settings.speed, (step) => world.tick(step));

  ground.update(now);
  // Wild rund um die Kamera - neue Stücke nur ab und zu prüfen.
  if (animalCheck.due(now)) world.ensureAnimals(camera.x, camera.y);
  collectOverlay(simulation.blend);
  renderer.setPlayerColor(player.color.toRGB());
  renderer.billboardBelow = settings.billboards;
  renderer.render(camera.x, camera.y, pointer.tile?.x, pointer.tile?.y, overlay, staticBatches);

  const seen = minimapView();
  minimapDots(world, minimap, seen, minimapOverlay);
  minimap.render(seen, minimapOverlay);

  devPanel.frame(now, camera, renderer.billboardsActive);

  if (uiRefresh.due(now)) {
    ui.refreshResources();
    updateHoverInfo();
  }
  if (autosave.due(now)) world.save();

  requestAnimationFrame(loop);
}

devPanel.showZoom(camera.tileSize);
// Blickrichtung und Pause wie beim letzten Mal. Die Kamera bleibt auf dem
// Feld aus der Adresse - gedreht wird nur die Ansicht.
if (isDirection(settings.facing)) rotateToFace(settings.facing);
if (settings.paused && !paused) togglePause();
compass.update();
ui.refreshResources();
// Wer die Seite aufmacht, landet im Hauptmenü - wie bei einem Spiel. Nach
// der Wahl einer anderen Welt geht es dort gleich los - neu oder geladen.
const request = takeStartRequest();
if (request === 'new') startNewGame();
else if (request !== 'continue') start.open();
requestAnimationFrame(loop);
document.title = `Soliva - ${seed}`;