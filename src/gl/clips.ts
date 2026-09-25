// clips.ts
// Clips aus Blender (docs/ANIMATION.md): liest eine Clip-Bibliothek
// (src/models/<name>_clips.glb + .json, von tools/blender/export_clips.py) und
// backt jeden Clip für eine Figur zu Knochen-Matrizen, die der Shader aus einer
// Textur holt (Skinning).
//
// Wiederverwendbar über Körper hinweg: aus dem Clip wird je Knochen und Bild
// nur die Drehung gegenüber der Ruhelage genommen (wie Blender die Knochen
// intern ausrichtet, spielt so keine Rolle), dazu die Verschiebung der Wurzel
// in Körperhöhen. Gebacken wird mit den Gelenken der jeweiligen Figur - so
// passt ein Clip auf Mann und Frau.

/** Knochen der Menschen-Figuren: Name und Eltern. Die Reihenfolge ist die Spalte in der Textur. */
export const HUMANOID_BONES: readonly (readonly [string, string | null])[] = [
  ['root', null],
  ['lowerBody', 'root'],
  ['thigh.L', 'lowerBody'], ['shin.L', 'thigh.L'],
  ['thigh.R', 'lowerBody'], ['shin.R', 'thigh.R'],
  ['upperBody', 'root'],
  ['head', 'upperBody'],
  ['shoulder.L', 'upperBody'], ['upperArm.L', 'shoulder.L'], ['forearm.L', 'upperArm.L'],
  ['shoulder.R', 'upperBody'], ['upperArm.R', 'shoulder.R'], ['forearm.R', 'upperArm.R'],
];
export const BONE = Object.fromEntries(HUMANOID_BONES.map(([name], i) => [name, i])) as Record<string, number>;

/** Was ein Clip in der Hand braucht - Bits wie im Shader (uClipProps). */
export const PROP_BITS: Record<string, number> = { axe: 1, scythe: 2, knife: 4 };
/**
 * Bit in uClipProps: der Clip kniet - der Rock wird wie bei der Formel für
 * Pose 3 bis zum Boden gestaucht (Knochen allein können das nicht).
 */
export const KNEEL_BIT = 8;

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

/** Ein Clip, unabhängig vom Körper: je Bild und Knochen die Drehung gegenüber der Ruhelage. */
export interface Clip {
  name: string;
  fps: number;
  frames: number;
  duration: number;
  /** Bits aus PROP_BITS. */
  props: number;
  /** Welche Pose (motion[2]) der Clip im Spiel ersetzt - null: keine. */
  pose: number | null;
  /**
   * Clip-Zeit = (Phase - phaseShift) * phaseRate. phaseRate = Länge des Clips
   * durch die Phase einer Schleife (phase_period) - so läuft die Schleife genau
   * so lang wie die Formel, und der Ton bleibt im Takt.
   */
  phaseRate: number;
  phaseShift: number;
  /** Kniend: der Rock wird gestaucht (KNEEL_BIT). */
  kneel: boolean;
  /** frames * Knochen * 4: Drehung (Quaternion) in Modell-Achsen, je Knochen im Weltsinn. */
  rotations: Float32Array;
  /** frames * 3: Verschiebung der Wurzel in Modell-Achsen und Körperhöhen. */
  root: Float32Array;
}

interface Manifest {
  height: number;
  fps: number;
  clips: {
    name: string; frames: number; duration: number; props?: string[];
    /** Aus den Custom Properties der Action (tools/blender/export_clips.py) - können fehlen. */
    pose?: number; phase_period?: number; phase_shift?: number; kneel?: boolean;
  }[];
}

// --- Quaternionen und Matrizen ---------------------------------------------

