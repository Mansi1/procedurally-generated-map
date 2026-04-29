import {FractalNoise, MapGenerator, type MapTile, SimplexNoise, type TileType} from "./noise";

export type ResourceType = "none" | "wood" | "gold" | "stone" | "berries";

export interface RenderTile extends MapTile {
  resource: ResourceType;
  resourceAmount: number; // 0-100
}

export class ChunkManager {
  private chunks = new Map<string, RenderTile[][]>();
  private resourceNoise: FractalNoise;
  private chunkSize: number;

  constructor(
      private mapGen: MapGenerator,
      chunkSize: number = 32,
      seed: string,
  ) {
    this.chunkSize = chunkSize;
    // Extra Noise Layer für Ressourcen wie in AoE2
    this.resourceNoise = new FractalNoise(
        new SimplexNoise(seed + "_resources"),
        3,
        0.7,
        2,
    );
  }

  private chunkKey(cx: number, cy: number): string {
    return `${cx}_${cy}`;
  }

  private worldToChunk(
      x: number,
      y: number,
  ): { cx: number; cy: number; lx: number; ly: number } {
    const cx = Math.floor(x / this.chunkSize);
    const cy = Math.floor(y / this.chunkSize);
    const lx = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
    const ly = ((y % this.chunkSize) + this.chunkSize) % this.chunkSize;
    return { cx, cy, lx, ly };
  }

  private generateResources(tile: MapTile): {
    type: ResourceType;
    amount: number;
  } {
    const r = this.resourceNoise.noise2D(tile.x * 0.05, tile.y * 0.05);

    // Logik: Ressourcen spawnen nur auf passendem Terrain
    if (tile.tileType === "forest" && r > 0.3) {
      return { type: "wood", amount: Math.floor((r + 1) * 50) };
    }
    if (tile.tileType === "mountain" && r > 0.4) {
      return {
        type: r > 0.7 ? "gold" : "stone",
        amount: Math.floor((r + 1) * 40),
      };
    }
    if (tile.tileType === "grass" && r > 0.6) {
      return { type: "berries", amount: Math.floor((r + 1) * 30) };
    }
    return { type: "none", amount: 0 };
  }

  getChunk(cx: number, cy: number): RenderTile[][] {
    const key = this.chunkKey(cx, cy);
    if (this.chunks.has(key)) return this.chunks.get(key)!;

    const baseChunk = this.mapGen.generateChunk(cx, cy, this.chunkSize);
    const renderChunk: RenderTile[][] = baseChunk.map((row) =>
      row.map((tile) => {
        const res = this.generateResources(tile);
        return { ...tile, resource: res.type, resourceAmount: res.amount };
      }),
    );

    this.chunks.set(key, renderChunk);
    return renderChunk;
  }

  getTile(worldX: number, worldY: number): RenderTile {
    const x = Math.floor(worldX);
    const y = Math.floor(worldY);
    const { cx, cy, lx, ly } = this.worldToChunk(x, y);
    const chunk = this.getChunk(cx, cy);

    return chunk[ly][lx];
  }

  getVisibleChunks(
      cameraX: number,
      cameraY: number,
      viewportWidth: number,
      viewportHeight: number,
      tileSize: number,
  ): Map<string, RenderTile[][]> {
    const tilesX = Math.ceil(viewportWidth / tileSize);
    const tilesY = Math.ceil(viewportHeight / tileSize);

    const startX = Math.floor(cameraX / tileSize) - 1;
    const startY = Math.floor(cameraY / tileSize) - 1;
    const endX = startX + tilesX + 2;
    const endY = startY + tilesY + 2;

    const startCx = Math.floor(startX / this.chunkSize);
    const startCy = Math.floor(startY / this.chunkSize);
    const endCx = Math.floor(endX / this.chunkSize);
    const endCy = Math.floor(endY / this.chunkSize);

    const visible = new Map<string, RenderTile[][]>();
    for (let cy = startCy; cy <= endCy; cy++) {
      for (let cx = startCx; cx <= endCx; cx++) {
        visible.set(this.chunkKey(cx, cy), this.getChunk(cx, cy));
      }
    }
    return visible;
  }

  unloadDistantChunks(
      cameraX: number,
      cameraY: number,
      maxDistance: number = 10,
  ) {
    const camCx = Math.floor(cameraX / this.chunkSize / 16);
    const camCy = Math.floor(cameraY / this.chunkSize / 16);

    for (const key of this.chunks.keys()) {
      const [cx, cy] = key.split("_").map(Number);
      const dist = Math.abs(cx - camCx) + Math.abs(cy - camCy);
      if (dist > maxDistance) this.chunks.delete(key);
    }
  }
}

export class MapRenderer {
  constructor(
      private canvas: HTMLCanvasElement,
      private chunkManager: ChunkManager,
      public tileSize: number = 8,
  ) {}

  private getTileColor(tile: RenderTile): string {
    const baseColors: Record<TileType, [number, number, number]> = {
      water: [32, 64, 180],
      grass: [34, 139, 34],
      forest: [0, 100, 0],
      desert: [237, 201, 175],
      mountain: [139, 137, 137],
    };

    let [r, g, b] = baseColors[tile.tileType];

    const heightFactor = (tile.height + 1) * 0.5;
    r = Math.floor(r * (0.6 + heightFactor * 0.4));
    g = Math.floor(g * (0.6 + heightFactor * 0.4));
    b = Math.floor(b * (0.6 + heightFactor * 0.4));

    if (tile.resource!== "none" && tile.resourceAmount > 0) {
      const resourceColors: Record<ResourceType, [number, number, number]> = {
        none: [0, 0, 0],
        wood: [101, 67, 33],
        gold: [255, 215, 0],
        stone: [169, 169, 169],
        berries: [220, 20, 60],
      };
      const [rr, rg, rb] = resourceColors[tile.resource];
      const alpha = Math.min(tile.resourceAmount / 100, 0.6);
      r = Math.floor(r * (1 - alpha) + rr * alpha);
      g = Math.floor(g * (1 - alpha) + rg * alpha);
      b = Math.floor(b * (1 - alpha) + rb * alpha);
    }

    return `rgb(${r},${g},${b})`;
  }

