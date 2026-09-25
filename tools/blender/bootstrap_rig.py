# Legt eine .blend-Datei mit Skelett und Clips an - aus einem Export von
# tools/export/props.mjs (Mühle, Fahne) samt <glb>.clips.json daneben:
# Bildrate, Maßeinheit des Modells (height) und je Clip der Zeitbereich einer
# Schleife. Für die Dorfbewohner gibt es bootstrap_humanoid.py.
#
# Danach ist die .blend-Datei die Quelle: Clips werden dort bearbeitet und mit
# `npm run gen:anim` (tools/blender/export_clips.py) ins Spiel exportiert.
# Achtung: neu anlegen überschreibt, was in Blender geändert wurde.
#
# Je Clip bekommt die Action Custom Properties:
#   phase_period  welcher Zeitbereich eine Schleife ist
#   phase_shift   ab wann (Clip-Zeit = (Zeit - shift) * Dauer / period)
#   props         Werkzeuge (hier leer)
#
# Aufruf: blender -b --python tools/blender/bootstrap_rig.py -- <glb> <blend>

import json
import sys
import bpy

glb, blend = sys.argv[sys.argv.index('--') + 1:][:2]
with open(glb[:-len('.glb')] + '.clips.json') as f:
    sidecar = json.load(f)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = int(sidecar['fps'])
scene.render.fps_base = 1
bpy.ops.import_scene.gltf(filepath=glb)

rig = next(o for o in scene.objects if o.type == 'ARMATURE')
name_at_import = rig.name
rig.name = sidecar['rig']
rig.data.name = sidecar['rig']
# Maßeinheit des Modells im Spiel (Breite bzw. Höhe) - Verschiebungen der
# Knochen rechnet das Spiel damit in Modell-Einheiten um.
rig['height'] = float(sidecar['height'])

# Der glTF-Import nennt Actions "<Animation>_<Objekt>".
clips = {c['name']: c for c in sidecar['clips']}
found = {}
for action in list(bpy.data.actions):
    anim, _, owner = action.name.partition('_')
    if owner == name_at_import and anim in clips:
        found[anim] = action
missing = set(clips) - set(found)
if missing:
    raise SystemExit(f'Clips fehlen nach dem Import: {sorted(missing)}')
for name, action in found.items():
    c = clips[name]
    action.name = name
    action.use_fake_user = True
    action['props'] = c['props']
    action['phase_period'] = float(c['phase_period'])
    action['phase_shift'] = float(c['phase_shift'])
    if c.get('pose') is not None:
        action['pose'] = int(c['pose'])
    frames = int(action.frame_range[1] - action.frame_range[0]) + 1
    if frames != c['frames']:
        raise SystemExit(f'{name}: {frames} Bilder nach dem Import, erwartet {c["frames"]}')

first = next(iter(found.values()))
rig.animation_data.action = first
scene.frame_start = 0
scene.frame_end = int(first.frame_range[1])
bpy.ops.wm.save_as_mainfile(filepath=blend)
print('gespeichert:', blend, 'Clips', {n: a.frame_range[:] for n, a in found.items()}, 'Einheit', rig['height'])
