# Exportiert die Clips einer .blend-Datei fürs Spiel (docs/ANIMATION.md):
#   <out>.glb   nur das Skelett, mit allen seinen Actions als Animationen
#   <out>.json  je Clip, was glTF nicht trägt: Länge, Werkzeuge (props),
#               welche Pose er ersetzt (pose, phase_period, phase_shift),
#               kniend (kneel), bei Tieren für welche Arten (species) und
#               ob es liegt (lying), dazu die Körperhöhe des Skeletts und
#               bei Tieren, wie weit es den Kopf zum Äsen senkt (graze)
# Das Spiel (src/gl/clips.ts) liest beides und backt die Clips für jede Figur
# mit passenden Knochennamen.
#
# Aufruf: blender -b <datei.blend> --python tools/blender/export_clips.py -- <out>
# (npm run gen:anim macht das für alle Dateien in assets/blender/clips/)

import json
import sys
import bpy

out = sys.argv[sys.argv.index('--') + 1]
scene = bpy.context.scene
fps = scene.render.fps / scene.render.fps_base

rigs = [o for o in scene.objects if o.type == 'ARMATURE']
if len(rigs) != 1:
    raise SystemExit(f'genau ein Skelett erwartet, gefunden: {[o.name for o in rigs]}')
rig = rigs[0]

# Die Clips: alle Actions, die Knochen dieses Skeletts bewegen - nicht die
# Vorlagen (Bogen-Stufen o. ä.).
bones = {b.name for b in rig.data.bones}
def moves_rig(action):
    return any(f.data_path.startswith('pose.bones["') and f.data_path.split('"')[1] in bones for f in action.fcurves)
clips = [a for a in bpy.data.actions if moves_rig(a)]
if not clips:
    raise SystemExit('keine Clips für ' + rig.name)

# Die Animationen sollen wie ihre Actions heißen. Liegen Actions in NLA-Spuren
# (der glTF-Import legt welche an), nähme der Export den Spurnamen - die Spuren
# werden nur für den Export entfernt, die Datei wird nicht gespeichert.
if rig.animation_data:
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    rig.animation_data.action = None

# Nur Knochen, die etwas bewegen, kommen ins Spiel: Hilfsknochen zum
# Bearbeiten (IK-Ziele ik.*, die Hände hand.* - siehe humanoid_ik.py) bleiben
# in Blender. Nur für den Export, die Datei wird nicht gespeichert.
for bone in rig.data.bones:
    if bone.name.startswith('ik.'):
        bone.use_deform = False

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=out + '.glb',
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_frame_step=1,
    export_optimize_animation_size=False,
    export_extras=True,
    export_yup=True,
    export_def_bones=True,
)

def listed(value):
    if value is None:
        return []
    if isinstance(value, str):
        return [v.strip() for v in value.split(',') if v.strip()]
    return list(value)

def clip_entry(a):
    entry = {
        'name': a.name,
        'frames': int(a.frame_range[1] - a.frame_range[0]) + 1,
        # Das letzte Bild gleicht dem ersten: die Schleife dauert (Bilder - 1) / fps.
        'duration': (a.frame_range[1] - a.frame_range[0]) / fps,
        'props': listed(a.get('props')),
        'kneel': bool(a.get('kneel', 0)),
    }
    # Takt-Marken: Clip-Zeiten (s) in einer Schleife, zu denen der Hieb zu
    # hören ist (VillagerWork.swing).
    if a.get('strike'):
        entry['strike'] = [float(t) for t in listed(a.get('strike'))]
    # Tiere: nur für diese Arten (leer: alle), auf der Seite liegend.
    if 'species' in a:
        entry['species'] = listed(a.get('species'))
    if 'lying' in a:
        entry['lying'] = bool(a.get('lying', 0))
    # Ersetzt der Clip eine Pose des Spiels: welche.
    if 'pose' in a:
        entry['pose'] = int(a['pose'])
    # Welcher Zeit- bzw. Phasenbereich eine Schleife ist - auch ohne Pose
    # (Mühlenflügel, Fahne: Spielzeit statt Phase).
    if 'phase_period' in a:
        entry['phase_period'] = float(a['phase_period'])
        entry['phase_shift'] = float(a.get('phase_shift', 0.0))
    return entry

manifest = {
    'rig': rig.name,
    'height': float(rig.get('height', 1.7)),
    'fps': fps,
    # Tiere: das Tier des Skeletts senkt den Kopf zum Äsen so weit (uGraze) -
    # das Spiel rechnet das Senken damit je Art um.
    **({'graze': float(rig['graze'])} if 'graze' in rig else {}),
    'clips': [clip_entry(a) for a in sorted(clips, key=lambda a: int(a.get('pose', 99)))],
}
with open(out + '.json', 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('exportiert:', out, [c['name'] for c in manifest['clips']])
