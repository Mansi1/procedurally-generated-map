# Alles aus Blender

Jedes Objekt des Spiels ist eine Blender-Datei: Dorfbewohner, Gebäude, Bäume,
Sträucher, Stein und Gold, Tiere, Werkzeuge und die Pflanzen der Felder. Die Bewegungen stecken in eigenen
Clip-Bibliotheken (docs/ANIMATION.md). Blender ist die Quelle - die Dateien
in `src/models/` werden daraus erzeugt und nicht von Hand bearbeitet.

Die früheren Generator-Skripte (`tools/models/villagers.mjs`,
`buildings.mjs`, `trees.mjs` ...) sind entfallen. Sie haben die `.blend`-
Dateien einmal angelegt und stehen in der Git-Geschichte.

## Wo was liegt

```
assets/blender/                       (Git LFS)
  models/                             Formen - je Objekt eine Datei
    villagers/  villager_male, villager_female
    buildings/  town_center, house(_2.._4), lumber_camp(_2.._4), mining_camp,
                mill(_2.._4), bowyer, armory
    trees/      tree_spruce, tree_pine, tree_oak(_young, _old), tree_birch(_2, _3),
                tree_maple, tree_poplar
    nature/     berry_bush_1..4, stone_1..3, gold_1..3
    animals/    deer, hare, cow, sheep, goat, boar
    props/      prop_axe, prop_knife, prop_scythe_male/_female, bow,
                rally_flag, marker_arrow
    fields/     field_stake, field_cord, field_wheat_leaf,
                field_wheat_stalk(_light, _dark), field_corn_1, field_corn_2
  clips/                              Bewegungen - je Skelett eine Datei
    humanoid, quadruped, mill, flag
```

| Befehl | macht |
|---|---|
| `npm run gen:models` | alle Dateien in `models/` → `src/models/<name>.obj` + `.mtl` |
| `npm run gen:anim` | alle Dateien in `clips/` → `src/models/<name>_clips.glb` + `.json` |

Blender wird über die Umgebungsvariable `BLENDER` gefunden, sonst am
üblichen Ort auf macOS (`/Applications/Blender.app`).

## Ein Modell bearbeiten

1. Die Datei in Blender öffnen, z. B. `assets/blender/models/buildings/house.blend`.
2. Bearbeiten: Objekte verschieben, drehen, skalieren, im Edit Mode formen,
   neue Objekte anlegen, Materialfarben ändern. Lage, Drehung und Größe
   eines Objekts werden beim Export eingerechnet.
3. Speichern, dann `npm run gen:models`.
4. Im Spiel oder in der Galerie ansehen (`npm run dev`, `/galerie`).

Achsen und Maße: Z ist oben, die Vorderseite zeigt nach -Y (Vorderansicht,
Taste 1). Einheit Meter, 1 Tile = 5 m, ein Dorfbewohner ist 1,7 m groß,
Türen 2,1 m. Gebäude werden im Spiel auf ihre Breite gebracht (`size` der
Gebäudeart), Figuren auf ihre Höhe - wird ein Gebäude breiter, wirkt es im
Spiel also kleiner.

## Was das Spiel aus Blender liest

Das Spiel kennt keine Blender-Datei, nur das exportierte OBJ. Darin zählen:

- **Der Name jedes Objekts.** Er sagt dem Spiel, was das Teil ist. Weil
  Blender doppelte Namen durchnummeriert (`Window.Frame.001`, `Berry.94`),
  steht der Name fürs Spiel in der Custom Property **`obj_name`** des Objekts
  (Object Properties → Custom Properties). Sie gilt, solange das Objekt in
  Blender so heißt wie nach dem Anlegen (`obj_blender_name`). Umbenennen in
  Blender wirkt also: dann gilt der neue Name. Eine Kopie (Shift+D) von
  `Window.Frame` heißt in Blender `Window.Frame.003` und im Spiel wieder
  `Window.Frame`; ein neues Objekt heißt im Spiel wie in Blender.
- **Der Name des Materials.** Er bestimmt das Aussehen: Farbe aus der MTL,
  Muster aus dem Shader (Holz, Stroh, Leinen, Marmor ...). `Paint` und
  `Tunic` werden zur Spielerfarbe. Materialnamen beim Bearbeiten behalten;
  ein neues Material mit neuem Namen bekommt nur seine Farbe.
- **Die Farbe des Materials** (Viewport Display → Color) wird Kd in der MTL.

Namen mit Bedeutung (nicht umbenennen, beim Kopieren mitnehmen):

