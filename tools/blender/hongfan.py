import sys, math, random, os
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
from lib import *

# ---- Hongfan (红帆): an original pirate swordsman. Z up, faces -Y (exports to glTF +Z). Units match the game (feet at 0, hips 1.3). ----
reset()
M = {k: mat(k, c, r) for k, (c, r) in {
    'skin': ('#f2c08f', .7), 'shirt': ('#f7ecd0', .9), 'jacket': ('#d4462f', .85), 'pants': ('#262c42', .9),
    'boots': ('#7a2820', .7), 'gold': ('#ffd24a', .4), 'hair': ('#1d1d2a', .6), 'band': ('#d4462f', .8),
    'white': ('#ffffff', .4), 'black': ('#111118', .4), 'mouth': ('#6b1d22', .6), 'belt': ('#4a2f1c', .8),
    'steel': ('#dfe6ee', .3), 'brow': ('#15151d', .7), 'sole': ('#2a1a14', .9)}.items()}

# ---------------- armature ----------------
BONES = [
    ('root', (0,0,0), (0,0,.25), None),
    ('hips', (0,0,1.3), (0,0,1.5), 'root'),
    ('spine', (0,0,1.5), (0,0,1.95), 'hips'),
    ('chest', (0,0,1.95), (0,0,2.4), 'spine'),
    ('neck', (0,0,2.4), (0,0,2.7), 'chest'),
    ('head', (0,0,2.7), (0,0,3.6), 'neck'),
]
for suffix, s in (('L', 1), ('R', -1)):
    BONES += [
        (f'upper_arm.{suffix}', (s*.66,0,2.3), (s*.78,0,1.8), 'chest'),
        (f'forearm.{suffix}', (s*.78,0,1.8), (s*.84,0,1.32), f'upper_arm.{suffix}'),
        (f'hand.{suffix}', (s*.84,0,1.32), (s*.86,0,1.1), f'forearm.{suffix}'),
        (f'thigh.{suffix}', (s*.26,0,1.3), (s*.27,0,.72), 'hips'),
        (f'shin.{suffix}', (s*.27,0,.72), (s*.27,0,.22), f'thigh.{suffix}'),
        (f'foot.{suffix}', (s*.27,0,.22), (s*.27,-.42,.1), f'shin.{suffix}'),
    ]
arm_data = bpy.data.armatures.new('Rig'); arm = bpy.data.objects.new('Hongfan', arm_data)
bpy.context.collection.objects.link(arm); bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for name, h, t, parent in BONES:
    b = arm_data.edit_bones.new(name); b.head = h; b.tail = t
    if parent: b.parent = arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')

def interp_weights(z, stops):
    """stops: [(z, {bone: w}), ...] ordered by descending z -> blended weights at height z."""
    if z >= stops[0][0]: return dict(stops[0][1])
    if z <= stops[-1][0]: return dict(stops[-1][1])
    for (z0, w0), (z1, w1) in zip(stops, stops[1:]):
        if z1 <= z <= z0:
            t = (z0 - z) / (z0 - z1); t = t*t*(3-2*t); out = {}
            for k in set(w0) | set(w1): out[k] = w0.get(k, 0)*(1-t) + w1.get(k, 0)*t
            return out

def bind(o, fn):
    """fn(co) -> {bone: weight}. Parent the object to the armature with a modifier."""
    for v in o.data.vertices:
        w = fn(v.co)
        for name, val in w.items():
            if val > .001:
                g = o.vertex_groups.get(name) or o.vertex_groups.new(name=name)
                g.add([v.index], val, 'REPLACE')
    o.parent = arm
    md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm

HEAD_OBJS=[]
def rigid(o, bone):
    if bone=='head': HEAD_OBJS.append(o)
    bind(o, lambda co: {bone: 1.0})

TORSO = [(2.5, {'neck': 1}), (2.38, {'chest': 1}), (2.0, {'chest': 1}), (1.88, {'chest': .5, 'spine': .5}), (1.62, {'spine': 1}), (1.5, {'spine': .5, 'hips': .5}), (1.35, {'hips': 1}), (0.0, {'hips': 1})]
def side_stops(suffix, upper, lower, hand=None):
    return None

