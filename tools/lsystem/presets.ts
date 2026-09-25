// Beispiel-Bäume für lsystem.ts - Ausgangspunkte zum Weiterprobieren.
import type { TreeSpec } from './lsystem.ts';

const DEFAULTS = {
  seed: 1, lengthFactor: 0.9, jitter: 0, tropism: 0, leaves: '', leafShape: 'clump',
  leafMaterials: ['Leaf', 'Ivy', 'IvyDark'], tip: 0.03, pipe: 2.2,
} as const satisfies Partial<TreeSpec>;

type Preset = Omit<TreeSpec, keyof typeof DEFAULTS> & Partial<TreeSpec>;
const preset = (p: Preset): TreeSpec => ({ ...DEFAULTS, ...p });

export const PRESETS = {
  // Figur 1.25 aus "The Algorithmic Beauty of Plants" (Prusinkiewicz/Lindenmayer).
  busch: preset({
    label: 'Busch (ABOP 1.25)', axiom: 'A', iterations: 7, angle: 22.5, length: 0.35, jitter: 0.05,
    rules: `A -> [&FLA]/////[&FLA]///////[&FLA]
F -> S/////F
S -> FL`,
    leafSize: 0.18, tip: 0.012,
  }),
  laubbaum: preset({
    label: 'Laubbaum (zufällig)', axiom: 'FFFA', iterations: 7, angle: 30, length: 1.6, lengthFactor: 0.82,
    jitter: 0.25, tropism: 0.08,
    rules: `# Zwei oder drei Äste, gegeneinander um den goldenen Winkel verdreht
A 0.5 -> "[&FA]/(137.5)[&FA]/(137.5)[&FA]
A 0.35 -> "[&FA]/(137.5)[&(15)FA]
A 0.15 -> "F/(90)A`,
    leaves: 'A', leafSize: 0.9, tip: 0.035,
  }),
  fichte: preset({
    label: 'Fichte (Quirle)', axiom: 'FFT', iterations: 11, angle: 35, length: 1.2, jitter: 0.1, tropism: 0.05,
    rules: `# Der Stamm setzt je Schritt einen Quirl an - unten die ältesten, längsten Äste
T -> F"[W]/(40)T
W -> [&(80)B]/(72)[&(80)B]/(72)[&(80)B]/(72)[&(80)B]/(72)[&(80)B]
B -> "FL[-(40)C][+(40)C]B
C -> "FLC`,
    leaves: 'BCT', leafShape: 'needle', leafSize: 0.35, leafMaterials: ['IvyDark', 'Ivy'], tip: 0.025, pipe: 2.4,
  }),
  tanne: preset({
    label: 'Tanne (Etagen)', axiom: 'FT', iterations: 13, angle: 50, length: 0.6, lengthFactor: 0.93, jitter: 0.06,
    tropism: -0.02,
    rules: `# Anders als die Fichte: Äste fast waagrecht und steif (leicht nach oben statt hängend),
# die Seitenzweige flach in einer Ebene - wie ein Fächer. Dadurch klare Etagen.
# Die Äste werden beim Wachsen schnell kürzer (0.8) - die Krone bleibt schlank.
T -> FF"[W]/(36)T
W -> [&(86)B]/(72)[&(86)B]/(72)[&(86)B]/(72)[&(86)B]/(72)[&(86)B]
B -> "(0.8)FL[+C][-C]B
C -> "(0.7)FLC`,
    leaves: 'BCT', leafShape: 'needle', leafSize: 0.3, leafMaterials: ['IvyDark'], tip: 0.022, pipe: 2.5,
  }),
  haengebirke: preset({
    label: 'Hängebirke (Tropismus)', axiom: 'FFFFFA', iterations: 7, angle: 34, length: 1.4, lengthFactor: 0.85,
    jitter: 0.2, tropism: 0.45,
    rules: `A 0.6 -> "[&FFA]/(120)[&FFA]/(120)[&FA]
A 0.4 -> "[&(20)FFA]/(180)[&FA]`,
    leaves: 'A', leafSize: 0.45, leafMaterials: ['Leaf', 'Ivy'], tip: 0.02,
  }),
  pappel: preset({
    label: 'Pappel (monopodial)', axiom: 'FFA', iterations: 14, angle: 28, length: 0.9, lengthFactor: 0.8,
    jitter: 0.25, tropism: -0.1,
    rules: `# Ein durchgehender Stamm mit kurzen Seitenästen. Sie werden je Schritt
# um den Längenfaktor kürzer, bleiben also alle etwa gleich lang: eine Säule.
A -> F[&(30)"B]/(137.5)A
B -> "FL[+C][-C]B
C -> "FL`,
    leaves: 'ABC', leafSize: 0.6, leafMaterials: ['Leaf', 'Ivy'], tip: 0.02,
  }),
  sympodial: preset({
    label: 'Sympodial (ABOP 2.2)', axiom: 'FA', iterations: 9, angle: 32, length: 2, lengthFactor: 0.85, jitter: 0.08,
    rules: `# Jede Achse endet und gibt das Wachstum an zwei Seitenäste ab
A -> "[&F/(90)A]/(180)[&(20)F/(90)A]`,
    leaves: 'A', leafSize: 0.5,
  }),
} satisfies Record<string, TreeSpec>;

export type PresetName = keyof typeof PRESETS;
