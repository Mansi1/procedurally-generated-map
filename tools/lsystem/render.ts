// Einfache Vorschau für Spielwiese und Galerie: Canvas 2D, parallele Projektion,
// Maler-Algorithmus (von hinten nach vorn), flach beleuchtet. Blätter mit Foto
// sind ebene Rechtecke - projiziert ein Parallelogramm, also genau ein drawImage
// mit affiner Transformation.
import type { Vec3 } from './lsystem.ts';

type Rgb = readonly [number, number, number];

/** Textur in Helligkeitsstufen (dunkel -> hell), siehe makeTexture. */
export interface Texture {
  readonly levels: readonly HTMLCanvasElement[];
  readonly width: number;
  readonly height: number;
  /** Durchschnittsfarbe - für Flächen, die nicht als Bild gemalt werden können (Deckel). */
  readonly average: Rgb;
  /** Kachel-Muster je Stufe, erst beim Zeichnen angelegt (render). */
  patterns?: readonly (CanvasPattern | null)[];
}

/** Wie ein Material aussieht: Farbe oder Textur. */
export type Look = { readonly color: Rgb } | { readonly texture: Texture };

interface Triangle {
  readonly kind: 'triangle';
  readonly p: readonly [Vec3, Vec3, Vec3];
  readonly color: Rgb;
}

/** Texturiertes Viereck mit den Texturkoordinaten seiner Ecken. */
interface Sprite {
  readonly kind: 'sprite';
  readonly p: readonly [Vec3, Vec3, Vec3, Vec3];
  readonly uv: readonly (readonly [number, number])[];
  readonly texture: Texture;
}

/** Ein Blatt-Foto füllt sein Viereck genau einmal: uv (0,0), (1,0), (1,1), (0,1). */
const UNIT_RECT: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const isUnitRect = (uv: Sprite['uv']) => uv.every(([u, v], i) => u === UNIT_RECT[i][0] && v === UNIT_RECT[i][1]);

export type Shape = Triangle | Sprite;

export interface View {
  /** Drehung um die Hochachse, Radiant. */
  yaw: number;
  /** Blick von oben, Radiant. */
  pitch: number;
  zoom: number;
}

const FALLBACK: Rgb = [0.6, 0.6, 0.6];
const LIGHT = normalize([0.45, 0.75, 0.5]);
const BACKGROUND = '#1b1d1a';
const GROUND = '#2c3326';
/** Helligkeit: Grundlicht plus Anteil der Sonne. */
const AMBIENT = 0.45, DIRECT = 0.75;
/** Stufen, in denen eine Textur vorab abgedunkelt wird. */
const TEXTURE_LEVELS = 8;

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Formen aus OBJ-Zeilen. `look` liefert je `usemtl`-Name Farbe oder Textur;
 * Vierecke mit Textur werden zu Sprites.
 */
export function shapesFromObj(lines: readonly string[], look: (material: string) => Look | undefined): Shape[] {
  const vertices: Vec3[] = [];
  const uvs: [number, number][] = [];
  const shapes: Shape[] = [];
  let current: Look = { color: FALLBACK };
  for (const line of lines) {
    const [kind, ...rest] = line.split(' ');
    if (kind === 'v') vertices.push([Number(rest[0]), Number(rest[1]), Number(rest[2])]);
    else if (kind === 'vt') uvs.push([Number(rest[0]), Number(rest[1])]);
    else if (kind === 'usemtl') current = look(rest[0]) ?? { color: FALLBACK };
    else if (kind === 'f') {
      const refs = rest.map((ref) => ref.split('/'));
      const face = refs.map((r) => vertices[Number(r[0]) - 1]);
      if ('texture' in current) {
        const faceUvs = refs.map((r) => uvs[Number(r[1]) - 1]);
        if (face.length === 4 && faceUvs.every(Boolean)) {
          shapes.push({ kind: 'sprite', p: [face[0], face[1], face[2], face[3]], uv: faceUvs, texture: current.texture });
          continue;
        }
        // Fläche ohne brauchbare Texturkoordinaten (Deckel): Durchschnittsfarbe.
        for (let i = 1; i + 1 < face.length; i++) {
          shapes.push({ kind: 'triangle', p: [face[0], face[i], face[i + 1]], color: current.texture.average });
        }
        continue;
      }
      for (let i = 1; i + 1 < face.length; i++) {
        shapes.push({ kind: 'triangle', p: [face[0], face[i], face[i + 1]], color: current.color });
      }
    }
  }
  return shapes;
}

