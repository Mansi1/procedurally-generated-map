# Migrationsplan: Animationen wie in Blender

Ziel: Bewegungen werden in Blender gemacht und nicht mehr als Formeln im
Shader geschrieben. Dazu gehören Skelett, Gewichte, Keyframes und IK. Das
Spiel spielt sie ab. Was keine Animation im Blender-Sinn ist, sondern vom
Spielzustand abhängt, bleibt im Shader. Beispiele: Beeren verschwinden, ein
Baum wird abgesägt, das Werkstück auf der Bank wächst. Solche Dinge bekommen
aber feste, in Blender pflegbare Namensregeln.

## Stand

Phase 0 und Phase 1 sind fertig: Das Schnitzen kommt als Clip aus Blender.

- **Gleichstand:** Der Clip entspricht der alten Formel exakt. Die rechte
  Hand weicht über alle 786 Bilder um 0,00 cm ab.
- **Leistung:** 500 schnitzende Figuren brauchen 38 ms je Bild. Mit den
  Formel-Posen sind es 54–60 ms (Messung ohne Spiel-Logik, Software-GL im
  Test-Browser). Der Clip-Weg ist also schneller: einige Texturzugriffe statt
  viel Trigonometrie je Eckpunkt.
- **Hin und zurück:** Eine Änderung in Blender ist nach `npm run gen:anim`
  im Spiel zu sehen. Geprüft ist das mit einem nach hinten gedrehten Kopf.

Alle anderen Posen und die Tiere laufen noch über die Formeln.

## So wird jetzt gearbeitet

1. `assets/blender/humanoid.blend` in Blender öffnen. Es enthält das
   Skelett `humanoid` und dazu die Bognerei mit Werkbank als Vorlage.
2. Den Clip bearbeiten. Das ist die Action mit demselben Namen wie im Spiel,
   heute `carve`. Neue Clips sind neue Actions am Skelett `humanoid`.
   Als Custom Property der Action trägt `props` die Werkzeuge in der Hand,
   z. B. `knife`, `axe`, `scythe` (durch Komma getrennt).
3. `npm run gen:anim` exportiert alle `.blend`-Dateien in `assets/blender/`
   nach `src/models/<name>_clips.glb` + `.json`. Blender wird über die
   Umgebungsvariable `BLENDER` gefunden, sonst am üblichen Ort auf macOS.
4. In der Galerie zeigen „Clips aus Blender“ → „Mann (Clips)“ und
   „Frau (Clips)“ jeden Clip der Bibliothek. Im Spiel spielt ihn die Pose,
   die er ersetzt (`POSE_CLIPS` in `src/gl/entityRenderer.ts`).

Die `.blend`-Dateien liegen in Git LFS (`.gitattributes`). Neu angelegt wird
`humanoid.blend` nur einmal, mit `tools/blender/bootstrap_humanoid.py` aus dem
Export `tools/export/bognerei.mjs`.

## Heute

Alles, was sich bewegt, rechnet der Vertex-Shader in
`src/gl/entityRenderer.ts`:

- **Teile statt Skelett.** Jeder Eckpunkt trägt eine Teilnummer (`P_*`), die
  aus dem Objektnamen im OBJ stammt, zum Beispiel `Arm.L.Lower`. Das ist
  starres Skinning mit einem Knochen je Eckpunkt.
- **Formeln statt Keyframes.** Die Gelenkwinkel folgen je Pose aus der Phase
  (`pose == 1` … `pose == 5`). Zwei Posen haben ihre Werte in JSON
  ausgelagert: `mow_pose.json` und `carve_pose.json`.
- **Vier Zahlen je Instanz.** `motion = [Blickrichtung, Phase, Pose, Ladung]`.
  Gebäude, Bäume und Felder deuten dieselben vier Zahlen je nach Art anders.

Das ist billig und genau mit dem Spiel verzahnt. Der Ton kommt im Takt, die
Schrittweite folgt dem Tempo. Es hat aber zwei Nachteile: Jede neue Bewegung
ist Code, und ohne IK treffen Hände ihr Ziel nicht. Das hat sich beim
Zugmesser gezeigt. Außerdem gibt es keinen Weg aus Blender zurück ins Spiel.

