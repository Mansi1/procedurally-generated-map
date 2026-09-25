# Aufräumplan: Struktur statt Doppelungen

Ziel: Der Code soll für Menschen lesbar sein. Jedes Thema hat einen festen
Ort, jede Tatsache steht genau einmal im Code, und keine Datei ist so groß,
dass man sie nicht mehr überblickt.

## Leitlinien

1. **Eine Quelle der Wahrheit.** Jede Tatsache steht genau einmal im Code.
   Alles andere wird daraus abgeleitet. Ein Beispiel: die Liste der
   Gebäudearten.
2. **Eine Datei, ein Thema.** Richtwert: höchstens ~300 Zeilen je Datei.
   Klassen liegen in PascalCase-Dateien (`House.ts`), Module in
   camelCase-Dateien (`farming.ts`).
3. **Klassen für Dinge mit Zustand und Verhalten.** Dazu gehören Gebäude,
   Dorfbewohner und Tiere. Reine Daten und Hilfsfunktionen bleiben Module.
4. **Die Definition steht bei ihrer Klasse.** Name, Kosten und Größe eines
   Hauses stehen in `House.ts`, nicht in einer fernen Tabelle.
5. **Keine Kreis-Importe, die beim Laden etwas brauchen.** Was Klassen schon
   beim Laden ihrer Definition brauchen, liegt in Blatt-Modulen ohne
   Rückverweis, z. B. `building/common.ts`.
6. **Das Format des Spielstands bleibt kompatibel.** Alte Spielstände
   (Version 1–3, `public/savegame/demo.json`) müssen weiter laden.
7. **Jeder Schritt ist für sich fertig.** Er besteht `tsc` und
   `npm run build`, dazu einen Browser-Test (siehe unten), und bekommt einen
   eigenen Commit.

## Domänenmodell (erst die Struktur, dann der Code)

Was es im Spiel gibt und wem was gehört:

```
Game (main.ts + game/)          Eingabe, Kamera, Auswahl, Oberfläche
 └─ World                        der Spielstand - kennt keine Oberfläche
     ├─ stock: Resources         Vorrat: food, wood, stone, gold
     ├─ buildings: BuildingRegistry   Gebäude nach Ankerpunkt, belegte Tiles
     ├─ villagers: Villager[]
     ├─ animals: Animal[]
     ├─ deposits: ResourceDeposits    Vorkommen auf der Karte: abgebaut, gefällt, nachwachsend
     └─ terrain: Terrain (heute TileProbe)   Gelände, Höhe, Vorkommen laut Generator
```

Klassen-Hierarchie - überall dasselbe Muster: abstrakte Basis mit dem
Verhalten, je Art eine kleine Klasse mit ihrer statischen `definition`.

```
BuildingBase (abstrakt)          Lage, Trefferpunkte, Modell-Variante, speichern
 ├─ UnitProducer (abstrakt)      Warteschlange, Sammelpunkt, kennt seine Einheit
 │   └─ TownCenter
 ├─ StorageBuilding (abstrakt)   nimmt Rohstoffe an (storedResources)
 │   ├─ LumberCamp
 │   ├─ MiningCamp
 │   └─ Mill
 ├─ House                        Wohnraum (housing)
 └─ Farm                         Feld: Tiles, Furchen, Frucht

UnitBase (abstrakt)              Lage, Trefferpunkte, Blickrichtung, Bewegung
 ├─ Villager                     Aufgabe, Ladung, Name
 └─ AnimalBase (abstrakt)        Herde, Flucht, Kadaver
     ├─ Deer
     └─ Hare
```

Regeln für die Struktur:

- **Definition = Daten, Klasse = Verhalten.** Die statische `definition`
  enthält nur Werte (Name, Kosten, Größe, Modell). Verhalten steht in den
  Methoden der Basisklassen.
