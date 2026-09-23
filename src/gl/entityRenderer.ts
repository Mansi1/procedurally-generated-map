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
import { parseMtl, parseObj } from './obj';
import villagerObj from '../models/villager.obj?raw';
import villagerMtl from '../models/villager.mtl?raw';
import millObj from '../models/mill.obj?raw';
import millMtl from '../models/mill.mtl?raw';
import lumberCampObj from '../models/lumber_camp.obj?raw';
import lumberCampMtl from '../models/lumber_camp.mtl?raw';
import houseObj from '../models/house.obj?raw';
import houseMtl from '../models/house.mtl?raw';
import townCenterObj from '../models/town_center.obj?raw';
import townCenterMtl from '../models/town_center.mtl?raw';
import miningCampObj from '../models/mining_camp.obj?raw';
import miningCampMtl from '../models/mining_camp.mtl?raw';
import treeObj from '../models/tree.obj?raw';
import treeMtl from '../models/tree.mtl?raw';
import stoneObj from '../models/stone.obj?raw';
import stoneMtl from '../models/stone.mtl?raw';
import goldObj from '../models/gold.obj?raw';
import goldMtl from '../models/gold.mtl?raw';
import berryBushObj from '../models/berry_bush.obj?raw';
import berryBushMtl from '../models/berry_bush.mtl?raw';
import rallyFlagObj from '../models/rally_flag.obj?raw';
import rallyFlagMtl from '../models/rally_flag.mtl?raw';

/** Formen für aParams.x - die Zahlen stehen so auch im Shader. */
export const SHAPE = {
  square: 0,
  circle: 1,
  triangle: 2,
  diamond: 3,
  /** Flächig, ohne Rand - für Overlays wie erschöpfte Vorkommen. */
  flat: 4,
  /** Mensch mit Armen und Beinen, läuft und arbeitet - Dorfbewohner (models/villager.obj). */
  villager: 5,
  /** Windmühle mit drehenden Flügeln (models/mill.obj). */
  mill: 6,
  /** Offener Holzschuppen mit Stammstapel (models/lumber_camp.obj). */
  lumberCamp: 7,
  /** Fachwerkhaus mit Satteldach (models/house.obj). */
  house: 8,
  /** Halle mit Turm, Vorhalle und Fahne (models/town_center.obj). */
  townCenter: 9,
  /** Nur intern: Lebensbalken über einer Instanz mit `health`. */
  healthBar: 10,
  /** Schuppen mit Steinen, Gold und Erzwagen (models/mining_camp.obj). */
  miningCamp: 11,
  // Vorkommen in der Landschaft - ab hier "natürliche" Objekte: eigene
  // Drehung je Instanz, keine Mindestgröße, keine Sortierung (undurchsichtig).
  /** Kiefer auf Holz-Tiles (models/tree.obj). */
  tree: 12,
  /** Felsen auf Stein-Tiles (models/stone.obj). */
  stoneRock: 13,
  /** Fels mit Goldnuggets (models/gold.obj). */
  goldRock: 14,
  /** Beerenstrauch (models/berry_bush.obj). */
  berryBush: 15,
  /** Fahne am Sammelpunkt eines Gebäudes (models/rally_flag.obj). */
  rallyFlag: 16,
} as const;

/** Von bis: diese Formen sind Vorkommen, keine Gebäude oder Figuren. */
const FIRST_NATURAL = SHAPE.tree;
const LAST_NATURAL = SHAPE.berryBush;

/** Gebäude schauen schräg zur Kamera (die steht bei +x +y). */
const BUILDING_HEADING = 0.5;

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
  /**
   * Geländehöhe unter der Instanz in Tiles, falls schon bekannt. Sonst rechnet
   * der Shader sie aus - für ein paar Gebäude billig, für Tausende Bäume nicht.
   */
  ground?: number;
  /**
   * Trefferpunkte 0..1 - gesetzt, wird darüber ein Lebensbalken gezeichnet.
   * Die Welt setzt es nur für Ausgewähltes, wie in AoE2.
   */
  health?: number;
}

/** Oberkante der Klotz-Formen in Kantenlängen (Wand + Dach, wie `dims` im Shader). */
const BOX_TOP: Record<number, number> = { 0: 0.55, 1: 1.6, 2: 0.9, 3: 0.42 };

