import { Color, type RGB } from './functions/Color';
import { EntityRenderer, type EntityInstance } from './gl/entityRenderer';
import { TerrainRenderer } from './gl/terrainRenderer';
import {
  screenToGround,
  snapCamera,
  visibleWorldRect,
  type IsoView,
} from './gl/iso';
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

/**
 * Eine Regel: auf `biome` entsteht `type`, sobald das Ressourcen-Rauschen über
 * `threshold` liegt. Die Menge ist (r + 1) * yield, abgerundet.
 *
 * Die Reihenfolge ist Teil der Regel - die erste passende gewinnt. Gold steht
 * deshalb vor Stein: beide liegen im Gebirge, Gold nur in der oberen Spitze
 * der Verteilung, der Rest wird Stein.
 *
 * Diese Tabelle ist die einzige Quelle für die Schwellen. Der Shader bekommt
 * sie als Uniforms (TERRAIN_PALETTE.resourceRules), die CPU-Fassung liest sie
 * in resourceFromNoise(). Vorher standen die Zahlen doppelt da - in TypeScript
 * und in GLSL - und mussten von Hand synchron gehalten werden.
 */
export interface ResourceRule {
  biome: TileType;
  type: Exclude<ResourceType, "none">;
  threshold: number;
  yield: number;
}

export const RESOURCE_RULES: readonly ResourceRule[] = [
  { biome: "forest", type: "wood", threshold: 0.15, yield: 50 },
  { biome: "mountain", type: "gold", threshold: 0.86, yield: 40 },
  { biome: "mountain", type: "stone", threshold: 0.25, yield: 40 },
  { biome: "grass", type: "berries", threshold: 0.62, yield: 30 },
];

/** Position eines Bioms in TILE_TYPE_GRADIENT - entspricht den B_*-Konstanten im Shader. */
const BIOME_INDEX = Object.fromEntries(
  (Object.keys(TILE_TYPE_GRADIENT) as TileType[]).map((t, i) => [t, i]),
) as Record<TileType, number>;

/** Position einer Ressource in RESOURCE_TYPE_COLORS - entspricht uResourceColor[] im Shader. */
const RESOURCE_INDEX = Object.fromEntries(
  (Object.keys(RESOURCE_TYPE_COLORS) as ResourceType[]).map((t, i) => [t, i]),
) as Record<ResourceType, number>;

/** Wertet RESOURCE_RULES aus - erste passende Regel gewinnt. */
export function resourceFromNoise(
  tileType: TileType,
  r: number,
): { type: ResourceType; amount: number } {
  for (const rule of RESOURCE_RULES) {
    if (rule.biome === tileType && r > rule.threshold) {
      return { type: rule.type, amount: Math.floor((r + 1) * rule.yield) };
    }
  }
  return { type: "none", amount: 0 };
}

export interface RenderTile extends MapTile {
  resource: ResourceType;
  resourceAmount: number; // 0-100
  /** Einmal bei der Chunk-Erzeugung berechnet. */
  rgb: RGB;
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

/**
 * Farben und Skalen, die der WebGL-Shader als Uniforms bekommt. Die Reihenfolge
 * der Biome muss zu den B_*-Konstanten im Shader passen - das ist genau die
 * Deklarationsreihenfolge von TILE_TYPE_GRADIENT.
 */
export const TERRAIN_PALETTE = {
  biomeLo: (Object.keys(TILE_TYPE_GRADIENT) as TileType[]).map((t) => TILE_TYPE_GRADIENT[t][0]),
  biomeHi: (Object.keys(TILE_TYPE_GRADIENT) as TileType[]).map((t) => TILE_TYPE_GRADIENT[t][1]),
  waterRamp: WATER_RAMP,
  surf: SURF,
  resourceColors: (Object.keys(RESOURCE_TYPE_COLORS) as ResourceType[]).map(
      (t) => RESOURCE_TYPE_COLORS[t]),
  resourceScale: RESOURCE_SCALE,
  // Als Indizes, damit der Shader sie ohne Namenszuordnung vergleichen kann.
  resourceRules: RESOURCE_RULES.map((rule) => ({
    biome: BIOME_INDEX[rule.biome],
    type: RESOURCE_INDEX[rule.type],
    threshold: rule.threshold,
    yield: rule.yield,
  })),
};

/**
 * Erzeugt einzelne Tiles für die Anzeige unter dem Mauszeiger. Das Bild kommt
 * seit der Umstellung auf WebGL aus dem Shader; ein Chunk-Cache wird dafür
 * nicht mehr gebraucht. Ein Tile kostet ein paar Mikrosekunden, und gebraucht
 * wird es einmal pro Mausbewegung.
 */
export class TileProbe {
  private resourceNoise: FractalNoise;

  constructor(private mapGen: MapGenerator, seed: string) {
    // Wenige Oktaven + niedrige Frequenz: Ressourcen sollen zusammenhängende
    // Vorkommen bilden, kein Konfetti über die ganze Karte.
    this.resourceNoise = new FractalNoise(new SimplexNoise(seed + "_resources"), 2, 0.5, 2);
  }

  private generateResources(tile: MapTile): { type: ResourceType; amount: number } {
    // Ressourcen spawnen nur auf passendem Terrain. Die Schwellen in
    // RESOURCE_RULES passen zur Verteilung von noise2D (sd ~0.6, -1..1).
    const r = this.resourceNoise.noise2D(tile.x * RESOURCE_SCALE, tile.y * RESOURCE_SCALE);
    return resourceFromNoise(tile.tileType, r);
  }

