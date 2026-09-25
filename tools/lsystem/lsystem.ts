// L-System-Bäume in 3D (https://en.wikipedia.org/wiki/L-system): Ersetzungs-
// regeln erzeugen eine Zeichenkette, eine Schildkröte im Raum liest sie und
// zeichnet Äste und Laub. Läuft im Browser (index.html) und in Node
// (export.ts) - daher nur primitives.mjs, kein node:fs.
//
// Zeichen der Schildkröte (wie in "The Algorithmic Beauty of Plants"); jedes
// darf ein Zahl-Argument in Klammern haben, z. B. F(2) oder +(30):
//   F    Ast zeichnen (aktuelle Länge oder Argument)   f    nur bewegen
//   + -  gieren um die Hochachse U                      & ^  nicken um die Querachse L
//   \ /  rollen um die Blickrichtung H                  |    umdrehen (180°)
//   [ ]  Zustand merken / zurückholen (Verzweigung)
//   "    Länge mal lengthFactor (oder Argument)
//   ~    Tropismus ab hier für diesen Ast (Argument; ohne: wieder der des Rezepts)
//   L    Laub; ebenso alle Zeichen in `leaves`
//   Zeichen in `organs` werden als Organ gezeichnet (Blatt, Ähre, Kolben ...);
//   ein Argument vergrößert es, z. B. B(0.7)
// Andere Zeichen (A, B, ...) sind nur Platzhalter für die Regeln.
//
// Die Astdicke folgt dem Pipe-Modell (da Vinci): der Querschnitt eines Astes
// trägt alle Spitzen darüber - r = tip * spitzen^(1/pipe).
import { model, type Model } from '../models/primitives.mjs';
import { barkFor, barkMeters, type BarkName } from './bark/data.ts';
import { hasCard, leafMaterial, placeLeaf, type LeafMaterialInfo, type LeafMode } from './foliage.ts';
import type { LeafName } from './leaves/data.ts';
import type { Material } from './materials.ts';

export type { LeafMode } from './foliage.ts';

export type Vec3 = readonly [number, number, number];

/** Ein Pflanzenteil, das an einem Zeichen sitzt. Maße in Metern, mal dem Argument des Zeichens. */
export interface Organ {
  /**
   * clump: Laubbüschel, needle: Nadelbüschel entlang des Zweigs,
   * blade: flaches, spitzes Blatt, das sich zum Boden biegt (Gras, Mais),
   * spindle: Spindel entlang der Blickrichtung (Ähre, Kolben, Rispe)
   */
  readonly shape: 'clump' | 'needle' | 'blade' | 'spindle';
  /** Größe bzw. Länge. */
  readonly size: number;
  /** Breite im Verhältnis zur Länge (blade, spindle). */
  readonly width?: number;
  /** Wie weit sich ein Blatt zum Boden biegt, in Grad über die ganze Länge. */
  readonly droop?: number;
  /** Der Reihe nach vergeben. */
  readonly materials: readonly Material[];
  /** Mehrere rund um die Blickrichtung - Rosette, Büschel, Rispe (Standard 1). */
  readonly count?: number;
  /** Neigung der Rosetten-Teile gegen die Blickrichtung, in Grad. */
  readonly spread?: number;
  /** Wahrscheinlichkeit, dass es an einem Zeichen wirklich sitzt (Standard 1), z. B. Früchte. */
  readonly chance?: number;
  /** clump und needle: statt der einfachen Form echte Blätter dieses Fotos (leaves/). */
  readonly leaf?: LeafName;
  /** Blätter je Büschel (clump, Standard 6). */
  readonly leafCount?: number;
}

export interface Token {
  readonly symbol: string;
  readonly arg: number | null;
}

interface Production {
  readonly weight: number;
  readonly successor: readonly Token[];
}

export type Rules = ReadonlyMap<string, readonly Production[]>;