- **Eine Registry je Familie.** `BUILDING_CLASSES` und `ANIMAL_CLASSES` sind
  die einzige Aufzählung. Daraus werden Typ-Union, Reihenfolge im Baumenü und
  die Nachschlage-Tabelle abgeleitet.
- **Die Welt ist Datenhaltung plus Regeln, keine Darstellung.** Instanzen für
  den Renderer baut `world/render.ts`, Texte für die Oberfläche baut `game/`.
- **Keine optionalen Felder, die nur für eine Unterklasse gelten** (heute
  `farm?` an jedem Gebäude). Stattdessen gibt es Typwächter wie `isFarm()`
  und `isUnitProducer()`.

## Benennung

Regeln:

| Was | Regel | Beispiel |
|---|---|---|
| Bezeichner | Englisch; Kommentare bleiben Deutsch | `storedResources`, nicht `lager` |
| Klassen, Typen | PascalCase, Substantiv | `LumberCamp`, `Resources` |
| Art-Kennung (id) | snake_case, **gleich der Klasse** | `lumber_camp` ↔ `LumberCamp` |
| Wahrheitswerte | `is…`, `has…`, `can…` | `isQueueFull`, `canAfford` |
| Methoden | Verb | `enqueueUnit()`, `trainingProgress()` |
| Einheiten | im Namen, wenn nicht klar | `trainSeconds`, `sizeTiles`, `radiusPx` |
| Abkürzungen | keine außer `x`, `y`, `dx`, `dy`, `i` in Schleifen | `footprint` statt `fp`, `definition` statt `def` |
| Schlüssel im Spielstand | bleiben kurz (`t`, `q`, `r`), dokumentiert in `save.ts` | – |

Konkrete Umbenennungen (mit Migration im Spielstand, wo nötig):

| Heute | Neu | Warum | Spielstand |
|---|---|---|---|
| Art `lumberjack` | `lumber_camp` | Klasse heißt `LumberCamp`; „lumberjack“ ist der Holzfäller | alte Kennung beim Laden umschreiben |
| Art `mine` | `mining_camp` | Klasse `MiningCamp` | umschreiben |
| Art `forager` | `mill` | Klasse `Mill`; „forager“ ist der Sammler | umschreiben |
| Rohstoff `berries` im Vorrat | `food` | Im Vorrat liegt Nahrung aus Beeren, Feldern und Jagd | `stock.berries` → `food`, Ladung ebenso |
| `Stock` | `Resources` | ist eine Menge Rohstoffe | – |
| `def` | `definition` | keine Abkürzung | – |
| `provides` | `housing` | Wohnraum für Dorfbewohner | – |
| `accepts` | `storedResources` | was das Lager annimmt | – |
| `trains()` | `isUnitProducer()` | Typwächter, klingt nicht nach Tätigkeit | – |
| `UnitBuilding` | `UnitProducer` | beschreibt, was es tut | – |
| `queue` / `progress` | `queuedUnits` / `trainingSeconds` | Einheit und Inhalt im Namen | – |
| `advance(dt, …)` / `share(…)` | `train(dt)` / `trainingProgress()` | Verb bzw. sagt, was zurückkommt | – |
| `shape` / `shapes` am Gebäude | `model` / `models` | ein Gebäude zeigt immer ein Modell. `SHAPE` im Renderer **bleibt**: es umfasst auch Overlays (Fläche, Ring, Staub), die keine Modelle sind, und `MODELS[].model` ist dort schon das Gitternetz | – |
| `world.farmCrop` | `world.nextFarmCrop` | Frucht für das nächste Feld | – |
| Datei `world/buildings.ts` | `world/catalog.ts` | enthält längst mehr als Gebäude: Dorfbewohner, Früchte, Tiere, Farben | – |
| `TileProbe` / `probe` | `Terrain` / `terrain` | was es ist, nicht wie es arbeitet | – |
| `selected` (main) | `placingType` | welche Art gerade gebaut wird | – |
| `selectedBuilding` / `selectedBuildings` | `focusedBuilding` / `selectedBuildings` | eins steht im Panel, alle sind ausgewählt | – |
| `buildEl`, `actionsEl`, `stockEl` | `buildMenuElement`, … oder in die Komponenten | keine Abkürzung | – |
| `fp`, `ppt`, `b`, `v`, `a` außerhalb kurzer Lambdas | ausgeschrieben | lesbar | – |