/** Float-Werte je Instanz: aTile(2) + aColor(3) + aParams(3) + aMotion(4) + aAccent(3) + aGround(1). */
const STRIDE = 16;
/** aGround-Wert für "unbekannt, im Shader ausrechnen". */
const GROUND_UNKNOWN = -1e4;

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
layout(location = 6) in vec4 aMaterial; // Modelle: Materialfarbe, w = Rolle (MATERIAL_ROLE)
layout(location = 7) in float aGround;  // Geländehöhe in Tiles, oder ${GROUND_UNKNOWN} = ausrechnen

/** Untergrenze für die Größe, damit Gebäude beim Herauszoomen sichtbar bleiben. */
uniform float uMinSizeTiles;
// Gelenke der Figur in Koerperhoehen - aus dem Modell abgelesen, damit ein in
// Blender umgebautes Modell weiter richtig laeuft.
uniform float uHip;
uniform float uShoulder;
uniform vec3  uLoadAnchor;   // Befestigung der Last am Ruecken
// Modelle: Groesse je Tile der Instanzgroesse, Nabe der Fluegel (links, oben)
// und die Zeit fuer alles, was sich von selbst bewegt.
uniform float uModelScale;
uniform vec2  uHub;
uniform float uTime;

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
const int P_SAILS = 7;
const int P_CLOTH = 8;


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

  if (shape == 10) {
    // Lebensbalken: ein Rechteck fester Pixelgroesse ueber dem Kopf der
    // Instanz. Verankert wird er in der Welt, die Ausdehnung kommt in
    // Bildschirmpixeln dazu - so bleibt er auf jeder Zoomstufe lesbar.
    // aMotion: x = Anteil 0..1, y = Hoehe des Ankers ueber Grund (Tiles),
    //          z = Balkenhoehe (px), w = Abstand zum Anker (px).
    vec4 clip = project(center, groundZ(center) + aMotion.y);
    vec2 px = vec2((aCorner.x - 0.5) * aParams.z, aCorner.y * aMotion.z + aMotion.w);
    clip.xy += px * 2.0 / uResolution;
    clip.z = -1.0;  // vor allem anderen
    gl_Position = clip;
    vWorld = vec3(aCorner.xy, aMotion.z);
    vColor = aColor;
    vParams = aParams;
    vRoof = aMotion.x;
    return;
  }

  if (shape >= 5) {  // 10 (Lebensbalken) ist oben schon abgefangen
    // Modell aus einer OBJ-Datei. Eckpunkte in Modell-Einheiten: x nach vorn,
    // y nach links, z nach oben, Boden bei 0. Figuren sind auf Koerperhoehe 1
    // gebracht, Gebaeude auf Breite 1 (siehe loadModel()).
    bool figure = shape == 5;
    bool natural = shape >= ${FIRST_NATURAL} && shape <= ${LAST_NATURAL};
    // Mindestgröße nur für Gebäude und Figuren: Bäume auf Mindestgröße
    // aufgeblasen würden herausgezoomt jeden Wald zu einem Brei machen.
    float size = natural ? aParams.z
        : figure ? max(aParams.z, uMinSizeTiles * 0.5) : max(aParams.z, uMinSizeTiles);
    float scale = size * uModelScale;
    int part = int(aCorner.w + 0.5);
    vec3 p = aCorner.xyz;

    if (figure) {
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
      if (part == P_LEG_L) p = swingAround(p, uHip, swing);
      if (part == P_LEG_R) p = swingAround(p, uHip, -swing);
      if (part == P_ARM_L) p = swingAround(p, uShoulder, pose == 2 ? 0.9 : -swing * 0.8);
      if (part == P_ARM_R) {
        // Arbeiten: der rechte Arm holt nach oben aus und schlaegt nach vorn -
        // Axt, Spitzhacke oder Pfluecken sehen auf diese Groesse gleich aus.
        float chop = 0.6 + 1.9 * (0.5 + 0.5 * sin(phase));
        p = swingAround(p, uShoulder, pose == 2 ? chop : swing * 0.8);
      }
      // Die Last waechst mit der Ladung aus dem Ruecken heraus.
      if (part == P_LOAD) p = uLoadAnchor + (p - uLoadAnchor) * aMotion.w;
      p.z += bob;
    }

    if (part == P_CLOTH) {
      // Fahnentuch weht: eine Welle läuft vom Mast zum freien Ende, das
      // weiter ausschlägt als die Seite am Mast.
      p.x += sin(uTime * 5.0 - p.y * 14.0) * 0.12 * p.y;
    }

    if (part == P_SAILS) {
      // Muehlenfluegel drehen sich um die Nabe, die Achse zeigt nach vorn.
      float a = -uTime * 0.8;
      vec2 q = p.yz - uHub;
      p.yz = uHub + vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
    }

    // Blickrichtung je Instanz (Gebäude bekommen sie vom Renderer).
    float heading = aMotion.x;
    vec2 forward = vec2(cos(heading), sin(heading));
    vec2 left = vec2(-forward.y, forward.x);
    vec2 offset = (forward * p.x + left * p.y) * scale;
    float up = p.z * scale;

    // Umfallen (Vorkommen): um den Fuss kippen, aMotion.y = Winkel,
    // aMotion.z = Richtung in Weltkoordinaten. Der Anteil in Fallrichtung
    // und die Hoehe drehen sich, der Anteil quer dazu bleibt.
    bool falling = natural && aMotion.y > 0.0;
    if (falling) {
      vec2 dir = vec2(cos(aMotion.z), sin(aMotion.z));
      float along = dot(offset, dir);
      vec2 across = offset - dir * along;
      float c = cos(aMotion.y);
      float s = sin(aMotion.y);
      offset = across + dir * (along * c + up * s);
      up = -along * s + up * c;
    }

    vec2 xy = center + offset;
    float base = aGround > ${GROUND_UNKNOWN / 10}.0 ? aGround * uReliefScale : groundZ(center);
    float z = base + up;
    // Gebaeude stehen waagerecht; ihr Sockel reicht in den Boden, damit am
    // Hang keine Luecke darunter aufgeht. Ein kippender Baum nicht - sein
    // Sockel wuerde sonst als Stange aus dem Boden ragen.
    if (!figure && !falling && p.z < 0.001) z = base - 1.0;
    world = vec3(xy, z);
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
  vColor = aColor;
  if (shape >= 5) {
    // Modelle färben nach Material: Kittel bzw. Anstrich in der Instanzfarbe,
    // die Last in der Farbe der Ressource, alles andere wie in der MTL-Datei.
    int role = int(aMaterial.w + 0.5);
    vColor = role == 1 ? aColor : role == 2 ? aAccent : aMaterial.rgb;
    // Bauvorschau: halbdurchsichtig ganz in der Vorschaufarbe - rot, wenn
    // der Platz nicht geht.
    if (shape != 5 && aParams.y < 0.99) vColor = aColor;
  }
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

  if (shape == 10) {
    // Lebensbalken: dunkler Rahmen, gefuellt bis zum Anteil der Trefferpunkte,
    // Farbe von Gruen ueber Gelb nach Rot. vRoof traegt hier den Anteil,
    // vWorld die Lage im Balken (xy) und seine Hoehe in Pixeln (z).
    float health = vRoof;
    vec2 size = vec2(vParams.z, vWorld.z);
    vec2 px = vWorld.xy * size;
    float edge = min(min(px.x, size.x - px.x), min(px.y, size.y - px.y));
    float border = max(1.0, size.y * 0.2);
    vec3 fill = health > 0.5
        ? mix(vec3(0.95, 0.85, 0.2), vec3(0.3, 0.85, 0.35), (health - 0.5) * 2.0)
        : mix(vec3(0.9, 0.2, 0.15), vec3(0.95, 0.85, 0.2), health * 2.0);
    vec3 color = edge < border ? vec3(0.05) : vWorld.x <= health ? fill : vec3(0.12);
    fragColor = vec4(color, edge < border ? 0.9 : 1.0);
    return;
  }

  // Flächennormale aus den Bildschirm-Ableitungen - die Klötze sind eckig,
  // eine Normale je Fläche ist genau richtig und spart ein Attribut.
  vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(normal, TO_CAMERA) < 0.0) normal = -normal;

  vec3 base = vColor;
  if (vRoof > 0.5 && shape != 0 && shape < 5) {
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
 * Bewegliche Teile nach Objektname im Modell - die Nummern stehen so im
 * Shader (P_*). Alles andere steht still.
 */
const PARTS: [prefix: string, part: number][] = [
  ['Leg.L', 1],
  ['Leg.R', 2],
  ['Arm.L', 3],
  ['Arm.R', 4],
  ['Head', 5],
  ['Load', 6],
  ['Sails', 7],
  ['Cloth', 8],
];

/** Materialien, die zur Laufzeit gefärbt werden - aMaterial.w im Shader. */
const MATERIAL_ROLE: Record<string, number> = {
  Tunic: 1, // Instanzfarbe (Dorfbewohner)
  Paint: 1, // Instanzfarbe (Gebäude)
  Load: 2, // Farbe der getragenen Ressource
};

interface Model {
  /** Je Eckpunkt: x vorn, y links, z oben (Modell-Einheiten), Teil, r, g, b, Rolle. */
  vertices: Float32Array;
  hip: number;
  shoulder: number;
  loadAnchor: [number, number, number];
  /** Mitte der Flügel (links, oben). */
  hub: [number, number];
  /** Höchster Punkt in Modell-Einheiten - dort sitzt der Lebensbalken. */
  top: number;
}

/**
 * Baut ein Mesh aus einem OBJ, wie Blender es exportiert: Meter, Y oben,
 * Vorderseite nach +Z, links auf +X. Die Größe in der Datei spielt keine
 * Rolle: Figuren werden auf Körperhöhe 1 gebracht, Gebäude auf Breite 1 -
 * gemessen an den feststehenden Teilen, damit ausladende Flügel nicht
 * mitzählen. Der Boden liegt danach bei 0. Blender hängt beim Export manchmal
 * den Mesh-Namen an ("Leg.L_Cube.003"), darum zählt der Anfang des Namens.
 */
function loadModel(obj: string, mtl: string, unit: 'height' | 'width'): Model {
  const triangles = parseObj(obj);
  const colors = parseMtl(mtl);
  if (triangles.length === 0) throw new Error('Figuren-Modell ist leer');

  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of triangles) {
    for (const p of t.points) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
  }
  const partOf = (object: string) => PARTS.find(([prefix]) => object.startsWith(prefix))?.[1] ?? 0;

  let unitLength = maxY - minY;
  if (unit === 'width') {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const t of triangles) {
      if (partOf(t.object) !== 0) continue;
      for (const p of t.points) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
      }
    }
    unitLength = maxX - minX;
  }

  // Datei (x links, y oben, z vorn) -> Modell (x vorn, y links, z oben)
  const local = (p: [number, number, number]) =>
    [p[2] / unitLength, p[0] / unitLength, (p[1] - minY) / unitLength] as const;

  const v: number[] = [];
  let hip = 0;
  let shoulder = 0;
  const load = { back: -Infinity, y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  const sails = { y: [Infinity, -Infinity], z: [Infinity, -Infinity] };

  for (const t of triangles) {
    const part = partOf(t.object);
    const color = colors.get(t.material) ?? [0.6, 0.6, 0.6];
    const role = MATERIAL_ROLE[t.material] ?? 0;
    for (const p of t.points) {
      const [x, y, z] = local(p);
      v.push(x, y, z, part, color[0], color[1], color[2], role);
      // Hüfte und Schulter sitzen an der Oberkante von Beinen und Armen.
      if (part === 1 || part === 2) hip = Math.max(hip, z);
      if (part === 3 || part === 4) shoulder = Math.max(shoulder, z);
      if (part === 6) {
        // Die Last hängt mit ihrer Vorderseite am Rücken.
        load.back = Math.max(load.back, x);
        load.y = [Math.min(load.y[0], y), Math.max(load.y[1], y)];
        load.z = [Math.min(load.z[0], z), Math.max(load.z[1], z)];
      }
      if (part === 7) {
        sails.y = [Math.min(sails.y[0], y), Math.max(sails.y[1], y)];
        sails.z = [Math.min(sails.z[0], z), Math.max(sails.z[1], z)];
      }
    }
  }

  return {
    vertices: new Float32Array(v),
    hip,
    shoulder,
    loadAnchor: Number.isFinite(load.back)
      ? [load.back, (load.y[0] + load.y[1]) / 2, (load.z[0] + load.z[1]) / 2]
      : [0, 0, 0],
    hub: [(sails.y[0] + sails.y[1]) / 2, (sails.z[0] + sails.z[1]) / 2],
    top: (maxY - minY) / unitLength,
  };
}

