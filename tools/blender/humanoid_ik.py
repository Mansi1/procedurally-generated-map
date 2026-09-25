# IK für die Hände der Dorfbewohner in assets/blender/clips/humanoid.blend
# (docs/ANIMATION.md, Phase 2): zum Bearbeiten in Blender. Das Spiel liest nur
# die bekannten Knochen (HUMANOID_BONES in src/gl/clips.ts) - was IK aus ihnen
# macht, backt der Export (export_clips.py, export_force_sampling) mit.
#
# Aufbau je Seite (L, R):
#   hand.L      neuer Knochen am Unterarm, vom Handgelenk zur Mitte der Hand.
#               Er trägt die IK-Einschränkung: seine Spitze folgt dem Ziel.
#   ik.hand.L   Ziel der Hand, ohne Eltern - diesen Knochen verschiebt man.
#   Kette: hand.L -> forearm.L -> upperArm.L -> shoulder.L (4 Knochen). Jeder
#   darf nur um die Achse drehen, um die er auch im Spiel dreht: Schulter und
#   Ellbogen um x (vor und zurück), der Oberarm um z (zur Mitte). Das sind drei
#   Freiheiten für drei Koordinaten der Hand - kein Pol nötig, und die Lösung
#   ist dieselbe Haltung, aus der das Ziel gebacken wurde.
#
# Wo IK gilt: nur in Clips, in denen beide Hände ein Werkzeug halten (carve,
# mow). Dort wird das Ziel je Bild dorthin gebacken, wo die Hand heute ist, und
# der Einfluss der Einschränkung ist in der Action auf 1 gesetzt; in allen
# anderen Actions auf 0 (Kurve "influence" der Einschränkung in der Action).
#
# Aufruf: blender -b humanoid.blend --python tools/blender/humanoid_ik.py
# (legt IK an bzw. neu an und speichert). bootstrap_humanoid.py ruft setup() auch.

import bpy
from mathutils import Matrix, Vector

IK_CLIPS = ('carve', 'mow')
SIDES = {'L': 1, 'R': -1}


def setup(rig, hand_x=0.29, wrist_z=0.87, hand_z=0.80):
    """Knochen und Einschränkungen anlegen (vorhandene werden ersetzt)."""
    scene = bpy.context.scene
    bpy.context.view_layer.objects.active = rig
    for o in scene.objects:
        o.select_set(o is rig)
    rig.animation_data.action = None
    # Vorhandenes IK entfernen, damit das Skript mehrfach laufen darf.
    for pb in rig.pose.bones:
        for c in list(pb.constraints):
            if c.type == 'IK':
                pb.constraints.remove(c)
    bpy.ops.object.mode_set(mode='EDIT')
    edit = rig.data.edit_bones
    for side, s in SIDES.items():
        for name in (f'hand.{side}', f'ik.hand.{side}'):
            if name in edit:
                edit.remove(edit[name])
        hand = edit.new(f'hand.{side}')
        hand.head = (s * hand_x, 0.0, wrist_z)
        hand.tail = (s * hand_x, 0.0, hand_z)
        hand.parent = edit[f'forearm.{side}']
        hand.use_deform = False
        target = edit.new(f'ik.hand.{side}')
        target.head = (s * hand_x, 0.0, hand_z)
        target.tail = (s * hand_x, 0.0, hand_z - 0.12)
        target.use_deform = False
    bpy.ops.object.mode_set(mode='POSE')
    for side in SIDES:
        rig.pose.bones[f'hand.{side}'].lock_ik_x = True
        rig.pose.bones[f'hand.{side}'].lock_ik_y = True
        rig.pose.bones[f'hand.{side}'].lock_ik_z = True
        for bone, free in ((f'forearm.{side}', 'x'), (f'upperArm.{side}', 'z'), (f'shoulder.{side}', 'x')):
            pb = rig.pose.bones[bone]
            pb.lock_ik_x, pb.lock_ik_y, pb.lock_ik_z = free != 'x', True, free != 'z'
        ik = rig.pose.bones[f'hand.{side}'].constraints.new('IK')
        ik.name = 'IK'
        ik.target = rig
        ik.subtarget = f'ik.hand.{side}'
        ik.chain_count = 4
        ik.use_tail = True
        ik.use_stretch = False
        ik.iterations = 500
    bpy.ops.object.mode_set(mode='OBJECT')


def bake(rig):
    """Je Clip: Ziele backen (IK-Clips) und den Einfluss setzen."""
    scene = bpy.context.scene
    actions = [a for a in bpy.data.actions if any(f.data_path.startswith('pose.bones["') for f in a.fcurves)
               and any('"upperArm.L"' in f.data_path for f in a.fcurves)]
    for action in actions:
        # Alte Kurven der Ziele und des Einflusses entfernen.
        for f in list(action.fcurves):
            if 'ik.hand.' in f.data_path or 'constraints["IK"]' in f.data_path:
                action.fcurves.remove(f)
        rig.animation_data.action = action
        start, end = int(action.frame_range[0]), int(action.frame_range[1])
        use = action.name in IK_CLIPS
        constraints = [rig.pose.bones[f'hand.{side}'].constraints['IK'] for side in SIDES]
        for c in constraints:
            c.influence = 0.0
        if use:
            # Wo die Hände ohne IK sind (FK aus den Keyframes) - dorthin das Ziel.
            where = {side: [] for side in SIDES}
            for f in range(start, end + 1):
                scene.frame_set(f)
                for side in SIDES:
                    where[side].append(rig.pose.bones[f'hand.{side}'].tail.copy())
            for i, f in enumerate(range(start, end + 1)):
                for side in SIDES:
                    pb = rig.pose.bones[f'ik.hand.{side}']
                    rest = pb.bone.matrix_local
                    pb.matrix_basis = Matrix.Translation(rest.inverted().to_3x3() @ (where[side][i] - rest.translation))
                    pb.keyframe_insert('location', frame=f, group=f'ik.hand.{side}')
        for c in constraints:
            c.influence = 1.0 if use else 0.0
            c.keyframe_insert('influence', frame=start)
            c.keyframe_insert('influence', frame=end)
    rig.animation_data.action = bpy.data.actions.get('carve')


if __name__ == '__main__':
    rig = bpy.data.objects['humanoid']
    setup(rig)
    bake(rig)
    bpy.ops.wm.save_mainfile()
    print('IK angelegt für', IK_CLIPS)
