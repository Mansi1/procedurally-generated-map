import { MapGenerator } from './noise';
import {
  MapRenderer,
  MiniMap,
  RESOURCE_TYPE_LABEL,
  TILE_TYPE_COLOR,
  TILE_TYPE_LABEL,
  TileProbe,
} from './map';
import type { TileType } from './noise';

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

// Legende aus der Palette aufbauen - so kann sie nicht aus dem Tritt geraten
legendEl.innerHTML = (Object.keys(TILE_TYPE_LABEL) as TileType[])
  .map(
    (type) =>
      `<span class="legend-item"><i style="background:${TILE_TYPE_COLOR[type].toRgbString()}"></i>${TILE_TYPE_LABEL[type]}</span>`,
  )
  .join('');

/**
 * Sichtfläche in CSS-Pixeln. Kamera, tileSize und Mauskoordinaten rechnen
 * durchgehend in dieser Einheit; der Canvas-Speicher ist um pixelRatio größer.
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
  // Beim Größenwechsel soll der Bildmittelpunkt stehen bleiben - sonst springt
  // die Karte, weil camX/camY die linke obere Ecke beschreiben.
  const centerTileX = (camX + viewWidth / 2) / tileSize;
  const centerTileY = (camY + viewHeight / 2) / tileSize;

  applyCanvasSize();

  camX = centerTileX * tileSize - viewWidth / 2;
  camY = centerTileY * tileSize - viewHeight / 2;

  renderer.pixelRatio = pixelRatio;
  minimap.setPixelRatio(pixelRatio);
}

// Erste Größenzuweisung, bevor die Kamera daraus berechnet wird. resize() darf
// hier noch nicht laufen, es greift bereits auf camX/camY zu.
applyCanvasSize();

function parseURL(): { seed: string; x: number; y: number; zoom: number } {
  const path = window.location.pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(window.location.search);

  let seed = 'AoE2Factorio1337';
  let x = 0;
  let y = 0;
  let zoom = 8;

  if (path.length >= 2) {
    seed = path[0];
    const coords = path[1].split('-').map(Number);
    if (coords.length === 2 &&!isNaN(coords[0]) &&!isNaN(coords[1])) {
      x = coords[0];
      y = coords[1];
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

/**
 * Zoomstufen in CSS-Pixeln je Welt-Tile. Verdopplung je Stufe: die Schrittweite
 * der Abtastung ist damit immer eine Zweierpotenz, und von einem Ende zum
 * anderen sind es fünf Rasten statt Dutzender Ein-Pixel-Schritte.
 */
const ZOOM_LEVELS = [2, 4, 8, 16, 32, 64];

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

let camX = (startX - (viewWidth / tileSize) / 2) * tileSize;
let camY = (startY - (viewHeight / tileSize) / 2) * tileSize;

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

  // Welt-Tile unter dem Anker vor dem Zoom ...
  const tileX = (camX + ax) / tileSize;
  const tileY = (camY + ay) / tileSize;

  zoomIndex = clamped;
  tileSize = ZOOM_LEVELS[zoomIndex];
  renderer.tileSize = tileSize;

  // ... und danach wieder genau unter den Anker legen
  camX = tileX * tileSize - ax;
  camY = tileY * tileSize - ay;

  if (mousePixelX !== undefined && mousePixelY !== undefined) {
    updateHoveredTile(mousePixelX, mousePixelY);
  }
  zoomEl.textContent = `${tileSize}px`;
}

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'e') setZoom(zoomIndex + 1);
  if (e.key === 'q') setZoom(zoomIndex - 1);
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
  const viewportTilesX = viewWidth / tileSize;
  const viewportTilesY = viewHeight / tileSize;

  const target = minimap.toWorld(
      e.clientX - rect.left,
      e.clientY - rect.top,
      camX / tileSize,
      camY / tileSize,
      viewportTilesX,
      viewportTilesY,
  );

  camX = (target.x - viewportTilesX / 2) * tileSize;
  camY = (target.y - viewportTilesY / 2) * tileSize;
});

minimapCanvas.addEventListener('mousemove', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const world = minimap.toWorld(
      Math.floor(e.clientX - rect.left),
      Math.floor(e.clientY - rect.top),
      camX / tileSize,
      camY / tileSize,
      viewWidth / tileSize,
      viewHeight / tileSize,
  );

  hoverCoordsEl.textContent = `${Math.floor(world.x)}, ${Math.floor(world.y)}`;
});

minimapCanvas.addEventListener('mouseleave', () => {
  hoverCoordsEl.textContent = '-, -';
});

/** Markierung und Anzeige auf das Tile unter der angegebenen Canvas-Position setzen. */
function updateHoveredTile(mouseX: number, mouseY: number) {
  mousePixelX = mouseX;
  mousePixelY = mouseY;
  mouseTileX = Math.floor((mouseX + camX) / tileSize);
  mouseTileY = Math.floor((mouseY + camY) / tileSize);

  cursorCoordsEl.textContent = `${mouseTileX}, ${mouseTileY}`;

  const tile = probe.getTile(mouseTileX, mouseTileY);
  const resource =
    tile.resource === 'none'
      ? ''
      : ` | ${RESOURCE_TYPE_LABEL[tile.resource]} ${tile.resourceAmount}`;
  tileInfoEl.textContent =
    `${TILE_TYPE_LABEL[tile.tileType]} | h ${tile.height.toFixed(2)}` +
    ` | Feuchte ${tile.moisture.toFixed(2)} | Temp ${tile.temperature.toFixed(2)}${resource}`;
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

  const speed = 400 * dt * (tileSize / 4);
  if (keys['w']) camY -= speed;
  if (keys['s']) camY += speed;
  if (keys['a']) camX -= speed;
  if (keys['d']) camX += speed;

  renderer.render(camX, camY, mouseTileX, mouseTileY);

  const camTopLeftTileX = camX / tileSize;
  const camTopLeftTileY = camY / tileSize;
  const viewTilesX = viewWidth / tileSize;
  const viewTilesY = viewHeight / tileSize;

  minimap.render(camTopLeftTileX, camTopLeftTileY, viewTilesX, viewTilesY);

  const camCenterTileX = Math.round(camTopLeftTileX + viewTilesX / 2);
  const camCenterTileY = Math.round(camTopLeftTileY + viewTilesY / 2);
  posEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;
  sampleEl.textContent = (1 / (tileSize * pixelRatio)).toFixed(4);
  camCoordsEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;

  if (now - lastUrlUpdate > 500) {
    updateURL(seed, camCenterTileX, camCenterTileY, tileSize);
    lastUrlUpdate = now;
  }

  requestAnimationFrame(loop);
}

zoomEl.textContent = `${tileSize}px`;
requestAnimationFrame(loop);
document.title = `Map - ${seed}`;