export interface TreeSpec {
  readonly label: string;
  readonly axiom: string;
  /** Eine Regel je Zeile, siehe parseRules. */
  readonly rules: string;
  readonly iterations: number;
  readonly seed: number;
  /** Drehwinkel in Grad. */
  readonly angle: number;
  /** Länge eines F in Metern. */
  readonly length: number;
  /** Faktor für `"`. */
  readonly lengthFactor: number;
  /** Zufällige Abweichung von Winkeln und Längen, 0..1. */
  readonly jitter: number;
  /** Neigung zur Schwerkraft je Ast; negativ: nach oben. */
  readonly tropism: number;
  /** Zeichen außer L, an denen Laub sitzt (meist die unfertigen Knospen). */
  readonly leaves: string;
  readonly leafShape: 'clump' | 'needle';
  /** Halbe Größe eines Laubbüschels in Metern. */
  readonly leafSize: number;
  readonly leafMaterials: readonly Material[];
  /** Blattfoto für das Laub (leaves/); ohne: einfache Büschel. */
  readonly leaf?: LeafName;
  /** Blätter je Büschel, wenn `leaf` gesetzt ist (Standard 6). */
  readonly leafCount?: number;
  /** Weitere Organe je Zeichen, z. B. Blätter und Ähren beim Getreide. */
  readonly organs?: Readonly<Record<string, Organ>>;
  /** Material der Äste bzw. Halme. */
  readonly stemMaterial: Material;
  /** Rinden-Textur (bark/), sonst die Standard-Textur des Materials (MATERIAL_BARK). */
  readonly barkTexture?: BarkName;
  /** Radius einer Astspitze in Metern. */
  readonly tip: number;
  /** Exponent des Pipe-Modells: 2 = Fläche bleibt gleich, größer = schlankerer Stamm. */
  readonly pipe: number;
}

export interface Segment {
  readonly a: Vec3;
  readonly b: Vec3;
  /** Index des Astes, aus dem dieser wächst; -1 am Boden. */
  readonly parent: number;
}

export interface Leaf {
  readonly symbol: string;
  /** Größenfaktor aus dem Argument des Zeichens. */
  readonly scale: number;
  readonly p: Vec3;
  /** Blickrichtung und linke Seite der Schildkröte dort. */
  readonly heading: Vec3;
  readonly left: Vec3;
}

export interface Skeleton {
  readonly segments: readonly Segment[];
  /** Radius je Ast am Anfang und am Ende. */
  readonly radii: readonly (readonly [number, number])[];
  readonly leaves: readonly Leaf[];
}

export interface Tree {
  readonly model: Model;
  /** Materialien der Blätter (Name im Modell -> Foto und Farbe), für Vorschau und MTL. */
  readonly leafMaterials: ReadonlyMap<string, LeafMaterialInfo>;
  /** Rinde: Stamm-Material und seine Textur; null, wenn der Stamm einfarbig bleibt. */
  readonly bark: { readonly material: Material; readonly texture: BarkName } | null;
  readonly symbols: number;
  /** Ausgeführte Schritte - weniger als verlangt, wenn die Kette zu lang wurde. */
  readonly iterations: number;
  readonly capped: boolean;
  readonly segments: number;
  readonly leaves: number;
  readonly height: number;
}

/** Längste Zeichenkette, die noch ersetzt wird - danach hängt der Browser. */
const MAX_SYMBOLS = 400_000;
const DEG = Math.PI / 180;
const GRAVITY: Vec3 = [0, -1, 0];

/** Kleiner, schneller Zufallsgenerator mit Seed, gleiche Folge wie tools/models/trees.mjs. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

/** 'F(2)+' -> [{F, 2}, {+, null}]; Leerzeichen zählen nicht. */
export function tokenize(str: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < str.length; i++) {
    const symbol = str[i];
    if (/\s/.test(symbol)) continue;
    if (str[i + 1] !== '(') {
      tokens.push({ symbol, arg: null });
      continue;
    }
    const end = str.indexOf(')', i + 2);
    if (end < 0) throw new Error(`Fehlende ")" nach ${symbol}`);
    const arg = Number(str.slice(i + 2, end));
    if (!Number.isFinite(arg)) throw new Error(`Keine Zahl: ${str.slice(i, end + 1)}`);
    tokens.push({ symbol, arg });
    i = end;
  }
  return tokens;
}

