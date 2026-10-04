"""Offline review renders of any baked Tripo character.
Run: Blender -b --factory-startup --python tools/blender/render_tripo_char.py -- <id> [clip:frame[:camera] ...]
camera: front | side | three (default three)"""
from pathlib import Path
import sys
import bpy
from mathutils import Vector
root = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--') + 1:]
cid, shots = args[0], args[1:] or ['idle:0', 'walk:6:side', 'attack_a:9', 'heavy:9', 'guard:8', 'carry:0']
bpy.ops.wm.open_mainfile(filepath=str(root / ('models/tripo-%s-animated.blend' % cid)))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
scene = bpy.context.scene
for o in scene.objects:
    if o.name.startswith(('TripoEyes', 'TripoBlush', 'TripoBrow', 'TripoMouth', 'TripoTear')):
        o.hide_render = True
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 10
scene.render.resolution_x, scene.render.resolution_y = 520, 600
scene.world = bpy.data.worlds.new('w'); scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.38, .43, .5, 1); scene.world.node_tree.nodes['Background'].inputs[1].default_value = .6
for pos, power, size in [((2, -3, 4), 450, 4), ((-1, 2, 2), 250, 3)]:
    d = bpy.data.lights.new('l', 'AREA'); d.energy = power; d.shape = 'DISK'; d.size = size
    o = bpy.data.objects.new('l', d); scene.collection.objects.link(o); o.location = pos
    o.rotation_euler = (Vector((-.1, 0, .5)) - o.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.02))
cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.38; scene.camera = cam
out = root / 'artifacts/tripo-review' / cid; out.mkdir(parents=True, exist_ok=True)
CAMS = {'three': (2.5, 1.5, 1.35), 'side': (0, 3, 1.05), 'front': (3, 0, 1.05)}
for shot in shots:
    parts = shot.split(':'); clip, frame = parts[0], int(parts[1]); where = parts[2] if len(parts) > 2 else 'three'
    arm.animation_data.action = bpy.data.actions[clip]; scene.frame_set(frame)
    cam.location = CAMS[where]
    cam.rotation_euler = (Vector((-.09, 0, .49)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(out / ('%s_%s_%d.png' % (clip, where, frame))); bpy.ops.render.render(write_still=True)
    print('RENDERED', clip, frame, where)
