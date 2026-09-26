// cropIcons.ts
// Symbole für Felder: Weizengarbe, Maiskolben, Tomaten, Kartoffeln und Hopfen auf einem Stück
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

const TOMATO = `${SOIL}
  <path d="M30 38 V6" stroke="#8a5a2a" stroke-width="2.4"/>
  <path d="M24 38 Q22 26 25 14" stroke="#3f7a26" stroke-width="2" fill="none"/>
  <path d="M24 26 Q14 22 10 26 Q16 28 24 26 Z M25 18 Q34 12 38 16 Q32 20 25 18 Z" fill="#4f9a3a" stroke="#244a18" stroke-width="1"/>
  <g fill="#e0301c" stroke="#7a140a" stroke-width="1">
    <circle cx="17" cy="31" r="5"/><circle cx="26" cy="30" r="4.5"/><circle cx="20" cy="22" r="4"/>
  </g>
  <g fill="#ffffff" opacity="0.5"><circle cx="15.5" cy="29.5" r="1.3"/><circle cx="24.8" cy="28.6" r="1.1"/></g>`;

const POTATO = `${SOIL}
  <path d="M24 30 Q20 18 13 12 M24 30 Q26 16 33 10 M24 30 Q24 20 24 14" stroke="#3f7a26" stroke-width="1.6" fill="none"/>
  <g fill="#4f9a3a" stroke="#244a18" stroke-width="0.8">
    <ellipse cx="13" cy="14" rx="5" ry="3"/><ellipse cx="33" cy="12" rx="5" ry="3"/><ellipse cx="18" cy="21" rx="4" ry="2.5"/><ellipse cx="30" cy="20" rx="4" ry="2.5"/>
  </g>
  <g fill="#eee6f6" stroke="#8a7aa0" stroke-width="0.6"><circle cx="24" cy="11" r="2.2"/><circle cx="21" cy="9" r="1.8"/></g>
  <g fill="#c8a060" stroke="#6a4a20" stroke-width="1.2">
    <ellipse cx="16" cy="36" rx="6" ry="4.2"/><ellipse cx="30" cy="37" rx="7" ry="4.5"/><ellipse cx="23" cy="41" rx="5" ry="3.5"/>
  </g>`;

/** Hopfendolde: Kegel aus überlappenden Schuppen. */
function cone(x: number, y: number, s: number): string {
  const scales = [0, 1, 2, 3].map((r) => [-1, 1].slice(0, r === 3 ? 1 : 2).map((c) =>
    `<ellipse cx="${x + (r === 3 ? 0 : c * s * (1.6 - r * 0.35))}" cy="${y + r * s * 1.9}" rx="${s * 1.4}" ry="${s * 1.3}"/>`).join('')).join('');
  return `<g fill="#b8d060" stroke="#4e6a1c" stroke-width="0.8">${scales}</g>`;
}

const HOP = `${SOIL}
  <path d="M34 38 V4" stroke="#8a5a2a" stroke-width="2"/>
  <path d="M26 38 Q38 32 30 26 Q22 20 34 14 Q40 10 33 5" stroke="#3f7a26" stroke-width="1.8" fill="none"/>
  <path d="M30 26 Q20 22 14 26 Q20 30 30 26 Z M33 14 Q42 12 44 17 Q38 19 33 14 Z" fill="#4f9a3a" stroke="#244a18" stroke-width="1"/>
  ${cone(19, 12, 2.4)}${cone(26, 18, 2.2)}${cone(15, 27, 2)}`;

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${body}</svg>`)}`;

const ICONS: Record<CropType, string> = { wheat: svg(WHEAT), corn: svg(CORN), tomato: svg(TOMATO), potato: svg(POTATO), hop: svg(HOP) };

/** Weizengarbe, Maiskolben, Tomaten, Kartoffeln oder Hopfen auf Erde - für Knöpfe und das Feld im Baumenü. */
export function cropIcon(crop: CropType): string {
  return ICONS[crop];
}
