// Bausteine für die glTF-Exporte (tools/export/*.mjs): OBJ und MTL lesen, ein
// glTF zusammensetzen (Puffer, Materialien, flach schattierte Meshes mit oder
// ohne Skin) und als .glb schreiben. tools/export/bognerei.mjs hat dieselben
// Teile noch eingebaut.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Flächen als Dreiecke (wie src/gl/obj.ts): Objekt, Material, drei Eckpunkte. */
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

/** Diffusfarbe (Kd) je Material. */
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

export const FLOAT = 5126;
const UBYTE = 5121;

const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};

/** Setzt ein glTF zusammen: Puffer, Accessoren, Materialien, Meshes, Knoten. */
export class GltfBuilder {
  chunks = [];
  byteLength = 0;
  bufferViews = [];
  accessors = [];
  materials = [];
  materialIndex = new Map();
  meshes = [];
  nodes = [];

  /** Legt Daten in den Puffer und gibt den Accessor zurück. */
  accessor(typed, type, componentType, count, extra = {}) {
    const pad = (4 - (this.byteLength % 4)) % 4;
    if (pad) {
      this.chunks.push(new Uint8Array(pad));
      this.byteLength += pad;
    }
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    this.bufferViews.push({ buffer: 0, byteOffset: this.byteLength, byteLength: bytes.byteLength });
    this.chunks.push(bytes);
    this.byteLength += bytes.byteLength;
    this.accessors.push({ bufferView: this.bufferViews.length - 1, componentType, count, type, ...extra });
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
   * Mesh aus Dreiecken, je Material ein Primitive, flach schattiert (jede
   * Fläche ihre eigenen Eckpunkte). `weights(t, p)` gibt für Skin-Meshes je
   * Eckpunkt [[Knochen, Gewicht], ...]. Gibt die Nummer des Meshes zurück.
   */
  mesh(name, tris, colors, weights) {
    const byMaterial = new Map();
    for (const t of tris) {
      if (!byMaterial.has(t.material)) byMaterial.set(t.material, []);
      byMaterial.get(t.material).push(t);
    }
    const primitives = [];
    for (const [mtl, list] of byMaterial) {
      const pos = new Float32Array(list.length * 9);
      const nor = new Float32Array(list.length * 9);
      const joints = weights ? new Uint8Array(list.length * 12) : null;
      const wts = weights ? new Float32Array(list.length * 12) : null;
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
          if (weights) {
            weights(t, p).forEach(([bone, w], j) => {
              joints[(i * 3 + c) * 4 + j] = bone;
              wts[(i * 3 + c) * 4 + j] = w;
            });
          }
        });
      });
      const count = list.length * 3;
      const attributes = {
        POSITION: this.accessor(pos, 'VEC3', FLOAT, count, { min, max }),
        NORMAL: this.accessor(nor, 'VEC3', FLOAT, count),
      };
      if (weights) {
        attributes.JOINTS_0 = this.accessor(joints, 'VEC4', UBYTE, count);
        attributes.WEIGHTS_0 = this.accessor(wts, 'VEC4', FLOAT, count);
      }
      primitives.push({ attributes, material: this.material(mtl, colors.get(mtl) ?? [0.6, 0.6, 0.6]) });
    }
    this.meshes.push({ name, primitives });
    return this.meshes.length - 1;
  }

  addNode(node) {
    return this.nodes.push(node) - 1;
  }

  /** Schreibt das .glb. `extra`: scenes, skins, animations … (alles außer Puffer und Knoten). */
  write(file, extra) {
    const gltf = {
      asset: { version: '2.0', generator: 'procedurally-generated-map tools/export' },
      scene: 0,
      ...extra,
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
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
    const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
    const jsonPadded = new Uint8Array(jsonBytes.length + ((4 - (jsonBytes.length % 4)) % 4)).fill(0x20);
    jsonPadded.set(jsonBytes);
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
