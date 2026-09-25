# Legt aus einem OBJ des Spiels (src/models/<name>.obj + .mtl) eine .blend-
# Datei an - einmalig beim Umzug nach Blender (docs/BLENDER.md). Danach ist die
# .blend-Datei die Quelle, das OBJ wird aus ihr exportiert (blend_to_obj.py).
#
# Je `o` im OBJ ein Objekt in Blender. Sein Name im Spiel steht in der Custom
# Property `obj_name`: Blender hängt an doppelte Namen ".001" an, das Spiel
# braucht aber genau "Window.Frame", "Stock.12", "Crop.3.5.14" ... Die
# Reihenfolge merkt sich `obj_order`. Materialien heißen wie im OBJ, ihre
# Farbe (Kd) ist die Farbe des Materials in Blender. Kommentar oben und der
# Name der MTL-Datei stehen an der Szene (obj_header, obj_mtllib).
#
# Achsen: OBJ wie Blender es exportiert (Y oben, vorn +Z) -> in Blender Z oben,
# vorn -Y (Vorderansicht zeigt die Vorderseite).
#
# Aufruf: blender -b --python tools/blender/obj_to_blend.py -- <obj> <blend> [<obj> <blend> ...]

import os
import sys
import bpy

pairs = sys.argv[sys.argv.index('--') + 1:]


def read_mtl(path):
    colors = {}
    current = None
    if not os.path.exists(path):
        return colors
    for raw in open(path):
        parts = raw.split()
        if not parts:
            continue
        if parts[0] == 'newmtl':
            current = ' '.join(parts[1:])
        elif parts[0] == 'Kd' and current:
            colors[current] = tuple(float(v) for v in parts[1:4])
    return colors


def material(name, colors):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    rgb = colors.get(name, (0.6, 0.6, 0.6))
    m.diffuse_color = (*rgb, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.9
    return m


def convert(obj_path, blend_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    positions = []
    header = []
    mtllib = None
    objects = []  # (name, material list per face, faces)
    current = None
    mat = ''
    at_top = True
    for raw in open(obj_path):
        line = raw.rstrip('\n')
        if line.startswith('#'):
            if at_top:
                header.append(line)
            continue
        parts = line.split()
        if not parts:
            continue
        at_top = False
        key = parts[0]
        if key == 'v':
            x, y, z = (float(v) for v in parts[1:4])
            positions.append((x, -z, y))
        elif key == 'mtllib':
            mtllib = ' '.join(parts[1:])
        elif key in ('o', 'g'):
            current = {'name': ' '.join(parts[1:]), 'faces': [], 'mats': []}
            objects.append(current)
        elif key == 'usemtl':
            mat = ' '.join(parts[1:])
        elif key == 'f':
            if current is None:
                current = {'name': 'Objekt', 'faces': [], 'mats': []}
                objects.append(current)
            idx = []
            for a in parts[1:]:
                i = int(a.split('/')[0])
                idx.append(len(positions) + i if i < 0 else i - 1)
            current['faces'].append(idx)
            current['mats'].append(mat)

    colors = read_mtl(os.path.join(os.path.dirname(obj_path), mtllib)) if mtllib else {}
    for order, o in enumerate(objects):
        used = sorted({i for f in o['faces'] for i in f})
        local = {g: n for n, g in enumerate(used)}
        verts = [positions[g] for g in used]
        faces = [[local[i] for i in f] for f in o['faces']]
        mesh = bpy.data.meshes.new(o['name'])
        mesh.from_pydata(verts, [], faces, shade_flat=True)
        names = list(dict.fromkeys(o['mats']))
        for n in names:
            mesh.materials.append(material(n, colors))
        for poly, n in zip(mesh.polygons, o['mats']):
            poly.material_index = names.index(n)
        ob = bpy.data.objects.new(o['name'], mesh)
        ob['obj_name'] = o['name']
        ob['obj_order'] = order
        scene.collection.objects.link(ob)
        # Wie Blender es genannt hat (doppelte Namen nummeriert es um) - ein
        # anderer Name später heißt: in Blender umbenannt (blend_to_obj.py).
        ob['obj_blender_name'] = ob.name

    scene['obj_header'] = '\n'.join(header)
    scene['obj_mtllib'] = mtllib or ''
    scene['obj_file'] = os.path.basename(obj_path)
    os.makedirs(os.path.dirname(os.path.abspath(blend_path)), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    print('angelegt:', blend_path, len(objects), 'Objekte')


for obj_path, blend_path in zip(pairs[0::2], pairs[1::2]):
    convert(obj_path, blend_path)
