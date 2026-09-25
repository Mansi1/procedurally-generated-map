# Legt assets/blender/humanoid.blend an - einmalig, aus dem Export der
# Bognerei (tools/export/bognerei.mjs): das Skelett der Dorfbewohner mit dem
# Clip "carve" (Schnitzen), dazu Bognerei, Werkbank und die Stufen des Bogens
# als Vorlage, damit man das Schnitzen an der Bank bearbeiten kann.
#
# Danach ist die .blend-Datei die Quelle: Clips werden dort bearbeitet und mit
# `npm run gen:anim` (tools/blender/export_clips.py) ins Spiel exportiert.
#
# Aufruf: blender -b --python tools/blender/bootstrap_humanoid.py -- <glb> <blend>

import sys
import bpy

glb, blend = sys.argv[sys.argv.index('--') + 1:][:2]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
# 30 Bilder je Sekunde, wie das Spiel die Clips backt (docs/ANIMATION.md).
scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=glb)

rig = next(o for o in scene.objects if o.type == 'ARMATURE')
rig.name = 'humanoid'
rig.data.name = 'humanoid'
if 'height' not in rig:
    raise SystemExit('Skelett ohne Custom Property "height" - Export zu alt?')

# Der Clip des Skeletts heißt wie im Spiel; die Stufen des Bogens behalten
# ihre eigenen Actions (nur Vorlage, sie werden nicht exportiert).
action = rig.animation_data.action
action.name = 'carve'
action.use_fake_user = True
# Was der Clip in der Hand braucht (Werkzeuge, siehe docs/ANIMATION.md).
action['props'] = 'knife'
for other in bpy.data.actions:
    if other is not action:
        other.name = 'vorlage.' + other.name.replace('Schnitzen_', '')

scene.frame_start = int(action.frame_range[0])
scene.frame_end = int(action.frame_range[1])
bpy.ops.wm.save_as_mainfile(filepath=blend)
print('gespeichert:', blend, 'Clip', action.name, action.frame_range[:], 'Höhe', rig['height'])
