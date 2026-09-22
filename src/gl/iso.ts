// iso.ts
// Isometrische Projektion wie in AoE2: Blick schräg von oben, 30° über dem
// Horizont, Tiles werden zu Rauten im Verhältnis 2:1.
//
// Zwischen Welt und Bildschirm liegen die "Boden-Koordinaten":
//   u = x - y         -> waagerecht auf dem Bildschirm
//   v = (x + y) / 2   -> senkrecht, nach unten
// Ein Tile ist damit 2*tileSize breit und tileSize hoch - dieselbe Fläche wie
// das Quadrat der Draufsicht. Höhe z (in Tiles) schiebt einen Punkt um
// Z_SCREEN * z nach oben.
//
// CPU-Fassung (Mauszeiger, Kamera) und GLSL-Fassung (PROJECT_GLSL) müssen
// dieselbe Abbildung beschreiben.

import { TERRAIN_PARAMS } from '../noise';

/**
 * Bildhöhe einer senkrechten Tile-Länge, in Einheiten von v. Bei 30°
 * Blickwinkel ist das cos(30°) / sin(30°) * (1/√2) = √6 / 2.
 */
export const Z_SCREEN = Math.sqrt(6) / 2;

/** Höchster möglicher Punkt des Geländes in Tiles. */
export const MAX_RELIEF = TERRAIN_PARAMS.reliefHeight;

/** Was die Shader über die Kamera wissen müssen. */
export interface GpuCamera {
  /** Welt-Tile in der Bildmitte. */
  centerX: number;
  centerY: number;
  /** Geräte-Pixel je Einheit von u bzw. v. */
  pixelsPerTile: number;
  /** 1 = volles Relief, 0 = flach (Minimap). */
  reliefScale: number;
}

/** Sichtbarer Ausschnitt in CSS-Pixeln - für alles, was mit der Maus zu tun hat. */
export interface IsoView {
  centerX: number;
  centerY: number;
  /** CSS-Pixel je Einheit von u bzw. v. */
  tileSize: number;
  width: number;
  height: number;
}

export function groundToWorld(u: number, v: number): { x: number; y: number } {
  return { x: v + u / 2, y: v - u / 2 };
}

/** Welt -> Bildschirm (CSS-Pixel ab links oben). */
export function worldToScreen(view: IsoView, x: number, y: number, z: number) {
  const du = x - y - (view.centerX - view.centerY);
  const dv = (x + y - view.centerX - view.centerY) / 2;
  return {
    x: view.width / 2 + du * view.tileSize,
    y: view.height / 2 + (dv - Z_SCREEN * z) * view.tileSize,
  };
}

/** Bildschirmpunkt auf Meereshöhe - ohne Relief, für Minimap und Kamera. */
export function screenToGround(view: IsoView, px: number, py: number) {
  const du = (px - view.width / 2) / view.tileSize;
  const dv = (py - view.height / 2) / view.tileSize;
  const d = groundToWorld(du, dv);
  return { x: view.centerX + d.x, y: view.centerY + d.y };
}

/**
 * Welt-Punkt unter einem Bildschirmpunkt, mit Relief. Der Sehstrahl wird von
 * oben (höchstmöglicher Gipfel) nach unten abgelaufen; der erste Punkt, an dem
 * das Gelände über dem Strahl liegt, ist der sichtbare. Danach Bisektion.
 *
 * @param zAt Geländehöhe in Tiles an einer Welt-Position
 */
export function pickWorld(
    view: IsoView, px: number, py: number,
    zAt: (x: number, y: number) => number,
): { x: number; y: number; z: number } {
  const du = (px - view.width / 2) / view.tileSize;
  const dv = (py - view.height / 2) / view.tileSize;
  const at = (z: number) => {
    const d = groundToWorld(du, dv + Z_SCREEN * z);
    return { x: view.centerX + d.x, y: view.centerY + d.y };
  };
  const above = (z: number) => {
    const p = at(z);
    return zAt(p.x, p.y) >= z;
  };

  // Schrittweite ~ ein Viertel Tile entlang des Strahls
  const step = 0.2;
  let hi: number = MAX_RELIEF;
  let lo = hi;
  let hit = false;
  for (let z = MAX_RELIEF; z >= 0; z -= step) {
    if (above(z)) {
      lo = z;
      hit = true;
      break;
    }
    hi = z;
  }
  if (!hit) return { ...at(0), z: 0 };

  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2;
    if (above(mid)) lo = mid;
    else hi = mid;
  }
  return { ...at(lo), z: lo };
}