## Leitlinien

1. **Blender ist die Quelle** für alles, was eine Bewegung im Blender-Sinn
   ist: Skelett, Gewichte, Clips. Das Spiel rechnet sie nicht nach.
2. **Der Spielzustand bleibt im Spiel.** Was von Vorrat, Fortschritt oder
   Ereignissen abhängt, wird nicht als Clip gebacken. In Blender werden dafür
   nur die Teile benannt.
3. **Gleichstand zuerst.** Jede Migration beginnt mit einem Export der
   heutigen Formeln als Keyframes (wie `tools/export/bognerei.mjs`). Erst
   wenn das Spiel damit gleich aussieht, wird in Blender verbessert.
4. **Alter und neuer Weg laufen nebeneinander**, bis eine Gruppe komplett
   umgezogen ist. Das Umschalten geschieht je Modell.
5. **Jeder Schritt ist für sich fertig.** Er besteht `tsc` und
   `npm run build`, dazu `npm run smoke` und einen Bildvergleich in der
   Galerie, und bekommt einen eigenen Commit.

## Wie ein Modell heute aufgebaut ist

Ein Modell besteht heute aus drei Dingen, und nur eines davon zieht um:

| Was | Heute | Künftig |
|---|---|---|
| **Form** | OBJ aus einem Skript (`tools/models/*.mjs`), Objektnamen als Teile | Form bleibt OBJ bzw. `.glb`, dazu Skelett und Gewichte |
| **Aussehen** | Materialname je Fläche (`Wood`, `Wool`, `Marble` …). Der Shader macht daraus Farbe und Muster (`MATERIAL_ROLE`, `treeTexture`, `figureTexture`), `Paint` und `Tunic` werden zur Spielerfarbe | **bleibt so**: Shader-Materialien nach Namen |
| **Bewegung** | Formeln im Shader je Pose | Clips aus Blender |

Die Shader-Materialien sind schon eine gemeinsame Bibliothek. Ein Fass sieht
in jedem Gebäude gleich aus, weil seine Flächen `Wood` und `Iron` heißen, und
eine neue Figur hat sofort Leinen, Leder und Haut. In Blender heißt das: die
Materialnamen behalten. Farbe und Muster in Blender sind nur Vorschau, das
Spiel liest den Namen.

## Wiederverwenden: einmal machen, überall nutzen

Heute steckt jedes Werkzeug fest im Modell jeder Figur, jede Pose ist eigener
Code, und die sechs Tiere haben zwar gleiche Teilnamen, aber keine gemeinsamen
Bewegungen. Künftig gilt:

1. **Ein Skelett, viele Körper.** Mann, Frau und später Bogenschütze oder
   Soldat haben dieselben Knochennamen und dieselbe Hierarchie. Ihre
   Proportionen dürfen sich unterscheiden. Clips speichern nur Drehungen,
   dazu die Verschiebung der Wurzel in Körperhöhen. So passt ein Clip ohne
   Nacharbeit auf jeden Körper mit diesem Skelett. Gebacken wird je Körper
   und Clip (die Drehpunkte unterscheiden sich), die Clip-Daten gibt es aber
   nur einmal.
2. **Eine Clip-Bibliothek je Skelett.** Die Clips liegen in eigenen Dateien
   (`humanoid_clips.glb`, `quadruped_clips.glb`), getrennt von den Körpern
   (`villager_male.glb` …). Ein neuer Körper bekommt alle Clips sofort. Ein
   verbesserter Clip wirkt auf alle Körper.
3. **Werkzeuge und Waffen als Anhänge.** Die Hände bekommen Sockel-Knochen
   (`hand.R`, `hand.L`). Beil, Spitzhacke, Hacke, Sense, Zugmesser, Speer und
   Bogen sind eigene kleine Modelle und werden je Tätigkeit angehängt. Welches
   Werkzeug ein Clip braucht, steht als Custom Property `props` an der
   Action. Beispiele:
   - `chop` mit Beil (Holz), Spitzhacke (Stein, Gold) oder Hacke (Pflügen):
     ein Clip, drei Werkzeuge.
   - Der fertige Bogen auf der Werkbank, im Gestell der Waffenkammer, im
     Symbol und später in der Hand eines Bogenschützen ist ein und dasselbe
     Modell (`bow`).
   - Zweihändige Werkzeuge (Sense, Zugmesser) hängen an `hand.R`. Die linke
     Hand greift sie in Blender per IK, das Spiel muss nichts überblenden.
