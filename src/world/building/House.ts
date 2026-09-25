// House.ts
// Haus: Wohnraum für fünf weitere Dorfbewohner. Vier Modell-Varianten.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { BuildingBase } from './BuildingBase';
import { defineBuilding } from './definition';

export class House extends BuildingBase {
  static readonly definition = defineBuilding({
    type: 'house',
    label: 'Haus',
    key: '2',
    color: Color.rgb(214, 158, 96),
    model: SHAPE.house,
    models: [SHAPE.house, SHAPE.house2, SHAPE.house3, SHAPE.house4],
    size: 0.8,
    cost: { wood: 30 },
    housing: 5,
    hp: 550,
  });
}