## Befund (Stand heute)

| # | Problem | Wo |
|---|---|---|
| B1 | Die sechs Gebäudearten stehen in **vier Listen**: Typ-Union `BuildingType`, Tabelle `BUILDINGS`, `BUILDING_ORDER` und `BUILDING_CLASSES`. | `world/buildings.ts`, `world/building/index.ts` |
| B2 | Jede Gebäudeklasse wiederholt dieselben Vorgaben: `terrain: BUILDABLE`, `footprint: 1`, `provides: 0`, `accepts: []`, `trains: false`. `static type` wiederholt, was die Klasse ohnehin ist. | `world/building/*.ts` |
| B3 | `def.trains` doppelt die Klassen-Hierarchie (`UnitBuilding`) und wird nicht mehr benutzt. | `BuildingDef` |
| B4 | Der Stand eines Felds (`farm?`) hängt an `BuildingBase`, obwohl es die Klasse `Farm` gibt. Daher gibt es 36 Abfragen `b.farm ? …` verstreut. | `world/world.ts`, `main.ts` |
| B5 | Die Bitrechnung für die Tiles eines Felds `(tiles >> ((dx + 1) * 3 + dy + 1)) & 1` steht mehrfach im Code. | `world/world.ts:581`, `main.ts:1582` |
| B6 | Das Gebäude kennt seine Einheit nicht. `VILLAGER.cost` und `VILLAGER.trainTime` werden von außen hineingereicht. | `world/world.ts`, `main.ts` |
| B7 | `world.ts` hat **2189 Zeilen**: Gebäude, Felder, Wegfindung, Dorfbewohner, Tiere und Jagd, Speichern und Laden, Instanzen für den Renderer. | `world/world.ts` |
| B8 | `main.ts` hat **1778 Zeilen**: Eingabe, Kamera, Auswahl, Bauen, Overlays, Minimap, Ton und die Verdrahtung aller Komponenten. | `main.ts` |
| B9 | Farben der Oberfläche sind in 8 CSS-Dateien wiederholt, z. B. `#1a0f07`, der Goldverlauf und der Holzverlauf, zusammen ~33-mal. Vier fast gleiche Knopfstile: `menu-btn`, `start-btn`, `confirm-btn`, `gal-chip`. | `components/*.css` |
| B10 | Altlasten: `tools/demo/soliva.ts` schreibt eine gelöschte Datei. `src/demo.ts` lädt asynchron und überschreibt beim ersten Besuch die gewählte Welt. | `tools/demo/`, `src/demo.ts` |
| B11 | Die Browser-Tests liegen nur lokal, nicht im Repo. | – |

## Zielstruktur