4. **Teil-Clips in Schichten.** Ein Clip darf nur einen Teil des Skeletts
   bewegen, per Knochenmaske Unterkörper oder Oberkörper. Das Spiel legt zwei
   übereinander: `walk` (Beine) + `carry` (Arme halten die Last) oder später
   `walk` + `aim` für Bogenschützen. Kombinationen wie „gehen und tragen“
   müssen dann nicht als eigener Clip entstehen.
5. **Eine Vierbeiner-Vorlage für alle Tiere.** Reh, Hase, Kuh, Schaf, Ziege
   und Wildschwein teilen Skelett und Clips (`graze`, `walk`, `flee`, `dead`).
   Eine Art bekommt nur dort einen eigenen Clip, wo sie sich wirklich anders
   bewegt, zum Beispiel `hop` für den Hasen oder `trot` für die Kuh auf der
   Flucht.
6. **Materialien nach Namen.** Siehe oben. Sie werden nicht je Modell
   gebaut, sondern einmal im Shader, und über den Namen genutzt.
7. **Kleinteile für alle Gebäude.** Fass, Kiste, Laterne, Zielscheibe,
   Schild und Holzstapel entstehen heute als Hilfsfunktionen in
   `tools/models/lib.mjs` und werden in jedes Gebäude hineinkopiert. In
   Blender werden sie eine Asset-Bibliothek (verknüpfte Collections). Im
   Spiel können sie später als eigene Instanzen gezeichnet werden, dann
   liegt jedes Kleinteil nur einmal im Speicher.

Was davon in welche Phase gehört, steht bei den Phasen.

## Bestand: jede Animation, heute und künftig

Ziel **Clip** heißt: Skelett und Keyframes aus Blender. **Zustand** heißt:
bleibt im Shader und wird vom Spiel gesteuert. **Ereignis** heißt: bleibt
prozedural, weil Richtung, Zufall oder Physik erst zur Laufzeit feststehen.

### Dorfbewohner und Dorfbewohnerin (`villager_male/female.obj`)

| Bewegung | Heute | Ziel | Phase |
|---|---|---|---|
| Stehen: Atmen, Arme pendeln, Umschauen, Gewicht verlagern | Pose 0, Formel mit Weltzeit | Clip `stand` (Schleife) | 2 |
| Gehen | Pose 1, Phase aus der Schrittlänge | Clip `walk`, Tempo aus der Strecke | 2 |
| Tragen (Last wächst mit der Ladung) | Teil `Load`, skaliert mit `motion[3]` | Knochen `load`, Skalierung aus dem Instanzwert | 2 |
| Hacken, Pflügen, Speerwurf | Pose 2, Beil (`P_TOOL`) | Clip `chop` (Beil sichtbar) | 2 |
| Pflücken, Säen, Jäten, Zerlegen (kniend, der Rock staucht sich) | Pose 3, eigene Rock-Formel | Clip `pick`, Rock über Gewichte an den Oberschenkeln | 2 |
| Mähen | Pose 4, `mow_pose.json`, Sense in Ruhelage zurückgerechnet | Clip `mow`, Sense an beiden Händen per IK | 2 |
| Schnitzen | Pose 5, `carve_pose.json`, Zugmesser an beiden Unterarmen überblendet | Clip `carve`, Hände per IK auf dem Stab | 2 (Pilot in 1) |
| Werkzeug je Tätigkeit (Beil, Sense, Messer) | Teile im Shader auf einen Punkt gedrückt | Werkzeugknochen je Clip auf 0 skaliert | 2 |
| Blickrichtung, Versatz je Figur | `motion[0]`, Phase + id | bleibt, Zeitversatz je Figur | – |

