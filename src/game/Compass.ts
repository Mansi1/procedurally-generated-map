// Compass.ts
// Der Kompass auf dem Ring um die Minimap: vier Himmelsrichtungen, die an die
// Spitze der Raute wandern, in die sie gerade zeigen. Ein Klick auf eine
// Richtung dreht die Ansicht so, dass sie oben liegt.

import { setViewRotation, worldToGround } from '../gl/iso';

/**
 * Himmelsrichtungen als Welt-Vektoren. Norden ist, was in der Grundstellung
 * oben im Bild liegt; Osten liegt dann rechts.
 */
export const COMPASS: Record<string, [number, number]> = {
  N: [-1, -1],
  E: [1, -1],
  S: [1, 1],
  W: [-1, 1],
};

export function isDirection(dir: string): boolean {
  return dir in COMPASS;
}

/** Dreht die Ansicht (in Vierteln) so, dass die Richtung `dir` im Bild nach oben zeigt. */
export function rotateToFace(dir: string) {
  const [dx, dy] = COMPASS[dir];
  for (let k = 0; k < 4; k++) {
    setViewRotation(k);
    const g = worldToGround(dx, dy);
    if (g.v < 0 && Math.abs(g.u) < 1e-9) return;
  }
}

/**
 * Die Richtung, die gerade rechts (`side` = 1) oder links (-1) im Bild liegt.
 * Sie nach oben zu drehen, dreht die Ansicht um eine Vierteldrehung - von
 * rechts gegen, von links mit dem Uhrzeigersinn.
 */
export function directionAt(side: 1 | -1): string {
  for (const [dir, [dx, dy]] of Object.entries(COMPASS)) {
    const g = worldToGround(dx, dy);
    if (Math.sign(g.u) === side && Math.abs(g.v) < 1e-9) return dir;
  }
  return 'N';
}

export class Compass {
  /**
   * @param root Fläche so groß wie der Rahmen der Minimap, mittig auf ihr
   * @param radius Abstand der Buchstaben von der Mitte - auf dem Ring
   * @param onFace Klick auf eine Richtung - main.ts dreht die Ansicht und merkt sie sich
   */
  constructor(private root: HTMLElement, private radius: number, onFace: (dir: string) => void) {
    root.addEventListener('click', (e) => {
      const dir = (e.target as HTMLElement).closest('button')?.dataset.dir;
      if (dir) onFace(dir);
    });
  }

  /** Stellt die Buchstaben an die Spitze, in deren Richtung sie gerade im Bild zeigen. */
  update() {
    const center = this.root.clientWidth / 2;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) {
      const [dx, dy] = COMPASS[button.dataset.dir!];
      const g = worldToGround(dx, dy);
      // u zeigt nach rechts, v nach unten; auf der Minimap von oben ist v so lang wie u.
      const len = Math.hypot(g.u, g.v * 2);
      button.style.left = `${center + (g.u / len) * this.radius}px`;
      button.style.top = `${center + ((g.v * 2) / len) * this.radius}px`;
    }
  }
}
