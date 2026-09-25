// Camera.ts
// Die Kamera: welches Welt-Tile in der Bildmitte liegt, wie weit gezoomt ist
// (Zoomstufen) und wie groß die Sichtfläche ist. Sichtfläche, Zoom und
// Mauskoordinaten rechnen in CSS-Pixeln; der Canvas-Speicher ist um
// `pixelRatio` größer.

import { centerFor, panDelta, type IsoView } from '../gl/iso';

/**
 * Zoomstufen in CSS-Pixeln je Welt-Tile. Verdopplung je Stufe: die
 * Schrittweite der Abtastung ist damit immer eine Zweierpotenz, und von einem
 * Ende zum anderen sind es sieben Rasten statt Dutzender Ein-Pixel-Schritte.
 * Erst die letzte Stufe (128) zeigt die Dorfbewohner groß genug für ihre Details.
 */
export const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32, 64, 128];

/** Die Zoomstufe, die `pixelsPerTile` am nächsten kommt. */
export function nearestZoomIndex(pixelsPerTile: number): number {
  let best = 0;
  for (let i = 1; i < ZOOM_LEVELS.length; i++) {
    if (Math.abs(ZOOM_LEVELS[i] - pixelsPerTile) < Math.abs(ZOOM_LEVELS[best] - pixelsPerTile)) best = i;
  }
  return best;
}

export class Camera {
  /** Welt-Tile in der Bildmitte. */
  x = 0;
  y = 0;
  /** Sichtfläche in CSS-Pixeln. */
  width = 0;
  height = 0;
  /** Geräte-Pixel je CSS-Pixel. */
  pixelRatio = 1;
  zoomIndex: number;

  constructor(pixelsPerTile: number) {
    this.zoomIndex = nearestZoomIndex(pixelsPerTile);
  }

  /** CSS-Pixel je Tile bei der jetzigen Zoomstufe. */
  get tileSize(): number {
    return ZOOM_LEVELS[this.zoomIndex];
  }

  /** Zoomstufe setzen (begrenzt). false, wenn sie schon so war. */
  setZoomIndex(index: number): boolean {
    const clamped = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, index));
    if (clamped === this.zoomIndex) return false;
    this.zoomIndex = clamped;
    return true;
  }

  /** Die Ansicht für die Umrechnung Welt ↔ Bildschirm (gl/iso.ts). */
  view(): IsoView {
    return { centerX: this.x, centerY: this.y, tileSize: this.tileSize, width: this.width, height: this.height };
  }

  /** Mitte der Sichtfläche in CSS-Pixeln. */
  get centerX(): number {
    return this.width / 2;
  }

  get centerY(): number {
    return this.height / 2;
  }

  /** Nimmt die Größe des Fensters und die Pixeldichte des Geräts an. */
  fitWindow() {
    this.pixelRatio = window.devicePixelRatio || 1;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  /** Verschiebt um (dx, dy) CSS-Pixel auf dem Bildschirm - nicht entlang der Weltachsen. */
  panPixels(dx: number, dy: number) {
    const d = panDelta(this.tileSize, dx, dy);
    this.x += d.x;
    this.y += d.y;
  }

  /**
   * Legt den Welt-Punkt (x, y, Höhe z) auf die Bildschirmstelle (px, py) -
   * ohne Angabe in die Bildmitte.
   */
  centerOn(x: number, y: number, z: number, px = this.centerX, py = this.centerY) {
    const center = centerFor(this.view(), x, y, z, px, py);
    this.x = center.x;
    this.y = center.y;
  }

  /** Springt auf das Tile (x, y) - ohne Rücksicht auf die Geländehöhe. */
  moveTo(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