### Tiere (Reh, Hase, Kuh, Schaf, Ziege, Wildschwein)

| Bewegung | Heute | Ziel | Phase |
|---|---|---|---|
| Äsen: Kopf unten, ab und zu hoch | Pose 0, Hals-Gelenk `uNeck` | Clip `graze` je Art | 3 |
| Gehen: Kreuzgang, Hase hoppelt | Pose 1, Beine `Leg.FL/FR/BL/BR` | Clip `walk` je Art, Tempo aus der Strecke | 3 |
| Fliehen: Sprünge, Kuh trabt | Pose 5 | Clip `flee` je Art | 3 |
| Erlegt, auf der Seite | Pose 6, Kippen um `uSide` | Clip `dead` (ein Bild) | 3 |

### Gebäude und Dinge

| Bewegung | Heute | Ziel | Phase |
|---|---|---|---|
| Mühlenflügel: drehen, Böen, eigener Takt, steht bei Einsturz still | `P_SAILS`, `millMotion()` | Clip `sails` (Knochen an der Nabe, Böen gebacken), Tempo und Versatz je Mühle | 4 |
| Fahne am Sammelpunkt weht | `P_CLOTH`, Sinuswelle | Clip `wave` (Knochenkette im Tuch) | 4 |
| Hinweispfeil wippt und dreht | Shader, `uTime` | bleibt, zu einfach für einen Clip | – |
| Waffenkammer: Dach weg, Wände gekappt | `P_CUT_ROOF` / `P_CUT_WALL` | **Zustand**: Namensregel `Cut.Roof`, `Cut.Wall` | 5 |
| Waffenkammer: Bögen je Vorrat | `P_STOCK` + `Stock.<n>` | **Zustand**: Namensregel `Stock.<n>` | 5 |
| Bognerei: Werkstück in Stufen | `P_CRAFT` + `Craft.<n>` | **Zustand**: Namensregel `Craft.<n>` | 5 |
| Einsturz: wackeln, zusammensacken, Staub, Schutt | Shader (`motion[3]`) und `ruinInstances()` | **Ereignis**, bleibt | 6 |

### Natur

| Bewegung | Heute | Ziel | Phase |
|---|---|---|---|
| Baum fällt (Richtung, Aufprall, Rutschen) | `world.fall()` und Shader „falling“ | **Ereignis**, bleibt (Richtung erst zur Laufzeit) | 6 |
| Baum wird von der Spitze her abgesägt, Stumpf bleibt | `P_CROWN` / `P_TRUNK` / `P_STUMP` | **Zustand**: Namensregeln `Trunk`, `Trunk.Stump` | 5 |
| Beeren verschwinden einzeln | `P_BERRY` + `Berry.<n>` | **Zustand**: Namensregel `Berry.<n>` | 5 |
| Stein und Gold schrumpfen | Instanzgröße (`resources.ts`) | **Zustand**, bleibt | – |
| Felder: pflügen, säen, wachsen, reifen, ernten je Furche; Schnur | `P_CROP` / `P_SOIL` / `P_EDGE`, `farmsGen.mjs` | **Zustand**, bleibt (vom Skript erzeugt) | 5 |

Nicht betroffen sind Lebensbalken, Auswahl und Bauvorschau. Das sind
Anzeigen, keine Animationen.

## Phasen

### Phase 0: Regeln festlegen (klein) - erledigt

- **Format:** glTF 2.0 (`.glb`), Meter, Y oben, Blick nach +Z. So exportiert
  Blender von selbst.
- **Bildrate der Clips:** 30 fps. Schleifen beginnen und enden in derselben
  Haltung.
- **Knochennamen** für Figuren nach dem Schema aus `tools/export/bognerei.mjs`:
  `root`, `lowerBody`, `thigh.L`, `shin.L`, `upperBody`, `head`,
  `shoulder.L`, `upperArm.L`, `forearm.L` usw. Dazu kommen `tool.axe`,
  `tool.scythe`, `tool.knife` und `load`.
- **Clip-Namen:** `stand`, `walk`, `chop`, `pick`, `mow`, `carve`. Bei Tieren
  `graze`, `walk`, `flee`, `dead`.
