// names.ts
// Vornamen für die Dorfbewohner - mittelalterlich, wie es zu einem Dorf in
// AoE2 passt. Jeder Lebende trägt einen eigenen Namen.

const MALE = [
  'Albrecht', 'Anselm', 'Arnold', 'Benedikt', 'Bernhard', 'Burkhard', 'Clemens', 'Dietrich',
  'Eberhard', 'Egon', 'Florian', 'Friedrich', 'Georg', 'Gerhard', 'Gottfried', 'Hans',
  'Hartmut', 'Heinrich', 'Hugo', 'Jakob', 'Jörg', 'Kaspar', 'Kilian', 'Konrad',
  'Leopold', 'Lothar', 'Lukas', 'Martin', 'Matthias', 'Nikolaus', 'Oswin', 'Otto',
  'Peter', 'Reinhard', 'Roland', 'Rudolf', 'Sebastian', 'Siegfried', 'Thomas', 'Ulrich',
  'Urban', 'Veit', 'Walther', 'Wilhelm', 'Wolfram',
];

const FEMALE = [
  'Adelheid', 'Agnes', 'Anna', 'Barbara', 'Beatrix', 'Berta', 'Brigitta', 'Christina',
  'Dorothea', 'Elisabeth', 'Emma', 'Frieda', 'Gertrud', 'Gisela', 'Greta', 'Hedwig',
  'Helene', 'Hildegard', 'Ida', 'Irmgard', 'Johanna', 'Jutta', 'Katharina', 'Klara',
  'Kunigunde', 'Lena', 'Liesel', 'Magdalena', 'Margarete', 'Maria', 'Martha', 'Mechthild',
  'Ottilie', 'Richardis', 'Rosa', 'Sophia', 'Theresa', 'Ursula', 'Veronika', 'Walburga',
];

const ROMAN = ['', ' II.', ' III.', ' IV.', ' V.', ' VI.', ' VII.', ' VIII.', ' IX.', ' X.'];

/**
 * Ein Name, den gerade niemand trägt. Sind alle vergeben, bekommt er eine
 * Ordnungszahl: "Konrad II.", dann "Konrad III." und so weiter.
 */
export function uniqueName(female: boolean, taken: ReadonlySet<string>): string {
  const names = female ? FEMALE : MALE;
  for (const suffix of ROMAN) {
    const free = names.map((n) => n + suffix).filter((n) => !taken.has(n));
    if (free.length > 0) return free[Math.floor(Math.random() * free.length)];
  }
  // Mehr als zehnmal jeder Name - dann eben mit Nummer.
  return `${names[0]} ${taken.size + 1}`;
}
