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
import { PROJECT_GLSL, cameraDirection, setCameraUniforms, type GpuCamera } from './iso';
import { uploadTerrainParams } from './terrainRenderer';
import { TERRAIN_COMMON } from './terrainShader';
import { FLATTEN_GLSL, MAX_FLAT_ZONES } from '../world/flatten';
import { parseMtl, parseObj, type ObjTriangle } from './obj';
import villagerMaleObj from '../models/villager_male.obj?raw';
import villagerFemaleObj from '../models/villager_female.obj?raw';
import villagerMtl from '../models/villager.mtl?raw';
import millObj from '../models/mill.obj?raw';
import millMtl from '../models/mill.mtl?raw';
import mill2Obj from '../models/mill_2.obj?raw';
import mill2Mtl from '../models/mill_2.mtl?raw';
import mill3Obj from '../models/mill_3.obj?raw';
import mill3Mtl from '../models/mill_3.mtl?raw';
import mill4Obj from '../models/mill_4.obj?raw';
import mill4Mtl from '../models/mill_4.mtl?raw';
import lumberCampObj from '../models/lumber_camp.obj?raw';
import lumberCampMtl from '../models/lumber_camp.mtl?raw';
import lumberCamp2Obj from '../models/lumber_camp_2.obj?raw';
import lumberCamp2Mtl from '../models/lumber_camp_2.mtl?raw';
import lumberCamp3Obj from '../models/lumber_camp_3.obj?raw';
import lumberCamp3Mtl from '../models/lumber_camp_3.mtl?raw';
import lumberCamp4Obj from '../models/lumber_camp_4.obj?raw';
import lumberCamp4Mtl from '../models/lumber_camp_4.mtl?raw';
import houseObj from '../models/house.obj?raw';
import houseMtl from '../models/house.mtl?raw';
import house2Obj from '../models/house_2.obj?raw';
import house2Mtl from '../models/house_2.mtl?raw';
import house3Obj from '../models/house_3.obj?raw';
import house3Mtl from '../models/house_3.mtl?raw';
import house4Obj from '../models/house_4.obj?raw';
import house4Mtl from '../models/house_4.mtl?raw';
import townCenterObj from '../models/town_center.obj?raw';
import townCenterMtl from '../models/town_center.mtl?raw';
import miningCampObj from '../models/mining_camp.obj?raw';
import miningCampMtl from '../models/mining_camp.mtl?raw';
import treeSpruceObj from '../models/tree_spruce.obj?raw';
import treeSpruceMtl from '../models/tree_spruce.mtl?raw';
import treePineObj from '../models/tree_pine.obj?raw';
import treePineMtl from '../models/tree_pine.mtl?raw';
import treeOakObj from '../models/tree_oak.obj?raw';
import treeOakMtl from '../models/tree_oak.mtl?raw';
import treeBirchObj from '../models/tree_birch.obj?raw';
import treeBirchMtl from '../models/tree_birch.mtl?raw';
import treePoplarObj from '../models/tree_poplar.obj?raw';
import treePoplarMtl from '../models/tree_poplar.mtl?raw';
import treeMapleObj from '../models/tree_maple.obj?raw';
import treeMapleMtl from '../models/tree_maple.mtl?raw';
import treeOakOldObj from '../models/tree_oak_old.obj?raw';
import treeOakOldMtl from '../models/tree_oak_old.mtl?raw';
import treeOakYoungObj from '../models/tree_oak_young.obj?raw';
import treeOakYoungMtl from '../models/tree_oak_young.mtl?raw';
import stone1Obj from '../models/stone_1.obj?raw';
import stone1Mtl from '../models/stone_1.mtl?raw';
import stone2Obj from '../models/stone_2.obj?raw';
import stone2Mtl from '../models/stone_2.mtl?raw';
import stone3Obj from '../models/stone_3.obj?raw';
import stone3Mtl from '../models/stone_3.mtl?raw';
import gold1Obj from '../models/gold_1.obj?raw';
import gold1Mtl from '../models/gold_1.mtl?raw';
import gold2Obj from '../models/gold_2.obj?raw';
import gold2Mtl from '../models/gold_2.mtl?raw';
import gold3Obj from '../models/gold_3.obj?raw';
import gold3Mtl from '../models/gold_3.mtl?raw';
import berryBush1Obj from '../models/berry_bush_1.obj?raw';
import berryBush1Mtl from '../models/berry_bush_1.mtl?raw';
import berryBush2Obj from '../models/berry_bush_2.obj?raw';
import berryBush2Mtl from '../models/berry_bush_2.mtl?raw';
import berryBush3Obj from '../models/berry_bush_3.obj?raw';
import berryBush3Mtl from '../models/berry_bush_3.mtl?raw';
import berryBush4Obj from '../models/berry_bush_4.obj?raw';
import berryBush4Mtl from '../models/berry_bush_4.mtl?raw';
import { FARM_KINDS, farmModel } from '../../tools/models/farmsGen.mjs';
import deerObj from '../models/deer.obj?raw';
import deerMtl from '../models/deer.mtl?raw';
import hareObj from '../models/hare.obj?raw';
import hareMtl from '../models/hare.mtl?raw';
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
  /** Mensch mit Armen und Beinen, läuft und arbeitet - Dorfbewohner (models/villager_male.obj). */
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
  /** Fichte auf Holz-Tiles (models/tree_spruce.obj) - weitere Bäume ab 22. */
  tree: 12,
  /** Felsbrocken auf Stein-Tiles (models/stone_1.obj) - weitere ab 29. */
  stoneRock: 13,
  /** Erzfels mit Goldadern und Nuggets (models/gold_1.obj) - weitere ab 31. */
  goldRock: 14,
  /** Johannisbeerstrauch (models/berry_bush_1.obj) - weitere Sträucher ab 19. */
  berryBush: 15,
  /** Fahne am Sammelpunkt eines Gebäudes (models/rally_flag.obj). */
  rallyFlag: 16,
  /**
   * Staubwolke: runder, weicher Fleck, der zur Kamera zeigt - verankert in
   * der Welt (motion[0] = Höhe über Grund), Größe in Tiles.
   */
  dust: 17,
  /** Wie `villager`, als Frau (models/villager_female.obj). */
  villagerFemale: 18,
  /** Brombeere mit Ranken (models/berry_bush_2.obj). */
  berryBush2: 19,
  /** Heidelbeeren, mehrere kleine Büsche (models/berry_bush_3.obj). */
  berryBush3: 20,
  /** Hoher Himbeerstrauch (models/berry_bush_4.obj). */
  berryBush4: 21,
  /** Kiefer mit hohem, rötlichem Stamm (models/tree_pine.obj). */
  treePine: 22,
  /** Eiche mit breiter Krone (models/tree_oak.obj). */
  treeOak: 23,
  /** Birke mit zwei weißen Stämmen (models/tree_birch.obj). */
  treeBirch: 24,
  /** Schmale, hohe Pappel (models/tree_poplar.obj). */
  treePoplar: 25,
  /** Ahorn mit runder, dichter Krone (models/tree_maple.obj). */
  treeMaple: 26,
  /** Alte Eiche: knorriger Stamm mit Höhle, weit ausladend (models/tree_oak_old.obj). */
  treeOakOld: 27,
  /** Junge Eiche mit schlankem Stamm (models/tree_oak_young.obj). */
  treeOakYoung: 28,
  /** Flacher Haufen Felsbrocken (models/stone_2.obj). */
  stoneRock2: 29,
  /** Zwei hohe, gespaltene Felsen (models/stone_3.obj). */
  stoneRock3: 30,
  /** Erzhaufen mit Goldadern (models/gold_2.obj). */
  goldRock2: 31,
  /** Hoher Erzfels mit Goldadern (models/gold_3.obj). */
  goldRock3: 32,
  /** Auswahlring unter einer Figur: flach aufs Gelände gelegt wie `flat`. */
  ring: 33,
  /** Weitere Häuser (models/house_2..4.obj) - je Bauplatz fest eines davon. */
  house2: 34,
  house3: 35,
  house4: 36,
  /** Weitere Mühlen (models/mill_2..4.obj) - je Bauplatz fest eine davon. */
  mill2: 37,
  mill3: 38,
  mill4: 39,
  /** Weitere Holzlager (models/lumber_camp_2..4.obj) - je Bauplatz fest eines davon. */
  lumberCamp2: 40,
  lumberCamp3: 41,
  lumberCamp4: 42,
  /**
   * Felder, 3x3 Tiles (tools/models/farmsGen.mjs). Je Furche eine eigene
   * Form - die hier, plus Furche 0..8 - und eine Instanz: motion = [Furche,
   * Stand, verbleibender Ertrag 0..1, Tiles] - siehe P_CROP im Shader.
   */
  farmWheat: 50,
  farmCorn: 59,
  /**
   * Wild zum Jagen (models/deer.obj, hare.obj): motion = [Blickrichtung,
   * Phase, Pose (ANIMAL_POSE), 0] - siehe "beast" im Shader.
   */
  deer: 90,
  hare: 91,
} as const;

/** Mittlere Drehzahl der Mühlenflügel in Radiant je Sekunde. */
const SAIL_SPEED = 0.8;
/** Böen: so weit (Radiant) eilen die Flügel vor oder zurück, und so schnell wechselt es. */
const GUST_AMOUNT = 0.6;
const GUST_RATE = 0.35;

/**
 * Drehung einer Mühle für `motion`: [Blickrichtung, Startstellung, Drehzahl, 0].
 * Jede Mühle dreht so in ihrem eigenen Takt, dazu mit Böen, die sie mal
 * schneller, mal langsamer drehen lassen (siehe Shader, P_SAILS).
 */
/**
 * Wie millMotion, aber die Flügel stehen still - in der Stellung, die sie
 * zur Zeit `t` (Sekunden, wie uTime im Shader) hatten. Für eingestürzte Mühlen.
 */
export function frozenMillMotion(x: number, y: number, t: number): [number, number, number, number] {
  const [heading, phase, speed] = millMotion(x, y);
  const angle = t * SAIL_SPEED * speed + phase + GUST_AMOUNT * Math.sin(t * GUST_RATE * speed + phase * 3.1);
  return [heading, angle, -1, 0];
}

export function millMotion(x: number, y: number): [number, number, number, number] {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  return [BUILDING_HEADING, r * Math.PI * 2, 0.8 + 0.4 * ((r * 7.13) % 1), 0];
}

const SHAPE_RING = SHAPE.ring;

/** Figuren: verdeckt zeigen sie ihren Umriss. */
const FIGURES: number[] = [SHAPE.villager, SHAPE.villagerFemale];

/** Alle Bäume - sie werden gefällt und kippen um. */
export const TREES: number[] = [
  SHAPE.tree, SHAPE.treePine, SHAPE.treeOak, SHAPE.treeBirch, SHAPE.treePoplar, SHAPE.treeMaple,
  SHAPE.treeOakOld, SHAPE.treeOakYoung,
];

