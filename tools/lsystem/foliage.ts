// Echte Blätter aus den Fotos (leaves/): als flache Form nach dem Umriss
// ('shape', einfarbig) oder als Viereck mit dem Foto als Textur ('texture') -
// je ein einzelnes Blatt oder eine Blattebene (ein Zweig mit mehreren Blättern).
import type { Model } from '../models/primitives.mjs';
import { LEAVES, type LeafName, type LeafShape } from './leaves/data.ts';
import { MATERIALS, toneOf, type Material } from './materials.ts';

export type LeafMode = 'shape' | 'texture';
type Vec3 = readonly [number, number, number];
type Point = readonly [number, number];

/** Obergrenze für die Umrisspunkte in der Form - mehr kostet nur Dreiecke. Eine Blattebene darf mehr. */
const MAX_OUTLINE = 20;
const MAX_CARD_OUTLINE = 40;

/** Material eines Blattes: Foto (bzw. dessen Farbe) oder eingefärbte Graufassung. */
export interface LeafMaterialInfo {
  readonly leaf: LeafName;
  /** Blattebene statt einzelnem Blatt. */
  readonly card: boolean;
  readonly material: Material;
  /** true: das Foto selbst passt (gleicher Farbton), false: grau, mit dem Material eingefärbt. */
  readonly photo: boolean;
  /** Farbe in der Form-Darstellung bzw. Kd zur Graufassung. */
  readonly color: readonly [number, number, number];
}

const luminance = ([r, g, b]: readonly number[]) => 0.3 * r + 0.59 * g + 0.11 * b;

/** Gibt es zu dem Blatt eine Blattebene? Nadelzweige haben keine - sie sind selbst schon Zweige. */
export const hasCard = (leaf: LeafName) => LEAVES[leaf].card !== undefined;

export function leafMaterial(leaf: LeafName, material: Material, card: boolean): { name: string; info: LeafMaterialInfo } {
  const data = LEAVES[leaf];
  const photo = toneOf(material) === data.tone;
  // Die Materialien eines Baumes (Leaf, Ivy, IvyDark ...) bleiben als Helligkeit erkennbar.
  const brightness = Math.min(1.3, Math.max(0.7, luminance(MATERIALS[material]) / luminance(MATERIALS.Leaf)));
  const color = photo ? data.average.map((c) => Math.min(1, c * brightness)) as [number, number, number] : MATERIALS[material];
  return { name: `${material}_${leaf}${card ? '_card' : ''}`, info: { leaf, card, material, photo, color } };
}

/** Umriss und Ränder des Blattes bzw. seiner Blattebene. */
function source(leaf: LeafName, card: boolean): LeafShape {
  const data = LEAVES[leaf];
  if (!card) return data;
  if (!data.card) throw new Error(`Keine Blattebene für ${leaf}`);
  return data.card;
}

/** Vereinfachter Umriss und seine Dreiecke - je Blatt nur einmal berechnet. */
const shapes = new Map<string, { outline: Point[]; triangles: [number, number, number][] }>();
function shape(leaf: LeafName, card: boolean) {
  const key = `${leaf}|${card}`;
  let s = shapes.get(key);
  if (!s) {
    const outline = reduce(source(leaf, card).outline, card ? MAX_CARD_OUTLINE : MAX_OUTLINE);
    s = { outline, triangles: triangulate(outline) };
    shapes.set(key, s);
  }
  return s;
}

/** Weniger Punkte: immer den mit der kleinsten Dreiecksfläche zu den Nachbarn weglassen (Visvalingam). */
function reduce(outline: readonly Point[], max: number): Point[] {
  const pts = [...outline];
  const area = (i: number) => {
    const [a, b, c] = [pts[(i + pts.length - 1) % pts.length], pts[i], pts[(i + 1) % pts.length]];
    return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
  };
  while (pts.length > max) {
    let smallest = 0;
    for (let i = 1; i < pts.length; i++) if (area(i) < area(smallest)) smallest = i;
    pts.splice(smallest, 1);
  }
  return pts;
}

const cross2 = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Ohren abschneiden - für den nicht konvexen Umriss (gegen den Uhrzeigersinn). */
export function triangulate(pts: readonly Point[]): [number, number, number][] {
  const idx = pts.map((_, i) => i);
  const triangles: [number, number, number][] = [];
  const inside = (p: Point, a: Point, b: Point, c: Point) => cross2(a, b, p) >= 0 && cross2(b, c, p) >= 0 && cross2(c, a, p) >= 0;
  while (idx.length > 3) {
    let cut = -1;
    for (let i = 0; i < idx.length && cut < 0; i++) {
      const [a, b, c] = [idx[(i + idx.length - 1) % idx.length], idx[i], idx[(i + 1) % idx.length]];
      if (cross2(pts[a], pts[b], pts[c]) <= 1e-9) continue;
      if (idx.some((j) => j !== a && j !== b && j !== c && inside(pts[j], pts[a], pts[b], pts[c]))) continue;
      triangles.push([a, b, c]);
      cut = i;
    }
    // Kein Ohr (Umriss schneidet sich nach dem Vereinfachen): Rest als Fächer.
    if (cut < 0) break;
    idx.splice(cut, 1);
  }
  for (let i = 1; i + 1 < idx.length; i++) triangles.push([idx[0], idx[i], idx[i + 1]]);
  return triangles;
}

/**
 * Ein Blatt bzw. eine Blattebene: Stiel bei `base`, Spitze in Richtung `dir`,
 * Fläche aufgespannt von `dir` und `side` (Einheitsvektoren, senkrecht), `length` in Metern.
 */
export function placeLeaf(m: Model, mode: LeafMode, leaf: LeafName, card: boolean, mtl: string,
  base: Vec3, dir: Vec3, side: Vec3, length: number) {
  const at = ([x, y]: Point): Vec3 => [
    base[0] + (side[0] * x + dir[0] * y) * length,
    base[1] + (side[1] * x + dir[1] * y) * length,
    base[2] + (side[2] * x + dir[2] * y) * length,
  ];
  if (mode === 'shape') {
    const { outline, triangles } = shape(leaf, card);
    m.mesh('Leaf', mtl, outline.map(at), triangles);
    return;
  }
  const { x0, x1 } = source(leaf, card);
  const corners: Point[] = [[x0, 0], [x1, 0], [x1, 1], [x0, 1]];
  m.mesh('Leaf', mtl, corners.map(at), [[0, 1, 2, 3]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

/** Die Graufassung hat einen mittleren Grauwert von 0.8 (leaves/process.ts) - so trifft das Einfärben die Materialfarbe. */
const GREY_MEAN = 0.8;

/** Texturdatei in leaves/img/ für ein Blatt-Material. */
export const textureFile = (info: LeafMaterialInfo) => `${info.leaf}${info.card ? '-card' : ''}${info.photo ? '' : '-grey'}.png`;

/** Kd zur Textur: Foto unverändert, Graufassung in der Materialfarbe. */
export const textureTint = (info: LeafMaterialInfo): [number, number, number] =>
  (info.photo ? [1, 1, 1] : info.color.map((c) => Math.min(1, c / GREY_MEAN)) as [number, number, number]);
