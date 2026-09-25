// cropIcons.ts
// Symbole für Felder: eine Weizengarbe und ein Maiskolben auf einem Stück
// gepflügter Erde. Das Feldmodell ist von oben eine flache Raute und im
// Knopf kaum zu erkennen - darum hier gezeichnet, als Bild-URL wie die
// Symbole aus modelIcons.ts.

import type { CropType } from '../world/catalog';

/** Gepflügte Erde unten: Raute mit Furchen. */
const SOIL = `
  <path d="M4 38 L24 30 L44 38 L24 46 Z" fill="#6b4524" stroke="#2a1606" stroke-width="1.2"/>
  <path d="M10 38 L24 32.4 M15 40 L29 34.4 M20 42 L34 36.4 M25 44 L38 38.8" stroke="#3e2512" stroke-width="1.1"/>`;

/** Ähre: Halm und Körner links und rechts. */
function ear(x: number, top: number, lean: number): string {
  const grains = [0, 1, 2, 3, 4].map((i) => {
    const y = top + 2 + i * 2.6;
    const cx = x + lean * (i / 5);
    return `<ellipse cx="${cx - 1.6}" cy="${y}" rx="1.5" ry="2.3" transform="rotate(-25 ${cx - 1.6} ${y})"/>`
      + `<ellipse cx="${cx + 1.6}" cy="${y}" rx="1.5" ry="2.3" transform="rotate(25 ${cx + 1.6} ${y})"/>`;
  }).join('');
  return `<path d="M${x + lean} ${top + 13} Q${x + lean * 0.6} 30 ${x} 38" stroke="#b58a2a" stroke-width="1.4" fill="none"/>`
    + `<g fill="#f0c24a" stroke="#8a5f14" stroke-width="0.6">${grains}</g>`;
}

const WHEAT = `${SOIL}
  ${ear(14, 6, -3)}${ear(20, 3, -1)}${ear(26, 2, 1)}${ear(32, 5, 3)}${ear(23, 9, 0)}
  <path d="M15 30 Q24 27 33 30" stroke="#8a5f14" stroke-width="2.2" fill="none"/>`;

const CORN = `${SOIL}
  <path d="M24 38 Q20 24 10 16 Q18 20 23 28" fill="#4f9a3a" stroke="#244a18" stroke-width="1"/>
  <path d="M24 38 Q29 22 40 14 Q31 21 25 30" fill="#5fae45" stroke="#244a18" stroke-width="1"/>
  <ellipse cx="24" cy="19" rx="6" ry="12" fill="#f4c73a" stroke="#8a5f14" stroke-width="1.2"/>
  <g fill="#ffe27a">${[0, 1, 2, 3, 4, 5, 6].map((r) => [-1, 0, 1].map((c) =>
    `<circle cx="${24 + c * 3.3}" cy="${10 + r * 3}" r="1.2"/>`).join('')).join('')}</g>
  <path d="M18 24 Q15 32 22 38 Q19 30 20 22 Z" fill="#6cbc4c" stroke="#244a18" stroke-width="1"/>
  <path d="M30 24 Q33 32 26 38 Q29 30 28 22 Z" fill="#6cbc4c" stroke="#244a18" stroke-width="1"/>`;

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${body}</svg>`)}`;

const ICONS: Record<CropType, string> = { wheat: svg(WHEAT), corn: svg(CORN) };

/** Weizengarbe oder Maiskolben auf Erde - für Knöpfe und das Feld im Baumenü. */
export function cropIcon(crop: CropType): string {
  return ICONS[crop];
}
