// definition.ts
// Was für alle Gebäude einer Art gilt - Name, Kosten, Größe, Modell - und
// defineBuilding(), das die üblichen Vorgaben setzt. Jede Gebäudeklasse trägt
// ihre Definition statisch: `static readonly definition = defineBuilding({...})`.

import type { Color } from '../../functions/Color';
import type { TileType } from '../../noise';
import type { GatherType, Stock } from '../buildings';
import { BUILDABLE } from './common';

export interface BuildingDefinition<T extends string = string> {
  /** Kennung der Art, gleich der Klasse in snake_case: 'lumber_camp' ↔ LumberCamp. */
  type: T;
  label: string;
  /** Taste im Baumenü. */
  key: string;
  color: Color;
  /** Modell - bei mehreren Varianten die erste. */
  model: number;
  /** Modell-Varianten; welche ein Gebäude zeigt, steht in BuildingBase.variant. */
  models?: number[];
  /**
   * Breite des Modells in Tiles - nur fürs Bild. Höchstens so groß wie
   * `footprint`, sonst ragt es in Nachbarfelder, auf denen gebaut werden darf.
   */
  size: number;
  /** Belegte Tiles als Kantenlänge. Ungerade, damit es zentriert liegt. */
  footprint: number;
  /** Erlaubte Untergründe. */
  terrain: readonly TileType[];
  cost: Partial<Stock>;
  /** Wohnraum: so viele Dorfbewohner mehr. */
  housing: number;
  /** Rohstoffe, die Dorfbewohner hier abliefern können. */
  storedResources: readonly GatherType[];
  /** Trefferpunkte, wenn es unbeschädigt ist - Werte wie in AoE2. */
  hp: number;
}

/** Was fast jedes Gebäude so hat - in der Definition nur, wenn es anders ist. */
type Defaults = 'footprint' | 'terrain' | 'housing' | 'storedResources';

/** Definition mit Vorgaben: ein Tile groß, auf festem Boden, kein Wohnraum, kein Lager. */
export function defineBuilding<T extends string>(
  definition: Omit<BuildingDefinition<T>, Defaults> & Partial<Pick<BuildingDefinition<T>, Defaults>>,
): BuildingDefinition<T> {
  return { footprint: 1, terrain: BUILDABLE, housing: 0, storedResources: [], ...definition };
}
