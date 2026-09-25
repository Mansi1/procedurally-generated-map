// Die Bewegungen der Tiere, wie der Shader sie heute rechnet
// (src/gl/entityRenderer.ts, Zweig "beast", Posen äsen 0, gehen 1, fliehen 5,
// erlegt 6) - als Gelenkwinkel je Phase, dazu die Maße eines Tiers wie
// loadModel() sie liest. Daraus macht tools/export/animals.mjs die Clips für
// Blender (docs/ANIMATION.md, Phase 3), und tools/blender/parity-animals.mjs
// vergleicht die Clips mit diesen Formeln.

/** Die Arten, wie in src/world/unit (ANIMALS) und SHAPE. */
export const SPECIES = ['deer', 'hare', 'cow', 'sheep', 'goat', 'boar'];
/** Das Tier des Skeletts in Blender - an ihm werden die Clips bearbeitet. */
export const REFERENCE = 'deer';

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Äsen: Kopf senken und heben (Anteil gesenkt 0..1) und Kauen (Radiant) zur Phase = Sekunden. */
function grazing(phase) {
  const up = smoothstep(0.6, 0.9, Math.sin(phase * 0.21 + 1));
  return { down: 1 - up, chew: Math.sin(phase * 2.3) * 0.05 * (1 - up) };
}

/**
 * Wie lang eine Schleife des Äsens ist (Sekunden, ganze Bilder zu 30 je
 * Sekunde): die Formel wiederholt sich nie ganz - gewählt ist die Länge
 * zwischen 20 und 40 s, bei der sie am Ende dem Anfang am nächsten kommt
 * (35.4 s; bis 70 s wäre der Sprung kaum kleiner, der Clip aber fast doppelt
 * so lang - je Art in der Clip-Textur).
 */
export const GRAZE_LOOP = (() => {
  const start = grazing(0);
  let best = { err: Infinity, seconds: 30 };
  for (let frames = 600; frames <= 1200; frames++) {
    const g = grazing(frames / 30);
    const err = Math.abs(g.down - start.down) * 1.45 + Math.abs(g.chew - start.chew);
    if (err < best.err) best = { err, seconds: frames / 30 };
  }
  return best.seconds;
})();

/**
 * Die Clips: Name, Pose, für welche Arten (leer: alle), welcher Phasenbereich
 * [shift, shift + period] die Schleife ist und wie viele Sekunden sie in
 * Blender dauert. Gehen und Fliehen: Phase aus der Schrittlänge (render.ts),
 * sin(phase) - 2π. Äsen: Phase = Sekunden (+ id * 3.1).
 * - walk: Kreuzgang; hop: der Hase hoppelt (Vorder- und Hinterbeine je zusammen).
 * - flee: Springen; trot: die Kuh trabt im Kreuzgang; hop_flee: der Hase flieht hoppelnd.
 * - dead: erlegt, auf der Seite - ein stehendes Bild (zwei gleiche Bilder).
 */
export const ANIMAL_CLIPS = [
  { name: 'graze', pose: 0, species: '', period: GRAZE_LOOP, shift: 0, seconds: GRAZE_LOOP },
  { name: 'walk', pose: 1, species: 'deer,cow,sheep,goat,boar', period: Math.PI * 2, shift: 0, seconds: 1 },
  { name: 'hop', pose: 1, species: 'hare', period: Math.PI * 2, shift: 0, seconds: 1 },
  { name: 'flee', pose: 5, species: 'deer,sheep,goat,boar', period: Math.PI * 2, shift: 0, seconds: 1 },
  { name: 'trot', pose: 5, species: 'cow', period: Math.PI * 2, shift: 0, seconds: 1 },
  { name: 'hop_flee', pose: 5, species: 'hare', period: Math.PI * 2, shift: 0, seconds: 1 },
  { name: 'dead', pose: 6, species: '', period: 1, shift: 0, seconds: 1 / 30, lying: true },
];

/**
 * Winkel eines Clips zur Phase - der Zweig "beast" im Shader. `graze` ist
 * uGraze des Tiers (Radiant). Beine: Schwung nach vorn (swingAt um das obere
 * Gelenk); neck: Senken zum Gras (nur beim Äsen); head: alles andere, was der
 * Kopf um den Halsansatz nickt; bob: Anheben des Körpers (Modell-Einheiten).
 */