# ---------------- body parts ----------------
parts = []
# shirt + jacket
shirt = loft([(1.2,.4,.28,0,0),(1.5,.35,.25,0,0),(1.95,.47,.3,0,0),(2.3,.58,.28,0,0),(2.46,.22,.2,0,0)], 24)
o = obj_from_bm('shirt', shirt, M['shirt'], subsurf=1); bind(o, lambda co: interp_weights(co.z, TORSO))
jr = [(.98,.54,.38,0,0),(1.3,.47,.33,0,0),(1.65,.42,.3,0,0),(2.0,.55,.34,0,0),(2.3,.67,.33,0,0),(2.44,.34,.26,0,0)]
jb = loft(jr, 28, cap_top=False, cap_bottom=False)
import bmesh as _bm
dele = [f for f in jb.faces if f.calc_center_median().y < -.05 and abs(f.calc_center_median().x) < (.1 + (f.calc_center_median().z-1.0)*.05)]
_bm.ops.delete(jb, geom=dele, context='FACES')
o = obj_from_bm('jacket', jb, M['jacket'], subsurf=1)
md = o.modifiers.new('solid', 'SOLIDIFY'); md.thickness = .03; md.offset = 1
bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid')
bind(o, lambda co: interp_weights(co.z, TORSO))
# collar
col = tube([((0,0,2.42),.0),((0,0,2.42),.0)], 4) if False else None
collar = loft([(2.42,.3,.25,0,0),(2.58,.27,.22,0,0)], 20, cap_top=False, cap_bottom=False)
o = obj_from_bm('collar', collar, M['jacket'], subsurf=0)
md = o.modifiers.new('solid', 'SOLIDIFY'); md.thickness = .04; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid')
bind(o, lambda co: {'neck': .5, 'chest': .5})
# pelvis / trousers
pel = loft([(.95,.46,.32,0,0),(1.3,.44,.3,0,0),(1.5,.4,.28,0,0)], 24)
o = obj_from_bm('pelvis', pel, M['pants'], subsurf=1); rigid(o, 'hips')
# belt
belt = loft([(1.38,.455,.315,0,0),(1.5,.425,.29,0,0)], 24, cap_top=False, cap_bottom=False)
o = obj_from_bm('belt', belt, M['belt'], subsurf=0)
md = o.modifiers.new('solid', 'SOLIDIFY'); md.thickness = .05; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid')
rigid(o, 'hips')
o = obj_from_bm('buckle', box_bm((.2,.04,.16), (0,-.33,1.44)), M['gold'], smooth=False); rigid(o, 'hips')

# arms: red sleeves down to the wrist, skin hands with fists
for suffix, s in (('L', 1), ('R', -1)):
    UA, FA, HA = f'upper_arm.{suffix}', f'forearm.{suffix}', f'hand.{suffix}'
    stops = [(2.45, {'chest': .6, UA: .4}), (2.2, {UA: 1}), (1.95, {UA: 1}), (1.72, {UA: .5, FA: .5}), (1.55, {FA: 1}), (1.42, {FA: 1}), (1.32, {FA: .5, HA: .5})]
    sleeve = tube([((s*.64,0,2.34),.22,(1,.95)), ((s*.7,0,2.1),.2,(1,.95)), ((s*.76,0,1.82),.17), ((s*.8,0,1.6),.16), ((s*.84,0,1.38),.15), ((s*.845,0,1.34),.19)], 14)
    o = obj_from_bm(f'sleeve.{suffix}', sleeve, M['jacket'], subsurf=1); bind(o, lambda co, st=stops: interp_weights(co.z, st))
    cuff = tube([((s*.84,0,1.44),.185),((s*.845,0,1.33),.19)], 14)
    o = obj_from_bm(f'cuff.{suffix}', cuff, M['shirt'], subsurf=0); rigid(o, FA)
    pad = sphere_bm(.2, (1,1,.6), (s*.66,0,2.4), 14, 10)
    o = obj_from_bm(f'pad.{suffix}', pad, M['gold'], subsurf=0); bind(o, lambda co, UA=UA: {UA: .6, 'chest': .4})
    # hand: palm + four curled fingers + thumb (a fist)
    hx = s*.855; hb = []
    hb.append(sphere_bm(.13, (1,.95,1.05), (hx,-.02,1.2), 12, 9))
    for i in range(4):
        hb.append(sphere_bm(.058, (1,1,1.05), (hx+(i-1.5)*.052*(1 if s>0 else 1), -.12, 1.15-(.0 if i in (1,2) else .02)), 8, 6))
        hb.append(sphere_bm(.05, (1,1,1), (hx+(i-1.5)*.052, -.1, 1.07), 8, 6))
    hb.append(sphere_bm(.055, (1,1,1.2), (hx - s*.1, -.1, 1.2), 8, 6))
    o = obj_from_bm(f'hand.{suffix}', merge(hb), M['skin'], subsurf=0); rigid(o, HA)