- **Takt-Marken:** Wann ein Hieb trifft (für den Ton), steht als
  Custom Property `strike` (Zeiten in Sekunden) an der Action. Heute rechnet
  `VillagerWork.swing()` das aus der Formel.
- **Quellen:** `.blend`-Dateien liegen in `assets/blender/`, über Git LFS wie
  die MP3s. Dafür kommt ein Eintrag in `.gitattributes`.
- **Export:** Ein Skript ruft Blender ohne Oberfläche auf
  (`blender -b datei.blend --python tools/blender/export.py`) und schreibt
  `src/models/<name>.glb`. Aufruf: `npm run gen:anim`.

### Phase 1: Abspielen im Spiel, Pilot „Schnitzen“ (groß) - erledigt

Umgesetzt wie unten beschrieben, mit diesen Abweichungen:

- **Lader:** Er heißt `src/gl/clips.ts` und liest die Clip-Bibliothek. Er
  backt auch gleich die Knochen-Textur, eine eigene `animationAtlas.ts` gibt
  es nicht. Genommen wird je Knochen und Bild nur die Drehung gegenüber der
  Ruhelage im Weltsinn, dazu die Verschiebung der Wurzel in Körperhöhen.
  Wie Blender Knochen intern ausrichtet, spielt deshalb keine Rolle, und ein
  Clip passt auf jeden Körper mit denselben Knochennamen: Mann 1,76 m, Frau
  1,72 m.
- **Körper:** Die Körper sind noch die OBJ aus `tools/models/villagers.mjs`.
  Gewichte kommen dort nicht aus einer Datei. Der Shader leitet je Eckpunkt
  den Knochen aus der Teilnummer ab (`boneOf()`). Das Zugmesser verteilt er
  wie bisher auf beide Unterarme. Weiche Gewichte aus Blender folgen in
  Phase 2.
- **Was glTF nicht trägt:** Clip-Länge und Werkzeuge stehen im Manifest
  `<name>_clips.json`, das `tools/blender/export_clips.py` aus den Custom
  Properties schreibt.
- **Zeit:** Die Pose-Zeit wird zur Clip-Zeit. Beim Schnitzen gilt
  (Phase − 7,854) / 6. So beginnt jeder Zug wie bei der Formel, und der Ton aus
  `VillagerWork.swing()` bleibt im Takt. Takt-Marken aus Blender (`strike`)
  kommen in Phase 2.
- **Rückfall:** Die Formel für das Schnitzen bleibt vorerst im Shader.
  Fehlt die Bibliothek oder lässt sie sich nicht lesen, läuft die Figur
  darüber.

1. **`src/gl/gltf.ts`:** liest `.glb`, also Meshes, Materialfarben, Skin
   (Knochen, `inverseBindMatrices`, `JOINTS_0` / `WEIGHTS_0`) und
   Animationen. Er braucht keine Bibliothek, das Format ist schon in
   `tools/export/bognerei.mjs` geschrieben.
2. **`src/gl/animationAtlas.ts`:** backt beim Laden jeden Clip Bild für Bild
   zu Knochenmatrizen in eine Textur (RGBA32F, je Knochen drei Texel für
   eine 3×4-Matrix). Eine Figur mit 16 Knochen, 6 Clips und je rund 60
   Bildern braucht etwa 17 000 Texel, das ist winzig.
3. **Shader:** Er bekommt einen zweiten Weg für Modelle mit Skin. Je
   Eckpunkt werden bis zu 4 Knochen aus der Textur geholt (`texelFetch`) und
   gewichtet gemischt. Die Instanz bleibt bei vier Zahlen:
   `motion = [Blickrichtung, Clip-Zeit, Clip-Nummer, Ladung]`.
4. **Galerie:** Sie zeigt für jedes `.glb` automatisch alle Clips als Knöpfe.
5. **Clip-Bibliothek getrennt vom Körper:** Der Lader verbindet Clips mit
   jedem Körper, dessen Knochennamen passen. Gebacken wird je Paar aus Körper
   und Clip.
