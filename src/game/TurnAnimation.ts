// TurnAnimation.ts
// Übergang beim Drehen der Ansicht. Gedreht wird in Vierteldrehungen, auf
// einen Schlag - der Gelände-Cache liegt in Bildkoordinaten und müsste bei
// jedem Zwischenwinkel neu befüllt werden. Die Animation spielt deshalb nur
// im Bild:
//  - Die Minimap zeigt die Welt von oben; um 90° gedreht ist das neue Bild
//    genau das alte. Sie startet also um den Drehwinkel zurückgedreht und
//    schwenkt in die neue Lage, die Himmelsrichtungen laufen auf dem Ring mit.
//  - Die Hauptansicht ist schräg von oben, dort ginge das nicht. Das letzte
//    Bild vor dem Drehen dreht sich ein Stück weiter und blendet aus, die
//    neue Ansicht dreht sich aus der Gegenrichtung herein - ein Wirbel, der
//    nebenbei verdeckt, dass das Gelände ein paar Bilder zum Befüllen braucht.

/** Wie weit sich die Hauptansicht beim Übergang dreht (Grad). */
const SWIRL = 7;
const EASING = 'cubic-bezier(0.33, 0, 0.2, 1)';

export class TurnAnimation {
  private running: Animation[] = [];

  constructor(
      private game: HTMLCanvasElement,
      private snapshot: HTMLCanvasElement,
      private minimapSpin: HTMLElement,
      private compass: HTMLElement,
  ) {}

  /**
   * Hält das Bild fest, das gerade auf dem Spielfeld steht - direkt nach dem
   * Zeichnen aufrufen, solange der WebGL-Puffer noch gefüllt ist.
   */
  capture() {
    this.finish();
    const { snapshot, game } = this;
    snapshot.width = game.width;
    snapshot.height = game.height;
    snapshot.style.width = game.style.width;
    snapshot.style.height = game.style.height;
    snapshot.getContext('2d')!.drawImage(game, 0, 0);
  }

  /**
   * Spielt den Übergang ab - nachdem die Ansicht gedreht ist.
   * @param degrees um wie viel das Bild gedreht ist, im Uhrzeigersinn positiv
   */
  play(degrees: number) {
    if (degrees === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const duration = Math.abs(degrees) > 90 ? 700 : 480;
    const timing = { duration, easing: EASING };

    // Minimap: aus der alten Lage in die neue. Die Buchstaben drehen sich
    // gegen, damit sie aufrecht bleiben.
    const turn = (el: Element, from: number) =>
      this.running.push(el.animate([{ transform: `rotate(${from}deg)` }, { transform: 'rotate(0deg)' }], timing));
    turn(this.minimapSpin, degrees);
    turn(this.compass, degrees);
    for (const letter of this.compass.querySelectorAll('button')) turn(letter, -degrees);

    // Hauptansicht: gedreht muss das Bild größer sein, sonst sieht man die
    // Ecken - so groß, dass ein um SWIRL gedrehtes Rechteck es noch bedeckt.
    const a = (SWIRL * Math.PI) / 180;
    const { width, height } = this.game.getBoundingClientRect();
    const zoom = Math.cos(a) + Math.sin(a) * Math.max(width / height, height / width);
    const swirl = -Math.sign(degrees) * SWIRL;
    this.snapshot.hidden = false;
    // Das alte Bild bleibt anfangs deckend: darunter füllt das Gelände in den
    // ersten Bildern erst den Cache (auf Retina rund fünf Bilder).
    this.running.push(this.snapshot.animate([
      { transform: 'none', opacity: 1 },
      { transform: `rotate(${swirl * 0.35}deg) scale(${1 + (zoom - 1) * 0.35})`, opacity: 1, offset: 0.3 },
      { transform: `rotate(${swirl}deg) scale(${zoom})`, opacity: 0 },
    ], { duration: duration * 0.8, easing: 'ease-in-out', fill: 'forwards' }));
    this.running.push(this.game.animate([
      { transform: `rotate(${-swirl}deg) scale(${zoom})` },
      { transform: 'none' },
    ], timing));
    const run = this.running;
    // Ein neuer Übergang vor dem Ende hat diesen schon abgebrochen.
    Promise.all(run.map((r) => r.finished)).then(() => {
      if (this.running === run) this.cleanUp();
    }, () => {});
  }

  /** Bricht einen laufenden Übergang ab - die Ansicht steht sofort richtig. */
  private finish() {
    for (const r of this.running) r.cancel();
    this.cleanUp();
  }

  private cleanUp() {
    for (const r of this.running) r.cancel();
    this.running = [];
    this.snapshot.hidden = true;
  }
}
