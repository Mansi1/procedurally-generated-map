// Kleiner glTF-Baukasten für die Export-Skripte (tools/export/*.mjs): OBJ und
// MTL lesen, Meshes (flach schattiert, wahlweise mit Skin), Knoten und
// Animationen sammeln und als .glb schreiben. Blender öffnet das Ergebnis mit
// Datei > Import > glTF 2.0.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// --- OBJ und MTL (wie src/gl/obj.ts) ----------------------------------------

export function parseObj(source) {
  const positions = [];
  const triangles = [];
  let object = '';
  let material = '';
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [keyword, ...args] = line.split(/\s+/);
    if (keyword === 'v') positions.push(args.slice(0, 3).map(Number));
    else if (keyword === 'o' || keyword === 'g') object = args.join(' ');
    else if (keyword === 'usemtl') material = args.join(' ');
    else if (keyword === 'f') {
      const corners = args.map((a) => {
        const i = Number(a.split('/')[0]);
        return positions[i < 0 ? positions.length + i : i - 1];
      });
      for (let i = 1; i + 1 < corners.length; i++) triangles.push({ object, material, points: [corners[0], corners[i], corners[i + 1]] });
    }
  }
  return triangles;
}

export function parseMtl(source) {
  const colors = new Map();
  let current = '';
  for (const raw of source.split('\n')) {
    const [keyword, ...args] = raw.trim().split(/\s+/);
    if (keyword === 'newmtl') current = args.join(' ');
    if (keyword === 'Kd' && current) colors.set(current, args.slice(0, 3).map(Number));
  }
  return colors;
}

/** Quaternion für eine Drehung um eine Achse (Einheitsvektor), Winkel in Radiant. */
export const qAxis = ([x, y, z], a) => {
  const s = Math.sin(a / 2);
  return [x * s, y * s, z * s, Math.cos(a / 2)];
};

const FLOAT = 5126, UBYTE = 5121;
const SIZE = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 };

const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};

/** Sammelt Puffer, Meshes, Knoten und Animationen einer glTF-Datei. */
export class GltfBuilder {
  constructor() {
    this.chunks = [];
    this.byteLength = 0;
    this.bufferViews = [];
    this.accessors = [];
    this.materials = [];
    this.materialIndex = new Map();
    this.meshes = [];
    this.nodes = [];
    this.skins = [];
    this.animations = [];
  }

  /** Legt Daten in den Puffer und gibt den Accessor zurück. */
  accessor(typed, type, componentType = FLOAT, extra = {}) {
    const pad = (4 - (this.byteLength % 4)) % 4;
    if (pad) {
      this.chunks.push(new Uint8Array(pad));
      this.byteLength += pad;
    }
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    this.bufferViews.push({ buffer: 0, byteOffset: this.byteLength, byteLength: bytes.byteLength });
    this.chunks.push(bytes);
    this.byteLength += bytes.byteLength;
    this.accessors.push({ bufferView: this.bufferViews.length - 1, componentType, count: typed.length / SIZE[type], type, ...extra });
    return this.accessors.length - 1;
  }

