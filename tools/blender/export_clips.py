# Exportiert die Clips einer .blend-Datei fürs Spiel (docs/ANIMATION.md):
#   <out>.glb   nur das Skelett, mit allen seinen Actions als Animationen
#   <out>.json  je Clip, was glTF nicht trägt: Länge, Werkzeuge (props),
#               welche Pose er ersetzt (pose, phase_period, phase_shift),
#               kniend (kneel), dazu die Körperhöhe des Skeletts
# Das Spiel (src/gl/clips.ts) liest beides und backt die Clips für jede Figur
# mit passenden Knochennamen.
#
# Aufruf: blender -b <datei.blend> --python tools/blender/export_clips.py -- <out>
# (npm run gen:anim macht das für alle Dateien in assets/blender/)

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
    # Ersetzt der Clip eine Pose des Spiels: welche, und welcher Phasenbereich.
    if 'pose' in a:
        entry['pose'] = int(a['pose'])
        entry['phase_period'] = float(a['phase_period'])
        entry['phase_shift'] = float(a.get('phase_shift', 0.0))
    return entry

manifest = {
    'rig': rig.name,
    'height': float(rig.get('height', 1.7)),
    'fps': fps,
    'clips': [clip_entry(a) for a in sorted(clips, key=lambda a: int(a.get('pose', 99)))],
}
with open(out + '.json', 'w') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('exportiert:', out, [c['name'] for c in manifest['clips']])
