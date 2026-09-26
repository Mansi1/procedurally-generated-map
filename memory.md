# memory.md

Gelerntes und Erfahrungen der Agenten - Regeln dazu in `AGENTS.md` ("memory.md").
Veraltetes löschen, Geändertes an Ort und Stelle korrigieren.

## Umgebung

- 2026-09-26: `npm test` scheitert unter Node 24 mit "Cannot find module …/tests" - `node --test tests/` nimmt kein Verzeichnis mehr an. Bis PR #4 gemergt ist: `node --test tests/*.test.mjs`. Danach diesen Eintrag löschen.
- 2026-09-26, Mac (M4): Headless-Chrome aus `tools/ui/browser.mjs` rendert über Metal auf der echten GPU (`ANGLE Metal Renderer: Apple M4`), kein Software-Renderer; `EXT_disjoint_timer_query_webgl2` ist vorhanden. Messwerte aus Playwright sind echt.
- Bench, Rauchtest und Screenshots brauchen den laufenden Dev-Server (`npm run dev`, http://localhost:5173).

## Branches und PRs

- 2026-09-26: PR #4 (`fix-smooth-zoom`, von `origin` kyr0/soliva nach `upstream` Mansi1/procedurally-generated-map) enthält Render-Stats, Bench, Optimierungsplan und die ersten Optimierungen. PR #5 (`add-agents-md`) basiert auf `main` - dort gibt es Bench und Render-Stats erst nach dem Merge von #4. Der lokale Branch `optimization-plan` ist ein Duplikat von `fix-smooth-zoom` und kann weg.

## Messen

- 2026-09-26, M4, Stand `6b5b5bd`: Alle Bench-Szenen laufen mit 60 fps und `frameMsMax` 16,8 ms, auch `zoom-wechsel`. Der Zoom ist auf diesem Rechner nicht langsam, Gewinne im Gelände-Shader zeigt der Bench hier nicht.
- 2026-09-26, M4: Größenordnungen je Bild - `weit-leer` 144 Draw-Calls, 0,87 Mio. Gelände-Eckpunkte; `stadt` rund 3 Mio. Modell-Eckpunkte; `zoom-wechsel` rund 95.000 neue Gelände-Texel; ein Pick (`pickMs`) 0,2-0,3 ms. Die erste Sekunde nach dem Laden hat eine Long Task von ~1,7 s - nie mitmessen.
- 2026-09-26: `baseline.json` stammt von vor den Optimierungen (`6b5b5bd`). Nach der nächsten bewussten Messung neu setzen.
- 2026-09-26, M4: Screenshot-Rauschen zweier Läufe desselben Codes (angehalten, 1280×800, DPR 1): 0,004-0,095 % der Pixel, einzelne Pixel bis 237 Farbstufen (Animationen). Darunter gilt ein Bild als gleich.
- Medianwerte je Szene verstecken Spitzen: Beim Zoom-Wechsel `frameMsMax` und `terrainTexels` mit ansehen, nicht nur `frameMs`.
- Die Demo-Welt hat 31 Gebäude und 42 Dorfbewohner - weniger als die "große Stadt mit 80+" aus Szenario (b) des Optimierungsplans.

## Optimierungsplan

- 2026-09-26: Falsch im Plan, am Code geprüft: 2.2 ist nicht bit-identisch (ein grober Vorlauf überspringt schmale Grate); ein Early-out in `World.armoryStock` ändert das Verhalten, weil `world/render.ts` `has()` prüft. Die Zeilenangaben des Plans stimmen seit PR #4 nicht mehr.

## Offen

- GPU-Zeit fehlt im Bench: `gpuFillMs` über `EXT_disjoint_timer_query_webgl2` würde Shader-Optimierungen belegbar machen - vor Plan 5.1 (Höhen-Textur) einbauen.
- Kein Screenshot-Skript im Repo - das Verfahren steht in `AGENTS.md`; als `tools/perf/shots.mjs` neben dem Bench wäre es ein Aufruf.
