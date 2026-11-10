"""Contact sheet of one clip of a baked Tripo character, to check poses without the game.

    blender -b --python tools/blender/render_sheet.py -- <id> <clip> <out.png> [frames, comma separated] [azimuth degrees] [ortho size]

<id> is the model name after 'tripo-' (pirate, brawler, guardian, gunner, cook, stormcaller). Expression decals are hidden.
"""
import math
import sys
import bpy
import numpy as np
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--') + 1:]
cid, clip, out = args[0], args[1], args[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / f'models/tripo-{cid}-animated.blend'))
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
action = bpy.data.actions[clip]
last = int(action.frame_range[1])
frames = [int(f) for f in args[3].split(',')] if len(args) > 3 and args[3] else [round(last * i / 11) for i in range(12)]
az = math.radians(float(args[4]) if len(args) > 4 else 40)
for o in sc.objects:
    if o.type == 'MESH' and (o.name.startswith('TripoEyes') or o.name.startswith('TripoBrow') or o.name.startswith('TripoMouth') or o.name.startswith('TripoTear') or o.name.startswith('TripoBlush')):
        o.hide_render = True
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = float(args[5]) if len(args) > 5 else 1.6
co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
ctr = Vector((0, 0, .58))
co.location = ctr + Vector((math.cos(az) * 4, -math.sin(az) * 4, .3))
co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
S = 300
sc.render.resolution_x = sc.render.resolution_y = S
cols = 6; rows = (len(frames) + cols - 1) // cols
sheet = np.ones((rows * S, cols * S, 4), dtype=np.float32)
tmp = out + '.cell.png'
arm.animation_data.action = action
for i, f in enumerate(frames):
    sc.frame_set(f)
    sc.render.filepath = tmp; bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(tmp, check_existing=False)
    a = np.array(im.pixels[:], dtype=np.float32).reshape(S, S, 4)
    r, c = divmod(i, cols); sheet[(rows - 1 - r) * S:(rows - r) * S, c * S:(c + 1) * S] = a
    bpy.data.images.remove(im)
img = bpy.data.images.new('sheet', cols * S, rows * S); img.pixels = sheet.ravel(); img.filepath_raw = out; img.file_format = 'PNG'; img.save()
print('SHEET', out, frames)
