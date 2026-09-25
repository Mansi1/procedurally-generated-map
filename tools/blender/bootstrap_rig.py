# Legt eine .blend-Datei mit einem Skelett und seinen Clips an - aus einem
# Export von tools/export/*.mjs (<glb> + <glb ohne .glb>.clips.json). Wie
# bootstrap_humanoid.py, aber für jedes Skelett: Tiere (tools/export/animals.mjs
# -> assets/blender/quadruped.blend) usw.
#
# Danach ist die .blend-Datei die Quelle: Clips werden dort bearbeitet und mit
# `npm run gen:anim` (tools/blender/export_clips.py) ins Spiel exportiert.
# Achtung: neu anlegen überschreibt, was in Blender geändert wurde.
#
# Je Clip bekommt die Action als Custom Properties alles aus der .clips.json
# außer Name, Bildern und Länge (z. B. pose, phase_period, phase_shift,
# species, lying, props, kneel). Listen werden zu Text mit Kommas, Wahrheits-
# werte zu 0/1. Höhe und weitere Maße des Skeletts (height, graze) werden
# Custom Properties des Skeletts.
#
# Aufruf: blender -b --python tools/blender/bootstrap_rig.py -- <glb> <blend> <Skelett> <Clip beim Öffnen>

import json
import sys
import bpy

glb, blend, rig_name, show = sys.argv[sys.argv.index('--') + 1:][:4]
with open(glb[:-len('.glb')] + '.clips.json') as f:
    sidecar = json.load(f)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
# 30 Bilder je Sekunde, wie das Spiel die Clips backt (docs/ANIMATION.md).
scene.render.fps = 30
scene.render.fps_base = 1
bpy.ops.import_scene.gltf(filepath=glb)

rig = next(o for o in scene.objects if o.type == 'ARMATURE')
name_at_import = rig.name
rig.name = rig_name
rig.data.name = rig_name
for key, value in sidecar.items():
    if key != 'clips' and isinstance(value, (int, float)):
        rig[key] = float(value)

def prop(value):
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, list):
        return ','.join(str(v) for v in value)
    return value

# Der glTF-Import nennt Actions "<Animation>_<Objekt>".
clips = {c['name']: c for c in sidecar['clips']}
found = {}
for action in list(bpy.data.actions):
    anim, _, owner = action.name.rpartition('_')
    if owner == name_at_import and anim in clips:
        found[anim] = action
missing = set(clips) - set(found)
if missing:
    raise SystemExit(f'Clips fehlen nach dem Import: {sorted(missing)}')
for name, action in found.items():
    c = clips[name]
    action.name = name
    action.use_fake_user = True
    for key, value in c.items():
        if key not in ('name', 'frames', 'duration'):
            action[key] = prop(value)
    frames = int(action.frame_range[1] - action.frame_range[0]) + 1
    if frames != c['frames']:
        raise SystemExit(f'{name}: {frames} Bilder nach dem Import, erwartet {c["frames"]}')

rig.animation_data.action = found[show]
scene.frame_start = 0
scene.frame_end = int(found[show].frame_range[1])
bpy.ops.wm.save_as_mainfile(filepath=blend)
print('gespeichert:', blend, 'Clips', {n: a.frame_range[:] for n, a in found.items()}, 'Maße', {k: rig[k] for k in rig.keys() if isinstance(rig[k], float)})
