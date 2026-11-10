"""Secondary-motion weights for a Tripo character: which vertices are loose hair and loose cloth.

The scans have no hair or cloth bones to speak of (a few characters have one or two helper bones), so the game moves hair and clothing in the
vertex shader instead: a spring-damper 'follower' point trails the head (for hair) and the hips (for cloth), and every vertex is pushed by the
follower's offset times its weight. This module paints those weights as two float point attributes, `_HAIR` and `_CLOTH` (0..1, the glTF exporter
writes attributes whose name starts with an underscore, and three.js reads them as `_hair` and `_cloth`), and finds the bones the head turns with.

How the weights are chosen (all in the armature's rest space, nothing is hand painted):
  hair   vertices that belong to the head bones (or to helper bones hanging off the head) and lie well outside the skull: weight grows with the
         distance from the head centre relative to the skull radius, and is zero for skin-coloured texels (the face, the ears, a bald scalp).
         Helper-bone chains (a ponytail) get weight along the chain, strongest at the tip.
  cloth  vertices that belong to the torso / pelvis / thigh bones, lie below the hips and stand away from the skeleton by more than the local body
         radius (a coat tail, a sash end, a hem). Skin-tight cloth sits at about one radius and stays at zero.
"""
import math
from mathutils import Vector

DEFAULTS = {'hair': True, 'head_hair': True, 'cloth': True, 'hair_start': 1.3, 'hair_full': 2.0, 'cloth_start': 1.25, 'cloth_full': 2.1, 'skin_tolerance': .14}


def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t