/**
 * Formen, die aus Modell-Dateien kommen. `scale`: Tiles je Einheit der
 * Instanzgröße - eine Figur der Größe 0.55 ist 0.55 * 1.7 Tiles hoch.
 */
const MODELS: { shape: number; model: Model; scale: number }[] = [
  { shape: SHAPE.villager, model: loadModel(villagerObj, villagerMtl, 'height'), scale: 1.7 },
  { shape: SHAPE.mill, model: loadModel(millObj, millMtl, 'width'), scale: 1 },
  { shape: SHAPE.lumberCamp, model: loadModel(lumberCampObj, lumberCampMtl, 'width'), scale: 1 },
  { shape: SHAPE.house, model: loadModel(houseObj, houseMtl, 'width'), scale: 1 },
  { shape: SHAPE.townCenter, model: loadModel(townCenterObj, townCenterMtl, 'width'), scale: 1 },
  { shape: SHAPE.miningCamp, model: loadModel(miningCampObj, miningCampMtl, 'width'), scale: 1 },
  { shape: SHAPE.tree, model: loadModel(treeObj, treeMtl, 'width'), scale: 1 },
  { shape: SHAPE.stoneRock, model: loadModel(stoneObj, stoneMtl, 'width'), scale: 1 },
  { shape: SHAPE.goldRock, model: loadModel(goldObj, goldMtl, 'width'), scale: 1 },
  { shape: SHAPE.berryBush, model: loadModel(berryBushObj, berryBushMtl, 'width'), scale: 1 },
  // Nach Höhe gemessen: das Tuch bewegt sich und zählt nicht zur Breite,
  // der Mast allein wäre als Maßstab viel zu schmal.
  { shape: SHAPE.rallyFlag, model: loadModel(rallyFlagObj, rallyFlagMtl, 'height'), scale: 1 },
];

