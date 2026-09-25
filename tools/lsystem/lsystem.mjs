// L-System-Bäume in 3D (https://en.wikipedia.org/wiki/L-system): Ersetzungs-
// regeln erzeugen eine Zeichenkette, eine Schildkröte im Raum liest sie und
// zeichnet Äste und Laub. Läuft im Browser (tools/lsystem/index.html) und in
// Node (tools/lsystem/export.mjs) - also nur primitives.mjs, kein node:fs.
//
// Zeichen der Schildkröte (wie in "The Algorithmic Beauty of Plants"), jedes
// Zeichen darf ein Argument in Klammern haben, z. B. F(2) oder +(30):
//   F    Ast zeichnen (Länge = aktuelle Länge oder Argument), f  nur bewegen
//   + -  gieren um die Hochachse U          & ^  nicken um die Querachse L
//   \ /  rollen um die Blickrichtung H      |    umdrehen (180°)
//   [ ]  Zustand merken / zurückholen (Verzweigung)
//   "    Länge mal lengthFactor (oder Argument)
//   L    Laub; auch alle Zeichen in `leaves` werden als Laub gezeichnet
// Andere Zeichen (A, B, ...) sind nur Platzhalter für die Regeln.
//
// Die Astdicke folgt dem Pipe-Modell (da Vinci): jeder Ast ist so dick, dass
// sein Querschnitt die Spitzen darüber trägt - r = tip * spitzen^(1/pipe).
import { model } from '../models/primitives.mjs';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489917) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

/** Zeichenkette in Zeichen mit optionalem Zahl-Argument: 'F(2)+' -> [['F', 2], ['+', null]]. */
export function tokenize(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (/\s/.test(c)) continue;
    if (str[i + 1] === '(') {
      const end = str.indexOf(')', i + 2);
      if (end < 0) throw new Error(`fehlende ) nach ${c}`);
      out.push([c, Number(str.slice(i + 2, end))]);
      i = end;
    } else out.push([c, null]);
  }
  return out;
}

/**
 * Regeln aus Text, eine je Zeile: `A -> F[+A]` oder mit Gewicht `A 0.3 -> FA`.
 * Mehrere Zeilen für dasselbe Zeichen werden zufällig nach Gewicht gewählt.
 * `#` leitet einen Kommentar ein.
 */
export function parseRules(text) {
  const rules = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^(\S)\s*([\d.]+)?\s*->\s*(.*)$/);
    if (!m) throw new Error(`Regel nicht lesbar: ${line}`);
    (rules[m[1]] ??= []).push({ w: m[2] ? Number(m[2]) : 1, to: tokenize(m[3]) });
  }
  return rules;
}

/** `n` Ersetzungsschritte. Hört vor `max` Zeichen auf, damit der Browser nicht hängt. */
export function rewrite(axiom, rules, n, rnd, max = 400_000) {
  let cur = tokenize(axiom);
  for (let i = 0; i < n; i++) {
    const next = [];
    for (const t of cur) {
      const opts = rules[t[0]];
      if (!opts) { next.push(t); continue; }
      let pick = opts[0];
      if (opts.length > 1) {
        let r = rnd() * opts.reduce((s, o) => s + o.w, 0);
        for (const o of opts) if ((r -= o.w) <= 0) { pick = o; break; }
      }
      for (const u of pick.to) next.push(u);
    }
    if (next.length > max) return { tokens: cur, steps: i, capped: true };
    cur = next;
  }
  return { tokens: cur, steps: n, capped: false };
}

const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Vektor v um die Einheitsachse k drehen (Rodrigues). */
function rot(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), d = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c);
  const kv = cross(k, v);
  return v.map((x, i) => x * c + kv[i] * s + k[i] * d);
}

/**
 * Die Schildkröte liest die Zeichen und liefert das Gerüst: Äste (mit ihrem
 * Elternast, für die Dicke) und Laubpunkte. Maße in Metern, y nach oben.
 */
