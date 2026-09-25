# Exportiert das Modell einer .blend-Datei als OBJ + MTL fürs Spiel
# (docs/BLENDER.md) - Gegenstück zu obj_to_blend.py.
#
# - Jedes sichtbare Mesh-Objekt wird ein `o` im OBJ, mit seinem Namen im
#   Spiel: Custom Property `obj_name` - wird das Objekt in Blender umbenannt,
#   kopiert oder neu angelegt, der Blender-Name (siehe game_name).
#   Reihenfolge nach `obj_order`, neue Objekte danach nach Namen.
# - Lage, Drehung und Größe des Objekts in Blender werden eingerechnet.
# - Die Farbe eines Materials ist Kd in der MTL-Datei. Teilen sich mehrere
#   Modelle eine MTL-Datei (villager.mtl), wird sie ergänzt, nicht ersetzt.
# - Objekte in einer Collection namens "Vorlage" (oder ausgeblendet) kommen
#   nicht mit - dort liegen Hilfsobjekte zum Bearbeiten.
#
# Aufruf: blender -b <datei.blend> --python tools/blender/blend_to_obj.py -- <Zielordner>
#    oder: blender -b --python tools/blender/blend_to_obj.py -- <Zielordner> <a.blend> <b.blend> ...
#          (mehrere Dateien in einem Lauf - tools/blender/models.mjs)

import os
import re
import sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
out_dir = args[0]


def fmt(v):
    s = f'{v:.4f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def game_name(ob):
    """Name des Objekts im Spiel.

    obj_name gilt, solange das Objekt in Blender noch so heißt wie nach dem
    Anlegen (obj_blender_name - Blender nummeriert doppelte Namen um,
    "Window.Frame.001", "Berry.94"). Wurde es umbenannt oder ist es neu bzw.
    kopiert, gilt der Blender-Name - ohne ".001", wenn es den Namen davor in
    der Szene noch einmal gibt (eine Kopie von "Window.Frame" heißt wieder so).
    """
    stored = ob.get('obj_name')
    if stored and ob.name == ob.get('obj_blender_name', stored):
        return stored
    m = re.fullmatch(r'(.*)\.\d{3}', ob.name)
    if m and any(o is not ob and (o.name == m.group(1) or o.get('obj_name') == m.group(1)) for o in ob.users_scene[0].objects):
        return m.group(1)
    return ob.name


def exported(ob):
    if ob.type != 'MESH' or ob.hide_render or ob.hide_get():
        return False
    return not any(c.name.startswith('Vorlage') for c in ob.users_collection)


def export():
    scene = bpy.context.scene
    name = os.path.splitext(scene.get('obj_file') or os.path.basename(bpy.data.filepath))[0]
    mtllib = scene.get('obj_mtllib') or f'{name}.mtl'
    objects = [ob for ob in scene.objects if exported(ob)]
    objects.sort(key=lambda ob: (ob.get('obj_order', 1_000_000), game_name(ob)))

    lines = []
    header = scene.get('obj_header', '')
    if header:
        lines.append(header)
    lines.append(f'mtllib {mtllib}')
    base = 0
    used_materials = {}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for ob in objects:
        ev = ob.evaluated_get(depsgraph)
        mesh = ev.to_mesh()
        mw = ob.matrix_world
        lines.append(f'o {game_name(ob)}')
        for v in mesh.vertices:
            x, y, z = mw @ v.co
            # Blender (Z oben, vorn -Y) -> OBJ (Y oben, vorn +Z)
            lines.append(f'v {fmt(x)} {fmt(z)} {fmt(-y)}')
        current = None
        for poly in mesh.polygons:
            mat = ob.material_slots[poly.material_index].material if ob.material_slots else None
            mname = mat.name if mat else 'Default'
            if mat:
                used_materials[mname] = mat
            if mname != current:
                lines.append(f'usemtl {mname}')
                lines.append('s off')
                current = mname
            lines.append('f ' + ' '.join(str(base + i + 1) for i in poly.vertices))
        base += len(mesh.vertices)
        ev.to_mesh_clear()

    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f'{name}.obj'), 'w') as f:
        f.write('\n'.join(lines) + '\n')

    # MTL: vorhandene Einträge behalten (Reihenfolge), eigene aktualisieren/anfügen.
    mtl_path = os.path.join(out_dir, mtllib)
    entries = {}
    order = []
    title = f'# {mtllib}'
    if os.path.exists(mtl_path):
        cur = None
        for raw in open(mtl_path):
            line = raw.rstrip('\n')
            if line.startswith('#') and not order:
                title = line
            elif line.startswith('newmtl '):
                cur = line[7:]
                order.append(cur)
                entries[cur] = []
            elif cur is not None and line.strip():
                entries[cur].append(line)
    for mname, mat in used_materials.items():
        r, g, b = mat.diffuse_color[:3]
        body = [f'Kd {r:.3f} {g:.3f} {b:.3f}', 'Ka 0 0 0', 'Ks 0 0 0', 'd 1', 'illum 1']
        if mname not in entries:
            order.append(mname)
        entries[mname] = body
    with open(mtl_path, 'w') as f:
        f.write(title + '\n')
        for mname in order:
            f.write(f'\nnewmtl {mname}\n' + '\n'.join(entries[mname]) + '\n')
    print('exportiert:', os.path.join(out_dir, f'{name}.obj'), len(objects), 'Objekte')


files = args[1:]
if not files:
    export()
for path in files:
    bpy.ops.wm.open_mainfile(filepath=path)
    export()
