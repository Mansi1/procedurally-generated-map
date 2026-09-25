// Compass.ts
// Der Kompass über der Minimap: vier Himmelsrichtungen, die dorthin wandern,
// wohin sie gerade im Bild zeigen, und eine Nadel nach Norden. Ein Klick auf
// eine Richtung dreht die Ansicht so, dass sie oben liegt.

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

export class Compass {
  /** @param onFace Klick auf eine Richtung - main.ts dreht die Ansicht und merkt sie sich */
  constructor(private root: HTMLElement, onFace: (dir: string) => void) {
    root.addEventListener('click', (e) => {
      const dir = (e.target as HTMLElement).closest('button')?.dataset.dir;
      if (dir) onFace(dir);
    });
  }

  /** Stellt die Buchstaben dorthin, wohin ihre Richtung gerade im Bild zeigt. */
  update() {
    const size = this.root.clientWidth;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('button')) {
      const [dx, dy] = COMPASS[button.dataset.dir!];
      const g = worldToGround(dx, dy);
      // u zeigt nach rechts, v nach unten; die Länge ist egal.
      const len = Math.hypot(g.u, g.v * 2);
      const x = (g.u / len) * (size / 2 - 14);
      const y = ((g.v * 2) / len) * (size / 2 - 14);
      button.style.left = `${size / 2 + x - 11}px`;
      button.style.top = `${size / 2 + y - 11}px`;
      if (button.dataset.dir === 'N') {
        const needle = this.root.querySelector<HTMLElement>('.needle')!;
        needle.style.transform = `rotate(${Math.atan2(x, -y)}rad)`;
      }
    }
  }
}
