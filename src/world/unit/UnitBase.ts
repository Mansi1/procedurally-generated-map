// UnitBase.ts
// Was jede Figur auf der Karte hat - Dorfbewohner wie Tiere: Kennung, Lage
// (mit der des letzten Schritts, zum Überblenden zwischen zwei Ticks),
// Blickrichtung, Trefferpunkte und die zurückgelegte Strecke für den Takt
// der Beine.

export abstract class UnitBase {
  /** Lage im letzten Tick - der Renderer blendet zwischen prev und jetzt über. */
  prevX: number;
  prevY: number;
  /** Zurückgelegte Strecke (Tiles) - Takt der Beine. */
  stride = 0;
  prevStride = 0;

  /**
   * @param id eindeutig in der Welt
   * @param x, y Lage in Welt-Tiles (Mitte der Figur)
   */
  constructor(readonly id: number, public x: number, public y: number, public heading: number, public hp: number) {
    this.prevX = x;
    this.prevY = y;
  }

  /** Beginn eines Ticks: die Lage merken, bevor sie sich ändert. */
  rememberPosition() {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevStride = this.stride;
  }

  /** Lage zwischen letztem und jetzigem Tick, `blend` 0..1. */
  positionAt(blend: number): { x: number; y: number } {
    return { x: this.prevX + (this.x - this.prevX) * blend, y: this.prevY + (this.y - this.prevY) * blend };
  }

  distanceTo(x: number, y: number): number {
    return Math.hypot(this.x - x, this.y - y);
  }
}