# legs: trousers, boots with gold cuffs
for suffix, s in (('L', 1), ('R', -1)):
    TH, SH, FT = f'thigh.{suffix}', f'shin.{suffix}', f'foot.{suffix}'
    stops = [(1.4, {'hips': 1}), (1.25, {'hips': .4, TH: .6}), (1.1, {TH: 1}), (.86, {TH: 1}), (.6, {SH: 1}), (.3, {SH: 1}), (.18, {SH: .5, FT: .5}), (.1, {FT: 1})]
    leg = tube([((s*.26,0,1.34),.27), ((s*.265,-.01,1.0),.235), ((s*.27,-.02,.74),.2), ((s*.27,0,.5),.185)], 14)
    o = obj_from_bm(f'trouser.{suffix}', leg, M['pants'], subsurf=1); bind(o, lambda co, st=stops: interp_weights(co.z, st))
    boot = tube([((s*.27,0,.5),.2), ((s*.27,0,.34),.185), ((s*.27,0,.17),.2)], 14)
    o = obj_from_bm(f'boot.{suffix}', boot, M['boots'], subsurf=1); bind(o, lambda co, st=stops: interp_weights(co.z, st))
    cuff = tube([((s*.27,0,.56),.215), ((s*.27,0,.47),.205)], 14)
    o = obj_from_bm(f'bootcuff.{suffix}', cuff, M['gold'], subsurf=0); rigid(o, SH)
    foot = merge([sphere_bm(.2, (1,1.35,.62), (s*.27,-.14,.15), 14, 9), sphere_bm(.18, (1,1.1,.7), (s*.27,-.34,.13), 12, 8)])
    o = obj_from_bm(f'foot.{suffix}', foot, M['boots'], subsurf=0); rigid(o, FT)
    sole = box_bm((.36,.7,.06), (s*.27,-.2,.03)); o = obj_from_bm(f'sole.{suffix}', sole, M['sole'], smooth=False, subsurf=0); rigid(o, FT)

# ---------------- head ----------------
HC = Vector((0,-.02,3.22))
hd = sphere_bm(.5, (1.0,.97,1.03), tuple(HC), 28, 20)
for v in hd.verts:
    dz = (HC.z - .08) - v.co.z
    if dz > 0:
        t = min(1, dz/.5); t = t*t*(3-2*t)
        v.co.x *= 1 - .36*t; v.co.y = HC.y + (v.co.y-HC.y)*(1 - .1*t) - .05*t*(1 if v.co.y < HC.y else 0)
o = obj_from_bm('head', hd, M['skin'], subsurf=1); rigid(o, 'head')
neck = tube([((0,0,2.42),.17),((0,0,2.8),.16)], 12); o = obj_from_bm('neck', neck, M['skin'], subsurf=1); rigid(o, 'neck')
for s in (1, -1):
    o = obj_from_bm('ear', sphere_bm(.09, (.55,.8,1), (s*.49,0,3.2), 8, 6), M['skin'], subsurf=0); rigid(o, 'head')
    # eyes: big whites with dark pupils and a catch-light, like the reference faces
    o = obj_from_bm('eyewhite', sphere_bm(.15, (1,.3,1.2), (s*.2,-.425,3.24), 14, 10), M['white'], subsurf=0); rigid(o, 'head')
    o = obj_from_bm('pupil', sphere_bm(.078, (1,.35,1.4), (s*.2+(-s)*.012,-.455,3.235), 10, 8), M['black'], subsurf=0); rigid(o, 'head')
    o = obj_from_bm('shine', sphere_bm(.03, (1,.5,1), (s*.2+s*.025,-.49,3.29), 6, 5), M['white'], subsurf=0); rigid(o, 'head')
    # thick angry brows
    o = obj_from_bm('brow', box_bm((.27,.045,.07), (s*.2,-.4,3.47), (0,s*.34,0)), M['brow'], subsurf=1); rigid(o, 'head')
o = obj_from_bm('nose', sphere_bm(.05, (1,.9,1.2), (0,-.49,3.08), 8, 6), M['skin'], subsurf=0); rigid(o, 'head')
# wide grin: dark mouth with a row of teeth
mouth = sphere_bm(.2, (1,.32,.5), (0,-.4,2.89), 16, 10)
for v in list(mouth.verts):
    if v.co.z > 2.89: v.co.z = 2.89 + (v.co.z-2.89)*.35
