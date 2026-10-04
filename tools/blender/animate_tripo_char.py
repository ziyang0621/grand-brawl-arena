"""Bake game animations onto any rigged Tripo character (brawler, guardian, gunner, cook, stormcaller).

Run: Blender -b --factory-startup --python tools/blender/animate_tripo_char.py -- <character id> [--no-face]

The poses are written in the proportions of the pirate rig (leg .443, arm .25, standing hip at its rest
height). `tripo_rig.measure()` gives this character's leg and arm ratios and every length is scaled by them:
hands by the arm ratio, feet / pelvis / stride by the leg ratio. Angles are unchanged.
Bones are found by structure (tripo_rig.discover), never by name.
"""
from pathlib import Path
import glob
import json
import math
import sys
import bpy
from mathutils import Vector, Quaternion, Matrix

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/blender'))
import tripo_rig
from tripo_specs import SPECS

CID = sys.argv[sys.argv.index('--') + 1]
SPEC = SPECS[CID]
NO_FACE = '--no-face' in sys.argv
SOURCE = sorted(glob.glob(str(ROOT / SPEC['source'])))[-1]
OUTPUT = ROOT / ('models/tripo-%s-animated.glb' % CID)
BLEND = ROOT / ('models/tripo-%s-animated.blend' % CID)
META = ROOT / ('models/tripo-%s-animated.json' % CID)
STYLE = SPEC['style']

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body_mesh = max((o for o in bpy.context.scene.objects if o.type == 'MESH' and o.data.vertices), key=lambda o: len(o.data.vertices))
rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
pb = arm.pose.bones
for b in pb:
    b.rotation_mode = 'QUATERNION'
arm.animation_data_create()
bpy.context.scene.render.fps = 24

RIG = tripo_rig.discover(arm)
M = tripo_rig.measure(RIG)
SL, SA = M['leg_scale'], M['arm_scale']
RIGHT, LEFT = RIG['Right'], RIG['Left']
ROOT_BONE = RIG['root'].name
UP = Vector((0, 0, 1))
TOE_OUT = 8                                  # degrees the boots may point outward once straightened
PIRATE_FOOT = Vector((-.19, .105, -.4191))   # the pirate's standing-foot baseline, the origin of the foot offsets below
PIRATE_HIP_Y = .057
PIRATE_STAND = .02
HAS_WEAPON = SPEC['weapon'] is not None
READY_AXIS = Vector((.68, -.12, .73)).normalized()
HOLD_AXIS = [READY_AXIS.copy()]   # where this character's weapon points in the idle pose; set after the first pose
print('CHARACTER', CID, 'style', STYLE, 'leg x%.2f arm x%.2f' % (SL, SA), 'stand %.3f' % M['stand'], 'foot out %.0f' % M['foot_out_deg'])


def update():
    bpy.context.view_layer.update()


def smooth(x):
    return x * x * (3 - 2 * x)


def orient(name, q):
    b = pb[name]
    b.matrix = Matrix.Translation(b.head) @ q.to_matrix().to_4x4()
    update()


def point(name, direction):
    basis = rest[name].to_quaternion()
    old = basis @ Vector((0, 1, 0))
    orient(name, old.rotation_difference(direction.normalized()) @ basis)


def limb(upper, lower, target, pole):
    """Two-bone IK in armature space, with an explicit bend direction (knees forward, elbows back/out)."""
    a, b = pb[upper.name], pb[lower.name]
    start = a.head.copy()
    v = target - start
    d = min(max(v.length, abs(a.length - b.length) + .0001), a.length + b.length - .0001)
    axis = v.normalized()
    bend = Vector(pole) - axis * Vector(pole).dot(axis)
    bend.normalize()
    along = (a.length * a.length - b.length * b.length + d * d) / (2 * d)
    elbow = start + axis * along + bend * math.sqrt(max(0, a.length * a.length - along * along))
    end = start + axis * d
    point(a.name, elbow - start)
    point(b.name, end - pb[b.name].head)


def cr(keys, t):
    """Catmull-Rom through (time, value) keys; floats or vectors. Zero velocity at the ends."""
    vals = [v if isinstance(v, (int, float)) else Vector(v) for _, v in keys]
    ts = [k for k, _ in keys]
    n = len(keys)
    t = min(max(t, ts[0]), ts[-1])
    i = 0
    while i < n - 2 and t > ts[i + 1]:
        i += 1
    h = ts[i + 1] - ts[i]
    u = (t - ts[i]) / h

    def tangent(j):
        if j == 0 or j == n - 1:
            return vals[j] * 0
        return (vals[j + 1] - vals[j - 1]) * (1 / (ts[j + 1] - ts[j - 1]))
    p0, p1 = vals[i], vals[i + 1]
    m0, m1 = tangent(i) * h, tangent(i + 1) * h
    u2, u3 = u * u, u * u * u
    return p0 * (2 * u3 - 3 * u2 + 1) + m0 * (u3 - 2 * u2 + u) + p1 * (-2 * u3 + 3 * u2) + m1 * (u3 - u2)


def keys(T, vals):
    return list(zip(T, vals))


# ---------------------------------------------------------------- hands: re-skin by distance to the finger bones
FINGER_REACH, FINGER_TIP, FINGER_SOFT = .05 * SA, .7, .0065 * SA   # tuned on the pirate's hand; scale by this character's arm size
FINGER_CURL = (18, 28)


def rebind_hands():
    """The scan's automatic hand weights tear fingers apart when the wrist turns. Re-skin each hand vertex by its
    distance to the finger bone segments, so fingers move rigidly and the webbing between them blends."""
    ob = body_mesh
    toarm = arm.matrix_world.inverted() @ ob.matrix_world
    pos = {v.index: toarm @ v.co for v in ob.data.vertices}

    def seg_dist(p, a, b):
        ab = b - a
        t = max(0, min(1, (p - a).dot(ab) / ab.length_squared))
        return (p - (a + ab * t)).length
    total = 0
    skipped = {'far': 0, 'share': 0}
    for side in (RIGHT, LEFT):
        wrist = side['wrist']
        fingers = list(wrist.children_recursive)
        names = {b.name for b in fingers} | {wrist.name}
        knuckles = [b.head_local for b in wrist.children]
        palm = sum(knuckles, Vector()) / len(knuckles)
        finger_dir = (palm - wrist.head_local).normalized()
        segs = [(b.name, b.head_local.copy(), b.tail_local + (b.tail_local - b.head_local) * (FINGER_TIP if not b.children else 0)) for b in fingers]
        segs.append((wrist.name, wrist.head_local.copy(), palm))
        groups = {g.name: g for g in ob.vertex_groups}
        for v in ob.data.vertices:
            p = pos[v.index]
            if (p - wrist.head_local).length > .2:
                skipped['far'] += 1
                continue
            old = {ob.vertex_groups[g.group].name: g.weight for g in v.groups}
            hand_share = sum(w for n, w in old.items() if n in names)
            # Past the wrist, in the direction the fingers point, a vertex is hand even if the scan gave most of its
            # weight to the forearm or a helper bone; before the wrist, only a clear majority counts.
            beyond = (p - wrist.head_local).dot(finger_dir) > .004 * SA
            if hand_share < (.15 if beyond else .5):
                if (p - wrist.head_local).length < .12:
                    skipped['share'] += 1
                continue
            # (an earlier version also required the vertex to be within FINGER_REACH of a finger bone; on a character
            # whose fingers are thicker than the pirate's that skipped fingertips that still carried a toe's weight)
            ds = [(seg_dist(p, a, b), n) for n, a, b in segs]
            dmin = min(d for d, _ in ds)
            raw = {n: math.exp(-(d - dmin) / FINGER_SOFT) for d, n in ds}
            norm = sum(raw.values())
            # A hand vertex may carry a few percent of an unrelated bone (a toe, the spine). Whatever it held outside the
            # hand is dropped and the weight is renormalised onto the hand bones, or it would follow that bone.
            for g in list(v.groups):
                ob.vertex_groups[g.group].remove([v.index])
            hand_share = 1.0
            for n, w in raw.items():
                w = w / norm * hand_share
                if w > .02:
                    (groups.get(n) or ob.vertex_groups.new(name=n)).add([v.index], w, 'REPLACE')
            total += 1
    print('REBOUND hand vertices', total, 'skipped near the wrist for low hand share:', skipped['share'])
    assert total > 300, 'hand vertices not found; inspect the rig before rebinding'


