# tools

Skripte, die die Modelle und Bilder in `src/` erzeugen. Nach einer Änderung an
einem Skript neu erzeugen und die Ergebnisse mit einchecken.

| Befehl | erzeugt |
| --- | --- |
| `npm run gen:models` | `src/models/*.obj` und `*.mtl`: Dorfbewohner, Gebäude, Beerensträucher, Bäume, Stein und Gold |
| `npm run gen:ui` | `src/icons/*.png`: Symbole der Rohstoffleiste und ihre Holztextur |

Einzeln: `node tools/models/trees.mjs [Zielordner]` usw.; ohne Zielordner wird
direkt in `src/` geschrieben.

- `models/lib.mjs` - Grundformen (Quader, Prismen, Balken), Dächer, Fässer, Kisten
- `models/*.mjs` - je ein Generator; Maße in Metern, 1 Tile = 5 m
- `ui/icons.mjs` + `ui/icons.html` - rendert die Spielmodelle als Symbole
- `ui/wood-bar.mjs` - Holzplanken für die Rohstoffleiste
- `ui/smoke.mjs` - Rauchtest im Browser (`npm run smoke`, bei laufendem `npm run dev`):
  Hauptmenü, neues Spiel, bauen, ausbilden, Feld, speichern und neu laden, Demo, alter
  Spielstand, Galerie.
  Andere Adresse als Argument: `node tools/ui/smoke.mjs http://localhost:5199`

`gen:ui` braucht Google Chrome (über `playwright-core`). Liegt Chrome nicht am
üblichen Ort unter macOS, den Pfad in der Umgebungsvariable `CHROME` angeben.
Die Symbole zeigen die Modelle - nach `gen:models` also auch `gen:ui` laufen lassen.

## L-System-Bäume (`lsystem/`)

Versuch, Bäume und Pflanzen mit einem [L-System](https://en.wikipedia.org/wiki/L-system)
in 3D zu erzeugen - noch nicht im Spiel. In TypeScript, streng geprüft:
`npx tsc -p tools/lsystem`.

- Spielwiese: `npm run dev`, dann <http://localhost:5173/tools/lsystem/> - online unter
  `/tools/lsystem/` (im Hauptmenü "L-System"; `vite.config.ts` baut beide Seiten mit). Beispiel
  wählen, Regeln und Regler ändern, Blätter als Form oder Foto, ziehen dreht,
  Mausrad zoomt, als OBJ + MTL herunterladen.
- Galerie aller Beispiele: <http://localhost:5173/tools/lsystem/gallery.html>
  (`?leaves=texture` für die Fotos)
- Export aller Beispiele: `npx vite-node tools/lsystem/export.ts [--texture] [--einzeln] [Zielordner]`
  (Standard `tools/lsystem/out`, nicht eingecheckt). Ohne `--texture` sind die Blätter
  einfarbige Flächen nach dem Umriss des Fotos, mit `--texture` Vierecke mit dem Foto
  (`map_Kd`/`map_d`, die Bilder werden nach `<Zielordner>/leaves/` kopiert).
- Blattebenen: Das Laub besteht aus Ebenen mit einem Zweig und 4 bis 6 Blättern
  (`img/<name>-card.png`) - weniger Flächen, dichter. `--einzeln` bzw. „Einzelblätter“
  in der Spielwiese setzt jedes Blatt als eigene Fläche. Nadelbäume nutzen ihr
  Zweigfoto direkt, es ist schon eine Ebene.
- `lsystem.ts` - Regeln lesen, ersetzen, Schildkröte in 3D (mit Tropismus), Astdicke
  nach dem Pipe-Modell, Laub und Organe (Blatt, Ähre, Kolben, Rosetten, Früchte)
- `foliage.ts` - echte Blätter: Umriss triangulieren oder Foto-Viereck, Farbe bzw. Einfärbung
- `leaves/` - Blattfotos von Wikimedia Commons: `sources.ts` (Datei, Lizenz, Drehung),
  `fetch.ts` lädt, stellt frei und setzt die Blattebenen zusammen (`process.ts`;
  `npx vite-node tools/lsystem/leaves/fetch.ts [name ...]`, braucht Chrome wie `gen:ui`,
  Downloads bleiben in `.cache/`), Ergebnis in `img/`, `leaves.json` und `CREDITS.md`.
  Die Bilder stehen unter CC BY-SA/CC BY/CC0 - Urheber und Lizenz in `leaves/CREDITS.md`
  nennen, wenn sie weitergegeben werden.
- `materials.ts`, `mtl.ts` - Farben und MTL-Ausgabe
- `presets/` - Rezepte nach Gruppen: Laubbäume, Nadelbäume, Obstbäume, Exoten,
  Getreide, Klassiker aus "The Algorithmic Beauty of Plants"; dazu Varianten
  (Herbst, Winter, Blüte, jung) über `variant`, `autumn`, `winter` in `presets/base.ts`
- `render.ts`, `looks.ts`, `viewer.ts`, `gallery.ts` + die beiden HTML-Seiten - Vorschau