export function interpret(tokens, o, rnd) {
  const deg = Math.PI / 180;
  const jit = (a) => a * (1 + (rnd() * 2 - 1) * (o.jitter ?? 0));
  const leafSyms = new Set(['L', ...(o.leaves ?? '')]);
  const gravity = [0, -1, 0];
  let s = { p: [0, 0, 0], H: [0, 1, 0], L: [-1, 0, 0], U: [0, 0, 1], len: o.length ?? 1, seg: -1 };
  const stack = [], segs = [], leaves = [];
  const turn = (axis, a) => {
    const k = s[axis];
    for (const v of ['H', 'L', 'U']) if (v !== axis) s[v] = rot(s[v], k, a);
  };
  for (const [c, arg] of tokens) {
    const ang = jit((arg ?? o.angle) * deg);
    switch (c) {
      case 'F': case 'f': {
        const q = add(s.p, s.H, jit(arg ?? s.len));
        if (c === 'F') { segs.push({ a: s.p, b: q, parent: s.seg }); s.seg = segs.length - 1; }
        s.p = q;
        // Tropismus: die Richtung neigt sich zur Schwerkraft (negativ: nach oben).
        const t = cross(s.H, gravity), mag = Math.hypot(...t);
        if (o.tropism && mag > 1e-6) {
          const k = t.map((v) => v / mag);
          for (const v of ['H', 'L', 'U']) s[v] = rot(s[v], k, o.tropism * mag);
        }
        break;
      }
      case '+': turn('U', ang); break;
      case '-': turn('U', -ang); break;
      case '&': turn('L', ang); break;
      case '^': turn('L', -ang); break;
      case '\\': turn('H', ang); break;
      case '/': turn('H', -ang); break;
      case '|': turn('U', Math.PI); break;
      case '"': s.len *= arg ?? o.lengthFactor ?? 0.9; break;
      case '[': stack.push(s); s = { ...s }; break;
      case ']': if (stack.length) s = stack.pop(); break;
      default: if (leafSyms.has(c)) leaves.push({ p: s.p, H: s.H, seg: s.seg });
    }
  }
  // Pipe-Modell: Spitzen je Ast zählen. Kinder stehen immer hinter ihrem Eltern-
  // ast, also rückwärts aufsummieren.
  const tips = new Array(segs.length).fill(0), kids = segs.map(() => []);
  segs.forEach((g, i) => { if (g.parent >= 0) kids[g.parent].push(i); });
  for (let i = segs.length - 1; i >= 0; i--) {
    tips[i] = kids[i].length ? kids[i].reduce((n, k) => n + tips[k], 0) : 1;
  }
  const r = (i) => (o.tip ?? 0.03) * tips[i] ** (1 / (o.pipe ?? 2.2));
  segs.forEach((g, i) => {
    g.r0 = r(i);
    g.r1 = kids[i].length ? Math.max(...kids[i].map(r)) : g.r0 * 0.6;
  });
  return { segs, leaves };
}

/** Gerüst als Modell (primitives.mjs): Äste als Balken, Laub als kleine Büschel. */
export function build(sk, o, rnd) {
  const m = model();
  const mtls = o.leafMtls ?? ['Leaf'];
  const size = o.leafSize ?? 0.5;
  for (const g of sk.segs) {
    const name = g.r0 > 0.12 ? 'Trunk' : 'Branch';
    m.beam(name, 'Bark', g.a, g.b, g.r0 * 2, { w1: g.r1 * 2, n: g.r0 > 0.08 ? 7 : g.r0 > 0.03 ? 5 : 3 });
  }
  sk.leaves.forEach((l, i) => {
    const mtl = mtls[i % mtls.length];
    const rr = size * (0.7 + rnd() * 0.6);
    const p = l.p;
    if (o.leafShape === 'needle') {
      // Nadelbüschel: flach und länglich, quer zur Astrichtung.
      m.beam('Needles', mtl, add(p, l.H, -rr * 0.6), add(p, l.H, rr * 0.6), rr * 1.4, { w1: rr * 0.5, n: 4 });
    } else {
      m.box('Leaves', mtl, [p[0] - rr, p[0] + rr], [p[1] - rr * 0.6, p[1] + rr * 0.7], [p[2] - rr, p[2] + rr],
        { n: 5, rot: rnd() * 3, x: [p[0] - rr * 0.4, p[0] + rr * 0.4], z: [p[2] - rr * 0.4, p[2] + rr * 0.4] });
    }
  });
  return m;
}

