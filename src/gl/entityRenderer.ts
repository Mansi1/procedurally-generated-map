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
import MOW from '../models/mow_pose.json';
import CARVE from '../models/carve_pose.json';
import humanoidClipsGlb from '../models/humanoid_clips.glb?inline';
import humanoidClipsManifest from '../models/humanoid_clips.json';
import quadrupedClipsGlb from '../models/quadruped_clips.glb?inline';
import quadrupedClipsManifest from '../models/quadruped_clips.json';
import millClipsGlb from '../models/mill_clips.glb?inline';
import millClipsManifest from '../models/mill_clips.json';
import flagClipsGlb from '../models/flag_clips.glb?inline';
import flagClipsManifest from '../models/flag_clips.json';
import {
  BONE, FLAG, FLAG_SEGMENTS, HUMANOID, KNEEL_BIT, MAX_BONES, MILL, PROP_BITS, QUADRUPED, QUADRUPED_BONE, TEXELS_PER_BONE, bakeClip, loadClips,
  type Clip, type Rig,
} from './clips';
import { TERRAIN_COMMON } from './terrainShader';
import { FLATTEN_GLSL, MAX_FLAT_ZONES } from '../world/flatten';
import { parseMtl, parseObj, type ObjTriangle } from './obj';
import villagerMaleObj from '../models/villager_male.obj?raw';
import villagerFemaleObj from '../models/villager_female.obj?raw';
import villagerMtl from '../models/villager.mtl?raw';
import propAxeObj from '../models/prop_axe.obj?raw';
import propKnifeObj from '../models/prop_knife.obj?raw';
import propScytheMaleObj from '../models/prop_scythe_male.obj?raw';
import propScytheFemaleObj from '../models/prop_scythe_female.obj?raw';
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
import treeBirch2Obj from '../models/tree_birch_2.obj?raw';
import treeBirch2Mtl from '../models/tree_birch_2.mtl?raw';
import treeBirch3Obj from '../models/tree_birch_3.obj?raw';
import treeBirch3Mtl from '../models/tree_birch_3.mtl?raw';
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
import { FARM_KINDS, FIELD_PARTS, farmModel } from '../../tools/models/farmsGen.mjs';

/** Teile der Felder aus Blender (assets/blender/models/fields/, docs/BLENDER.md). */
const FIELD_PART_FILES = import.meta.glob('../models/field_*.{obj,mtl}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const FIELD_PART_MODELS = Object.fromEntries(FIELD_PARTS.map((n) => [n, {
  obj: FIELD_PART_FILES[`../models/field_${n}.obj`],
  mtl: FIELD_PART_FILES[`../models/field_${n}.mtl`],
}]));
import deerObj from '../models/deer.obj?raw';
import deerMtl from '../models/deer.mtl?raw';
import hareObj from '../models/hare.obj?raw';
import hareMtl from '../models/hare.mtl?raw';
import cowObj from '../models/cow.obj?raw';
import cowMtl from '../models/cow.mtl?raw';
import sheepObj from '../models/sheep.obj?raw';
import sheepMtl from '../models/sheep.mtl?raw';
import goatObj from '../models/goat.obj?raw';
import goatMtl from '../models/goat.mtl?raw';
import boarObj from '../models/boar.obj?raw';
import boarMtl from '../models/boar.mtl?raw';
import birchLeafUrl from '../textures/birch_leaf.png';
import rallyFlagObj from '../models/rally_flag.obj?raw';
import rallyFlagMtl from '../models/rally_flag.mtl?raw';
import bowyerObj from '../models/bowyer.obj?raw';
import bowyerMtl from '../models/bowyer.mtl?raw';
import armoryObj from '../models/armory.obj?raw';
import armoryMtl from '../models/armory.mtl?raw';
import markerArrowObj from '../models/marker_arrow.obj?raw';
import markerArrowMtl from '../models/marker_arrow.mtl?raw';
import bowObj from '../models/bow.obj?raw';
import bowMtl from '../models/bow.mtl?raw';

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
   * Wild zum Jagen (models/deer.obj, hare.obj, cow.obj, sheep.obj, goat.obj, boar.obj): motion = [Blickrichtung,
   * Phase, Pose (ANIMAL_POSE), 0] - siehe "beast" im Shader.
   */
  deer: 90,
  hare: 91,
  /** Hängebirke: ein Stamm, volle Krone aus hängenden Zweigen (models/tree_birch_2.obj). */
  treeBirch2: 92,
  /** Trauerbirke: gegabelter Stamm, Etagen aus Bögen mit langen Zweig-Vorhängen (models/tree_birch_3.obj). */
  treeBirch3: 93,
  cow: 94,
  sheep: 95,
  goat: 96,
  boar: 97,
  /** Bognerei: Werkstatt mit Werkbank, Bogenstäben und Zielscheibe (models/bowyer.obj). */
  bowyer: 98,
  /** Ein Bogen - Symbol für den Vorrat an Bögen (models/bow.obj). */
  bow: 99,
  /** Waffenkammer: Steinhaus mit Waffengestell, Schilden und Pfeilfässern (models/armory.obj). */
  armory: 100,
  /**
   * Hinweispfeil nach unten über einem Gebäude, dem ein Arbeiter fehlt
   * (models/marker_arrow.obj). motion[1] hebt ihn in Tiles übers Dach, im
   * Shader wippt er.
   */
  markerArrow: 101,
  /**
   * Werkzeuge als Anhänge (models/prop_*.obj): je Werkzeug und Körper eine
   * Form - sie leiht sich beim Zeichnen Gelenke und Clips des Körpers und
   * hängt an seiner rechten Hand (figureProps, docs/ANIMATION.md).
   */
  propAxe: 102,
  propAxeFemale: 103,
  propScythe: 104,
  propScytheFemale: 105,
  propKnife: 106,
  propKnifeFemale: 107,
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
  // motion[2] < 0: steht still. Die Formel liest den Winkel (motion[1]), der
  // Clip "sails" die Mühlenzeit: -motion[2] - 1.
  return [heading, angle, -1 - (t * speed + millClipOffset(phase)), 0];
}

/**
 * Wo in der Schleife des Clips "sails" eine Mühle mit dieser Startstellung
 * steht - wie millClipOffset im Shader: die Böen genau wie bei der Formel,
 * die Drehung bis auf eine Vierteldrehung (die Flügel sehen dann gleich aus)
 * und höchstens 6.4 Grad.
 */
function millClipOffset(phase: number): number {
  let best = 0;
  let err = Infinity;
  for (let k = 0; k < 7; k++) {
    const o = (3.1 * phase + 2 * Math.PI * k) / GUST_RATE;
    const quarter = Math.PI / 2;
    const e = Math.abs(((((SAIL_SPEED * o - phase + quarter / 2) % quarter) + quarter) % quarter) - quarter / 2);
    if (e < err) {
      err = e;
      best = o;
    }
  }
  return best;
}

export function millMotion(x: number, y: number): [number, number, number, number] {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  return [BUILDING_HEADING, r * Math.PI * 2, 0.8 + 0.4 * ((r * 7.13) % 1), 0];
}

const SHAPE_RING = SHAPE.ring;

/** Figuren: verdeckt zeigen sie ihren Umriss. */
/** Anhänge der Dorfbewohner (Werkzeuge) - gezeichnet wie Figuren, mit deren Gelenken und Clips. */
const PROP_SHAPES: number[] = [
  SHAPE.propAxe, SHAPE.propAxeFemale, SHAPE.propScythe, SHAPE.propScytheFemale, SHAPE.propKnife, SHAPE.propKnifeFemale,
];
const FIGURES: number[] = [SHAPE.villager, SHAPE.villagerFemale, ...PROP_SHAPES];
/** Im Shader: ist die Form eine Figur (Dorfbewohner oder ihr Anhang)? */
const FIGURE_TEST = `(shape == ${SHAPE.villager} || shape == ${SHAPE.villagerFemale} || (shape >= ${SHAPE.propAxe} && shape <= ${SHAPE.propKnifeFemale}))`;

/** Alle Bäume - sie werden gefällt und kippen um. */
export const TREES: number[] = [
  SHAPE.tree, SHAPE.treePine, SHAPE.treeOak, SHAPE.treeBirch, SHAPE.treePoplar, SHAPE.treeMaple,
  SHAPE.treeOakOld, SHAPE.treeOakYoung, SHAPE.treeBirch2, SHAPE.treeBirch3,
];

/** Rolle des Laubs (außer Paint) - es wird im Shader weich schattiert. */
/** Muster der Dorfbewohner (vTex) - nur auf Figuren, das Schaf hat auch "Wool". */
const FIGURE_TEX = { cloth: 15, leather: 16, hair: 17, skin: 18 } as const;
const FOLIAGE_ROLE = 12;
/** Textur-Einheit der Blatt-Textur - 0..2 belegt das Gelände. */
const LEAF_TEXTURE_UNIT = 3;
/** Knochen-Matrizen der Clips aus Blender (uClipTex, siehe clips.ts). */
const CLIP_TEXTURE_UNIT = 5;

/**
 * Clips aus Blender (docs/ANIMATION.md, src/models/humanoid_clips.glb). Lässt
 * sich die Bibliothek nicht lesen, laufen die Figuren über die Formeln im
 * Shader weiter.
 */
export const CLIPS: Clip[] = readClips('humanoid', () => loadClips(humanoidClipsGlb, humanoidClipsManifest, HUMANOID));
/** Clips der Tiere (src/models/quadruped_clips.glb, aus assets/blender/clips/quadruped.blend). */
export const ANIMAL_CLIPS: Clip[] = readClips('quadruped', () => loadClips(quadrupedClipsGlb, quadrupedClipsManifest, QUADRUPED));

function readClips(name: string, load: () => Clip[]): Clip[] {
  try {
    return load();
  } catch (error) {
    console.warn(`Clips "${name}" aus Blender nicht geladen - es laufen die Formeln`, error);
    return [];
  }
}

/**
 * Clip-Bibliotheken und welche Modelle sie nutzen - je Bibliothek ein Skelett.
 * Tiere, Mühle und Fahne kommen hier mit ihrem Rig dazu (docs/ANIMATION.md).
 */
const CLIP_LIBRARIES: {
  rig: Rig<any>; clips: Clip[]; shapes: readonly number[];
  /** Art je Modell (Form) - Clips mit Custom Property "species" gelten nur für ihre Arten. */
  species?: Readonly<Record<number, string>>;
}[] = [
  { rig: HUMANOID, clips: CLIPS, shapes: [SHAPE.villager, SHAPE.villagerFemale] },
  {
    rig: QUADRUPED, clips: ANIMAL_CLIPS,
    shapes: [SHAPE.deer, SHAPE.hare, SHAPE.cow, SHAPE.sheep, SHAPE.goat, SHAPE.boar],
    species: {
      [SHAPE.deer]: 'deer', [SHAPE.hare]: 'hare', [SHAPE.cow]: 'cow',
      [SHAPE.sheep]: 'sheep', [SHAPE.goat]: 'goat', [SHAPE.boar]: 'boar',
    },
  },
  // Mühlenflügel (assets/blender/clips/mill.blend): ein Clip "sails" für alle vier Mühlen.
  { rig: MILL, clips: readClips('mill', () => loadClips(millClipsGlb, millClipsManifest, MILL)),
    shapes: [SHAPE.mill, SHAPE.mill2, SHAPE.mill3, SHAPE.mill4] },
  // Fahne am Sammelpunkt (assets/blender/clips/flag.blend): Clip "wave".
  { rig: FLAG, clips: readClips('flag', () => loadClips(flagClipsGlb, flagClipsManifest, FLAG)), shapes: [SHAPE.rallyFlag] },
];