/** Diese Formen sind Vorkommen, keine Gebäude oder Figuren. */
export const NATURAL: number[] = [
  ...TREES,
  SHAPE.stoneRock, SHAPE.stoneRock2, SHAPE.stoneRock3, SHAPE.goldRock, SHAPE.goldRock2, SHAPE.goldRock3,
  SHAPE.berryBush, SHAPE.berryBush2, SHAPE.berryBush3, SHAPE.berryBush4,
];

/** Gebäude schauen schräg zur Kamera (die steht bei +x +y). */
export const BUILDING_HEADING = 0.5;

/** Wo die Pflanzen ansetzen, in Metern (SOIL in tools/models/farmsGen.mjs). */
const FIELD_SOIL_METERS = '0.02';

/** Furchen je Feld (FIELD_ROWS in world/buildings.ts, ROWS in farmsGen.mjs). */
const FIELD_FURROWS = 9;
const FIELD_BASES = [SHAPE.farmWheat, SHAPE.farmCorn];

/** Alle Formen der Felder - sie liegen genau auf ihren Tiles, schräg ragten die Ecken hinaus. */
export const FIELDS: number[] = FIELD_BASES.flatMap((base) => Array.from({ length: FIELD_FURROWS }, (_, row) => base + row));

/** Blickrichtung eines Gebäudemodells. */
export function buildingHeading(shape: number): number {
  return FIELDS.includes(shape) ? 0 : BUILDING_HEADING;
}

/**
 * Uhr für alles, was sich von selbst bewegt (Mühlenflügel, Fahnen). Sie steht,
 * solange das Spiel angehalten ist, und läuft mit der Spielgeschwindigkeit -
 * Hauptansicht und Minimap teilen sie.
 */
let animationClock = 0;
let animationLast = performance.now() / 1000;
let animationPaused = false;
let animationSpeed = 1;

export function setAnimationsPaused(paused: boolean) {
  animationPaused = paused;
}

/** Spielgeschwindigkeit: 1 = normal, 2 = doppelt so schnell. */
export function setAnimationSpeed(speed: number) {
  animationSpeed = speed;
}

function animationTime(): number {
  const now = performance.now() / 1000;
  if (!animationPaused) animationClock += (now - animationLast) * animationSpeed;
  animationLast = now;
  return animationClock;
}

/**
 * Winkel eines umgefallenen Baums auf ebenem Boden: nicht ganz flach - Äste
 * und Stumpf halten den Stamm etwas hoch. Am Hang kippt der Shader um das
 * Gefälle weiter oder weniger weit (siehe "falling").
 */
export const FALL_LYING = Math.PI / 2 - 0.1;

/** Was ein Tier gerade tut - steuert seine Animation (motion[2]). */
export const ANIMAL_POSE = {
  /** Steht und äst, hebt ab und zu den Kopf. */
  graze: 0,
  walk: 1,
  /** Flucht: weite Sprünge. */
  flee: 5,
  /** Erlegt: liegt auf der Seite. */
  dead: 6,
} as const;

