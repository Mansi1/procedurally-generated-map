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

`gen:ui` braucht Google Chrome (über `playwright-core`). Liegt Chrome nicht am
üblichen Ort unter macOS, den Pfad in der Umgebungsvariable `CHROME` angeben.
Die Symbole zeigen die Modelle - nach `gen:models` also auch `gen:ui` laufen lassen.

## L-System-Bäume (`lsystem/`)

Versuch, Bäume mit einem [L-System](https://en.wikipedia.org/wiki/L-system) in 3D
zu erzeugen - noch nicht im Spiel. In TypeScript, streng geprüft:
`npx tsc -p tools/lsystem`.

- Spielwiese: `npm run dev`, dann <http://localhost:5173/tools/lsystem/>. Beispiel
  wählen, Regeln und Regler ändern, ziehen dreht, Mausrad zoomt, das Ergebnis als OBJ herunterladen.
- Export aller Beispiele: `npx vite-node tools/lsystem/export.ts [Zielordner]`
  (Standard `tools/lsystem/out`, nicht eingecheckt).
- `lsystem.ts` - Regeln lesen, ersetzen, Schildkröte in 3D (mit Tropismus), Astdicke
  nach dem Pipe-Modell, Modell über `models/primitives.mjs`
- `presets.ts` - Beispiele: Busch (ABOP 1.25), Laubbaum, Fichte, Tanne, Hängebirke, Pappel, sympodial
- `render.ts` + `viewer.ts` + `index.html` - die Spielwiese
