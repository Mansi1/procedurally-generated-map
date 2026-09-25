# Legt assets/blender/humanoid.blend an - einmalig bzw. neu, wenn sich die
# Posen im Shader geändert haben: aus dem Export tools/export/bognerei.mjs das
# Skelett der Dorfbewohner mit allen Clips (stand, walk, chop, pick, mow,
# carve), dazu Bognerei, Werkbank und die Stufen des Bogens als Vorlage, damit
# man das Schnitzen an der Bank bearbeiten kann.
#
# Danach ist die .blend-Datei die Quelle: Clips werden dort bearbeitet und mit
# `npm run gen:anim` (tools/blender/export_clips.py) ins Spiel exportiert.
# Achtung: neu anlegen überschreibt, was in Blender geändert wurde.
#
# Je Clip bekommt die Action Custom Properties aus <glb>.clips.json:
#   props         Werkzeuge in der Hand (durch Komma getrennt)
#   pose          welche Pose des Spiels der Clip ersetzt
#   phase_period  welcher Phasenbereich der Pose der Clip ist
#   phase_shift   ab welcher Phase (Clip-Zeit = (Phase - shift) * Dauer / period)
#   kneel         1: kniend - das Spiel staucht den Rock (nur pick)
#
# Aufruf: blender -b --python tools/blender/bootstrap_humanoid.py -- <glb> <blend>

import json
import sys
import bpy

glb, blend = sys.argv[sys.argv.index('--') + 1:][:2]
with open(glb[:-len('.glb')] + '.clips.json') as f:
    sidecar = json.load(f)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
# 30 Bilder je Sekunde, wie das Spiel die Clips backt (docs/ANIMATION.md).
scene.render.fps = 30
scene.render.fps_base = 1
bpy.ops.import_scene.gltf(filepath=glb)

rig = next(o for o in scene.objects if o.type == 'ARMATURE')
rig_name_at_import = rig.name
rig.name = 'humanoid'
rig.data.name = 'humanoid'
if 'height' not in rig:
    raise SystemExit('Skelett ohne Custom Property "height" - Export zu alt?')

# Der glTF-Import nennt Actions "<Animation>_<Objekt>". Die des Skeletts
# heißen wie der Clip im Spiel; die der Bogen-Stufen sind nur Vorlage.
clips = {c['name']: c for c in sidecar['clips']}
found = {}
for action in list(bpy.data.actions):
    anim, _, owner = action.name.partition('_')
    if owner == rig_name_at_import and anim in clips:
        found[anim] = action
    else:
        action.name = 'vorlage.' + action.name
missing = set(clips) - set(found)
if missing:
    raise SystemExit(f'Clips fehlen nach dem Import: {sorted(missing)}')
for name, action in found.items():
    c = clips[name]
    action.name = name
    action.use_fake_user = True
    action['props'] = c['props']
    action['pose'] = int(c['pose'])
    action['phase_period'] = float(c['phase_period'])
    action['phase_shift'] = float(c['phase_shift'])
    action['kneel'] = 1 if c['kneel'] else 0
    # Takt-Marken: Clip-Zeiten (s), zu denen der Hieb zu hören ist.
    if c.get('strike'):
        action['strike'] = ','.join(f'{t:.6f}' for t in c['strike'])
    frames = int(action.frame_range[1] - action.frame_range[0]) + 1
    if frames != c['frames']:
        raise SystemExit(f'{name}: {frames} Bilder nach dem Import, erwartet {c["frames"]}')

# IK für die Hände (zum Bearbeiten in Blender): Ziele ik.hand.L/R, gebacken
# für carve und mow (tools/blender/humanoid_ik.py).
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import humanoid_ik
humanoid_ik.setup(rig)
humanoid_ik.bake(rig)

# Zu sehen ist beim Öffnen das Schnitzen an der Werkbank.
rig.animation_data.action = found['carve']
scene.frame_start = 0
scene.frame_end = int(found['carve'].frame_range[1])
bpy.ops.wm.save_as_mainfile(filepath=blend)
print('gespeichert:', blend, 'Clips', {n: a.frame_range[:] for n, a in found.items()}, 'Höhe', rig['height'])