  render(cameraX: number, cameraY: number, mouseTileX?: number, mouseTileY?: number) {
    const ctx = this.canvas.getContext("2d")!;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);

    const visibleChunks = this.chunkManager.getVisibleChunks(
        cameraX,
        cameraY,
        width,
        height,
        this.tileSize,
    );

    visibleChunks.forEach((chunk, key) => {
      const [cx, cy] = key.split("_").map(Number);
      const chunkWorldX = cx * 32;
      const chunkWorldY = cy * 32;

      for (let y = 0; y < chunk.length; y++) {
        for (let x = 0; x < chunk[y].length; x++) {
          const tile = chunk[y][x];
          const screenX = (chunkWorldX + x) * this.tileSize - cameraX;
          const screenY = (chunkWorldY + y) * this.tileSize - cameraY;

          if (
              screenX + this.tileSize < 0 ||
              screenX > width ||
              screenY + this.tileSize < 0 ||
              screenY > height
          )
            continue;

          ctx.fillStyle = this.getTileColor(tile);
          ctx.fillRect(screenX, screenY, this.tileSize, this.tileSize);
        }
      }
    });

    if (mouseTileX!== undefined && mouseTileY!== undefined) {
      const screenX = mouseTileX * this.tileSize - cameraX;
      const screenY = mouseTileY * this.tileSize - cameraY;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.strokeRect(screenX + 1, screenY + 1, this.tileSize - 2, this.tileSize - 2);
    }
  }
}

export class MiniMap {
  private ctx: CanvasRenderingContext2D;
  private mapRadius = 150;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private lastCamX = -999;
  private lastCamY = -999999;
  private lastTileSize = -1;

  constructor(
      private canvas: HTMLCanvasElement,
      private chunkManager: ChunkManager
  ) {
    this.canvas.width = this.mapRadius * 2;
    this.canvas.height = this.mapRadius * 2;
    this.ctx = canvas.getContext('2d')!;

    // Offscreen für Terrain - wird nur bei Camera Move neu gezeichnet
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.mapRadius * 2;
    this.offscreenCanvas.height = this.mapRadius * 2;
    this.offscreenCtx = this.offscreenCanvas.getContext('2d')!;
  }

  private getTileColorSimple(tile: RenderTile): string {
    const colors: Record<TileType, string> = {
      water: '#1E40AF',
      grass: '#22C55E',
      forest: '#166534',
      desert: '#FDE68A',
      mountain: '#6B7280'
    };
    return colors[tile.tileType];
  }

  render(camTopLeftTileX: number, camTopLeftTileY: number, viewportTilesX: number, viewportTilesY: number, tileSize: number) {
    const viewportCenterTileX = camTopLeftTileX + viewportTilesX / 2;
    const viewportCenterTileY = camTopLeftTileY + viewportTilesY / 2;

    // Nur neu zeichnen wenn Camera sich bewegt hat oder Zoom geändert
    const camChanged =
        Math.floor(viewportCenterTileX)!== Math.floor(this.lastCamX) ||
        Math.floor(viewportCenterTileY)!== Math.floor(this.lastCamY) ||
        tileSize!== this.lastTileSize;

    if (camChanged) {
      this.lastCamX = viewportCenterTileX;
      this.lastCamY = viewportCenterTileY;
      this.lastTileSize = tileSize;

      const startTileX = Math.floor(viewportCenterTileX - this.mapRadius);
      const startTileY = Math.floor(viewportCenterTileY - this.mapRadius);

      // Terrain auf Offscreen Canvas - mit ImageData = 10x schneller
      const imageData = this.offscreenCtx.createImageData(300, 300);
      const data = imageData.data;

      for (let y = 0; y < 300; y++) {
        for (let x = 0; x < 300; x++) {
          const worldX = startTileX + x;
          const worldY = startTileY + y;
          const tile = this.chunkManager.getTile(worldX, worldY);

          const color = this.getTileColorSimple(tile);
          const r = parseInt(color.slice(1, 3), 16);
          const g = parseInt(color.slice(3, 5), 16);
          const b = parseInt(color.slice(5, 7), 16);

          const idx = (y * 300 + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
      this.offscreenCtx.putImageData(imageData, 0, 0);
    }

    // Offscreen auf sichtbares Canvas blitten - super schnell
    this.ctx.clearRect(0, 0, 300, 300);
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);

    // Viewport Rechteck - wird jeden Frame gezeichnet, ist billig
    this.ctx.strokeStyle = '#FFFFFF';
    this.ctx.lineWidth = 1;
    const rectX = this.mapRadius - viewportTilesX / 2;
    const rectY = this.mapRadius - viewportTilesY / 2;
    this.ctx.strokeRect(
        Math.floor(rectX) + 0.5,
        Math.floor(rectY) + 0.5,
        Math.floor(viewportTilesX),
        Math.floor(viewportTilesY)
    );

    // Kamera-Mittelpunkt
    this.ctx.fillStyle = '#FFFF00';
    this.ctx.fillRect(149, 149, 2, 2);
  }
}