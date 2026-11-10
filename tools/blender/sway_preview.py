"""Render the hair / cloth sway weights of a baked Tripo character as colours (red = hair, green = cloth), front and back.

    blender -b --python tools/blender/sway_preview.py -- <id> <out.png>
"""
import math
import sys
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
cid, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / f'models/tripo-{cid}-animated.blend'))
sc = bpy.context.scene
ob = max((o for o in sc.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
me = ob.data
hair = [0.0] * len(me.vertices); cloth = [0.0] * len(me.vertices)
me.attributes['_HAIR'].data.foreach_get('value', hair); me.attributes['_CLOTH'].data.foreach_get('value', cloth)
col = me.color_attributes.new('SwayPreview', 'FLOAT_COLOR', 'POINT')
col.data.foreach_set('color', [c for i in range(len(hair)) for c in (.25 + .75 * hair[i], .25 + .75 * cloth[i], .25, 1)])
me.color_attributes.active_color = col
for o in sc.objects:
    if o.type == 'MESH' and o is not ob:
        o.hide_render = True
arm = next(o for o in sc.objects if o.type == 'ARMATURE'); arm.data.pose_position = 'REST'
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 1.35
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'VERTEX'
S = 500; sc.render.resolution_x = sc.render.resolution_y = S
ctr = Vector((0, 0, .5)); cells = []
for az in (0, 90, 180):
    a = math.radians(az); co.location = ctr + Vector((math.cos(a) * 4, -math.sin(a) * 4, .2)); co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = out + '.cell.png'; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(out + '.cell.png'); cells.append(np.array(im.pixels[:], dtype=np.float32).reshape(S, S, 4)); bpy.data.images.remove(im)
img = bpy.data.images.new('s', S * 3, S); img.pixels = np.concatenate(cells, axis=1).ravel(); img.filepath_raw = out; img.file_format = 'PNG'; img.save()
print('PREVIEW', out, 'hair>.05:', sum(1 for w in hair if w > .05), 'cloth>.05:', sum(1 for w in cloth if w > .05))