/** Alles in einem Schritt: Preset (oder eigene Werte) -> Modell und Kennzahlen. */
export function grow(p) {
  const rnd = rng(p.seed ?? 1);
  const rules = typeof p.rules === 'string' ? parseRules(p.rules) : p.rules;
  const { tokens, steps, capped } = rewrite(p.axiom, rules, p.n, rnd);
  const sk = interpret(tokens, p, rnd);
  const m = build(sk, p, rnd);
  const ys = sk.segs.map((g) => g.b[1]);
  return { m, symbols: tokens.length, steps, capped, segs: sk.segs.length, leaves: sk.leaves.length, height: Math.max(0, ...ys) };
}

/** Beispiele - Ausgangspunkte zum Weiterprobieren. */
export const PRESETS = {
  // Figur 1.25 aus "The Algorithmic Beauty of Plants" (Prusinkiewicz/Lindenmayer).
  busch: {
    label: 'Busch (ABOP 1.25)', axiom: 'A', n: 7, angle: 22.5, length: 0.35, jitter: 0.05, tropism: 0,
    rules: `A -> [&FLA]/////[&FLA]///////[&FLA]
F -> S/////F
S -> FL`,
    leafSize: 0.18, leafMtls: ['Leaf', 'Ivy', 'IvyDark'], tip: 0.012,
  },
  laubbaum: {
    label: 'Laubbaum (zufällig)', axiom: 'FFFA', n: 7, angle: 30, length: 1.6, lengthFactor: 0.82, jitter: 0.25, tropism: 0.08,
    rules: `# Verzweigen in zwei oder drei Äste, gegeneinander verdreht (137.5° - goldener Winkel)
A 0.5 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]
A 0.35 -> "[&FA]/(137.5)[&(15)FA]
A 0.15 -> "F/(90)A`,
    leaves: 'A', leafSize: 0.9, leafMtls: ['Leaf', 'Ivy', 'IvyDark'], tip: 0.035,
  },
  fichte: {
    label: 'Fichte (Quirle)', axiom: 'FFT', n: 11, angle: 35, length: 1.2, lengthFactor: 0.9, jitter: 0.1, tropism: 0.05,
    rules: `# Stamm wächst je Schritt ein Stück und setzt einen Quirl an - unten die ältesten, längsten Äste
T -> F"[W]/(40)T
W -> [&(80)B]/(72)[&(80)B]/(72)[&(80)B]/(72)[&(80)B]/(72)[&(80)B]
B -> "FL[-(40)C][+(40)C]B
C -> "FLC`,
    leaves: 'BCT', leafShape: 'needle', leafSize: 0.35, leafMtls: ['IvyDark', 'Ivy'], tip: 0.025, pipe: 2.4,
  },
  haengebirke: {
    label: 'Hängebirke (Tropismus)', axiom: 'FFFFFA', n: 7, angle: 34, length: 1.4, lengthFactor: 0.85, jitter: 0.2, tropism: 0.45,
    rules: `A 0.6 -> "[&FFA]/(120)[&FFA]/(120)[&FA]
A 0.4 -> "[&(20)FFA]/(180)[&FA]
F -> F`,
    leaves: 'A', leafSize: 0.45, leafMtls: ['Leaf', 'Ivy'], tip: 0.02,
  },
  pappel: {
    label: 'Pappel (monopodial)', axiom: 'FFA', n: 14, angle: 22, length: 0.9, lengthFactor: 0.72, jitter: 0.25, tropism: -0.1,
    rules: `# Ein durchgehender Stamm, rundherum kurze Seitenäste. Sie werden je Schritt
# um den Längenfaktor kürzer, bleiben also alle etwa gleich lang: eine Säule.
A -> F[&(30)"B]/(137.5)A
B -> "FL[+C][-C]B
C -> "FL`,
    leaves: 'ABC', leafSize: 0.45, leafMtls: ['Leaf', 'Ivy'], tip: 0.02,
  },
  sympodial: {
    label: 'Sympodial (ABOP 2.2)', axiom: 'FA', n: 9, angle: 32, length: 2, lengthFactor: 0.85, jitter: 0.08, tropism: 0,
    rules: `# Jede Achse endet und gibt das Wachstum an zwei Seitenäste ab
A -> "[&F/(90)A]/(180)[&(20)F/(90)A]`,
    leaves: 'A', leafSize: 0.5, leafMtls: ['Leaf', 'Ivy', 'IvyDark'], tip: 0.03,
  },
};
