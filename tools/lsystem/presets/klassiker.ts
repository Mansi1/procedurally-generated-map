// Beispiele aus "The Algorithmic Beauty of Plants" (Prusinkiewicz/Lindenmayer).
import { preset, type Preset } from './base.ts';

const group = 'Klassiker (ABOP)';

export const KLASSIKER = {
  // Figur 1.25
  busch: preset({
    group, label: 'Busch (ABOP 1.25)', axiom: 'A', iterations: 7, angle: 22.5, length: 0.35, jitter: 0.05,
    rules: `A -> [&FLA]/////[&FLA]///////[&FLA]
F -> S/////F
S -> FL`,
    leafSize: 0.18, tip: 0.012,
  }),
  // nach Figur 2.2 (Honda)
  sympodial: preset({
    group, label: 'Sympodial (ABOP 2.2)', axiom: 'FA', iterations: 9, angle: 32, length: 2, lengthFactor: 0.85, jitter: 0.08,
    rules: `# Jede Achse endet und gibt das Wachstum an zwei Seitenäste ab
A -> "[&F/(90)A]/(180)[&(20)F/(90)A]`,
    leaves: 'A', leafSize: 0.5,
  }),
} satisfies Record<string, Preset>;
