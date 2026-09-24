// settings.ts
// Die Einstellungen: welche es gibt, ihre Vorgaben, Laden und Speichern. Die
// Werte merkt sich der Browser; ohne Speicher gelten die Vorgaben. Das Menü
// dazu ist components/SettingsMenu.tsx.

export interface Settings {
  /** Lautstärke 0..1 - an/aus steuert weiterhin Sound.enabled (Taste M). */
  volume: number;
  /** Lautstärke der Hintergrundmusik 0..1 - der Ton-Schalter (M) gilt auch für sie. */
  music: number;
  /** Spielgeschwindigkeit: 1 = normal. */
  speed: number;
  /** Kamera-Tempo mit WASD/Pfeiltasten: 1 = normal. */
  scroll: number;
  /** Tastenhilfe oben rechts. */
  showHelp: boolean;
  /** Legende und Tile-, Kamera- und FPS-Anzeige oben links. */
  showDebug: boolean;
  /** Himmelsrichtung, die oben im Bild liegt (Kompass) - bleibt beim Neuladen. */
  facing: string;
  /** Angehalten (F3) - bleibt beim Neuladen. */
  paused: boolean;
  /** Spielerfarbe - Schlüssel in PLAYER_COLORS. */
  playerColor: string;
}

const DEFAULTS: Settings = {
  volume: 1, music: 0.5, speed: 1, scroll: 1, showHelp: true, showDebug: true, facing: '', paused: false,
  playerColor: 'green',
};
const STORAGE_KEY = 'pgm.settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Kein Speicher oder kaputter Eintrag - dann die Vorgaben.
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Ohne Speicher gelten die Einstellungen nur bis zum Neuladen.
  }
}
