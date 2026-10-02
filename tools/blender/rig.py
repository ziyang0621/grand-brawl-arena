"""Shared skeleton, skinning and pose helpers. Every character uses the SAME 17-bone rest pose, so clips are shared and a
character differs only by its meshes, its stature (applied by the game) and a few style-specific clips."""
import bpy, bmesh, math
from mathutils import Vector, Euler

BONES = [
    ('root', (0,0,0), (0,0,.25), None),
    ('hips', (0,0,1.3), (0,0,1.5), 'root'),
    ('spine', (0,0,1.5), (0,0,1.95), 'hips'),
    ('chest', (0,0,1.95), (0,0,2.4), 'spine'),
    ('neck', (0,0,2.4), (0,0,2.7), 'chest'),
    ('head', (0,0,2.7), (0,0,3.6), 'neck'),
]
for _suffix, _s in (('L', 1), ('R', -1)):
    BONES += [
        (f'upper_arm.{_suffix}', (_s*.66,0,2.3), (_s*.78,0,1.8), 'chest'),
        (f'forearm.{_suffix}', (_s*.78,0,1.8), (_s*.84,0,1.32), f'upper_arm.{_suffix}'),
        (f'hand.{_suffix}', (_s*.84,0,1.32), (_s*.86,0,1.1), f'forearm.{_suffix}'),
        (f'thigh.{_suffix}', (_s*.26,0,1.3), (_s*.27,0,.72), 'hips'),
        (f'shin.{_suffix}', (_s*.27,0,.72), (_s*.27,0,.22), f'thigh.{_suffix}'),
        (f'foot.{_suffix}', (_s*.27,0,.22), (_s*.27,-.42,.1), f'shin.{_suffix}'),
    ]

def make_armature(name):
    data = bpy.data.armatures.new(name + 'Rig'); arm = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for bname, h, t, parent in BONES:
        b = data.edit_bones.new(bname); b.head = h; b.tail = t
        if parent: b.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm

def interp_weights(z, stops):
    if z >= stops[0][0]: return dict(stops[0][1])
    if z <= stops[-1][0]: return dict(stops[-1][1])
    for (z0, w0), (z1, w1) in zip(stops, stops[1:]):
        if z1 <= z <= z0:
            t = (z0 - z) / (z0 - z1); t = t*t*(3-2*t); out = {}
            for k in set(w0) | set(w1): out[k] = w0.get(k, 0)*(1-t) + w1.get(k, 0)*t
            return out

TORSO = [(2.5, {'neck': 1}), (2.38, {'chest': 1}), (2.0, {'chest': 1}), (1.88, {'chest': .5, 'spine': .5}), (1.62, {'spine': 1}), (1.5, {'spine': .5, 'hips': .5}), (1.35, {'hips': 1}), (0.0, {'hips': 1})]

class Skin:
    """Binds mesh objects to the armature; remembers head objects so the head can be scaled afterwards."""
    def __init__(self, arm): self.arm = arm; self.head_objs = []
    def bind(self, o, fn):
        for v in o.data.vertices:
            for name, val in fn(v.co).items():
                if val > .001:
                    g = o.vertex_groups.get(name) or o.vertex_groups.new(name=name); g.add([v.index], val, 'REPLACE')
        o.parent = self.arm
        md = o.modifiers.new('Armature', 'ARMATURE'); md.object = self.arm
    def rigid(self, o, bone):
        if bone == 'head': self.head_objs.append(o)
        self.bind(o, lambda co: {bone: 1.0})
    def zstops(self, o, stops): self.bind(o, lambda co: interp_weights(co.z, stops))