def _smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _median(xs):
    xs = sorted(xs)
    return xs[len(xs) // 2] if xs else 0.0


def find_look_bones(arm, centre):
    """The bone nearest the face centre is the skull; its parent is the neck. `centre` is in armature rest space. Returns (head, neck or None)."""
    best = min(arm.data.bones, key=lambda b: _seg_dist(centre, b.head_local, b.tail_local)[0])
    return best, best.parent


def paint(bpy, arm, ob, rig, face_yz, spec=None):
    """Write `_HAIR` and `_CLOTH` on the body mesh. `face_yz` is (y, z) of the middle of the eyes in armature rest space."""
    cfg = dict(DEFAULTS)
    cfg.update((spec or {}).get('sway', {}))
    me = ob.data
    to_arm = arm.matrix_world.inverted() @ ob.matrix_world
    pos = [to_arm @ v.co for v in me.vertices]
    cy, cz = face_yz
    face_centre = Vector((max((p.x for p in pos if abs(p.y - cy) < .03 and abs(p.z - cz) < .03), default=.05), cy, cz))   # the front of the face at eye height
    bones = {b.name: b for b in arm.data.bones}
    groups = {g.index: g.name for g in ob.vertex_groups}

    # ---- which bones are what
    # the skull is the bone that carries the face: the largest weight among the vertices around the eyes (a hair helper bone can be nearer to the point)
    face_weight = {}
    for i, p in enumerate(pos):
        if (p - face_centre).length < .05:
            for g in me.vertices[i].groups:
                face_weight[groups[g.group]] = face_weight.get(groups[g.group], 0) + g.weight
    head_bone = bones[max(face_weight, key=face_weight.get)] if face_weight else find_look_bones(arm, face_centre)[0]
    neck_bone = head_bone.parent
    head_prims = {head_bone.name}
    head_set = set()
    prim = set()
    limbs = set()
    for side in ('Right', 'Left'):
        r = rig[side]
        arm_set = {r['upper'].name, r['fore'].name} | {b.name for b in r['wrist'].children_recursive} | {r['wrist'].name}
        leg_set = {r['thigh'].name, r['shin'].name, r['foot'].name} | {b.name for b in r['foot'].children_recursive}
        limbs |= arm_set | leg_set
        prim |= arm_set | leg_set
    prim |= {b.name for b in rig['torso'] + rig['head']} | {rig['root'].name}
    prim |= head_prims | {head_bone.name}
    has_prim = lambda b: any(d.name in prim for d in [b] + list(b.children_recursive))
    secondary = {b.name for b in arm.data.bones if b.name not in prim and not has_prim(b)}
    # the head set: the skull bone and the helper bones (hair strands, ribbons) hanging off it; never the arms that some rigs hang under the head chain
    head_set = {head_bone.name} | {b.name for b in head_bone.children_recursive if b.name in secondary}
    thigh_names = {rig[s]['thigh'].name for s in ('Right', 'Left')} | {rig[s]['shin'].name for s in ('Right', 'Left')}
    centre_bones = [b for b in arm.data.bones if b.name not in limbs and b.name not in head_set and b.name not in secondary] + [bones[n] for n in thigh_names if n in bones]
    # the body's reference segments for the cloth distance: torso/pelvis bones and the thighs and shins
    ref_segs = [(b.head_local, b.tail_local) for b in centre_bones]

    def category(name):
        if name in head_set or name in head_prims:
            return 'head' if name not in secondary else 'hair_chain'
        if name in secondary:
            parent = bones[name].parent
            while parent is not None and parent.name in secondary:
                parent = parent.parent
            if parent is None or parent.name in limbs:
                return 'limb'
            return 'hair_chain' if (parent.name in head_set or parent.name in head_prims) else 'cloth_chain'
        if name in thigh_names:
            return 'cloth'
        if name in limbs:
            return 'limb'
        return 'cloth' if bones.get(name) is not None else 'other'

    chain_t = {}
    for name in secondary:
        depth = 0
        b = bones[name]
        while b.parent is not None and b.parent.name in secondary:
            depth += 1
            b = b.parent
        root = b
        length = 1 + max((_chain_len(c, secondary) for c in root.children if c.name in secondary), default=0)
        chain_t[name] = (depth, length)

    # ---- per-vertex dominant category
    dom = []
    for v in me.vertices:
        score = {}
        for g in v.groups:
            n = groups[g.group]
            score[category(n)] = score.get(category(n), 0) + g.weight
        top = max(score, key=score.get) if score else 'other'
        best_bone = max(((g.weight, groups[g.group]) for g in v.groups), default=(0, None))[1]
        dom.append((top, best_bone))

    # ---- texture colours for the skin test
    image = None
    for m in me.materials:
        if m and m.use_nodes:
            for link in m.node_tree.links:
                if link.to_socket.name == 'Base Color' and link.from_node.type == 'TEX_IMAGE':
                    image = link.from_node.image
    W, H = image.size
    px = image.pixels[:]
    loop_of = {}
    for loop in me.loops:
        loop_of.setdefault(loop.vertex_index, loop.index)
    uv = me.uv_layers.active.data

    def colour(i):
        u, v = uv[loop_of[i]].uv
        k = (min(H - 1, max(0, int(v * H))) * W + min(W - 1, max(0, int(u * W)))) * 4
        return px[k:k + 3]
    near_face = [colour(i) for i, p in enumerate(pos) if dom[i][0] == 'head' and (p - face_centre).length < .05]
    skin = [_median([c[k] for c in near_face]) for k in range(3)] if near_face else [.85, .6, .45]
    skin_like = lambda c: math.dist(c, skin) < cfg['skin_tolerance']

    # ---- hair
    head_centre = (head_bone.head_local + head_bone.tail_local) / 2
    head_centre = Vector((head_centre.x - .01, head_centre.y, max(head_centre.z, face_centre.z - .03)))
    head_d = [(pos[i] - head_centre).length for i in range(len(pos)) if dom[i][0] == 'head']
    skin_d = [(pos[i] - head_centre).length for i in range(len(pos)) if dom[i][0] == 'head' and skin_like(colour(i))]
    skull = _median(skin_d) if len(skin_d) > 40 else (sorted(head_d)[int(len(head_d) * .55)] if head_d else .1)   # the skull is judged by its bare skin (face, ears), not by the hair mass
    hair = [0.0] * len(pos)
    for i, p in enumerate(pos):
        cat, bone = dom[i]
        if not cfg['hair']:
            break
        if cat == 'hair_chain':
            depth, length = chain_t.get(bone, (0, 1))
            seg = bones[bone]
            _, t = _seg_dist(p, seg.head_local, seg.tail_local)
            hair[i] = min(1.0, .2 + .8 * (depth + t) / max(1, length))
        elif cat == 'head' and cfg['head_hair'] and p.z >= head_bone.head_local.z - .01:   # above the neck: shoulders skinned to the head bone are not hair
            rel = (p - head_centre).length / max(skull, 1e-6)
            w = _smooth((rel - cfg['hair_start']) / max(1e-6, cfg['hair_full'] - cfg['hair_start']))
            if w > 0 and skin_like(colour(i)):
                w = 0.0
            hair[i] = w

    # ---- cloth
    thigh_top = sum((rig[s]['thigh'].head_local.z for s in ('Right', 'Left'))) / 2
    knee = sum((rig[s]['shin'].head_local.z for s in ('Right', 'Left'))) / 2
    radius = {}
    for i, p in enumerate(pos):
        if dom[i][0] == 'cloth' and dom[i][1]:
            bone = bones[dom[i][1]]
            radius.setdefault(dom[i][1], []).append(_seg_dist(p, bone.head_local, bone.tail_local)[0])
    local_radius = {n: max(.02, _median(ds)) for n, ds in radius.items()}
    cloth = [0.0] * len(pos)
    for i, p in enumerate(pos):
        if not cfg['cloth']:
            break
        cat, bone = dom[i]
        if cat == 'cloth_chain':
            depth, length = chain_t.get(bone, (0, 1))
            cloth[i] = min(1.0, .3 + .7 * (depth + .5) / max(1, length))
            continue
        if cat != 'cloth' or bone not in local_radius:
            continue
        if p.z > thigh_top + .02:
            continue
        d = min(_seg_dist(p, a, b)[0] for a, b in ref_segs)
        rel = d / max(.02, min(local_radius[bone], .2))
        base = _smooth((rel - cfg['cloth_start']) / max(1e-6, cfg['cloth_full'] - cfg['cloth_start']))
        low = .45 + .55 * max(0.0, min(1.0, (thigh_top - p.z) / max(.05, (thigh_top - knee) * .5)))
        cloth[i] = base * low

    for name, values in (('_HAIR', hair), ('_CLOTH', cloth)):
        if name in me.attributes:
            me.attributes.remove(me.attributes[name])
        attr = me.attributes.new(name, 'FLOAT', 'POINT')
        attr.data.foreach_set('value', values)
    print('SWAY', ob.name, 'skull %.3f' % skull, 'hair verts', sum(1 for w in hair if w > .05), 'cloth verts', sum(1 for w in cloth if w > .05),
          'head', head_bone.name, 'neck', neck_bone.name if neck_bone else None)
    return {'head': head_bone.name.replace('tripo::', ''), 'neck': neck_bone.name.replace('tripo::', '') if neck_bone else None}


def _chain_len(bone, secondary):
    return 1 + max((_chain_len(c, secondary) for c in bone.children if c.name in secondary), default=0)
