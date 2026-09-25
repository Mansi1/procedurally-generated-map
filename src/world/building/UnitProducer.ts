// UnitProducer.ts
// Ein Gebäude, das Einheiten ausbildet (abstrakt - z. B. TownCenter):
// Warteschlange, Ausbildung der vordersten Einheit, Sammelpunkt für frisch
// Ausgebildete. Welche Einheit es ausbildet, sagt die Unterklasse (`unit`).

import { MAX_TRAINING_QUEUE, type Stock } from '../catalog';
import { BuildingBase, type BuildingSave } from './BuildingBase';

/** Was ein UnitProducer über die Einheit wissen muss, die er ausbildet. */
export interface TrainableUnit {
  label: string;
  cost: Partial<Stock>;
  /** Ausbildungszeit in Sekunden. */
  trainTime: number;
}

export abstract class UnitProducer extends BuildingBase {
  /** Einheiten, die noch ausgebildet werden. */
  queuedUnits = 0;
  /** Sekunden, die die vorderste Einheit schon ausgebildet wird. */
  trainingSeconds = 0;
  /** Sammelpunkt (Tile) für frisch Ausgebildete, oder null. */
  rallyPoint: { x: number; y: number } | null = null;

  /** Die Einheit, die hier ausgebildet wird. */
  abstract get unit(): TrainableUnit;

  override isUnitProducer(): this is UnitProducer {
    return true;
  }

  get isQueueFull(): boolean {
    return this.queuedUnits >= MAX_TRAINING_QUEUE;
  }

  /** Eine Einheit in die Warteschlange - false, wenn sie voll ist. */
  enqueueUnit(): boolean {
    if (this.isQueueFull) return false;
    this.queuedUnits++;
    return true;
  }

  /** Fortschritt der vordersten Einheit, 0..1. */
  trainingProgress(): number {
    return this.queuedUnits > 0 ? Math.min(1, this.trainingSeconds / this.unit.trainTime) : 0;
  }

  /**
   * Bildet `dt` Sekunden weiter aus. true, wenn dabei eine Einheit fertig
   * wurde - sie verlässt die Warteschlange, die nächste beginnt von vorn.
   */
  train(dt: number): boolean {
    if (this.queuedUnits === 0) return false;
    this.trainingSeconds += dt;
    if (this.trainingSeconds < this.unit.trainTime) return false;
    this.trainingSeconds = 0;
    this.queuedUnits--;
    return true;
  }

  /** Sammelpunkt setzen, oder mit null aufheben. */
  setRallyPoint(point: { x: number; y: number } | null) {
    this.rallyPoint = point;
  }

  override toSave(): BuildingSave {
    return {
      ...super.toSave(),
      q: this.queuedUnits,
      ...(this.rallyPoint ? { r: [this.rallyPoint.x, this.rallyPoint.y] as [number, number] } : {}),
    };
  }

  override restore(save: BuildingSave, scale: number) {
    super.restore(save, scale);
    this.queuedUnits = save.q ?? 0;
    this.rallyPoint = save.r ? { x: save.r[0] * scale, y: save.r[1] * scale } : null;
  }
}
