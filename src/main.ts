import { MapGenerator } from './noise';
import { ChunkManager, MapRenderer, MiniMap } from './map';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const posEl = document.getElementById('pos')!;
const chunksEl = document.getElementById('chunks')!;
const hoverCoordsEl = document.getElementById('hover-coords')!;
const camCoordsEl = document.getElementById('cam-coords')!;
const cursorCoordsEl = document.getElementById('cursor-coords')!;
const fpsEl = document.getElementById('fps')!;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function parseURL(): { seed: string; x: number; y: number } {
  const path = window.location.pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(window.location.search);

  let seed = 'AoE2Factorio1337';
  let x = 0;
  let y = 0;

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

  return { seed, x, y };
}

function updateURL(seed: string, tileX: number, tileY: number) {
  const newPath = `/${seed}/${tileX}-${tileY}`;
  if (window.location.pathname!== newPath) {
    window.history.replaceState(null, '', newPath);
  }
}

const { seed, x: startX, y: startY } = parseURL();
const mapGen = new MapGenerator(seed);
const chunkManager = new ChunkManager(mapGen, 32, seed);

let tileSize = 8;
const renderer = new MapRenderer(canvas, chunkManager, tileSize);
const minimap = new MiniMap(minimapCanvas, chunkManager);

let camX = (startX - (canvas.width / tileSize) / 2) * tileSize;
let camY = (startY - (canvas.height / tileSize) / 2) * tileSize;

let mouseTileX: number | undefined;
let mouseTileY: number | undefined;

const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'e') {
    tileSize = Math.min(tileSize + 1, 16);
    renderer.tileSize = tileSize;
  }
  if (e.key === 'q') {
    tileSize = Math.max(tileSize - 1, 2);
    renderer.tileSize = tileSize;
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const camTopLeftTileX = camX / tileSize;
  const camTopLeftTileY = camY / tileSize;
  const viewportTilesX = canvas.width / tileSize;
  const viewportTilesY = canvas.height / tileSize;

  const camCenterTileX = camTopLeftTileX + viewportTilesX / 2;
  const camCenterTileY = camTopLeftTileY + viewportTilesY / 2;

  const deltaX = clickX - 150;
  const deltaY = clickY - 150;

  const targetTileX = camCenterTileX + deltaX;
  const targetTileY = camCenterTileY + deltaY;

  camX = (targetTileX - viewportTilesX / 2) * tileSize;
  camY = (targetTileY - viewportTilesY / 2) * tileSize;
});

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

// FPS Counter
let lastTime = performance.now();
let lastFpsUpdate = performance.now();
let frames = 0;
let fps = 0;
let lastUrlUpdate = 0;

function loop(now: number) {
  const dt = (now - lastTime) / 1000;
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
  const viewTilesX = canvas.width / tileSize;
  const viewTilesY = canvas.height / tileSize;

  minimap.render(camTopLeftTileX, camTopLeftTileY, viewTilesX, viewTilesY, tileSize);

  const camCenterTileX = Math.round(camTopLeftTileX + viewTilesX / 2);
  const camCenterTileY = Math.round(camTopLeftTileY + viewTilesY / 2);
  posEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;
  camCoordsEl.textContent = `${camCenterTileX}, ${camCenterTileY}`;
  chunksEl.textContent = chunkManager['chunks'].size.toString();

  if (now - lastUrlUpdate > 500) {
    updateURL(seed, camCenterTileX, camCenterTileY);
    lastUrlUpdate = now;
  }

  requestAnimationFrame(loop);
}

setInterval(() => {
  const camCenterTileX = (camX + canvas.width / 2) / tileSize;
  const camCenterTileY = (camY + canvas.height / 2) / tileSize;
  chunkManager.unloadDistantChunks(camCenterTileX, camCenterTileY, 12);
}, 5000);

requestAnimationFrame(loop);
document.title = `Map - ${seed}`;