rebind_hands()


def purge_far_limb_weights(reach=.09):
    """The scan's automatic skinning leaves small weights from a limb bone on vertices far away from it: the right toe bone drives the
    left foot and the fingertips of the right fist, which shows as a long shard when that toe moves. Drop an influence from a leg or
    arm bone when the vertex is farther than `reach` from that bone's segment (rest pose), then renormalise."""
    ob = body_mesh
    limb = set()
    for side in (RIGHT, LEFT):
        for key in ('thigh', 'shin', 'foot', 'upper', 'fore', 'wrist'):
            limb.add(side[key].name)
        limb |= {b.name for b in side['wrist'].children_recursive}
        limb |= {b.name for b in side['foot'].children_recursive}
    seg = {}
    for b in arm.data.bones:
        if b.name in limb or not b.name.startswith('Root'):
            seg[b.name] = (b.head_local.copy(), b.tail_local.copy())
    far = {n: (reach if n in limb else .3) for n in seg}      # hair strands and trims may hang well away from their bone; limbs may not
    allseg = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm.data.bones if not b.name.startswith('Root')}
    groups = {g.index: g.name for g in ob.vertex_groups}
    pos = {v.index: arm.matrix_world.inverted() @ ob.matrix_world @ v.co for v in ob.data.vertices}

    def dist(p, a, b):
        ab = b - a
        t = max(0, min(1, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
        return (p - (a + ab * t)).length
    removed = 0
    for v in ob.data.vertices:
        infl = [(groups[g.group], g.weight) for g in v.groups]
        keep = [(n, w) for n, w in infl if n not in seg or dist(pos[v.index], *seg[n]) <= far[n]]
        if not keep:
            # Every influence is a far limb bone (a boot sole skinned 100% to a hand): hand the vertex to the nearest bone of the body.
            near = min(allseg, key=lambda n: dist(pos[v.index], *allseg[n]))
            for n, _ in infl:
                ob.vertex_groups[n].remove([v.index])
            (ob.vertex_groups.get(near) or ob.vertex_groups.new(name=near)).add([v.index], 1.0, 'REPLACE')
            removed += len(infl)
            continue
        if len(keep) == len(infl):
            continue
        total = sum(w for _, w in keep)
        drop = [n for n, _ in infl if n not in {k for k, _ in keep}]
        for n in drop:
            ob.vertex_groups[n].remove([v.index])
        for n, w in keep:
            ob.vertex_groups[n].add([v.index], w / total * sum(w2 for _, w2 in infl), 'REPLACE')
        removed += len(drop)
    print('PURGED far limb weights', removed)


purge_far_limb_weights()


def merge_weights():
    """Fold a helper bone's weights into a leg bone (spec 'merge_weights'), e.g. the gunner's holster into the left thigh."""
    ob = body_mesh
    for helper, (side, key) in SPEC.get('merge_weights', {}).items():
        target = (RIGHT if side == 'Right' else LEFT)[key].name
        if helper not in ob.vertex_groups:
            continue
        src = ob.vertex_groups[helper]
        dst = ob.vertex_groups.get(target) or ob.vertex_groups.new(name=target)
        moved = 0
        for v in ob.data.vertices:
            for g in v.groups:
                if g.group == src.index and g.weight > 0:
                    w = g.weight
                    old = next((x.weight for x in v.groups if x.group == dst.index), 0.0)
                    dst.add([v.index], min(1.0, old + w), 'REPLACE')
                    src.remove([v.index])
                    moved += 1
                    break
        print('MERGED', helper, '->', target, moved)


merge_weights()


def heal_tears(max_stretch=3.0, passes=6):
    """Tripo's automatic weights sometimes bind a vertex to a bone on the far side of a seam: a long hair strand's last
    bone dragging the shoulder, a hip pouch following the thigh. Pose the rig at its extremes, find every edge that is
    stretched beyond `max_stretch` x, and give the vertices at both ends the average weights of their un-stretched
    neighbours. Repeats because healing one ring exposes the next."""
    ob = body_mesh
    me = ob.data
    names = {g.index: g.name for g in ob.vertex_groups}
    groups = {g.name: g for g in ob.vertex_groups}
    adjacency = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)

    def positions():
        ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
        m = ev.to_mesh()
        p = [v.co.copy() for v in m.vertices]
        ev.to_mesh_clear()
        return p
    arm.data.pose_position = 'REST'
    update()
    rest_p = positions()
    arm.data.pose_position = 'POSE'
    probe = [('walk', 6), ('walk', 18), ('attack_a', 9), ('heavy', 9), ('guard', 8), ('hurt', 4), ('skill', 16), ('carry', 6)]
    healed_total = 0
    for _ in range(passes):
        torn = set()
        for clip, frame in probe:
            if clip not in bpy.data.actions:
                continue
            arm.animation_data.action = bpy.data.actions[clip]
            bpy.context.scene.frame_set(frame)
            update()
            cur = positions()
            for e in me.edges:
                a, b = e.vertices
                r0 = (rest_p[a] - rest_p[b]).length
                if r0 > .008 and (cur[a] - cur[b]).length / r0 > max_stretch:
                    torn.update((a, b))
        if not torn:
            break
        weights = {i: {names[g.group]: g.weight for g in me.vertices[i].groups} for i in torn}
        for i in torn:
            ok = [j for j in adjacency[i] if j not in torn]
            if not ok:
                continue
            blend = {}
            for j in ok:
                for g in me.vertices[j].groups:
                    blend[names[g.group]] = blend.get(names[g.group], 0) + g.weight / len(ok)
            for g in list(me.vertices[i].groups):
                ob.vertex_groups[g.group].remove([i])
            for n, w in blend.items():
                if w > .02:
                    groups[n].add([i], w, 'REPLACE')
        healed_total += len(torn)
    arm.animation_data.action = None
    print('HEALED stretched vertices', healed_total)

# ---------------------------------------------------------------- the pose vocabulary (pirate units)
SPINE_FRONT = Vector((0, 1, 0))
ATTACK_POWER = {'attack_a': 1, 'attack_b': 1, 'heavy': 1.5, 'dash': 1.15, 'shoot': .6, 'grab': .8}
hand_ready = {}
TORSO_LOW, TORSO_HIGH = RIG['torso'][0], RIG['torso'][-1]
HEAD_TURN = RIG['head_turn']
HAS_FOOT = M['has_foot']
FOOT_TOE_IN = max(0, M['foot_out_deg'] - TOE_OUT) if HAS_FOOT else 0   # without a foot bone there is nothing to toe in


def arm_pose(name, t, p):
    """Hand targets relative to the shoulder (pirate units) and the weapon axis, per clip. Returns right, left, axis."""
    right, left, axis = Vector((.145, .025, -.155)), Vector((.075, -.035, -.19)), READY_AXIS.copy()
    if STYLE == 'fist':
        right, left = Vector((.10, .045, -.035)), Vector((.12, -.05, -.015))   # fists held up, a boxer's ready stance
    elif STYLE == 'kick':
        right, left = Vector((.04, .08, -.23)), Vector((.04, -.08, -.23))      # hands in the pockets
    return right, left, axis


def pose(name, t):
    for b in pb:
        b.matrix_basis.identity()
    phase = t * math.tau
    body = dict(yaw=0, lean=0, roll=0, dx=0, dy=0, dz=PIRATE_STAND, head_yaw=0, head_pitch=0)
    right, left, axis = arm_pose(name, t, 1)
    feet = [Vector((PIRATE_FOOT.x, PIRATE_FOOT.y, PIRATE_FOOT.z)), Vector((PIRATE_FOOT.x, -PIRATE_FOOT.y, PIRATE_FOOT.z))]
    if name in ('walk', 'run', 'carry_walk'):
        feet[0].y, feet[1].y = .085, -.085           # feet nearly under the hips: no waddle
    if name == 'idle':
        body.update(lean=1.6 * math.sin(phase), roll=2.2 * math.sin(phase), dy=.012 * math.sin(phase),
                    dz=PIRATE_STAND + .004 * math.sin(2 * phase), yaw=2.5 * math.sin(phase), head_yaw=-3 * math.sin(phase), head_pitch=1.5 * math.sin(2 * phase))
        right.z += .012 * math.sin(phase); right.x += .006 * math.sin(2 * phase)
        left.z += .014 * math.sin(phase); left.x -= .008 * math.sin(phase)
    elif name in ('walk', 'run', 'carry_walk'):
        running = name == 'run'
        amplitude, duty = (.23, .48) if running else (.18, .6)
        for i in range(2):
            u = (t + i * .5) % 1
            if u < duty:
                feet[i].x += amplitude * (1 - 2 * u / duty)
            else:
                swing = (u - duty) / (1 - duty)
                feet[i].x += amplitude * (-1 + 2 * smooth(swing))
                feet[i].z += math.sin(math.pi * swing) * (.12 if running else .095)
        mid, contact = (.016, -.035) if running else (.02, -.01)
        body.update(dz=(mid + contact) / 2 - (mid - contact) / 2 * math.cos(4 * math.pi * t),
                    dy=(.012 if running else .006) * math.sin(phase),
                    lean=14 if running else 9, yaw=(14 if running else 11) * math.cos(phase),
                    roll=(2 if running else 1) * math.sin(phase), head_yaw=-(8 if running else 6) * math.cos(phase))
        body['dx'] = (.045 if running else .03) * math.cos(4 * math.pi * t)
        left = Vector((.10, -.075, -.135))
        left.x += math.cos(phase) * (.13 if running else .10)
        left.z += math.cos(phase) * (.05 if running else .035)
        swing_r = .06 if not HAS_WEAPON else .0   # bare hands pump as hard as the off hand
        right = Vector((.145, .025, -.155)) if HAS_WEAPON else Vector((.10, .075, -.135))
        right.x -= math.cos(phase) * (.06 if running else .04) if HAS_WEAPON else -math.cos(phase) * (.13 if running else .10) * -1
        right.z += math.cos(phase) * (.02 if running else .012) if HAS_WEAPON else math.cos(phase) * (-.05 if running else -.035)
        if STYLE == 'kick':
            left = Vector((.04, -.08, -.23)); right = Vector((.04, .08, -.23))
    elif name in ATTACK_POWER:
        right, left, axis = melee(name, t, body, feet, right, left, axis)
    elif name == 'skill':
        right, left, axis = skill(name, t, body, feet, right, left, axis)
    elif name == 'guard':
        right, left = guard_hands(right, left)
        axis = Vector((.12, .4, .9)).normalized()
        body.update(dz=-.06, lean=7, yaw=10, head_yaw=-6)
    elif name == 'carry':
        right, left, axis = Vector((.0, .07, .245)), Vector((.0, -.07, .245)), Vector((.0, .6, .8)).normalized()
        body.update(lean=-4, dz=PIRATE_STAND - .012, head_pitch=3)
        feet[0].y, feet[1].y = .1, -.1
    elif name == 'jump':
        T = [0, .2, .5, 1]
        body.update(dz=cr(keys(T, [-.03, .01, .0, .0]), t), lean=cr(keys(T, [9, -4, 5, 8]), t), head_pitch=cr(keys(T, [0, 4, 2, 0]), t))
        right = cr(keys(T, [right, (.02, .09, .07), (.07, .14, .03), (.07, .15, .02)]), t)
        left = cr(keys(T, [left, (.03, -.12, .07), (.07, -.15, .04), (.07, -.16, .03)]), t)
        lift = max(0, cr([(0, 0), (.2, 0), (.5, .09), (1, .11)], t))
        feet[0].z += lift; feet[0].x += .07 * min(1, lift / .09)
        feet[1].z += lift * 1.15; feet[1].x -= .05 * min(1, lift / .09)
    elif name == 'fall':
        right = Vector((.07, .13, .03 + .015 * math.sin(phase))); left = Vector((.07, -.14, .03 + .015 * math.sin(phase + 1.6)))
        feet[0].z += .055 + .02 * math.sin(phase); feet[0].x += .04
        feet[1].z += .07 + .02 * math.sin(phase + math.pi); feet[1].x -= .03
        body.update(lean=10 + 2 * math.sin(phase), dz=-.01, head_pitch=2 * math.sin(phase))
    elif name == 'land':
        T = [0, .3, 1]
        body.update(dz=cr(keys(T, [-.075, -.07, PIRATE_STAND]), t), lean=cr(keys(T, [16, 14, 0]), t), head_pitch=cr(keys(T, [-8, -6, 0]), t))
        right = cr(keys(T, [(.08, .13, -.07), (.07, .1, -.1), right]), t)
        left = cr(keys(T, [(.08, -.14, -.07), (.07, -.1, -.1), left]), t)
        wide = cr(keys(T, [1, .8, 0]), t)
        feet[0].y += .03 * wide; feet[1].y -= .03 * wide
    elif name in ('throw', 'toss'):
        T = [0, 4 / 18, 8 / 18, 13 / 18, 1]
        two = name == 'toss'
        if two:
            right = cr(keys(T, [(.0, .07, .245), (-.03, .07, .27), (.19, .06, .15), (.17, .03, -.1), right]), t)
            left = cr(keys(T, [(.0, -.07, .245), (-.03, -.07, .27), (.19, -.06, .15), (.17, -.03, -.1), left]), t)
        else:
            left = cr(keys(T, [left, (-.06, -.13, .1), (.17, -.05, .12), (.14, -.02, -.12), left]), t)
            right = cr(keys(T, [right, (.12, .05, -.12), (.1, .04, -.14), (.13, .03, -.14), right]), t)
        sign = 0 if two else 1
        body.update(yaw=cr(keys(T, [0, -22 * sign, 14 * sign, 10 * sign, 0]), t), lean=cr(keys(T, [0, -8, 15, 9, 0]), t),
                    dz=PIRATE_STAND + cr(keys(T, [0, -.02, -.035, -.02, 0]), t), dx=cr(keys(T, [0, -.03, .09, .07, 0]), t),
                    head_yaw=cr(keys(T, [0, 8 * sign, -6 * sign, -5 * sign, 0]), t))
        feet[0].x += cr(keys(T, [0, 0, .12, .12, 0]), t); feet[1].x += cr(keys(T, [0, 0, -.04, -.04, 0]), t)
        feet[0].z += max(0, cr([(0, 0), (4 / 18, 0), (6 / 18, .05), (8 / 18, 0), (1, 0)], t))
    elif name == 'knock':
        right = Vector((-.04, .15, .12 + .03 * math.sin(phase))); left = Vector((-.05, -.16, .11 + .03 * math.sin(phase + 2)))
        axis = Vector((-.3, .6, .75)).normalized()
        feet[0].z += .09 + .04 * math.sin(phase); feet[0].x += .08 + .05 * math.sin(phase)
        feet[1].z += .06 + .04 * math.sin(phase + math.pi); feet[1].x -= .06 + .05 * math.sin(phase + math.pi)
        body.update(lean=-28 + 4 * math.sin(phase), roll=6 * math.sin(phase * .5), dz=-.02, head_pitch=-16, yaw=8 * math.sin(phase))
    elif name == 'hurt':
        pulse = min(1, t / .35) * (1 - .35 * max(0, (t - .35) / .65))
        right = Vector((.02, .09, -.16)); left = Vector((.015, -.1, -.16))
        body.update(yaw=-14 * pulse, lean=-18 * pulse, roll=7 * pulse, dx=-.07 * pulse, dz=PIRATE_STAND - .03 * pulse, head_pitch=-10 * pulse, head_yaw=8 * pulse)
    if name == 'carry_walk':
        right, left, axis = Vector((.0, .07, .245)), Vector((.0, -.07, .245)), Vector((.0, .6, .8)).normalized()
        body.update(lean=-3, yaw=body['yaw'] * .35, head_yaw=0, roll=body['roll'] * .5)
    if SPEC['weapon'] == 'pistol' and name not in ATTACK_POWER and name not in ('skill', 'guard', 'carry', 'carry_walk', 'throw', 'toss'):
        axis = gun_idle_axis(name, axis)
    apply_pose(body, right, left, axis, feet, name)


def apply_pose(body, right, left, axis, feet, name):
    """Convert pirate-unit targets to this character and pose the skeleton."""
    stand = M['stand'] + .006 * SL
    dz = (body['dz'] - PIRATE_STAND) * SL + stand
    pb[ROOT_BONE].location = rest[ROOT_BONE].to_3x3().inverted() @ Vector((body['dx'] * SL, body['dy'] * SL, dz))
    update()
    total = Quaternion(UP, math.radians(body['yaw'])) @ Quaternion(Vector((1, 0, 0)), math.radians(body['roll'])) @ Quaternion(SPINE_FRONT, math.radians(body['lean']))
    orient(TORSO_LOW.name, Quaternion().slerp(total, .4) @ rest[TORSO_LOW.name].to_quaternion())
    if TORSO_HIGH is not TORSO_LOW:
        orient(TORSO_HIGH.name, total @ rest[TORSO_HIGH.name].to_quaternion())
    head = Quaternion(UP, math.radians(body['yaw'] * .35 + body['head_yaw'])) @ Quaternion(SPINE_FRONT, math.radians(body['lean'] * .4 + body['head_pitch']))
    orient(HEAD_TURN.name, head @ rest[HEAD_TURN.name].to_quaternion())
    for side, foot in zip((RIGHT, LEFT), feet):
        sign = side['sign']
        target = Vector((side['thigh'].head_local.x + (foot.x - PIRATE_FOOT.x) * SL,
                         sign * M['hip_y'] + (foot.y - sign * PIRATE_HIP_Y) * SL,     # signed: a spin kick swings the foot across the body
                         M['ankle_z'] + (foot.z - PIRATE_FOOT.z) * SL))
        limb(side['thigh'], side['shin'], target, (1, 0, .05))
        if HAS_FOOT:
            orient(side['foot'].name, Quaternion(UP, math.radians(FOOT_TOE_IN * -sign)) @ rest[side['foot'].name].to_quaternion())
        else:
            # No foot bone: the last bone is the boot's lower half. Keep it continuing the shin (straight down), not turned.
            shin_dir = (pb[side['shin'].name].tail - pb[side['shin'].name].head).normalized()
            point(side['foot'].name, shin_dir)
    if SPEC['weapon'] == 'staff' and name in ('idle', 'attack_a', 'attack_b', 'heavy', 'dash', 'shoot', 'skill', 'guard', 'grab'):
        left = right + axis * .24 + Vector((0, -.07, 0))      # the off hand rides the staff, a hand-span below the fist
    # Elbow bend direction: out and slightly back by default. The cook's narrow shoulders and long arms flare their elbows with that,
    # so his spec asks for 'back' (see tripo_specs.py); changing it for everyone doubled finger stretch on the others.
    px, py = SPEC.get('elbow_pole', (-.15, 1.0))
    for side, hand, pole in ((RIGHT, right, (px, py, -.2)), (LEFT, left, (px, -py, -.2))):
        limb(side['upper'], side['fore'], pb[side['upper'].name].head + total @ (hand * SA), total @ Vector(pole))
    if HAS_WEAPON:
        wrist = RIGHT['wrist'].name
        if 'ready' not in hand_ready:
            hand_ready['ready'] = pb[wrist].matrix.to_quaternion().copy()
        orient(wrist, HOLD_AXIS[0].rotation_difference(axis) @ hand_ready['ready'])
    # Curl the fingers toward the palm. The thumb is the chain whose root is nearest the wrist; neighbours must
    # curl alike or the webbing tears.
    for side, sign in ((RIGHT, -1), (LEFT, 1)):
        wrist = pb[side['wrist'].name]
        thumb = min(wrist.children, key=lambda c: (c.head - wrist.head).length)
        for b in wrist.children_recursive:
            curl_axis = rest[b.name].to_quaternion().inverted() @ Vector((0, 0, sign))
            top = b
            while top.parent is not None and top.parent.name != wrist.name:
                top = top.parent
            b.rotation_quaternion = Quaternion(curl_axis, math.radians(FINGER_CURL[0] if top == thumb else FINGER_CURL[1]))
    update()


# ---------------------------------------------------------------- style choreography (filled in per style below)
def guard_hands(right, left):
    if STYLE == 'fist':
        return Vector((.09, .045, .085)), Vector((.09, -.045, .095))       # fists covering the chin
    if STYLE == 'kick':
        return Vector((.1, .05, .02)), Vector((.1, -.05, .02))
    return Vector((.15, -.065, -.01)), Vector((.15, .045, -.015))


def melee(name, t, body, feet, right, left, axis):
    return STYLE_MELEE[STYLE](name, t, body, feet, right, left, axis)


def skill(name, t, body, feet, right, left, axis):
    return STYLE_SKILL[STYLE](name, t, body, feet, right, left, axis)


def sword_melee(name, t, body, feet, right, left, axis):
    side = -1 if name == 'attack_b' else 1
    p = ATTACK_POWER[name]
    heavy = name == 'heavy'
    T = [0, .23, .41, .7, 1]
    right0, left0 = Vector((.145, .025, -.155)), Vector((.075, -.035, -.19))
    if heavy:
        right = cr(keys(T, [right0, (.06, .05, .22), (.235, .005, -.03), (.15, -.08, -.17), right0]), t)
        axis = cr(keys(T, [READY_AXIS, (-.4, 0, .92), (1, 0, -.1), (.6, 0, -.65), READY_AXIS]), t).normalized()
    else:
        right = cr(keys(T, [right0, (-.055, .16 * side, .005), (.23, -.025, -.045), (.12, -.165 * side, -.08), right0]), t)
        axis = cr(keys(T, [READY_AXIS, (-.1, .88 * side, .65), (1, -.16 * side, .08), (.1, -1 * side, .3), READY_AXIS]), t).normalized()
    k = lambda vals: keys(T, [v * p for v in vals])
    body.update(yaw=cr(k([0, 25, -17, -23, 0]), t) * side, lean=cr(k([0, -9, 14, 9, 0]), t) + (10 if name == 'dash' else 0),
                roll=cr(k([0, -3, 5, 3, 0]), t) * side, dx=cr(k([0, -.05, .11, .10, 0]), t),
                dz=PIRATE_STAND + cr(k([0, -.015, -.04, -.025, 0]), t), head_yaw=cr(k([0, -9, 7, 7, 0]), t) * side)
    feet[1].x += cr(k([0, -.02, .15, .15, 0]), t)
    feet[1].z += max(0, cr([(0, 0), (.23, 0), (.32, .07 * p), (.41, 0), (1, 0)], t))
    feet[0].x += cr(k([0, 0, -.07, -.07, 0]), t)
    left = cr(keys(T, [left0, (.09, -.085, -.1), (-.02, -.1, -.12), (-.03, -.09, -.14), left0]), t)
    return right, left, axis


def sword_skill(name, t, body, feet, right, left, axis):
    T = [0, 5 / 28, 8 / 28, 11 / 28, 21 / 28, 1]
    right0, left0 = Vector((.145, .025, -.155)), Vector((.075, -.035, -.19))
    right = cr(keys(T, [right0, (-.02, .09, .16), (-.05, .1, .2), (.02, .2, .04), (0, .23, 0), right0]), t)
    axis = cr(keys(T, [READY_AXIS, (-.5, .5, .8), (-.6, .4, .7), (.3, .9, .1), (.25, 1, .05), READY_AXIS]), t).normalized()
    left = cr(keys(T, [left0, (.05, -.06, -.1), (0, -.08, -.05), (0, -.2, .03), (0, -.23, .02), left0]), t)
    wide = cr(keys(T, [0, .6, 1, 1, 1, 0]), t)
    feet[0].y += .06 * wide; feet[1].y -= .06 * wide; feet[1].x += .09 * wide; feet[0].x -= .07 * wide
    body.update(yaw=cr(keys(T, [0, 30, 34, 0, 0, 0]), t), lean=cr(keys(T, [0, -10, -12, 12, 14, 0]), t),
                dz=PIRATE_STAND + cr(keys(T, [0, -.03, -.06, -.045, -.04, 0]), t), roll=cr(keys(T, [0, -3, -4, 0, 0, 0]), t),
                head_yaw=cr(keys(T, [0, -12, -14, 0, 0, 0]), t))
    return right, left, axis


def swordshield_melee(name, t, body, feet, right, left, axis):
    """Guardian: attack_a/b stay the horizontal sword slashes. heavy is a two-beat overhead chop with a deep lunge; dash is a shield
    bash (the buckler is bound to the left forearm, so thrusting that arm drives the shield)."""
    T = [0, .23, .41, .7, 1]
    right0, left0 = Vector((.145, .025, -.155)), Vector((.075, -.035, -.19))
    if name == 'heavy':    # SHIELD THROW: the buckler arm winds back beside the head, then whips out overhand and lets go (the game hides the buckler
        # while the shield flies and catches it again); the sword arm stays back on guard
        left = cr(keys(T, [left0, (-.06, -.15, .17), (.31, -.05, .02), (.22, -.06, -.04), left0]), t)
        right = cr(keys(T, [right0, (.06, .07, -.05), (.03, .09, -.08), (.07, .06, -.1), right0]), t)
        axis = cr(keys(T, [READY_AXIS, (.2, .5, .85), (.1, .6, .8), (.3, .4, .85), READY_AXIS]), t).normalized()
        body.update(yaw=cr(keys(T, [0, 26, -18, -10, 0]), t), lean=cr(keys(T, [0, -9, 11, 6, 0]), t), dx=cr(keys(T, [0, -.03, .06, .05, 0]), t),
                    dz=PIRATE_STAND + cr(keys(T, [0, -.01, -.045, -.03, 0]), t), head_yaw=cr(keys(T, [0, -10, 8, 5, 0]), t), roll=cr(keys(T, [0, -3, 4, 2, 0]), t))
        feet[1].x += cr(keys(T, [0, -.02, .1, .1, 0]), t)
        feet[0].x += cr(keys(T, [0, 0, -.03, -.03, 0]), t)
        return right, left, axis
    if name == 'dash':
        left = cr(keys(T, [left0, (.0, -.1, -.02), (.25, -.04, .02), (.2, -.05, .0), left0]), t)
        right = cr(keys(T, [right0, (-.03, .09, -.1), (-.02, .1, -.08), (.0, .08, -.1), right0]), t)
        axis = cr(keys(T, [READY_AXIS, (-.5, .6, .6), (-.5, .6, .6), (-.2, .5, .7), READY_AXIS]), t).normalized()
        body.update(yaw=cr(keys(T, [0, 14, -12, -8, 0]), t), lean=cr(keys(T, [0, -4, 20, 14, 0]), t), dx=cr(keys(T, [0, -.05, .16, .13, 0]), t),
                    dz=PIRATE_STAND + cr(keys(T, [0, -.02, -.05, -.035, 0]), t))
        feet[1].x += cr(keys(T, [0, -.03, .2, .2, 0]), t); feet[0].x += cr(keys(T, [0, .0, -.1, -.1, 0]), t)
        return right, left, axis
    return sword_melee(name, t, body, feet, right, left, axis)


def fist_melee(name, t, body, feet, right, left, axis):
    """Boxing: attack_a right straight, attack_b left hook, heavy overhead double-fist slam, dash lunging punch."""
    T = [0, .23, .41, .7, 1]
    r0, l0 = Vector((.10, .045, -.035)), Vector((.12, -.05, -.015))
    p = ATTACK_POWER[name]
    k = lambda vals: keys(T, [v * p for v in vals])
    if name == 'attack_a':          # right straight: pull back, drive through the target, return
        right = cr(keys(T, [r0, (.0, .06, -.04), (.255, .01, .04), (.15, .035, -.01), r0]), t)
        left = cr(keys(T, [l0, (.12, -.05, .0), (.10, -.055, .03), (.11, -.05, .0), l0]), t)
        body.update(yaw=cr(keys(T, [0, -22, 20, 12, 0]), t), lean=cr(k([0, -6, 10, 6, 0]), t), dx=cr(k([0, -.04, .09, .07, 0]), t),
                    dz=PIRATE_STAND + cr(k([0, -.015, -.035, -.02, 0]), t), head_yaw=cr(keys(T, [0, 10, -8, -6, 0]), t))
        feet[1].x += cr(keys(T, [0, -.02, .13, .13, 0]), t); feet[0].x += cr(keys(T, [0, 0, -.06, -.06, 0]), t)
    elif name == 'attack_b':        # left hook: wide arc across
        left = cr(keys(T, [l0, (.04, -.19, .0), (.19, .02, .055), (.07, -.1, -.01), l0]), t)
        right = cr(keys(T, [r0, (.11, .05, .0), (.09, .06, .02), (.10, .05, -.02), r0]), t)
        body.update(yaw=cr(keys(T, [0, 22, -20, -12, 0]), t), lean=cr(k([0, -4, 9, 5, 0]), t), dx=cr(k([0, -.03, .08, .06, 0]), t),
                    dz=PIRATE_STAND + cr(k([0, -.012, -.03, -.018, 0]), t), roll=cr(keys(T, [0, 4, -6, -3, 0]), t), head_yaw=cr(keys(T, [0, -9, 8, 6, 0]), t))
        feet[0].x += cr(keys(T, [0, -.02, .13, .13, 0]), t); feet[1].x += cr(keys(T, [0, 0, -.06, -.06, 0]), t)
    elif name == 'heavy':           # RUBBER ROCKET PUNCH: coil back with the whole torso, then the right arm stretches (bone scale, see STRETCH below) and drives out
        right = cr(keys(T, [r0, (-.06, .08, -.03), (.255, -.05, .0), (.24, -.045, .0), r0]), t)     # straight ahead, slightly across so the fist ends on the facing line
        left = cr(keys(T, [l0, (.1, -.08, .03), (.02, -.14, -.04), (.04, -.12, -.03), l0]), t)
        body.update(yaw=cr(keys(T, [0, -30, 0, 0, 0]), t), lean=cr(keys(T, [0, -6, 12, 8, 0]), t), dx=cr(keys(T, [0, -.04, .05, .045, 0]), t),
                    dz=PIRATE_STAND + cr(keys(T, [0, -.05, -.07, -.05, 0]), t), head_yaw=cr(keys(T, [0, 12, 0, 0, 0]), t), roll=0)   # coil, then square to the target: no yaw at the strike, or the arm points diagonally
        feet[1].x += cr(keys(T, [0, 0, .06, .06, 0]), t)
    elif name == 'dash':            # lunging punch: whole body behind the fist
        right = cr(keys(T, [r0, (-.02, .06, .0), (.255, .02, .02), (.2, .03, .0), r0]), t)
        left = cr(keys(T, [l0, (.0, -.1, -.04), (.02, -.14, -.06), (.05, -.1, -.04), l0]), t)
        body.update(yaw=cr(keys(T, [0, -14, 12, 8, 0]), t), lean=cr(keys(T, [0, 4, 24, 18, 0]), t), dx=cr(keys(T, [0, -.05, .14, .12, 0]), t),
                    dz=PIRATE_STAND + cr(keys(T, [0, -.03, -.05, -.04, 0]), t))
        feet[1].x += cr(keys(T, [0, -.03, .2, .2, 0]), t); feet[0].x += cr(keys(T, [0, 0, -.1, -.1, 0]), t)
    elif name == 'shoot':           # a quick snap straight punch
        right = cr(keys(T, [r0, (.04, .05, -.02), (.25, .02, .03), (.14, .04, -.01), r0]), t)
        body.update(yaw=cr(keys(T, [0, -10, 9, 5, 0]), t), lean=cr(k([0, -3, 6, 3, 0]), t))
    elif name == 'grab':            # both hands reaching to seize
        right = cr(keys(T, [r0, (.08, .1, .02), (.24, .05, -.02), (.18, .05, .0), r0]), t)
        left = cr(keys(T, [l0, (.08, -.1, .02), (.24, -.05, -.02), (.18, -.05, .0), l0]), t)
        body.update(lean=cr(keys(T, [0, -4, 14, 10, 0]), t), dx=cr(keys(T, [0, -.03, .09, .07, 0]), t), dz=PIRATE_STAND + cr(keys(T, [0, -.02, -.04, -.03, 0]), t))
    return right, left, axis


def fist_skill(name, t, body, feet, right, left, axis):
    """Fist storm: both fists hammering alternately, body planted wide and rocking with every blow."""
    T = [0, 5 / 28, 8 / 28, 11 / 28, 21 / 28, 1]
    r0, l0 = Vector((.10, .045, -.035)), Vector((.12, -.05, -.015))
    ramp = cr(keys(T, [0, .7, 1, 1, 1, 0]), t)
    blows = 3.5 * (t - 8 / 28) * math.tau if t > 8 / 28 else 0
    punch_r = max(0, math.sin(blows)) * (1 if t > 8 / 28 else 0)
    punch_l = max(0, -math.sin(blows)) * (1 if t > 8 / 28 else 0)
    right = r0 + (Vector((.15, -.02, .01)) * punch_r) + Vector((-.1, .03, .0)) * ramp * (1 - punch_r)
    left = l0 + (Vector((.13, .0, .0)) * punch_l) + Vector((-.1, -.03, .0)) * ramp * (1 - punch_l)
    wide = cr(keys(T, [0, .6, 1, 1, 1, 0]), t)
    feet[0].y += .05 * wide; feet[1].y -= .05 * wide
    body.update(yaw=14 * (punch_r - punch_l), lean=cr(keys(T, [0, -6, 4, 14, 14, 0]), t), dz=PIRATE_STAND + cr(keys(T, [0, -.03, -.05, -.04, -.04, 0]), t), head_pitch=-4 * ramp)
    return right, left, axis


def gun_idle_axis(name, axis):
    """Between shots the gunner carries the pistol with the muzzle pointing up and out, not stuck out in front of him."""
    return HOLD_AXIS[0].copy() if name in ('idle', 'walk', 'run', 'jump', 'fall', 'land', 'hurt', 'knock') else axis


def gun_melee(name, t, body, feet, right, left, axis):
    """Gunner: 'shoot' fires the pistol straight ahead with recoil; the other attacks are quick pistol-whips."""
    T = [0, .23, .41, .7, 1]
    r0, l0 = Vector((.145, .025, -.155)), Vector((.075, -.035, -.19))
    AIM = Vector((1, 0, .08)).normalized()                                          # level, at the opponent
    if name == 'shoot':
        right = cr(keys(T, [r0, (.16, .05, .06), (.26, .02, .07), (.2, .03, .04), r0]), t)
        axis = cr(keys(T, [AIM, AIM, (.85, 0, .55), (.95, 0, .3), AIM]), t).normalized()     # the muzzle flips up with the recoil
        left = cr(keys(T, [l0, (.14, -.05, .0), (.2, -.04, .02), (.17, -.04, .0), l0]), t)    # off hand steadies the grip
        body.update(yaw=cr(keys(T, [0, -10, -6, -3, 0]), t), lean=cr(keys(T, [0, 2, -5, -2, 0]), t), dx=cr(keys(T, [0, 0, -.03, -.015, 0]), t),
                    dz=PIRATE_STAND + cr(keys(T, [0, -.015, -.02, -.01, 0]), t), head_pitch=cr(keys(T, [0, 0, 5, 2, 0]), t))
        feet[1].x += cr(keys(T, [0, .03, .06, .06, 0]), t); feet[0].x += cr(keys(T, [0, -.02, -.04, -.04, 0]), t)
        return right, left, axis
    return sword_melee(name, t, body, feet, right, left, axis)


def gun_skill(name, t, body, feet, right, left, axis):
    """Barrage: the pistol goes up and fires rapidly at the sky, recoil on every shot."""
    T = [0, 5 / 28, 8 / 28, 11 / 28, 21 / 28, 1]
    r0, l0 = Vector((.145, .025, -.155)), Vector((.075, -.035, -.19))
    up = Vector((.0, 0, 1))
    shots = max(0, math.sin((t - 8 / 28) * math.tau * 4.5)) if t > 8 / 28 and t < 24 / 28 else 0
    right = cr(keys(T, [r0, (.06, .06, .18), (.1, .06, .26), (.1, .06, .27), (.08, .06, .22), r0]), t)
    axis = (cr(keys(T, [HOLD_AXIS[0], (.4, 0, .9), (.1, 0, 1), (.1, 0, 1), (.15, 0, 1), HOLD_AXIS[0]]), t) + Vector((.5, 0, -.2)) * shots * .35).normalized()
    left = cr(keys(T, [l0, (.06, -.08, .0), (.08, -.1, .02), (.08, -.1, .02), (.08, -.1, .02), l0]), t)
    wide = cr(keys(T, [0, .6, 1, 1, 1, 0]), t)
    feet[0].y += .05 * wide; feet[1].y -= .05 * wide
    body.update(yaw=cr(keys(T, [0, 10, 12, 4, 0, 0]), t), lean=cr(keys(T, [0, -12, -16, -14, -10, 0]), t) - 4 * shots,
                dz=PIRATE_STAND + cr(keys(T, [0, -.03, -.04, -.035, -.02, 0]), t), head_pitch=cr(keys(T, [0, 6, 10, 10, 6, 0]), t))
    return right, left, axis


def kick_melee(name, t, body, feet, right, left, axis):
    """Cook: hands stay in the pockets; every attack is a kick. attack_a front kick (right), attack_b roundhouse (left),
    heavy axe kick, dash flying kick, shoot a quick snap kick."""
    T = [0, .23, .41, .7, 1]
    p = ATTACK_POWER[name]
    pocket_r, pocket_l = Vector((.04, .08, -.23)), Vector((.04, -.08, -.23))
    right, left = pocket_r, pocket_l
    k = lambda vals: keys(T, [v * p for v in vals])
    leg = {'attack_a': 0, 'attack_b': 1, 'heavy': 0, 'dash': 0, 'shoot': 1, 'grab': 1}[name]
    kicker, base = feet[leg], feet[1 - leg]
    fwd_a = {'attack_a': .32, 'attack_b': .26, 'heavy': .2, 'dash': .4, 'shoot': .22, 'grab': .2}[name]
    lift = {'attack_a': .2, 'attack_b': .26, 'heavy': .36, 'dash': .24, 'shoot': .14, 'grab': .1}[name]
    if name == 'heavy':    # WHIRLWIND KICK: the game turns the whole model once (arena.js); the clip chambers the leg, then holds it out
        # in front at hip height so the turn sweeps it round. No spine yaw here: a 360-degree spine twist tears the chest.
        out = cr(keys(T, [0, .25, 1, 1, 0]), t)
        kicker.x += cr(keys(T, [0, -.03, .3, .26, 0]), t)
        kicker.y += -.03 * out * (1 if leg == 0 else -1)
        kicker.z += cr(keys(T, [0, .14, .24, .2, 0]), t)
        body.update(yaw=0, lean=cr(keys(T, [0, -6, -16, -12, 0]), t), dz=PIRATE_STAND + cr(keys(T, [0, -.02, -.035, -.025, 0]), t),
                    roll=cr(keys(T, [0, 2, -8, -5, 0]), t) * (1 if leg == 0 else -1), head_yaw=0)
    else:
        kicker.x += cr(keys(T, [0, -.05, fwd_a, fwd_a * .5, 0]), t)
        kicker.z += cr(keys(T, [0, .03, lift, lift * .4, 0]), t)
        if name == 'attack_b':    # roundhouse: the foot sweeps across from the outside
            kicker.y += cr(keys(T, [0, .08, -.06, -.02, 0]), t) * (1 if leg == 0 else -1)
        body.update(lean=cr(k([0, -4, -12, -8, 0]), t) + (14 if name == 'dash' else 0), yaw=cr(keys(T, [0, 12 if leg == 0 else -12, -14 if leg == 0 else 14, -6, 0]), t),
                    dz=PIRATE_STAND + cr(keys(T, [0, -.01, -.03, -.02, 0]), t), dx=cr(k([0, -.03, .04, .03, 0]), t),
                    roll=cr(keys(T, [0, 3, -12 if name == 'attack_b' else -6, -4, 0]), t) * (1 if leg == 0 else -1))
    return right, left, axis


def kick_skill(name, t, body, feet, right, left, axis):
    """Cook's special: a spinning flurry of kicks (the game also spins the body)."""
    T = [0, 5 / 28, 8 / 28, 11 / 28, 21 / 28, 1]
    right, left = Vector((.04, .08, -.23)), Vector((.04, -.08, -.23))
    swing = math.sin((t - 8 / 28) * math.tau * 3) if 8 / 28 < t < 24 / 28 else 0
    feet[0].x += .34 * max(0, swing); feet[0].z += .22 * max(0, swing)
    feet[1].x += .34 * max(0, -swing); feet[1].z += .22 * max(0, -swing)
    wide = cr(keys(T, [0, .5, 1, 1, 1, 0]), t)
    body.update(lean=cr(keys(T, [0, -8, -4, 6, 6, 0]), t), dz=PIRATE_STAND + cr(keys(T, [0, -.03, -.045, -.04, -.03, 0]), t),
                yaw=cr(keys(T, [0, 14, 20, 0, 0, 0]), t), roll=8 * swing)
    return right, left, axis


def staff_melee(name, t, body, feet, right, left, axis):
    """Stormcaller: staff swings (the sword choreography with a two-handed grip, applied in apply_pose)."""
    return sword_melee(name, t, body, feet, right, left, axis)


STYLE_MELEE = {'fist': fist_melee, 'swordshield': swordshield_melee, 'gun': gun_melee, 'kick': kick_melee, 'staff': staff_melee}
STYLE_SKILL = {'fist': fist_skill, 'swordshield': sword_skill, 'gun': gun_skill, 'kick': kick_skill, 'staff': sword_skill}

# ---------------------------------------------------------------- weapons, bound to the wrist like the pirate's cutlass
def build_weapons():
    """Rigid props skinned 100% to a bone, bind coordinates computed from the posed t=0 idle, so they cannot drift off
    the hand. Everything is positioned in POSED space and converted back to bind space."""
    made = []

    def prism_set(shapes):
        verts, faces, mats = [], [], []
        for poly, depth, material in shapes:
            start, n = len(verts), len(poly)
            verts.extend((x, y, z) for y in (-depth / 2, depth / 2) for x, z in poly)
            faces.extend([tuple(start + i for i in range(n - 1, -1, -1)), tuple(start + n + i for i in range(n))])
            mats.extend([material, material])
            for i in range(n):
                k = (i + 1) % n
                faces.append((start + i, start + k, start + n + k, start + i + n))
                mats.append(material)
        return verts, faces, mats

    def finish(name, verts, faces, mats, palette, bone):
        mesh = bpy.data.meshes.new(name + 'Mesh')
        mesh.from_pydata(verts, [], faces)
        mesh.update()
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(ob)
        ob.parent = arm
        ob.matrix_parent_inverse = Matrix.Identity(4)
        for mname, color, metal in palette:
            mat = bpy.data.materials.new('Tripo' + mname)
            mat.diffuse_color = color
            mat.use_nodes = True
            shader = mat.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Base Color'].default_value = color
            shader.inputs['Metallic'].default_value = metal
            shader.inputs['Roughness'].default_value = .32
            mesh.materials.append(mat)
        for poly, i in zip(mesh.polygons, mats):
            poly.material_index = i
        ob.vertex_groups.new(name=bone.name).add(list(range(len(verts))), 1, 'REPLACE')
        ob.modifiers.new('Skin', 'ARMATURE').object = arm
        made.append(ob)
        return ob

    def make(name, shapes, bone, palette, scale=SA):
        verts, faces, mats = prism_set(shapes)
        verts = [Vector(v) * scale for v in verts]
        hand = pb[bone.name]
        knuckles = [pb[c.name].head for c in bone.children]       # posed: the prop is bound to the posed idle hand
        palm = sum(knuckles, Vector()) / len(knuckles) if knuckles else hand.tail
        grip = hand.head + (palm - hand.head) * .55
        placement = Matrix.Translation(grip) @ Vector((0, 0, 1)).rotation_difference(HOLD_AXIS[0]).to_matrix().to_4x4()
        bind = rest[bone.name] @ hand.matrix.inverted() @ placement
        return finish(name, [bind @ v for v in verts], faces, mats, palette, bone)

    STEEL = ('Steel', (.64, .82, .92, 1), .7)
    GOLD = ('Gold', (.95, .55, .09, 1), .7)
    LEATHER = ('Leather', (.11, .035, .018, 1), 0)
    GUNMETAL = ('Gunmetal', (.16, .17, .2, 1), .85)
    WOOD = ('Wood', (.38, .2, .08, 1), 0)
    kind = SPEC['weapon']
    if kind == 'sword':   # a straight naval sword: wide guard, plain grip
        make('TripoCutlass', [([(-.017, .035), (.017, .035), (.017, .3), (0, .335), (-.017, .3)], .012, 0),
                              ([(-.05, .017), (.05, .017), (.05, .035), (-.05, .035)], .03, 1),
                              ([(-.012, -.055), (.012, -.055), (.012, .022), (-.012, .022)], .026, 2),
                              ([(-.019, -.065), (.019, -.065), (.019, -.05), (-.019, -.05)], .032, 1)], RIGHT['wrist'], [STEEL, GOLD, LEATHER])
    elif kind == 'pistol':   # a chunky flintlock; the barrel (local +Z) points forward in the hand
        make('TripoPistol', [([(-.03, -.085), (.03, -.085), (.036, .0), (-.036, .0)], .05, 1),
                             ([(-.03, .0), (.03, .0), (.026, .06), (-.026, .06)], .054, 0),
                             ([(-.018, .06), (.018, .06), (.016, .21), (-.016, .21)], .04, 0),
                             ([(-.03, .2), (.03, .2), (.03, .225), (-.03, .225)], .056, 2),
                             ([(-.012, .018), (.012, .018), (.012, .045), (-.012, .045)], .07, 2)],
             RIGHT['wrist'], [GUNMETAL, WOOD, GOLD], scale=1.0)
    elif kind == 'staff':    # a staff about as tall as the fighter's shoulders: gold ferrules and a star head
        make('TripoStaff', [([(-.014, -.17), (.014, -.17), (.014, .46), (-.014, .46)], .028, 0),
                            ([(-.024, -.185), (.024, -.185), (.024, -.15), (-.024, -.15)], .044, 1),
                            ([(-.026, .42), (.026, .42), (.022, .47), (-.022, .47)], .05, 1),
                            ([(0, .6), (.04, .535), (.066, .58), (.045, .51), (.066, .44), (.027, .48), (0, .41), (-.027, .48), (-.066, .44), (-.045, .51), (-.066, .58), (-.04, .535)], .032, 1),
                            ([(-.018, .1), (.018, .1), (.018, .135), (-.018, .135)], .04, 1)],
             RIGHT['wrist'], [WOOD, GOLD], scale=1.0)
    if SPEC.get('off_hand') == 'buckler':
        # A small round shield on the outside of the left forearm, facing forward and out.
        fore = LEFT['fore']
        pf = pb[fore.name]
        out = Vector((.62, .78 * LEFT['sign'], 0)).normalized()
        up = Vector((0, 0, 1))
        side = out.cross(up).normalized()
        centre = pf.head + (pf.tail - pf.head) * .55 + out * (.05 * SA)
        radius, ring = .095 * SA, 24
        layers = [(-.006, 0.0, 0), (-.006, 1.0, 0), (.008, 1.0, 1), (.008, .93, 1), (.014, .9, 0), (.024, .36, 0), (.034, .22, 0), (.036, 0.0, 0)]
        verts, faces, face_mats = [], [], []
        for depth, frac, _ in layers:
            for i in range(ring):
                a = i * math.tau / ring
                verts.append(centre + out * depth * SA + side * math.cos(a) * radius * frac + up * math.sin(a) * radius * frac)
        for l in range(len(layers) - 1):
            for i in range(ring):
                k = (i + 1) % ring
                faces.append((l * ring + i, l * ring + k, (l + 1) * ring + k, (l + 1) * ring + i))
                face_mats.append(layers[l + 1][2])
        bind = rest[fore.name] @ pf.matrix.inverted()
        ob = finish('TripoBuckler', [bind @ v for v in verts], faces, face_mats,
                    [('Shield', (.16, .30, .66, 1), .3), ('ShieldRim', (.95, .72, .2, 1), .8)], fore)
        for poly in ob.data.polygons:
            poly.use_smooth = True
    return made


pose('idle', 0)
# The blade leaves the top of the fist, perpendicular to the forearm and tilted forward-up (the pirate's 43 degrees).
_fore = pb[RIGHT['fore'].name]
_dir = (_fore.tail - _fore.head).normalized()
HOLD_AXIS[0] = (Vector((0, 0, 1)) * .75 + Vector((1, 0, 0)) * .6 - _dir * .15).normalized()
if SPEC['weapon'] == 'pistol':
    HOLD_AXIS[0] = Vector((.55, 0, .83)).normalized()    # carried muzzle-up and forward; shooting swings it level (see gun_melee)
elif SPEC['weapon'] == 'staff':
    HOLD_AXIS[0] = Vector((.2, 0, 1)).normalized()       # the staff stands up in the fist
pose('idle', 0)
WEAPONS = build_weapons()

# ---------------------------------------------------------------- bake
DURATIONS = {'carry_walk': 24, 'throw': 18, 'toss': 18, 'knock': 16, 'idle': 96, 'walk': 24, 'run': 16, 'attack_a': 22, 'attack_b': 22, 'heavy': 22,
             'dash': 22, 'shoot': 22, 'skill': 28, 'guard': 12, 'hurt': 10, 'jump': 18, 'fall': 22, 'land': 16, 'carry': 12, 'grab': 22}
def apply_stretch(name, t):
    """Spec 'stretch': the right arm of a rubber-limbed fighter grows along its length during the heavy (bone scale on the upper arm and
    forearm, the wrist scaled back so the fist keeps its size). Returns the bones to key; every clip keys them (1 outside the heavy) so
    nothing is left stretched when the mixer cross-fades."""
    if not SPEC.get('stretch'):
        return []
    arm_bones = [RIGHT['upper'].name, RIGHT['fore'].name, RIGHT['wrist'].name]
    s = cr([(0, 1.0), (.23, 1.0), (.36, 1.8), (.41, 2.7), (.6, 2.5), (.82, 1.4), (1, 1.0)], t) if name == 'heavy' else 1.0
    for n in arm_bones[:2]:
        pb[n].scale = Vector((1, s, 1))
    pb[arm_bones[2]].scale = Vector((1, 1 / s, 1))
    update()
    return arm_bones


for name, duration in DURATIONS.items():
    action = bpy.data.actions.new(name=name)
    arm.animation_data.action = action
    for frame in range(duration + 1):
        pose(name, frame / duration)
        stretch = apply_stretch(name, frame / duration)
        for b in pb:
            b.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=b.name)
            if b.name == ROOT_BONE:
                b.keyframe_insert(data_path='location', frame=frame, group=b.name)
        for n in stretch:
            pb[n].keyframe_insert(data_path='scale', frame=frame, group=n)
    action.use_fake_user = True
    print('BAKED', name, duration)

if '--no-heal' not in sys.argv:
    heal_tears()
arm.animation_data.action = bpy.data.actions['idle']
bpy.context.scene.frame_set(0)
bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 96
bpy.context.preferences.filepaths.save_version = 0
extra = list(WEAPONS)
if SPEC.get('face') and not NO_FACE:
    import tripo_face
    extra += tripo_face.build_face(bpy, arm, body_mesh, SPEC['face'])
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
body_mesh.select_set(True)
for o in extra:
    o.select_set(True)

bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_skins=True, export_all_influences=False, export_optimize_animation_size=True, export_yup=True)
META.write_text(json.dumps({'id': CID, 'style': STYLE, 'legScale': round(SL, 4), 'armScale': round(SA, 4),
                            'walk': {'amp': round(.18 * SL, 4), 'duty': .6}, 'run': {'amp': round(.23 * SL, 4), 'duty': .48},
                            'hipHeight': round(M['hip_z'] + .5, 4), 'standLift': round(M['stand'], 4)}, indent=2))
print('EXPORTED', OUTPUT)