const qMul = ([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const qInv = ([x, y, z, w]: Quat): Quat => [-x, -y, -z, w];
const qRotate = (q: Quat, [x, y, z]: Vec3): Vec3 => {
  const r = qMul(qMul(q, [x, y, z, 0]), qInv(q));
  return [r[0], r[1], r[2]];
};
/** Zwischen zwei Quaternionen, auf dem kürzeren Weg (normiert linear). */
function qLerp(a: Quat, b: Quat, t: number): Quat {
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const q = a.map((v, i) => v + (b[i] * sign - v) * t) as Quat;
  const l = Math.hypot(...q) || 1;
  return q.map((v) => v / l) as Quat;
}
function qMatrix([x, y, z, w]: Quat): number[] {
  // Zeilenweise 3x3.
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

/**
 * Datei (glTF: x links, y oben, z vorn) -> Modell (x vorn, y links, z oben),
 * wie loadModel() in entityRenderer.ts. Die Abbildung ist eine Drehung
 * (zyklische Vertauschung), Quaternionen werden genauso vertauscht.
 */
const toModel = ([x, y, z]: Vec3): Vec3 => [z, x, y];
const quatToModel = ([x, y, z, w]: Quat): Quat => [z, x, y, w];

// --- glb lesen --------------------------------------------------------------

interface Gltf {
  nodes: { name?: string; children?: number[]; translation?: Vec3; rotation?: Quat }[];
  animations: { name: string; channels: { sampler: number; target: { node: number; path: string } }[];
    samplers: { input: number; output: number; interpolation?: string }[] }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
}

const SIZE: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };

function parseGlb(bytes: Uint8Array): { json: Gltf; bin: DataView } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('kein glb');
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
  const binStart = 20 + jsonLength + 8;
  const binLength = view.getUint32(20 + jsonLength, true);
  return { json, bin: new DataView(bytes.buffer, bytes.byteOffset + binStart, binLength) };
}

function readFloats(gltf: Gltf, bin: DataView, index: number): Float32Array {
  const a = gltf.accessors[index];
  const v = gltf.bufferViews[a.bufferView];
  const n = a.count * SIZE[a.type];
  const out = new Float32Array(n);
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  for (let i = 0; i < n; i++) out[i] = bin.getFloat32(start + i * 4, true);
  return out;
}

/** Wert eines Kanals zur Zeit t (LINEAR oder STEP; CUBICSPLINE: nur der Wert). */
function sample(times: Float32Array, values: Float32Array, size: number, t: number, interpolation: string): number[] {
  const cubic = interpolation === 'CUBICSPLINE';
  const stride = cubic ? size * 3 : size;
  const at = (k: number) => Array.from(values.subarray(k * stride + (cubic ? size : 0), k * stride + (cubic ? size : 0) + size));
  if (t <= times[0]) return at(0);
  const last = times.length - 1;
  if (t >= times[last]) return at(last);
  // Binär suchen: das letzte Bild mit times[k] <= t.
  let k = 0;
  let hi = last;
  while (hi - k > 1) {
    const mid = (k + hi) >> 1;
    if (times[mid] <= t) k = mid;
    else hi = mid;
  }
  if (interpolation === 'STEP') return at(k);
  const f = (t - times[k]) / (times[k + 1] - times[k]);
  if (size === 4) return qLerp(at(k) as Quat, at(k + 1) as Quat, f);
  return at(k).map((v, i) => v + (at(k + 1)[i] - v) * f);
}

/**
 * Liest die Clip-Bibliothek. `glbDataUrl` ist das glb als data:-URL (Vite
 * `?inline`), `manifest` die .json daneben.
 */
export function loadClips(glbDataUrl: string, manifest: Manifest): Clip[] {
  const base64 = glbDataUrl.slice(glbDataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { json, bin } = parseGlb(bytes);
  const byName = new Map(json.nodes.map((n, i) => [n.name ?? '', i]));
  const parentOf = new Map<number, number>();
  json.nodes.forEach((n, i) => n.children?.forEach((c) => parentOf.set(c, i)));
  const boneNodes = HUMANOID_BONES.map(([name]) => byName.get(name));
  const rootNode = boneNodes[0];
  if (rootNode === undefined) throw new Error('Clip-Bibliothek ohne Knochen "root"');

  return manifest.clips.flatMap((meta) => {
    const anim = json.animations.find((a) => a.name === meta.name);
    if (!anim) return [];
    // Kanäle je Knoten: Drehung und Verschiebung.
    const channels = new Map<string, { times: Float32Array; values: Float32Array; interpolation: string }>();
    for (const c of anim.channels) {
      const s = anim.samplers[c.sampler];
      channels.set(`${c.target.node}.${c.target.path}`, {
        times: readFloats(json, bin, s.input), values: readFloats(json, bin, s.output), interpolation: s.interpolation ?? 'LINEAR',
      });
    }
    // Lage eines Knotens relativ zum Eltern: Ruhelage oder zur Zeit t.
    const local = (node: number, t: number | null): { r: Quat; p: Vec3 } => {
      const n = json.nodes[node];
      const rot = t === null ? undefined : channels.get(`${node}.rotation`);
      const pos = t === null ? undefined : channels.get(`${node}.translation`);
      return {
        r: rot ? sample(rot.times, rot.values, 4, t!, rot.interpolation) as Quat : (n.rotation ?? [0, 0, 0, 1]),
        p: pos ? sample(pos.times, pos.values, 3, t!, pos.interpolation) as Vec3 : (n.translation ?? [0, 0, 0]),
      };
    };
    // Weltlage im Raum des Skeletts: bis zur Wurzel, was darüber liegt (das
    // Objekt in Blender, seine Lage in der Szene) zählt nicht. Je Zeitpunkt
    // gemerkt - sonst rechnete jeder Knochen die Kette seiner Eltern neu.
    let cacheTime: number | null | undefined;
    const cache = new Map<number, { r: Quat; p: Vec3 }>();
    const global = (node: number, t: number | null): { r: Quat; p: Vec3 } => {
      if (t !== cacheTime) {
        cache.clear();
        cacheTime = t;
      }
      const known = cache.get(node);
      if (known) return known;
      const own = local(node, t);
      let result = own;
      if (node !== rootNode) {
        const parent = global(parentOf.get(node)!, t);
        const p = qRotate(parent.r, own.p);
        result = { r: qMul(parent.r, own.r), p: [p[0] + parent.p[0], p[1] + parent.p[1], p[2] + parent.p[2]] };
      }
      cache.set(node, result);
      return result;
    };
    const rest = boneNodes.map((n) => (n === undefined ? null : global(n, null)));

    const bones = HUMANOID_BONES.length;
    const rotations = new Float32Array(meta.frames * bones * 4);
    const root = new Float32Array(meta.frames * 3);
    for (let f = 0; f < meta.frames; f++) {
      const t = f / manifest.fps;
      boneNodes.forEach((node, b) => {
        // Drehung gegenüber der Ruhelage, im Weltsinn: W = G_anim * G_ruhe^-1.
        const w: Quat = node === undefined ? [0, 0, 0, 1] : qMul(global(node, t).r, qInv(rest[b]!.r));
        rotations.set(quatToModel(w), (f * bones + b) * 4);
      });
      const now = global(rootNode, t).p;
      const move = toModel([now[0] - rest[0]!.p[0], now[1] - rest[0]!.p[1], now[2] - rest[0]!.p[2]]);
      root.set(move.map((v) => v / manifest.height), f * 3);
    }
    const pose = meta.pose ?? null;
    const period = meta.phase_period;
    return [{
      name: meta.name, fps: manifest.fps, frames: meta.frames, duration: meta.duration,
      props: (meta.props ?? []).reduce((bits, p) => bits | (PROP_BITS[p] ?? 0), 0),
      pose: pose !== null && period ? pose : null,
      phaseRate: period ? meta.duration / period : 1,
      phaseShift: meta.phase_shift ?? 0,
      kneel: meta.kneel === true,
      rotations, root,
    }];
  });
}

/** Gelenke einer Figur in Modell-Einheiten (Körperhöhe 1), wie loadModel() sie liest. */
export interface Joints {
  hip: number;
  knee: number;
  shoulder: number;
  elbow: number;
  /** Abstand der Unterarme von der Mitte. */
  arm: number;
}

/** Drehpunkte der Knochen in Modell-Koordinaten (x vorn, y links, z oben) - wie im Shader. */
function pivots(j: Joints): Vec3[] {
  const neck = j.shoulder + 0.03;
  const at: Record<string, Vec3> = {
    root: [0, 0, 0], lowerBody: [0, 0, 0],
    'thigh.L': [0, 0, j.hip], 'shin.L': [0, 0, j.knee], 'thigh.R': [0, 0, j.hip], 'shin.R': [0, 0, j.knee],
    upperBody: [0, 0, j.hip], head: [0, 0, neck],
    'shoulder.L': [0, 0, j.shoulder], 'upperArm.L': [0, j.arm, j.shoulder], 'forearm.L': [0, 0, j.elbow],
    'shoulder.R': [0, 0, j.shoulder], 'upperArm.R': [0, -j.arm, j.shoulder], 'forearm.R': [0, 0, j.elbow],
  };
  return HUMANOID_BONES.map(([name]) => at[name]);
}

/** Texel je Knochen: drei Zeilen einer 3x4-Matrix. */
export const TEXELS_PER_BONE = 3;

/** Was je Körper anders gebacken wird als im Clip gespeichert. */
export interface BakeOptions {
  /**
   * Schrittweite des Körpers (uStride, 1 = voller Schritt): die Drehung der
   * Oberschenkel gegenüber dem Unterkörper wird damit skaliert - die Frau
   * schreitet im langen Rock kürzer. Nur für das Gehen (pose 1).
   */
  stride?: number;
}

/** Drehung auf `share` ihres Winkels verkürzt, um dieselbe Achse. */
function qScale([x, y, z, w]: Quat, share: number): Quat {
  const sign = w < 0 ? -1 : 1;
  const angle = 2 * Math.acos(Math.min(1, Math.abs(w)));
  const s = Math.sin(angle / 2);
  if (s < 1e-9) return [0, 0, 0, 1];
  const half = (angle * share) / 2;
  const k = (Math.sin(half) / s) * sign;
  return [x * k, y * k, z * k, Math.cos(half)];
}

/**
 * Backt einen Clip für eine Figur: je Bild eine Zeile mit den Skinning-
 * Matrizen aller Knochen (Modell-Koordinaten), als RGBA-Texel. Was vom
 * Körper abhängt: die Drehpunkte (Gelenke), beim Knien die Höhe (die Knie
 * auf dem Boden - aus dem eigenen Knie), beim Gehen die Schrittweite.
 */
export function bakeClip(clip: Clip, joints: Joints, options: BakeOptions = {}): Float32Array {
  const bones = HUMANOID_BONES.length;
  const p = pivots(joints);
  const out = new Float32Array(clip.frames * bones * TEXELS_PER_BONE * 4);
  const parentIndex = HUMANOID_BONES.map(([, parent]) => (parent === null ? -1 : BONE[parent]));
  const stride = clip.pose === 1 ? options.stride ?? 1 : 1;
  for (let f = 0; f < clip.frames; f++) {
    const stored = (b: number) => Array.from(clip.rotations.subarray((f * bones + b) * 4, (f * bones + b) * 4 + 4)) as Quat;
    const rot: Quat[] = HUMANOID_BONES.map((_, b) => stored(b));
    if (stride !== 1) {
      // Oberschenkel: ihre eigene Drehung (gegenüber dem Unterkörper)
      // verkürzen; der Unterschenkel behält seine gegenüber dem Oberschenkel.
      for (const [thigh, shin] of [['thigh.L', 'shin.L'], ['thigh.R', 'shin.R']]) {
        const t = BONE[thigh], s = BONE[shin], parent = parentIndex[t];
        const own = qMul(qInv(stored(parent)), stored(t));
        rot[t] = qMul(rot[parent], qScale(own, stride));
        rot[s] = qMul(rot[t], qMul(qInv(stored(t)), stored(s)));
      }
    }
    const w = (b: number) => rot[b];
    // Weltlage je Knochen: Drehung (Weltsinn) und wohin sein Drehpunkt kommt.
    const where: Vec3[] = [];
    for (let b = 0; b < bones; b++) {
      const parent = parentIndex[b];
      if (parent < 0) {
        // Kniend: so tief, dass das Knie dieses Körpers den Boden berührt
        // (wie die Formel: bob = -(uKnee - 0.04)).
        const z = clip.kneel ? -(joints.knee - 0.04) : clip.root[f * 3 + 2];
        where.push([clip.root[f * 3], clip.root[f * 3 + 1], z]);
        continue;
      }
      // Der Drehpunkt hängt am Eltern: dessen Drehung, um dessen Drehpunkt.
      const offset = qRotate(w(parent), [p[b][0] - p[parent][0], p[b][1] - p[parent][1], p[b][2] - p[parent][2]]);
      where.push([where[parent][0] + offset[0], where[parent][1] + offset[1], where[parent][2] + offset[2]]);
    }
    for (let b = 0; b < bones; b++) {
      // Skinning: um den eigenen Drehpunkt drehen und dorthin schieben, wo er jetzt ist.
      const m = qMatrix(w(b));
      const rp = qRotate(w(b), p[b]);
      const t = [where[b][0] - rp[0], where[b][1] - rp[1], where[b][2] - rp[2]];
      const o = ((f * bones + b) * TEXELS_PER_BONE) * 4;
      out.set([m[0], m[1], m[2], t[0], m[3], m[4], m[5], t[1], m[6], m[7], m[8], t[2]], o);
    }
  }
  return out;
}