  getTile(worldX: number, worldY: number): RenderTile {
    const tile = this.mapGen.getTile(Math.floor(worldX), Math.floor(worldY));
    const res = this.generateResources(tile);
    const render = { ...tile, resource: res.type, resourceAmount: res.amount } as RenderTile;
    render.rgb = getTileRGB(render);
    return render;
  }
}

/**
 * Hauptansicht in isometrischer 3D-Sicht. Das Gelände entsteht komplett auf der
 * GPU, die Gebäude kommen als zweiter, instanzierter Durchgang darüber.
 */
export class MapRenderer {
  private terrain: TerrainRenderer;
  private entities: EntityRenderer;

  constructor(
      canvas: HTMLCanvasElement,
      seed: string,
      public tileSize: number = 8,
      public pixelRatio: number = 1,
  ) {
    this.terrain = new TerrainRenderer(canvas, seed, TERRAIN_PALETTE);
    this.entities = new EntityRenderer(this.terrain.context);
  }

  /**
   * @param centerX Welt-Tile in der Bildmitte
   */
  render(
      centerX: number,
      centerY: number,
      mouseTileX?: number,
      mouseTileY?: number,
      overlay: EntityInstance[] = [],
  ) {
    const canvas = this.terrain.context.canvas;
    const camera = snapCamera({
      centerX,
      centerY,
      pixelsPerTile: this.tileSize * this.pixelRatio,
      reliefScale: 1,
    }, canvas.width, canvas.height);

    this.terrain.hoverTile =
      mouseTileX !== undefined && mouseTileY !== undefined
        ? { x: mouseTileX, y: mouseTileY }
        : null;

    this.terrain.render(camera);
    // Mindestens acht Geräte-Pixel: kleiner wird ein Gebäude auf der
    // herausgezoomten Karte zum Einzelpunkt und ist nicht mehr zu erkennen.
    this.entities.render(overlay, camera, 8 / camera.pixelsPerTile, this.pixelRatio, true);
  }
}

/**
 * Übersichtskarte - dieselbe Rautenansicht wie die Hauptkarte, aber flach, so
 * wie die Minimap in AoE2. Der Ausschnitt der Hauptansicht ist darauf ein
 * achsenparalleles Rechteck.
 */
export class MiniMap {
  private terrain: TerrainRenderer;
  private entities: EntityRenderer;
  private cssSize = 300;

  /** Wie viel breiter als der Viewport die Minimap zeigt. */
  private static readonly OVERVIEW = 1.7;
  /** So viel Welt (in u-Einheiten) zeigt sie mindestens, damit sie beim Hineinzoomen nützlich bleibt. */
  private static readonly MIN_COVERAGE = 300;

  constructor(
      private canvas: HTMLCanvasElement,
      seed: string,
      pixelRatio: number = 1,
  ) {
    this.terrain = new TerrainRenderer(canvas, seed, TERRAIN_PALETTE);
    this.entities = new EntityRenderer(this.terrain.context);
    this.terrain.centerDot = true;
    // Ohne Relief gibt es nichts zu unterteilen.
    this.terrain.cellPixels = 64;
    // Die Minimap verschiebt sich nur mit der Hauptansicht und viel langsamer.
    this.terrain.bubblePixels = 64;
    this.setPixelRatio(pixelRatio);
  }

  setPixelRatio(pixelRatio: number) {
    this.canvas.width = Math.round(this.cssSize * pixelRatio);
    this.canvas.height = Math.round(this.cssSize * pixelRatio);
    this.canvas.style.width = `${this.cssSize}px`;
    this.canvas.style.height = `${this.cssSize}px`;
  }

  /** u-Einheiten, die die Minimap waagerecht abdeckt. */
  private coverage(view: IsoView): number {
    return Math.max((view.width / view.tileSize) * MiniMap.OVERVIEW, MiniMap.MIN_COVERAGE);
  }

  /** Dieselbe Mitte wie die Hauptansicht, in CSS-Pixeln der Minimap. */
  private miniView(view: IsoView): IsoView {
    return {
      centerX: view.centerX,
      centerY: view.centerY,
      tileSize: this.cssSize / this.coverage(view),
      width: this.cssSize,
      height: this.cssSize,
    };
  }

  render(view: IsoView, overlay: EntityInstance[] = []) {
    const mini = this.miniView(view);
    const scale = this.canvas.width / this.cssSize;
    const camera = snapCamera({
      centerX: view.centerX,
      centerY: view.centerY,
      pixelsPerTile: mini.tileSize * scale,
      reliefScale: 0,
    }, this.canvas.width, this.canvas.height);

    const w = (view.width / view.tileSize) * mini.tileSize * scale;
    const h = (view.height / view.tileSize) * mini.tileSize * scale;
    this.terrain.viewRect = {
      x: (this.canvas.width - w) / 2,
      y: (this.canvas.height - h) / 2,
      width: w,
      height: h,
    };
    this.terrain.render(camera);
    // Auf der Minimap zählt nur, dass überhaupt etwas dasteht - vier Pixel
    // reichen dafür, die Form ist auf dieser Größe ohnehin nicht zu erkennen.
    this.entities.render(overlay, camera, 4 / camera.pixelsPerTile);
  }

  /** Welt-Ausschnitt, den die Minimap zeigt - für das Einsammeln der Instanzen. */
  viewRectOf(view: IsoView) {
    return visibleWorldRect({ ...this.miniView(view) });
  }

  /** Rechnet einen Klick (in CSS-Pixeln) auf die Minimap in Welt-Tiles um. */
  toWorld(clickX: number, clickY: number, view: IsoView): { x: number; y: number } {
    return screenToGround(this.miniView(view), clickX, clickY);
  }
}
