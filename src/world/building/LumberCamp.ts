// LumberCamp.ts
// Holzlager: nimmt Holz an - nahe am Wald spart den Holzfällern Wege. Vier
// Modell-Varianten.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { defineBuilding } from './definition';
import { StorageBuilding } from './StorageBuilding';

export class LumberCamp extends StorageBuilding {
  static readonly definition = defineBuilding({
    type: 'lumber_camp',
    label: 'Holzlager',
    key: '3',
    color: Color.rgb(126, 92, 48),
    model: SHAPE.lumberCamp,
    models: [SHAPE.lumberCamp, SHAPE.lumberCamp2, SHAPE.lumberCamp3, SHAPE.lumberCamp4],
    size: 1,
    cost: { wood: 50 },
    storedResources: ['wood'],
    hp: 600,
  });
}
