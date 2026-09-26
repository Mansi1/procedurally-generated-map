# memory.md

Gelerntes und Erfahrungen der Agenten - Regeln dazu in `AGENTS.md` ("memory.md").
Veraltetes löschen, Geändertes an Ort und Stelle korrigieren.

## Messen

- 2026-09-26, M4: Alle Bench-Szenen laufen mit 60 fps, `frameMsMax` 16,8 ms - auch `zoom-wechsel`. Auf diesem Rechner ist der Zoom nicht langsam; Gewinne im Gelände-Shader zeigt der Bench hier nicht.
- 2026-09-26, M4: Screenshot-Rauschen zweier Läufe desselben Codes (angehalten, 1280×800, DPR 1): 0,004-0,095 % der Pixel, einzelne Pixel bis 237 Farbstufen (Animationen). Darunter gilt ein Bild als gleich.

## Offen

- GPU-Zeit fehlt im Bench: `gpuFillMs` über `EXT_disjoint_timer_query_webgl2` (in Headless-Chrome vorhanden) würde Shader-Optimierungen belegbar machen - vor Plan 5.1 (Höhen-Textur) einbauen.
- Kein Screenshot-Skript im Repo - das Verfahren steht in `AGENTS.md`; als `tools/perf/shots.mjs` neben dem Bench wäre es ein Aufruf.