/** Höchstens so viele Clips je Figur (Uniform-Arrays im Shader). */
const MAX_CLIPS = 8;
/**
 * Bilder je Spalte der Clip-Textur. Alle Clips aller Figuren ergeben mehr
 * Bilder, als eine Textur hoch sein darf (WebGL2 garantiert nur 2048) - sie
 * liegen darum in Spalten nebeneinander: Bild g in Spalte g / CLIP_COLUMN_ROWS,
 * Zeile g % CLIP_COLUMN_ROWS.
 */
const CLIP_COLUMN_ROWS = 1024;

/**
 * Pose (motion[2]) >= CLIP_POSE: spielt Clip Nummer pose - CLIP_POSE ab, die
 * Phase (motion[1]) ist dann die Clip-Zeit in Sekunden - für die Galerie.
 */
export const CLIP_POSE = 10;
/** Clip-Uniforms eines Modells (je Modell gesetzt - jedes kann eine andere Bibliothek haben). */
interface ClipUniforms {
  rows: Int32Array;
  frames: Int32Array;
  fps: Float32Array;
  props: Int32Array;
  poseClip: Int32Array;
  poseRate: Float32Array;
  poseShift: Float32Array;
  /** Je Clip: Clip-Zeit = (Zeit - shift) * rate - für Clips ohne Pose (Mühle, Fahne). */
  rate: Float32Array;
  shift: Float32Array;
}
/** Für Modelle ohne Clips. */
const NO_CLIPS: ClipUniforms = {
  rows: new Int32Array(MAX_CLIPS).fill(-1), frames: new Int32Array(MAX_CLIPS).fill(2), fps: new Float32Array(MAX_CLIPS).fill(30),
  props: new Int32Array(MAX_CLIPS), poseClip: new Int32Array(8).fill(-1), poseRate: new Float32Array(8), poseShift: new Float32Array(8),
  rate: new Float32Array(MAX_CLIPS).fill(1), shift: new Float32Array(MAX_CLIPS),
};
/** Kantenlänge der Blatt-Textur in Pixeln (textures/birch_leaf.png). */
const LEAF_TEX_SIZE = 256;
/** Rolle der Blattkarten (Birke): der Shader malt Zweig und Blätter darauf. */
const LEAF_CARD_ROLE = 13;
/** Rolle der Astkarten (Birke): ein ganzer Ast mit hängenden Zweigen und kleinen Blättern. */
const BRANCH_CARD_ROLE = 14;
/** Materialien der Karten, auf die der Shader malt - sie tragen (u, v, Zufall) statt einer Farbe. */
const CARD_MATERIALS = new Set(['LeafCard', 'BranchCard']);
/** Materialien, aus denen eine Krone besteht - daraus Mitte und Ausdehnung (Model.canopy). */
const FOLIAGE_MATERIALS = new Set(['Paint', 'LeafDark', 'LeafLight', 'Needle', 'NeedleDark', 'LeafCard', 'BranchCard']);

/** Bäume und Sträucher - ihr Laub wird weich schattiert (siehe vFoliage). */
const FOLIAGE_SHAPES: number[] = [
  ...TREES, SHAPE.berryBush, SHAPE.berryBush2, SHAPE.berryBush3, SHAPE.berryBush4,
];

/** Diese Formen sind Vorkommen, keine Gebäude oder Figuren. */
/** Tiere - Beine und Kopf bewegt der Shader ("beast"). */
const BEASTS: number[] = [SHAPE.deer, SHAPE.hare, SHAPE.cow, SHAPE.sheep, SHAPE.goat, SHAPE.boar];

export const NATURAL: number[] = [
  ...TREES,
  SHAPE.stoneRock, SHAPE.stoneRock2, SHAPE.stoneRock3, SHAPE.goldRock, SHAPE.goldRock2, SHAPE.goldRock3,
  SHAPE.berryBush, SHAPE.berryBush2, SHAPE.berryBush3, SHAPE.berryBush4,
];

/** Gebäude schauen schräg zur Kamera (die steht bei +x +y). */
export const BUILDING_HEADING = 0.5;

/** Wo die Pflanzen ansetzen, in Metern (SOIL in tools/models/farmsGen.mjs). */
const FIELD_SOIL_METERS = '0.02';

/**
 * Stufen des Werkstücks auf der Werkbank der Bognerei (Objekte "Craft.0" bis
 * "Craft.2" in assets/blender/models/buildings/bowyer.blend): grob behauen, ausgearbeitet,
 * gespannter Bogen.
 */
export const CRAFT_STAGES = 3;

/** Waffenkammer offen: so hoch (Meter) bleiben die Wände stehen (siehe P_CUT_WALL). */
const ARMORY_CUT_METERS = '1.1';

/** Furchen je Feld (FIELD_ROWS in world/catalog.ts, ROWS in farmsGen.mjs). */
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