```
src/
  main.ts                  Zusammenbau: Welt, Renderer, Oberfläche, Schleife
  game/                    was main.ts heute alles selbst macht
    camera.ts              Kamera, Zoom, Blickrichtung
    input.ts               Tastatur, Maus, Ziehen, Rechtsklick
    selection.ts           Auswahl von Dorfbewohnern, Gebäuden, Vorkommen
    placement.ts           Bauen: Vorschau, Prüfung, Felder markieren
    overlay.ts             Auswahlflächen, Sammelpunkt, Vorschau-Modelle
    minimap.ts             Minimap und ihre Punkte
    ui.ts                  Verdrahtung der Komponenten (Leisten, Menüs)
  world/
    World.ts               Kern: Vorrat, Bevölkerung, tick-Reihenfolge
    save.ts                SaveData, speichern, laden, alte Versionen
    catalog.ts             Daten: Rohstoffe, Dorfbewohner, Früchte, Tiere, Spielerfarben
    building/
      index.ts             EINZIGE Liste der Gebäudearten -> Typ, BUILDINGS, Reihenfolge
      definition.ts        BuildingDefinition + defineBuilding() mit Vorgaben
      common.ts            BUILDABLE, GATHER_TYPES (Blatt-Modul)
      BuildingBase.ts      abstrakt: Lage, Trefferpunkte, Variante, speichern
      UnitProducer.ts      abstrakt: Warteschlange, Sammelpunkt, kennt seine Einheit
      StorageBuilding.ts   abstrakt: nimmt Rohstoffe an
      TownCenter.ts  House.ts  LumberCamp.ts  MiningCamp.ts  Mill.ts
      Farm.ts              Feld: Tiles, Furchen, Frucht
    unit/
      index.ts             Liste der Tierarten
      UnitBase.ts          abstrakt: Lage, Trefferpunkte, Bewegung
      Villager.ts          Aufgabe, Ladung, Name
      AnimalBase.ts  Deer.ts  Hare.ts
    farming.ts             Felder bestellen: Phasen, Gruppen, Bauern
    villagers.ts           Aufgaben der Dorfbewohner: Sammeln, Abliefern, Jagen
    pathfinding.ts         (gibt es schon)
    render.ts              Instanzen der Welt für den Renderer
  components/
    theme.css              Farben und Knopf-Grundstil als CSS-Variablen
    ...                    wie heute
```

## Schritte

### Phase 0: Struktur und Namen festlegen

- [x] 0.1 Domänenmodell, Hierarchie und Namensregeln (oben) abnicken
- [x] 0.2a Gebäude-Kennungen `lumber_camp`, `mining_camp`, `mill` (alte werden beim Laden umgeschrieben), Namen im Gebäude-Code (`definition`, `housing`, `storedResources`, `UnitProducer`, `queuedUnits`, `rallyPoint`, `nextFarmCrop`)
- [x] 0.2b `buildings.ts` → `catalog.ts`, `TileProbe` → `Terrain`
- [x] 0.2c Vorrat `berries` → `food`: `ResourceKind`/`Resources` (Vorrat) getrennt von `DepositType` (Vorkommen auf der Karte), `YIELD` verbindet sie; alte Stände (`stock.berries`, Ladung `berries`) werden umgeschrieben
- [ ] 0.2d Namen in `main.ts` (`selected` → `placingType`, `selectedBuilding` → `focusedBuilding`, …) - zusammen mit Phase 3
- [ ] 0.2e (alt) Übrige Umbenennungen mit Spielstand-Migration in `save.ts` (alte Kennungen
  und `berries` → `food` beim Laden umschreiben), dazu ein Test mit alten Ständen

### Phase 1: Gebäude (fertig)

- [x] Klassen je Art in eigenen Dateien, `BuildingBase` abstrakt, `UnitBuilding`
- [x] Modell-Varianten gehören dem Gebäude (`variant`, `shapes`, `shape`)
- [x] **1.1 `defineBuilding()`** in `building/definition.ts`: setzt die
  Vorgaben (`terrain`, `footprint`, `provides`, `accepts`). `type` kommt in
  die Definition, `static type` und `def.trains` fallen weg. Behebt B2 und B3.
- [x] **1.2 Eine Liste der Arten**: `BUILDING_CLASSES` in `building/index.ts`,
  in der Reihenfolge des Baumenüs. `BuildingType`, `BUILDINGS` und
  `BUILDING_ORDER` werden daraus abgeleitet, `buildings.ts` exportiert sie
  nur weiter. Behebt B1.
- [x] **1.3 `UnitBuilding` kennt seine Einheit**: `TownCenter` hat
  `unit = VILLAGER`. Dann laufen `advance(dt)` und `share()` ohne Parameter,
  und Kosten und Erstattung kommen von `building.unit`. Behebt B6.