/** Was eine Figur gerade tut - steuert die Animation. */
export const POSE = {
  stand: 0,
  walk: 1,
  work: 2,
  /** Kniend Beeren pflücken - ohne Beil. */
  pick: 3,
  /** Mit der Sense mähen: der Oberkörper schwingt die Sense flach über den Boden. */
  scythe: 4,
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
${FLATTEN_GLSL}

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
uniform float uKnee;
uniform float uElbow;
uniform float uStride;   // Schrittweite: 1 = voller Schritt, kleiner im langen Rock
uniform vec3  uLoadAnchor;   // Befestigung der Last am Ruecken
// Modelle: Groesse je Tile der Instanzgroesse, Nabe der Fluegel (links, oben)
// und die Zeit fuer alles, was sich von selbst bewegt.
uniform float uModelScale;
uniform float uModelTop;     // Höhe des Modells in Modell-Einheiten (Bäume: Absägen)
uniform float uStump;        // Bäume: Höhe des Stumpfs in Modell-Einheiten
uniform float uStumpRadius;  // Bäume: Halbmesser des Stumpfs in Modell-Einheiten
uniform vec2  uLegs;         // Tiere: Gelenk (vorn) der Vorder- und Hinterbeine
uniform vec2  uNeck;         // Tiere: Gelenk des Halses (vorn, oben)
uniform float uSide;         // Tiere: halbe Breite des Körpers - so liegt es tot auf der Seite
// Bäume: diese Ecke liegt auf der Schnittfläche eines abgesägten Stamms.
float gSawn = 0.0;
// Feldpflanzen: 1 = frisch gesät und grün, 0 = reif in ihrer eigenen Farbe.
float gUnripe = 0.0;
uniform vec2  uHub;
uniform float uTime;

out vec3 vWorld;
out vec3 vColor;
flat out vec3 vParams;
flat out vec3 vTeam;     // Instanzfarbe (Spielerfarbe) - für den Umriss verdeckter Figuren
// Bäume: welche Textur (0 keine, 3 Rinde, 4 Birkenrinde, 5 Schnittfläche)
// und die Lage im Modell in Metern - die Textur haftet am Stamm, auch wenn
// er umfällt.
flat out int vTex;
out vec3 vLocal;
uniform float uMeters;       // Breite des Modells in Metern (Modell-Einheit)
uniform vec3  uPlayerColor;  // Spielerfarbe - für Felder, deren aColor das Gefälle trägt
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
const int P_SHIN_L = 9;
const int P_SHIN_R = 10;
const int P_FOREARM_L = 11;
const int P_FOREARM_R = 12;
const int P_TOOL = 13;       // Beil in der rechten Hand, schwingt mit dem Unterarm
const int P_SCYTHE = 23;     // Sense in der rechten Hand - nur beim Mähen zu sehen
// Beere am Strauch. aCorner.w = 14 + Zufall * 0.45 je Beere: sie ist zu
// sehen, solange der Rest des Vorkommens (aMotion.w) über dem Zufall liegt.
const int P_BERRY = 14;
// Baum außer dem Stamm (Laub, Äste, Zapfen, Wurzeln). aCorner.w = 15 + Höhe
// des Teils (0..1 der Baumhöhe) * 0.45 - beim Absägen verschwindet es ganz,
// sobald der Schnitt darunter liegt.
const int P_CROWN = 15;
// Bäume: der Stumpf bleibt beim Fällen stehen (16), sein Deckel wird dabei zur
// hellen Schnittfläche (17), ebenso der Boden des Stamms (18).
const int P_STUMP = 16;
const int P_STUMP_TOP = 17;
const int P_LOG_END = 18;
const int P_TRUNK = 19;
// Felder: Pflanze (20) und Stück gepflügter Erde (21). aCorner.w = Teil +
// Furche * 0.04 + Lage in der Furche (0..1) * 0.039. Gezeichnet wird je Furche
// eine Instanz: aMotion.x = Furche (< 0: alle, Bauvorschau), aMotion.y = Stand
// (0..1 gepflügt, 1..2 gesät, 2..3 gewachsen), aMotion.z = Rest der Ernte,
// aMotion.w = welche der 3x3 Tiles zum Feld gehören (Bit x * 3 + y), dazu
// ab Bit 9 die Tiles ringsum, auf denen ein anderes Feld liegt; die der 3x3
// mit einem anderen Feld kommen als Bits in aAccent.r (* 255).
const int P_CROP = 20;
const int P_SOIL = 21;
// Schnur mit Pflöcken an einer Kante eines Tiles: aCorner.w = 22 + Tile * 0.04
// + Seite * 0.009 (0/1: Tile davor/dahinter entlang x, 2/3: entlang y).
const int P_EDGE = 22;


// Dreht p in der Ebene aus Blickrichtung (x) und Höhe (z) um ein Gelenk an
// (vorn, oben) = pivot - positiv schwingt, was unter dem Gelenk hängt, nach vorn.
vec3 swingAt(vec3 p, vec2 pivot, float angle) {
  vec2 q = vec2(p.x - pivot.x, p.z - pivot.y);
  float c = cos(angle);
  float s = sin(angle);
  return vec3(pivot.x + q.x * c - q.y * s, p.y, pivot.y + q.x * s + q.y * c);
}

// Dreht p in der Ebene aus Blickrichtung (x) und Hoehe (z) um ein Gelenk -
// so schwingen Arme und Beine nach vorn und hinten.
vec3 swingAround(vec3 p, float pivot, float angle) {
  vec2 q = vec2(p.x, p.z - pivot);
  float c = cos(angle);
  float s = sin(angle);
  return vec3(q.x * c - q.y * s, p.y, q.x * s + q.y * c + pivot);
}

// Abtastschritt wie beim Geländegitter (TerrainRenderer.gridCell) - sonst
// fehlen hier die Feinwellen, die das Gelände nah herangezoomt hat.
uniform float uGroundStep;

float groundZ(vec2 world) {
  return uReliefScale > 0.0
      ? flattenZ(world, reliefZ(elevation(world * uMapScale, uGroundStep)) * uReliefScale)
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

  if (shape >= 5 && shape != 17 && shape != ${SHAPE_RING}) {  // 10 (Lebensbalken) ist oben schon abgefangen
    // Modell aus einer OBJ-Datei. Eckpunkte in Modell-Einheiten: x nach vorn,
    // y nach links, z nach oben, Boden bei 0. Figuren sind auf Koerperhoehe 1
    // gebracht, Gebaeude auf Breite 1 (siehe loadModel()).
    bool figure = shape == 5 || shape == 18;
    bool beast = shape == ${SHAPE.deer} || shape == ${SHAPE.hare};
    bool natural = ${NATURAL.map((n) => `shape == ${n}`).join(' || ')};
    bool field = shape >= ${SHAPE.farmWheat} && shape < ${SHAPE.farmCorn + FIELD_FURROWS};
    // Mindestgröße nur für Gebäude und Figuren: Bäume auf Mindestgröße
    // aufgeblasen würden herausgezoomt jeden Wald zu einem Brei machen.
    float size = natural ? aParams.z
        : figure ? max(aParams.z, uMinSizeTiles * 0.5)
        : beast ? max(aParams.z, uMinSizeTiles * 0.3) : max(aParams.z, uMinSizeTiles);
    float scale = size * uModelScale;
    int part = int(aCorner.w + 0.5);
    vec3 p = aCorner.xyz;

    if (figure) {
      float phase = aMotion.y;
      int pose = int(aMotion.z + 0.5);
      bool legL = part == P_LEG_L || part == P_SHIN_L;
      bool legR = part == P_LEG_R || part == P_SHIN_R;
      bool armL = part == P_ARM_L || part == P_FOREARM_L;
      bool armR = part == P_ARM_R || part == P_FOREARM_R || part == P_TOOL || part == P_SCYTHE;
      // Oberkörper: alles über der Hüfte, was kein Bein ist - er neigt und
      // dreht sich über der Hüfte, Arme und Kopf gehen mit.
      bool upper = !legL && !legR && (part != P_TORSO || p.z > uHip);
      // Winkel je Gelenk: positiv schwingt nach vorn. Knie beugen nach
      // hinten (negativ), Ellbogen nach vorn (positiv).
      float hipL = 0.0, hipR = 0.0, kneeL = -0.05, kneeR = -0.05;
      float shL = -0.05, shR = -0.05, elL = 0.15, elR = 0.15;
      float lean = 0.0, twist = 0.0, sway = 0.0, bob = 0.0;

      if (pose == 1) {
        // Gehen: Beine gegengleich, das Knie des nach vorn schwingenden Beins
        // hebt den Fuß an, Arme pendeln gegen die Beine mit lockerem Ellbogen,
        // Schultern drehen gegen die Hüfte, der Körper wippt und neigt sich
        // leicht in die Laufrichtung.
        float s = sin(phase);
        float c = cos(phase);
        hipL = s * 0.55 * uStride;
        hipR = -s * 0.55 * uStride;
        kneeL = -0.1 - 0.95 * max(c, 0.0);
        kneeR = -0.1 - 0.95 * max(-c, 0.0);
        shL = -s * 0.5;
        shR = s * 0.5;
        elL = 0.3 + 0.45 * max(shL, 0.0);
        elR = 0.3 + 0.45 * max(shR, 0.0);
        twist = s * 0.12;
        lean = 0.07;
        sway = s * 0.012;
        bob = abs(c) * 0.03;
      } else if (pose == 2) {
        // Arbeiten: breiter Stand mit gebeugten Knien, der rechte Arm holt
        // mit angewinkeltem Ellbogen aus und schlägt mit gestrecktem Arm zu,
        // der Oberkörper beugt sich beim Schlag vor. Axt, Spitzhacke oder
        // Pflücken sehen auf diese Größe gleich aus.
        float up = 0.5 + 0.5 * sin(phase);
        hipL = 0.25;
        hipR = -0.15;
        kneeL = -0.35;
        kneeR = -0.3;
        shR = 0.6 + 1.9 * up;
        elR = 0.15 + 0.9 * up;
        shL = 0.7 + 0.2 * up;
        elL = 0.6;
        lean = 0.12 + 0.18 * (1.0 - up);
        twist = -0.15 + 0.3 * up;
        bob = -0.03;
      } else if (pose == 3) {
        // Pflücken: auf dem rechten Knie, das linke Bein aufgestellt, der
        // Oberkörper zum Strauch gebeugt. Die rechte Hand greift in den
        // Strauch und zieht zurück, die linke hält einen Zweig fest. Die
        // Hüfte sinkt so weit, dass das rechte Knie den Boden berührt.
        float t = phase * 0.6;
        float reach = 0.5 + 0.5 * sin(t);
        hipL = 1.95;
        kneeL = -1.95;
        hipR = -0.05;
        kneeR = -1.5;
        // Gestreckt in den Strauch (reach = 1), dann die Hand zur Brust.
        shR = 0.3 + 0.85 * reach;
        elR = 1.95 - 1.85 * reach;
        shL = 1.05 + 0.08 * sin(t * 0.5);
        elL = 0.75;
        lean = 0.32 + 0.08 * reach;
        twist = -0.1 + 0.12 * reach;
        bob = -(uKnee - 0.04);
      } else if (pose == 4) {
        // Mähen: breit und leicht gebeugt, vorgeneigt; die rechte Hand am
        // Stiel, die linke vorn am Griff. Der Oberkörper dreht hin und her
        // und zieht die Sense flach über den Boden von rechts nach links.
        float t = phase * 0.6;
        float sweep = sin(t);
        hipL = 0.3;
        hipR = -0.2;
        kneeL = -0.4;
        kneeR = -0.3;
        shR = 0.05 + 0.05 * sweep;
        elR = 0.08;
        shL = 0.85;
        elL = 0.7;
        lean = 0.16;
        twist = sweep * 0.55;
        bob = -0.035;
      } else {
        // Stehen: nie ganz still. Phase = Sekunden, je Figur versetzt, damit
        // eine Gruppe nicht im Gleichtakt atmet.
        float t = phase;
        // Atmen: Oberkörper hebt und senkt sich.
        if (p.z > uHip) p.z += sin(t * 1.7) * 0.008 * (p.z - uHip) / (1.0 - uHip);
        // Arme hängen locker und pendeln leicht gegeneinander, die Ellbogen
        // federn mit.
        shL = sin(t * 0.9) * 0.08 - 0.05;
        shR = sin(t * 0.9 + 1.3) * 0.08 - 0.05;
        elL = 0.18 + sin(t * 0.9) * 0.06;
        elR = 0.18 + sin(t * 0.9 + 1.3) * 0.06;
        // Umschauen: der Kopf dreht sich ab und zu nach links oder rechts,
        // bleibt dort kurz und kommt zurück.
        if (part == P_HEAD) {
          float yaw = 0.6 * clamp(sin(t * 0.37) * 2.5 - sign(sin(t * 0.37)) * 1.2, -1.0, 1.0);
          float c = cos(yaw);
          float s = sin(yaw);
          p.xy = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
        }
        // Gewicht verlagern: der ganze Körper neigt sich leicht zur Seite,
        // das entlastete Knie knickt ein wenig ein.
        float shift = sin(t * 0.55);
        p.y += shift * 0.02 * p.z;
        kneeL = -0.05 - 0.12 * max(shift, 0.0);
        kneeR = -0.05 - 0.12 * max(-shift, 0.0);
        twist = sin(t * 0.3) * 0.04;
      }

      // Erst das untere Glied am Knie bzw. Ellbogen, dann das ganze Glied an
      // Hüfte bzw. Schulter.
      if (part == P_SHIN_L) p = swingAround(p, uKnee, kneeL);
      if (part == P_SHIN_R) p = swingAround(p, uKnee, kneeR);
      if (part == P_FOREARM_L) p = swingAround(p, uElbow, elL);
      if (part == P_FOREARM_R || part == P_TOOL || part == P_SCYTHE) p = swingAround(p, uElbow, elR);
      // Beim Pflücken ist das Beil weggesteckt: alle Ecken auf einen Punkt,
      // die Dreiecke haben dann keine Fläche mehr.
      if (part == P_TOOL && (pose == 3 || pose == 4)) p = vec3(0.0, 0.0, uHip);
      // Die Sense nur beim Mähen - sonst trägt er das Beil.
      if (part == P_SCYTHE && pose != 4) p = vec3(0.0, 0.0, uHip);
      if (legL) p = swingAround(p, uHip, hipL);
      if (legR) p = swingAround(p, uHip, hipR);
      if (armL) p = swingAround(p, uShoulder, shL);
      if (armR) p = swingAround(p, uShoulder, shR);
      // Die Last waechst mit der Ladung aus dem Ruecken heraus.
      if (part == P_LOAD) p = uLoadAnchor + (p - uLoadAnchor) * aMotion.w;
      if (upper) {
        // Schultern gegen die Hüfte drehen, dann über der Hüfte vorneigen.
        float c = cos(twist);
        float s = sin(twist);
        p.xy = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
        p = swingAround(p, uHip, -lean);
      } else if (part == P_TORSO) {
        // Rock und Hosenboden schwingen beim Gehen etwas mit.
        p.y += twist * 0.25 * (uHip - p.z);
        if (pose == 3) {
          // Kniend: der Rock staucht sich bis zum Boden und legt sich vorn
          // über das aufgestellte Knie.
          float below = (uHip - p.z) / uHip;
          p.z = uHip - (uHip - p.z) * (uHip + bob) / (uHip - 0.02);
          p.x += below * 0.14;
        }
      }
      p.y += sway;
      p.z += bob;
    }

    if (beast) {
      // Tiere: Beine schwingen um ihr oberes Gelenk, der Kopf samt Hals nickt
      // um den Halsansatz. Rehe gehen im Kreuzgang und springen auf der
      // Flucht, Hasen hoppeln - Vorder- und Hinterbeine jeweils zusammen.
      float phase = aMotion.y;
      int pose = int(aMotion.z + 0.5);
      bool hare = shape == ${SHAPE.hare};
      bool front = part == 24 || part == 25;
      bool leg = part >= 24 && part <= 27;
      vec2 pivot = vec2(front ? uLegs.x : uLegs.y, uHip);
      float bob = 0.0;
      float dip = 0.0;
      if (pose == 1 || pose == 5) {
        float amp = pose == 5 ? 0.8 : 0.45;
        float s = sin(phase);
        float a = 0.0;
        if (hare || pose == 5) {
          // Hoppeln bzw. Springen: vorn und hinten gegengleich, der Körper hebt ab.
          a = (front ? s : -s) * amp;
          bob = max(0.0, sin(phase + 1.2)) * (hare ? 0.25 : 0.1);
        } else {
          // Kreuzgang: links vorn mit rechts hinten.
          a = (part == 24 || part == 27 ? s : -s) * amp;
          bob = abs(cos(phase)) * 0.015;
        }
        if (leg) p = swingAt(p, pivot, a);
        dip = pose == 5 ? 0.15 : -0.1;
      } else if (pose == 0) {
        // Äsen: meist mit dem Kopf unten, ab und zu schaut es auf.
        float up = smoothstep(0.6, 0.9, sin(phase * 0.21 + 1.0));
        // Weit genug, dass das Maul ans Gras kommt.
        dip = mix(1.45, 0.0, up) + sin(phase * 2.3) * 0.05 * (1.0 - up);
      }
      if (part == P_HEAD) p = swingAt(p, uNeck, -dip);
      p.z += bob;
      if (pose == 6) {
        // Erlegt: auf die Seite gekippt, die Beine zeigen zur Seite.
        p = vec3(p.x, -p.z, p.y + uSide);
      }
    }

    if (${TREES.map((n) => `shape == ${n}`).join(' || ')}) {
      // Holz wird verbraucht: der (gefällte) Baum wird von der Spitze her
      // abgesägt, statt zu schrumpfen - erst die Krone, dann der Stamm. Was
      // über dem Schnitt liegt, wird auf die Schnitthöhe gedrückt und bildet
      // die Schnittfläche. Ganz leer bleibt ein Stumpf stehen.
      float cut = mix(uStump, uModelTop, aMotion.w);
      // Gefällt (oder schon angesägt): die Schnittflächen sind hell.
      bool felled = aMotion.y > 0.0 || aMotion.w < 0.999;
      if (felled && (part == P_STUMP_TOP || part == P_LOG_END)) gSawn = 1.0;
      if (part == P_STUMP || part == P_STUMP_TOP) {
        // Der Stumpf bleibt, wie er ist.
      } else if (part == P_CROWN) {
        // Laub, Äste, Zapfen: weg, sobald der Schnitt unter ihrem Ansatz liegt.
        float from = (aCorner.w - 15.0) / 0.45 * uModelTop;
        if (from > cut) p = vec3(0.0);
      } else if (part == P_TRUNK && (aCorner.w - 19.0) / 0.45 * uModelTop > cut) {
        // Stammstück ganz über dem Schnitt: weg. Flach gedrückt ergäbe ein
        // schräger Stamm eine lange Platte auf dem Stumpf.
        p = vec3(0.0);
      } else if (p.z > cut) {
        // Das Stück, durch das gerade gesägt wird: auf die Schnitthöhe
        // gedrückt - die Schnittfläche, hell wie frisch gesägtes Holz.
        p.z = cut;
        gSawn = 1.0;
      }
    }

    if (part == P_BERRY) {
      // Abgeerntet: die Beeren verschwinden eine nach der anderen, der Strauch
      // bleibt stehen. Alle Ecken einer Beere auf einen Punkt - unsichtbar.
      float keep = (aCorner.w - 14.0) / 0.45;
      if (keep >= aMotion.w) p = vec3(0.0);
    }

    if (field) {
      int row = int(floor(aMotion.x + 0.5));
      float stage = aMotion.y;
      int tiles = int(aMotion.w + 0.5);
      bool hide = false;
      if (part == P_CROP || part == P_SOIL) {
        float v = aCorner.w - float(part);
        int own = int(floor(v / 0.04 + 0.001));
        float q = (v - float(own) * 0.04) / 0.039;
        // Drei Furchen und drei Stücke je Tile - so liegt jedes Teil in genau einem.
        int bit = (own / 3) * 3 + min(int(floor(q * 3.0 + 0.001)), 2);
        hide = (row >= 0 && own != row) || ((tiles >> bit) & 1) == 0;
        if (part == P_SOIL) {
          // Erde erscheint, wo schon gepflügt ist.
          hide = hide || (stage < 1.0 && q >= stage - 0.001);
        } else {
          // Pflanzen: gesät bis q, noch nicht geerntet ab dem Rest; sie
          // wachsen aus der Erde heraus und reifen von Grün zur eigenen Farbe.
          // Mit etwas Spielraum: q kommt gerundet aus aCorner.w zurück, die
          // erste Pflanze eines Tiles bliebe sonst abgeerntet stehen.
          hide = hide || stage < 1.0 || (stage < 2.0 && q >= stage - 1.004) || q >= aMotion.z - 0.004;
          float grown = clamp(stage - 2.0, 0.0, 1.0);
          float soil = ${FIELD_SOIL_METERS} / uMeters;
          p.z = soil + (p.z - soil) * mix(0.15, 1.0, grown);
          gUnripe = 1.0 - smoothstep(0.5, 1.0, grown);
        }
      } else if (part == P_EDGE) {
        // Abgesteckt: nur die Kanten am Umriss des Felds - das Tile gehört
        // dazu, sein Nachbar auf dieser Seite nicht.
        float v = aCorner.w - 22.0;
        int cell = int(floor(v / 0.04 + 0.001));
        int side = int(floor((v - float(cell) * 0.04) / 0.009 + 0.5));
        int ci = cell / 3;
        int cj = cell - ci * 3;
        int ni = ci + (side == 0 ? -1 : side == 1 ? 1 : 0);
        int nj = cj + (side == 2 ? -1 : side == 3 ? 1 : 0);
        // Außerhalb der 3x3: Bit 9 + Seite * 3 + Lage - dort liegt ein anderes
        // Feld, und die beiden gehen ohne Schnur ineinander über.
        int outer = 9 + side * 3 + (side < 2 ? cj : ci);
        bool inGrid = ni >= 0 && ni < 3 && nj >= 0 && nj < 3;
        // In den 3x3: eigenes Tile, oder ein anderes Feld dort (aAccent.r * 255
        // als Bits je Tile - Felder haben keine Last, die die Farbe bräuchte).
        int others = int(aAccent.r * 255.0 + 0.5);
        bool neighbour = inGrid
            ? ((tiles >> (ni * 3 + nj)) & 1) == 1 || ((others >> (ni * 3 + nj)) & 1) == 1
            : ((tiles >> outer) & 1) == 1;
        hide = row > 0 || ((tiles >> cell) & 1) == 0 || neighbour;
      } else {
        // Sonstiges (die Breiten-Marken): nur einmal je Feld.
        hide = row > 0;
      }
      if (hide) {
        // Ganz außerhalb des Bildes - die Dreiecke fallen weg, und die
        // Bodenhöhe muss für sie nicht gerechnet werden.
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
      }
    }

    if (part == P_CLOTH) {
      // Fahnentuch weht: eine Welle läuft vom Mast zum freien Ende, das
      // weiter ausschlägt als die Seite am Mast.
      p.x += sin(uTime * 5.0 - p.y * 14.0) * 0.12 * p.y;
    }

    if (part == P_SAILS) {
      // Muehlenfluegel drehen sich um die Nabe, die Achse zeigt nach vorn.
      // aMotion.y = Startstellung, aMotion.z = Drehzahl (millMotion), dazu Böen.
      // Drehzahl < 0: steht still - aMotion.y ist dann der feste Winkel
      // (eingestürzte Mühle, siehe frozenMillMotion).
      float speed = aMotion.z > 0.0 ? aMotion.z : 1.0;
      float a = aMotion.z < 0.0 ? -aMotion.y : -(uTime * ${SAIL_SPEED.toFixed(3)} * speed + aMotion.y
          + ${GUST_AMOUNT.toFixed(3)} * sin(uTime * ${GUST_RATE.toFixed(3)} * speed + aMotion.y * 3.1));
      vec2 q = p.yz - uHub;
      p.yz = uHub + vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
    }

    // Blickrichtung je Instanz (Gebäude bekommen sie vom Renderer).
    // Einsturz (Gebäude, aMotion.w = Fortschritt 0..1): jeder Eckpunkt sackt
    // unterschiedlich weit ab - aus dem Gebäude wird ein Schutthaufen, der
    // unten etwas breiter läuft. Erst nach dem Drehen der Mühlenflügel: sonst
    // würden die zusammengedrückten Flügel um die Nabe gedreht und schnellten
    // verzerrt nach oben.
    if (!figure && !natural && !field && aMotion.w > 0.0) {
      float c = aMotion.w;
      float h = fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      p.z *= mix(1.0, 0.12 + 0.4 * h, c);
      p.xy *= 1.0 + c * 0.35 * (0.4 + h);
      // Der Haufen sackt schief zusammen.
      p.z += c * 0.12 * (p.x - 0.4 * p.y);
    }

    // Felder liegen auf ihren Tiles; aMotion.x ist bei ihnen die Furche.
    float heading = field ? 0.0 : aMotion.x;
    vec2 forward = vec2(cos(heading), sin(heading));
    vec2 left = vec2(-forward.y, forward.x);
    vec2 offset = (forward * p.x + left * p.y) * scale;
    float up = p.z * scale;

    // Umfallen (Vorkommen): um den Fuss kippen, aMotion.y = Winkel,
    // aMotion.z = Richtung in Weltkoordinaten. Der Anteil in Fallrichtung
    // und die Hoehe drehen sich, der Anteil quer dazu bleibt.
    bool falling = natural && aMotion.y > 0.0;
    // Der Stumpf und alles am Boden (Wurzeln, Gras, Laub) bleiben stehen;
    // der Stamm darüber kippt um die Oberkante des Stumpfs.
    bool grounded = part == P_STUMP || part == P_STUMP_TOP
        || (part == P_CROWN && aCorner.w - 15.0 < 0.002);
    if (falling && !grounded) {
      vec2 dir = vec2(cos(aMotion.z), sin(aMotion.z));
      float hinge = uStump * scale;
      // Am Hang: so weit kippen, dass die Spitze auf dem Gelände liegt - der
      // Baum bleibt dabei starr. Das Gefälle vom Fuß bis zur Spitze kommt zum
      // Winkel auf ebenem Boden hinzu (bergab weiter, bergauf weniger weit).
      float reach = (uModelTop - uStump) * scale * 0.85;
      float drop = groundZ(center) - groundZ(center + dir * reach);
      float rest = clamp(${FALL_LYING.toFixed(4)} + atan(drop, reach), 0.7, 2.3);
      float angle = aMotion.y * rest / ${FALL_LYING.toFixed(4)};
      float along = dot(offset, dir);
      vec2 across = offset - dir * along;
      float c = cos(angle);
      float s = sin(angle);
      float lift = up - hinge;
      offset = across + dir * (along * c + lift * s);
      up = hinge - along * s + lift * c;
      // Gegen Ende rutscht der Stamm vom Stumpf: sein abgesägtes Ende liegt
      // dann neben dem Stumpf auf dem Boden, nicht obendrauf.
      float slide = smoothstep(0.75, 1.0, aMotion.y / ${FALL_LYING.toFixed(4)});
      float logRadius = uStumpRadius * scale;
      offset += dir * (logRadius * 2.2) * slide;
      up -= (hinge - logRadius * 0.9) * slide;
    }

    vec2 xy = center + offset;
    float base = aGround > ${GROUND_UNKNOWN / 10}.0 ? aGround * uReliefScale : groundZ(center);
    // Felder werden nicht eingeebnet: jede Pflanze steht auf dem Gelände darunter.
    if (field) {
      // Felder folgen dem Gelände. Gemessen ist es je Furche an drei Stellen
      // entlang der Furche (Anfang, Mitte, Ende): die Höhe (aAccent.g,
      // aGround, aAccent.b) und das Gefälle quer dazu (aColor) - dazwischen
      // eine Parabel, quer dazu eine Gerade, so schließen die Furchen am Hang
      // ohne Stufen aneinander. Das Gelände hier je Eckpunkt zu rechnen
      // kostete bei Tausenden Halmen zu viel. Ohne Messung (Bauvorschau) doch
      // je Eckpunkt.
      // Pflöcke und Schnur (wenige Eckpunkte, über das ganze Feld verteilt)
      // aber genau je Eckpunkt.
      if (aGround > ${GROUND_UNKNOWN / 10}.0 && part != P_EDGE) {
        float q = clamp((xy.y - center.y + 1.5) / 3.0, 0.0, 1.0);
        vec3 w = vec3((2.0 * q - 1.0) * (q - 1.0), 4.0 * q * (1.0 - q), q * (2.0 * q - 1.0));
        float h = dot(w, vec3(aAccent.g, aGround, aAccent.b));
        float across = xy.x - (center.x + (float(int(floor(aMotion.x + 0.5))) + 0.5) * ${(3 / FIELD_FURROWS).toFixed(6)} - 1.5);
        base = (h + dot(w, aColor) * across) * uReliefScale;
      } else {
        base = groundZ(xy);
      }
    }
    float z = base + up;
    // Gebaeude stehen waagerecht; ihr Sockel reicht in den Boden, damit am
    // Hang keine Luecke darunter aufgeht. Ein kippender Baum nicht - sein
    // Sockel wuerde sonst als Stange aus dem Boden ragen.
    // Vorkommen stehen schon auf dem tiefsten Punkt ihres Fußes (und Schutt
    // fliegt durch die Luft) - die brauchen keinen Sockel.
    // Felder liegen einfach auf dem Gelände - ein Sockel stünde am Hang als
    // Wand unter der Erde heraus.
    if (!figure && !natural && !field && !beast && p.z < 0.001) z = base - 1.0;
    world = vec3(xy, z);
  } else if (shape == 17) {
    // Staub: ein zur Kamera gedrehter Fleck. Mitte in der Welt, Ausdehnung
    // in Bildschirmpixeln - so wirkt die Wolke von jeder Seite rund.
    vec4 clip = project(center, groundZ(center) + aMotion.x);
    clip.xy += (aCorner.xy - 0.5) * aParams.z * uPixelsPerTile * 2.0 / uResolution;
    gl_Position = clip;
    vWorld = vec3(aCorner.xy, 0.0);
    vColor = aColor;
    vParams = aParams;
    vRoof = 0.0;
    return;
  } else if (shape == 4 || shape == ${SHAPE_RING}) {
    // Overlays behalten ihre Tile-Größe - sie sollen genau ihr Feld abdecken.
    // Jede Ecke sitzt auf ihrer eigenen Geländehöhe, leicht angehoben, damit
    // sie nicht im Boden verschwindet.
    vec2 p = center + (aCorner.xy - 0.5) * aParams.z;
    // Der Auswahlring liegt fast am Boden - angehoben rutschte er in der
    // Schrägansicht nach oben und säße hinter der Figur statt unter ihr.
    // Mit mitgegebener Bodenhöhe (Mitte) liegt er waagerecht darauf.
    float ground = aGround > ${GROUND_UNKNOWN / 10}.0 ? aGround * uReliefScale : groundZ(p);
    world = vec3(p, ground + (shape == ${SHAPE_RING} ? 0.012 : 0.15));
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
  // Auswahlring: der Fragment-Shader braucht die Lage im Quadrat (0..1).
  if (shape == ${SHAPE_RING}) vWorld = vec3(aCorner.xy, world.z);
  vColor = aColor;
  vTeam = aColor;
  vTex = 0;
  vLocal = vec3(0.0);
  if (shape >= 5 && shape != ${SHAPE_RING}) {
    // Modelle färben nach Material: Kittel bzw. Anstrich in der Instanzfarbe,
    // die Last in der Farbe der Ressource, alles andere wie in der MTL-Datei.
    int role = int(aMaterial.w + 0.5);
    // Felder: aColor trägt das Gefälle, der Anstrich (Pfosten) kommt als Uniform.
    bool fieldShape = shape >= ${SHAPE.farmWheat} && shape < ${SHAPE.farmCorn + FIELD_FURROWS};
    vec3 paint = fieldShape ? uPlayerColor : aColor;
    vColor = role == 1 ? paint : role == 2 ? aAccent : aMaterial.rgb;
    if (gSawn > 0.5) vColor = vec3(0.86, 0.71, 0.48);
    vColor = mix(vColor, vec3(0.34, 0.56, 0.2), gUnripe * 0.85);
    bool tree = ${TREES.map((n) => `shape == ${n}`).join(' || ')};
    vTex = role >= 6 ? role : !tree ? 0 : gSawn > 0.5 ? 5 : (role == 3 || role == 4) ? role : 0;
    vLocal = aCorner.xyz * uMeters;
    // Bauvorschau: halbdurchsichtig ganz in der Vorschaufarbe - rot, wenn
    // der Platz nicht geht.
    if (shape != 5 && shape != 18 && aParams.y < 0.99 && aMotion.w == 0.0) vColor = aColor;
  }
  vParams = aParams;
  vRoof = aCorner.w;
  gl_Position = project(world.xy, world.z);
  // Figuren und Auswahlring stehen auf der berechneten Geländehöhe; das
  // Geländenetz nähert sie nur mit Dreiecken an und liegt in Mulden etwas
  // höher - es schnitte Füße und Ring ab. Ihre Tiefe wird deshalb um etwa
  // einen halben Tile zur Kamera gezogen; auf dem Bildschirm bleibt alles,
  // wo es ist (siehe project: näher = kleinere Tiefe).
  if (shape == 5 || shape == 18 || shape == ${SHAPE_RING} || shape == ${SHAPE.deer} || shape == ${SHAPE.hare}) gl_Position.z -= 0.5 / uDepthRange;
  // Felder ebenso ein Stück: ihre Erde liegt nur wenige Zentimeter über dem
  // Gelände, das zwischen ihren Eckpunkten sonst hier und da durchsticht.
  if (shape >= ${SHAPE.farmWheat} && shape < ${SHAPE.farmCorn + FIELD_FURROWS}) gl_Position.z -= 0.2 / uDepthRange;
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vColor;
flat in vec3 vTeam;
flat in int vTex;
in vec3 vLocal;

float texHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float texNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(texHash(i), texHash(i + vec2(1, 0)), u.x),
             mix(texHash(i + vec2(0, 1)), texHash(i + vec2(1, 1)), u.x), u.y);
}
// Abstand zur nächsten Zellgrenze (Voronoi) - die Furchen zwischen Borkenplatten.
float texCells(vec2 p, out float id) {
  vec2 cell = floor(p);
  float d1 = 9.0, d2 = 9.0;
  id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = cell + vec2(x, y);
    vec2 o = vec2(texHash(c), texHash(c + 7.1));
    float d = length(p - c - o);
    if (d < d1) { d2 = d1; d1 = d; id = texHash(c + 3.3); } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}

// 1, solange ein Muster mit freq Wiederholungen je Meter noch größer als
// ein Pixel (px Meter) ist, 0, wenn es darunter fällt.
float texDetail(float freq, float px) {
  return 1.0 - smoothstep(0.25, 0.6, freq * px);
}

// Rinde als Textur: Stamm abgewickelt (Umfang, Höhe) in Metern.
vec3 treeTexture(vec3 base) {
  float r = max(length(vLocal.xy), 0.05);
  vec2 uv = vec2(atan(vLocal.y, vLocal.x) * r, vLocal.z);
  if (vTex == 3) {
    // Borke: längliche Platten, dazwischen tiefe dunkle Furchen, feine
    // Längsmaserung auf den Platten, jede Platte etwas anders getönt.
    float id;
    float e = texCells(uv * vec2(7.0, 1.6), id);
    float furrow = 1.0 - smoothstep(0.03, 0.16, e);
    float grain = texNoise(uv * vec2(38.0, 3.0)) * 0.5 + texNoise(uv * vec2(90.0, 8.0)) * 0.5;
    vec3 c = base * (0.82 + 0.36 * id) * (0.85 + 0.3 * grain);
    return mix(c, base * 0.32, furrow);
  }
  if (vTex == 4) {
    // Birke: weiß mit waagerechten dunklen Strichen (Lentizellen) und
    // vereinzelten schwarzen Rissen.
    float dash = smoothstep(0.72, 0.8, texNoise(uv * vec2(4.0, 26.0)));
    float crack = smoothstep(0.86, 0.9, texNoise(uv * vec2(9.0, 2.2)));
    vec3 c = base * (0.9 + 0.1 * texNoise(uv * vec2(30.0, 10.0)));
    return mix(c, vec3(0.12, 0.11, 0.1), max(dash * 0.85, crack));
  }
  if (vTex == 6) {
    // Holzschindeln: versetzte Reihen (Reihe = Höhe), jede Schindel etwas
    // anders getönt, dunkle Fugen dazwischen, die untere Kante unregelmäßig
    // und im Schatten der Reihe darüber. Waagerecht zählt die Richtung, in
    // der das Dach verläuft - x + y deckt beide ab.
    vec2 q = vec2((vLocal.x + vLocal.y) * 3.2, vLocal.z * 5.0);
    float row = floor(q.y);
    q.x += mod(row, 2.0) * 0.5;
    vec2 cell = vec2(floor(q.x), row);
    vec2 f = fract(q);
    float tone = texHash(cell);
    float ragged = texHash(cell + 11.0) * 0.18;
    float gapX = smoothstep(0.0, 0.06, f.x) * smoothstep(1.0, 0.94, f.x);
    float shade = smoothstep(0.0, 0.3 + ragged, f.y);
    vec3 c = base * (0.78 + 0.4 * tone) * (0.62 + 0.38 * shade);
    c *= 0.9 + 0.2 * texNoise(vec2(q.x * 7.0, q.y * 1.5));
    return mix(base * 0.35, c, gapX);
  }
  // Felder: Muster in Metern. Was feiner ist als etwa ein Pixel, wird zum
  // Mittelwert ausgeblendet - sonst flimmert es als Rauschen.
  float px = max(length(fwidth(vLocal)), 1e-4);
  if (vTex == 7) {
    // Getreide: Halme als feine senkrechte Streifen, unten im Bestand
    // dunkel, oben hell; helle Ähren und dunkle Grannen als Sprenkel.
    vec2 h = vec2(vLocal.x * 0.8 + vLocal.y * 0.6, vLocal.y * 0.8 - vLocal.x * 0.6);
    float stalks = mix(0.5, texNoise(vec2(h.x * 40.0, vLocal.z * 3.0)) * 0.6 + texNoise(vec2(h.y * 55.0, vLocal.z * 4.0)) * 0.4, texDetail(55.0, px));
    float ears = smoothstep(0.62, 0.8, texNoise(vec2(h.x * 22.0, vLocal.z * 16.0) + h.y * 9.0)) * texDetail(22.0, px);
    float depth = smoothstep(0.2, 1.1, vLocal.z);
    vec3 c = base * (0.78 + 0.4 * stalks);
    c = mix(c, base * 1.2 + vec3(0.05), ears * 0.45);
    return c * (0.6 + 0.45 * depth);
  }
  if (vTex == 8) {
    // Blätter (Mais): feine Längsadern, dazu sanft fleckig.
    float mottle = texNoise(vLocal.xy * 4.0 + vLocal.z * 3.0);
    float lines = 0.5 + 0.5 * sin((vLocal.x - vLocal.y) * 90.0 + vLocal.z * 25.0);
    vec3 c = base * (0.82 + 0.3 * mottle);
    return c * (1.0 + 0.12 * (lines - 0.5) * texDetail(15.0, px));
  }
  if (vTex == 9) {
    // Umgepflügte Erde: Pflugspuren entlang der Furchen, darin Schollen mit
    // dunklen Spalten, Krümel, feuchtere dunkle Stellen und helle Steinchen.
    float id;
    float e = texCells(vLocal.xy * vec2(3.0, 6.0), id);
    float crack = (1.0 - smoothstep(0.02, 0.12, e)) * texDetail(6.0, px);
    float streak = 0.5 + 0.5 * sin(vLocal.x * 14.0 + texNoise(vLocal.xy * vec2(2.0, 0.5)) * 3.0);
    float crumbs = mix(0.5, texNoise(vLocal.xy * 30.0), texDetail(30.0, px));
    float damp = smoothstep(0.35, 0.75, texNoise(vLocal.xy * 0.6));
    float pebble = smoothstep(0.9, 0.95, texNoise(vLocal.xy * 12.0 + 3.7)) * texDetail(12.0, px);
    vec3 c = base * (0.85 + 0.25 * id) * (0.88 + 0.22 * crumbs) * (0.9 + 0.2 * streak * texDetail(14.0, px));
    c *= 1.0 - 0.18 * damp;
    c = mix(c, base * 0.5, crack * 0.7);
    return mix(c, vec3(0.6, 0.57, 0.52), pebble * 0.6);
  }
  if (vTex == 11) {
    // Maiskolben: Körner in Reihen.
    vec2 q = vec2((vLocal.x + vLocal.y) * 55.0, vLocal.z * 50.0);
    vec2 f = fract(q);
    float kernel = smoothstep(0.0, 0.3, f.x) * smoothstep(1.0, 0.7, f.x) * smoothstep(0.0, 0.3, f.y) * smoothstep(1.0, 0.7, f.y);
    return base * (0.85 + 0.25 * mix(0.45, kernel, texDetail(55.0, px)));
  }
  // Schnittfläche: helles Holz mit Jahresringen, zum Rand dunkler.
  float rings = 0.5 + 0.5 * sin(r * 70.0 + texNoise(vLocal.xy * 6.0) * 3.0);
  return base * (0.86 + 0.14 * rings);
}
// 1: Umriss-Durchgang - nur die verdeckten Teile einer Figur, in Spielerfarbe.
uniform int uSilhouette;
flat in vec3 vParams;
flat in float vRoof;
out vec4 fragColor;

// Zur Kamera, in Weltkoordinaten - hängt von der Blickrichtung ab.
uniform vec3 uToCamera;
// Licht von links oben im Bild - dieselbe Sonne wie im Gelände-Shader.
const vec3 SUN = vec3(-0.45, 0.35, 0.82);

void main() {
  int shape = int(vParams.x + 0.5);
  float alpha = vParams.y;

  if (shape == 4) {
    fragColor = vec4(vColor, alpha);
    return;
  }

  if (shape == ${SHAPE_RING}) {
    // Auswahlring: kräftiger Rand in der Auswahlfarbe, außen eine dünne
    // dunkle Kontur (hebt ihn vom Gelände ab), innen ganz leicht gefüllt.
    float r = length(vWorld.xy - 0.5) * 2.0;
    float edge = fwidth(r) * 1.5;
    float band = smoothstep(0.66 - edge, 0.66, r) * (1.0 - smoothstep(0.86, 0.86 + edge, r));
    float outline = smoothstep(0.86, 0.86 + edge, r) * (1.0 - smoothstep(0.96, 0.96 + edge, r));
    float fill = 1.0 - smoothstep(0.66 - edge, 0.66, r);
    vec3 color = mix(vColor, vec3(0.05), outline);
    float a = band * 0.95 + outline * 0.6 + fill * 0.12;
    if (a <= 0.01) discard;
    fragColor = vec4(color, a * alpha);
    return;
  }

  if (shape == 17) {
    // Staub: rund, zur Mitte dicht, zum Rand weich auslaufend, leicht fleckig.
    vec2 q = vWorld.xy - 0.5;
    float r = length(q) * 2.0;
    float clumps = 0.75 + 0.25 * sin(q.x * 23.0 + q.y * 17.0) * sin(q.y * 29.0 - q.x * 11.0);
    float a = alpha * (1.0 - smoothstep(0.35, 1.0, r)) * clumps;
    if (a <= 0.002) discard;
    fragColor = vec4(vColor, a);
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
  if (dot(normal, uToCamera) < 0.0) normal = -normal;

  if (uSilhouette == 1) {
    // Verdeckte Figur: halbdurchsichtig in der Spielerfarbe, Flächen, die zur
    // Seite zeigen, heller und deckender - so liest sie sich als Umriss.
    float rim = 1.0 - abs(dot(normal, normalize(uToCamera)));
    fragColor = vec4(mix(vTeam, vec3(1.0), 0.25 + rim * 0.5), 0.3 + rim * 0.55);
    return;
  }

  vec3 base = vColor;
  if (vTex != 0) base = treeTexture(base);
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
  // Unterschenkel und Unterarme vor den ganzen Gliedern - der erste passende
  // Anfang zählt.
  ['Leg.L.Lower', 9],
  ['Leg.R.Lower', 10],
  ['Arm.L.Lower', 11],
  // Das Beil vor dem Unterarm, sonst fiele es unter 'Arm.R.Lower'.
  ['Arm.R.Lower.Tool', 13],
  // Ebenso die Sense.
  ['Arm.R.Lower.Scythe', 23],
  ['Arm.R.Lower', 12],
  ['Berry', 14],
  // Tiere: die vier Beine (vor 'Leg.L'/'Leg.R' der Figuren - andere Namen).
  ['Leg.FL', 24],
  ['Leg.FR', 25],
  ['Leg.BL', 26],
  ['Leg.BR', 27],
  ['Crop', 20],
  ['Soil', 21],
  ['Edge', 22],
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
  // Bäume: Rinde als Textur im Fragment-Shader (treeTexture)
  Bark: 3,
  BarkDark: 3,
  PineBark: 3,
  Birch: 4,
  // Gebäude: Holzschindeln als Textur (siehe treeTexture, vTex 6)
  Shingle: 6,
  ShingleDark: 6,
  // Felder (tools/models/farmsGen.mjs): Getreide, Blätter, Kolben.
  Wheat: 7,
  WheatDark: 7,
  WheatEar: 7,
  Tassel: 7,
  WheatStem: 8,
  CornStalk: 8,
  CornLeaf: 8,
  CornHusk: 8,
  Vine: 8,
  Soil: 9,
  SoilDark: 9,
  SoilLight: 9,
  CornCob: 11,
};

interface Model {
  /** Je Eckpunkt: x vorn, y links, z oben (Modell-Einheiten), Teil, r, g, b, Rolle. */
  vertices: Float32Array;
  /**
   * Vereinfachte Fassungen fürs Herauszoomen (siehe LOD_PARTS): ohne die
   * kleinen Teile - Beeren, Blattbüschel, Rinde. Nur bei Vorkommen.
   */
  lods?: Float32Array[];
  hip: number;
  shoulder: number;
  knee: number;
  elbow: number;
  /** Bäume: Höhe des Stumpfs (Modell-Einheiten) - dort knickt der Stamm beim Fällen ab. */
  stump: number;
  /** Bäume: Halbmesser des Stumpfs (Modell-Einheiten) - so weit rutscht der Stamm daneben. */
  stumpRadius: number;
  loadAnchor: [number, number, number];
  /** Mitte der Flügel (links, oben). */
  hub: [number, number];
  /** Tiere: Gelenke (vorn) der Vorder- und Hinterbeine, des Halses (vorn, oben), halbe Breite. */
  legs: [number, number];
  neck: [number, number];
  side: number;
  /** Höchster Punkt in Modell-Einheiten - dort sitzt der Lebensbalken. */
  top: number;
  /** Eingang (Modell-Einheiten: vorn, links), falls das Modell ihn markiert. */
  entry?: [number, number];
  /** Breite bzw. Höhe in Datei-Einheiten (Metern), auf die das Modell gebracht ist. */
  meters: number;
}

/** Nummer einer Beere aus ihrem Objektnamen ("Berry.12.Shine" -> 12). */
function berryNumber(object: string): number {
  return Number(/^Berry\.(\d+)/.exec(object)?.[1] ?? 0);
}

/**
 * Furche und Lage darin aus dem Objektnamen einer Feldpflanze oder eines
 * Stücks Erde ("Crop.3.5.14": Furche 3, Pflanze 5 von 14), siehe P_CROP.
 */
function furrowValue(object: string): number {
  const m = /^(?:Crop|Soil)\.(\d+)\.(\d+)\.(\d+)/.exec(object);
  return m ? Number(m[1]) * 0.04 + (Number(m[2]) / Number(m[3])) * 0.039 : 0;
}

/** Tile und Seite einer Schnur am Feldrand ("Edge.4.2": Tile 4, Seite 2), siehe P_EDGE. */
function edgeValue(object: string): number {
  const m = /^Edge\.(\d+)\.(\d+)/.exec(object);
  return m ? Number(m[1]) * 0.04 + Number(m[2]) * 0.009 : 0;
}

/** Fester Zufall 0..1 je Beeren-Nummer - welche Beere zuerst gepflückt wird. */
function berryRandom(index: number): number {
  let h = Math.imul(index + 1, 2654435761);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Baut ein Mesh aus einem OBJ, wie Blender es exportiert: Meter, Y oben,
 * Vorderseite nach +Z, links auf +X. Die Größe in der Datei spielt keine
 * Rolle: Figuren werden auf Körperhöhe 1 gebracht, Gebäude auf Breite 1 -
 * gemessen an den feststehenden Teilen, damit ausladende Flügel nicht
 * mitzählen. Der Boden liegt danach bei 0. Blender hängt beim Export manchmal
 * den Mesh-Namen an ("Leg.L_Cube.003"), darum zählt der Anfang des Namens.
 */
function loadModel(obj: string | ObjTriangle[], mtl: string, unit: 'height' | 'width', lod = false, sawable = false,
                   only?: ObjTriangle[]): Model {
  // Das Objekt "Entry" markiert nur den Eingang - nicht zeichnen, nicht mitmessen.
  const all = typeof obj === 'string' ? parseObj(obj) : obj;
  const entryPoints = all.filter((t) => t.object.startsWith('Entry')).flatMap((t) => t.points);
  const triangles = all.filter((t) => !t.object.startsWith('Entry'));
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

  // Größe jedes Teils (größte Ausdehnung in Modell-Einheiten) - für die
  // vereinfachten Fassungen.
  const extent = new Map<number, number>();
  // Bäume: wie hoch jedes Teil ansetzt (0 = Boden, 1 = Spitze), siehe P_CROWN.
  const bottom = new Map<number, number>();
  if (lod || sawable) {
    const box = new Map<number, number[]>();
    for (const t of triangles) {
      const b = box.get(t.index) ?? [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (const p of t.points) {
        for (let i = 0; i < 3; i++) {
          b[i] = Math.min(b[i], p[i]);
          b[i + 3] = Math.max(b[i + 3], p[i]);
        }
      }
      box.set(t.index, b);
    }
    for (const [i, b] of box) {
      extent.set(i, Math.max(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / unitLength);
      bottom.set(i, (b[1] - minY) / (maxY - minY));
    }
  }
  const lods: number[][] = LOD_PARTS.map(() => []);

  const v: number[] = [];
  let hip = 0;
  let shoulder = 0;
  let knee = 0;
  let elbow = 0;
  let stump = 0;
  const load = { back: -Infinity, y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  const legSum = [0, 0];
  const legCount = [0, 0];
  let neck: [number, number] = [0, Infinity];
  let side = 0;
  const sails = { y: [Infinity, -Infinity], z: [Infinity, -Infinity] };

  // Bäume: Oberkante des Stumpfs in Datei-Einheiten - dort liegen die beiden
  // Schnittflächen (Deckel des Stumpfs, Boden des Stamms), siehe P_STUMP.
  let stumpTop = -Infinity;
  let stumpRadius = 0;
  if (sawable) {
    for (const t of triangles) {
      if (!t.object.startsWith('Trunk.Stump')) continue;
      for (const q of t.points) {
        stumpTop = Math.max(stumpTop, q[1]);
        stumpRadius = Math.max(stumpRadius, Math.hypot(q[0], q[2]) / unitLength);
      }
    }
  }
  const onCut = (t: ObjTriangle) => t.points.every((q) => Math.abs(q[1] - stumpTop) < 1e-3);

  // Nur ein Teil des Modells (eine Furche eines Felds) - gemessen am ganzen.
  for (const t of only ?? triangles) {
    const part = partOf(t.object);
    const color = colors.get(t.material) ?? [0.6, 0.6, 0.6];
    const role = MATERIAL_ROLE[t.material] ?? 0;
    for (const p of t.points) {
      const [x, y, z] = local(p);
      // Beeren: je Beere (Objekt) ein fester Zufall im Nachkomma-Teil, siehe P_BERRY.
      const partValue = part === 14 ? 14 + berryRandom(berryNumber(t.object)) * 0.45
        // Feldpflanzen: ihre Reihenfolge beim Ernten, siehe P_CROP.
        : part === 20 || part === 21 ? part + furrowValue(t.object)
        // Schnur an einer Tile-Kante, siehe P_EDGE.
        : part === 22 ? 22 + edgeValue(t.object)
        // Bäume: alles außer dem Stamm verschwindet beim Absägen als Ganzes.
        : sawable && !t.object.startsWith('Trunk') ? 15 + (bottom.get(t.index) ?? 0) * 0.45
        // Stumpf (16), sein Deckel (17), der Boden des Stamms (18).
        : sawable && t.object.startsWith('Trunk.Stump') ? (onCut(t) ? 17 : 16)
        : sawable && onCut(t) ? 18
        // Stammstück (19 + Ansatzhöhe): über dem Schnitt verschwindet es ganz.
        : sawable ? 19 + (bottom.get(t.index) ?? 0) * 0.45
        : part;
      v.push(x, y, z, partValue, color[0], color[1], color[2], role);
      if (lod) {
        LOD_PARTS.forEach((min, i) => {
          // Stammstücke bleiben immer - sie sind kurz, der Stamm aber nicht.
          if ((extent.get(t.index) ?? 1) >= min || t.object.startsWith('Trunk')) lods[i].push(x, y, z, partValue, color[0], color[1], color[2], role);
        });
      }
      // Hüfte und Schulter sitzen an der Oberkante von Beinen und Armen.
      if (part === 1 || part === 2 || (part >= 24 && part <= 27)) hip = Math.max(hip, z);
      if (part >= 24 && part <= 27) {
        const i = part <= 25 ? 0 : 1;
        legSum[i] += x;
        legCount[i]++;
      }
      // Halsansatz: der tiefste Punkt von Kopf und Hals, hinten.
      if (part === 5 && (z < neck[1] || (z === neck[1] && x < neck[0]))) neck = [x, z];
      if (part === 0) side = Math.max(side, Math.abs(y));
      if (part === 3 || part === 4) shoulder = Math.max(shoulder, z);
      // Knie und Ellbogen an der Oberkante von Unterschenkel und Unterarm.
      if (part === 9 || part === 10) knee = Math.max(knee, z);
      if (part === 11 || part === 12) elbow = Math.max(elbow, z);
      if (t.object.startsWith('Trunk.Stump')) stump = Math.max(stump, z);
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

  const entry = entryPoints.length > 0
    ? local(entryPoints.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0])
        .map((c) => c / entryPoints.length) as [number, number, number])
    : undefined;
  return {
    entry: entry && [entry[0], entry[1]] as [number, number],
    vertices: new Float32Array(v),
    lods: lod ? lods.map((l) => new Float32Array(l)) : undefined,
    hip,
    shoulder,
    knee,
    elbow,
    stump,
    stumpRadius,
    loadAnchor: Number.isFinite(load.back)
      ? [load.back, (load.y[0] + load.y[1]) / 2, (load.z[0] + load.z[1]) / 2]
      : [0, 0, 0],
    hub: [(sails.y[0] + sails.y[1]) / 2, (sails.z[0] + sails.z[1]) / 2],
    legs: [legSum[0] / Math.max(1, legCount[0]), legSum[1] / Math.max(1, legCount[1])],
    neck: Number.isFinite(neck[1]) ? neck : [0, 0],
    side,
    top: (maxY - minY) / unitLength,
    meters: unitLength,
  };
}

/**
 * Vereinfachte Fassungen der Vorkommen: Teile kleiner als dieser Anteil der
 * Modellbreite fallen weg - unter LOD_ZOOM[0] CSS-Pixeln je Tile die erste,
 * unter LOD_ZOOM[1] die zweite. Ein Wald hat Tausende Bäume, und weit draußen
 * sind Beeren und Blattbüschel ohnehin kleiner als ein Pixel.
 */
const LOD_PARTS = [0.12, 0.45];
const LOD_ZOOM = [32, 12];
/**
 * Felder wechseln früher: Tausende Halme lohnen sich nur ganz nah; schon ab
 * 32 CSS-Pixeln je Tile reicht die Fassung mit weniger (FIELD_DETAIL).
 */
const FIELD_LOD_ZOOM = [48, 24];

/**
 * Bäume und Sträucher in Metern: so breit ist einer der Instanzgröße 1.
 * Eine schmale Pappel wird so nicht auf die Breite einer Eiche aufgeblasen.
 */
const TREE_METERS = 3;
const BUSH_METERS = 2.25;
const STONE_METERS = 3;
const GOLD_METERS = 2.8;

/**
 * Ein Feld als eine Form je Furche: jede enthält nur deren Pflanzen und Erde
 * (die Pflöcke gehören zur ersten). Gezeichnet wird so je Furche nur, was
 * zu ihr gehört - ein Weizenfeld hat Tausende Halme.
 */
function fieldModels(kind: (typeof FARM_KINDS)[number], base: number) {
  // Die volle Fassung und zwei einfachere fürs Herauszoomen (LOD_ZOOM) - mit
  // weniger Halmen, die man von weit weg ohnehin nicht einzeln sieht.
  // Je Fassung einmal nach Furchen aufgeteilt (Pflöcke und Schnur zur ersten).
  const versions = FIELD_DETAIL.map((detail) => {
    const { obj, mtl } = farmModel(kind, detail);
    const triangles = parseObj(obj);
    const rows: ObjTriangle[][] = Array.from({ length: FIELD_FURROWS }, () => []);
    for (const t of triangles) {
      const m = /^(?:Crop|Soil)\.(\d+)\./.exec(t.object);
      rows[m ? Number(m[1]) : 0].push(t);
    }
    return { triangles, rows, mtl };
  });
  return Array.from({ length: FIELD_FURROWS }, (_, row) => {
    const [model, ...simpler] = versions.map((v) => loadModel(v.triangles, v.mtl, 'width', false, false, v.rows[row]));
    model.lods = simpler.map((m) => m.vertices);
    return { shape: base + row, model, scale: 1 };
  });
}

/** Wie viele Pflanzen die Fassungen eines Felds zeigen: voll, dann für die beiden LOD-Stufen. */
const FIELD_DETAIL = [1, 0.3, 0.1];

/** Ein Vorkommen: mit vereinfachten Fassungen, in seiner echten Breite. */
function natural(shape: number, obj: string, mtl: string, meters: number) {
  const model = loadModel(obj, mtl, 'width', true, TREES.includes(shape));
  return [{ shape, model, scale: model.meters / meters }];
}

/**
 * Formen, die aus Modell-Dateien kommen. `scale`: Tiles je Einheit der
 * Instanzgröße - eine Figur der Größe 0.55 ist 0.55 * 1.7 Tiles hoch.
 */
const MODELS: { shape: number; model: Model; scale: number; stride?: number }[] = [
  { shape: SHAPE.villager, model: loadModel(villagerMaleObj, villagerMtl, 'height'), scale: 1.7 },
  // Kürzere Schritte, sonst treten die Beine hinten aus dem langen Rock.
  { shape: SHAPE.villagerFemale, model: loadModel(villagerFemaleObj, villagerMtl, 'height'), scale: 1.7, stride: 0.6 },
  { shape: SHAPE.mill, model: loadModel(millObj, millMtl, 'width'), scale: 1 },
  { shape: SHAPE.mill2, model: loadModel(mill2Obj, mill2Mtl, 'width'), scale: 1 },
  { shape: SHAPE.mill3, model: loadModel(mill3Obj, mill3Mtl, 'width'), scale: 1 },
  { shape: SHAPE.mill4, model: loadModel(mill4Obj, mill4Mtl, 'width'), scale: 1 },
  { shape: SHAPE.lumberCamp, model: loadModel(lumberCampObj, lumberCampMtl, 'width'), scale: 1 },
  { shape: SHAPE.lumberCamp2, model: loadModel(lumberCamp2Obj, lumberCamp2Mtl, 'width'), scale: 1 },
  { shape: SHAPE.lumberCamp3, model: loadModel(lumberCamp3Obj, lumberCamp3Mtl, 'width'), scale: 1 },
  { shape: SHAPE.lumberCamp4, model: loadModel(lumberCamp4Obj, lumberCamp4Mtl, 'width'), scale: 1 },
  { shape: SHAPE.house, model: loadModel(houseObj, houseMtl, 'width'), scale: 1 },
  { shape: SHAPE.house2, model: loadModel(house2Obj, house2Mtl, 'width'), scale: 1 },
  { shape: SHAPE.house3, model: loadModel(house3Obj, house3Mtl, 'width'), scale: 1 },
  { shape: SHAPE.house4, model: loadModel(house4Obj, house4Mtl, 'width'), scale: 1 },
  { shape: SHAPE.townCenter, model: loadModel(townCenterObj, townCenterMtl, 'width'), scale: 1 },
  { shape: SHAPE.miningCamp, model: loadModel(miningCampObj, miningCampMtl, 'width'), scale: 1 },
  ...FARM_KINDS.flatMap((kind, i) => fieldModels(kind, FIELD_BASES[i])),
  ...natural(SHAPE.tree, treeSpruceObj, treeSpruceMtl, TREE_METERS),
  ...natural(SHAPE.treePine, treePineObj, treePineMtl, TREE_METERS),
  ...natural(SHAPE.treeOak, treeOakObj, treeOakMtl, TREE_METERS),
  ...natural(SHAPE.treeBirch, treeBirchObj, treeBirchMtl, TREE_METERS),
  ...natural(SHAPE.treePoplar, treePoplarObj, treePoplarMtl, TREE_METERS),
  ...natural(SHAPE.treeMaple, treeMapleObj, treeMapleMtl, TREE_METERS),
  ...natural(SHAPE.treeOakOld, treeOakOldObj, treeOakOldMtl, TREE_METERS),
  ...natural(SHAPE.treeOakYoung, treeOakYoungObj, treeOakYoungMtl, TREE_METERS),
  ...natural(SHAPE.stoneRock, stone1Obj, stone1Mtl, STONE_METERS),
  ...natural(SHAPE.stoneRock2, stone2Obj, stone2Mtl, STONE_METERS),
  ...natural(SHAPE.stoneRock3, stone3Obj, stone3Mtl, STONE_METERS),
  ...natural(SHAPE.goldRock, gold1Obj, gold1Mtl, GOLD_METERS),
  ...natural(SHAPE.goldRock2, gold2Obj, gold2Mtl, GOLD_METERS),
  ...natural(SHAPE.goldRock3, gold3Obj, gold3Mtl, GOLD_METERS),
  ...natural(SHAPE.berryBush, berryBush1Obj, berryBush1Mtl, BUSH_METERS),
  ...natural(SHAPE.berryBush2, berryBush2Obj, berryBush2Mtl, BUSH_METERS),
  ...natural(SHAPE.berryBush3, berryBush3Obj, berryBush3Mtl, BUSH_METERS),
  ...natural(SHAPE.berryBush4, berryBush4Obj, berryBush4Mtl, BUSH_METERS),
  // Nach Höhe gemessen: das Tuch bewegt sich und zählt nicht zur Breite,
  // der Mast allein wäre als Maßstab viel zu schmal.
  { shape: SHAPE.rallyFlag, model: loadModel(rallyFlagObj, rallyFlagMtl, 'height'), scale: 1 },
  // Tiere: auf Höhe 1 gebracht - die Instanzgröße ist ihre Höhe in Tiles.
  { shape: SHAPE.deer, model: loadModel(deerObj, deerMtl, 'height'), scale: 1 },
  { shape: SHAPE.hare, model: loadModel(hareObj, hareMtl, 'height'), scale: 1 },
];

/**
 * Eingang eines Gebäudes in der Welt: Mitte (x, y wie EntityInstance, also
 * Tile-Anker), Größe und Blickrichtung wie beim Zeichnen. Undefined, wenn das
 * Modell keinen Eingang markiert.
 */
export function modelEntry(shape: number, x: number, y: number, size: number, heading: number): { x: number; y: number } | undefined {
  const m = MODELS.find((entry) => entry.shape === shape);
  if (!m?.model.entry) return undefined;
  const [f, l] = m.model.entry;
  const s = size * m.scale;
  const [fx, fy] = [Math.cos(heading), Math.sin(heading)];
  return { x: x + 0.5 + (fx * f - fy * l) * s, y: y + 0.5 + (fy * f + fx * l) * s };
}

/**
 * Größe eines Modells in Tiles je Einheit der Instanzgröße: Höhe und Breite.
 * Für das Anklicken von Bäumen und Felsen an ihrer Krone statt am Boden.
 */
export function modelSize(shape: number): { height: number; width: number } | undefined {
  const m = MODELS.find((entry) => entry.shape === shape);
  return m && { height: m.model.top * m.scale, width: m.scale };
}

interface Mesh {
  vao: WebGLVertexArrayObject;
  vertices: number;
}

export class EntityRenderer {
  private program: WebGLProgram;
  private building: Mesh;
  private flat: Mesh;
  /** Abtastschritt für die Bodenhöhe - MapRenderer setzt den des Geländegitters. */
  groundStep = 1;
  /** Eingeebnete Flächen unter Gebäuden (siehe world/flatten.ts). */
  flatZones = new Float32Array(MAX_FLAT_ZONES * 4);
  flatCount = 0;
  /** Spielerfarbe (0..255) - Felder bekommen sie als Uniform (siehe uPlayerColor). */
  playerColor: [number, number, number] = [64, 160, 72];
  private models: {
    shape: number; model: Model; scale: number; stride?: number;
    mesh: Mesh; lodMeshes: Mesh[]; list: EntityInstance[];
  }[];
  private instanceBuffer: WebGLBuffer;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  /** Wird nur vergrößert, nie neu belegt - eine Allokation je Frame wäre Müll. */
  private data = new Float32Array(STRIDE * 256);
  /** Sortierpuffer, ebenfalls wiederverwendet. */
  private flats: EntityInstance[] = [];
  private solids: EntityInstance[] = [];
  private puffs: EntityInstance[] = [];

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
    this.models = MODELS.map((m) => ({
      ...m,
      mesh: this.createMesh(m.model.vertices, 8),
      lodMeshes: (m.model.lods ?? []).map((l) => this.createMesh(l, 8)),
      list: [],
    }));

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
    const puffs = this.puffs;
    flats.length = 0;
    solids.length = 0;
    puffs.length = 0;
    for (const m of this.models) m.list.length = 0;
    for (const e of instances) {
      if (e.shape === SHAPE.flat || e.shape === SHAPE.ring) flats.push(e);
      else if (e.shape === SHAPE.dust) puffs.push(e);
      else (this.models.find((m) => m.shape === e.shape)?.list ?? solids).push(e);
    }
    const backToFront = (a: EntityInstance, b: EntityInstance) => a.x + a.y - (b.x + b.y);
    solids.sort(backToFront);
    // Nur Halbdurchsichtiges braucht die Reihenfolge; Bäume und Felsen sind
    // undurchsichtig, der Tiefenpuffer reicht - und es sind Tausende.
    for (const m of this.models) {
      if (!NATURAL.includes(m.shape)) m.list.sort(backToFront);
    }

    const bars = healthBars ? instances.filter((e) => e.health !== undefined) : [];
    const total = instances.length + bars.length;
    if (this.data.length < total * STRIDE) {
      this.data = new Float32Array(total * STRIDE * 2);
    }
    const d = this.data;
    let i = 0;
    for (const list of [flats, solids, ...this.models.map((m) => m.list), puffs]) {
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
        // Ohne Angabe: Gebäude in ihrer Blickrichtung, Felder mit allen Furchen reif.
        const field = !m && FIELDS.includes(e.shape);
        d[o + 8] = m ? m[0] : field ? -1 : buildingHeading(e.shape);
        d[o + 9] = m ? m[1] : field ? 3 : 0;
        d[o + 10] = m ? m[2] : field ? 1 : 0;
        d[o + 11] = m ? m[3] : field ? 511 : 0;
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
    gl.uniform3fv(this.location('uToCamera'), cameraDirection());
    gl.uniform1f(this.location('uMinSizeTiles'), minSizeTiles);
    gl.uniform1i(this.location('uSilhouette'), 0);
    gl.uniform1f(this.location('uGroundStep'), this.groundStep);
    gl.uniform4fv(this.location('uFlat[0]'), this.flatZones);
    gl.uniform1i(this.location('uFlatCount'), this.flatCount);

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

    gl.uniform1f(this.location('uTime'), animationTime());
    gl.uniform3f(this.location('uPlayerColor'), this.playerColor[0] / 255, this.playerColor[1] / 255, this.playerColor[2] / 255);
    // Herausgezoomt die vereinfachten Fassungen der Vorkommen.
    const cssPixelsPerTile = camera.pixelsPerTile / pixelRatio;
    const lod = LOD_ZOOM.filter((z) => cssPixelsPerTile < z).length;
    const fieldLod = FIELD_LOD_ZOOM.filter((z) => cssPixelsPerTile < z).length;
    let first = flats.length + solids.length;
    const drawModel = (m: (typeof this.models)[number], offset: number) => {
      gl.uniform1f(this.location('uModelScale'), m.scale);
      gl.uniform1f(this.location('uHip'), m.model.hip);
      gl.uniform1f(this.location('uShoulder'), m.model.shoulder);
      gl.uniform1f(this.location('uKnee'), m.model.knee);
      gl.uniform1f(this.location('uElbow'), m.model.elbow);
      gl.uniform1f(this.location('uStride'), m.stride ?? 1);
      gl.uniform1f(this.location('uModelTop'), m.model.top);
      gl.uniform1f(this.location('uMeters'), m.model.meters);
      gl.uniform1f(this.location('uStump'), m.model.stump);
      gl.uniform1f(this.location('uStumpRadius'), m.model.stumpRadius);
      gl.uniform3fv(this.location('uLoadAnchor'), m.model.loadAnchor);
      gl.uniform2fv(this.location('uHub'), m.model.hub);
      gl.uniform2fv(this.location('uLegs'), m.model.legs);
      gl.uniform2fv(this.location('uNeck'), m.model.neck);
      gl.uniform1f(this.location('uSide'), m.model.side);
      const level = FIELDS.includes(m.shape) ? fieldLod : lod;
      this.draw(level > 0 && m.lodMeshes.length > 0 ? m.lodMeshes[level - 1] : m.mesh, offset, m.list.length);
    };
    // Erst alles außer den Figuren, dann die Figuren - dazwischen ihr Umriss,
    // wo etwas vor ihnen steht (wie in AoE2). Die Figuren sind dann noch nicht
    // im Tiefenpuffer und verdecken sich nicht selbst.
    const figures: [(typeof this.models)[number], number][] = [];
    for (const m of this.models) {
      if (m.list.length > 0) {
        if (FIGURES.includes(m.shape)) figures.push([m, first]);
        else drawModel(m, first);
      }
      first += m.list.length;
    }
    if (figures.length > 0) {
      gl.depthMask(false);
      gl.depthFunc(gl.GREATER);
      gl.uniform1i(this.location('uSilhouette'), 1);
      for (const [m, offset] of figures) drawModel(m, offset);
      gl.uniform1i(this.location('uSilhouette'), 0);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      for (const [m, offset] of figures) drawModel(m, offset);
    }

    // Staub zuletzt: halbdurchsichtig über allem, was dahinter steht, ohne
    // selbst Tiefe zu schreiben.
    if (puffs.length > 0) {
      gl.depthMask(false);
      this.draw(this.flat, first, puffs.length);
      gl.depthMask(true);
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
    const figure = e.shape === SHAPE.villager || e.shape === SHAPE.villagerFemale;
    // Dieselbe Mindestgröße wie im Vertex-Shader, sonst schwebt der Balken
    // herausgezoomt im Gebäude statt darüber.
    const size = Math.max(e.size, figure ? minSizeTiles * 0.5 : minSizeTiles);
    let top = model ? model.model.top * model.scale * size : (BOX_TOP[e.shape] ?? 1) * size;
    // Ein liegender Baum ist flach - der Balken gehört knapp darüber.
    if (TREES.includes(e.shape) && e.motion && e.motion[1] > 0.5) top = 0.3 * size;
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
