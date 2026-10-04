"""Find the semantic bones of a Tripo biped rig by GEOMETRY only.

Tripo's bone names are not reliable: on the pirate '0_' is the arm and '1_' the leg, on the guardian it is the other way
round, and one hand's bones are all called bone_NN. So nothing here looks at a name. A bone is recognised by where it is
in the T-pose: legs are the chains that start at the pelvis and end at the floor, arms are the chains that end farthest
out sideways, fingers are the branches hanging off the wrist, the head chain ends highest.
Everything is in the armature's rest space: +X forward, +Y to the character's right?  NO - Y sign differs per model, so
sides are decided by the sign of the end point's Y, and `forward` is measured from the foot.
"""
from mathutils import Vector

PIRATE_LEG = .266 + .177
PIRATE_ARM = .126 + .13


def _descend(bone):
    """The main chain below a bone: at every fork keep the child whose subtree reaches farthest from the bone."""
    chain = [bone]
    while bone.children:
        bone = max(bone.children, key=lambda c: (c.tail_local - chain[0].head_local).length)
        chain.append(bone)
    return chain


def _depth(bone):
    return 1 + max((_depth(c) for c in bone.children), default=0)


def discover(arm):
    bones = list(arm.data.bones)
    root = next(b for b in bones if b.parent is None)
    # ---- legs: from each side, the chain that starts at the pelvis and descends farthest. A leg is a bone whose
    # head is near the pelvis (below the spine base) and which sits off-centre; follow the child that goes lowest.
    floor = min(b.tail_local.z for b in bones)
    rig = {'root': root}
    pelvis_z = max(c.head_local.z for c in root.children if c.head_local.z < root.head_local.z + .8 and abs(c.head_local.y) > .02) if any(abs(c.head_local.y) > .02 for c in root.children) else None
    leg_chain = {}
    for side in ('Right', 'Left'):
        sign = 1 if side == 'Right' else -1
        starts = [b for b in bones if b.head_local.y * sign > .02 and b.head_local.y * sign < .16 and b.tail_local.z < b.head_local.z - .05
                  and b.head_local.z < root.head_local.z + .9 and b.head_local.z > floor + .25]
        # the thigh is the highest-starting downward bone on this side whose chain reaches the floor
        best = None
        for st in starts:
            chain = [st]
            while chain[-1].children:
                chain.append(min(chain[-1].children, key=lambda c: c.tail_local.z))
            if chain[-1].tail_local.z < floor + .06 and (best is None or st.head_local.z > best[0].head_local.z):
                best = chain
        assert best is not None and len(best) >= 3, 'no leg found on the %s' % side
        leg_chain[side] = best
    # ---- arms: from each wrist (a bone with >= 2 children that points outward) back to the shoulder
    # The wrist is the bone with the fingers on it: a bone with >= 2 children whose head is far to one side of the body
    # (the T-pose puts it farthest out). Pick the most lateral such bone on each side.
    wrists = {}
    for b in bones:
        if len(b.children) >= 2 and b.head_local.z > floor + .3 and abs(b.head_local.y) > .06:
            side = 'Right' if b.head_local.y > 0 else 'Left'
            if side not in wrists or abs(b.head_local.y) > abs(wrists[side].head_local.y):
                wrists[side] = b
    assert set(wrists) == {'Right', 'Left'}, 'could not find both wrists (bones with fingers): %s' % {k: v.name for k, v in wrists.items()}
    for side in ('Right', 'Left'):
        w = wrists[side]
        # Some rigs split the arm into three segments (shoulder, upper, fore, lower arm). Walk up from the wrist to the
        # clavicle/torso and keep the whole chain: the IK uses the bones nearest the wrist for 'fore' and the rest for
        # 'upper', and a long segment count must not make the arm look short.
        arm_chain = []
        n = w.parent
        while n is not None and n.head_local.z > floor + .3 and abs(n.head_local.y) > .03:
            arm_chain.append(n)
            n = n.parent
        arm_chain.reverse()                       # shoulder-most first
        assert len(arm_chain) >= 2, 'arm chain too short on the %s' % side
        # Spare helper bones hang beside the real chain on some rigs, so a parent walk can stop short of the shoulder.
        # Judge the arm by the straight distance from the shoulder end of that chain to the wrist: that is its reach.
        # Pick the two bones that carry the elbow: the pair whose joint is closest to the middle of the arm. Everything
        # else in the chain (clavicle, extra segments) is rotated with them rather than solved on its own.
        wrist_pos = w.head_local
        shoulder_pos = arm_chain[0].head_local
        mid = (wrist_pos + shoulder_pos) / 2
        joint = min(range(1, len(arm_chain)), key=lambda i: (arm_chain[i].head_local - mid).length)
        upper, fore = arm_chain[joint - 1], arm_chain[joint]
        thigh, shin, foot = leg_chain[side][:3]
        rig[side] = {'sign': 1 if side == 'Right' else -1, 'upper': upper, 'fore': fore, 'wrist': w,
                     'clavicle': upper.parent if upper.parent and upper.parent.head_local.z > upper.head_local.z - .02 and abs(upper.parent.head_local.y) < abs(upper.head_local.y) and upper.parent.tail_local.y * upper.head_local.y > 0 else None,
                     'thigh': thigh, 'shin': shin, 'foot': foot}
    # ---- spine and head: the chain from the pelvis to the highest point, minus bones that belong to an arm
    arm_bones = set()
    for side in ('Right', 'Left'):
        arm_bones |= {rig[side]['upper'], rig[side]['fore'], rig[side]['wrist']} | set(rig[side]['wrist'].children_recursive)
    top = max((b for b in bones if b not in arm_bones), key=lambda b: b.tail_local.z)
    spine = [b for b in _ancestors(top) if b is not root]
    pelvis_z = rig['Right']['thigh'].head_local.z
    shoulder_z = rig['Right']['upper'].head_local.z
    rig['torso'] = [b for b in spine if b.tail_local.z <= shoulder_z + .015]
    rig['head'] = [b for b in spine if b.tail_local.z > shoulder_z + .015]
    rig['head_turn'] = next((b for b in rig['head'] if not _carries_arm(b, arm_bones)), rig['head'][-1])
    if not rig['torso']:
        rig['torso'] = rig['head'][:1]
    return rig


