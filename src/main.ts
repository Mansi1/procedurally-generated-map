import { MapGenerator } from './noise';
import { ChunkManager, MapRenderer, MiniMap } from './map';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const posEl = document.getElementById('pos')!;
const chunksEl = document.getElementById('chunks')!;
const hoverCoordsEl = document.getElementById('hover-coords')!;
const camCoordsEl = document.getElementById('cam-coords')!;
const cursorCoordsEl = document.getElementById('cursor-coords')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

const seed = 'AoE2Factorio1337';
const mapGen = new MapGenerator(seed);
const chunkManager = new ChunkManager(mapGen, 32, seed);

let tileSize = 4;
const renderer = new MapRenderer(canvas, chunkManager, tileSize);
const minimap = new MiniMap(minimapCanvas, chunkManager);

// camX/camY = Top-Left Pixel der Kamera
let camX = 0;
let camY = 0;
let mouseTileX: number | undefined;
let mouseTileY: number | undefined;

const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'e') {
    tileSize = Math.min(tileSize + 1, 16);
    renderer['tileSize'] = tileSize;
  }
  if (e.key === 'q') {
    tileSize = Math.max(tileSize - 1, 2);
    renderer['tileSize'] = tileSize;
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// MiniMap Click - setzt Viewport-Mitte auf Klickposition
minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left; // 0-299
  const clickY = e.clientY - rect.top;  // 0-299

  const camTopLeftTileX = camX / tileSize;
  const camTopLeftTileY = camY / tileSize;
  const viewportTilesX = canvas.width / tileSize;
  const viewportTilesY = canvas.height / tileSize;

  // Aktuelle Viewport-Mitte in Tiles
  const camCenterTileX = camTopLeftTileX + viewportTilesX / 2;
  const camCenterTileY = camTopLeftTileY + viewportTilesY / 2;

  // Delta von MiniMap-Mitte
  const deltaX = clickX - 150;
  const deltaY = clickY - 150;

  // Neues Ziel-Tile für die Mitte
  const targetTileX = camCenterTileX + deltaX;
  const targetTileY = camCenterTileY + deltaY;

  // Kamera Top-Left so setzen dass Target in der Mitte landet
  camX = (targetTileX - viewportTilesX / 2) * tileSize;
  camY = (targetTileY - viewportTilesY / 2) * tileSize;
});

// MiniMap Hover - zeigt World-Tile unter Maus
minimapCanvas.addEventListener('mousemove', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const x = Math.floor(e.clientX - rect.left);
  const y = Math.floor(e.clientY - rect.top);

  const camTopLeftTileX = camX / tileSize;
  const camTopLeftTileY = camY / tileSize;
  const viewportTilesX = canvas.width / tileSize;
  const viewportTilesY = canvas.height / tileSize;

  const viewportCenterTileX = camTopLeftTileX + viewportTilesX / 2;
  const viewportCenterTileY = camTopLeftTileY + viewportTilesY / 2;

  const startTileX = viewportCenterTileX - 150;
  const startTileY = viewportCenterTileY - 150;

  const worldTileX = Math.floor(startTileX + x);
  const worldTileY = Math.floor(startTileY + y);

  hoverCoordsEl.textContent = `${worldTileX}, ${worldTileY}`;
});

minimapCanvas.addEventListener('mouseleave', () => {
  hoverCoordsEl.textContent = '-, -';
});

// Main Canvas Hover - zeigt Tile unter Cursor
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const worldPixelX = mouseX + camX;
  const worldPixelY = mouseY + camY;

  mouseTileX = Math.floor(worldPixelX / tileSize);
  mouseTileY = Math.floor(worldPixelY / tileSize);

  cursorCoordsEl.textContent = `${mouseTileX}, ${mouseTileY}`;
});

canvas.addEventListener('mouseleave', () => {
  mouseTileX = undefined;
  mouseTileY = undefined;
  cursorCoordsEl.textContent = '-, -';
});

let lastTime = performance.now();
function loop(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Movement - speed skaliert mit tileSize damit es sich gleich anfühlt
  const speed = 400 * dt * (tileSize / 4);
  if (keys['w']) camY -= speed;
  if (keys['s']) camY += speed;
  if (keys['a']) camX -= speed;
  if (keys['d']) camX += speed;

  // Render Main Map
  renderer.render(camX, camY, mouseTileX, mouseTileY);

  // MiniMap Update
  const camTopLeftTileX = camX / tileSize;
  const camTopLeftTileY = camY / tileSize;
  const viewTilesX = canvas.width / tileSize;
  const viewTilesY = canvas.height / tileSize;

  minimap.render(camTopLeftTileX, camTopLeftTileY, viewTilesX, viewTilesY);

  // UI Update - zeigt Viewport-Mitte an
  const camCenterTileX = Math.round(camTopLeftTileX + viewTilesX / 2);
  const camCenterTileY = Math.round(camTopLeftTileY + viewTilesY / 2);
  posEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;
  camCoordsEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;
  chunksEl.textContent = chunkManager['chunks'].size.toString();

  requestAnimationFrame(loop);
}

// Chunks in Distanz aufräumen
setInterval(() => {
  const camCenterTileX = (camX + canvas.width / 2) / tileSize;
  const camCenterTileY = (camY + canvas.height / 2) / tileSize;
  chunkManager.unloadDistantChunks(camCenterTileX, camCenterTileY, 12);
}, 5000);

requestAnimationFrame(loop);