  material(name, rgb) {
    const key = `${name}|${rgb.join(',')}`;
    if (!this.materialIndex.has(key)) {
      this.materials.push({ name, pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.9 } });
      this.materialIndex.set(key, this.materials.length - 1);
    }
    return this.materialIndex.get(key);
  }

  /**
   * Mesh aus Dreiecken, je Material ein Primitive, flach schattiert. Mit
   * `joint(t, p)` (Index in skin.joints) bekommt jeder Eckpunkt einen Knochen.
   */
  mesh(name, tris, colors, joint) {
    const byMaterial = new Map();
    for (const t of tris) {
      if (!byMaterial.has(t.material)) byMaterial.set(t.material, []);
      byMaterial.get(t.material).push(t);
    }
    const primitives = [];
    for (const [mtl, list] of byMaterial) {
      const pos = new Float32Array(list.length * 9);
      const nor = new Float32Array(list.length * 9);
      const joints = joint ? new Uint8Array(list.length * 12) : null;
      const weights = joint ? new Float32Array(list.length * 12) : null;
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      list.forEach((t, i) => {
        const n = normalize(cross(sub(t.points[1], t.points[0]), sub(t.points[2], t.points[0])));
        t.points.forEach((p, c) => {
          const o = (i * 3 + c) * 3;
          pos.set(p, o);
          nor.set(n, o);
          p.forEach((v, j) => {
            min[j] = Math.min(min[j], v);
            max[j] = Math.max(max[j], v);
          });
          if (joint) {
            joints[(i * 3 + c) * 4] = joint(t, p);
            weights[(i * 3 + c) * 4] = 1;
          }
        });
      });
      const attributes = {
        POSITION: this.accessor(pos, 'VEC3', FLOAT, { min, max }),
        NORMAL: this.accessor(nor, 'VEC3'),
      };
      if (joint) {
        attributes.JOINTS_0 = this.accessor(joints, 'VEC4', UBYTE);
        attributes.WEIGHTS_0 = this.accessor(weights, 'VEC4');
      }
      primitives.push({ attributes, material: this.material(mtl, colors.get(mtl) ?? [0.6, 0.6, 0.6]) });
    }
    this.meshes.push({ name, primitives });
    return this.meshes.length - 1;
  }

  node(node) {
    return this.nodes.push(node) - 1;
  }

  /**
   * Skelett aus [Name, Eltern, Drehpunkt] (Drehpunkte global, Ruhelage ohne
   * Drehung). Gibt die Knoten der Knochen und den Skin zurück.
   */
  skeleton(name, bones) {
    const index = new Map(bones.map(([n], i) => [n, i]));
    const nodes = bones.map(([n, parent, pivot]) => {
      const parentPivot = parent ? bones[index.get(parent)][2] : [0, 0, 0];
      return this.node({ name: n, translation: sub(pivot, parentPivot) });
    });
    bones.forEach(([, parent], i) => {
      if (!parent) return;
      const p = this.nodes[nodes[index.get(parent)]];
      (p.children ??= []).push(nodes[i]);
    });
    const inverseBind = new Float32Array(bones.length * 16);
    bones.forEach(([, , pivot], i) => {
      inverseBind.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -pivot[0], -pivot[1], -pivot[2], 1], i * 16);
    });
    this.skins.push({ name, joints: nodes, skeleton: nodes[0], inverseBindMatrices: this.accessor(inverseBind, 'MAT4') });
    return { nodes, skin: this.skins.length - 1 };
  }

  /**
   * Animation aus gleichmäßig abgetasteten Bildern. `tracks`: [Knoten, Pfad
   * ('rotation' | 'translation' | 'scale'), Werte je Bild (flach)].
   */
  animation(name, times, tracks) {
    const input = this.accessor(Float32Array.from(times), 'SCALAR', FLOAT, { min: [times[0]], max: [times[times.length - 1]] });
    const samplers = [];
    const channels = [];
    for (const [node, path, values] of tracks) {
      const type = path === 'rotation' ? 'VEC4' : 'VEC3';
      samplers.push({ input, output: this.accessor(Float32Array.from(values), type), interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node, path } });
    }
    this.animations.push({ name, samplers, channels });
  }

  /** Schreibt die .glb mit einer Szene aus den Knoten `roots`. */
  write(file, sceneName, roots) {
    const gltf = {
      asset: { version: '2.0', generator: 'procedurally-generated-map tools/export' },
      scene: 0,
      scenes: [{ name: sceneName, nodes: roots }],
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      ...(this.skins.length ? { skins: this.skins } : {}),
      ...(this.animations.length ? { animations: this.animations } : {}),
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: this.byteLength }],
    };
    const bin = new Uint8Array(this.byteLength + ((4 - (this.byteLength % 4)) % 4));
    let offset = 0;
    for (const c of this.chunks) {
      bin.set(c, offset);
      offset += c.byteLength;
    }
    const json = new TextEncoder().encode(JSON.stringify(gltf));
    const jsonPadded = new Uint8Array(json.length + ((4 - (json.length % 4)) % 4)).fill(0x20);
    jsonPadded.set(json);
    const total = 12 + 8 + jsonPadded.length + 8 + bin.length;
    const glb = new Uint8Array(total);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, total, true);
    view.setUint32(12, jsonPadded.length, true);
    view.setUint32(16, 0x4e4f534a, true);
    glb.set(jsonPadded, 20);
    view.setUint32(20 + jsonPadded.length, bin.length, true);
    view.setUint32(24 + jsonPadded.length, 0x004e4942, true);
    glb.set(bin, 28 + jsonPadded.length);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, glb);
    return total;
  }
}
