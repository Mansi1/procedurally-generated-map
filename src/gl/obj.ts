// obj.ts
// Liest Wavefront OBJ und MTL - das Format, das Blender unter Datei > Export >
// Wavefront (.obj) schreibt. Nur, was ein Modell aus Quadern und Flächen
// braucht: Eckpunkte, Flächen, Objekte und Materialfarben. Normalen und
// Texturkoordinaten werden überlesen - die Shader rechnen flach schattiert.

export type RGB01 = [number, number, number];

export interface ObjTriangle {
  /** Name des Objekts (`o`) oder der Gruppe (`g`), in dem die Fläche steht. */
  object: string;
  /** Laufende Nummer des Objekts - auseinanderzuhalten, auch wenn Namen sich wiederholen. */
  index: number;
  material: string;
  /** Drei Eckpunkte in Datei-Koordinaten. */
  points: [RGB01, RGB01, RGB01];
}

/** Flächen als Dreiecke. Vielecke werden als Fächer zerlegt - Blender schreibt Quads. */
export function parseObj(source: string): ObjTriangle[] {
  const positions: RGB01[] = [];
  const triangles: ObjTriangle[] = [];
  let object = '';
  let index = -1;
  let material = '';

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [keyword, ...args] = line.split(/\s+/);

    switch (keyword) {
      case 'v':
        positions.push([Number(args[0]), Number(args[1]), Number(args[2])]);
        break;
      case 'o':
      case 'g':
        object = args.join(' ');
        index++;
        break;
      case 'usemtl':
        material = args.join(' ');
        break;
      case 'f': {
        // "f 1 2 3", "f 1/1 2/2 3/3" oder "f 1//1 ..." - gebraucht wird nur
        // der Eckpunkt. Negative Indizes zählen vom Ende der bisherigen Liste.
        const corners = args.map((arg) => {
          const index = Number(arg.split('/')[0]);
          const point = positions[index < 0 ? positions.length + index : index - 1];
          if (!point) throw new Error(`OBJ: Eckpunkt ${arg} gibt es nicht`);
          return point;
        });
        for (let i = 1; i + 1 < corners.length; i++) {
          triangles.push({ object, index, material, points: [corners[0], corners[i], corners[i + 1]] });
        }
        break;
      }
    }
  }
  return triangles;
}

/** Diffusfarbe (Kd) je Material. */
export function parseMtl(source: string): Map<string, RGB01> {
  const colors = new Map<string, RGB01>();
  let current = '';
  for (const raw of source.split('\n')) {
    const [keyword, ...args] = raw.trim().split(/\s+/);
    if (keyword === 'newmtl') current = args.join(' ');
    if (keyword === 'Kd' && current) {
      colors.set(current, [Number(args[0]), Number(args[1]), Number(args[2])]);
    }
  }
  return colors;
}
