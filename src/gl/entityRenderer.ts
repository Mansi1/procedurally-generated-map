// entityRenderer.ts
// Zweiter Zeichendurchgang über dem Gelände: alles, was der Gelände-Shader
// nicht erzeugen kann, weil der Spieler es verändert - Gebäude, das Bauvorschau-
// Feld und die Markierung erschöpfter Vorkommen.
//
// Gebäude sind instanzierte Klötze mit Dach, die Form bestimmt Proportionen
// und Dachneigung. Flächige Overlays sind ein feines Gitter, das sich über das
// Relief legt. Beide lesen die Geländehöhe direkt aus TERRAIN_COMMON - so
// stehen sie genau auf dem Boden, den der Gelände-Shader zeichnet.

import type { RGB } from '../functions/Color';
import { PROJECT_GLSL, setCameraUniforms, type GpuCamera } from './iso';
import { uploadTerrainParams } from './terrainRenderer';
import { TERRAIN_COMMON } from './terrainShader';

/** Formen für aParams.x - die Zahlen stehen so auch im Shader. */
export const SHAPE = {
  square: 0,
  circle: 1,
  triangle: 2,
  diamond: 3,
  /** Flächig, ohne Rand - für Overlays wie erschöpfte Vorkommen. */
  flat: 4,
  /** Mensch mit Armen und Beinen, läuft und arbeitet - Dorfbewohner. */
  villager: 5,
} as const;

/** Was eine Figur gerade tut - steuert die Animation. */
export const POSE = {
  stand: 0,
  walk: 1,
  work: 2,
} as const;

export interface EntityInstance {
  /** Welt-Tile, linke obere Ecke. Gezeichnet wird um die Tile-Mitte. */
  x: number;
  y: number;
  /** Kantenlänge in Welt-Tiles. */
  size: number;
  color: RGB;
  shape: number;
  alpha: number;
  /**
   * Nur für Figuren: Blickrichtung (Radiant in Weltkoordinaten), Phase der
   * Animation (Radiant), Pose (POSE) und Ladung 0..1.
   */
  motion?: [number, number, number, number];
  /** Nur für Figuren: Farbe der Last auf dem Rücken. */
  accent?: RGB;
}

/** Float-Werte je Instanz: aTile(2) + aColor(3) + aParams(3) + aMotion(4) + aAccent(3). */
const STRIDE = 15;

/** Unterteilung flacher Overlays je Kante, damit sie sich an Hänge anschmiegen. */
const FLAT_SEGMENTS = 4;

const VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2DArray;

${TERRAIN_COMMON}
${PROJECT_GLSL}

// xy = Lage in der Grundfläche 0..1
// z  = 0 Fuß (im Boden versenkt), 1 Traufe, 2 Dachfirst
// w  = 1 für Dachflächen
layout(location = 0) in vec4 aCorner;
layout(location = 1) in vec2 aTile;     // Welt-Tile
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec3 aParams;   // x = Form, y = Alpha, z = Größe in Tiles
layout(location = 4) in vec4 aMotion;   // Figuren: Blickrichtung, Phase, Pose, Ladung
layout(location = 5) in vec3 aAccent;   // Figuren: Farbe der Last

/** Untergrenze für die Größe, damit Gebäude beim Herauszoomen sichtbar bleiben. */
uniform float uMinSizeTiles;

out vec3 vWorld;
out vec3 vColor;
flat out vec3 vParams;
flat out float vRoof;   // Gebäude: 1 = Dachfläche. Figuren: Körperteil.

// Körperteile der Figur - aCorner.w im Menschen-Mesh.
const int P_TORSO = 0;
const int P_LEG_L = 1;
const int P_LEG_R = 2;
const int P_ARM_L = 3;
const int P_ARM_R = 4;
const int P_HEAD = 5;
const int P_LOAD = 6;

const float HIP = 0.46;
const float SHOULDER = 0.78;

// Dreht p in der Ebene aus Blickrichtung (x) und Hoehe (z) um ein Gelenk -
// so schwingen Arme und Beine nach vorn und hinten.
vec3 swingAround(vec3 p, float pivot, float angle) {
  vec2 q = vec2(p.x, p.z - pivot);
  float c = cos(angle);
  float s = sin(angle);
  return vec3(q.x * c - q.y * s, p.y, q.x * s + q.y * c + pivot);
}

