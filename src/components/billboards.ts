// billboards.ts
// Bilder der Bäume für weit draußen (EntityRenderer.setBillboards): jede
// Baumart in vier Drehungen einmal aus ihrem Modell gerendert - auf der Bühne
// der Symbole (modelIcons.ts) - und in ein Bild gepackt. Die Ansicht des
// Spiels ist parallel, ein Baum sieht also überall gleich aus; nur die
// Blickrichtung (Kompass) ändert ihn, dann wird neu gerendert.

import { TREES, type BillboardAtlas, type EntityInstance } from '../gl/entityRenderer';
import { groundToWorld, viewRotation } from '../gl/iso';
import { getStage } from './modelIcons';

/** Breite des gepackten Bilds in Pixeln. */
const ATLAS_WIDTH = 1024;
/** Abstand zwischen den Bildern - sonst färben Nachbarn beim Verkleinern ab. */
const GAP = 4;
/** Pixel je Tile beim Rendern - ragt ein Baum über den Rand, halb so viele. */
const PIXELS_PER_TILE = 96;
/** Abstand des Fußes vom unteren Rand der Bühne. */
const FOOT_MARGIN = 12;
/** Farbe der Bäume wie auf der Karte (world/resources.ts, LOOK.wood). */
const TREE_COLOR: [number, number, number] = [42, 97, 52];

interface Shot {
  /** RGBA, vormultipliziert, Zeilen von oben. */
  pixels: Uint8Array;
  width: number;
  height: number;
  /** Lage zum Fuß in Tiles je Größe 1: x0, y0 (oben links), Breite, Höhe. */
  box: [number, number, number, number];
}

/** Ein Baum der Größe 1, Fuß auf Welt (0, 0), in Drehung `heading` - ausgeschnitten, vormultipliziert wie auf der Bühne. */
function shoot(shape: number, heading: number): Shot | null {
  const stage = getStage();
  if (!stage) return null;
  const { canvas, gl, renderer } = stage;
  const W = canvas.width;
  const H = canvas.height;
  const tree: EntityInstance[] = [
    { x: -0.5, y: -0.5, size: 1, color: TREE_COLOR, shape, alpha: 1, motion: [heading, 0, 0, 1] },
  ];
  for (let ppt = PIXELS_PER_TILE; ppt >= PIXELS_PER_TILE / 8; ppt /= 2) {
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Die Kamera so, dass der Fuß (Welt 0, 0) mittig knapp über dem unteren Rand liegt.
    const center = groundToWorld(0, -(H / 2 - FOOT_MARGIN) / ppt);
    renderer.render(tree, { centerX: center.x, centerY: center.y, pixelsPerTile: ppt, reliefScale: 0 }, 0);
    const raw = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (raw[(y * W + x) * 4 + 3] < 8) continue;
        // readPixels zählt von unten.
        const top = H - 1 - y;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, top); y1 = Math.max(y1, top);
      }
    }
    if (x1 < 0) return null;
    if (x0 === 0 || y0 === 0 || x1 === W - 1 || y1 === H - 1) continue;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const pixels = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const from = ((H - 1 - (y0 + y)) * W + x0) * 4;
      pixels.set(raw.subarray(from, from + w * 4), y * w * 4);
    }
    const footX = W / 2;
    const footY = H - FOOT_MARGIN;
    return { pixels, width: w, height: h, box: [(x0 - footX) / ppt, (y0 - footY) / ppt, w / ppt, h / ppt] };
  }
  return null;
}

let cache: { rotation: number; leafReady: boolean; atlas: BillboardAtlas | null } | null = null;

/**
 * Die Bilder der Bäume für die jetzige Blickrichtung - gerendert beim ersten
 * Aufruf, nach einem Drehen der Karte und einmal, sobald das Blattfoto
 * geladen ist (vorher sind die Birken nur grün).
 */
export function treeBillboards(): BillboardAtlas | null {
  const stage = getStage();
  if (!stage) return null;
  const rotation = viewRotation();
  if (cache && cache.rotation === rotation && cache.leafReady === stage.renderer.leafReady) return cache.atlas;

  const shots = new Map<number, (Shot | null)[]>();
  for (const shape of TREES) shots.set(shape, [0, 1, 2, 3].map((k) => shoot(shape, (k * Math.PI) / 2)));

  // Reihenweise packen: nebeneinander, bis die Breite voll ist.
  let x = GAP, y = GAP, row = 0;
  const placed: { shape: number; k: number; shot: Shot; x: number; y: number }[] = [];
  for (const [shape, list] of shots) {
    list.forEach((shot, k) => {
      if (!shot) return;
      if (x + shot.width + GAP > ATLAS_WIDTH) {
        x = GAP;
        y += row + GAP;
        row = 0;
      }
      placed.push({ shape, k, shot, x, y });
      x += shot.width + GAP;
      row = Math.max(row, shot.height);
    });
  }
  const height = y + row + GAP;
  const pixels = new Uint8Array(ATLAS_WIDTH * height * 4);
  const cells: BillboardAtlas['cells'] = new Map();
  for (const { shape, k, shot, x: px, y: py } of placed) {
    for (let y = 0; y < shot.height; y++) {
      pixels.set(shot.pixels.subarray(y * shot.width * 4, (y + 1) * shot.width * 4), ((py + y) * ATLAS_WIDTH + px) * 4);
    }
    const list = cells.get(shape) ?? cells.set(shape, []).get(shape)!;
    list[k] = {
      rect: [px / ATLAS_WIDTH, py / height, (px + shot.width) / ATLAS_WIDTH, (py + shot.height) / height],
      box: shot.box,
    };
  }
  // Fehlt eine Drehung, nimmt sie die erste vorhandene.
  for (const [shape, list] of cells) {
    const any = list.find(Boolean);
    if (!any) cells.delete(shape);
    else for (let k = 0; k < 4; k++) list[k] ??= any;
  }
  const atlas = cells.size > 0 ? { width: ATLAS_WIDTH, height, pixels, cells } : null;
  cache = { rotation, leafReady: stage.renderer.leafReady, atlas };
  return atlas;
}
