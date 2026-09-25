// DevPanel.ts
// Die Entwickler-Infos oben links (components/Hud.tsx): Position, Abtastung,
// Zoom, das Tile und was unter dem Zeiger steht, Kamera, Minimap-Zeiger und
// Bilder je Sekunde. Texte werden nur gesetzt, wenn sie sich ändern - sonst
// rechnete der Browser je Bild das Layout neu.

import type { TileType } from '../noise';
import { TILE_TYPE_LABEL } from '../map';
import type { Camera } from './Camera';

/** So oft (ms) werden die Bilder je Sekunde neu gezählt. */
const FPS_INTERVAL = 500;

const byId = (id: string) => document.getElementById(id)!;

function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

export class DevPanel {
  private pos = byId('pos');
  private sampling = byId('sampling');
  private zoom = byId('zoom');
  private tile = byId('tile-info');
  private objectLabel = byId('object-label');
  private objectInfo = byId('resource-info');
  private cursor = byId('cursor-coords');
  private camera = byId('cam-coords');
  private minimap = byId('hover-coords');
  private fps = byId('fps');
  private frames = 0;
  private lastFps = performance.now();

  /** Je Bild: Kamera-Position und Abtastung; alle FPS_INTERVAL ms die Bilder je Sekunde. */
  frame(now: number, camera: Camera) {
    const center = `${Math.round(camera.x)}, ${Math.round(camera.y)}`;
    setText(this.pos, center);
    setText(this.camera, center);
    setText(this.sampling, (1 / (camera.tileSize * camera.pixelRatio)).toFixed(4));
    this.frames++;
    if (now - this.lastFps >= FPS_INTERVAL) {
      setText(this.fps, String(Math.round((this.frames * 1000) / (now - this.lastFps))));
      this.frames = 0;
      this.lastFps = now;
    }
  }

  showZoom(tileSize: number) {
    setText(this.zoom, `${Math.round(tileSize * 10) / 10}px`);
  }

  /** Tile unter dem Zeiger mit seinen Gelände-Werten - oder keins. */
  showTile(tile?: { x: number; y: number; tileType: TileType; height: number; moisture: number; temperature: number }) {
    setText(this.cursor, tile ? `${tile.x}, ${tile.y}` : '-, -');
    setText(this.tile, tile
      ? `${TILE_TYPE_LABEL[tile.tileType]} | h ${tile.height.toFixed(2)} | Feuchte ${tile.moisture.toFixed(2)} | Temp ${tile.temperature.toFixed(2)}`
      : '-');
  }

  /** Was unter dem Zeiger steht (game/hoverInfo.ts). */
  showObject(label: string, text: string) {
    setText(this.objectLabel, label);
    setText(this.objectInfo, text);
  }

  /** Welt-Tile unter dem Zeiger auf der Minimap - oder keins. */
  showMinimapPointer(tile?: { x: number; y: number }) {
    setText(this.minimap, tile ? `${Math.floor(tile.x)}, ${Math.floor(tile.y)}` : '-, -');
  }
}