float groundZ(vec2 world) {
  return uReliefScale > 0.0
      ? reliefZ(elevation(world * uMapScale, 1.0)) * uReliefScale
      : 0.0;
}

void main() {
  int shape = int(aParams.x + 0.5);
  vec2 center = aTile + 0.5;
  vec3 world;

  if (shape == 5) {
    // Mensch. Das Mesh ist in Koerperhoehen modelliert: x nach vorn, y nach
    // links, z nach oben, Fuesse bei 0, Scheitel bei 1.
    float size = max(aParams.z, uMinSizeTiles * 0.5);
    float height = size * 1.7;
    int part = int(aCorner.w + 0.5);
    vec3 p = aCorner.xyz;
    float phase = aMotion.y;
    int pose = int(aMotion.z + 0.5);

    float swing = 0.0;
    float bob = 0.0;
    if (pose == 1) {
      // Gehen: Beine gegengleich, Arme gegen die Beine, leichtes Wippen
      // bei jedem Schritt.
      swing = sin(phase) * 0.6;
      bob = abs(cos(phase)) * 0.03;
    }
    if (part == P_LEG_L) p = swingAround(p, HIP, swing);
    if (part == P_LEG_R) p = swingAround(p, HIP, -swing);
    if (part == P_ARM_L) p = swingAround(p, SHOULDER, pose == 2 ? 0.9 : -swing * 0.8);
    if (part == P_ARM_R) {
      // Arbeiten: der rechte Arm holt nach oben aus und schlaegt nach vorn -
      // Axt, Spitzhacke oder Pfluecken sehen auf diese Groesse gleich aus.
      float chop = 0.6 + 1.9 * (0.5 + 0.5 * sin(phase));
      p = swingAround(p, SHOULDER, pose == 2 ? chop : swing * 0.8);
    }
    // Die Last waechst mit der Ladung aus dem Ruecken heraus.
    if (part == P_LOAD) p = vec3(-0.09, 0.0, 0.64) + (p - vec3(-0.09, 0.0, 0.64)) * aMotion.w;
    p.z += bob;

    vec2 forward = vec2(cos(aMotion.x), sin(aMotion.x));
    vec2 left = vec2(-forward.y, forward.x);
    vec2 xy = center + (forward * p.x + left * p.y) * height;
    world = vec3(xy, groundZ(center) + p.z * height);
  } else if (shape == 4) {
    // Overlays behalten ihre Tile-Größe - sie sollen genau ihr Feld abdecken.
    // Jede Ecke sitzt auf ihrer eigenen Geländehöhe, leicht angehoben, damit
    // sie nicht im Boden verschwindet.
    vec2 p = center + (aCorner.xy - 0.5) * aParams.z;
    world = vec3(p, groundZ(p) + 0.15);
  } else {
    float size = max(aParams.z, uMinSizeTiles);
    // x = Anteil der Grundfläche, y = Wandhöhe, z = Dachhöhe (je Kantenlänge)
    vec3 dims = vec3(0.86, 0.55, 0.0);                    // Quader, Flachdach
    if (shape == 1) dims = vec3(0.56, 1.25, 0.35);        // Turm
    else if (shape == 2) dims = vec3(0.82, 0.45, 0.45);   // Haus mit Spitzdach
    else if (shape == 3) dims = vec3(0.9, 0.22, 0.2);     // flaches Lager

    vec2 p = center + (aCorner.xy - 0.5) * size * dims.x;
    // Ein Gebäude steht waagerecht: Höhe aus der Mitte, nicht je Ecke. Der Fuß
    // reicht in den Boden, damit am Hang keine Lücke darunter aufgeht.
    float base = groundZ(center);
    float z = aCorner.z < 0.5 ? base - 2.0
            : aCorner.z < 1.5 ? base + size * dims.y
            : base + size * (dims.y + dims.z);
    world = vec3(p, z);
  }

  vWorld = world;
  // Die Last einer Figur bekommt ihre eigene Farbe.
  vColor = shape == 5 && int(aCorner.w + 0.5) == P_LOAD ? aAccent : aColor;
  vParams = aParams;
  vRoof = aCorner.w;
  gl_Position = project(world.xy, world.z);
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vColor;
flat in vec3 vParams;
flat in float vRoof;
out vec4 fragColor;

// Zur Kamera: ein Schritt in x + y ist ein Z_SCREEN-tel Schritt in z.
const vec3 TO_CAMERA = vec3(1.0, 1.0, ${(2 / Math.sqrt(6)).toFixed(8)});
// Licht von links oben im Bild - dieselbe Sonne wie im Gelände-Shader.
const vec3 SUN = vec3(-0.45, 0.35, 0.82);

void main() {
  int shape = int(vParams.x + 0.5);
  float alpha = vParams.y;

  if (shape == 4) {
    fragColor = vec4(vColor, alpha);
    return;
  }

  // Flächennormale aus den Bildschirm-Ableitungen - die Klötze sind eckig,
  // eine Normale je Fläche ist genau richtig und spart ein Attribut.
  vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(normal, TO_CAMERA) < 0.0) normal = -normal;

  vec3 base = vColor;
  if (shape == 5) {
    // Figur: Kittel in der Instanzfarbe, dunkle Hose, Haut am Kopf.
    int part = int(vRoof + 0.5);
    if (part == 1 || part == 2) base = vec3(0.32, 0.24, 0.17);
    else if (part == 5) base = vec3(0.93, 0.76, 0.6);
  } else if (vRoof > 0.5 && shape != 0) {
    // Spitzdächer bekommen einen dunklen Ziegelton, damit man Dach und Wand
    // auseinanderhält. Flachdächer bleiben in der Gebäudefarbe.
    base = mix(vColor, vec3(0.42, 0.2, 0.14), 0.55);
  }

  float light = 0.45 + 0.75 * max(dot(normal, normalize(SUN)), 0.0);
  fragColor = vec4(base * light, alpha);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Entity-Shader lässt sich nicht übersetzen:\n${log}`);
  }
  return shader;
}

/** Klotz mit Walmdach: vier Wände und vier Dachdreiecke zum First in der Mitte. */
function buildingMesh(): Float32Array {
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const v: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    // Wand
    v.push(ax, ay, 0, 0, bx, by, 0, 0, ax, ay, 1, 0);
    v.push(bx, by, 0, 0, bx, by, 1, 0, ax, ay, 1, 0);
    // Dach
    v.push(ax, ay, 1, 1, bx, by, 1, 1, 0.5, 0.5, 2, 1);
  }
  return new Float32Array(v);
}

/** Feines Gitter für flache Overlays. */
function flatMesh(): Float32Array {
  const v: number[] = [];
  const n = FLAT_SEGMENTS;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = i / n, x1 = (i + 1) / n, y0 = j / n, y1 = (j + 1) / n;
      v.push(x0, y0, 0, 0, x1, y0, 0, 0, x0, y1, 0, 0);
      v.push(x1, y0, 0, 0, x1, y1, 0, 0, x0, y1, 0, 0);
    }
  }
  return new Float32Array(v);
}

/**
 * Mensch aus Quadern, in Körperhöhen (Füße 0, Scheitel 1), x nach vorn,
 * y nach links. w ist das Körperteil - der Shader bewegt danach Arme und Beine.
 */
function humanMesh(): Float32Array {
  const v: number[] = [];
  const box = (part: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const c = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    const faces = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    for (const [a, b, cc, d] of faces) {
      for (const i of [a, b, cc, a, cc, d]) v.push(c[i][0], c[i][1], c[i][2], part);
    }
  };
  box(1, -0.06, 0.06, 0.02, 0.11, 0, 0.47);        // linkes Bein
  box(2, -0.06, 0.06, -0.11, -0.02, 0, 0.47);      // rechtes Bein
  box(0, -0.08, 0.08, -0.14, 0.14, 0.44, 0.8);     // Rumpf
  box(3, -0.045, 0.045, 0.14, 0.21, 0.46, 0.8);    // linker Arm
  box(4, -0.045, 0.045, -0.21, -0.14, 0.46, 0.8);  // rechter Arm
  box(5, -0.075, 0.075, -0.075, 0.075, 0.82, 1);   // Kopf
  box(6, -0.22, -0.09, -0.11, 0.11, 0.5, 0.78);    // Last auf dem Rücken
  return new Float32Array(v);
}

interface Mesh {
  vao: WebGLVertexArrayObject;
  vertices: number;
}

export class EntityRenderer {
  private program: WebGLProgram;
  private building: Mesh;
  private flat: Mesh;
  private human: Mesh;
  private instanceBuffer: WebGLBuffer;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  /** Wird nur vergrößert, nie neu belegt - eine Allokation je Frame wäre Müll. */
  private data = new Float32Array(STRIDE * 256);
  /** Sortierpuffer, ebenfalls wiederverwendet. */
  private flats: EntityInstance[] = [];
  private solids: EntityInstance[] = [];
  private figures: EntityInstance[] = [];

  constructor(private gl: WebGL2RenderingContext) {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(`Entity-Programm lässt sich nicht linken:\n${gl.getProgramInfoLog(this.program)}`);
    }
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    this.instanceBuffer = gl.createBuffer()!;
    this.building = this.createMesh(buildingMesh());
    this.flat = this.createMesh(flatMesh());
    this.human = this.createMesh(humanMesh());

    gl.useProgram(this.program);
    uploadTerrainParams(gl, (name) => this.location(name));
  }

  private createMesh(vertices: Float32Array): Mesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    for (let loc = 1; loc <= 5; loc++) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return { vao, vertices: vertices.length / 4 };
  }

  private location(name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniforms.get(name)!;
  }

  /** Instanzen ab `first` in den Instanz-Puffer. Die Attribut-Zeiger zeigen auf diesen Abschnitt. */
  private draw(mesh: Mesh, first: number, count: number) {
    if (count === 0) return;
    const gl = this.gl;
    const bytes = STRIDE * 4;
    const offset = first * bytes;
    gl.bindVertexArray(mesh.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, bytes, offset);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bytes, offset + 8);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, bytes, offset + 20);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, bytes, offset + 32);
    gl.vertexAttribPointer(5, 3, gl.FLOAT, false, bytes, offset + 48);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertices, count);
  }

  /**
   * Zeichnet über ein bereits gezeichnetes Gelände - dessen Tiefenpuffer
   * verdeckt, was hinter Hügeln liegt.
   * @param minSizeTiles Mindestgröße, damit Gebäude beim Herauszoomen nicht verschwinden
   */
  render(instances: EntityInstance[], camera: GpuCamera, minSizeTiles: number) {
    if (instances.length === 0) return;
    const gl = this.gl;

    // Overlays zuerst, dann die Gebäude von hinten nach vorn - halbtransparente
    // Vorschau-Klötze mischen sich sonst mit dem falschen Hintergrund.
    const flats = this.flats;
    const solids = this.solids;
    const figures = this.figures;
    flats.length = 0;
    solids.length = 0;
    figures.length = 0;
    for (const e of instances) {
      (e.shape === SHAPE.flat ? flats : e.shape === SHAPE.villager ? figures : solids).push(e);
    }
    solids.sort((a, b) => a.x + a.y - (b.x + b.y));
    figures.sort((a, b) => a.x + a.y - (b.x + b.y));

    if (this.data.length < instances.length * STRIDE) {
      this.data = new Float32Array(instances.length * STRIDE * 2);
    }
    const d = this.data;
    let i = 0;
    for (const list of [flats, solids, figures]) {
      for (const e of list) {
        const o = i++ * STRIDE;
        d[o] = e.x;
        d[o + 1] = e.y;
        d[o + 2] = e.color[0] / 255;
        d[o + 3] = e.color[1] / 255;
        d[o + 4] = e.color[2] / 255;
        d[o + 5] = e.shape;
        d[o + 6] = e.alpha;
        d[o + 7] = e.size;
        const m = e.motion;
        d[o + 8] = m ? m[0] : 0;
        d[o + 9] = m ? m[1] : 0;
        d[o + 10] = m ? m[2] : 0;
        d[o + 11] = m ? m[3] : 0;
        const a = e.accent ?? e.color;
        d[o + 12] = a[0] / 255;
        d[o + 13] = a[1] / 255;
        d[o + 14] = a[2] / 255;
      }
    }

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, instances.length * STRIDE), gl.DYNAMIC_DRAW);

    setCameraUniforms(gl, (name) => this.location(name), camera);
    gl.uniform1f(this.location('uMinSizeTiles'), minSizeTiles);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Overlays schreiben keine Tiefe - sie liegen auf dem Boden und sollen
    // Gebäude auf demselben Feld nicht verdecken.
    gl.depthMask(false);
    this.draw(this.flat, 0, flats.length);
    gl.depthMask(true);
    this.draw(this.building, flats.length, solids.length);
    this.draw(this.human, flats.length + solids.length, figures.length);

    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LESS);
    gl.bindVertexArray(null);
  }
}
