// MiningCamp.ts
// Minenlager: nimmt Stein und Gold an. Steht am Fuß des Gebirges, nicht
// darauf - auf Fels lässt sich nicht bauen, Stein und Gold liegen aber
// gleich daneben.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { defineBuilding } from './definition';
import { StorageBuilding } from './StorageBuilding';

export class MiningCamp extends StorageBuilding {
  static readonly definition = defineBuilding({
    type: 'mining_camp',
    label: 'Minenlager',
    key: '4',
    color: Color.rgb(150, 152, 162),
    model: SHAPE.miningCamp,
    size: 1,
    cost: { wood: 60, stone: 20 },
    storedResources: ['stone', 'gold'],
    hp: 600,
  });
}