- [x] **1.4 Feld in `Farm`**: `FarmState`, `newFarm`, `furrowCells`,
  `furrowFood` und `setCrop` ziehen nach `Farm.ts`. Neu ist der Typwächter
  `isFarm()`, der die `b.farm`-Abfragen ersetzt. Behebt B4.
- [x] **1.5 Tiles als Methode**: `farm.coversTile(dx, dy)` bzw.
  `building.footprint()` statt Bitrechnung an mehreren Stellen. Behebt B5.
- [x] **1.7 `StorageBuilding`**: gemeinsame Oberklasse für Holzlager,
  Minenlager und Mühle (nehmen Rohstoffe an).
- [x] **1.6 Speichern je Klasse**: `Farm` speichert `f`, `UnitBuilding`
  speichert `q` und `r`, das Format bleibt gleich. Zum Test alte Stände und
  `demo.json` laden.

### Phase 2: `world.ts` aufteilen (B7)

- [x] 2.1 `save.ts`: `SaveData`, Schlüssel, lesen, schreiben und die Umrechnung alter Versionen; `worlds.ts` und `demo.ts` nutzen es
- [ ] 2.2 `farming.ts`: Feldgruppen, Phasen, freie Furche, Bauern, Wachsen
- [x] 2.3 Tiere als Klassen (`unit/UnitBase`, `AnimalBase`, `Deer`, `Hare`, Liste in `unit/index.ts`) und `wildlife.ts` (entstehen lassen, suchen, Kadaver); Jagd bleibt bei den Dorfbewohnern
- [ ] 2.4 `villagers.ts`: Aufgaben, Laufen, Sammeln, Abliefern, `describe()`
- [ ] 2.5 `render.ts`: Instanzen für den Renderer, Ruinen
- [ ] 2.6 `Villager` und `Animal` als Klassen, wie die Gebäude

### Phase 3: `main.ts` aufteilen (B8)

- [ ] 3.1 `game/camera.ts` und `game/input.ts`
- [ ] 3.2 `game/selection.ts` und `game/placement.ts`
- [ ] 3.3 `game/overlay.ts` und `game/minimap.ts`
- [ ] 3.4 `game/ui.ts`: Leisten, Menüs, Hauptmenü verdrahten
- [ ] 3.5 `main.ts` baut nur noch zusammen und startet die Schleife

### Phase 4: Oberfläche (B9)

- [ ] 4.1 `components/theme.css` mit CSS-Variablen (`--wood-dark`,
  `--gold`, `--edge` …), in `style.css` einbinden, Farbwerte ersetzen
- [ ] 4.2 Ein Knopf-Grundstil (`.btn`, `.btn-gold`, `.btn-danger`) statt vier fast gleicher

### Phase 5: Aufräumen (B10, B11)

- [ ] 5.1 `tools/demo/soliva.ts` entfernen oder auf `public/savegame/demo.json` umstellen
- [ ] 5.2 `src/demo.ts`: erst starten, wenn die Demo geladen ist, und die
  gewählte Welt nicht überschreiben
- [ ] 5.3 Browser-Tests als `tools/ui/smoke.mjs` ins Repo: Hauptmenü, neues
  Spiel, bauen, ausbilden, Feld mit Untermenü, speichern und neu laden, Galerie

## Test nach jedem Schritt

1. `npx tsc --noEmit` und `npm run build`
2. Im Browser: Hauptmenü, Weiterspielen mit `demo.json`, Hauptgebäude
   auswählen, ausbilden (erscheint nach 6 s), Sammelpunkt setzen, Haus und
   Feld bauen, speichern und neu laden
3. Galerie: ein Modell wählen, Animation wechseln, Abriss an und aus

## Entscheidungen

- `Villager` und `Animal` werden Klassen wie die Gebäude (Phase 2.6).
- Die Lager (Holzlager, Minenlager, Mühle) bekommen die gemeinsame
  Oberklasse `StorageBuilding` (Teil von Phase 1).
- Phase 1 wird erst abgeschlossen und committet, dann geht es weiter.
