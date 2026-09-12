import { Color, type RGB } from './functions/Color';
import {
  FractalNoise,
  MapGenerator,
  type MapTile,
  SimplexNoise,
  TERRAIN_LEVELS,
  type TileType,
} from './noise';

export type ResourceType = "none" | "wood" | "gold" | "stone" | "berries";

/**
 * Pro Biom ein Farbverlauf [tief/matt, hoch/hell]. Innerhalb eines Bioms wird
 * zwischen beiden interpoliert - nach Höhe und einem feinen Rauschen. Dadurch
 * wird aus einer einfarbigen Fläche eine Textur.
 */
export const TILE_TYPE_GRADIENT: Record<TileType, [Color, Color]> = {
  deep_water: [Color.rgb(10, 26, 62), Color.rgb(24, 56, 108)],
  water: [Color.rgb(30, 74, 134), Color.rgb(66, 134, 180)],
  beach: [Color.rgb(206, 188, 140), Color.rgb(238, 224, 182)],
  desert: [Color.rgb(186, 146, 82), Color.rgb(222, 190, 124)],
  grass: [Color.rgb(82, 122, 56), Color.rgb(138, 174, 86)],
  forest: [Color.rgb(30, 70, 42), Color.rgb(62, 108, 60)],
  mountain: [Color.rgb(84, 78, 74), Color.rgb(178, 172, 166)],
  snow: [Color.rgb(200, 214, 226), Color.rgb(250, 253, 255)],
};

/** Repräsentative Einzelfarbe pro Biom - für Legenden und Fallbacks. */
export const TILE_TYPE_COLOR: Record<TileType, Color> = Object.fromEntries(
  (Object.keys(TILE_TYPE_GRADIENT) as TileType[]).map((type) => {
    const [lo, hi] = TILE_TYPE_GRADIENT[type];
    const a = lo.toRGB();
    const b = hi.toRGB();
    return [type, Color.rgb((a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1, (a[2] + b[2]) >> 1)];
  }),
) as Record<TileType, Color>;

export const TILE_TYPE_LABEL: Record<TileType, string> = {
  deep_water: "Tiefsee",
  water: "Wasser",
  beach: "Strand",
  desert: "Wüste",
  grass: "Wiese",
  forest: "Wald",
  mountain: "Gebirge",
  snow: "Schnee",
};

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  none: "-",
  wood: "Holz",
  gold: "Gold",
  stone: "Stein",
  berries: "Beeren",
};

export const RESOURCE_TYPE_COLORS: Record<ResourceType, Color> = {
  none: Color.rgb(0, 0, 0),
  wood: Color.rgb(72, 52, 28),
  gold: Color.rgb(198, 162, 48),
  stone: Color.rgb(124, 126, 134),
  berries: Color.rgb(168, 52, 62),
} as const;

export interface RenderTile extends MapTile {
  resource: ResourceType;
  resourceAmount: number; // 0-100
  /** Einmal bei der Chunk-Erzeugung berechnet. */
  rgb: RGB;
}

/**
 * Ein Chunk hält nur noch seine Farben, nicht die Tile-Objekte. Beim
 * Herauszoomen sind einige hundert Chunks gleichzeitig geladen - als Objekte
 * wären das über 100 MB und entsprechend lange GC-Pausen. Einzelne Tiles
 * (für die Anzeige unter dem Mauszeiger) werden bei Bedarf neu berechnet.
 */
export interface Chunk {
  /** RGBA je Zelle, zeilenweise - der Renderer kopiert daraus ganze Zeilen. */
  colors: Uint8ClampedArray;
  cx: number;
  cy: number;
  /** Welt-Tiles je Zelle. 1 = Detail, >1 = grobe Übersicht für die Minimap. */
  step: number;
}

/**
 * Wasser bekommt eine durchgehende Tiefenrampe statt zweier Farbflächen -
 * sonst zeichnet die Grenze deep_water/water sichtbare Tintenkleckse ins Meer.
 */
const WATER_RAMP: RGB[] = [
  [96, 166, 202], // Uferlinie
  [44, 104, 162],
  [22, 58, 112],
  [8, 22, 56], // tiefste Stelle
];
/** Farbe der Brandung direkt am Ufer. */
const SURF: RGB = [178, 216, 224];