/** Sonnenlicht 0..1 aus der Flächennormale; die Seiten sind nicht einheitlich gewunden - immer die zum Auge. */
function lightOf(a: Vec3, b: Vec3, c: Vec3): number {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = normalize([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
  if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
  return Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
}

export function render(canvas: HTMLCanvasElement, shapes: readonly Shape[], view: View): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const H = (canvas.height = canvas.clientHeight * devicePixelRatio);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, W, H);
  if (!shapes.length) return;

  // Maßstab aus Höhe und Kronenradius, damit die ganze Pflanze ins Bild passt.
  // Untergrenze klein genug für Getreide, aber > 0 für leere Modelle.
  let top = 0.1, radius = 0.1;
  for (const s of shapes) for (const p of s.p) {
    top = Math.max(top, p[1]);
    radius = Math.max(radius, Math.hypot(p[0], p[2]));
  }
  const scale = view.zoom * 0.85 * Math.min(H / (top + radius * 0.5), W / (2 * radius + 1));
  const ox = W / 2, oy = H / 2 + (top * scale) / 2;

  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  /** In Bildschirm-Pixel: x, y und die Tiefe (größer = näher). */
  const project = ([x, y, z]: Vec3): Vec3 => {
    const xr = x * cy + z * sy, zr = -x * sy + z * cy;
    return [ox + xr * scale, oy - (y * cp - zr * sp) * scale, y * sp + zr * cp];
  };

  ctx.fillStyle = GROUND;
  ctx.beginPath();
  ctx.ellipse(ox, oy, radius * scale * 1.2, radius * scale * 1.2 * Math.abs(sp), 0, 0, Math.PI * 2);
  ctx.fill();

  const items = shapes.map((shape) => {
    const q = shape.p.map(project);
    const light = lightOf(q[0], q[1], q[shape.kind === 'sprite' ? 3 : 2]);
    return { shape, q, light, depth: q.reduce((sum, p) => sum + p[2], 0) / q.length };
  }).sort((a, b) => a.depth - b.depth);

  for (const { shape, q, light } of items) {
    if (shape.kind === 'triangle') {
      const brightness = AMBIENT + DIRECT * light;
      const fill = `rgb(${shape.color.map((c) => Math.min(255, Math.round(c * brightness * 255))).join(',')})`;
      ctx.fillStyle = ctx.strokeStyle = fill; // Kontur schließt die Haarrisse zwischen den Dreiecken
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      ctx.lineTo(q[1][0], q[1][1]);
      ctx.lineTo(q[2][0], q[2][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      continue;
    }
    const { texture } = shape;
    const level = Math.round(light * (texture.levels.length - 1));
    if (isUnitRect(shape.uv)) {
      // Blatt: das Bild füllt das Viereck genau einmal - ein drawImage mit
      // affiner Transformation. Bildursprung (oben links) = uv (0,1) = Ecke 3;
      // Bild-x läuft zu Ecke 2, Bild-y zu Ecke 0.
      const { width: w, height: h } = texture;
      const [p0, , p2, p3] = q;
      ctx.setTransform((p2[0] - p3[0]) / w, (p2[1] - p3[1]) / w, (p0[0] - p3[0]) / h, (p0[1] - p3[1]) / h, p3[0], p3[1]);
      ctx.drawImage(texture.levels[level], 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      continue;
    }
    // Rinde: die Textur kachelt über die Fläche (uv über 0..1 hinaus). Ein
    // Muster mit passender Transformation wiederholt sie von selbst; gemalt
    // wird der Umriss des Vierecks, gefüllt und umrandet (gegen Haarrisse).
    const patterns = (texture.patterns ??= texture.levels.map((c) => ctx.createPattern(c, 'repeat')));
    const pattern = patterns[level];
    if (!pattern) continue;
    // Texturkoordinaten in Bildpixel (Bild-y läuft nach unten: 1 - v).
    const px = shape.uv.map(([u, v]) => [u * texture.width, (1 - v) * texture.height]);
    const e1 = [px[1][0] - px[0][0], px[1][1] - px[0][1]];
    const e2 = [px[3][0] - px[0][0], px[3][1] - px[0][1]];
    const det = e1[0] * e2[1] - e1[1] * e2[0];
    if (Math.abs(det) < 1e-9) continue;
    const s1 = [q[1][0] - q[0][0], q[1][1] - q[0][1]];
    const s2 = [q[3][0] - q[0][0], q[3][1] - q[0][1]];
    // Affine Abbildung M: Bildpixel -> Bildschirm, aus M*e1 = s1 und M*e2 = s2.
    const a = (s1[0] * e2[1] - s2[0] * e1[1]) / det;
    const b = (s1[1] * e2[1] - s2[1] * e1[1]) / det;
    const c = (s2[0] * e1[0] - s1[0] * e2[0]) / det;
    const d = (s2[1] * e1[0] - s1[1] * e2[0]) / det;
    pattern.setTransform(new DOMMatrix([a, b, c, d, q[0][0] - a * px[0][0] - c * px[0][1], q[0][1] - b * px[0][0] - d * px[0][1]]));
    ctx.fillStyle = ctx.strokeStyle = pattern;
    ctx.beginPath();
    ctx.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Textur in Helligkeitsstufen, eingefärbt mit `tint` (1,1,1: Foto unverändert).
 * Stufe i gehört zum Sonnenlicht i / (TEXTURE_LEVELS - 1).
 */
export function makeTexture(image: HTMLImageElement, tint: Rgb): Texture {
  let average: Rgb = FALLBACK;
  const levels = Array.from({ length: TEXTURE_LEVELS }, (_, i) => {
    const brightness = (AMBIENT + DIRECT * (i / (TEXTURE_LEVELS - 1))) / (AMBIENT + DIRECT);
    const c = document.createElement('canvas');
    c.width = image.naturalWidth;
    c.height = image.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${tint.map((v) => Math.round(Math.min(1, v * brightness) * 255)).join(',')})`;
    ctx.fillRect(0, 0, c.width, c.height);
    // multiply färbt auch die durchsichtigen Stellen - die Form des Blattes wiederherstellen.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(image, 0, 0);
    if (i === TEXTURE_LEVELS - 1) average = averageOf(ctx, c.width, c.height);
    return c;
  });
  return { levels, width: image.naturalWidth, height: image.naturalHeight, average };
}

/** Durchschnittsfarbe der deckenden Pixel, 0..1. */
function averageOf(ctx: CanvasRenderingContext2D, w: number, h: number): Rgb {
  const d = ctx.getImageData(0, 0, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] < 128) continue;
    r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2];
    n++;
  }
  return n ? [r / n / 255, g / n / 255, b / n / 255] : FALLBACK;
}
