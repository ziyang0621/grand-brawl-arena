"""python animate_char.py <id> [...] : opens out/<id>_rig.blend, keys the clip set for the character's `style`, saves out/<id>_anim.blend
and exports ../../models/<id>.glb.  Clips (all styles): idle walk run jump fall land attack_a attack_b heavy dash shoot skill guard hurt carry grab.
Attack clips share one timeline: 0 idle, 5 wind-up, 9 contact, 15 follow-through, 22 idle (the game scrubs them by attack phase)."""
import sys, math, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy
from mathutils import Euler, Vector
from specs import SPECS
OUT = os.path.join(HERE, 'out'); MODELS = os.path.abspath(os.path.join(HERE, '..', '..', 'models'))
UP = {'hips','spine','chest','neck','head','root'}

def run(cid):
    spec = SPECS[cid]; style = spec['style']
    bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, f'{cid}_rig.blend'))
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]; bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='POSE'); bpy.context.scene.render.fps = 24
    REST = {b.name: b.matrix_local.to_quaternion() for b in arm.data.bones}
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'

    def world_q(name, f=0, o=0, t=0, x=0, y=0, z=0):
        up = name in UP; side = 1 if name.endswith('.L') else -1 if name.endswith('.R') else 0
        rx = math.radians((f if up else -f) + x); ry = math.radians((-o*side if not up else 0) + y); rz = math.radians(z + (t if up else t*side))
        if name.startswith('foot'): rx = math.radians(-f + x)
        return Euler((rx, ry, rz), 'XYZ').to_quaternion()
    def key(frame, pose):
        for pb in arm.pose.bones:
            spec_ = pose.get(pb.name, {})
            qw = world_q(pb.name, **{k: v for k, v in spec_.items() if k not in ('dz','dy','dx')}); r = REST[pb.name]
            pb.rotation_quaternion = r.inverted() @ qw @ r
            pb.location = Vector((spec_.get('dx',0), spec_.get('dy',0), spec_.get('dz',0)))
            pb.keyframe_insert('rotation_quaternion', frame=frame); pb.keyframe_insert('location', frame=frame)
    def clip(name, frames):
        act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
        for fr, pose in frames: key(fr, pose)
        for fc in act.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
        act.use_fake_user = True
    def over(base, **bones):
        out = {k: dict(v) for k, v in base.items()}
        for b, d in bones.items():
            b = b.replace('_L', '.L').replace('_R', '.R') if b.endswith(('_L', '_R')) else b
            out[b] = dict(out.get(b, {}), **d)
        return out
    def O(base, delta):       # delta: {'upper_arm.R': {...}} with real bone names
        out = {k: dict(v) for k, v in base.items()}
        for b, d in delta.items(): out[b] = dict(out.get(b, {}), **d)
        return out

    # ---------- per-style holds: arm / leg posture for idle and locomotion ----------
    HOLD = {
     'sword': {'upper_arm.L': dict(f=-8, o=14), 'forearm.L': dict(f=22), 'hand.L': dict(f=5), 'upper_arm.R': dict(f=20, o=28, t=-10), 'forearm.R': dict(f=44), 'hand.R': dict(f=-10)},
     'swordshield': {'upper_arm.L': dict(f=40, o=8), 'forearm.L': dict(f=75, t=-70), 'hand.L': dict(f=0), 'upper_arm.R': dict(f=34, o=22, t=-10), 'forearm.R': dict(f=55), 'hand.R': dict(f=-10)},
     'fist': {'upper_arm.L': dict(f=38, o=20), 'forearm.L': dict(f=108), 'hand.L': dict(f=0), 'upper_arm.R': dict(f=34, o=22), 'forearm.R': dict(f=112), 'hand.R': dict(f=0)},
     'gun': {'upper_arm.L': dict(f=10, o=20), 'forearm.L': dict(f=45), 'hand.L': dict(f=5), 'upper_arm.R': dict(f=62, o=10), 'forearm.R': dict(f=22), 'hand.R': dict(f=-5)},
     'kick': {'upper_arm.L': dict(f=-4, o=14), 'forearm.L': dict(f=30), 'hand.L': dict(f=0), 'upper_arm.R': dict(f=-4, o=14), 'forearm.R': dict(f=30), 'hand.R': dict(f=0)},
     'staff': {'upper_arm.L': dict(f=4, o=26), 'forearm.L': dict(f=26), 'hand.L': dict(f=5), 'upper_arm.R': dict(f=24, o=20, t=-6), 'forearm.R': dict(f=52), 'hand.R': dict(f=-6)},
    }[style]
    HELD = {'sword': ['R'], 'swordshield': ['L', 'R'], 'fist': [], 'gun': ['R'], 'kick': [], 'staff': ['R']}[style]
    LEGS = {'fist': (10, 12), 'kick': (4, 6)}.get(style, (6, 7))
    def stance(b=0, sway=0):
        d = {'hips': dict(dz=-.03*b, z=sway*3), 'spine': dict(f=3+b*2, z=-sway*2), 'chest': dict(f=1+b*2, z=-sway*2), 'head': dict(f=-3-b, z=sway*2),
             'thigh.L': dict(f=LEGS[0], o=LEGS[0]), 'shin.L': dict(f=-10-LEGS[0]*.5), 'foot.L': dict(f=4), 'thigh.R': dict(f=-8, o=LEGS[1]), 'shin.R': dict(f=-14-LEGS[1]*.4), 'foot.R': dict(f=6)}
        for k, v in HOLD.items():
            v = dict(v)
            if k.startswith('upper_arm') and 'f' in v: v['f'] += b*1.5
            d[k] = v
        return d
    ST = stance(0, 0)
    clip('idle', [(0, stance(0,-1)), (24, stance(1,0)), (48, stance(0,1)), (72, stance(1,0)), (96, stance(0,-1))])

    # ---------- locomotion ----------
    def stride(a, knee, arm_s, elbow, lean, bob, twist):
        def pose(p):
            L, R = math.sin(p), -math.sin(p); lift = lambda s: max(0, math.cos(p if s > 0 else p+math.pi))
            d = {'hips': dict(dz=-bob*abs(math.cos(p))+bob*.3, f=lean*.5, z=twist*math.sin(p)), 'spine': dict(f=lean, z=-twist*.8*math.sin(p)), 'chest': dict(f=lean*.4, z=-twist*.5*math.sin(p)), 'head': dict(f=-lean*1.2),
                 'thigh.L': dict(f=a*L, o=3), 'shin.L': dict(f=-(knee*(.25+.75*max(0, math.cos(p))))), 'foot.L': dict(f=a*.3*-L),
                 'thigh.R': dict(f=a*R, o=3), 'shin.R': dict(f=-(knee*(.25+.75*max(0, -math.cos(p))))), 'foot.R': dict(f=a*.3*-R),
                 'upper_arm.L': dict(f=arm_s*R-5, o=10), 'forearm.L': dict(f=elbow+10*lift(-1)), 'hand.L': dict(f=5),
                 'upper_arm.R': dict(f=arm_s*L-5, o=10), 'forearm.R': dict(f=elbow+10*lift(1)), 'hand.R': dict(f=5)}
            for side in HELD:                        # an arm holding a weapon / shield keeps its hold pose and only bobs a little
                for bone in (f'upper_arm.{side}', f'forearm.{side}', f'hand.{side}'): d[bone] = dict(HOLD[bone])
                d[f'upper_arm.{side}']['f'] = HOLD[f'upper_arm.{side}']['f'] + 3*math.sin(p*2)
            return d
        return pose
    w = stride(30, 55, 28, 38, 5, .05, 5); r = stride(52, 100, 65, 85, 16, .09, 8)
    clip('walk', [(i*3, w(i/8*math.tau)) for i in range(9)]); clip('run', [(i*2, r(i/8*math.tau)) for i in range(9)])

    # ---------- air ----------
    crouch = {'hips': dict(dz=-.22, f=10), 'spine': dict(f=18), 'chest': dict(f=8), 'head': dict(f=-12), 'thigh.L': dict(f=48), 'shin.L': dict(f=-80), 'foot.L': dict(f=-16), 'thigh.R': dict(f=40), 'shin.R': dict(f=-76), 'foot.R': dict(f=-14),
              'upper_arm.L': dict(f=-35, o=18), 'forearm.L': dict(f=20), 'upper_arm.R': dict(f=-28, o=20), 'forearm.R': dict(f=30)}
    stretch = {'hips': dict(dz=.06, f=-4), 'spine': dict(f=-6), 'chest': dict(f=-4), 'head': dict(f=6), 'thigh.L': dict(f=-6), 'shin.L': dict(f=-4), 'foot.L': dict(f=-35), 'thigh.R': dict(f=-4), 'shin.R': dict(f=-4), 'foot.R': dict(f=-35),
               'upper_arm.L': dict(f=150, o=25), 'forearm.L': dict(f=8), 'upper_arm.R': dict(f=165, o=18), 'forearm.R': dict(f=10)}
    rise = {'hips': dict(f=8), 'spine': dict(f=8), 'chest': dict(f=4), 'head': dict(f=-4), 'thigh.L': dict(f=62), 'shin.L': dict(f=-95), 'foot.L': dict(f=-10), 'thigh.R': dict(f=18), 'shin.R': dict(f=-55), 'foot.R': dict(f=-20),
            'upper_arm.L': dict(f=70, o=35), 'forearm.L': dict(f=40), 'upper_arm.R': dict(f=130, o=20, t=-10), 'forearm.R': dict(f=30)}
    apex = {'hips': dict(f=12), 'spine': dict(f=12), 'chest': dict(f=5), 'head': dict(f=-6), 'thigh.L': dict(f=60), 'shin.L': dict(f=-100), 'foot.L': dict(f=-8), 'thigh.R': dict(f=50), 'shin.R': dict(f=-95), 'foot.R': dict(f=-8),
            'upper_arm.L': dict(f=20, o=85), 'forearm.L': dict(f=20), 'upper_arm.R': dict(f=25, o=85), 'forearm.R': dict(f=20)}
    fall = {'hips': dict(f=2), 'spine': dict(f=-2), 'chest': dict(f=-3), 'head': dict(f=8), 'thigh.L': dict(f=18, o=8), 'shin.L': dict(f=-26), 'foot.L': dict(f=-30), 'thigh.R': dict(f=-6, o=8), 'shin.R': dict(f=-14), 'foot.R': dict(f=-34),
            'upper_arm.L': dict(f=-5, o=52), 'forearm.L': dict(f=32), 'upper_arm.R': dict(f=26, o=50), 'forearm.R': dict(f=38)}
    fall2 = {k: dict(v, f=v.get('f', 0) + (3 if 'arm' in k else -2)) for k, v in fall.items()}
    land = {'hips': dict(dz=-.3, f=14), 'spine': dict(f=22), 'chest': dict(f=6), 'head': dict(f=-16), 'thigh.L': dict(f=62), 'shin.L': dict(f=-105), 'foot.L': dict(f=-22), 'thigh.R': dict(f=54), 'shin.R': dict(f=-100), 'foot.R': dict(f=-20),
            'upper_arm.L': dict(f=45, o=40), 'forearm.L': dict(f=35), 'upper_arm.R': dict(f=50, o=34), 'forearm.R': dict(f=40)}
    clip('jump', [(0, crouch), (4, crouch), (7, stretch), (12, rise), (18, apex)])
    clip('fall', [(0, apex), (6, fall), (14, fall2), (22, fall)])
    clip('land', [(0, fall), (3, land), (9, land), (16, ST)])

    # ---------- reactions ----------
    hurt = {'hips': dict(dz=-.05, f=-8), 'spine': dict(f=-16), 'chest': dict(f=-12), 'head': dict(f=-22, z=8), 'upper_arm.L': dict(f=-20, o=50), 'forearm.L': dict(f=30), 'upper_arm.R': dict(f=0, o=60), 'forearm.R': dict(f=30),
            'thigh.L': dict(f=-12), 'shin.L': dict(f=-18), 'thigh.R': dict(f=16), 'shin.R': dict(f=-30)}
    clip('hurt', [(0, ST), (3, hurt), (10, hurt), (18, ST)])
    GUARD = {
     'sword': {'upper_arm.L': dict(f=88, o=-10), 'forearm.L': dict(f=88), 'hand.L': dict(f=10), 'upper_arm.R': dict(f=96, o=-10, t=-20), 'forearm.R': dict(f=90)},
     'swordshield': {'upper_arm.L': dict(f=70, o=-8), 'forearm.L': dict(f=100, t=-90), 'upper_arm.R': dict(f=40, o=24), 'forearm.R': dict(f=60)},
     'fist': {'upper_arm.L': dict(f=62, o=-12), 'forearm.L': dict(f=135), 'upper_arm.R': dict(f=64, o=-12), 'forearm.R': dict(f=138)},
     'gun': {'upper_arm.L': dict(f=80, o=-6), 'forearm.L': dict(f=70), 'upper_arm.R': dict(f=88, o=-4), 'forearm.R': dict(f=20)},
     'kick': {'upper_arm.L': dict(f=70, o=-14), 'forearm.L': dict(f=112), 'upper_arm.R': dict(f=70, o=-14), 'forearm.R': dict(f=112), 'thigh.R': dict(f=78), 'shin.R': dict(f=-95)},
     'staff': {'upper_arm.L': dict(f=78, o=-6), 'forearm.L': dict(f=62), 'upper_arm.R': dict(f=70, o=-8), 'forearm.R': dict(f=56)},
    }[style]
    gd = O(ST, dict({'hips': dict(dz=-.08, f=6), 'spine': dict(f=10), 'chest': dict(f=4), 'head': dict(f=-6), 'thigh.L': dict(f=26, o=8), 'shin.L': dict(f=-34), 'thigh.R': dict(f=-12, o=8), 'shin.R': dict(f=-18)}, **GUARD))
    clip('guard', [(0, ST), (4, gd), (12, gd)])
    clip('carry', [(0, ST), (6, O(ST, {'upper_arm.L': dict(f=165, o=14), 'forearm.L': dict(f=8), 'upper_arm.R': dict(f=165, o=14), 'forearm.R': dict(f=8), 'spine': dict(f=-5), 'head': dict(f=-6)})), (12, O(ST, {'upper_arm.L': dict(f=165, o=14), 'forearm.L': dict(f=8), 'upper_arm.R': dict(f=165, o=14), 'forearm.R': dict(f=8), 'spine': dict(f=-5)}))])
    grab_p = O(ST, {'hips': dict(dz=-.1, f=8), 'spine': dict(f=16), 'upper_arm.L': dict(f=85, o=8), 'forearm.L': dict(f=8), 'upper_arm.R': dict(f=85, o=8), 'forearm.R': dict(f=8), 'thigh.L': dict(f=44), 'shin.L': dict(f=-44), 'thigh.R': dict(f=-26)})
    clip('grab', [(0, ST), (5, O(ST, {'upper_arm.L': dict(f=40, o=24), 'upper_arm.R': dict(f=40, o=24), 'forearm.L': dict(f=50), 'forearm.R': dict(f=50)})), (9, grab_p), (15, grab_p), (22, ST)])

    # ---------- attacks ----------
    TW = lambda z, f=0: {'hips': dict(dz=-.08, z=z, f=f*.4), 'spine': dict(f=f, z=z*.9), 'chest': dict(z=z*.9, f=f*.3), 'head': dict(z=-z*.6, f=-f*.5)}
    def atk(name, wind, hit, follow):
        clip(name, [(0, ST), (5, O(ST, wind)), (9, O(ST, hit)), (15, O(ST, follow)), (22, ST)])
    LUNGE = {'thigh.L': dict(f=46), 'shin.L': dict(f=-46), 'thigh.R': dict(f=-28), 'shin.R': dict(f=-10)}
    BACK = {'thigh.L': dict(f=-18, o=10), 'thigh.R': dict(f=26), 'shin.R': dict(f=-30)}
    def M_(*ds):
        out = {}
        for d in ds:
            for k, v in d.items(): out[k] = dict(out.get(k, {}), **v)
        return out
    if style == 'sword':
        atk('attack_a', M_(TW(-14,-8), BACK, {'upper_arm.R': dict(f=150, o=45, t=-30), 'forearm.R': dict(f=70), 'hand.R': dict(f=-30), 'upper_arm.L': dict(f=40, o=40), 'forearm.L': dict(f=40)}),
            M_(TW(16,22), LUNGE, {'upper_arm.R': dict(f=62, o=-4, t=20), 'forearm.R': dict(f=12), 'hand.R': dict(f=5), 'upper_arm.L': dict(f=-30, o=60), 'forearm.L': dict(f=25)}),
            M_(TW(14,20), LUNGE, {'upper_arm.R': dict(f=58, o=-4, t=20), 'forearm.R': dict(f=10), 'upper_arm.L': dict(f=-30, o=60), 'forearm.L': dict(f=25)}))
        atk('attack_b', M_(TW(18,4), {'upper_arm.R': dict(f=20, o=-50, t=30), 'forearm.R': dict(f=40), 'upper_arm.L': dict(f=60, o=30), 'forearm.L': dict(f=50), 'thigh.L': dict(f=-10), 'thigh.R': dict(f=18), 'shin.R': dict(f=-22)}),
            M_(TW(-18,16), LUNGE, {'upper_arm.R': dict(f=82, o=70, t=-20), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=-10, o=50), 'forearm.L': dict(f=30)}),
            M_(TW(-16,14), LUNGE, {'upper_arm.R': dict(f=78, o=64), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=-10, o=50)}))
        atk('heavy', M_(TW(-6,-14), BACK, {'upper_arm.R': dict(f=175, o=20, t=-30), 'forearm.R': dict(f=40), 'upper_arm.L': dict(f=160, o=30), 'forearm.L': dict(f=40)}),
            M_(TW(4,34), LUNGE, {'upper_arm.R': dict(f=48, o=0, t=10), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=44, o=30), 'forearm.L': dict(f=20)}),
            M_(TW(2,30), LUNGE, {'upper_arm.R': dict(f=44), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=40, o=30)}))
        atk('dash', M_(TW(-20,6), BACK, {'upper_arm.R': dict(f=70, o=10), 'forearm.R': dict(f=100), 'upper_arm.L': dict(f=-30, o=60)}),
            M_(TW(14,30), {'thigh.L': dict(f=60), 'shin.L': dict(f=-30), 'thigh.R': dict(f=-40), 'shin.R': dict(f=-5)}, {'upper_arm.R': dict(f=86, o=2), 'forearm.R': dict(f=4), 'upper_arm.L': dict(f=-40, o=70)}),
            M_(TW(12,28), {'thigh.L': dict(f=58), 'shin.L': dict(f=-30), 'thigh.R': dict(f=-38)}, {'upper_arm.R': dict(f=84), 'forearm.R': dict(f=4), 'upper_arm.L': dict(f=-40, o=70)}))
        atk('shoot', {}, {}, {}); atk('skill', M_(TW(-30,4), {'upper_arm.R': dict(f=100, o=60), 'upper_arm.L': dict(f=60, o=60)}), M_(TW(30,10), {'upper_arm.R': dict(f=90, o=80), 'upper_arm.L': dict(f=70, o=80)}), M_(TW(-30,10), {'upper_arm.R': dict(f=90, o=80)}))
    elif style == 'swordshield':
        atk('attack_a', M_(TW(-10,-4), BACK, {'upper_arm.R': dict(f=26, o=22, t=-10), 'forearm.R': dict(f=100)}),
            M_(TW(14,20), LUNGE, {'upper_arm.R': dict(f=84, o=6, t=0), 'forearm.R': dict(f=4), 'hand.R': dict(f=0)}), M_(TW(12,18), LUNGE, {'upper_arm.R': dict(f=80, o=8), 'forearm.R': dict(f=6)}))
        atk('attack_b', M_(TW(14,0), {'upper_arm.L': dict(f=20, o=20), 'forearm.L': dict(f=110, t=-70), 'thigh.R': dict(f=20)}),
            M_(TW(-14,18), LUNGE, {'upper_arm.L': dict(f=88, o=4), 'forearm.L': dict(f=20, t=-80)}), M_(TW(-12,16), LUNGE, {'upper_arm.L': dict(f=82, o=6), 'forearm.L': dict(f=26, t=-80)}))
        atk('heavy', M_(TW(-6,-14), BACK, {'upper_arm.R': dict(f=170, o=14, t=-30), 'forearm.R': dict(f=40), 'upper_arm.L': dict(f=70, o=10), 'forearm.L': dict(f=100, t=-90)}),
            M_(TW(4,32), LUNGE, {'upper_arm.R': dict(f=46, t=10), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=70), 'forearm.L': dict(f=100, t=-90)}), M_(TW(2,28), LUNGE, {'upper_arm.R': dict(f=44), 'forearm.R': dict(f=8)}))
        atk('dash', M_(TW(8,8), BACK, {'upper_arm.L': dict(f=40, o=10), 'forearm.L': dict(f=100, t=-90)}),
            M_(TW(0,30), {'thigh.L': dict(f=60), 'shin.L': dict(f=-30), 'thigh.R': dict(f=-40)}, {'upper_arm.L': dict(f=88), 'forearm.L': dict(f=40, t=-85), 'upper_arm.R': dict(f=40, o=30)}),
            M_(TW(0,26), {'thigh.L': dict(f=56), 'shin.L': dict(f=-30), 'thigh.R': dict(f=-36)}, {'upper_arm.L': dict(f=86), 'forearm.L': dict(f=40, t=-85)}))
        atk('shoot', {}, {}, {}); atk('skill', M_(TW(0,-12), {'upper_arm.L': dict(f=165, o=20), 'upper_arm.R': dict(f=165, o=20), 'forearm.L': dict(f=20), 'forearm.R': dict(f=20), 'thigh.L': dict(f=-10)}), M_(TW(0,36), {'upper_arm.L': dict(f=50), 'upper_arm.R': dict(f=50), 'forearm.L': dict(f=10), 'forearm.R': dict(f=10), 'thigh.L': dict(f=50), 'shin.L': dict(f=-50), 'hips': dict(dz=-.2)}), M_(TW(0,30), {'upper_arm.L': dict(f=50), 'upper_arm.R': dict(f=50), 'thigh.L': dict(f=48), 'hips': dict(dz=-.2)}))
    elif style == 'fist':
        atk('attack_a', M_(TW(-12,2), {'upper_arm.R': dict(f=20, o=24), 'forearm.R': dict(f=130), 'thigh.L': dict(f=-12)}),
            M_(TW(22,16), LUNGE, {'upper_arm.R': dict(f=92, o=4), 'forearm.R': dict(f=3)}), M_(TW(20,14), LUNGE, {'upper_arm.R': dict(f=88, o=6), 'forearm.R': dict(f=6)}))
        atk('attack_b', M_(TW(20,0), {'upper_arm.L': dict(f=40, o=60), 'forearm.L': dict(f=120), 'thigh.R': dict(f=10)}),
            M_(TW(-26,14), LUNGE, {'upper_arm.L': dict(f=86, o=70), 'forearm.L': dict(f=70)}), M_(TW(-24,12), LUNGE, {'upper_arm.L': dict(f=84, o=66), 'forearm.L': dict(f=72)}))
        atk('heavy', M_(TW(-26,-12), BACK, {'upper_arm.R': dict(f=165, o=40, t=-40), 'forearm.R': dict(f=60), 'upper_arm.L': dict(f=50, o=20)}),
            M_(TW(24,36), LUNGE, {'upper_arm.R': dict(f=60, o=-2), 'forearm.R': dict(f=4), 'upper_arm.L': dict(f=-20, o=40)}), M_(TW(22,32), LUNGE, {'upper_arm.R': dict(f=56), 'forearm.R': dict(f=6)}))
        atk('dash', M_(TW(-20,8), BACK, {'upper_arm.R': dict(f=30, o=20), 'forearm.R': dict(f=130)}),
            M_(TW(20,34), {'thigh.L': dict(f=60), 'shin.L': dict(f=-30), 'thigh.R': dict(f=-40)}, {'upper_arm.R': dict(f=90), 'forearm.R': dict(f=3), 'upper_arm.L': dict(f=-30, o=50)}),
            M_(TW(18,30), {'thigh.L': dict(f=58), 'shin.L': dict(f=-30), 'thigh.R': dict(f=-38)}, {'upper_arm.R': dict(f=88), 'forearm.R': dict(f=4)}))
        atk('shoot', {}, {}, {})
        clip('skill', [(0, O(ST, M_(TW(-10,10), {'upper_arm.R': dict(f=92), 'forearm.R': dict(f=3), 'upper_arm.L': dict(f=34, o=20), 'forearm.L': dict(f=120)}))),
                       (4, O(ST, M_(TW(10,10), {'upper_arm.L': dict(f=92), 'forearm.L': dict(f=3), 'upper_arm.R': dict(f=34, o=20), 'forearm.R': dict(f=120)}))),
                       (8, O(ST, M_(TW(-10,10), {'upper_arm.R': dict(f=92), 'forearm.R': dict(f=3), 'upper_arm.L': dict(f=34, o=20), 'forearm.L': dict(f=120)})))])
    elif style == 'gun':
        recoil = {'upper_arm.R': dict(f=94, o=4), 'forearm.R': dict(f=14), 'hand.R': dict(f=-18)}
        aim = {'upper_arm.R': dict(f=86, o=4), 'forearm.R': dict(f=8)}
        atk('shoot', M_(TW(4,6), aim, {'upper_arm.L': dict(f=20, o=24)}), M_(TW(0,-6), recoil, {'upper_arm.L': dict(f=20, o=24), 'spine': dict(f=-6)}), M_(TW(0,0), aim))
        atk('attack_a', M_(TW(-16,0), {'upper_arm.R': dict(f=100, o=60), 'forearm.R': dict(f=60)}), M_(TW(18,12), LUNGE, {'upper_arm.R': dict(f=70, o=-10), 'forearm.R': dict(f=20)}), M_(TW(16,10), LUNGE, {'upper_arm.R': dict(f=66, o=-8), 'forearm.R': dict(f=24)}))
        atk('attack_b', M_(TW(16,0), {'upper_arm.L': dict(f=50, o=60), 'forearm.L': dict(f=90)}), M_(TW(-16,12), LUNGE, {'upper_arm.L': dict(f=80, o=-10), 'forearm.L': dict(f=20)}), M_(TW(-14,10), LUNGE, {'upper_arm.L': dict(f=76), 'forearm.L': dict(f=24)}))
        atk('heavy', M_(TW(0,-16), BACK, {'upper_arm.R': dict(f=165, o=20), 'forearm.R': dict(f=40)}), M_(TW(4,34), LUNGE, {'upper_arm.R': dict(f=60), 'forearm.R': dict(f=10)}), M_(TW(2,30), LUNGE, {'upper_arm.R': dict(f=56)}))
        atk('dash', M_(TW(-10,4), BACK, {'upper_arm.R': dict(f=60, o=10), 'forearm.R': dict(f=60)}), M_(TW(8,28), {'thigh.L': dict(f=58), 'shin.L': dict(f=-30), 'thigh.R': dict(f=-36)}, aim), M_(TW(6,26), {'thigh.L': dict(f=56), 'shin.L': dict(f=-30)}, aim))
        clip('skill', [(0, O(ST, M_({'upper_arm.R': dict(f=150, o=20), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=100, o=10), 'forearm.L': dict(f=10), 'spine': dict(f=-8)}))),
                       (3, O(ST, M_({'upper_arm.R': dict(f=160, o=20), 'forearm.R': dict(f=8, ), 'upper_arm.L': dict(f=90, o=10), 'forearm.L': dict(f=10), 'spine': dict(f=-12)}))),
                       (6, O(ST, M_({'upper_arm.R': dict(f=150, o=20), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=100, o=10), 'forearm.L': dict(f=10), 'spine': dict(f=-8)})))])
    elif style == 'kick':
        def kick(side, hit_f, ang):   # side 'R' / 'L'
            o = 'L' if side == 'R' else 'R'
            return ({f'thigh.{side}': dict(f=-10), f'shin.{side}': dict(f=-100), f'foot.{side}': dict(f=-20), f'thigh.{o}': dict(f=6), 'hips': dict(dz=-.12, z=-ang)},
                    {f'thigh.{side}': dict(f=hit_f), f'shin.{side}': dict(f=-6), f'foot.{side}': dict(f=-30), f'thigh.{o}': dict(f=8), f'shin.{o}': dict(f=-18), 'hips': dict(dz=-.05, z=ang), 'spine': dict(f=-14, z=ang)},
                    {f'thigh.{side}': dict(f=hit_f-8), f'shin.{side}': dict(f=-12), f'thigh.{o}': dict(f=8), 'spine': dict(f=-10)})
        w_, h_, f_ = kick('R', 96, 8); atk('attack_a', w_, h_, f_)
        w_, h_, f_ = kick('L', 90, -22); atk('attack_b', O({}, w_), M_(h_, {'spine': dict(z=-20)}), f_)
        w_, h_, f_ = kick('R', 172, 6); atk('heavy', M_(w_, {'thigh.R': dict(f=100), 'shin.R': dict(f=-110)}), M_(h_, {'spine': dict(f=-20)}), f_)
        w_, h_, f_ = kick('R', 80, 10); atk('dash', M_(w_, {'hips': dict(dz=.05)}), M_(h_, {'hips': dict(dz=.0, f=-26), 'thigh.L': dict(f=-40), 'shin.L': dict(f=-90), 'upper_arm.L': dict(f=-20, o=60), 'upper_arm.R': dict(f=-20, o=60)}), f_)
        atk('shoot', {}, {}, {})
        clip('skill', [(0, O(ST, {'thigh.R': dict(f=100), 'shin.R': dict(f=-20), 'hips': dict(z=40, dz=-.05), 'spine': dict(z=20, f=-10), 'upper_arm.L': dict(f=-10, o=70), 'upper_arm.R': dict(f=-10, o=70)})),
                       (4, O(ST, {'thigh.L': dict(f=100), 'shin.L': dict(f=-20), 'hips': dict(z=-40, dz=-.05), 'spine': dict(z=-20, f=-10), 'upper_arm.L': dict(f=-10, o=70), 'upper_arm.R': dict(f=-10, o=70)})),
                       (8, O(ST, {'thigh.R': dict(f=100), 'shin.R': dict(f=-20), 'hips': dict(z=40, dz=-.05), 'spine': dict(z=20, f=-10), 'upper_arm.L': dict(f=-10, o=70), 'upper_arm.R': dict(f=-10, o=70)}))])
    elif style == 'staff':
        atk('attack_a', M_(TW(24,0), {'upper_arm.R': dict(f=60, o=75, t=-20), 'forearm.R': dict(f=30), 'upper_arm.L': dict(f=40, o=30), 'forearm.L': dict(f=40)}),
            M_(TW(-26,12), LUNGE, {'upper_arm.R': dict(f=82, o=-30), 'forearm.R': dict(f=10), 'upper_arm.L': dict(f=-10, o=50)}), M_(TW(-24,10), LUNGE, {'upper_arm.R': dict(f=80, o=-34), 'forearm.R': dict(f=12)}))
        atk('attack_b', M_(TW(-22,0), {'upper_arm.R': dict(f=80, o=-35), 'forearm.R': dict(f=20), 'upper_arm.L': dict(f=40, o=30)}),
            M_(TW(24,12), LUNGE, {'upper_arm.R': dict(f=60, o=75), 'forearm.R': dict(f=26), 'upper_arm.L': dict(f=-10, o=50)}), M_(TW(22,10), LUNGE, {'upper_arm.R': dict(f=58, o=72)}))
        atk('heavy', M_(TW(0,-14), BACK, {'upper_arm.R': dict(f=170, o=14, t=-20), 'forearm.R': dict(f=30), 'upper_arm.L': dict(f=160, o=24), 'forearm.L': dict(f=30)}),
            M_(TW(0,34), LUNGE, {'upper_arm.R': dict(f=50), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=56, o=14)}), M_(TW(0,30), LUNGE, {'upper_arm.R': dict(f=46), 'forearm.R': dict(f=8)}))
        atk('shoot', M_(TW(8,6), {'upper_arm.R': dict(f=60, o=12), 'forearm.R': dict(f=60), 'upper_arm.L': dict(f=40, o=30)}), M_(TW(-6,10), {'upper_arm.R': dict(f=96, o=6), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=60, o=20), 'forearm.L': dict(f=20)}), M_(TW(-4,8), {'upper_arm.R': dict(f=92), 'forearm.R': dict(f=10)}))
        atk('dash', M_(TW(-14,6), BACK, {'upper_arm.R': dict(f=70, o=10), 'forearm.R': dict(f=70)}), M_(TW(10,28), {'thigh.L': dict(f=58), 'shin.L': dict(f=-30), 'thigh.R': dict(f=-36)}, {'upper_arm.R': dict(f=90), 'forearm.R': dict(f=6), 'upper_arm.L': dict(f=-30, o=60)}), M_(TW(8,26), {'thigh.L': dict(f=56), 'shin.L': dict(f=-30)}, {'upper_arm.R': dict(f=88)}))
        clip('skill', [(0, O(ST, {'upper_arm.R': dict(f=160, o=14), 'forearm.R': dict(f=20), 'upper_arm.L': dict(f=150, o=40), 'forearm.L': dict(f=20), 'spine': dict(f=-8), 'head': dict(f=-12), 'thigh.L': dict(f=4)})),
                       (6, O(ST, {'upper_arm.R': dict(f=170, o=18), 'forearm.R': dict(f=20), 'upper_arm.L': dict(f=165, o=44), 'forearm.L': dict(f=20), 'spine': dict(f=-12), 'head': dict(f=-16), 'hips': dict(dz=.04)})),
                       (12, O(ST, {'upper_arm.R': dict(f=160, o=14), 'forearm.R': dict(f=20), 'upper_arm.L': dict(f=150, o=40), 'forearm.L': dict(f=20), 'spine': dict(f=-8), 'head': dict(f=-12)}))])
    # ---------- export ----------
    bpy.ops.object.mode_set(mode='OBJECT'); arm.animation_data.action = bpy.data.actions['idle']
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'{cid}_anim.blend'))
    os.makedirs(MODELS, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, f'{cid}.glb'), export_format='GLB', export_apply=False, export_yup=True, export_animations=True, export_animation_mode='ACTIONS',
                              export_force_sampling=True, export_skins=True, export_all_influences=False, export_optimize_animation_size=True, export_morph=True)
    print('exported', cid)

ids = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
for cid in ids: run(cid)