/** Weltmaßstab der Ressourcen-Vorkommen (1/RESOURCE_SCALE Tiles pro Einheit). */
const RESOURCE_SCALE = 0.018;

/** Farbe für noch nicht erzeugte Chunks. */
const LOADING_COLOR: RGB = [18, 22, 28];

/**
 * Kantenlänge einer Abtastzelle in CSS-Pixeln. Kleiner = feineres Gelände beim
 * Hineinzoomen, aber quadratisch mehr Chunks. Weil die Zelle an den Bildschirm
 * gekoppelt ist und nicht an die Welt, bleibt die Last über alle Zoomstufen
 * gleich: es sind immer ungefähr Bildfläche / CELL_CSS_PIXELS² Zellen.
 */
const CELL_CSS_PIXELS = 2;

/** Packt eine Farbe so, wie sie im Speicher einer ImageData liegt (endian-sicher). */
function packRGB(rgb: RGB): number {
  const bytes = new Uint8ClampedArray(4);
  bytes[0] = rgb[0];
  bytes[1] = rgb[1];
  bytes[2] = rgb[2];
  bytes[3] = 255;
  return new Uint32Array(bytes.buffer)[0];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const byte = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Höhen-Band, in dem ein Biom liegt - für die Interpolation innerhalb des Bioms. */
function heightBand(type: TileType): [number, number] {
  switch (type) {
    case "deep_water":
      return [-1, TERRAIN_LEVELS.deepWater];
    case "water":
      return [TERRAIN_LEVELS.deepWater, TERRAIN_LEVELS.sea];
    case "beach":
      return [TERRAIN_LEVELS.sea, TERRAIN_LEVELS.shore];
    case "mountain":
      return [TERRAIN_LEVELS.hill, 1];
    case "snow":
      return [TERRAIN_LEVELS.peak, 1];
    default:
      return [TERRAIN_LEVELS.shore, TERRAIN_LEVELS.hill];
  }
}

/**
 * Endfarbe eines Tiles. Wasser bekommt eine Tiefen-Rampe und kaum Schattierung,
 * Land bekommt Hillshading aus der Hangneigung - das ist der eigentliche Grund,
 * warum die Karte nach Gelände aussieht und nicht nach Farbflecken.
 */
export function getTileRGB(tile: MapTile & { resource?: ResourceType; resourceAmount?: number }): RGB {
  const isWater = tile.tileType === "deep_water" || tile.tileType === "water";
  let r: number;
  let g: number;
  let bl: number;

  if (isWater) {
    // 0 = Uferlinie, 1 = tiefste Stelle. Die Wurzel zieht die Farbänderung an
    // die Küste, wo man sie sieht, statt sie im tiefen Meer zu verschenken.
    // Leichtes Dithern über das Detail-Rauschen, sonst sind die Stützstellen
    // der Rampe als konzentrische Streifen sichtbar (Mach-Banding).
    const depth = clamp01(
      (TERRAIN_LEVELS.sea - tile.height) / (TERRAIN_LEVELS.sea + 1) +
        (tile.variation - 0.5) * 0.03,
    );
    const pos = Math.pow(depth, 0.7) * (WATER_RAMP.length - 1);
    const i = Math.min(WATER_RAMP.length - 2, Math.floor(pos));
    const raw = pos - i;
    const f = raw * raw * (3 - 2 * raw);
    r = lerp(WATER_RAMP[i][0], WATER_RAMP[i + 1][0], f);
    g = lerp(WATER_RAMP[i][1], WATER_RAMP[i + 1][1], f);
    bl = lerp(WATER_RAMP[i][2], WATER_RAMP[i + 1][2], f);

    // Brandungssaum im ganz flachen Wasser
    const surf = Math.pow(clamp01(1 - depth / 0.16), 2) * 0.42;
    if (surf > 0) {
      r = lerp(r, SURF[0], surf);
      g = lerp(g, SURF[1], surf);
      bl = lerp(bl, SURF[2], surf);
    }
  } else {
    const [lo, hi] = TILE_TYPE_GRADIENT[tile.tileType];
    const [bandLo, bandHi] = heightBand(tile.tileType);

    const rel = clamp01((tile.height - bandLo) / (bandHi - bandLo || 1));
    const t = clamp01(0.2 + rel * 0.62 + (tile.variation - 0.5) * 0.3);

    const a = lo.toRGB();
    const b = hi.toRGB();
    r = lerp(a[0], b[0], t);
    g = lerp(a[1], b[1], t);
    bl = lerp(a[2], b[2], t);
  }

  const light = 1 + tile.shade * (isWater ? 0.08 : 0.42);
  r *= light;
  g *= light;
  bl *= light;

  if (tile.resource && tile.resource !== "none" && (tile.resourceAmount ?? 0) > 0) {
    const [rr, rg, rb] = RESOURCE_TYPE_COLORS[tile.resource].toRGB();
    const alpha = Math.min((tile.resourceAmount ?? 0) / 100, 1) * 0.3;
    r = lerp(r, rr, alpha);
    g = lerp(g, rg, alpha);
    bl = lerp(bl, rb, alpha);
  }

  return [byte(r), byte(g), byte(bl)];
}

export class ChunkManager {
  private chunks = new Map<string, Chunk>();
  /** Zeitpunkt, ab dem in diesem Frame keine neuen Chunks mehr erzeugt werden. */
  private deadline = 0;
  private resourceNoise: FractalNoise;
  public readonly chunkSize: number;

  constructor(
      private mapGen: MapGenerator,
      chunkSize: number = 32,
      seed: string,
  ) {
    this.chunkSize = chunkSize;
    // Extra Noise Layer für Ressourcen wie in AoE2
    // Wenige Oktaven + niedrige Frequenz: Ressourcen sollen zusammenhängende
    // Vorkommen bilden, kein Konfetti über die ganze Karte.
    this.resourceNoise = new FractalNoise(
        new SimplexNoise(seed + "_resources"),
        2,
        0.5,
        2,
    );
  }

  get loadedChunks(): number {
    return this.chunks.size;
  }

  private chunkKey(cx: number, cy: number, step: number): string {
    return `${step}_${cx}_${cy}`;
  }

  private generateResources(tile: MapTile): {
    type: ResourceType;
    amount: number;
  } {
    const r = this.resourceNoise.noise2D(tile.x * RESOURCE_SCALE, tile.y * RESOURCE_SCALE);

    // Logik: Ressourcen spawnen nur auf passendem Terrain.
    // Die Schwellen passen zur Verteilung von noise2D (sd ~0.6, -1..1).
    if (tile.tileType === "forest" && r > 0.15) {
      return { type: "wood", amount: Math.floor((r + 1) * 50) };
    }
    if (tile.tileType === "mountain" && r > 0.25) {
      return {
        type: r > 0.86 ? "gold" : "stone",
        amount: Math.floor((r + 1) * 40),
      };
    }
    if (tile.tileType === "grass" && r > 0.62) {
      return { type: "berries", amount: Math.floor((r + 1) * 30) };
    }
    return { type: "none", amount: 0 };
  }

  /**
   * `step` ist die Schrittweite in Welt-Tiles. Jede Stufe hat ihren eigenen
   * Cache-Eintrag; die Minimap teilt sich bei step 1 die Chunks mit der
   * Hauptansicht und braucht nur bei grober Abtastung eigene.
   */
  getChunk(cx: number, cy: number, step: number = 1): Chunk {
    const key = this.chunkKey(cx, cy, step);
    const cached = this.chunks.get(key);
    if (cached) return cached;

    const tiles = this.mapGen.generateChunk(cx, cy, this.chunkSize, step);
    const colors = new Uint8ClampedArray(this.chunkSize * this.chunkSize * 4);

    let at = 0;
    for (const row of tiles) {
      for (let i = 0; i < row.length; i++) {
        // Die Tiles sind hier ohnehin kurzlebig, also direkt erweitern statt
        // kopieren - ein Spread pro Tile kostet mehr als die Noise-Auswertung.
        const tile = row[i] as RenderTile;
        const res = this.generateResources(tile);
        tile.resource = res.type;
        tile.resourceAmount = res.amount;
        const rgb = getTileRGB(tile);
        colors[at++] = rgb[0];
        colors[at++] = rgb[1];
        colors[at++] = rgb[2];
        colors[at++] = 255;
      }
    }

    // Die Tile-Objekte werden hier fallengelassen; sie sind kurzlebiger Müll
    // und belasten anders als ein dauerhafter Cache den GC kaum.
    const chunk: Chunk = { colors, cx, cy, step };
    this.chunks.set(key, chunk);
    return chunk;
  }

  /**
   * Wie getChunk, erzeugt aber nichts mehr, wenn das Zeitbudget des Frames
   * aufgebraucht ist. Beim Herauszoomen werden sonst mehrere hundert Chunks in
   * einem einzigen Frame erzeugt - das ist die sichtbare Ruckelquelle.
   */
  getChunkIfAffordable(cx: number, cy: number, step: number = 1): Chunk | undefined {
    const cached = this.chunks.get(this.chunkKey(cx, cy, step));
    if (cached) return cached;
    if (performance.now() >= this.deadline) return undefined;
    return this.getChunk(cx, cy, step);
  }

  /** Gibt der laufenden Frame-Phase ein Zeitbudget fürs Nachladen. */
  beginBudget(milliseconds: number) {
    this.deadline = performance.now() + milliseconds;
  }

  /**
   * Einzelnes Tile mit allen Werten - für die Anzeige unter dem Mauszeiger.
   * Wird frisch berechnet statt zwischengespeichert; das kostet ein paar
   * Mikrosekunden und spart den gesamten Objekt-Cache.
   */
  getTile(worldX: number, worldY: number): RenderTile {
    const tile = this.mapGen.getTile(Math.floor(worldX), Math.floor(worldY));
    const res = this.generateResources(tile);
    const render = {
      ...tile,
      resource: res.type,
      resourceAmount: res.amount,
    } as RenderTile;
    render.rgb = getTileRGB(render);
    return render;
  }

  /**
   * Alles in Welt-Tiles. Gemessen wird als Schachbrettdistanz: Viewport und
   * Minimap decken beide ein Rechteck um die Kamera ab - mit Manhattan-Distanz
   * würden genau deren Ecken laufend verworfen und neu erzeugt.
   */
  unloadDistantChunks(
      cameraX: number,
      cameraY: number,
      detailTiles: number,
      overviewTiles: number,
  ) {
    for (const [key, chunk] of this.chunks) {
      const span = this.chunkSize * chunk.step;
      const centerX = (chunk.cx + 0.5) * span;
      const centerY = (chunk.cy + 0.5) * span;
      const dist = Math.max(Math.abs(centerX - cameraX), Math.abs(centerY - cameraY));

      // Feine Stufen braucht nur die Hauptansicht, grobe nur die Minimap.
      // Stufe 1 nutzen beide, je nach Zoom - dort gilt der größere Radius.
      const limit =
        chunk.step < 1 ? detailTiles
        : chunk.step > 1 ? overviewTiles
        : Math.max(detailTiles, overviewTiles);

      if (dist > limit + span) this.chunks.delete(key);
    }
  }
}

export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  /**
   * Zwischenbild in Tile-Auflösung: 1 Pixel = 1 Tile. Es wird einmal pro Frame
   * hart hochskaliert aufs Canvas geblittet. Beim Herauszoomen auf 2px-Tiles
   * wären es sonst ~500.000 fillRect-Aufrufe pro Frame.
   */
  private tileCanvas: HTMLCanvasElement;
  private tileCtx: CanvasRenderingContext2D;
  private buffer: ImageData | null = null;
  private buffer32: Uint32Array | null = null;
  private bufferWidth = 0;
  private bufferHeight = 0;


  /**
   * Geräte-Pixel je CSS-Pixel. Kamera und tileSize rechnen in CSS-Pixeln,
   * gezeichnet wird in echten Bildschirmpixeln - sonst skaliert der Browser
   * das fertige Canvas hoch und Fadenkreuz und Kanten werden unsauber.
   */
  public pixelRatio = 1;

  constructor(
      private canvas: HTMLCanvasElement,
      private chunkManager: ChunkManager,
      public tileSize: number = 8,
      pixelRatio: number = 1,
  ) {
    this.pixelRatio = pixelRatio;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.tileCanvas = document.createElement("canvas");
    this.tileCtx = this.tileCanvas.getContext("2d", { willReadFrequently: true })!;
  }

  private ensureBuffer(width: number, height: number) {
    if (this.buffer && this.bufferWidth === width && this.bufferHeight === height) return;

    this.tileCanvas.width = width;
    this.tileCanvas.height = height;
    this.buffer = this.tileCtx.createImageData(width, height);
    this.buffer32 = new Uint32Array(this.buffer.data.buffer);
    this.bufferWidth = width;
    this.bufferHeight = height;
  }

  /** Welt-Tiles je Abtastzelle beim aktuellen Zoom. */
  sampleStep(): number {
    const dpr = this.pixelRatio;
    return this.cellPixels(dpr) / (this.tileSize * dpr);
  }

  /** Geräte-Pixel je Abtastzelle - immer ganzzahlig, damit der Blit scharf bleibt. */
  private cellPixels(dpr: number): number {
    return Math.max(1, Math.round(CELL_CSS_PIXELS * dpr));
  }

  render(cameraX: number, cameraY: number, mouseTileX?: number, mouseTileY?: number) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;   // Geräte-Pixel
    const dpr = this.pixelRatio;
    const chunkSize = this.chunkManager.chunkSize;

    // Abgetastet wird nicht je Tile, sondern je Zelle fester Bildschirmgröße.
    // Beim Hineinzoomen wird das Noise dadurch feiner abgetastet statt dieselben
    // Tiles zu Klötzen aufzublasen - und die Zahl der Zellen pro Bildschirm
    // bleibt über alle Zoomstufen gleich.
    const cell = this.cellPixels(dpr);                 // Geräte-Pixel je Zelle
    const step = cell / (this.tileSize * dpr);         // Welt-Tiles je Zelle

    // Ganze Pixel, sonst entstehen beim Scrollen Halbpixel-Nähte.
    const camX = Math.round(cameraX * dpr);
    const camY = Math.round(cameraY * dpr);

    const startCellX = Math.floor(camX / cell);
    const startCellY = Math.floor(camY / cell);
    const cellsX = Math.ceil(width / cell) + 1;
    const cellsY = Math.ceil(height / cell) + 1;

    this.ensureBuffer(cellsX, cellsY);
    const data = this.buffer!.data;
    this.buffer32!.fill(packRGB(LOADING_COLOR));

    const endCellX = startCellX + cellsX;
    const endCellY = startCellY + cellsY;
    const startCx = Math.floor(startCellX / chunkSize);
    const startCy = Math.floor(startCellY / chunkSize);
    const endCx = Math.floor((endCellX - 1) / chunkSize);
    const endCy = Math.floor((endCellY - 1) / chunkSize);

    for (let cy = startCy; cy <= endCy; cy++) {
      for (let cx = startCx; cx <= endCx; cx++) {
        const chunk = this.chunkManager.getChunkIfAffordable(cx, cy, step);
        if (!chunk) continue;

        const originX = cx * chunkSize;
        const originY = cy * chunkSize;
        // Sichtbarer Ausschnitt dieses Chunks, in Chunk-lokalen Zellen
        const x0 = Math.max(0, startCellX - originX);
        const x1 = Math.min(chunkSize, endCellX - originX);
        const y0 = Math.max(0, startCellY - originY);
        const y1 = Math.min(chunkSize, endCellY - originY);
        const runLength = (x1 - x0) * 4;
        if (runLength <= 0) continue;

        for (let y = y0; y < y1; y++) {
          const src = (y * chunkSize + x0) * 4;
          const dst = ((originY + y - startCellY) * cellsX + (originX + x0 - startCellX)) * 4;
          data.set(chunk.colors.subarray(src, src + runLength), dst);
        }
      }
    }

    this.tileCtx.putImageData(this.buffer!, 0, 0);

    // Harte Kanten beim Hochskalieren - sonst matscht der Browser die Zellen weich.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        this.tileCanvas,
        0, 0, cellsX, cellsY,
        startCellX * cell - camX, startCellY * cell - camY, cellsX * cell, cellsY * cell,
    );

    const size = this.tileSize * dpr;        // Geräte-Pixel je Welt-Tile

    if (mouseTileX !== undefined && mouseTileY !== undefined) {
      const screenX = mouseTileX * size - camX;
      const screenY = mouseTileY * size - camY;
      // Strichstärken in CSS-Pixeln denken, in Geräte-Pixeln zeichnen
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 3 * dpr;
      ctx.strokeRect(screenX + dpr / 2, screenY + dpr / 2, size - dpr, size - dpr);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = dpr;
      ctx.strokeRect(screenX + dpr / 2, screenY + dpr / 2, size - dpr, size - dpr);
    }
  }
}

