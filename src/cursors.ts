// cursors.ts
// Mauszeiger für Sammel-Befehle, wie in AoE2: zeigt man mit ausgewählten
// Dorfbewohnern auf ein Vorkommen, sieht man das Werkzeug, mit dem sie dort
// arbeiten würden. Die Bilder sind kleine SVGs mit dunklem Rand, damit sie auf
// hellem wie dunklem Gelände lesbar bleiben.

import type { DepositType } from './world/catalog';

/** CSS-Wert für `cursor`. Der Klickpunkt liegt an der Werkzeugspitze. */
function svgCursor(body: string, hotX: number, hotY: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, pointer`;
}

/** Stiel von links oben nach rechts unten, mit dunklem Rand. */
const HANDLE =
  '<path d="M9 9 L27 27" stroke="#111" stroke-width="5" stroke-linecap="round"/>' +
  '<path d="M9 9 L27 27" stroke="#9a6532" stroke-width="3" stroke-linecap="round"/>';

/** Spitzhacke: gebogener Kopf quer zum Stiel, in der Farbe des Erzes. */
const pickaxe = (head: string) =>
  HANDLE +
  '<path d="M2 14 Q5 5 14 2" fill="none" stroke="#111" stroke-width="5.5" stroke-linecap="round"/>' +
  `<path d="M2 14 Q5 5 14 2" fill="none" stroke="${head}" stroke-width="3.5" stroke-linecap="round"/>`;

export const GATHER_CURSOR: Record<DepositType, string> = {
  // Axt: breites Blatt oben links am Stiel
  wood: svgCursor(
      HANDLE +
      '<path d="M3 12 Q1 3 11 2 L14 6 L6 14 Z" fill="#d6dbe0" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>',
      4, 4),
  stone: svgCursor(pickaxe('#b9bec6'), 3, 13),
  gold: svgCursor(pickaxe('#f2c230'), 3, 13),
  // Beeren: drei Früchte mit Blatt
  berries: svgCursor(
      '<path d="M13 9 Q17 1 25 4 Q20 11 13 9 Z" fill="#4f9a3a" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<circle cx="10" cy="15" r="5" fill="#c23b45" stroke="#111" stroke-width="1.5"/>' +
      '<circle cx="19" cy="14" r="5" fill="#c23b45" stroke="#111" stroke-width="1.5"/>' +
      '<circle cx="14" cy="22" r="5" fill="#c23b45" stroke="#111" stroke-width="1.5"/>',
      14, 16),
};

/** Sammelpunkt setzen: kleine Fahne, Klickpunkt am Fuß des Masts. */
export const RALLY_CURSOR = svgCursor(
    '<path d="M7 29 L7 4" stroke="#111" stroke-width="4.5" stroke-linecap="round"/>' +
    '<path d="M7 29 L7 4" stroke="#9a6532" stroke-width="2.5" stroke-linecap="round"/>' +
    '<path d="M8 5 L25 8 L8 15 Z" fill="#4670be" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/>',
    7, 29);
