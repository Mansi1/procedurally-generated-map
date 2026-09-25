// Herkunft der Blattbilder (Wikimedia Commons). fetch.ts lädt sie, stellt das
// Blatt frei und schreibt Textur, Umriss und Farbe nach leaves/img und leaves.json.
//
// rotate: Grad im Uhrzeigersinn, bis der Stiel unten und die Spitze oben ist.
// tone: welche Farbe das Foto zeigt - passt sie zum Material am Baum, wird das
// Foto direkt genommen, sonst eine graue Fassung, eingefärbt mit dem Material.
export type Tone = 'green' | 'autumn' | 'blossom';

export interface LeafSource {
  /** Dateiname auf Wikimedia Commons, ohne "File:". */
  readonly file: string;
  readonly license: string;
  readonly author: string;
  readonly rotate: number;
  readonly tone: Tone;
  /** Hintergrund-Toleranz beim Freistellen, 0..441 (Abstand im RGB-Raum). */
  readonly tolerance?: number;
  /** Vorher abschneiden, Anteil je Seite [oben, rechts, unten, links] - z. B. ein Maßstab am Stiel. */
  readonly crop?: readonly [number, number, number, number];
  /**
   * Blätter auf der Blattebene (ein Zweig mit mehreren Blättern, process.ts), ohne
   * das an der Spitze; Standard 5. false: das Foto ist schon ein Zweig (Nadelbäume).
   */
  readonly card?: number | false;
}

export const LEAF_SOURCES = {
  ahorn: { file: '2020 year. Herbarium. Acer platanoides. img-003.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green' },
  eiche: { file: '2020 year. Herbarium. Oak. img-059.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green' },
  buche: { file: 'Autumn European Beech Leaf.jpg', license: 'CC BY-SA 3.0', author: 'Ninjatacoshell', rotate: 0, tone: 'autumn' },
  blutbuche: { file: 'Fagus sylvatica var. purpurea, Blatt -freigestellte- remixed.png', license: 'CC BY-SA 4.0', author: 'T. C. Woodeggs', rotate: 0, tone: 'autumn' },
  linde: { file: '2020 year. Herbarium. Tilia cordata. img-019.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green' },
  kastanie: { file: 'Aesculus hippocastanum scanned leaf.png', license: 'CC BY-SA 3.0', author: 'Andrikkos', rotate: 0, tone: 'green', card: 3 },
  esche: { file: '2020 year. Herbarium. Fraxinus. img-008.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green', crop: [0, 0, 0.07, 0], card: 3 },
  ulme: { file: '2020 year. Herbarium. Ulmus. img-003.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green', crop: [0, 0, 0.07, 0] },
  platane: { file: 'Platanenblatt 02.jpg', license: 'CC BY-SA 3.0', author: 'Amada44', rotate: 0, tone: 'autumn' },
  erle: { file: '2020 year. Herbarium. Alnus glutinosa. img-002.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green' },
  walnuss: { file: 'Ruhland, Gutshof 2, Echte Walnuss, Blatt (Oberseite), 01.jpg', license: 'CC BY-SA 4.0', author: 'Wilhelm Zimmerling PAR', rotate: 90, tone: 'green', tolerance: 95, card: 3 },
  birke: { file: 'Betula pendula scanned leaves.png', license: 'CC BY-SA 3.0', author: 'Andrikkos', rotate: 135, tone: 'green' },
  weide: { file: '2020 year. Herbarium. Salix alba. img-007.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green' },
  ginkgo: { file: 'Ginkgo biloba scanned leaf.jpg', license: 'CC BY-SA 3.0', author: 'Andrew Butko', rotate: 0, tone: 'green' },
  apfel: { file: '2020 year. Herbarium. Malus. img-007.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green' },
  kirsche: { file: 'Young Cherry leaf.JPG', license: 'Public domain', author: 'Rosser1954', rotate: 90, tone: 'green', tolerance: 70 },
  olive: { file: 'Olea europea. Oliveira.jpg', license: 'CC BY-SA 2.0', author: 'iesmgb (Flickr)', rotate: -45, tone: 'green' },
  eukalyptus: { file: 'Stringy bark leaf443.jpg', license: 'CC BY-SA 3.0', author: 'Benjamint444', rotate: -135, tone: 'green' },
  // Auf Commons als "Acacia" beschriftet, dem Aussehen nach die Robinie (Scheinakazie) - gefiedert wie die Schirmakazie.
  akazie: { file: '2020 year. Herbarium. Acacia. img-002.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green', crop: [0, 0, 0.07, 0], card: 3 },
  baobab: { file: 'Adansonia digitata 1DS-II 2574.jpg', license: 'CC BY-SA 4.0', author: 'SAplants', rotate: 0, tone: 'green', card: 3 },
  fichte: { file: '2020 year. Herbarium. Picea abies. img-007.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green', crop: [0, 0, 0.07, 0], card: false },
  kiefer: { file: '2020 year. Herbarium. Pinus. img-002.jpg', license: 'CC BY-SA 4.0', author: 'Dmitry Makeev', rotate: 0, tone: 'green', crop: [0, 0, 0.07, 0], card: false },
  laerche: { file: 'Larix decidua leaf dimorphism singly or in dense clusters on same tree.jpg', license: 'CC BY-SA 3.0', author: 'unbekannt (siehe Commons)', rotate: 0, tone: 'green', tolerance: 125, card: false },
  zeder: { file: 'E20161008-0003—Cedrus atlantica—Berkeley—DxO (30164010426).jpg', license: 'CC BY 2.0', author: 'John Rusk', rotate: -30, tone: 'green', card: false },
  eibe: { file: 'IfMale branchette.jpg', license: 'CC BY-SA 3.0', author: 'Lamiot', rotate: -90, tone: 'green', tolerance: 85, card: false },
  mammutbaum: { file: 'Riesenmammutbaum Sequoiadendron giganteum top 08.jpg', license: 'CC BY-SA 3.0', author: 'NobbiP', rotate: -90, tone: 'green', card: false },
  bluete_apfel: { file: 'Apple blossom Apfelblüte 05.jpg', license: 'CC BY-SA 3.0', author: 'Norbert Nagel', rotate: 0, tone: 'blossom' },
  bluete_magnolie: { file: 'Pristine magnolia (Unsplash).jpg', license: 'CC0', author: 'Quino Al', rotate: 0, tone: 'blossom' },
} as const satisfies Record<string, LeafSource>;

export type LeafName = keyof typeof LEAF_SOURCES;
