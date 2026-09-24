// worlds.ts
// Welche Welt (Seed) gespielt wird - nicht mehr in der Adresse, sondern im
// localStorage: die zuletzt gewählte. Eine andere Welt beginnt mit einem
// Neuladen der Seite; ein Vermerk im sessionStorage sagt der neuen Seite,
// dass sie gleich ein neues Spiel startet statt des Hauptmenüs.

/** Die Welt, wenn noch keine gewählt wurde. */
export const DEFAULT_SEED = 'Soliva';

const SEED_KEY = 'pgm.seed';
const NEW_GAME_KEY = 'pgm.newGame';

/** Die zuletzt gewählte Welt. */
export function currentSeed(): string {
  try {
    return localStorage.getItem(SEED_KEY) || DEFAULT_SEED;
  } catch {
    return DEFAULT_SEED;
  }
}

/** Hat die Welt einen Spielstand mit Gebäuden oder Dorfbewohnern? */
export function hasProgress(seed: string): boolean {
  try {
    const data = JSON.parse(localStorage.getItem(`pgm.world.${seed}`) ?? 'null');
    return (data?.buildings?.length ?? 0) > 0 || (data?.villagers?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Neues Spiel in einer anderen Welt: Seed merken und die Seite neu laden. */
export function startInWorld(seed: string) {
  try {
    localStorage.setItem(SEED_KEY, seed);
    sessionStorage.setItem(NEW_GAME_KEY, '1');
  } catch {
    // Ohne Speicher bleibt es bei der jetzigen Welt.
    return;
  }
  window.location.replace('/');
}

/** Soll diese Seite gleich ein neues Spiel beginnen? Der Vermerk gilt nur einmal. */
export function takeNewGameRequest(): boolean {
  try {
    const requested = sessionStorage.getItem(NEW_GAME_KEY) === '1';
    sessionStorage.removeItem(NEW_GAME_KEY);
    return requested;
  } catch {
    return false;
  }
}

/** Ein Name für eine Zufallswelt, aussprechbar wie "Soliva": Silben aus Mitlaut und Selbstlaut. */
export function randomSeed(): string {
  const consonants = 'bdfgklmnprstvz';
  const vowels = 'aeiou';
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const syllables = 2 + Math.floor(Math.random() * 2);
  let name = '';
  for (let i = 0; i < syllables; i++) name += pick(consonants) + pick(vowels);
  return name[0].toUpperCase() + name.slice(1);
}
