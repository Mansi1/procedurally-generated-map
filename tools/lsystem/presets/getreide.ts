// Getreide: eine Pflanze aus Halmen, Blättern (blade) und Ähre bzw. Kolben (spindle).
import { preset, variant, type Preset } from './base.ts';

const group = 'Getreide';

const weizen = preset({
  group, label: 'Weizen', axiom: 'P', iterations: 2, angle: 10, length: 0.2, jitter: 0.25, tropism: 0.03,
  rules: `# Eine Pflanze mit sechs Halmen (Bestockung), je Halm drei Blätter an den Knoten
# und oben die Ähre. B und E sind Organe (siehe organs im Rezept).
P -> [&(5)S]/(137.5)[&(11)S]/(137.5)[&(3)S]/(137.5)[&(14)S]/(137.5)[&(8)S]/(137.5)[&(17)S]
S -> F(0.25)[&(40)B]/(180)F(0.25)[&(35)B(0.9)]/(180)F(0.22)[&(30)B(0.8)]F(0.2)F(0.15)E`,
  leafSize: 0, stemMaterial: 'WheatStem', tip: 0.005, pipe: 2,
  organs: {
    B: { shape: 'blade', size: 0.24, width: 0.07, droop: 70, materials: ['Wheat', 'WheatStem'] },
    E: { shape: 'spindle', size: 0.1, width: 0.22, materials: ['WheatEar'] },
  },
});

const gerste = preset({
  ...weizen, label: 'Gerste',
  rules: `# Wie Weizen, aber die reife Ähre nickt: der oberste Halmteil biegt sich (~) herab
P -> [&(5)S]/(137.5)[&(11)S]/(137.5)[&(3)S]/(137.5)[&(14)S]/(137.5)[&(8)S]/(137.5)[&(17)S]
S -> F(0.22)[&(40)B]/(180)F(0.22)[&(35)B(0.9)]/(180)F(0.2)[&(30)B(0.8)]F(0.18)~(0.6)F(0.08)F(0.08)F(0.06)E`,
  organs: {
    B: { shape: 'blade', size: 0.22, width: 0.07, droop: 70, materials: ['Wheat', 'WheatStem'] },
    E: { shape: 'spindle', size: 0.12, width: 0.2, materials: ['WheatEar'] },
  },
});

const mais = preset({
  group, label: 'Mais', axiom: 'F(0.12)NNNKNNUUT', iterations: 1, angle: 45, length: 0.22, jitter: 0.12,
  rules: `# Ein Halm, die Blätter wechselständig (/(180)), am vierten Knoten der Kolben (C),
# oben die Rispe aus dünnen Ästen (X). Die obersten Blätter sind kürzer.
N -> F[&(50)B]/(180)
K -> F[&(50)B][&(18)C]/(180)
U -> F(0.2)[&(35)B(0.65)]/(180)
T -> F(0.25)F(0.2)[&(35)X]/(120)[&(40)X]/(120)[&(35)X]X`,
  leafSize: 0, stemMaterial: 'CornStalk', tip: 0.013, pipe: 2,
  organs: {
    B: { shape: 'blade', size: 0.8, width: 0.1, droop: 110, materials: ['CornLeaf'] },
    C: { shape: 'spindle', size: 0.24, width: 0.24, materials: ['CornHusk'] },
    X: { shape: 'spindle', size: 0.28, width: 0.05, materials: ['Tassel'] },
  },
});

export const GETREIDE = {
  weizen, weizen_gruen: variant(weizen, 'grün', {
    stemMaterial: 'CornStalk',
    organs: {
      B: { shape: 'blade', size: 0.26, width: 0.08, droop: 60, materials: ['CornLeaf', 'LeafLight'] },
      E: { shape: 'spindle', size: 0.1, width: 0.22, materials: ['LeafLight'] },
    },
  }),
  gerste, mais,
} satisfies Record<string, Preset>;