6. **Pilot:** `bognerei.glb` aus dem bestehenden Export wird geladen, und
   Bogner und Bognerin schnitzen darüber. Schon hier teilen sich Mann und Frau
   einen Clip. Alle anderen Posen laufen noch über
   den alten Weg.

Fertig ist Phase 1, wenn das Schnitzen im Spiel aus Blender kommt, eine
Änderung in Blender nach `npm run gen:anim` im Spiel zu sehen ist und die
Bildrate mit 500 Dorfbewohnern gleich bleibt.

### Phase 2: Dorfbewohner komplett (groß)

1. `tools/export/bognerei.mjs` wird zu `tools/export/figures.mjs`
   verallgemeinert. Es schreibt Mann und Frau mit allen sechs Posen als
   Clips. Das ist der Gleichstand, wie heute aus den Formeln gerechnet.
2. **In Blender:**
   - IK für die Hände bei `mow` und `carve`, damit Sense und Stab gegriffen
     werden.
   - Weiche Gewichte an Ellbogen, Knien und Schultern.
   - Der Rock folgt beim Knien über Gewichte, statt über eine eigene Formel.
3. Das Spiel lädt `villager_male.glb` und `villager_female.glb`. `POSE.*`
   wird zu Clip-Namen, die Phase zur Clip-Zeit. Beim Gehen bestimmt die
   Strecke die Zeit.
4. **Werkzeuge als Anhänge:** Sockel `hand.R` und `hand.L`. Beil, Spitzhacke,
   Hacke, Sense, Zugmesser und Speer werden eigene Modelle. Der Clip nennt sie
   in `props`. `chop` wird damit für Holz, Stein, Gold und Pflügen genutzt,
   je mit anderem Werkzeug.
5. **Schichten:** `walk` nur für den Unterkörper, `carry` nur für den
   Oberkörper, übereinander abgespielt.
6. **Ton:** `swing()` liest `strike` aus dem Clip statt aus der Formel.
7. **Bildvergleich:** alle Posen in der Galerie, alt und neu nebeneinander.
8. **Weg damit:**
   - im Shader die Figuren-Teile, die Gelenk-Uniforms (`uHip`, `uShoulder`,
     `uKnee`, `uElbow`, `uArm`, `uStride`, `uLoadAnchor`) und die Posen 0–5
   - `mow_pose.json` und `carve_pose.json`
   - das Zurückrechnen der Sense in `villagers.mjs`
   - das Überblenden des Zugmessers
   - die fest eingebauten Werkzeuge in `villagers.mjs` (`hatchet`,
     `scythe`, `drawknife`)

### Phase 3: Tiere (mittel)

1. Eine Skelett-Vorlage für Vierbeiner mit `spine`, `neck`, `head` und
   `leg.FL/FR/BL/BR` (je Ober- und Unterteil). Alle sechs Arten nutzen sie,
   jede mit ihren eigenen Maßen.
2. Eine gemeinsame Clip-Bibliothek `quadruped_clips.glb` mit `graze`,
   `walk`, `flee` und `dead`, aus den heutigen Formeln exportiert. Eigene
   Clips gibt es nur, wo eine Art anders läuft: `hop` (Hase), `bound` (Reh
   auf der Flucht), `trot` (Kuh auf der Flucht).
3. `stride` aus `unit/*.ts` bestimmt die Abspielrate beim Gehen und Fliehen.
4. **Weg damit:** der Tier-Zweig im Shader (`beast`, `uLegs`, `uNeck`,
   `uGraze`, `uSide`).

### Phase 4: Mühle und Fahne (klein)

1. **Mühle:** ein Knochen an der Nabe, Clip `sails` mit gebackenen Böen über
   20 s als Schleife. `millMotion()` liefert nur noch Zeitversatz und Tempo.
   Bei einem Einsturz bleibt die Zeit stehen.
2. **Fahne:** eine Knochenkette durchs Tuch, Clip `wave`.
3. **Weg damit:** `P_SAILS`, `P_CLOTH`, `uHub`, `SAIL_SPEED`,
   `GUST_AMOUNT`, `GUST_RATE`.

### Phase 5: Zustands-Teile Blender-fest machen (klein bis mittel)

