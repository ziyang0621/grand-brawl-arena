"""Bake the stage-crowd spectators (Tripo scans, see models/tripo-crowd/) into small animated GLBs.

    blender -b --factory-startup --python tools/blender/animate_tripo_crowd.py -- sailor     # sailor | desert | islander

Clips (24 fps): idle (gentle sway, arms down), cheer (hop with both arms waving overhead), reach (lean in with the right arm forward and
down: lighting a cannon fuse), pat (packing a snowball, both hands low in front), throw (ball raised overhead, then hurled forward).
The crowd only needs to read from a distance, so the arms are aimed with simple bone pointing (no IK, no fingers) and the textures are
halved. Output: models/tripo-crowd-<id>.glb.
"""
import glob
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
import tripo_rig  # noqa: E402

CID = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'sailor'
# a re-rig with the Mixamo skeleton (rig-mixamo/) wins over the first rig when the first one came out broken (the islander's fur coat hid her right arm)
SOURCE = (sorted(glob.glob(str(ROOT / f'models/tripo-crowd/{CID}/rig-mixamo/tripo-out/*/model.glb'))) or sorted(glob.glob(str(ROOT / f'models/tripo-crowd/{CID}/rig/tripo-out/*/model.glb'))))[-1]
OUT = ROOT / f'models/tripo-crowd-{CID}.glb'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = max((o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.vertices), key=lambda o: len(o.data.vertices))
rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
pb = arm.pose.bones
for b in pb:
    b.rotation_mode = 'QUATERNION'
arm.animation_data_create()
bpy.context.scene.render.fps = 24
try:
    RIG = tripo_rig.discover(arm)
except AssertionError:
    # Mitten hands: no finger bones, so the geometric discovery cannot find the wrists. The arm chain is still named
    # 0_<Side>_Limb_0..3 (clavicle, upper arm, forearm, hand).
    bones = arm.data.bones
    find = lambda tail: next(b for b in bones if b.name.endswith(tail))
    RIG = {'root': next(b for b in bones if b.parent is None)}
    for side, sign in (('Right', 1), ('Left', -1)):
        RIG[side] = {'sign': sign, 'upper': find(f'0_{side}_Limb_1'), 'fore': find(f'0_{side}_Limb_2')}
R, L = RIG['Right'], RIG['Left']
ROOT_BONE = RIG['root'].name


def update():
    bpy.context.view_layer.update()


def point(bone, direction):
    """Aim a bone (its head -> tail axis) along a direction in armature space, keeping its rest twist."""
    rb = rest[bone.name]
    rest_dir = (rb.to_3x3() @ Vector((0, 1, 0))).normalized()
    q = rest_dir.rotation_difference(Vector(direction).normalized())
    p = pb[bone.name]
    p.matrix = Matrix.Translation(p.head) @ (q.to_matrix().to_4x4() @ rb.to_3x3().to_4x4())
    update()


def arm_to(side, upper, fore):
    s = side['sign']
    point(side['upper'], Vector((upper[0], upper[1] * s, upper[2])))
    point(side['fore'], Vector((fore[0], fore[1] * s, fore[2])))


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def pose(name, t):
    for b in pb:
        b.matrix_basis.identity()
    update()
    ph = t * math.tau
    lift = 0.0
    if name == 'idle':
        lift = .004 * math.sin(2 * ph)
        arm_to(R, (.05, .32, -1), (.12, .22, -1))
        arm_to(L, (.05, .32, -1), (.12, .22, -1))
    elif name == 'cheer':
        lift = .055 * abs(math.sin(ph))
        wave = math.sin(ph * 2)
        arm_to(R, (.15, .35, 1), (.1 + .25 * wave, .2, 1))
        arm_to(L, (.15, .35, 1), (.1 - .25 * wave, .2, 1))
    elif name == 'reach':
        arm_to(R, (1, .25, -.55), (1, .1, -.35))
        arm_to(L, (.35, .5, -.8), (.6, .2, -.6))
    elif name == 'pat':
        pat = math.sin(ph * 2)
        arm_to(R, (.8, .25, -.6), (1, -.25 + .12 * pat, -.15))
        arm_to(L, (.8, .25, -.6), (1, -.25 - .12 * pat, -.15))
    elif name == 'throw':
        k = smooth(t / .45)
        f = smooth((t - .45) / .25)
        up_u, up_f = (-.25, .2, 1), (-.4, .05, 1)
        out_u, out_f = (1, .2, .35), (1, .1, .2)
        u = lerp(lerp((.8, .25, -.6), up_u, k), out_u, f)
        fo = lerp(lerp((1, -.25, -.15), up_f, k), out_f, f)
        arm_to(R, u, fo)
        arm_to(L, u, fo)
        lift = .03 * math.sin(math.pi * f)
    p = pb[ROOT_BONE]
    p.location = rest[ROOT_BONE].to_3x3().inverted() @ Vector((0, 0, lift))
    update()


CLIPS = {'idle': 48, 'cheer': 16, 'reach': 24, 'pat': 16, 'throw': 24}
for name, frames in CLIPS.items():
    action = bpy.data.actions.new(name=name)
    arm.animation_data.action = action
    for f in range(frames + 1):
        pose(name, f / frames)
        for b in pb:
            b.keyframe_insert(data_path='rotation_quaternion', frame=f, group=b.name)
            if b.name == ROOT_BONE:
                b.keyframe_insert(data_path='location', frame=f, group=b.name)
    action.use_fake_user = True
arm.animation_data.action = bpy.data.actions['idle']
for img in bpy.data.images:   # background characters: half-size textures
    if img.type == 'IMAGE' and img.size[0] >= 2048:
        img.scale(1024, 1024)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
body.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=str(OUT), export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_skins=True, export_all_influences=False, export_optimize_animation_size=True, export_yup=True)
print('EXPORTED', OUT)