o = obj_from_bm('mouth', mouth, M['mouth'], subsurf=0); rigid(o, 'head')
o = obj_from_bm('teeth', box_bm((.25,.02,.04), (0,-.455,2.93)), M['white'], smooth=False, subsurf=0); rigid(o, 'head')

# ---------------- hair: black swept-back spikes, a few falling over the forehead, red headband ----------------
cap = sphere_bm(.545, (1.03,1.02,1.06), (0,.05,3.26), 24, 16)
bmesh.ops.delete(cap, geom=[v for v in cap.verts if not (v.co.z > 3.4 or (v.co.y > -.1 and v.co.z > 2.95) or (abs(v.co.x) > .33 and v.co.y > -.32 and v.co.z > 3.02))], context='VERTS')
o = obj_from_bm('hair', cap, M['hair'], subsurf=1); rigid(o, 'head')
spikes = []
rnd = random.Random(7)
for i in range(15):
    a = (i/15)*math.tau + rnd.uniform(-.12,.12); ring = rnd.choice([.3,.4,.5]); 
    bx = math.cos(a)*(.18+ring*.34); by = .05 + math.sin(a)*(.2+ring*.3); bz = 3.5+ (1-ring)*.12
    tip = Vector((bx*1.55, by*1.25 + .28, bz + .46 + rnd.uniform(0,.22) + (.1 if ring<.4 else 0)))
    spikes.append(cone_bm((bx,by,bz-.12), tip, .15, 7))
for i in range(6):   # side / back
    a = math.radians(95 + i*34); bx = math.cos(a)*.5; by = .1+math.sin(a)*.1+.05; bz = 3.2 - (i%3)*.12
    spikes.append(cone_bm((bx,by,bz), (bx*1.5, by+.42, bz-.1-(i%2)*.1), .13, 7))
for i, x in enumerate((-.34,-.17,.0,.17,.34)):   # fringe over the brow
    spikes.append(cone_bm((x,-.34,3.7), (x*1.25,-.5, 3.43 - abs(x)*.25 - (.05 if i%2 else 0)), .1, 6))
o = obj_from_bm('spikes', merge(spikes), M['hair'], subsurf=0); rigid(o, 'head')
band = bpy.data.objects  # headband: a flat ring slightly tilted back
tor = bmesh.new(); bmesh.ops.create_circle(tor, cap_ends=False, radius=1, segments=36)
rb = bmesh.new(); 
rows = []
for k, (zz, rr) in enumerate(((3.44,.535),(3.55,.535))):
    rows.append([rb.verts.new((math.cos(i/36*math.tau)*rr*1.02, .03+math.sin(i/36*math.tau)*rr*.99, zz + (math.sin(i/36*math.tau)*-.04))) for i in range(36)])
for i in range(36): rb.faces.new((rows[0][i], rows[0][(i+1)%36], rows[1][(i+1)%36], rows[1][i]))
tor.free()
o = obj_from_bm('headband', rb, M['band'], subsurf=0)
md = o.modifiers.new('solid','SOLIDIFY'); md.thickness = .03; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid'); rigid(o, 'head')
tails = merge([box_bm((.08,.03,.3), (-.07,.62,3.38), (.3,0,.2)), box_bm((.08,.03,.26), (.09,.64,3.36), (.25,0,-.25))])
o = obj_from_bm('bandtails', tails, M['band'], smooth=False, subsurf=0); rigid(o, 'head')

# ---------------- sword (right hand) ----------------
sw = merge([box_bm((.07,.03,1.35), (0,0,.78)), cone_bm((0,0,1.45), (0,0,1.72), .05, 4), box_bm((.4,.08,.07), (0,0,.1)), box_bm((.06,.06,.3), (0,0,-.08)), sphere_bm(.07, (1,1,1), (0,0,-.24), 8, 6)])
o = obj_from_bm('Sword', sw, M['steel'], smooth=False, subsurf=0)
o.location = (-.855,-.04,1.2); o.rotation_euler = (math.radians(88),0,math.radians(-45))
bpy.context.view_layer.objects.active = o; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
rigid(o, 'hand.R')

P = Vector((0,-.02,2.85)); K = 1.2
for ho in HEAD_OBJS:
    for v in ho.data.vertices: v.co = P + (v.co - P) * K
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'hongfan_rig.blend'))
print('built', len(bpy.data.objects), 'objects')