Diese Teile bleiben im Shader, aber jemand, der ein Modell in Blender
bearbeitet, soll sie nicht aus Versehen kaputt machen:

1. Alle Namensregeln werden an einer Stelle beschrieben, in einer Tabelle in
   diesem Dokument: `Berry.<n>`, `Trunk`, `Trunk.Stump`, `Stock.<n>`,
   `Craft.<n>`, `Cut.Roof`, `Cut.Wall`, `Entry`, `Work.Stand`, `Work.Aim`,
   `Crop.*`, `Soil.*`, `Edge.*`.
2. Sobald Modelle aus Blender kommen, liest der Lader diese Angaben aus
   Custom Properties (glTF `extras`), nicht mehr aus Namensanfängen.
   Beispiel: `role: "stock", index: 7`.
3. Ein Prüfskript meldet beim Export fehlende oder doppelte Nummern.

### Phase 6: Ereignisse (bleiben)

Umfallen, Einsturz, Staub und Schutt bleiben prozedural. Die Fallrichtung
steht erst fest, wenn der Holzfäller zuschlägt. Der Einsturz lebt vom Zufall
je Eckpunkt. Später wäre je Gebäude ein gestalteter Einsturz-Clip möglich,
wenn gewünscht.

### Phase 7: Aufräumen und Absichern (klein)

- `npm run smoke` prüft, dass jedes `.glb` lädt und die erwarteten Clips hat.
- Ein Bildvergleich in der Galerie für jede Pose (Playwright, wie in
  `tools/ui/smoke.mjs`).
- Eine Messung der Bildrate mit 500 Dorfbewohnern und 100 Tieren.
- Die Kommentare in `entityRenderer.ts`, `villagers.mjs` und `animals.mjs`
  werden auf den neuen Weg umgeschrieben.

## Risiken und offene Fragen

- **Übergänge:** Heute springt die Pose sofort um. Ein Überblenden
  (0,2 s von Gehen zu Hacken) braucht einen zweiten Clip und ein Gewicht je
  Instanz, also mehr Instanzdaten. Das kommt erst nach Phase 2.
- **Leistung:** 4 Knochen mal 3 Texel sind 12 Texturzugriffe je Eckpunkt.
  Bei Tausenden Figuren wird das in Phase 1 gemessen. Für weit herausgezoomte
  Figuren wäre ein 1-Knochen-Weg denkbar.
- **Eckpunkte:** Weiche Haut braucht geteilte Eckpunkte. Heute ist jede
  Fläche flach, das Modell wird damit etwas größer.
- **Modelle selbst:** Die Formen entstehen weiter aus Skripten
  (`tools/models/*.mjs`). Ob auch sie nach Blender umziehen, ist ein eigener
  Plan. Für die Animation reicht es, wenn das Skript das Figurmodell mit
  Skelett ausgibt und die Clips aus Blender kommen.
- **Texturen:** Leinen, Leder, Haar und Holzmaserung rechnet der Shader nach
  Materialnamen. Das bleibt so. Die Materialnamen müssen deshalb in Blender
  erhalten bleiben.

## Reihenfolge und Umfang

| Phase | Inhalt | Umfang | Voraussetzung |
|---|---|---|---|
| 0 | Regeln, Ordner, Export-Aufruf | klein | – |
| 1 | Lader, Clip-Textur, Skinning im Shader, Clip-Bibliothek, Pilot Schnitzen | groß | 0 |
| 2 | Dorfbewohner (6 Clips, IK, Gewichte, Werkzeuge als Anhänge, Schichten) | groß | 1 |
| 3 | Tiere (eine Vorlage, gemeinsame Clips, 3 eigene) | mittel | 1 |
| 4 | Mühle, Fahne | klein | 1 |
| 5 | Namensregeln absichern, später `extras` | klein bis mittel | – |
| 6 | Ereignisse (bleiben) | – | – |
| 7 | Tests, Messung, Aufräumen | klein | 2–4 |

Die Phasen 2, 3 und 4 sind voneinander unabhängig und können in beliebiger
Reihenfolge laufen, sobald Phase 1 steht.
