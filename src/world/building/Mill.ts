// Mill.ts
// Mühle: nimmt Nahrung an - Beeren, Ernte, Wild. Vier Modell-Varianten, die
// Flügel drehen sich.

import { Color } from '../../functions/Color';
import { SHAPE } from '../../gl/entityRenderer';
import { defineBuilding } from './definition';
import { StorageBuilding } from './StorageBuilding';

export class Mill extends StorageBuilding {
  static readonly definition = defineBuilding({
    type: 'mill',
    label: 'Mühle',
    key: '5',
    color: Color.rgb(198, 74, 84),
    model: SHAPE.mill,
    models: [SHAPE.mill, SHAPE.mill2, SHAPE.mill3, SHAPE.mill4],
    size: 0.86,
    cost: { wood: 40 },
    storedResources: ['food'],
    hp: 600,
  });
}