export function animalPose(name, phase, { graze }) {
  const a = { FL: 0, FR: 0, BL: 0, BR: 0, neck: 0, head: 0, bob: 0, lying: false };
  const s = Math.sin(phase);
  const cross = (amp) => {
    // Kreuzgang: links vorn mit rechts hinten.
    Object.assign(a, { FL: s * amp, BR: s * amp, FR: -s * amp, BL: -s * amp });
    a.bob = Math.abs(Math.cos(phase)) * 0.015;
  };
  const jump = (amp, hare) => {
    // Hoppeln bzw. Springen: vorn und hinten gegengleich, der Körper hebt ab.
    Object.assign(a, { FL: s * amp, FR: s * amp, BL: -s * amp, BR: -s * amp });
    a.bob = Math.max(0, Math.sin(phase + 1.2)) * (hare ? 0.25 : 0.1);
  };
  // Der Kopf: Gehen -0.1 (etwas gehoben), Fliehen 0.15 - wie "dip" im Shader.
  if (name === 'walk') { cross(0.45); a.head = -0.1; }
  if (name === 'hop') { jump(0.45, true); a.head = -0.1; }
  if (name === 'flee') { jump(0.8, false); a.head = 0.15; }
  if (name === 'trot') { cross(0.8); a.head = 0.15; }
  if (name === 'hop_flee') { jump(0.8, true); a.head = 0.15; }
  if (name === 'graze') {
    const g = grazing(phase);
    a.neck = graze * g.down;
    a.head = g.chew;
  }
  if (name === 'dead') a.lying = true;
  return a;
}

// --- Maße eines Tiers wie loadModel() -----------------------------------------

/** Teil eines Eckpunkts nach Objektname (PARTS in entityRenderer.ts). */
export function animalPart(object) {
  for (const leg of ['FL', 'FR', 'BL', 'BR']) if (object.startsWith(`Leg.${leg}`)) return `leg.${leg}`;
  if (object.startsWith('Head')) return 'head';
  return 'body';
}

/** Halsansatz und Maul -> Winkel, bis das Maul den Boden erreicht (grazeAngle in entityRenderer.ts). */
function grazeAngle(neck, mouth) {
  const dx = mouth[0] - neck[0];
  const dz = mouth[1] - neck[1];
  const length = Math.hypot(dx, dz);
  const ground = 0.03;
  const reach = (ground - neck[1]) / length;
  const angle = Math.atan2(dz, dx) - (reach <= -1 ? -Math.PI / 2 : Math.asin(reach));
  return Math.min(1.45, Math.max(0.2, angle));
}

/**
 * Maße aus den Dreiecken eines Tiers (Datei-Koordinaten: x links, y oben,
 * z vorn, Meter): Höhe H und minY, dazu in Modell-Einheiten (x vorn, y links,
 * z oben, Höhe 1) hip, legs, neck, graze, side - wie loadModel('height').
 */
export function measureAnimal(tris) {
  let minY = Infinity, maxY = -Infinity;
  for (const t of tris) for (const p of t.points) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const H = maxY - minY;
  const local = ([x, y, z]) => [z / H, x / H, (y - minY) / H];
  let hip = 0, side = 0;
  const legSum = [0, 0], legCount = [0, 0];
  let neck = [0, Infinity], mouth = [-Infinity, 0];
  for (const t of tris) {
    const part = animalPart(t.object);
    for (const p of t.points) {
      const [x, y, z] = local(p);
      if (part.startsWith('leg.')) {
        hip = Math.max(hip, z);
        const i = part[4] === 'F' ? 0 : 1;
        legSum[i] += x;
        legCount[i]++;
      }
      if (part === 'head' && (z < neck[1] || (z === neck[1] && x < neck[0]))) neck = [x, z];
      if (part === 'head' && (x > mouth[0] || (x === mouth[0] && z < mouth[1]))) mouth = [x, z];
      if (part === 'body') side = Math.max(side, Math.abs(y));
    }
  }
  return {
    H, minY, hip, side,
    legs: [legSum[0] / Math.max(1, legCount[0]), legSum[1] / Math.max(1, legCount[1])],
    neck, graze: grazeAngle(neck, mouth),
  };
}

// --- Knochen -------------------------------------------------------------------

export const qAxis = ([x, y, z], a) => {
  const s = Math.sin(a / 2);
  return [x * s, y * s, z * s, Math.cos(a / 2)];
};
const X = [1, 0, 0], Z = [0, 0, 1];

/**
 * Knochen-Drehungen (Datei-Koordinaten) und Verschiebung der Wurzel (Meter,
 * H = Höhe des Tiers) für die Winkel `a`. Die Drehungen des Shaders:
 * swingAt(p, pivot, w) = Datei-x um -w; der Kopf nickt mit swingAt(-dip), also
 * Datei-x um dip. Erlegt: p = (x, -z, y + uSide) ist die Drehung um die
 * Blickachse (Datei-z) um 90°, gehoben um die halbe Körperbreite `side`.
 */
export function animalBones(a, H, side) {
  return {
    translation: [0, (a.bob + (a.lying ? side : 0)) * H, 0],
    rotations: {
      root: a.lying ? qAxis(Z, Math.PI / 2) : [0, 0, 0, 1],
      'leg.FL': qAxis(X, -a.FL), 'leg.FR': qAxis(X, -a.FR),
      'leg.BL': qAxis(X, -a.BL), 'leg.BR': qAxis(X, -a.BR),
      neck: qAxis(X, a.neck),
      head: qAxis(X, a.head),
    },
  };
}
