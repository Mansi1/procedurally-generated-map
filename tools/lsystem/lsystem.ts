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
//   L    Laub; ebenso alle Zeichen in `leaves`
// Andere Zeichen (A, B, ...) sind nur Platzhalter für die Regeln.
//
// Die Astdicke folgt dem Pipe-Modell (da Vinci): der Querschnitt eines Astes
// trägt alle Spitzen darüber - r = tip * spitzen^(1/pipe).
import { model, type Model } from '../models/primitives.mjs';

export type Vec3 = readonly [number, number, number];

/** Material der Äste und des Laubs - Namen aus PALETTE in tools/models/lib.mjs. */
export type LeafMaterial = 'Leaf' | 'Ivy' | 'IvyDark';
export const BARK = 'Bark';

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
  readonly leafMaterials: readonly LeafMaterial[];
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
  readonly p: Vec3;
  /** Blickrichtung der Schildkröte dort. */
  readonly heading: Vec3;
}

export interface Skeleton {
  readonly segments: readonly Segment[];
  /** Radius je Ast am Anfang und am Ende. */
  readonly radii: readonly (readonly [number, number])[];
  readonly leaves: readonly Leaf[];
}

export interface Tree {
  readonly model: Model;
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
}

/** Die Schildkröte liest die Zeichen und liefert das Gerüst. Maße in Metern, y oben. */
export function interpret(tokens: readonly Token[], spec: TreeSpec, rnd: () => number): Skeleton {
  const jitter = (v: number) => v * (1 + (rnd() * 2 - 1) * spec.jitter);
  const leafSymbols = new Set(['L', ...spec.leaves]);
  const segments: Segment[] = [];
  const leaves: Leaf[] = [];
  const stack: Turtle[] = [];
  let t: Turtle = { p: [0, 0, 0], frame: { h: [0, 1, 0], l: [-1, 0, 0], u: [0, 0, 1] }, step: spec.length, segment: -1 };

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
        t = { ...t, p, segment, frame: bend(t.frame, spec.tropism) };
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
      case '[': stack.push(t); break;
      case ']': t = stack.pop() ?? t; break;
      default: if (leafSymbols.has(symbol)) leaves.push({ p: t.p, heading: t.frame.h });
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
  return turnFrame(frame, [axis[0] / mag, axis[1] / mag, axis[2] / mag], tropism * mag);
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

/** Das Gerüst als Modell: Äste als Balken, Laub als kleine Büschel. */
export function build(skeleton: Skeleton, spec: TreeSpec, rnd: () => number): Model {
  const m = model();
  skeleton.segments.forEach((s, i) => {
    const [r0, r1] = skeleton.radii[i];
    m.beam(r0 > 0.12 ? 'Trunk' : 'Branch', BARK, s.a, s.b, r0 * 2, { w1: r1 * 2, n: sides(r0) });
  });
  skeleton.leaves.forEach(({ p, heading }, i) => {
    const mtl = spec.leafMaterials[i % spec.leafMaterials.length];
    const r = spec.leafSize * (0.7 + rnd() * 0.6);
    if (spec.leafShape === 'needle') {
      // Nadelbüschel: länglich entlang des Zweigs, zur Spitze schmaler.
      m.beam('Needles', mtl, add(p, heading, -r * 0.6), add(p, heading, r * 0.6), r * 1.4, { w1: r * 0.5, n: 4 });
    } else {
      m.box('Leaves', mtl, [p[0] - r, p[0] + r], [p[1] - r * 0.6, p[1] + r * 0.7], [p[2] - r, p[2] + r],
        { n: 5, rot: rnd() * 3, x: [p[0] - r * 0.4, p[0] + r * 0.4], z: [p[2] - r * 0.4, p[2] + r * 0.4] });
    }
  });
  return m;
}

/** Vom Rezept zum Modell. Wirft bei unlesbaren Regeln. */
export function grow(spec: TreeSpec): Tree {
  const rnd = rng(spec.seed);
  const { tokens, iterations, capped } = rewrite(tokenize(spec.axiom), parseRules(spec.rules), spec.iterations, rnd);
  const skeleton = interpret(tokens, spec, rnd);
  return {
    model: build(skeleton, spec, rnd),
    symbols: tokens.length,
    iterations,
    capped,
    segments: skeleton.segments.length,
    leaves: skeleton.leaves.length,
    height: skeleton.segments.reduce((top, s) => Math.max(top, s.b[1]), 0),
  };
}