def _ancestors(bone):
    chain = []
    while bone is not None:
        chain.append(bone)
        bone = bone.parent
    return list(reversed(chain))


def _carries_arm(bone, arm_bones):
    return any(c in arm_bones or _carries_arm(c, arm_bones) for c in bone.children)


def _thigh_index(chain, root):
    """Index of the thigh in a root-first chain down to the toe: the bone whose head is at pelvis height, whose
    next two bones form knee and ankle."""
    # the foot bone is the last one that still moves forward; the shin and thigh are the two before it
    n = len(chain)
    for i in range(n - 2):
        seg = chain[i:i + 3]
        if len(seg) == 3 and seg[0].head_local.z > seg[1].head_local.z > seg[2].head_local.z and seg[2].head_local.z < root.head_local.z + .7:
            # prefer the triple whose first bone is highest (the real thigh), not the pelvis helper above it
            return i
    return max(0, n - 3)


def measure(rig):
    r = rig['Right']
    leg = r['thigh'].length + r['shin'].length
    # The reach is measured shoulder -> wrist in the T-pose, so a rig that splits its arm into more bones is not mistaken for a short arm.
    arm = (r['wrist'].head_local - r['upper'].head_local).length
    hip, ankle = r['thigh'].head_local, r['foot'].head_local
    lateral = abs(ankle.y - hip.y)
    v_rest = hip.z - ankle.z
    v_straight = (leg * leg - lateral * lateral) ** .5
    foot = r['foot']
    fwd = Vector((foot.tail_local.x - foot.head_local.x, abs(foot.tail_local.y - foot.head_local.y)))
    # A rig can end the leg at the shin with no foot bone at all (the 'foot' we found is just the lower shin, pointing
    # down, and its tail sits far below the floor line). Turning such a bone sideways swings the whole boot.
    foot_len = foot.length
    # A real foot bone points forward: its tip is clearly in front of its root. A boot-bottom bone continues the shin, so its tip is
    # level with (or behind) the root along the forward axis.
    has_foot = (foot.tail_local.x - foot.head_local.x) > .4 * foot_len
    return {'has_foot': has_foot, 'leg': leg, 'arm': arm, 'leg_scale': leg / PIRATE_LEG, 'arm_scale': arm / PIRATE_ARM,
            'hip_y': abs(hip.y), 'ankle_y': abs(ankle.y), 'ankle_z': ankle.z, 'ankle_x': ankle.x,
            'sole_drop': (ankle.z - foot.tail_local.z) if not has_foot else 0.0,   # how far below the 'ankle' the sole is when the last bone is just boot
            'hip_z': hip.z, 'hip_x': hip.x, 'v_rest': v_rest, 'v_straight': v_straight,
            'stand': v_straight - v_rest,
            'foot_out_deg': fwd.angle(Vector((1, 0))) * 180 / 3.141592653589793,
            'shoulder_z': r['upper'].head_local.z, 'shoulder_y': abs(r['upper'].head_local.y)}