/**
 * Kamera so setzen, dass der Welt-Punkt (x, y, z) am Bildschirmpunkt (px, py)
 * erscheint. Liefert die neue Bildmitte.
 */
export function centerFor(view: IsoView, x: number, y: number, z: number, px: number, py: number) {
  const du = (px - view.width / 2) / view.tileSize;
  const dv = (py - view.height / 2) / view.tileSize + Z_SCREEN * z;
  const d = groundToWorld(du, dv);
  return { x: x - d.x, y: y - d.y };
}

/** Umschließendes Welt-Rechteck des Bildschirms, inkl. Gelände, das von unten hereinragt. */
export function visibleWorldRect(view: IsoView) {
  const hu = view.width / 2 / view.tileSize;
  const hv = view.height / 2 / view.tileSize;
  const corners = [
    groundToWorld(-hu, -hv),
    groundToWorld(hu, -hv),
    groundToWorld(-hu, hv + Z_SCREEN * MAX_RELIEF),
    groundToWorld(hu, hv + Z_SCREEN * MAX_RELIEF),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return {
    x: view.centerX + x0,
    y: view.centerY + y0,
    width: Math.max(...xs) - x0,
    height: Math.max(...ys) - y0,
  };
}

/** Bildschirm-Verschiebung (CSS-Pixel) -> Welt-Verschiebung auf Meereshöhe. */
export function panDelta(tileSize: number, dx: number, dy: number) {
  return groundToWorld(dx / tileSize, dy / tileSize);
}

/**
 * Tiefenbereich in v-Einheiten. Muss alles zwischen dem obersten Bildrand und
 * dem Gipfel am unteren Rand abdecken - sonst schneidet die Clipping-Ebene
 * Gelände ab.
 */
export function depthRange(camera: GpuCamera, heightPx: number): number {
  return heightPx / 2 / camera.pixelsPerTile + 3 * Z_SCREEN * MAX_RELIEF + 8;
}

/**
 * Rastet die Kamera auf das Texelraster des Gelände-Caches ein. Dann fällt auf
 * ebenem Boden jede Pixelmitte genau auf eine Texelmitte, und die Karte bleibt
 * so scharf wie ohne Cache - sonst mittelt die Texturfilterung je nach
 * Kameralage bis zu vier Texel zusammen. Der Versatz ist kleiner als ein Pixel.
 */
export function snapCamera(camera: GpuCamera, widthPx: number, heightPx: number): GpuCamera {
  const ppt = camera.pixelsPerTile;
  const snap = (texel: number, size: number) => (Math.round(texel - size / 2) + size / 2) / ppt;
  const u = snap((camera.centerX - camera.centerY) * ppt, widthPx);
  const v = snap((camera.centerX + camera.centerY) / 2 * ppt, heightPx);
  const center = groundToWorld(u, v);
  return { ...camera, centerX: center.x, centerY: center.y };
}

/** Kamera-Uniforms für PROJECT_GLSL. */
export function setCameraUniforms(
    gl: WebGL2RenderingContext,
    location: (name: string) => WebGLUniformLocation | null,
    camera: GpuCamera,
) {
  const { width, height } = gl.canvas;
  gl.uniform2f(location('uResolution'), width, height);
  gl.uniform2f(location('uCameraGround'),
      camera.centerX - camera.centerY, (camera.centerX + camera.centerY) / 2);
  gl.uniform1f(location('uPixelsPerTile'), camera.pixelsPerTile);
  gl.uniform1f(location('uReliefScale'), camera.reliefScale);
  gl.uniform1f(location('uDepthRange'), depthRange(camera, height));
}

/** Welt (x, y, z) -> Clip-Space. Gegenstück zu worldToScreen(). */
export const PROJECT_GLSL = `
uniform vec2  uResolution;
uniform vec2  uCameraGround;   // (u, v) der Bildmitte
uniform float uPixelsPerTile;  // Geraete-Pixel je u/v-Einheit
uniform float uDepthRange;
uniform float uReliefScale;    // 1 = volles Relief, 0 = flach

const float Z_SCREEN = ${Z_SCREEN.toFixed(8)};

vec4 project(vec2 world, float z) {
  vec2 g = vec2(world.x - world.y, (world.x + world.y) * 0.5) - uCameraGround;
  vec2 px = vec2(g.x, g.y - Z_SCREEN * z) * uPixelsPerTile;
  // Naeher an der Kamera = weiter unten im Bild und hoeher.
  float depth = -(g.y + Z_SCREEN * z) / uDepthRange;
  return vec4(px.x / (uResolution.x * 0.5), -px.y / (uResolution.y * 0.5), depth, 1.0);
}
`;
