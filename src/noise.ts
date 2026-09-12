// noise.ts
// Deterministische Noise-Funktionen für Endlos-Map

export class SeededRandom {
  private seed: number;

  constructor(seed: number | string) {
    this.seed = typeof seed === "string" ? this.hashString(seed) : seed;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // Mulberry32 PRNG - schnell + gute Verteilung
  next(): number {
    this.seed |= 0;
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), this.seed | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

// Nur die x/y-Anteile der 12 klassischen 3D-Gradienten - als flache Arrays,
// damit noise2D ohne Array-of-Array-Zugriffe und ohne Methodenaufruf auskommt.
const GRAD_X = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0]);
const GRAD_Y = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1]);

// 2D Simplex Noise - besser als Perlin für Terrain
export class SimplexNoise {
  // Vorberechnet: perm[i] % 12, spart eine Modulo-Operation pro Ecke.
  private permMod12: Uint8Array;
  private perm: Uint8Array;

  constructor(seed: number | string) {
    const random = new SeededRandom(seed);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    const p = new Uint8Array(256);

    for (let i = 0; i < 256; i++) p[i] = i;
    // Shuffle
    for (let i = 255; i > 0; i--) {
      const r = Math.floor(random.next() * (i + 1));
      [p[i], p[r]] = [p[r], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2D(xin: number, yin: number): number {
    let n0 = 0,
      n1 = 0,
      n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;
    const gi0 = this.permMod12[ii + this.perm[jj]];
    const gi1 = this.permMod12[ii + i1 + this.perm[jj + j1]];
    const gi2 = this.permMod12[ii + 1 + this.perm[jj + 1]];

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD_X[gi0] * x0 + GRAD_Y[gi0] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD_X[gi1] * x1 + GRAD_Y[gi1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD_X[gi2] * x2 + GRAD_Y[gi2] * y2);
    }
    // Output: -1 bis 1
    return 70 * (n0 + n1 + n2);
  }
}

// Eine einzelne Simplex-Oktave hat eine Standardabweichung von ca. 0.44.
const SIMPLEX_SD = 0.44;

// Fractal Noise (fBm) für mehr Detail - AoE2 Style
export class FractalNoise {
  private amplitudes: number[] = [];
  private invScale: number;

  constructor(
    private noise: SimplexNoise,
    private octaves: number = 4,
    persistence: number = 0.5,
    private lacunarity: number = 2.0,
  ) {
    let amplitude = 1;
    let sumSq = 0;
    for (let i = 0; i < octaves; i++) {
      this.amplitudes.push(amplitude);
      sumSq += amplitude * amplitude;
      amplitude *= persistence;
    }
    // Die Oktaven sind quasi unabhängig, also addieren sich ihre Varianzen.
    // Teilen durch die Summen-sd normiert das Ergebnis auf sd = 1 - unabhängig
    // davon, wie octaves/persistence eingestellt sind.
    this.invScale = 1 / (SIMPLEX_SD * Math.sqrt(sumSq));
  }

  // Rohwert mit Standardabweichung 1. Unbeschränkt, praktisch -4..4.
  // Für Weiterrechnen (Warping, Blending) besser geeignet als noise2D.
  raw(x: number, y: number): number {
    let total = 0;
    let frequency = 1;

    for (let i = 0; i < this.octaves; i++) {
      total += this.noise.noise2D(x * frequency, y * frequency) * this.amplitudes[i];
      frequency *= this.lacunarity;
    }
    return total * this.invScale;
  }

  // -1 bis 1, weich begrenzt statt hart geclamped (keine Plateaus an den Enden).
  noise2D(x: number, y: number): number {
    return Math.tanh(this.raw(x, y) * 0.85);
  }
}

// Ridged Noise - kehrt die Täler nach oben um und erzeugt scharfe Grate.
// Ergebnis 0..1, 1 = Grat. Damit werden aus runden Höhen-Blobs Gebirgsketten.
export class RidgedNoise {
  private amplitudes: number[] = [];
  private maxValue = 0;

  constructor(
    private noise: SimplexNoise,
    private octaves: number = 4,
    persistence: number = 0.5,
    private lacunarity: number = 2.0,
  ) {
    let amplitude = 1;
    for (let i = 0; i < octaves; i++) {
      this.amplitudes.push(amplitude);
      this.maxValue += amplitude;
      amplitude *= persistence;
    }
  }

  noise2D(x: number, y: number): number {
    let total = 0;
    let frequency = 1;

    for (let i = 0; i < this.octaves; i++) {
      const n = 1 - Math.abs(this.noise.noise2D(x * frequency, y * frequency));
      total += n * n * this.amplitudes[i];
      frequency *= this.lacunarity;
    }
    return total / this.maxValue;
  }
}

// Map Generator - kombiniert mehrere Noise Layer wie AoE2
export type TileType =
  | "deep_water"
  | "water"
  | "beach"
  | "desert"
  | "grass"
  | "forest"
  | "mountain"
  | "snow";

export interface MapTile {
  x: number;
  y: number;
  height: number;
  moisture: number;
  temperature: number;
  /** Hangneigung Richtung Lichtquelle (oben links), -1..1. Für Hillshading. */
  shade: number;
  /** Feinkörniges Rauschen 0..1 für Farbvariation innerhalb eines Bioms. */
  variation: number;
  tileType: TileType;
}

// Höhen-Schwellen. Die Höhe ist tanh-normiert, d.h. sie nutzt -1..1 gleichmäßig
// aus - anders als bei der alten Normierung sind diese Werte direkt ablesbar.
const DEEP_WATER_LEVEL = -0.70;
const SEA_LEVEL = -0.40;
const SHORE_LEVEL = -0.34;
const HILL_LEVEL = 0.74;
const PEAK_LEVEL = 0.89;
/** Gipfel unter dieser Temperatur bekommen Schnee. */
const SNOW_TEMPERATURE = -0.9;
/** Sehr kaltes Flachland wird zur Schneewüste. */
const TUNDRA_TEMPERATURE = -0.92;
/** Wieviel Temperatur pro Höhe verloren geht. */
const LAPSE_RATE = 0.8;

/**
 * Weltmaßstab: 1 Noise-Einheit entspricht 1/MAP_SCALE Tiles. Bei 0.0025 sind
 * Kontinente ein paar hundert Tiles groß - bei einem Viewport von ~240 Tiles
 * sieht man also Küste und Hinterland statt eines Flickenteppichs.
 */
export const MAP_SCALE = 0.0025;

/** Wie stark das Domain Warping die Küstenlinien verzerrt (in Noise-Einheiten). */
const WARP_STRENGTH = 0.09;
/** Frequenz und Gewicht der unverzerrten Feinstruktur. */
const DETAIL_FREQUENCY = 14;
const DETAIL_STRENGTH = 0.16;

/**
 * Feinste Oktaven, die erst eingeblendet werden, wenn feiner als ein Tile
 * abgetastet wird. Ohne sie zeigt das Hineinzoomen nur eine glattere
 * Interpolation derselben Daten - und die Schattierung legt dabei die Knicke
 * im Simplex-Gitter als schnurgerade Linien frei, weil sie die Ableitung
 * sichtbar macht. Die Fortsetzung der Kaskade überdeckt sie mit echter Struktur.
 */
const MICRO_FREQUENCY = DETAIL_FREQUENCY * 16;
const MICRO_STRENGTH = 0.009;

/**
 * Feuchte und Temperatur sind sehr großflächig. Eine Biom-Schwelle darauf
 * ergibt beim Hineinzoomen eine schnurgerade Linie quer durchs Bild. Ein
 * hochfrequenter Zuschlag macht aus der Kante einen ausgefransten Saum -
 * bewusst mit fester Frequenz, damit die Grenze beim Zoomen stehen bleibt.
 * Nur zwei Oktaven: die dritte läge bei herausgezoomter Ansicht unter der
 * Abtastrate und würde die Biom-Ränder zu Bildrauschen aliasen.
 */
const CLIMATE_FRINGE_FREQUENCY = 60;
const CLIMATE_FRINGE_STRENGTH = 0.09;
/** Ab welcher Höhe Grate eingeblendet werden. */
const RIDGE_START = 0.35;
/** Wie stark Grate ins Hochland eingeblendet werden. */
const RIDGE_STRENGTH = 0.32;
/** Verstärkung der Hangneigung vor dem Weichbegrenzen. */
const SHADE_GAIN = 26;

/** Höhen-Bänder, damit der Renderer innerhalb eines Bioms interpolieren kann. */
export const TERRAIN_LEVELS = {
  deepWater: DEEP_WATER_LEVEL,
  sea: SEA_LEVEL,
  shore: SHORE_LEVEL,
  hill: HILL_LEVEL,
  peak: PEAK_LEVEL,
} as const;

export class MapGenerator {
  private heightNoise: FractalNoise;
  private reliefNoise: FractalNoise;
  private microNoise: FractalNoise;
  private fringeNoise: FractalNoise;
  private moistureNoise: FractalNoise;
  private tempNoise: FractalNoise;
  private warpNoise: FractalNoise;
  private ridgeNoise: RidgedNoise;
  private detailNoise: SimplexNoise;

  constructor(seed: string) {
    this.heightNoise = new FractalNoise(new SimplexNoise(seed + "_height"), 4, 0.5, 2);
    this.reliefNoise = new FractalNoise(new SimplexNoise(seed + "_relief"), 4, 0.5, 2);
    this.microNoise = new FractalNoise(new SimplexNoise(seed + "_micro"), 2, 0.45, 2);
    this.fringeNoise = new FractalNoise(new SimplexNoise(seed + "_fringe"), 2, 0.5, 2);
    this.moistureNoise = new FractalNoise(new SimplexNoise(seed + "_moist"), 4, 0.55, 2);
    this.tempNoise = new FractalNoise(new SimplexNoise(seed + "_temp"), 3, 0.5, 2);
    this.warpNoise = new FractalNoise(new SimplexNoise(seed + "_warp"), 2, 0.5, 2);
    this.ridgeNoise = new RidgedNoise(new SimplexNoise(seed + "_ridge"), 4, 0.5, 2);
    this.detailNoise = new SimplexNoise(seed + "_detail");
  }

  /**
   * Höhe an einer bereits skalierten Position, -1..1.
   * Domain Warping macht Küsten fransig statt kreisrund, Ridged Noise setzt
   * oberhalb der Hügelgrenze Gebirgskämme obendrauf.
   */
  private elevation(nx: number, ny: number, step: number = 1): number {
    const wx = this.warpNoise.raw(nx + 5.2, ny + 1.3);
    const wy = this.warpNoise.raw(nx - 3.7, ny + 8.1);
    const x = nx + wx * WARP_STRENGTH;
    const y = ny + wy * WARP_STRENGTH;

    // Nur die großen Formen werden verzerrt. Das Feindetail bleibt unverzerrt -
    // sonst zieht der Warp-Gradient es zu gerichteten Schlieren lang.
    const base = this.heightNoise.raw(x, y);
    const coarse = Math.tanh(base * 0.85);

    // Unter Wasser wird das Feindetail ausgeblendet. Becken sind mit Sediment
    // gefüllt - und sichtbar wäre es ohnehin nur als Flecken im Meer.
    const submerged = (coarse - DEEP_WATER_LEVEL) / (SHORE_LEVEL - DEEP_WATER_LEVEL);
    const weight = submerged <= 0 ? 0 : submerged >= 1 ? 1 : submerged * submerged * (3 - 2 * submerged);

    let fine = this.reliefNoise.raw(nx * DETAIL_FREQUENCY, ny * DETAIL_FREQUENCY) * DETAIL_STRENGTH;

    // Je feiner abgetastet wird, desto mehr der nächsten Oktaven werden
    // sichtbar. Bei step >= 1 liegen sie unter der Abtastrate und bleiben aus.
    if (step < 1) {
      const micro = this.microNoise.raw(nx * MICRO_FREQUENCY, ny * MICRO_FREQUENCY);
      fine += micro * MICRO_STRENGTH * (1 - step);
    }

    const land = Math.tanh((base + fine * weight) * 0.85);
    if (land <= RIDGE_START) return land;

    // Weich einblenden, damit an der Gratgrenze keine sichtbare Kante entsteht
    const t = (land - RIDGE_START) / (1 - RIDGE_START);
    const ridge = this.ridgeNoise.noise2D(x * 2.2, y * 2.2);
    return Math.min(1, land + t * t * (ridge - 0.35) * RIDGE_STRENGTH);
  }

  private classify(height: number, moisture: number, temperature: number): TileType {
    if (height < DEEP_WATER_LEVEL) return "deep_water";
    if (height < SEA_LEVEL) return "water";
    if (height < SHORE_LEVEL) return "beach";

    if (height > PEAK_LEVEL) {
      return temperature < SNOW_TEMPERATURE ? "snow" : "mountain";
    }
    if (height > HILL_LEVEL) return "mountain";

    // Flachland nach Klima - AoE2 ähnliche Biom-Logik
    if (temperature < TUNDRA_TEMPERATURE) return "snow";
    if (temperature > 0.25 && moisture < -0.1) return "desert";
    if (moisture > 0.1) return "forest";
    return "grass";
  }

  /** Klima an einer skalierten Position. Höhe kühlt ab -> Schnee auf Gipfeln. */
  private climate(nx: number, ny: number, height: number) {
    const fringeX = this.fringeNoise.raw(nx * CLIMATE_FRINGE_FREQUENCY, ny * CLIMATE_FRINGE_FREQUENCY);
    const fringeY = this.fringeNoise.raw(
      nx * CLIMATE_FRINGE_FREQUENCY + 31.7,
      ny * CLIMATE_FRINGE_FREQUENCY - 12.4,
    );

    const moisture =
      this.moistureNoise.noise2D(nx * 0.6 + 1000, ny * 0.6 + 1000) +
      fringeX * CLIMATE_FRINGE_STRENGTH;
    const raw =
      this.tempNoise.noise2D(nx * 0.35 - 1000, ny * 0.35 - 1000) +
      fringeY * CLIMATE_FRINGE_STRENGTH;

    const temperature = raw - Math.max(0, height) * LAPSE_RATE;
    return { moisture, temperature };
  }

  /**
   * Hangneigung Richtung oben-links, weich auf -1..1 begrenzt. Bei größerer
   * Schrittweite liegen die Nachbarn weiter auseinander, die Höhendifferenz
   * wächst entsprechend - die Verstärkung wird darum mitskaliert, damit die
   * Schattierung auf jeder Auflösung gleich stark wirkt.
   */
  private shadeFrom(here: number, right: number, down: number, step: number): number {
    return Math.tanh(((here - right + (here - down)) * SHADE_GAIN) / step);
  }

  /**
   * Feinrauschen für die Farbvariation. Die Frequenz wird an die Schrittweite
   * gekoppelt, sonst zerfällt die Textur bei grober Abtastung zu Bildrauschen.
   */
  private variationAt(x: number, y: number, step: number): number {
    return (this.detailNoise.noise2D((x * 0.35) / step, (y * 0.35) / step) + 1) * 0.5;
  }

  getTile(x: number, y: number, scale: number = MAP_SCALE): MapTile {
    const nx = x * scale;
    const ny = y * scale;

    const height = this.elevation(nx, ny);
    const shade = this.shadeFrom(
      height,
      this.elevation(nx + scale, ny),
      this.elevation(nx, ny + scale),
      1,
    );
    const { moisture, temperature } = this.climate(nx, ny, height);

    return {
      x,
      y,
      height,
      moisture,
      temperature,
      shade,
      variation: this.variationAt(x, y, 1),
      tileType: this.classify(height, moisture, temperature),
    };
  }

  /**
   * Chunk für Factorio-Style Endlos-Map.
   *
   * `step` ist die Schrittweite in Welt-Tiles: 1 ist die volle Auflösung, 4
   * tastet nur jedes vierte Tile ab. Damit liefert dieselbe Funktion auch die
   * grobe Übersicht für die Minimap, ohne dafür Tausende Detail-Chunks zu
   * erzeugen. Ein Chunk deckt `chunkSize * step` Welt-Tiles je Achse ab.
   */
  generateChunk(
    chunkX: number,
    chunkY: number,
    chunkSize: number = 32,
    step: number = 1,
    scale: number = MAP_SCALE,
  ): MapTile[][] {
    const originX = chunkX * chunkSize * step;
    const originY = chunkY * chunkSize * step;

    // Höhengitter mit einer Zeile/Spalte Überhang: so kostet die Hangneigung
    // nur ~1 statt 3 Höhen-Auswertungen pro Tile.
    const heights: number[][] = [];
    for (let y = 0; y <= chunkSize; y++) {
      const row = new Array<number>(chunkSize + 1);
      for (let x = 0; x <= chunkSize; x++) {
        row[x] = this.elevation((originX + x * step) * scale, (originY + y * step) * scale, step);
      }
      heights[y] = row;
    }

    const chunk: MapTile[][] = [];
    for (let y = 0; y < chunkSize; y++) {
      chunk[y] = [];
      for (let x = 0; x < chunkSize; x++) {
        const worldX = originX + x * step;
        const worldY = originY + y * step;
        const height = heights[y][x];
        const { moisture, temperature } = this.climate(worldX * scale, worldY * scale, height);

        chunk[y][x] = {
          x: worldX,
          y: worldY,
          height,
          moisture,
          temperature,
          shade: this.shadeFrom(height, heights[y][x + 1], heights[y + 1][x], step),
          variation: this.variationAt(worldX, worldY, step),
          tileType: this.classify(height, moisture, temperature),
        };
      }
    }
    return chunk;
  }
}
