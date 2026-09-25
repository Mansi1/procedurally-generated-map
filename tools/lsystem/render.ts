// Einfache Vorschau für die Spielwiese: Canvas 2D, Maler-Algorithmus (von
// hinten nach vorn), flach beleuchtet - reicht für ein paar zehntausend Dreiecke.
import type { Vec3 } from './lsystem.ts';

type Rgb = readonly [number, number, number];

export interface Triangle {
  readonly p: readonly [Vec3, Vec3, Vec3];
  readonly color: Rgb;
}

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

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Dreiecke aus OBJ-Zeilen; Farbe je `usemtl` aus `colors`. */
export function trianglesFromObj(lines: readonly string[], colors: Readonly<Record<string, Rgb>>): Triangle[] {
  const vertices: Vec3[] = [];
  const triangles: Triangle[] = [];
  let color = FALLBACK;
  for (const line of lines) {
    const [kind, ...rest] = line.split(' ');
    if (kind === 'v') vertices.push([Number(rest[0]), Number(rest[1]), Number(rest[2])]);
    else if (kind === 'usemtl') color = colors[rest[0]] ?? FALLBACK;
    else if (kind === 'f') {
      const face = rest.map((i) => vertices[Number(i) - 1]);
      for (let i = 1; i + 1 < face.length; i++) triangles.push({ p: [face[0], face[i], face[i + 1]], color });
    }
  }
  return triangles;
}

export function render(canvas: HTMLCanvasElement, triangles: readonly Triangle[], view: View): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const H = (canvas.height = canvas.clientHeight * devicePixelRatio);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, W, H);
  if (!triangles.length) return;

  // Maßstab aus Höhe und Kronenradius, damit der ganze Baum ins Bild passt.
  let top = 1, radius = 1;
  for (const t of triangles) for (const p of t.p) {
    top = Math.max(top, p[1]);
    radius = Math.max(radius, Math.hypot(p[0], p[2]));
  }
  const scale = view.zoom * 0.85 * Math.min(H / (top + radius * 0.5), W / (2 * radius + 1));
  const ox = W / 2, oy = H / 2 + (top * scale) / 2;

  const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  const toView = ([x, y, z]: Vec3): Vec3 => {
    const xr = x * cy + z * sy, zr = -x * sy + z * cy;
    return [xr, y * cp - zr * sp, y * sp + zr * cp];
  };

  ctx.fillStyle = GROUND;
  ctx.beginPath();
  ctx.ellipse(ox, oy, radius * scale * 1.2, radius * scale * 1.2 * Math.abs(sp), 0, 0, Math.PI * 2);
  ctx.fill();

  const shaded = triangles.map(({ p, color }) => {
    const q = [toView(p[0]), toView(p[1]), toView(p[2])] as const;
    const u: Vec3 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
    const w: Vec3 = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
    let n = normalize([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]);
    // Die Seiten sind nicht einheitlich gewunden - immer die dem Auge zugewandte Normale.
    if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
    const light = 0.45 + 0.75 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const rgb = color.map((c) => Math.min(255, Math.round(c * light * 255)));
    return { q, depth: q[0][2] + q[1][2] + q[2][2], fill: `rgb(${rgb.join(',')})` };
  }).sort((a, b) => a.depth - b.depth);

  for (const { q, fill } of shaded) {
    ctx.fillStyle = ctx.strokeStyle = fill; // Kontur schließt die Haarrisse zwischen den Dreiecken
    ctx.beginPath();
    ctx.moveTo(ox + q[0][0] * scale, oy - q[0][1] * scale);
    ctx.lineTo(ox + q[1][0] * scale, oy - q[1][1] * scale);
    ctx.lineTo(ox + q[2][0] * scale, oy - q[2][1] * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}