/**
 * Regeln aus Text, eine je Zeile: `A -> F[+A]`, mit Gewicht `A 0.3 -> FA`.
 * Mehrere Zeilen für dasselbe Zeichen werden zufällig nach Gewicht gewählt.
 * `#` leitet einen Kommentar ein.
 */
export function parseRules(text: string): Rules {
  const rules = new Map<string, Production[]>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = /^(\S)\s*(\d*\.?\d+)?\s*->\s*(.*)$/.exec(line);
    if (!m) throw new Error(`Regel nicht lesbar: ${line}`);
    const [, symbol, weight, successor] = m;
    const list = rules.get(symbol) ?? [];
    list.push({ weight: weight ? Number(weight) : 1, successor: tokenize(successor) });
    rules.set(symbol, list);
  }
  return rules;
}

function choose(options: readonly Production[], rnd: () => number): Production {
  if (options.length === 1) return options[0];
  let r = rnd() * options.reduce((sum, o) => sum + o.weight, 0);
  for (const o of options) if ((r -= o.weight) <= 0) return o;
  return options[options.length - 1];
}

/** `iterations` Ersetzungsschritte, parallel über die ganze Kette. */
export function rewrite(axiom: readonly Token[], rules: Rules, iterations: number, rnd: () => number) {
  let current = axiom;
  for (let step = 0; step < iterations; step++) {
    const next: Token[] = [];
    for (const t of current) {
      const options = rules.get(t.symbol);
      if (options) next.push(...choose(options, rnd).successor);
      else next.push(t);
    }
    if (next.length > MAX_SYMBOLS) return { tokens: current, iterations: step, capped: true };
    current = next;
  }
  return { tokens: current, iterations, capped: false };
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => add([0, 0, 0], a, 1 / (length(a) || 1));

/** v um die Einheitsachse k drehen (Rodrigues). */
function rotate(v: Vec3, k: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(add([0, 0, 0], v, c), cross(k, v), s), k, dot(k, v) * (1 - c));
}

/** Blickrichtung H, links L, oben U - rechtshändig, H × L = U. */
interface Frame {
  readonly h: Vec3;
  readonly l: Vec3;
  readonly u: Vec3;
}

const turnFrame = (f: Frame, axis: Vec3, angle: number): Frame =>
  ({ h: rotate(f.h, axis, angle), l: rotate(f.l, axis, angle), u: rotate(f.u, axis, angle) });

interface Turtle {
  readonly p: Vec3;
  readonly frame: Frame;
  readonly step: number;
  /** Zuletzt gezeichneter Ast auf diesem Weg. */
  readonly segment: number;
  readonly tropism: number;
}

