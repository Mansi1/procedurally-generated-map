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

// 2D Simplex Noise - besser als Perlin für Terrain
export class SimplexNoise {
  private perm: Uint8Array;
  private grad3: number[][];

  constructor(seed: number | string) {
    const random = new SeededRandom(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);

    for (let i = 0; i < 256; i++) p[i] = i;
    // Shuffle
    for (let i = 255; i > 0; i--) {
      const r = Math.floor(random.next() * (i + 1));
      [p[i], p[r]] = [p[r], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];

    this.grad3 = [
      [1, 1, 0],
      [-1, 1, 0],
      [1, -1, 0],
      [-1, -1, 0],
      [1, 0, 1],
      [-1, 0, 1],
      [1, 0, -1],
      [-1, 0, -1],
      [0, 1, 1],
      [0, -1, 1],
      [0, 1, -1],
      [0, -1, -1],
    ];
  }

  private dot(g: number[], x: number, y: number): number {
    return g[0] * x + g[1] * y;
  }

  noise2D(xin: number, yin: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1);
    const G2 = (3 - Math.sqrt(3)) / 6;

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
    const gi0 = this.perm[ii + this.perm[jj]] % 12;
    const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 12;
    const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 12;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * this.dot(this.grad3[gi0], x0, y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * this.dot(this.grad3[gi1], x1, y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * this.dot(this.grad3[gi2], x2, y2);
    }
    // Output: -1 bis 1
    return 70 * (n0 + n1 + n2);
  }
}

// Fractal Noise für mehr Detail - AoE2 Style
export class FractalNoise {
  constructor(
    private noise: SimplexNoise,
    private octaves: number = 4,
    private persistence: number = 0.5,
    private lacunarity: number = 2.0,
  ) {}

  noise2D(x: number, y: number): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < this.octaves; i++) {
      total += this.noise.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }
    return total / maxValue; // Normalisiert auf -1 bis 1
  }
}

// Map Generator - kombiniert mehrere Noise Layer wie AoE2
export type TileType = "water" | "grass" | "forest" | "desert" | "mountain";

export interface MapTile {
  x: number;
  y: number;
  height: number;
  moisture: number;
  temperature: number;
  tileType: TileType;
}

export class MapGenerator {
  private heightNoise: FractalNoise;
  private moistureNoise: FractalNoise;
  private tempNoise: FractalNoise;

  constructor(seed: string) {
    this.heightNoise = new FractalNoise(
      new SimplexNoise(seed + "_height"),
      6,
      0.5,
      2,
    );
    this.moistureNoise = new FractalNoise(
      new SimplexNoise(seed + "_moist"),
      4,
      0.6,
      2,
    );
    this.tempNoise = new FractalNoise(
      new SimplexNoise(seed + "_temp"),
      3,
      0.4,
      2,
    );
  }

  getTile(x: number, y: number, scale: number = 0.01): MapTile {
    const nx = x * scale;
    const ny = y * scale;

    const height = this.heightNoise.noise2D(nx, ny);
    const moisture = this.moistureNoise.noise2D(nx + 1000, ny + 1000);
    const temperature = this.tempNoise.noise2D(nx - 1000, ny - 1000);

    let tileType: TileType = "grass";

    // AoE2 ähnliche Biom-Logik
    if (height < -0.3) tileType = "water";
    else if (height > 0.6) tileType = "mountain";
    else if (moisture > 0.4 && temperature < 0.2) tileType = "forest";
    else if (moisture < -0.3 && temperature > 0.3) tileType = "desert";
    else tileType = "grass";

    return { x, y, height, moisture, temperature, tileType };
  }

  // Chunk für Factorio-Style Endlos-Map
  generateChunk(
    chunkX: number,
    chunkY: number,
    chunkSize: number = 32,
  ): MapTile[][] {
    const chunk: MapTile[][] = [];
    for (let y = 0; y < chunkSize; y++) {
      chunk[y] = [];
      for (let x = 0; x < chunkSize; x++) {
        const worldX = chunkX * chunkSize + x;
        const worldY = chunkY * chunkSize + y;
        chunk[y][x] = this.getTile(worldX, worldY);
      }
    }
    return chunk;
  }
}
