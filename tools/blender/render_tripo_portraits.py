"""Render a head-and-shoulders portrait of every Tripo character to models/portraits/tripo-<id>.png (transparent, 512 px square).
These replace the drawn portraits in the HUD, select cards, VS screen and cut-ins when the Tripo models are the default look.

    blender -b --factory-startup --python tools/blender/render_tripo_portraits.py
"""
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
import tripo_rig

# Where the face is: (head-centre height offset, ortho size, azimuth degrees from the front) tuned per character from the face renders.
FRAMING = {
    'pirate': (.02, .46, 28), 'brawler': (.0, .50, 28), 'guardian': (-.02, .40, 28),
    'gunner': (.0, .54, 28), 'cook': (.07, .40, 28), 'stormcaller': (-.07, .44, 28),
}
OUT = ROOT / 'models/portraits'
OUT.mkdir(exist_ok=True)
for cid, (dz, size, az) in FRAMING.items():
    bpy.ops.wm.open_mainfile(filepath=str(ROOT / f'models/tripo-{cid}-animated.blend'))
    sc = bpy.context.scene
    arm = next(o for o in sc.objects if o.type == 'ARMATURE')
    for o in sc.objects:
        if o.name.startswith('Tripo') and o.type == 'MESH' and o.name not in ('TripoCutlass', 'TripoPistol', 'TripoStaff', 'TripoBuckler'):
            o.hide_render = True            # expression decals off: the painted face
        if o.name in ('TripoCutlass', 'TripoPistol', 'TripoStaff', 'TripoBuckler'):
            o.hide_render = True
    arm.data.pose_position = 'REST'       # arms stay out of the frame (the idle pose lifts some hands in front of the face)
    bpy.context.view_layer.update()
    rig = tripo_rig.discover(arm)
    head = rig['head'][-1]
    ctr = arm.matrix_world @ ((head.head_local + head.tail_local) / 2 + Vector((0, 0, dz)))
    if cid == 'stormcaller':
        ctr = arm.matrix_world @ Vector((.02, -.04, .40))
    cam = bpy.data.cameras.new('c')
    cam.type = 'ORTHO'
    cam.ortho_scale = size
    co = bpy.data.objects.new('c', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    a = math.radians(az)
    co.location = ctr + Vector((math.cos(a), -math.sin(a), .08)) * 3
    co.rotation_euler = (ctr - co.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'TEXTURE'
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.render.filepath = str(OUT / f'tripo-{cid}.png')
    bpy.ops.render.render(write_still=True)
    print('PORTRAIT', cid)