interface Mesh {
  vao: WebGLVertexArrayObject;
  vertices: number;
}

export class EntityRenderer {
  private program: WebGLProgram;
  private building: Mesh;
  private flat: Mesh;
  private models: { shape: number; model: Model; scale: number; mesh: Mesh; list: EntityInstance[] }[];
  private instanceBuffer: WebGLBuffer;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  /** Wird nur vergrößert, nie neu belegt - eine Allokation je Frame wäre Müll. */
  private data = new Float32Array(STRIDE * 256);
  /** Sortierpuffer, ebenfalls wiederverwendet. */
  private flats: EntityInstance[] = [];
  private solids: EntityInstance[] = [];

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
    this.models = MODELS.map((m) => ({ ...m, mesh: this.createMesh(m.model.vertices, 8), list: [] }));

    gl.useProgram(this.program);
    uploadTerrainParams(gl, (name) => this.location(name));
  }

  /** @param components Floats je Eckpunkt: 4 (aCorner) oder 8 (aCorner + aMaterial). */
  private createMesh(vertices: Float32Array, components = 4): Mesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, components * 4, 0);
    if (components === 8) {
      gl.enableVertexAttribArray(6);
      gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 32, 16);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    for (const loc of [1, 2, 3, 4, 5, 7]) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return { vao, vertices: vertices.length / components };
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
    gl.vertexAttribPointer(7, 1, gl.FLOAT, false, bytes, offset + 60);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.vertices, count);
  }

  /**
   * Zeichnet über ein bereits gezeichnetes Gelände - dessen Tiefenpuffer
   * verdeckt, was hinter Hügeln liegt.
   * @param minSizeTiles Mindestgröße, damit Gebäude beim Herauszoomen nicht verschwinden
   * @param pixelRatio Geräte-Pixel je CSS-Pixel - Lebensbalken haben feste CSS-Größe
   * @param healthBars Lebensbalken über allem mit `health` zeichnen
   */
  render(
      instances: EntityInstance[],
      camera: GpuCamera,
      minSizeTiles: number,
      pixelRatio = 1,
      healthBars = false,
  ) {
    if (instances.length === 0) return;
    const gl = this.gl;

    // Overlays zuerst, dann die Gebäude von hinten nach vorn - halbtransparente
    // Vorschau-Klötze mischen sich sonst mit dem falschen Hintergrund.
    const flats = this.flats;
    const solids = this.solids;
    flats.length = 0;
    solids.length = 0;
    for (const m of this.models) m.list.length = 0;
    for (const e of instances) {
      if (e.shape === SHAPE.flat) flats.push(e);
      else (this.models.find((m) => m.shape === e.shape)?.list ?? solids).push(e);
    }
    const backToFront = (a: EntityInstance, b: EntityInstance) => a.x + a.y - (b.x + b.y);
    solids.sort(backToFront);
    // Nur Halbdurchsichtiges braucht die Reihenfolge; Bäume und Felsen sind
    // undurchsichtig, der Tiefenpuffer reicht - und es sind Tausende.
    for (const m of this.models) {
      if (m.shape < FIRST_NATURAL || m.shape > LAST_NATURAL) m.list.sort(backToFront);
    }

    const bars = healthBars ? instances.filter((e) => e.health !== undefined) : [];
    const total = instances.length + bars.length;
    if (this.data.length < total * STRIDE) {
      this.data = new Float32Array(total * STRIDE * 2);
    }
    const d = this.data;
    let i = 0;
    for (const list of [flats, solids, ...this.models.map((m) => m.list)]) {
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
        d[o + 8] = m ? m[0] : BUILDING_HEADING;
        d[o + 9] = m ? m[1] : 0;
        d[o + 10] = m ? m[2] : 0;
        d[o + 11] = m ? m[3] : 0;
        const a = e.accent ?? e.color;
        d[o + 12] = a[0] / 255;
        d[o + 13] = a[1] / 255;
        d[o + 14] = a[2] / 255;
        d[o + 15] = e.ground ?? GROUND_UNKNOWN;
      }
    }
    for (const e of bars) {
      const o = i++ * STRIDE;
      this.writeBar(d, o, e, camera.pixelsPerTile, minSizeTiles, pixelRatio);
    }

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, total * STRIDE), gl.DYNAMIC_DRAW);

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

    gl.uniform1f(this.location('uTime'), performance.now() / 1000);
    let first = flats.length + solids.length;
    for (const m of this.models) {
      if (m.list.length > 0) {
        gl.uniform1f(this.location('uModelScale'), m.scale);
        gl.uniform1f(this.location('uHip'), m.model.hip);
        gl.uniform1f(this.location('uShoulder'), m.model.shoulder);
        gl.uniform3fv(this.location('uLoadAnchor'), m.model.loadAnchor);
        gl.uniform2fv(this.location('uHub'), m.model.hub);
        this.draw(m.mesh, first, m.list.length);
      }
      first += m.list.length;
    }

    // Lebensbalken zuletzt und ohne Tiefentest: sie liegen über allem, auch
    // wenn ein Hügel oder ein Gebäude davor steht.
    if (bars.length > 0) {
      gl.disable(gl.DEPTH_TEST);
      this.draw(this.flat, instances.length, bars.length);
      gl.enable(gl.DEPTH_TEST);
    }

    gl.disable(gl.BLEND);
    gl.depthFunc(gl.LESS);
    gl.bindVertexArray(null);
  }

  /** Ein Lebensbalken für Instanz `e`: verankert über ihrem höchsten Punkt. */
  private writeBar(
      d: Float32Array, o: number, e: EntityInstance,
      pixelsPerTile: number, minSizeTiles: number, pixelRatio: number,
  ) {
    const model = this.models.find((m) => m.shape === e.shape);
    const figure = e.shape === SHAPE.villager;
    // Dieselbe Mindestgröße wie im Vertex-Shader, sonst schwebt der Balken
    // herausgezoomt im Gebäude statt darüber.
    const size = Math.max(e.size, figure ? minSizeTiles * 0.5 : minSizeTiles);
    let top = model ? model.model.top * model.scale * size : (BOX_TOP[e.shape] ?? 1) * size;
    // Ein liegender Baum ist flach - der Balken gehört knapp darüber.
    if (e.shape === SHAPE.tree && e.motion && e.motion[1] > 0.5) top = 0.3 * size;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const width = figure
      ? clamp(pixelsPerTile * 0.6, 22 * pixelRatio, 36 * pixelRatio)
      : clamp(size * pixelsPerTile * 0.8, 40 * pixelRatio, 110 * pixelRatio);
    const height = (figure ? 4 : 6) * pixelRatio;

    d.fill(0, o, o + STRIDE);
    d[o] = e.x;
    d[o + 1] = e.y;
    d[o + 5] = SHAPE.healthBar;
    d[o + 6] = 1;
    d[o + 7] = width;
    d[o + 8] = Math.max(0, Math.min(1, e.health ?? 1));
    d[o + 9] = top;
    d[o + 10] = height;
    d[o + 11] = 5 * pixelRatio;
  }
}