/** Stand dieser Uhr (Sekunden) - wie uTime im Shader. Für eingestürzte Mühlen (frozenMillMotion). */
export function animationTime(): number {
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
  /** An der Werkbank einen Bogenstab schnitzen: beide Hände ziehen das Zugmesser heran. */
  carve: 5,
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
uniform float uArm;
// Anhänge (Werkzeuge): Mitte der rechten Hand des Körpers in Ruhelage
// (Modell-Einheiten) und wie weit das Zugmesser auf seinen Handabstand
// gestreckt wird.
uniform vec3  uSocket;
uniform float uKnifeScale;          // Figuren: Abstand der Unterarme von der Mitte - Drehpunkt, wenn der Arm zur Mitte schwenkt
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
uniform float uGraze;        // Tiere: so weit senkt sich der Kopf beim Äsen (Radiant)
uniform float uSide;         // Tiere: halbe Breite des Körpers - so liegt es tot auf der Seite
// Bäume: diese Ecke liegt auf der Schnittfläche eines abgesägten Stamms.
float gSawn = 0.0;
// Lage in Ruhelage (Modell-Einheiten des Körpers) - für die Texturen (vLocal).
// Anhänge liegen in Metern im Rahmen der Hand und werden erst auf den Körper gebracht.
vec3 gRest = vec3(0.0);
// Feldpflanzen: 1 = frisch gesät und grün, 0 = reif in ihrer eigenen Farbe.
float gUnripe = 0.0;
uniform vec2  uHub;
uniform float uTime;
// Clips aus Blender (clips.ts): je Bild eine Zeile, je Knochen drei Texel
// (Zeilen einer 3x4-Matrix). uClipRow: erste Zeile des Clips für diese Figur,
// -1 = nicht gebacken. uPoseClip: welcher Clip eine Pose ersetzt (-1 = die
// Formel), Clip-Zeit = (Phase - uPoseShift) * uPoseRate. uClipProps: Bits
// Beil 1, Sense 2, Zugmesser 4 (PROP_BITS), kniend ${KNEEL_BIT} (KNEEL_BIT).
uniform highp sampler2D uClipTex;
uniform int   uClipRow[${MAX_CLIPS}];
uniform int   uClipFrames[${MAX_CLIPS}];
uniform float uClipFps[${MAX_CLIPS}];
uniform int   uClipProps[${MAX_CLIPS}];
// Clips ohne Pose (Mühle, Fahne): Clip-Zeit = (Zeit - uClipShift) * uClipRate.
uniform float uClipRate[${MAX_CLIPS}];
uniform float uClipShift[${MAX_CLIPS}];
// Fahnentuch: vom Mast (x) bis zum Ende (y) in Modell-y, Höhe (z) - die Knochen
// cloth.0-${FLAG_SEGMENTS} liegen gleichmäßig darauf (FLAG in clips.ts).
uniform vec3  uCloth;
uniform int   uPoseClip[8];
uniform float uPoseRate[8];
uniform float uPoseShift[8];


out vec3 vWorld;
out vec3 vColor;
flat out vec3 vParams;
flat out vec3 vTeam;     // Instanzfarbe (Spielerfarbe) - für den Umriss verdeckter Figuren
// Bäume: welche Textur (0 keine, 3 Rinde, 4 Birkenrinde, 5 Schnittfläche)
// und die Lage im Modell in Metern - die Textur haftet am Stamm, auch wenn
// er umfällt.
flat out int vTex;
out vec3 vLocal;
// Laub von Bäumen und Sträuchern (siehe BUSH_AND_TREE_FOLIAGE): Normale von
// der Kronenmitte nach außen und wie tief innen bzw. unten es sitzt (0 Mitte,
// 1 Rand; < 0: kein Laub).
out vec3 vBent;
out float vFoliage;
uniform float uMeters;       // Breite des Modells in Metern (Modell-Einheit)
uniform vec3  uPlayerColor;  // Spielerfarbe - für Felder, deren aColor das Gefälle trägt
uniform float uSkirt;        // 1: Gebäude reichen in den Boden (Spiel), 0: ohne Sockel (Galerie ohne Gelände)
uniform vec3  uCanopy;       // Bäume, Sträucher: Mitte der Krone (Modell-Einheiten)
uniform vec3  uCanopyHalf;   // ... und ihre halbe Ausdehnung
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
const int P_KNIFE = 31;      // Zugmesser in beiden Händen - nur beim Schnitzen zu sehen
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
// Waffenkammer: das Dach (verschwindet, wenn der Zeiger darauf steht), die
// Wände (werden dann niedrig) und die Bögen im Vorrat - je Bogen seine
// Reihenfolge im Nachkomma-Teil (Anteil * 0.45), er erscheint, sobald der
// Füllstand (aMotion.y) darüber liegt. Offen: aMotion.z = 1.
const int P_CUT_ROOF = 28;
const int P_STOCK = 29;
const int P_CUT_WALL = 30;
// Bognerei: was auf der Werkbank entsteht, in ${CRAFT_STAGES} Stufen (Objekte
// "Craft.<n>") - je Stufe ihre Nummer im Nachkomma-Teil. Zu sehen ist die
// zum Fortschritt (aMotion.y, 0..1) passende; aMotion.y < 0: die Bank ist leer.
const int P_CRAFT = 32;


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
// Um die Längsachse am Punkt (y, z) = pivot drehen - ein Arm schwenkt so zur
// Körpermitte hin oder von ihr weg.
vec3 swingSideways(vec3 p, vec2 pivot, float angle) {
  vec2 q = p.yz - pivot;
  float c = cos(angle);
  float s = sin(angle);
  return vec3(p.x, pivot + vec2(q.x * c - q.y * s, q.x * s + q.y * c));
}

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

// Knochen eines Eckpunkts der Figur - Reihenfolge wie HUMANOID_BONES in
// clips.ts. Der Rumpf gehört über der Hüfte zum Oberkörper, darunter zum
// Unterkörper (wie bei den Formeln). Werkzeuge hängen am rechten Unterarm.
int boneOf(int part, float z) {
  if (part == P_LEG_L) return ${BONE['thigh.L']};
  if (part == P_SHIN_L) return ${BONE['shin.L']};
  if (part == P_LEG_R) return ${BONE['thigh.R']};
  if (part == P_SHIN_R) return ${BONE['shin.R']};
  if (part == P_ARM_L) return ${BONE['upperArm.L']};
  if (part == P_FOREARM_L) return ${BONE['forearm.L']};
  if (part == P_ARM_R) return ${BONE['upperArm.R']};
  if (part == P_FOREARM_R || part == P_TOOL || part == P_SCYTHE) return ${BONE['forearm.R']};
  if (part == P_HEAD) return ${BONE.head};
  if (part == P_LOAD) return ${BONE.upperBody};
  return z > uHip ? ${BONE.upperBody} : ${BONE.lowerBody};
}

// Texel "i" (0..2: Zeile der 3x4-Matrix) eines Knochens in Bild "row" - die
// Bilder liegen in Spalten zu ${CLIP_COLUMN_ROWS} (CLIP_COLUMN_ROWS).
vec4 clipTexel(int row, int bone, int i) {
  int column = row / ${CLIP_COLUMN_ROWS};
  int x = column * ${MAX_BONES * TEXELS_PER_BONE} + bone * ${TEXELS_PER_BONE} + i;
  return texelFetch(uClipTex, ivec2(x, row - column * ${CLIP_COLUMN_ROWS}), 0);
}

// Punkt p mit der Matrix eines Knochens in Bild "row".
vec3 clipBone(vec3 p, int row, int bone) {
  vec4 h = vec4(p, 1.0);
  return vec3(dot(clipTexel(row, bone, 0), h), dot(clipTexel(row, bone, 1), h), dot(clipTexel(row, bone, 2), h));
}

// Drehung der Schultern gegen die Hüfte (Radiant) zur Zeit "time": aus der
// Matrix des Oberkörpers, dessen Vorwärts-Achse sie zur Seite dreht (Zeile 1,
// Spalte 0 = sin). Der Rock schwingt damit mit, wie bei den Formeln.
float clipTwist(int clip, float time) {
  int frames = uClipFrames[clip];
  float f = mod(time * uClipFps[clip], float(frames - 1));
  int row = uClipRow[clip] + int(floor(f));
  float s = mix(clipTexel(row, ${BONE.upperBody}, 1).x, clipTexel(row + 1, ${BONE.upperBody}, 1).x, fract(f));
  return asin(clamp(s, -1.0, 1.0));
}

// Punkt p mit einem Knochen des Clips zur Zeit "time" (Sekunden, Schleife),
// zwischen zwei Bildern gemischt.
vec3 clipSkin(vec3 p, int clip, float time, int bone) {
  int frames = uClipFrames[clip];
  // Das letzte Bild gleicht dem ersten - die Schleife ist ein Bild kürzer.
  float f = mod(time * uClipFps[clip], float(frames - 1));
  int f0 = int(floor(f));
  int row = uClipRow[clip] + f0;
  return mix(clipBone(p, row, bone), clipBone(p, row + 1, bone), f - float(f0));
}

// Mühlenzeit für den Clip "sails" (mill_clips.glb): wo in der Schleife eine
// Mühle mit Startstellung "phase" (millMotion) steht. Die Böen treffen genau
// wie bei der Formel (Böen-Takt 3.1 * phase); die Drehung passt bis auf
// höchstens 6.4 Grad - die vier Flügel sind nach einer Vierteldrehung gleich,
// gesucht wird die nächste von sieben Stellungen (millClipOffset in TS).
float millClipOffset(float phase) {
  float best = 0.0;
  float err = 10.0;
  for (int k = 0; k < 7; k++) {
    float o = (3.1 * phase + 6.2831853 * float(k)) / ${GUST_RATE.toFixed(3)};
    float e = abs(mod(${SAIL_SPEED.toFixed(3)} * o - phase + 0.7853982, 1.5707963) - 0.7853982);
    if (e < err) {
      err = e;
      best = o;
    }
  }
  return best;
}

void main() {
  int shape = int(aParams.x + 0.5);
  vec2 center = aTile + 0.5;
  vec3 world;
  vBent = vec3(0.0, 0.0, 1.0);
  vFoliage = -1.0;

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
    bool figure = ${FIGURE_TEST};
    bool prop = shape >= ${SHAPE.propAxe} && shape <= ${SHAPE.propKnifeFemale};
    bool beast = ${BEASTS.map((n) => `shape == ${n}`).join(' || ')};
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
    if (prop) {
      // Anhang (Werkzeug): in Metern im Rahmen der rechten Hand - an die Hand
      // des Körpers, der es trägt, in dessen Einheiten. Das Zugmesser auf
      // seinen Handabstand gestreckt (gebaut ist es für den Mann).
      if (part == P_KNIFE) p.y *= uKnifeScale;
      p = uSocket + p / uMeters;
    }
    gRest = p;

    if (figure) {
      float phase = aMotion.y;
      int pose = int(aMotion.z + 0.5);
      // Clip aus Blender statt Formel: Pose >= CLIP_POSE (Galerie) oder eine
      // Pose, die ein Clip ersetzt (uPoseClip).
      int clip = pose >= ${CLIP_POSE} ? pose - ${CLIP_POSE} : pose < 8 ? uPoseClip[pose] : -1;
      if (clip >= 0 && uClipRow[clip] < 0) clip = -1;
      if (clip >= 0) {
        float time = pose >= ${CLIP_POSE} ? phase : (phase - uPoseShift[pose]) * uPoseRate[pose];
        // Werkzeuge nur, wenn der Clip sie braucht (props in humanoid_clips.json).
        int props = uClipProps[clip];
        bool away = (part == P_TOOL && (props & 1) == 0) || (part == P_SCYTHE && (props & 2) == 0)
            || (part == P_KNIFE && (props & 4) == 0);
        if (away) {
          p = vec3(0.0, 0.0, uHip);
        } else {
          // Die Last waechst mit der Ladung aus dem Ruecken heraus.
          if (part == P_LOAD) p = uLoadAnchor + (p - uLoadAnchor) * aMotion.w;
          // Rock und Hosenboden schwingen etwas mit, wenn sich die Schultern
          // gegen die Hüfte drehen - wie bei den Formeln, vor dem Stauchen.
          if (part == P_TORSO && p.z <= uHip) p.y += clipTwist(clip, time) * 0.25 * (uHip - p.z);
          if ((props & ${KNEEL_BIT}) != 0 && part == P_TORSO && p.z <= uHip) {
            // Kniend: der Rock staucht sich bis zum Boden und legt sich vorn
            // über das aufgestellte Knie - wie bei der Formel für Pose 3, mit
            // deren Absenkung (bob = -(uKnee - 0.04)); die Knochen senken ihn danach.
            float kneelBob = -(uKnee - 0.04);
            float below = (uHip - p.z) / uHip;
            p.z = uHip - (uHip - p.z) * (uHip + kneelBob) / (uHip - 0.02);
            p.x += below * 0.14;
          }
          if (part == P_KNIFE) {
            // Zweihändig: nach der Lage zwischen den Händen auf beide Unterarme verteilt.
            float k = clamp((p.y + uArm) / (2.0 * uArm), 0.0, 1.0);
            p = mix(clipSkin(p, clip, time, ${BONE['forearm.R']}), clipSkin(p, clip, time, ${BONE['forearm.L']}), k);
          } else {
            p = clipSkin(p, clip, time, boneOf(part, p.z));
          }
        }
      } else {
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
        // Arme zur Körpermitte hin (nur beim Mähen).
        float inL = 0.0, inR = 0.0;
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
          // Mähen: breit und leicht gebeugt, vorgeneigt; beide Hände vor dem
          // Körper am Stiel, die linke oben am Ende, die rechte weiter unten
          // (mow_pose.json - danach ist die Sense gebaut). Der Oberkörper dreht
          // hin und her und zieht die Sense flach über den Boden von rechts
          // nach links; die Arme bleiben dabei ruhig, sonst lösten sich die Hände.
          float t = phase * 0.6;
          float sweep = sin(t);
          hipL = 0.3;
          hipR = -0.2;
          kneeL = -0.4;
          kneeR = -0.3;
          shL = ${MOW.left.forward.toFixed(3)};
          elL = ${MOW.left.elbow.toFixed(3)};
          inL = ${MOW.left.inward.toFixed(3)};
          shR = ${MOW.right.forward.toFixed(3)};
          elR = ${MOW.right.elbow.toFixed(3)};
          inR = ${MOW.right.inward.toFixed(3)};
          lean = ${MOW.lean.toFixed(3)};
          twist = sweep * 0.55;
          bob = ${MOW.bob.toFixed(3)};
        } else if (pose == 5) {
          // Schnitzen mit dem Zugmesser an der Werkbank. Ein Zug: schnell zum
          // Körper heran - da schneidet es, und der Ton kommt (villagers.ts,
          // swing) -, dann langsam wieder vor an den Stab. Der Oberkörper geht
          // mit, die Knie federn, der Blick bleibt auf dem Stab. Jeder fünfte
          // Zug ist keiner: er hebt das Messer, richtet sich auf und prüft.
          float t = phase * 0.6 - 4.712389;
          float k = floor(t / 6.2831853);
          float cyc = t / 6.2831853 - k;
          bool inspect = int(mod(k, 5.0) + 0.5) == 4;
          float pull = cyc < 0.3 ? smoothstep(0.0, 0.3, cyc) : 1.0 - smoothstep(0.3, 1.0, cyc);
          float lift = 0.0;
          if (inspect) {
            lift = sin(cyc * 3.1415927);
            pull = 0.4;
          }
          // Über den Stab gebeugt, die Hände auf dem Stab: vorn weit vorgestreckt,
          // beim Zug am Stabende (carve_pose.json - so ausgerechnet, dass sie
          // auf Stabhöhe bleiben), beim Prüfen gehoben.
          hipL = 0.18;
          hipR = -0.12;
          kneeL = -0.32 - 0.1 * pull;
          kneeR = -0.26 - 0.1 * pull;
          shL = mix(${CARVE.extended.shoulder.toFixed(3)}, ${CARVE.pulled.shoulder.toFixed(3)}, pull) + ${CARVE.inspect.shoulder.toFixed(3)} * lift;
          shR = shL;
          elL = mix(${CARVE.extended.elbow.toFixed(3)}, ${CARVE.pulled.elbow.toFixed(3)}, pull) + ${CARVE.inspect.elbow.toFixed(3)} * lift;
          elR = elL;
          inL = 0.22;
          inR = 0.22;
          lean = mix(${CARVE.extended.lean.toFixed(3)}, ${CARVE.pulled.lean.toFixed(3)}, pull) + ${CARVE.inspect.lean.toFixed(3)} * lift;
          // Mal etwas weiter links, mal rechts am Stab.
          twist = 0.06 * sin(k * 1.7);
          bob = -0.04 - 0.02 * pull;
          // Kopf gesenkt, beim Prüfen hebt er ihn.
          if (part == P_HEAD) p = swingAround(p, uShoulder + 0.03, 0.4 - 0.3 * lift);
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
        // Beim Pflücken, Mähen und Schnitzen ist das Beil weggesteckt: alle Ecken auf einen Punkt,
        // die Dreiecke haben dann keine Fläche mehr.
        if (part == P_TOOL && (pose == 3 || pose == 4 || pose == 5)) p = vec3(0.0, 0.0, uHip);
        // Die Sense nur beim Mähen - sonst trägt er das Beil.
        if (part == P_SCYTHE && pose != 4) p = vec3(0.0, 0.0, uHip);
        // Das Zugmesser nur beim Schnitzen. Es hängt an beiden Händen: jeder
        // Punkt geht mit dem rechten und mit dem linken Arm mit, überblendet
        // nach seiner Lage zwischen den Händen - so bleiben beide Griffe fest.
        if (part == P_KNIFE) {
          if (pose != 5) {
            p = vec3(0.0, 0.0, uHip);
          } else {
            vec3 a = swingSideways(swingAround(p, uElbow, elR), vec2(-uArm, uShoulder), inR);
            vec3 b = swingSideways(swingAround(p, uElbow, elL), vec2(uArm, uShoulder), -inL);
            a = swingAround(a, uShoulder, shR);
            b = swingAround(b, uShoulder, shL);
            p = mix(a, b, clamp((p.y + uArm) / (2.0 * uArm), 0.0, 1.0));
          }
        }
        if (legL) p = swingAround(p, uHip, hipL);
        if (legR) p = swingAround(p, uHip, hipR);
        // Beim Mähen schwenkt der hängende Arm erst zur Mitte, dann nach vorn.
        if (armL && inL != 0.0) p = swingSideways(p, vec2(uArm, uShoulder), -inL);
        if (armR && inR != 0.0) p = swingSideways(p, vec2(-uArm, uShoulder), inR);
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
    }

    if (beast) {
      // Tiere: Beine schwingen um ihr oberes Gelenk, der Kopf samt Hals nickt
      // um den Halsansatz. Rehe gehen im Kreuzgang und springen auf der
      // Flucht, Hasen hoppeln - Vorder- und Hinterbeine jeweils zusammen.
      // Kühe trotten auch auf der Flucht im Kreuzgang.
      float phase = aMotion.y;
      int pose = int(aMotion.z + 0.5);
      // Clip aus Blender statt Formel (assets/blender/clips/quadruped.blend): Pose
      // >= CLIP_POSE (Galerie) oder eine Pose, die ein Clip dieser Art ersetzt.
      int clip = pose >= ${CLIP_POSE} ? pose - ${CLIP_POSE} : pose < 8 ? uPoseClip[pose] : -1;
      if (clip >= 0 && uClipRow[clip] < 0) clip = -1;
      if (clip >= 0) {
        float time = pose >= ${CLIP_POSE} ? phase : (phase - uPoseShift[pose]) * uPoseRate[pose];
        // Knochen je Teil (QUADRUPED in clips.ts): die vier Beine, der Kopf, sonst die Wurzel.
        int bone = part == 24 ? ${QUADRUPED_BONE['leg.FL']} : part == 25 ? ${QUADRUPED_BONE['leg.FR']}
            : part == 26 ? ${QUADRUPED_BONE['leg.BL']} : part == 27 ? ${QUADRUPED_BONE['leg.BR']}
            : part == P_HEAD ? ${QUADRUPED_BONE.head} : ${QUADRUPED_BONE.root};
        p = clipSkin(p, clip, time, bone);
      } else {
        bool hare = shape == ${SHAPE.hare};
        bool jump = hare || (pose == 5 && shape != ${SHAPE.cow});
        bool front = part == 24 || part == 25;
        bool leg = part >= 24 && part <= 27;
        vec2 pivot = vec2(front ? uLegs.x : uLegs.y, uHip);
        float bob = 0.0;
        float dip = 0.0;
        if (pose == 1 || pose == 5) {
          float amp = pose == 5 ? 0.8 : 0.45;
          float s = sin(phase);
          float a = 0.0;
          if (jump) {
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
          dip = mix(uGraze, 0.0, up) + sin(phase * 2.3) * 0.05 * (1.0 - up);
        }
        if (part == P_HEAD) p = swingAt(p, uNeck, -dip);
        p.z += bob;
        if (pose == 6) {
          // Erlegt: auf die Seite gekippt, die Beine zeigen zur Seite.
          p = vec3(p.x, -p.z, p.y + uSide);
        }
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

    if (part == P_STOCK && (aCorner.w - 29.0) / 0.45 >= aMotion.y) p = vec3(0.0);
    if (part == P_CRAFT) {
      float own = floor((aCorner.w - 32.0) / 0.45 * ${CRAFT_STAGES}.0);
      float now = floor(clamp(aMotion.y, 0.0, 0.999) * ${CRAFT_STAGES}.0);
      if (aMotion.y < 0.0 || own != now) p = vec3(0.0);
    }
    if (part == P_CUT_ROOF && aMotion.z > 0.5) p = vec3(0.0);
    // Offen: die Wände nur bis gut einen Meter hoch - man schaut hinein.
    if (part == P_CUT_WALL && aMotion.z > 0.5) p.z = min(p.z, ${ARMORY_CUT_METERS} / uMeters);

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

    if (part == P_CLOTH && !figure && uClipRow[0] >= 0) {
      // Fahne am Sammelpunkt: Clip "wave" aus Blender. Die Knochen cloth.0-N
      // liegen gleichmäßig längs des Tuchs; dazwischen die beiden Nachbarn
      // nach der Lage gemischt (an den Eckpunkten genau einer).
      float time = (uTime - uClipShift[0]) * uClipRate[0];
      float s = clamp((p.y - uCloth.x) / (uCloth.y - uCloth.x), 0.0, 1.0) * ${FLAG_SEGMENTS}.0;
      int j = min(int(floor(s)), ${FLAG_SEGMENTS - 1});
      p = mix(clipSkin(p, 0, time, 1 + j), clipSkin(p, 0, time, 2 + j), s - float(j));
    } else if (part == P_CLOTH) {
      // Fahnentuch weht: eine Welle läuft vom Mast zum freien Ende, das
      // weiter ausschlägt als die Seite am Mast. (Rückfall ohne Clip, und
      // die Fahne auf dem Hauptgebäude.)
      p.x += sin(uTime * 5.0 - p.y * 14.0) * 0.12 * p.y;
    }

    if (part == P_SAILS && uClipRow[0] >= 0) {
      // Mühlenflügel: Clip "sails" aus Blender, in Mühlenzeit (Spielzeit *
      // Drehzahl + Stellung der Mühle). aMotion.z < 0: eingestürzt, die Zeit
      // steht bei -aMotion.z - 1 (frozenMillMotion).
      float speed = aMotion.z > 0.0 ? aMotion.z : 1.0;
      float t = aMotion.z < 0.0 ? -aMotion.z - 1.0 : uTime * speed + millClipOffset(aMotion.y);
      p = clipSkin(p, 0, (t - uClipShift[0]) * uClipRate[0], 1);
    } else if (part == P_SAILS) {
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

    // Hinweispfeil: aMotion.y Tiles über dem Boden (übers Dach), wippt.
    if (shape == ${SHAPE.markerArrow}) p.z += (aMotion.y + 0.05 * sin(uTime * 3.0)) / scale;

    // Felder liegen auf ihren Tiles; aMotion.x ist bei ihnen die Furche.
    float heading = field ? 0.0 : aMotion.x;
    vec2 forward = vec2(cos(heading), sin(heading));
    vec2 left = vec2(-forward.y, forward.x);
    vec2 offset = (forward * p.x + left * p.y) * scale;

    // Laub wie eine weiche Kugel beleuchten statt Fläche für Fläche: die
    // Normale zeigt von der Kronenmitte weg ("bent normals"), und was tief
    // in der Krone oder an ihrer Unterseite sitzt, liegt im Schatten.
    int matRole = int(aMaterial.w + 0.5);
    if (${FOLIAGE_SHAPES.map((n) => `shape == ${n}`).join(' || ')}) {
      if (matRole == 1 || matRole == ${FOLIAGE_ROLE} || matRole == ${LEAF_CARD_ROLE} || matRole == ${BRANCH_CARD_ROLE}) {
        vec3 nb = (aCorner.xyz - uCanopy) / max(uCanopyHalf, vec3(0.01));
        vFoliage = clamp(length(nb), 0.0, 1.2) * mix(0.65, 1.0, smoothstep(-1.0, 0.7, nb.z));
        vBent = vec3(forward * nb.x + left * nb.y, nb.z);
      }
    }
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
    if (uSkirt > 0.5 && !figure && !natural && !field && !beast && p.z < 0.001) z = base - 1.0;
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
    bool villager = ${FIGURE_TEST};
    bool figureTex = role >= ${FIGURE_TEX.cloth} && role <= ${FIGURE_TEX.skin};
    vTex = figureTex ? (villager ? role : 0)
      : villager && (role == 1 || role == 2) ? ${FIGURE_TEX.cloth}
      : role >= 6 && role != ${FOLIAGE_ROLE} ? role : !tree ? 0 : gSawn > 0.5 ? 5 : (role == 3 || role == 4) ? role : 0;
    vLocal = gRest * uMeters;
    // Bauvorschau: halbdurchsichtig ganz in der Vorschaufarbe - rot, wenn
    // der Platz nicht geht.
    if (!${FIGURE_TEST} && aParams.y < 0.99 && aMotion.w == 0.0) vColor = aColor;
  }
  vParams = aParams;
  vRoof = aCorner.w;
  gl_Position = project(world.xy, world.z);
  // Figuren und Auswahlring stehen auf der berechneten Geländehöhe; das
  // Geländenetz nähert sie nur mit Dreiecken an und liegt in Mulden etwas
  // höher - es schnitte Füße und Ring ab. Ihre Tiefe wird deshalb um etwa
  // einen halben Tile zur Kamera gezogen; auf dem Bildschirm bleibt alles,
  // wo es ist (siehe project: näher = kleinere Tiefe).
  if (${FIGURE_TEST} || shape == ${SHAPE_RING} || ${BEASTS.map((n) => `shape == ${n}`).join(' || ')}) gl_Position.z -= 0.5 / uDepthRange;
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
in vec3 vBent;
in float vFoliage;

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

uniform sampler2D uLeafTex;  // Foto eines Birkenblatts (Blatt- und Astkarten)

// Birkenrinde wie am Stamm (treeTexture, vTex 4), für gemalte Äste und Zweige:
// uv = (um den Ast herum, entlang des Asts) in Metern, s = Lage quer zum Ast
// (-1..1, für die Rundung), brown = 0 weiße Rinde mit schwarzen Querstrichen
// und Rissen, 1 die dünne rotbraune Rinde junger Zweige.
vec3 birchBark(vec2 uv, float s, float brown) {
  float dash = smoothstep(0.72, 0.8, texNoise(uv * vec2(4.0, 26.0)));
  float crack = smoothstep(0.86, 0.9, texNoise(uv * vec2(9.0, 2.2)));
  vec3 white = vec3(0.9, 0.89, 0.84) * (0.9 + 0.1 * texNoise(uv * vec2(30.0, 10.0)));
  vec3 c = mix(white, vec3(0.12, 0.11, 0.1), max(dash * 0.85, crack));
  vec3 young = vec3(0.38, 0.22, 0.15) * (0.85 + 0.3 * texNoise(uv * vec2(20.0, 60.0)));
  c = mix(c, young, brown);
  // Rund: zu den Rändern hin im Schatten.
  return c * (0.6 + 0.4 * sqrt(max(0.0, 1.0 - s * s)));
}

// Birkenblatt an einem Stiel: d = Punkt relativ zum Ansatz am Zweig, dir =
// Richtung des Blatts, len = Länge samt Stiel (Meter), h = Zufall je Blatt,
// px = Meter je Bildschirmpixel. Gemalt wird ein Foto eines Birkenblatts
// (uLeafTex: Spitze oben, Stiel unten in der Mitte), sein Umriss kommt aus
// der Transparenz. true, wenn der Punkt darauf liegt; col = seine Farbe.
bool birchLeaf(vec2 d, vec2 dir, float len, float h, float px, out vec3 col) {
  float along = dot(d, dir) / len;
  float across = dot(d, vec2(-dir.y, dir.x)) / len;
  if (along < 0.0 || along > 1.0 || abs(across) > 0.5) return false;
  // Feste Mipmap-Stufe: in Schleifen und Verzweigungen gibt es keine
  // verlässlichen Ableitungen für die automatische.
  float lod = log2(max(px / len * ${LEAF_TEX_SIZE}.0, 1.0));
  vec2 uv = vec2(0.5 + across, 1.0 - along);
  // Der Umriss aus einer feinen Stufe - in den groben mittelt sich die
  // Transparenz weg, und weit draußen verschwänden die Blätter. Die Farbe
  // aus der passenden Stufe, damit sie nicht flimmert.
  if (textureLod(uLeafTex, uv, min(lod, 2.0)).a < 0.5) return false;
  vec4 t = textureLod(uLeafTex, uv, lod);
  // Das Foto ist recht dunkel - heller und etwas gelbgrüner, wie im Sommer
  // mit Sonne. Jedes Blatt etwas anders: heller oder dunkler, mal gelblicher.
  vec3 c = t.rgb / max(t.a, 0.2) * vec3(1.35, 1.4, 1.05) * (0.85 + 0.35 * h);
  c = mix(c, c * vec3(1.15, 1.1, 0.7), smoothstep(0.7, 1.0, h) * 0.5);
  if (h > 0.97) c = mix(c, vec3(0.82, 0.72, 0.26), 0.7);
  col = c;
  return true;
}

// Dorfbewohner: Muster in Metern am unbewegten Modell (vLocal: x vorn, y
// links, z oben) - sie wandern also nicht über die Figur, wenn sie sich
// bewegt. Was feiner als ein Pixel ist, geht in den Mittelwert über.
vec3 figureTexture(vec3 base) {
  float px = max(length(fwidth(vLocal)), 1e-4);
  vec3 p = vLocal;
  // Waagerecht um die Figur herum - x + y deckt vorn und die Seiten ab.
  vec2 q = vec2(p.x + p.y, p.z);
  if (vTex == ${FIGURE_TEX.cloth}) {
    // Leinen: Kett- und Schussfäden im Wechsel, längs fallende Falten und
    // leicht fleckig vom Tragen.
    float weave = 0.5 + 0.5 * sin(q.x * 420.0) * sin(q.y * 420.0);
    float thread = texNoise(q * vec2(160.0, 40.0));
    float fold = 0.5 + 0.5 * sin((p.x - p.y) * 28.0 + texNoise(q * vec2(3.0, 1.5)) * 5.0);
    float mottle = texNoise(q * 5.0 + 1.3);
    vec3 c = base * (0.9 + 0.2 * mix(0.5, weave * 0.7 + thread * 0.3, texDetail(67.0, px)));
    c *= 0.88 + 0.16 * mix(0.5, fold, texDetail(5.0, px));
    return c * (0.93 + 0.12 * mottle);
  }
  if (vTex == ${FIGURE_TEX.leather}) {
    // Leder: feine Narbung, dunkle Knitterfalten, hell abgewetzte Stellen.
    float id;
    float e = texCells(q * vec2(16.0, 28.0), id);
    float crease = (1.0 - smoothstep(0.02, 0.07, e)) * texDetail(28.0, px);
    float grain = mix(0.5, texNoise(q * 90.0), texDetail(90.0, px));
    float worn = smoothstep(0.62, 0.85, texNoise(q * 7.0 + 4.1));
    vec3 c = base * (0.92 + 0.08 * id) * (0.88 + 0.24 * grain);
    c = mix(c, base * 1.3 + vec3(0.03), worn * 0.3);
    return mix(c, base * 0.6, crease * 0.35);
  }
  if (vTex == ${FIGURE_TEX.hair}) {
    // Haar: Strähnen, die um den Kopf herum senkrecht fallen, mit hellen
    // Glanzlichtern auf einzelnen Strähnen.
    float around = atan(p.y, p.x) * 0.13;
    float strands = texNoise(vec2(around * 140.0, p.z * 7.0)) * 0.6 + texNoise(vec2(around * 330.0, p.z * 16.0)) * 0.4;
    float shine = smoothstep(0.7, 0.95, texNoise(vec2(around * 60.0, p.z * 3.0) + 7.3));
    vec3 c = base * (0.72 + 0.56 * mix(0.5, strands, texDetail(50.0, px)));
    return mix(c, base * 1.6 + vec3(0.06), shine * 0.3);
  }
  // Haut: kaum sichtbar fleckig, stellenweise etwas röter.
  float mottle = texNoise(q * 18.0);
  float flush = smoothstep(0.55, 0.9, texNoise(q * 4.0 + 2.2));
  vec3 c = base * (0.95 + 0.1 * mix(0.5, mottle, texDetail(18.0, px)));
  return mix(c, c * vec3(1.06, 0.93, 0.9), flush * 0.4);
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
  if (vTex == ${BRANCH_CARD_ROLE}) {
    // Astkarte (Birke): vom Stamm (links, u = 0) ein geschwungener Ast nach
    // außen, von ihm hängen Zweige herab, an denen viele kleine Blätter
    // wechselständig sitzen. Gerechnet in Metern der Karte (2 m x 2.2 m).
    // Je Pixel nur die nächsten Zweige und darin die nächsten Blätter.
    vec2 q = vec2(base.x * 2.0, base.y * 2.2);
    float qpx = max(length(fwidth(q)), 1e-5);
    float seed = base.z;
    vec3 col = vec3(0.0);
    bool hit = false;
    // Der Ast: steigt vom Stamm an, hängt zur Spitze hin durch.
    float branchY = 0.32 - 0.16 * sin(3.1416 * min(q.x, 1.6) / 1.6) + 0.14 * smoothstep(1.1, 2.0, q.x);
    float thick = mix(0.035, 0.008, q.x / 2.0);
    if (abs(q.y - branchY) < thick && q.x < 1.95) {
      float across = (q.y - branchY) / thick;
      col = birchBark(vec2(across * thick * 3.1416, q.x), across, smoothstep(0.2, 1.2, q.x));
      hit = true;
    }
    float spacing = 0.12;
    float nearest = floor((q.x - 0.18) / spacing + 0.5);
    for (int di = -1; di <= 1; di++) {
      float fi = nearest + float(di);
      if (fi < 0.0 || fi > 14.0) continue;
      float h = fract(sin(fi * 91.7 + seed * 311.3) * 43758.5453);
      float x0 = 0.18 + fi * spacing + (h - 0.5) * 0.05;
      float y0 = 0.32 - 0.16 * sin(3.1416 * min(x0, 1.6) / 1.6) + 0.14 * smoothstep(1.1, 2.0, x0);
      float len = 1.0 + h * 0.8 - fi * 0.03;
      float along = q.y - y0;
      if (along < -0.04 || along > len + 0.06) continue;
      float sway = h * 6.2832;
      // Der Zweig selbst.
      float tx = x0 + sin(along * 2.2 + sway) * 0.03;
      if (along > 0.0 && along < len && abs(q.x - tx) < 0.0045) {
        float across = (q.x - tx) / 0.0045;
        col = birchBark(vec2(across * 0.014, along + fi * 1.7), across, 1.0);
        hit = true;
      }
      // Die Blätter daran, klein: die zwei nächsten.
      float leafGap = 0.05;
      float k0 = floor((along - 0.03) / leafGap);
      for (int dk = 0; dk <= 1; dk++) {
        float k = k0 + float(dk);
        float ly = 0.03 + k * leafGap;
        if (k < 0.0 || ly > len) continue;
        float hk = fract(sin((fi * 37.0 + k) * 12.9898 + seed * 78.233) * 43758.5453);
        float side = mod(k, 2.0) < 1.0 ? -1.0 : 1.0;
        vec2 stem = vec2(x0 + sin(ly * 2.2 + sway) * 0.03, y0 + ly);
        // Birkenblätter hängen steil, die Spitze nach unten.
        float ang = side * (0.15 + hk * 0.35);
        vec3 leaf;
        if (birchLeaf(q - stem, vec2(sin(ang), cos(ang)), 0.08 + hk * 0.025, hk, qpx, leaf)) {
          // Tiefer im Vorhang etwas dunkler.
          col = leaf * (1.0 - 0.22 * smoothstep(0.3, 1.6, ly));
          hit = true;
        }
      }
      // Kätzchen: an manchen Zweigen hängt am Ende eine gelbbraune, geschuppte Ähre.
      if (h > 0.72) {
        float cy = along - len;
        float cx = q.x - (x0 + sin(len * 2.2 + sway) * 0.03);
        if (cy > 0.0 && cy < 0.09 && abs(cx) < 0.009 * (1.0 - cy / 0.12)) {
          col = mix(vec3(0.72, 0.6, 0.3), vec3(0.45, 0.3, 0.16), step(0.5, fract(cy * 110.0)));
          hit = true;
        }
      }
    }
    if (!hit) discard;
    return col;
  }
  if (vTex == ${LEAF_CARD_ROLE}) {
    // Blattkarte (Birke): ein hängender Zweig, leicht geschwungen, mit
    // wechselständigen spitz-eiförmigen Blättern an kurzen Stielen. Was kein
    // Zweig und kein Blatt ist, wird verworfen - die Karte selbst sieht man
    // nicht. base = (u, v, Zufall); gerechnet in etwa Metern, damit die
    // Blätter auf der länglichen Karte nicht verzerrt sind.
    vec2 q = vec2(base.x * 0.47, base.y * 1.25);
    float qpx = max(length(fwidth(q)), 1e-5);
    float seed = base.z;
    float bend = seed * 6.2832;
    float twigX = 0.235 + sin(q.y * 2.4 + bend) * 0.035;
    vec3 col = vec3(0.0);
    bool hit = false;
    float twigW = 0.009 + 0.006 * (1.0 - base.y);
    if (abs(q.x - twigX) < twigW && base.y < 0.97) {
      float across = (q.x - twigX) / twigW;
      col = birchBark(vec2(across * twigW * 3.1416, q.y + seed * 5.0), across, 0.85);
      hit = true;
    }
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float h = fract(sin((fi + 1.0) * 12.9898 + seed * 78.233) * 43758.5453);
      float t = 0.07 + fi * 0.098 + (h - 0.5) * 0.03;
      float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
      vec2 stem = vec2(0.235 + sin(t * 2.4 + bend) * 0.035, t);
      // Schräg nach unten und zur Seite, jedes etwas anders.
      float ang = side * (0.2 + h * 0.4);
      vec3 leaf;
      if (birchLeaf(q - stem, vec2(sin(ang), cos(ang)), 0.17 + h * 0.05, h, qpx, leaf)) {
        col = leaf;
        hit = true;
      }
    }
    if (!hit) discard;
    return col;
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
  if (vTex >= ${FIGURE_TEX.cloth} && vTex <= ${FIGURE_TEX.skin}) base = figureTexture(base);
  else if (vTex != 0) base = treeTexture(base);
  if (vRoof > 0.5 && shape != 0 && shape < 5) {
    // Spitzdächer bekommen einen dunklen Ziegelton, damit man Dach und Wand
    // auseinanderhält. Flachdächer bleiben in der Gebäudefarbe.
    base = mix(vColor, vec3(0.42, 0.2, 0.14), 0.55);
  }

  if (vFoliage >= 0.0) {
    // Laub: überwiegend die Kugel-Normale der Krone, ein Rest der Fläche
    // für Struktur. Innen und unten dunkler (Umgebungsverdeckung); wo die
    // Sonne von hinten durch den Kronenrand scheint, leuchtet es gelbgrün
    // durch (Durchscheinen).
    vec3 n = normalize(mix(normal, normalize(vBent), 0.7));
    float sun = dot(n, normalize(SUN));
    float occlusion = mix(0.5, 1.05, smoothstep(0.15, 1.0, vFoliage));
    float lit = (0.42 + 0.72 * max(sun, 0.0)) * occlusion;
    float through = pow(max(-sun, 0.0), 1.5) * smoothstep(0.6, 1.0, vFoliage) * 0.35;
    fragColor = vec4(base * lit + base * vec3(0.9, 1.15, 0.45) * through, alpha);
    return;
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
  // Zugmesser der Figuren (siehe P_KNIFE).
  ['Knife', 31],
  // Waffenkammer (siehe P_CUT_ROOF).
  ['Cut.Roof', 28],
  ['Stock', 29],
  ['Cut.Wall', 30],
  // Werkstück der Bognerei (siehe P_CRAFT).
  ['Craft', 32],
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
  // Laub von Bäumen und Sträuchern: weich schattiert (FOLIAGE_ROLE). Das Laub
  // in der Instanzfarbe (Paint) zählt auch dazu.
  LeafDark: FOLIAGE_ROLE,
  LeafLight: FOLIAGE_ROLE,
  Needle: FOLIAGE_ROLE,
  NeedleDark: FOLIAGE_ROLE,
  LeafCard: LEAF_CARD_ROLE,
  BranchCard: BRANCH_CARD_ROLE,
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
  // Dorfbewohner (nur Figuren, siehe figureTexture): Stoff, Leder, Haar, Haut.
  // Der Kittel (Tunic, Rolle 1) und die Last (Load, Rolle 2) sind auch Stoff.
  Wool: FIGURE_TEX.cloth,
  WoolShade: FIGURE_TEX.cloth,
  Apron: FIGURE_TEX.cloth,
  ApronShade: FIGURE_TEX.cloth,
  Patch: FIGURE_TEX.cloth,
  Band: FIGURE_TEX.cloth,
  Leather: FIGURE_TEX.leather,
  LeatherLight: FIGURE_TEX.leather,
  Boots: FIGURE_TEX.leather,
  BootsDark: FIGURE_TEX.leather,
  BootsLight: FIGURE_TEX.leather,
  Hair: FIGURE_TEX.hair,
  Skin: FIGURE_TEX.skin,
  SkinShade: FIGURE_TEX.skin,
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
  /** Figuren: Abstand der Unterarme von der Mitte (Modell-Einheiten). */
  arm: number;
  /** Bäume: Höhe des Stumpfs (Modell-Einheiten) - dort knickt der Stamm beim Fällen ab. */
  stump: number;
  /** Bäume: Halbmesser des Stumpfs (Modell-Einheiten) - so weit rutscht der Stamm daneben. */
  stumpRadius: number;
  loadAnchor: [number, number, number];
  /** Mitte der Flügel (links, oben). */
  hub: [number, number];
  /** Fahnentuch (Teil Cloth): vom Mast bis zum Ende in Modell-y, seine Höhe - für die Fahne (FLAG). */
  cloth: [number, number, number];
  /** Bäume, Sträucher: Mitte und halbe Ausdehnung der Krone (Modell-Einheiten). */
  canopy: [number, number, number];
  canopyHalf: [number, number, number];
  /** Tiere: Gelenke (vorn) der Vorder- und Hinterbeine, des Halses (vorn, oben), halbe Breite. */
  legs: [number, number];
  neck: [number, number];
  /** Tiere: so weit (Radiant) senkt sich der Kopf beim Äsen - bis das Maul am Boden ist. */
  graze: number;
  side: number;
  /** Höchster Punkt in Modell-Einheiten - dort sitzt der Lebensbalken. */
  top: number;
  /** Eingang (Modell-Einheiten: vorn, links), falls das Modell ihn markiert. */
  entry?: [number, number];
  /** Waffenkammer: so viele Bögen passen sichtbar hinein (Objekte "Stock.<n>"). */
  stockSlots: number;
  /** Werkstatt: wo der Arbeiter steht und wohin er schaut (Modell-Einheiten: vorn, links). */
  work?: { stand: [number, number]; aim: [number, number] };
  /** Figuren: Mitte der rechten Hand in Ruhelage (Modell-Einheiten) - dort hängen Werkzeuge. */
  hand: [number, number, number];
  /** Breite bzw. Höhe in Datei-Einheiten (Metern), auf die das Modell gebracht ist. */
  meters: number;
}

/** Nummer einer Beere aus ihrem Objektnamen ("Berry.12.Shine" -> 12). */
/** Stufe eines Werkstücks ("Craft.2.Grip": 2), siehe P_CRAFT. */
function craftStage(object: string): number {
  return Number(/^Craft\.(\d+)/.exec(object)?.[1] ?? 0);
}

/** Nummer eines Bogens im Vorrat ("Stock.7.Grip": 7), siehe P_STOCK. */
function stockNumber(object: string): number {
  return Number(/^Stock\.(\d+)/.exec(object)?.[1] ?? 0);
}

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

/**
 * Achsen einer Blattkarte aus ihren Eckpunkten: Mitte, Längsachse a (zeigt
 * nach unten, v = 0 am oberen Ende), Querachse b, Wertebereiche und ein Zufall.
 */
function frameOf(points: number[][], index: number) {
  const n = points.length;
  const c = [0, 1, 2].map((i) => points.reduce((sum, p) => sum + p[i], 0) / n);
  const cov = [0, 1, 2].map((i) => [0, 1, 2].map((j) => points.reduce((sum, p) => sum + (p[i] - c[i]) * (p[j] - c[j]), 0)));
  const mul = (v: number[]) => cov.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return v.map((x) => x / l);
  };
  // Größte Hauptachse durch wiederholtes Multiplizieren, die zweite ebenso
  // nach Abzug der ersten.
  let a = norm([0.3, 0.1, 1]);
  for (let i = 0; i < 30; i++) a = norm(mul(a));
  let b = norm([1, 0.2, 0.1]);
  for (let i = 0; i < 30; i++) {
    const m = mul(b);
    const d = m[0] * a[0] + m[1] * a[1] + m[2] * a[2];
    b = norm([m[0] - d * a[0], m[1] - d * a[1], m[2] - d * a[2]]);
  }
  // v ist die senkrechtere der beiden Achsen und wächst nach unten; u zeigt
  // vom Stamm weg (Astkarten beginnen am Stamm, bei x = y = 0).
  if (Math.abs(b[2]) > Math.abs(a[2])) [a, b] = [b, a];
  if (a[2] > 0) a = a.map((x) => -x);
  if (b[0] * c[0] + b[1] * c[1] < 0) b = b.map((x) => -x);
  const proj = (axis: number[]) => points.map((p) => (p[0] - c[0]) * axis[0] + (p[1] - c[1]) * axis[1] + (p[2] - c[2]) * axis[2]);
  const pa = proj(a), pb = proj(b);
  const a0 = Math.min(...pa), b0 = Math.min(...pb);
  return {
    c, a, b, a0, b0,
    aLen: Math.max(1e-6, Math.max(...pa) - a0),
    bLen: Math.max(1e-6, Math.max(...pb) - b0),
    seed: berryRandom(index + 1000),
  };
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
function loadModel(obj: string | ObjTriangle[], mtl: string, unit: 'height' | 'width' | 'meters', lod = false, sawable = false,
                   only?: ObjTriangle[]): Model {
  // Die Objekte "Entry" (Eingang) und "Work.*" (Platz an der Werkbank)
  // markieren nur Stellen - nicht zeichnen, nicht mitmessen.
  const all = typeof obj === 'string' ? parseObj(obj) : obj;
  const isMarker = (object: string) => object.startsWith('Entry') || object.startsWith('Work.');
  const markerPoints = (prefix: string) => all.filter((t) => t.object.startsWith(prefix)).flatMap((t) => t.points);
  const entryPoints = markerPoints('Entry');
  const triangles = all.filter((t) => !isMarker(t.object));
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
  // Plätze für Bögen im Vorrat (Waffenkammer): die höchste Nummer + 1.
  const stockSlots = triangles.reduce((n, t) => (t.object.startsWith('Stock') ? Math.max(n, stockNumber(t.object) + 1) : n), 0);

  let unitLength = maxY - minY;
  // Anhänge: in Metern, wie sie sind - der Shader bringt sie auf den Körper.
  if (unit === 'meters') {
    unitLength = 1;
    minY = 0;
  }
  if (unit === 'width') {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const t of triangles) {
      // Dach und Wände der Waffenkammer stehen still und zählen mit.
      const part = partOf(t.object);
      if (part !== 0 && part !== 28 && part !== 30) continue;
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

  // Figuren: Mitte der rechten Hand in Ruhelage - dort hängen Werkzeuge (uSocket).
  // Der Mittelwert der Eckpunkte des Objekts (so wurden die Werkzeuge an die Hand gesetzt).
  const handPoints = new Map<string, readonly [number, number, number]>();
  for (const t of triangles) {
    if (t.object.startsWith('Arm.R.Lower.Hand')) for (const p of t.points) handPoints.set(p.join(), local(p));
  }
  const hand = [...handPoints.values()].reduce<[number, number, number]>(
    (s, q) => [s[0] + q[0] / handPoints.size, s[1] + q[1] / handPoints.size, s[2] + q[2] / handPoints.size], [0, 0, 0]);

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
  const forearm = [Infinity, 0];
  let stump = 0;
  const load = { back: -Infinity, y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  const crown = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  const legSum = [0, 0];
  const legCount = [0, 0];
  let neck: [number, number] = [0, Infinity];
  /** Vorderster Punkt von Kopf und Hals - das Maul. */
  let mouth: [number, number] = [-Infinity, 0];
  let side = 0;
  const sails = { y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  const cloth = { y: [Infinity, -Infinity], z: [Infinity, -Infinity] };

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

  // Blattkarten: je Karte (Objekt) ihre Achsen - die längste Richtung ist v
  // (0 oben, wo sie am Ast hängt), die zweitlängste u. Gefunden über die
  // Hauptachsen ihrer Eckpunkte; die Karte liegt ja beliebig im Raum.
  const cardPoints = new Map<number, number[][]>();
  for (const t of triangles) {
    if (!CARD_MATERIALS.has(t.material)) continue;
    const list = cardPoints.get(t.index) ?? [];
    for (const p of t.points) list.push([...local(p)]);
    cardPoints.set(t.index, list);
  }
  const cardFrames = new Map<number, ReturnType<typeof frameOf>>();
  const cardFrame = (index: number) => {
    let f = cardFrames.get(index);
    if (!f) {
      f = frameOf(cardPoints.get(index) ?? [[0, 0, 0]], index);
      cardFrames.set(index, f);
    }
    return f;
  };

  // Nur ein Teil des Modells (eine Furche eines Felds) - gemessen am ganzen.
  for (const t of only ?? triangles) {
    const part = partOf(t.object);
    const color = colors.get(t.material) ?? [0.6, 0.6, 0.6];
    const role = MATERIAL_ROLE[t.material] ?? 0;
    // Blattkarte: statt einer Farbe ihre Lage auf der Karte (u, v) und ein
    // Zufall je Karte - der Shader malt Zweig und Blätter danach.
    const card = CARD_MATERIALS.has(t.material) ? cardFrame(t.index) : undefined;
    for (const p of t.points) {
      const [x, y, z] = local(p);
      let rgb = color;
      if (card) {
        const d = [x - card.c[0], y - card.c[1], z - card.c[2]];
        const along = d[0] * card.a[0] + d[1] * card.a[1] + d[2] * card.a[2];
        const across = d[0] * card.b[0] + d[1] * card.b[1] + d[2] * card.b[2];
        rgb = [(across - card.b0) / card.bLen, (along - card.a0) / card.aLen, card.seed];
      }
      // Beeren: je Beere (Objekt) ein fester Zufall im Nachkomma-Teil, siehe P_BERRY.
      const partValue = part === 14 ? 14 + berryRandom(berryNumber(t.object)) * 0.45
        // Bögen im Vorrat: ihre Reihenfolge, die Mitte ihres Anteils.
        : part === 29 ? 29 + ((stockNumber(t.object) + 0.5) / stockSlots) * 0.45
        // Werkstück: seine Stufe, die Mitte ihres Anteils.
        : part === 32 ? 32 + ((craftStage(t.object) + 0.5) / CRAFT_STAGES) * 0.45
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
      v.push(x, y, z, partValue, rgb[0], rgb[1], rgb[2], role);
      if (lod) {
        LOD_PARTS.forEach((min, i) => {
          // Stammstücke bleiben immer - sie sind kurz, der Stamm aber nicht.
          // Stammstücke bleiben immer - sie sind kurz, der Stamm aber nicht.
          // Blattkarten auch: ohne sie stünde die Birke weit draußen kahl da.
          if ((extent.get(t.index) ?? 1) >= min || t.object.startsWith('Trunk') || card) lods[i].push(x, y, z, partValue, rgb[0], rgb[1], rgb[2], role);
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
      if (part === 5 && (x > mouth[0] || (x === mouth[0] && z < mouth[1]))) mouth = [x, z];
      if (part === 0) side = Math.max(side, Math.abs(y));
      if (FOLIAGE_MATERIALS.has(t.material)) {
        [x, y, z].forEach((c, i) => {
          crown.lo[i] = Math.min(crown.lo[i], c);
          crown.hi[i] = Math.max(crown.hi[i], c);
        });
      }
      if (part === 3 || part === 4) shoulder = Math.max(shoulder, z);
      // Knie und Ellbogen an der Oberkante von Unterschenkel und Unterarm.
      if (part === 9 || part === 10) knee = Math.max(knee, z);
      if (part === 11 || part === 12) {
        elbow = Math.max(elbow, z);
        forearm[0] = Math.min(forearm[0], Math.abs(y));
        forearm[1] = Math.max(forearm[1], Math.abs(y));
      }
      if (t.object.startsWith('Trunk.Stump')) stump = Math.max(stump, z);
      if (part === 6) {
        // Die Last hängt mit ihrer Vorderseite am Rücken.
        load.back = Math.max(load.back, x);
        load.y = [Math.min(load.y[0], y), Math.max(load.y[1], y)];
        load.z = [Math.min(load.z[0], z), Math.max(load.z[1], z)];
      }
      if (part === 8) {
        cloth.y = [Math.min(cloth.y[0], y), Math.max(cloth.y[1], y)];
        cloth.z = [Math.min(cloth.z[0], z), Math.max(cloth.z[1], z)];
      }
      if (part === 7) {
        sails.y = [Math.min(sails.y[0], y), Math.max(sails.y[1], y)];
        sails.z = [Math.min(sails.z[0], z), Math.max(sails.z[1], z)];
      }
    }
  }

  // Mitte einer Markierung (Modell-Einheiten: vorn, links).
  const markerAt = (points: [number, number, number][]): [number, number] | undefined => {
    if (points.length === 0) return undefined;
    const c = local(points.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0])
      .map((v) => v / points.length) as [number, number, number]);
    return [c[0], c[1]];
  };
  const stand = markerAt(markerPoints('Work.Stand'));
  const aim = markerAt(markerPoints('Work.Aim'));
  return {
    entry: markerAt(entryPoints),
    work: stand && aim && { stand, aim },
    stockSlots,
    vertices: new Float32Array(v),
    lods: lod ? lods.map((l) => new Float32Array(l)) : undefined,
    hip,
    shoulder,
    knee,
    elbow,
    arm: Number.isFinite(forearm[0]) ? (forearm[0] + forearm[1]) / 2 : 0,
    stump,
    stumpRadius,
    loadAnchor: Number.isFinite(load.back)
      ? [load.back, (load.y[0] + load.y[1]) / 2, (load.z[0] + load.z[1]) / 2]
      : [0, 0, 0],
    hub: [(sails.y[0] + sails.y[1]) / 2, (sails.z[0] + sails.z[1]) / 2],
    cloth: Number.isFinite(cloth.y[0]) ? [cloth.y[0], cloth.y[1], (cloth.z[0] + cloth.z[1]) / 2] : [0, 1, 0],
    canopy: Number.isFinite(crown.lo[0]) ? crown.lo.map((l, i) => (l + crown.hi[i]) / 2) as [number, number, number] : [0, 0, 0.5],
    canopyHalf: Number.isFinite(crown.lo[0]) ? crown.lo.map((l, i) => (crown.hi[i] - l) / 2) as [number, number, number] : [0.5, 0.5, 0.5],
    legs: [legSum[0] / Math.max(1, legCount[0]), legSum[1] / Math.max(1, legCount[1])],
    neck: Number.isFinite(neck[1]) ? neck : [0, 0],
    graze: Number.isFinite(neck[1]) && Number.isFinite(mouth[0]) ? grazeAngle(neck, mouth) : 0,
    side,
    top: (maxY - minY) / unitLength,
    meters: unitLength,
    hand,
  };
}

/**
 * Winkel, um den sich der Kopf um den Halsansatz drehen muss, damit das Maul
 * (knapp über) den Boden erreicht. Kurze Hälse (Wildschwein) brauchen weniger
 * als lange (Reh, Kuh) - ein fester Winkel ließe den Kopf sonst nach hinten
 * vor den Körper klappen. Höchstens 1.45 - so weit senken Reh und Kuh den Kopf.
 */
function grazeAngle(neck: [number, number], mouth: [number, number]): number {
  const dx = mouth[0] - neck[0];
  const dz = mouth[1] - neck[1];
  const length = Math.hypot(dx, dz);
  const ground = 0.03;
  const reach = (ground - neck[1]) / length;
  const angle = Math.atan2(dz, dx) - (reach <= -1 ? -Math.PI / 2 : Math.asin(reach));
  return Math.min(1.45, Math.max(0.2, angle));
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
    const { obj, mtl } = farmModel(kind, detail, FIELD_PART_MODELS);
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
const PROP_AXE = loadModel(propAxeObj, villagerMtl, 'meters');
const PROP_KNIFE = loadModel(propKnifeObj, villagerMtl, 'meters');

const MODELS: {
  shape: number; model: Model; scale: number; stride?: number;
  /** Anhang: der Körper, dessen Gelenke, Clips und Hand es beim Zeichnen nutzt. */
  body?: number;
}[] = [
  { shape: SHAPE.villager, model: loadModel(villagerMaleObj, villagerMtl, 'height'), scale: 1.7 },
  // Kürzere Schritte, sonst treten die Beine hinten aus dem langen Rock.
  { shape: SHAPE.villagerFemale, model: loadModel(villagerFemaleObj, villagerMtl, 'height'), scale: 1.7, stride: 0.6 },
  // Werkzeuge als Anhänge: Beil und Zugmesser einmal für beide Körper, die
  // Sense je Körper (ihr Stiel liegt in der Mäh-Haltung in beiden Händen).
  { shape: SHAPE.propAxe, model: PROP_AXE, scale: 1.7, body: SHAPE.villager },
  { shape: SHAPE.propAxeFemale, model: PROP_AXE, scale: 1.7, body: SHAPE.villagerFemale },
  { shape: SHAPE.propKnife, model: PROP_KNIFE, scale: 1.7, body: SHAPE.villager },
  { shape: SHAPE.propKnifeFemale, model: PROP_KNIFE, scale: 1.7, body: SHAPE.villagerFemale },
  { shape: SHAPE.propScythe, model: loadModel(propScytheMaleObj, villagerMtl, 'meters'), scale: 1.7, body: SHAPE.villager },
  { shape: SHAPE.propScytheFemale, model: loadModel(propScytheFemaleObj, villagerMtl, 'meters'), scale: 1.7, body: SHAPE.villagerFemale },
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
  { shape: SHAPE.bowyer, model: loadModel(bowyerObj, bowyerMtl, 'width'), scale: 1 },
  { shape: SHAPE.bow, model: loadModel(bowObj, bowMtl, 'height'), scale: 1 },
  { shape: SHAPE.armory, model: loadModel(armoryObj, armoryMtl, 'width'), scale: 1 },
  { shape: SHAPE.markerArrow, model: loadModel(markerArrowObj, markerArrowMtl, 'height'), scale: 1 },
  ...FARM_KINDS.flatMap((kind, i) => fieldModels(kind, FIELD_BASES[i])),
  ...natural(SHAPE.tree, treeSpruceObj, treeSpruceMtl, TREE_METERS),
  ...natural(SHAPE.treePine, treePineObj, treePineMtl, TREE_METERS),
  ...natural(SHAPE.treeOak, treeOakObj, treeOakMtl, TREE_METERS),
  ...natural(SHAPE.treeBirch, treeBirchObj, treeBirchMtl, TREE_METERS),
  ...natural(SHAPE.treeBirch2, treeBirch2Obj, treeBirch2Mtl, TREE_METERS),
  ...natural(SHAPE.treeBirch3, treeBirch3Obj, treeBirch3Mtl, TREE_METERS),
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
  { shape: SHAPE.cow, model: loadModel(cowObj, cowMtl, 'height'), scale: 1 },
  { shape: SHAPE.sheep, model: loadModel(sheepObj, sheepMtl, 'height'), scale: 1 },
  { shape: SHAPE.goat, model: loadModel(goatObj, goatMtl, 'height'), scale: 1 },
  { shape: SHAPE.boar, model: loadModel(boarObj, boarMtl, 'height'), scale: 1 },
];

/**
 * Halber Handabstand (Meter), für den das Zugmesser gebaut ist - der des
 * Mannes (prop_knife.blend). Andere Körper strecken es auf ihren.
 */
const KNIFE_HALF_SPAN = (() => {
  const man = MODELS.find((m) => m.shape === SHAPE.villager)!.model;
  return Math.abs(man.hand[1]) * man.meters;
})();

/** Anhänge der Dorfbewohner: Bit in den props eines Clips (PROP_BITS) → Form je Körper. */
const FIGURE_PROPS: { bit: number; shapes: Record<number, number> }[] = [
  { bit: PROP_BITS.axe, shapes: { [SHAPE.villager]: SHAPE.propAxe, [SHAPE.villagerFemale]: SHAPE.propAxeFemale } },
  { bit: PROP_BITS.scythe, shapes: { [SHAPE.villager]: SHAPE.propScythe, [SHAPE.villagerFemale]: SHAPE.propScytheFemale } },
  { bit: PROP_BITS.knife, shapes: { [SHAPE.villager]: SHAPE.propKnife, [SHAPE.villagerFemale]: SHAPE.propKnifeFemale } },
];

/**
 * Was eine Figur in der Hand hat - Bits aus PROP_BITS: die props des Clips,
 * den ihre Pose spielt (humanoid_clips.json). Ohne Clip wie die Formeln:
 * Beil beim Stehen, Gehen und Hacken, Sense beim Mähen, Zugmesser beim Schnitzen.
 */
function propsOfPose(pose: number): number {
  if (pose >= CLIP_POSE) return CLIPS[pose - CLIP_POSE]?.props ?? 0;
  const clip = CLIPS.find((c) => c.pose === pose);
  if (clip) return clip.props;
  return pose <= POSE.work ? PROP_BITS.axe : pose === POSE.scythe ? PROP_BITS.scythe : pose === POSE.carve ? PROP_BITS.knife : 0;
}

/**
 * Die Anhänge (Werkzeuge) einer Figur als eigene Instanzen: gleiche Lage,
 * Größe und Bewegung wie die Figur - der Shader hängt sie an ihre Hand.
 * Leer für alles, was keine Figur ist. Wer Figuren zeichnet, zeichnet diese dazu.
 */
export function figureProps(figure: EntityInstance): EntityInstance[] {
  if (figure.shape !== SHAPE.villager && figure.shape !== SHAPE.villagerFemale) return [];
  const bits = propsOfPose(Math.round(figure.motion?.[2] ?? 0));
  return FIGURE_PROPS
    .filter((p) => (bits & p.bit) !== 0)
    .map((p) => ({ ...figure, shape: p.shapes[figure.shape], health: undefined }));
}

/**
 * Eingang eines Gebäudes in der Welt: Mitte (x, y wie EntityInstance, also
 * Tile-Anker), Größe und Blickrichtung wie beim Zeichnen. Undefined, wenn das
 * Modell keinen Eingang markiert.
 */
export function modelEntry(shape: number, x: number, y: number, size: number, heading: number): { x: number; y: number } | undefined {
  const m = MODELS.find((entry) => entry.shape === shape);
  return m?.model.entry && modelToWorld(m, m.model.entry, x, y, size, heading);
}

/**
 * Platz an der Werkbank einer Werkstatt in der Welt: wo der Arbeiter steht
 * und wohin er schaut. Undefined, wenn das Modell ihn nicht markiert.
 */
export function modelWorkSpot(shape: number, x: number, y: number, size: number, heading: number):
    { x: number; y: number; aimX: number; aimY: number } | undefined {
  const m = MODELS.find((entry) => entry.shape === shape);
  if (!m?.model.work) return undefined;
  const stand = modelToWorld(m, m.model.work.stand, x, y, size, heading);
  const aim = modelToWorld(m, m.model.work.aim, x, y, size, heading);
  return { ...stand, aimX: aim.x, aimY: aim.y };
}

/** Wie viele Bögen im Modell sichtbar gestapelt werden können (Waffenkammer), sonst 0. */
export function modelStockSlots(shape: number): number {
  return MODELS.find((entry) => entry.shape === shape)?.model.stockSlots ?? 0;
}

/** Punkt im Modell (vorn, links) in der Welt - wie beim Zeichnen gedreht und skaliert. */
function modelToWorld(m: { scale: number }, [f, l]: [number, number], x: number, y: number, size: number, heading: number) {
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
  /** Gebäude mit Sockel in den Boden - ohne Gelände (Galerie) stünden sie auf Stelzen. */
  skirts = true;
  /** Spielerfarbe (0..255) - Felder bekommen sie als Uniform (siehe uPlayerColor). */
  playerColor: [number, number, number] = [64, 160, 72];
  private models: {
    shape: number; model: Model; scale: number; stride?: number; body?: number;
    mesh: Mesh; lodMeshes: Mesh[]; list: EntityInstance[];
  }[];
  private instanceBuffer: WebGLBuffer;
  /** Foto eines Birkenblatts für die Blatt- und Astkarten (uLeafTex). */
  private leafTexture: WebGLTexture;
  /** Knochen-Matrizen der Clips, für jede Figur gebacken (uClipTex, siehe clips.ts). */
  private clipTexture: WebGLTexture;
  /** Clip-Uniforms je Modell (Form): erste Zeile jedes Clips in clipTexture, Länge, Pose ... */
  private clipUniforms = new Map<number, ClipUniforms>();
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
    gl.uniform1i(this.location('uLeafTex'), LEAF_TEXTURE_UNIT);

    // Blatt-Textur: bis das Bild geladen ist, ein einzelnes grünes Pixel.
    this.leafTexture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + LEAF_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.leafTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([110, 160, 60, 255]));
    gl.activeTexture(gl.TEXTURE0);
    const image = new Image();
    image.onload = () => {
      gl.activeTexture(gl.TEXTURE0 + LEAF_TEXTURE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, this.leafTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
    };
    image.src = birchLeafUrl;

    this.clipTexture = this.bakeClips();
  }

  /**
   * Backt jeden Clip für jede Figur (Mann, Frau) mit ihren Gelenken in eine
   * Float-Textur: je Bild eine Zeile, je Knochen drei Texel. Setzt die
   * Uniforms, die für alle Figuren gleich sind.
   */
  private bakeClips(): WebGLTexture {
    const gl = this.gl;
    // Ein Bild ist MAX_BONES Knochen breit, gleich für jedes Skelett.
    const width = MAX_BONES * TEXELS_PER_BONE;
    const blocks: { data: Float32Array; bones: number }[] = [];
    let rows = 0;
    for (const library of CLIP_LIBRARIES) {
      const clips = library.clips.slice(0, MAX_CLIPS);
      if (clips.length === 0 || library.rig.bones.length > MAX_BONES) continue;
      for (const m of this.models) {
        if (!library.shapes.includes(m.shape)) continue;
        const u: ClipUniforms = {
          rows: new Int32Array(MAX_CLIPS).fill(-1),
          frames: Int32Array.from(NO_CLIPS.frames), fps: Float32Array.from(NO_CLIPS.fps), props: new Int32Array(MAX_CLIPS),
          poseClip: new Int32Array(8).fill(-1), poseRate: new Float32Array(8), poseShift: new Float32Array(8),
          rate: new Float32Array(MAX_CLIPS).fill(1), shift: new Float32Array(MAX_CLIPS),
        };
        const species = library.species?.[m.shape];
        clips.forEach((clip, i) => {
          // Clips anderer Arten (z. B. das Hoppeln des Hasen) nicht für dieses Tier.
          if (clip.species.length > 0 && (species === undefined || !clip.species.includes(species))) return;
          u.rows[i] = rows;
          u.frames[i] = clip.frames;
          u.fps[i] = clip.fps;
          u.props[i] = clip.props | (clip.kneel ? KNEEL_BIT : 0);
          u.rate[i] = clip.phaseRate;
          u.shift[i] = clip.phaseShift;
          // Welche Pose ein Clip ersetzt, steht im Clip selbst (Custom Property
          // "pose" der Action in Blender). Die Phase (motion[1]) wird zur
          // Clip-Zeit: (Phase - phaseShift) * phaseRate.
          if (clip.pose !== null && clip.pose >= 0 && clip.pose < 8) {
            u.poseClip[clip.pose] = i;
            u.poseRate[clip.pose] = clip.phaseRate;
            u.poseShift[clip.pose] = clip.phaseShift;
          }
          blocks.push({ data: bakeClip(clip, m.model, { stride: m.stride }, library.rig), bones: library.rig.bones.length });
          rows += clip.frames;
        });
        this.clipUniforms.set(m.shape, u);
      }
    }
    // Bilder in Spalten zu CLIP_COLUMN_ROWS nebeneinander (siehe clipTexel im Shader).
    const columns = Math.max(1, Math.ceil(rows / CLIP_COLUMN_ROWS));
    const height = Math.max(1, Math.min(rows, CLIP_COLUMN_ROWS));
    if (columns * width > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
      console.warn(`Clips: ${rows} Bilder passen nicht in eine Textur - es laufen die Formeln`);
      this.clipUniforms.clear();
      rows = 0;
    }
    const data = new Float32Array(columns * width * height * 4);
    let frame = 0;
    for (const block of rows > 0 ? blocks : []) {
      const perFrame = block.bones * TEXELS_PER_BONE * 4;
      for (let f = 0; f < block.data.length / perFrame; f++, frame++) {
        const column = Math.floor(frame / CLIP_COLUMN_ROWS);
        const row = frame % CLIP_COLUMN_ROWS;
        data.set(block.data.subarray(f * perFrame, (f + 1) * perFrame), (row * columns * width + column * width) * 4);
      }
    }
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + CLIP_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, columns * width, height, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.location('uClipTex'), CLIP_TEXTURE_UNIT);
    return texture;
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
    gl.uniform1f(this.location('uSkirt'), this.skirts ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0 + LEAF_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.leafTexture);
    gl.activeTexture(gl.TEXTURE0 + CLIP_TEXTURE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.clipTexture);
    gl.activeTexture(gl.TEXTURE0);
    // Herausgezoomt die vereinfachten Fassungen der Vorkommen.
    const cssPixelsPerTile = camera.pixelsPerTile / pixelRatio;
    const lod = LOD_ZOOM.filter((z) => cssPixelsPerTile < z).length;
    const fieldLod = FIELD_LOD_ZOOM.filter((z) => cssPixelsPerTile < z).length;
    let first = flats.length + solids.length;
    const drawModel = (m: (typeof this.models)[number], offset: number) => {
      // Ein Anhang (Werkzeug) zeichnet sich mit Gelenken, Clips und Hand
      // seines Körpers - er bewegt sich genau mit dessen Unterarm.
      const b = m.body === undefined ? m : this.models.find((x) => x.shape === m.body) ?? m;
      gl.uniform1f(this.location('uModelScale'), m.scale);
      gl.uniform3fv(this.location('uSocket'), b.model.hand);
      gl.uniform1f(this.location('uKnifeScale'), Math.abs(b.model.hand[1]) * b.model.meters / KNIFE_HALF_SPAN);
      gl.uniform1f(this.location('uHip'), b.model.hip);
      gl.uniform1f(this.location('uShoulder'), b.model.shoulder);
      gl.uniform1f(this.location('uKnee'), b.model.knee);
      gl.uniform1f(this.location('uElbow'), b.model.elbow);
      gl.uniform1f(this.location('uArm'), b.model.arm);
      gl.uniform1f(this.location('uStride'), b.stride ?? 1);
      gl.uniform1f(this.location('uModelTop'), m.model.top);
      gl.uniform1f(this.location('uMeters'), b.model.meters);
      gl.uniform1f(this.location('uStump'), m.model.stump);
      gl.uniform1f(this.location('uStumpRadius'), m.model.stumpRadius);
      gl.uniform3fv(this.location('uLoadAnchor'), b.model.loadAnchor);
      gl.uniform2fv(this.location('uHub'), m.model.hub);
      gl.uniform2fv(this.location('uLegs'), m.model.legs);
      gl.uniform3fv(this.location('uCanopy'), m.model.canopy);
      gl.uniform3fv(this.location('uCanopyHalf'), m.model.canopyHalf);
      gl.uniform2fv(this.location('uNeck'), m.model.neck);
      gl.uniform1f(this.location('uGraze'), m.model.graze);
      gl.uniform1f(this.location('uSide'), m.model.side);
      const clips = this.clipUniforms.get(b.shape) ?? NO_CLIPS;
      gl.uniform1iv(this.location('uClipRow'), clips.rows);
      gl.uniform1iv(this.location('uClipFrames'), clips.frames);
      gl.uniform1fv(this.location('uClipFps'), clips.fps);
      gl.uniform1iv(this.location('uClipProps'), clips.props);
      gl.uniform1fv(this.location('uClipRate'), clips.rate);
      gl.uniform1fv(this.location('uClipShift'), clips.shift);
      gl.uniform3fv(this.location('uCloth'), m.model.cloth);
      gl.uniform1iv(this.location('uPoseClip'), clips.poseClip);
      gl.uniform1fv(this.location('uPoseRate'), clips.poseRate);
      gl.uniform1fv(this.location('uPoseShift'), clips.poseShift);
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