/** Die Schildkröte liest die Zeichen und liefert das Gerüst. Maße in Metern, y oben. */
export function interpret(tokens: readonly Token[], spec: TreeSpec, rnd: () => number): Skeleton {
  const jitter = (v: number) => v * (1 + (rnd() * 2 - 1) * spec.jitter);
  const leafSymbols = new Set(['L', ...spec.leaves, ...Object.keys(spec.organs ?? {})]);
  const segments: Segment[] = [];
  const leaves: Leaf[] = [];
  const stack: Turtle[] = [];
  let t: Turtle = { p: [0, 0, 0], frame: { h: [0, 1, 0], l: [-1, 0, 0], u: [0, 0, 1] }, step: spec.length, segment: -1, tropism: spec.tropism };

  const turn = (axis: keyof Frame, degrees: number) => {
    t = { ...t, frame: turnFrame(t.frame, t.frame[axis], jitter(degrees * DEG)) };
  };

  for (const { symbol, arg } of tokens) {
    const angle = arg ?? spec.angle;
    switch (symbol) {
      case 'F':
      case 'f': {
        const p = add(t.p, t.frame.h, jitter(arg ?? t.step));
        let segment = t.segment;
        if (symbol === 'F') segment = segments.push({ a: t.p, b: p, parent: t.segment }) - 1;
        t = { ...t, p, segment, frame: bend(t.frame, t.tropism) };
        break;
      }
      case '+': turn('u', angle); break;
      case '-': turn('u', -angle); break;
      case '&': turn('l', angle); break;
      case '^': turn('l', -angle); break;
      case '\\': turn('h', angle); break;
      case '/': turn('h', -angle); break;
      case '|': t = { ...t, frame: turnFrame(t.frame, t.frame.u, Math.PI) }; break;
      case '"': t = { ...t, step: t.step * (arg ?? spec.lengthFactor) }; break;
      case '~': t = { ...t, tropism: arg ?? spec.tropism }; break;
      case '[': stack.push(t); break;
      case ']': t = stack.pop() ?? t; break;
      default:
        if (leafSymbols.has(symbol)) leaves.push({ symbol, scale: arg ?? 1, p: t.p, heading: t.frame.h, left: t.frame.l });
    }
  }
  return { segments, radii: pipeRadii(segments, spec), leaves };
}

/** Tropismus: die Blickrichtung neigt sich zur Schwerkraft, umso mehr, je quer sie steht. */
function bend(frame: Frame, tropism: number): Frame {
  if (!tropism) return frame;
  const axis = cross(frame.h, GRAVITY);
  const mag = length(axis);
  if (mag < 1e-6) return frame;
  return turnFrame(frame, normalize(axis), tropism * mag);
}

/** Pipe-Modell: Spitzen über jedem Ast zählen, daraus die Radien. */
function pipeRadii(segments: readonly Segment[], spec: TreeSpec): [number, number][] {
  const children = segments.map((): number[] => []);
  segments.forEach((s, i) => { if (s.parent >= 0) children[s.parent].push(i); });
  // Kinder stehen immer hinter ihrem Elternast - rückwärts aufsummieren.
  const tips = new Array<number>(segments.length).fill(1);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (children[i].length) tips[i] = children[i].reduce((sum, k) => sum + tips[k], 0);
  }
  const radius = (i: number) => spec.tip * tips[i] ** (1 / spec.pipe);
  return segments.map((_, i) => {
    const r = radius(i);
    const end = children[i].length ? Math.max(...children[i].map(radius)) : r * 0.6;
    return [r, end];
  });
}

/** Eckenzahl eines Astes: dicke rund, dünne dreieckig. */
const sides = (r: number) => (r > 0.08 ? 7 : r > 0.03 ? 5 : 3);

/**
 * Ast als Prisma mit Texturkoordinaten: der Mantel abgewickelt, u läuft um den
 * Stamm herum (Umfang in Metern), v den Ast entlang (Weg vom Boden), beides in
 * Kacheln der Rinden-Textur (`tile` Meter je Kachel). `uOff` versetzt die
 * Abwicklung, damit nicht jeder Ast dieselbe Stelle der Textur zeigt.
 */
