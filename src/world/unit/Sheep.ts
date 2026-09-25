// Sheep.ts
// Schaf: in Herden auf der Wiese, scheu, aber nicht schnell - springt auf der
// Flucht ein Stück davon und bleibt dann bald wieder stehen.

import { SHAPE } from '../../gl/entityRenderer';
import { AnimalBase } from './AnimalBase';
import type { AnimalDefinition } from './definition';

export class Sheep extends AnimalBase {
  static readonly definition: AnimalDefinition<'sheep'> = {
    type: 'sheep', label: 'Schaf', shape: SHAPE.sheep, height: 0.19, hp: 2, food: 100, walk: 0.35, flee: 1.6,
    fear: 2.5, herd: [3, 6], stride: 0.35,
  };
}
