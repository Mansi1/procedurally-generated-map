import { MapGenerator } from './noise';
import { ChunkManager, MapRenderer, MiniMap } from './map';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
const posEl = document.getElementById('pos')!;
const chunksEl = document.getElementById('chunks')!;

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
const minimap = new MiniMap(minimapCanvas, chunkManager); // <- neu

let camX = 0;
let camY = 0;
const keys: Record<string, boolean> = {};

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'e') tileSize = Math.min(tileSize + 1, 16);
  if (e.key === 'q') tileSize = Math.max(tileSize - 1, 2);
  renderer['tileSize'] = tileSize;
});

window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Click auf MiniMap = dorthin springen
minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const camTileX = Math.floor(camX / tileSize);
  const camTileY = Math.floor(camY / tileSize);
  const targetTileX = camTileX - 150 + x;
  const targetTileY = camTileY - 150 + y;

  camX = targetTileX * tileSize;
  camY = targetTileY * tileSize;
});

let lastTime = performance.now();
function loop(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const speed = 400 * dt * (tileSize / 4);
  if (keys['w']) camY -= speed;
  if (keys['s']) camY += speed;
  if (keys['a']) camX -= speed;
  if (keys['d']) camX += speed;

  renderer.render(camX, camY);

  // MiniMap Update
  const tileX = Math.floor(camX / tileSize);
  const tileY = Math.floor(camY / tileSize);
  const viewTilesX = Math.ceil(canvas.width / tileSize);
  const viewTilesY = Math.ceil(canvas.height / tileSize);
  minimap.render(tileX, tileY, viewTilesX, viewTilesY);

  posEl.textContent = `${tileX}, ${tileY}`;
  chunksEl.textContent = chunkManager['chunks'].size.toString();

  requestAnimationFrame(loop);
}

setInterval(() => {
  chunkManager.unloadDistantChunks(camX / tileSize, camY / tileSize, 12);
}, 5000);

requestAnimationFrame(loop);