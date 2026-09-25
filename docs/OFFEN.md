# Was noch offen ist

Stand 25.09.2026, Branch `animation-migration`. Alles, was im Spiel eine Form
hat oder sich bewegt, kommt aus Blender (docs/BLENDER.md, docs/ANIMATION.md):
59 Modelle in `assets/blender/models/`, 4 Clip-Bibliotheken in
`assets/blender/clips/`, die Felder aus Pflanzen-Teilen. Die Bewegungsformeln
im Shader sind gelöscht. `npm test` wacht darüber, dass keine ID verloren
geht.

Was danach noch zu tun bleibt, grob nach Wichtigkeit.

## Zuerst

- **Branch in `main` übernehmen.** `animation-migration` ist gepusht, aber
  noch nicht in `main`. Er enthält auch die Bognerei, die Waffenkammer und die
  Galerie-Änderungen, die vorher lokal auf `main` lagen.
- **Mögliche Konflikte beim Übernehmen:** Der L-System-Branch
  (`lsystem-blattebenen`, eigener Worktree unter `.agents/worktree`) ändert
  ebenfalls `tools/README.md`, dessen Anfang hier neu geschrieben wurde.
- **Vercel:** Die `.blend`-Dateien liegen in Git LFS (63 Dateien, rund 25 MB).
  Das Spiel braucht sie nicht zum Bauen, nur `src/models/`. Prüfen, ob der
  LFS-Abruf beim Deploy unnötig Zeit oder Kontingent kostet; notfalls die
  `.blend`-Dateien für den Build ausnehmen.
- **Tests automatisch laufen lassen.** `npm test` und `npm run smoke` laufen
  nur von Hand. Eine CI (z. B. GitHub Actions) würde bei jedem Push prüfen.
  Die Blender-Tests überspringen sich dort, wenn Blender fehlt. Ohne Blender
  in der CI prüft nur der lokale Lauf, dass `.blend` und OBJ gleich sind.

## Prüfen

- **Bildrate mit vielen Figuren ohne die Formeln.** Mit Formeln brauchten 500
  Figuren 54–60 ms je Bild, mit Clips 38 ms (Software-GL im Test-Browser).
  Nach dem Löschen der Formeln nicht neu gemessen; die Demo-Welt läuft mit
  56–60 Bildern je Sekunde.
- **Erlegter Hase:** Im Vergleich vorher/nachher 2,28 % andere Pixel, Ursache
  nicht gefunden. Nebeneinander sieht er gleich aus.
- **Symbole neu zeichnen:** Nach Änderungen an Modellen `npm run gen:ui`
  laufen lassen - die Symbole der Rohstoffleiste zeigen die Modelle.

## Bewegungen (docs/ANIMATION.md)

- **Übergänge:** Posen springen sofort um. Überblenden (etwa 0,2 s von Gehen
  zu Hacken) braucht einen zweiten Clip und ein Gewicht je Figur.
- **Schichten** (`walk` für die Beine + `carry` oder `aim` für die Arme):
  vorbereitet im Plan, gebaut erst, wenn es eine echte Kombination gibt, z. B.
  einen Bogenschützen, der geht und zielt.
- **Weiche Haut:** Die Körper sind starr in Teile geschnitten, jeder Eckpunkt
  folgt genau einem Knochen (aus seinem Namen). Gewichte aus Blender
  (Ellbogen, Knie, Schultern biegen weich) brauchen Skinning-Gewichte im
  Export und geteilte Eckpunkte.
- **Körper in `humanoid.blend`:** Die Figur in der Clip-Bibliothek ist nur
  Vorschau. Wird ein Körper in `models/villagers/` geändert, passt die
  Vorschau nicht mehr dazu - die Clips selbst passen, die Gelenke liest das
  Spiel aus dem Körper.
- **Weitere Werkzeuge** als Anhänge: Spitzhacke, Hacke, Speer - heute hält
  jeder beim Hacken, Pflügen und Jagen das Beil.
- **Größe der Clips:** `humanoid_clips.glb` hat 1,2 MB, vor allem durch
  `stand` (34 s Schleife, jedes Bild voll gespeichert). Weniger Bilder oder
  eine kürzere Schleife würden es deutlich verkleinern.
- **Einsturz:** bleibt prozedural. Möglich wäre je Gebäude ein gestalteter
  Einsturz-Clip.

## Modelle (docs/BLENDER.md)

- **Neue Modelle brauchen Code.** Ein neues Gebäude oder Tier muss im Spiel
  eingetragen werden (Import, `SHAPE`, `MODELS` in `entityRenderer.ts`, bei
  Gebäuden die Klasse). Ein Eintrag je Modell aus einer Liste würde das
  ersparen.
- **Gemeinsame Teile:** Fass, Kiste, Laterne, Zielscheibe, Schild stecken in
  jedem Gebäude als eigene Kopie. Eine Bibliothek (`library.blend`,
  verknüpfte Collections) machte sie an einer Stelle änderbar.
- **Materialien:** Das Aussehen (Holzmaserung, Leinen, Stroh ...) rechnet der
  Shader nach dem Materialnamen. In Blender sieht man nur die Farbe. Eine
  Vorschau der Muster in Blender (Material-Knoten) fehlt.
- **Kleine Abweichungen durch den Umzug** (gewollt, zur Kenntnis):
  - Zugmesser der Frau ist das des Mannes, auf ihren Handabstand gestreckt.
  - Felder: Ähren setzen den Halm fort (im Mittel 1,5 cm anders), Maiskolben
    haben eine feste Höhe statt einer zufälligen.
  - Fahne am Sammelpunkt: 4 statt 5 Nachkommastellen (unter 0,1 mm).
  - Fahne am Hauptgebäude weht etwas ruhiger (Clip statt Formel).