function barkBeam(m: Model, name: string, mtl: string, a: Vec3, b: Vec3, r0: number, r1: number, n: number,
  dist: number, uOff: number, tile: number, caps: { readonly bottom: boolean; readonly top: boolean }) {
  const d = add(b, a, -1);
  const len = length(d);
  if (len < 1e-6) return;
  const h: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const up: Vec3 = Math.abs(h[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s1 = normalize(cross(h, up));
  const s2 = cross(s1, h);
  const ring = (c: Vec3, r: number) => Array.from({ length: n + 1 }, (_, k): Vec3 => {
    const t = Math.PI / n + ((k % n) * 2 * Math.PI) / n; // k = n schließt den Mantel (gleicher Punkt, volles u)
    return add(add(c, s1, Math.cos(t) * r), s2, Math.sin(t) * r);
  });
  const vertices = [...ring(a, r0), ...ring(b, r1)];
  const u = (k: number) => uOff + (k / n) * ((Math.PI * (r0 + r1)) / tile); // mittlerer Umfang
  const uvs: [number, number][] = [
    ...Array.from({ length: n + 1 }, (_, k): [number, number] => [u(k), dist / tile]),
    ...Array.from({ length: n + 1 }, (_, k): [number, number] => [u(k), (dist + len) / tile]),
  ];
  const faces: number[][] = Array.from({ length: n }, (_, k) => [k, k + 1, n + 2 + k, n + 1 + k]);
  // Deckel nur, wo man sie sehen kann: am Boden und an Astspitzen ohne Kinder.
  if (caps.bottom) faces.push(Array.from({ length: n }, (_, k) => n - 1 - k));
  if (caps.top) faces.push(Array.from({ length: n }, (_, k) => n + 1 + k));
  m.mesh(name, mtl, vertices, faces, uvs);
}

/** Wie das Laub gebaut wird. */
export interface GrowOptions {
  /** Blätter als Form nach dem Umriss (Standard) oder als Foto-Textur. */
  readonly leaves?: LeafMode;
  /** Blattebenen (ein Zweig mit mehreren Blättern je Fläche) statt einzelner Blätter - Standard ja. */
  readonly cards?: boolean;
}

/** Zeichnet in ein Modell; sammelt die benutzten Blatt-Materialien. */
interface Drawing {
  readonly m: Model;
  readonly mode: LeafMode;
  readonly cards: boolean;
  readonly rnd: () => number;
  readonly leafMaterials: Map<string, LeafMaterialInfo>;
}

/** Das Gerüst als Modell: Äste als Balken, dazu Laub und Organe. */
export function build(skeleton: Skeleton, spec: TreeSpec, rnd: () => number, { leaves = 'shape', cards = true }: GrowOptions = {}) {
  const m = model();
  const drawing: Drawing = { m, mode: leaves, cards, rnd, leafMaterials: new Map() };
  const texture = barkFor(spec.stemMaterial, spec.barkTexture);
  const bark = texture ? { material: spec.stemMaterial, texture } : null;
  const { segments } = skeleton;
  if (!bark) {
    segments.forEach((s, i) => {
      const [r0, r1] = skeleton.radii[i];
      m.beam(r0 > 0.12 ? 'Trunk' : 'Branch', spec.stemMaterial, s.a, s.b, r0 * 2, { w1: r1 * 2, n: sides(r0) });
    });
  } else {
    // Weg vom Boden und u-Versatz je Ast: Kinder setzen die Abwicklung des
    // Elternastes fort, damit die Textur den Stamm hinaufläuft statt je
    // Stück neu anzusetzen.
    const tile = barkMeters(bark.texture);
    const len = segments.map((s) => length(add(s.b, s.a, -1)));
    const dist = new Array<number>(segments.length).fill(0);
    const uOff = new Array<number>(segments.length).fill(0);
    const hasChild = new Array<boolean>(segments.length).fill(false);
    segments.forEach((s, i) => {
      if (s.parent < 0) { uOff[i] = (i * 0.618) % 1; return; }
      dist[i] = dist[s.parent] + len[s.parent];
      uOff[i] = uOff[s.parent];
      hasChild[s.parent] = true;
    });
    segments.forEach((s, i) => {
      const [r0, r1] = skeleton.radii[i];
      barkBeam(m, r0 > 0.12 ? 'Trunk' : 'Branch', spec.stemMaterial, s.a, s.b, r0, r1, sides(r0),
        dist[i], uOff[i], tile, { bottom: s.parent < 0, top: !hasChild[i] });
    });
  }
  const foliage: Organ = {
    shape: spec.leafShape, size: spec.leafSize, materials: spec.leafMaterials, leaf: spec.leaf, leafCount: spec.leafCount,
  };
  const count = new Map<Organ, number>();
  for (const leaf of skeleton.leaves) {
    const organ = spec.organs?.[leaf.symbol] ?? foliage;
    if (organ.size <= 0 || rnd() >= (organ.chance ?? 1)) continue;
    const n = count.get(organ) ?? 0;
    count.set(organ, n + 1);
    const mtl = organ.materials[n % organ.materials.length];
    for (const part of rosette(leaf, organ, rnd)) drawOrgan(drawing, organ, mtl, part);
  }
  return { model: m, leafMaterials: drawing.leafMaterials, bark };
}

/** Die Teile eines Organs: bei count > 1 rund um die Blickrichtung verteilt und um spread geneigt. */
function rosette(leaf: Leaf, organ: Organ, rnd: () => number): Leaf[] {
  const count = organ.count ?? 1;
  if (count <= 1) return [leaf];
  const tilt = (organ.spread ?? 45) * DEG;
  const offset = rnd() * Math.PI * 2;
  return Array.from({ length: count }, (_, i) => {
    const around = offset + (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
    const left = rotate(leaf.left, leaf.heading, around);
    return { ...leaf, heading: rotate(leaf.heading, left, tilt * (0.8 + rnd() * 0.4)), left };
  });
}

/** Zufällige Richtung, gleich verteilt auf der Kugel. */
function randomUnit(rnd: () => number): Vec3 {
  for (;;) {
    const v: Vec3 = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
    const l = length(v);
    if (l > 0.05 && l <= 1) return normalize(v);
  }
}

/** Blätter auf einer Blattebene im Mittel (4 bis 6) - so viele Einzelblätter ersetzt eine Ebene. */
const LEAVES_PER_CARD = 3;

/**
 * Echte Blätter statt der einfachen Form: ein Büschel (clump) aus leafCount
 * Blättern bzw. entsprechend weniger Blattebenen, die vom Punkt aus nach außen
 * und etwas nach oben zeigen, oder ein Zweigstück (needle) entlang der
 * Astrichtung - flach wie ein Nadelzweig.
 */
function drawLeaves(drawing: Drawing, organ: Organ, leaf: LeafName, material: Material, { p, heading, left }: Leaf, size: number) {
  const { m, mode, rnd } = drawing;
  const card = drawing.cards && organ.shape === 'clump' && hasCard(leaf);
  const { name, info } = leafMaterial(leaf, material, card);
  drawing.leafMaterials.set(name, info);
  if (organ.shape === 'needle') {
    const dir = normalize(add(heading, randomUnit(rnd), 0.15));
    const side = normalize(add(left, dir, -dot(left, dir)));
    placeLeaf(m, mode, leaf, false, name, add(p, dir, -size), dir, side, size * (3 + rnd() * 0.8));
    return;
  }
  const leaves = organ.leafCount ?? 6;
  const count = card ? Math.max(1, Math.round(leaves / LEAVES_PER_CARD)) : leaves;
  // Eine Ebene reicht weiter als ein Blatt: ihr Fuß sitzt näher am Ast, sie ist länger.
  const reach = card ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const out = randomUnit(rnd);
    const dir = normalize(add(add(out, heading, 0.5), [0, 1, 0], 0.35));
    const side = normalize(cross(dir, randomUnit(rnd)));
    const base = add(p, out, size * (card ? -0.2 : 0.3));
    placeLeaf(m, mode, leaf, card, name, base, dir, side, size * reach * (0.75 + rnd() * 0.4));
  }
}

function drawOrgan(drawing: Drawing, organ: Organ, mtl: Material, part: Leaf) {
  const { m, rnd } = drawing;
  const { p, heading, left, scale } = part;
  const size = organ.size * scale;
  const width = size * (organ.width ?? 0.1);
  if (organ.leaf && (organ.shape === 'clump' || organ.shape === 'needle')) {
    drawLeaves(drawing, organ, organ.leaf, mtl, part, size);
    return;
  }
  switch (organ.shape) {
    case 'clump': {
      const r = size * (0.7 + rnd() * 0.6);
      m.box('Leaves', mtl, [p[0] - r, p[0] + r], [p[1] - r * 0.6, p[1] + r * 0.7], [p[2] - r, p[2] + r],
        { n: 5, rot: rnd() * 3, x: [p[0] - r * 0.4, p[0] + r * 0.4], z: [p[2] - r * 0.4, p[2] + r * 0.4] });
      break;
    }
    case 'needle': {
      // Nadelbüschel: länglich entlang des Zweigs, zur Spitze schmaler.
      const r = size * (0.7 + rnd() * 0.6);
      m.beam('Needles', mtl, add(p, heading, -r * 0.6), add(p, heading, r * 0.6), r * 1.4, { w1: r * 0.5, n: 4 });
      break;
    }
    case 'spindle': {
      // Dick in der Mitte, spitz am Ende.
      const mid = add(p, heading, size * 0.45), end = add(p, heading, size);
      m.beam('Organ', mtl, p, mid, width * 0.7, { w1: width, n: 6 });
      m.beam('Organ', mtl, mid, end, width, { w1: width * 0.25, n: 6 });
      break;
    }
    case 'blade':
      blade(m, mtl, p, heading, left, size, width, (organ.droop ?? 60) * DEG);
      break;
  }
}

/** Breite eines Blattes entlang der Länge, 0..1: schmal am Ansatz, spitz am Ende. */
const BLADE_PROFILE = [0.5, 1, 0.95, 0.75, 0.45, 0.05];

/**
 * Flaches Blatt in einigen Stücken, jedes etwas weiter zum Boden gebogen.
 * Die Fläche liegt quer zur linken Seite der Schildkröte.
 */
function blade(m: Model, mtl: Material, p: Vec3, heading: Vec3, left: Vec3, bladeLength: number, width: number, droop: number) {
  const pieces = BLADE_PROFILE.length - 1;
  const thick = Math.max(0.002, width * 0.08);
  let dir = heading, at = p;
  for (let i = 0; i < pieces; i++) {
    // Seite und Dicke senkrecht zur aktuellen Richtung.
    const side = normalize(add(left, dir, -dot(left, dir)));
    const up = cross(dir, side);
    const ring = (c: Vec3, w: number) => [
      add(add(c, side, w / 2), up, thick), add(add(c, side, -w / 2), up, thick),
      add(add(c, side, -w / 2), up, -thick), add(add(c, side, w / 2), up, -thick),
    ];
    const next = add(at, dir, bladeLength / pieces);
    m.emit('Blade', mtl, ring(at, width * BLADE_PROFILE[i]), ring(next, width * BLADE_PROFILE[i + 1]));
    at = next;
    const axis = cross(dir, GRAVITY);
    if (length(axis) > 1e-6) dir = rotate(dir, normalize(axis), droop / pieces);
  }
}

/** Vom Rezept zum Modell. Wirft bei unlesbaren Regeln. */
export function grow(spec: TreeSpec, options: GrowOptions = {}): Tree {
  const rnd = rng(spec.seed);
  const { tokens, iterations, capped } = rewrite(tokenize(spec.axiom), parseRules(spec.rules), spec.iterations, rnd);
  const skeleton = interpret(tokens, spec, rnd);
  return {
    ...build(skeleton, spec, rnd, options),
    symbols: tokens.length,
    iterations,
    capped,
    segments: skeleton.segments.length,
    leaves: skeleton.leaves.length,
    height: skeleton.segments.reduce((top, s) => Math.max(top, s.b[1]), 0),
  };
}