| Name | Bedeutung |
|---|---|
| `Entry` | Eingang - dorthin gehen Dorfbewohner, wird nicht gezeichnet |
| `Work.Stand`, `Work.Aim` | Platz an der Werkbank und Blickrichtung (Bognerei) |
| `Leg.L`, `Leg.L.Lower`, `Arm.R`, `Arm.R.Lower`, `Head`, `Load` ... | Körperteile der Figuren - an ihnen hängen die Knochen |
| `Leg.FL/FR/BL/BR`, `Head` | Beine und Kopf der Tiere |
| `Arm.R.Lower.Tool…`, `…Scythe…`, `Knife…` | Werkzeuge an der Hand |
| `Sails` | Flügel der Mühle (drehen sich) |
| `Cloth` | Fahnentuch (weht) |
| `Berry.<n>` | einzelne Beeren - verschwinden beim Pflücken |
| `Trunk`, `Trunk.Stump` | Stamm und Stumpf - der Baum wird von oben abgesägt |
| `Stock.<n>` | Bögen in der Waffenkammer, je Vorrat sichtbar |
| `Craft.<n>` | Stufen des Bogens auf der Werkbank |
| `Cut.Roof`, `Cut.Wall` | Dach und Wände der Waffenkammer, beim Hineinsehen weg bzw. niedrig |

**Geprüft bei jedem Export:** `npm run gen:models` bricht mit einer Meldung
ab, wenn einem Modell ein Name mit Bedeutung fehlt - z. B. ein Gebäude ohne
`Entry`, eine Mühle ohne `Sails`, Lücken in `Stock.0` bis `Stock.99`, ein
Werkzeug im Körper eines Dorfbewohners - oder wenn eine Fläche kein Material
hat. Die Regeln stehen in `tools/blender/check-models.mjs`, einzeln:
`npm run check:models`.

Hilfsobjekte, die nicht ins Spiel sollen: in eine Collection legen, deren
Name mit `Vorlage` beginnt, oder im Render ausblenden (Kamera-Symbol).

## Ein neues Modell

1. Eine vorhandene Datei als Vorlage kopieren (z. B. `house.blend` →
   `bakery.blend`) oder neu anlegen. In den Scene Properties die Custom
   Properties setzen: `obj_file` (Dateiname, z. B. `bakery.obj`),
   `obj_mtllib` (`bakery.mtl`), optional `obj_header` (Kommentar oben im OBJ).
2. `npm run gen:models`.
3. Im Spiel eintragen: Import, Form in `SHAPE` und Eintrag in `MODELS`
   (`src/gl/entityRenderer.ts`), bei einem Gebäude dazu seine Klasse in
   `src/world/building/`.

## Der Umzug (einmalig)

`node tools/blender/models.mjs init` hat aus jedem OBJ in `src/models/` eine
`.blend`-Datei angelegt (`tools/blender/obj_to_blend.py`) und geprüft, dass
der Export (`tools/blender/blend_to_obj.py`) genau dasselbe ergibt:
alle 51 Modelle Fläche für Fläche gleich (`tools/blender/compare-obj.mjs`),
50 davon sogar Byte für Byte. Vorhandene `.blend`-Dateien überschreibt
`init` nur mit `--force` - das würde Änderungen in Blender verwerfen.

## Felder

Ein Feld sind Tausende Pflanzen - als eine Blender-Datei wären das 20 000
Objekte. In Blender liegen deshalb die **Teile** (`models/fields/`), das
Spiel stellt sie beim Start auf (`tools/models/farmsGen.mjs`): wo jede
Pflanze steht, wie hoch, geneigt und gedreht - mit denselben Zufallszahlen
wie früher, die Felder sehen aus wie vorher.

| Datei | wird im Spiel |
|---|---|
| `field_stake` | Pflock am Rand, so wie er ist |
| `field_cord` | Schnur - 1 m lang entlang x, gestreckt von Pflock zu Pflock |
| `field_wheat_leaf` | Blatt am Boden - 1 m nach oben, gestreckt auf 0,35–0,6 m und schräg gestellt |
| `field_wheat_stalk`, `_light`, `_dark` | Halm mit Ähre (drei Farben: 30 %, 55 %, 15 %) - Halm 1 m, gestreckt auf 0,8–1,05 m und geneigt, die Ähre sitzt darüber |
| `field_corn_1`, `field_corn_2` | Maispflanze mit einem bzw. zwei Kolben, 2,2 m - gedreht; was über 2 m liegt (Stängelspitze, Rispe), wächst mit der Höhe der Pflanze (2,0–2,45 m) |

Halm, Blatt und Schnur werden entlang ihrer Achse gestreckt, quer dazu
behalten sie ihre Dicke. Wer eine Maispflanze in Blender ändert: Blätter und
Kolben unter 2 m bleiben auf ihrer Höhe.

Verglichen mit den früheren Feldern: Blätter, Halme, Pflöcke und Schnur
liegen bis auf 0,2 cm gleich, die Ähren im Mittel 1,5 cm anders (sie setzen
jetzt den Halm fort), beim Mais Blätter 1 cm, Kolben 2,6 cm (ihre Höhe ist
jetzt im Modell fest statt zufällig).