export class MiniMap {
  private ctx: CanvasRenderingContext2D;
  /** Anzeigegröße in CSS-Pixeln. Legt fest, wie viel Welt die Minimap zeigt. */
  private cssSize = 300;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private image: ImageData | null = null;
  private image32: Uint32Array | null = null;
  private imageSize = 0;

  /**
   * Wie viel breiter als der Viewport die Minimap zeigen soll. 1.7 entspricht
   * dem, was sie bei 8px-Tiles schon immer abgedeckt hat - dieser Eindruck
   * bleibt jetzt über alle Zoomstufen gleich.
   */
  private static readonly OVERVIEW = 1.7;

  constructor(
      private canvas: HTMLCanvasElement,
      private chunkManager: ChunkManager,
      private pixelRatio: number = 1,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true })!;
    this.setPixelRatio(pixelRatio);
  }

  setPixelRatio(pixelRatio: number) {
    this.pixelRatio = pixelRatio;
    // Speicher in echten Bildschirmpixeln, Anzeige in CSS-Pixeln
    this.canvas.width = Math.round(this.cssSize * pixelRatio);
    this.canvas.height = Math.round(this.cssSize * pixelRatio);
    this.canvas.style.width = `${this.cssSize}px`;
    this.canvas.style.height = `${this.cssSize}px`;
  }

  /**
   * Welt-Tiles je CSS-Pixel. Zweierpotenz, damit beim Zoomen dieselben
   * Übersichts-Chunks wiederverwendet werden statt für jede Zwischenstufe neue.
   * Hängt bewusst nur an der CSS-Größe: so bleibt der gezeigte Ausschnitt auf
   * jedem Bildschirm gleich, unabhängig von der Pixeldichte.
   */
  private stepFor(viewportTilesX: number): number {
    const wanted = (viewportTilesX * MiniMap.OVERVIEW) / this.cssSize;
    if (wanted <= 1) return 1;
    return 2 ** Math.ceil(Math.log2(wanted));
  }

  /** Gemeinsame Geometrie für Zeichnen und Klick-Umrechnung. */
  private frame(camTopLeftTileX: number, camTopLeftTileY: number, viewportTilesX: number, viewportTilesY: number) {
    const step = this.stepFor(viewportTilesX);
    const cover = this.cssSize * step;

    // Bei hoher Pixeldichte wird feiner abgetastet statt nur hochskaliert -
    // dieselbe Weltfläche, aber ein echtes Bild in Bildschirmauflösung.
    const sample = Math.max(1, 2 ** Math.round(Math.log2(step / this.pixelRatio)));
    const imageSize = Math.round(cover / sample);

    const centerX = camTopLeftTileX + viewportTilesX / 2;
    const centerY = camTopLeftTileY + viewportTilesY / 2;
    const startCellX = Math.floor(centerX / sample) - imageSize / 2;
    const startCellY = Math.floor(centerY / sample) - imageSize / 2;

    return {
      cover,
      sample,
      imageSize,
      startCellX,
      startCellY,
      worldLeft: startCellX * sample,
      worldTop: startCellY * sample,
    };
  }

  private ensureImage(size: number) {
    if (this.image && this.imageSize === size) return;
    this.offscreenCanvas.width = size;
    this.offscreenCanvas.height = size;
    this.image = this.offscreenCtx.createImageData(size, size);
    this.image32 = new Uint32Array(this.image.data.buffer);
    this.imageSize = size;
  }

  render(camTopLeftTileX: number, camTopLeftTileY: number, viewportTilesX: number, viewportTilesY: number) {
    const f = this.frame(camTopLeftTileX, camTopLeftTileY, viewportTilesX, viewportTilesY);
    this.ensureImage(f.imageSize);

    const data = this.image!.data;
    const chunkSize = this.chunkManager.chunkSize;
    this.image32!.fill(packRGB(LOADING_COLOR));

    // Gerechnet wird in Zellen (= sample Welt-Tiles). In diesem Raster ist eine
    // Bildzeile wieder eine zusammenhängende Folge von Chunk-Zellen, die sich
    // am Stück kopieren lässt - unabhängig von Zoom und Pixeldichte.
    for (let y = 0; y < f.imageSize; y++) {
      const cellY = f.startCellY + y;
      const cy = Math.floor(cellY / chunkSize);
      const ly = ((cellY % chunkSize) + chunkSize) % chunkSize;

      let x = 0;
      while (x < f.imageSize) {
        const cellX = f.startCellX + x;
        const cx = Math.floor(cellX / chunkSize);
        const lx = ((cellX % chunkSize) + chunkSize) % chunkSize;
        const run = Math.min(chunkSize - lx, f.imageSize - x);

        // Fehlt der Chunk, bleibt das Stück in der Ladefarbe und wird in einem
        // der nächsten Frames nachgezogen - nie blockiert das den Aufbau.
        const chunk = this.chunkManager.getChunkIfAffordable(cx, cy, f.sample);
        if (chunk) {
          const src = (ly * chunkSize + lx) * 4;
          data.set(chunk.colors.subarray(src, src + run * 4), (y * f.imageSize + x) * 4);
        }
        x += run;
      }
    }

    const pixels = this.canvas.width;
    this.offscreenCtx.putImageData(this.image!, 0, 0);
    // Hochskalieren hart (scharfe Kanten), Herunterskalieren weich (kein Flimmern)
    this.ctx.imageSmoothingEnabled = f.imageSize > pixels;
    this.ctx.drawImage(this.offscreenCanvas, 0, 0, f.imageSize, f.imageSize, 0, 0, pixels, pixels);

    // Overlay in Geräte-Pixeln, Strichstärken weiter in CSS-Pixeln gedacht
    const dpr = this.pixelRatio;
    const perPixel = f.cover / pixels;               // Welt-Tiles je Geräte-Pixel
    const rectX = Math.round((camTopLeftTileX - f.worldLeft) / perPixel) + 0.5;
    const rectY = Math.round((camTopLeftTileY - f.worldTop) / perPixel) + 0.5;
    const rectW = Math.max(3 * dpr, Math.round(viewportTilesX / perPixel));
    const rectH = Math.max(3 * dpr, Math.round(viewportTilesY / perPixel));

    this.ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    this.ctx.lineWidth = 3 * dpr;
    this.ctx.strokeRect(rectX, rectY, rectW, rectH);
    this.ctx.strokeStyle = '#FFFFFF';
    this.ctx.lineWidth = dpr;
    this.ctx.strokeRect(rectX, rectY, rectW, rectH);

    // Kamera-Mittelpunkt
    this.ctx.fillStyle = '#FFDD33';
    this.ctx.fillRect(pixels / 2 - dpr, pixels / 2 - dpr, 3 * dpr, 3 * dpr);
  }

  /** Welt-Tiles, die die Minimap gerade abdeckt - für Cache und Klick-Umrechnung. */
  coverage(viewportTilesX: number): number {
    return this.cssSize * this.stepFor(viewportTilesX);
  }

  /** Rechnet einen Klick (in CSS-Pixeln) auf die Minimap in Welt-Tiles um. */
  toWorld(clickX: number, clickY: number, camTopLeftTileX: number, camTopLeftTileY: number,
          viewportTilesX: number, viewportTilesY: number): { x: number; y: number } {
    const f = this.frame(camTopLeftTileX, camTopLeftTileY, viewportTilesX, viewportTilesY);
    const perCssPixel = f.cover / this.cssSize;
    return {
      x: f.worldLeft + clickX * perCssPixel,
      y: f.worldTop + clickY * perCssPixel,
    };
  }
}
