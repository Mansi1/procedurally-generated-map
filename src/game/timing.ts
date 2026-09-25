// timing.ts
// Zeitmaße der Spielschleife: feste Schritte für die Simulation und
// Aufgaben, die nur alle paar Millisekunden laufen sollen.

/**
 * Feste Schritte: Die Simulation läuft in Schritten von `step` Sekunden,
 * unabhängig von der Bildrate. Sonst förderte ein schneller Rechner mehr als
 * ein langsamer - und beim Zurückkehren aus einem anderen Tab räumte ein
 * einzelner riesiger Schritt alles leer. Der Rest bleibt für das nächste
 * Bild liegen; so geht über die Zeit weder etwas verloren noch doppelt.
 */
export class FixedStep {
  private pending = 0;

  constructor(readonly step: number) {}

  /** Zeit dazu und so viele volle Schritte ausführen, wie hineinpassen. */
  advance(seconds: number, run: (step: number) => void) {
    this.pending += seconds;
    while (this.pending >= this.step) {
      run(this.step);
      this.pending -= this.step;
    }
  }

  /** Wie weit der nächste Schritt schon ist (0..1) - Figuren stehen dazwischen. */
  get blend(): number {
    return this.pending / this.step;
  }
}

/** Eine Aufgabe höchstens alle `ms` Millisekunden. */
export class Interval {
  private last = -Infinity;

  constructor(private ms: number) {}

  /** true, wenn es wieder Zeit ist - und merkt sich dann `now`. */
  due(now: number): boolean {
    if (now - this.last < this.ms) return false;
    this.last = now;
    return true;
  }
}
