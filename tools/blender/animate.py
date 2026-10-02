import sys, math, os, bpy
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
from mathutils import Euler, Quaternion, Vector
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT, 'hongfan_rig.blend'))
arm = bpy.data.objects['Hongfan']; bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
FPS = 24; bpy.context.scene.render.fps = FPS
UP = {'hips','spine','chest','neck','head','root'}
REST = {b.name: b.matrix_local.to_quaternion() for b in arm.data.bones}
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'

def world_q(name, f=0, o=0, t=0, x=0, y=0, z=0):
    """Armature-space rotation. f: forward swing (tip towards the front), o: outward swing, t: twist about the bone axis; x/y/z raw degrees."""
    up = name in UP; side = 1 if name.endswith('.L') else -1 if name.endswith('.R') else 0
    rx = math.radians((f if up else -f) + x)
    ry = math.radians((-o*side if not up else 0) + y)
    rz = math.radians(z + (t if up else (t*side)))
    if name.startswith('foot'): rx = math.radians(-f + x)           # feet: positive f lifts the toes
    return Euler((rx, ry, rz), 'XYZ').to_quaternion()

def key(frame, pose):
    for pb in arm.pose.bones:
        spec = pose.get(pb.name, {})
        qw = world_q(pb.name, **{k: v for k, v in spec.items() if k not in ('dz','dy','dx')})
        r = REST[pb.name]
        pb.rotation_quaternion = r.inverted() @ qw @ r
        loc = Vector((spec.get('dx',0), spec.get('dy',0), spec.get('dz',0)))   # bone-local translation (hips only)
        pb.location = loc
        pb.keyframe_insert('rotation_quaternion', frame=frame); pb.keyframe_insert('location', frame=frame)

def new_action(name):
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act; return act

def clip(name, frames, loop=True):
    act = new_action(name)
    for fr, pose in frames: key(fr, pose)
    for fc in act.fcurves:
        for kp in fc.keyframe_points: kp.interpolation = 'BEZIER'; kp.handle_left_type = kp.handle_right_type = 'AUTO_CLAMPED'
    act.use_fake_user = True
    return act

def mirror(p):
    out = {}
    for k, v in p.items():
        if k.endswith('.L'): out[k[:-2]+'.R'] = v
        elif k.endswith('.R'): out[k[:-2]+'.L'] = v
        else: out[k] = v
    return out

# --- idle: sword up on guard, weight shifting, breathing ---
def idle(b, sway):
    return {'hips': dict(dz=-.03*b + .0, z=sway*3), 'spine': dict(f=3+b*2, z=-sway*2), 'chest': dict(f=1+b*2, z=-sway*2), 'head': dict(f=-3-b, z=sway*2),
            'upper_arm.L': dict(f=-8+b*2, o=14), 'forearm.L': dict(f=22), 'hand.L': dict(f=5),
            'upper_arm.R': dict(f=20+b*2, o=28, t=-10), 'forearm.R': dict(f=44), 'hand.R': dict(f=-10),
            'thigh.L': dict(f=6, o=6), 'shin.L': dict(f=-10), 'foot.L': dict(f=4), 'thigh.R': dict(f=-8, o=7), 'shin.R': dict(f=-14), 'foot.R': dict(f=6)}
clip('idle', [(0, idle(0, -1)), (24, idle(1, 0)), (48, idle(0, 1)), (72, idle(1, 0)), (96, idle(0, -1))])

# --- walk / run cycles: contact, down, passing, up on each side ---
def stride(a, knee, arm_s, elbow, lean, bob, twist, ground_lift=0):
    ph = lambda p: math.sin(p)
    def pose(p):
        L, R = math.sin(p), -math.sin(p)
        lift = lambda s: max(0, math.cos(p if s>0 else p+math.pi))
        return {'hips': dict(dz=-bob*abs(math.cos(p))+bob*.3, f=lean*.5, z=twist*math.sin(p)), 'spine': dict(f=lean, z=-twist*.8*math.sin(p)), 'chest': dict(f=lean*.4, z=-twist*.5*math.sin(p)), 'head': dict(f=-lean*1.2),
            'thigh.L': dict(f=a*L, o=3), 'shin.L': dict(f=-(knee*(.25+.75*max(0, math.cos(p)))) ), 'foot.L': dict(f=a*.3*-L),
            'thigh.R': dict(f=a*R, o=3), 'shin.R': dict(f=-(knee*(.25+.75*max(0, -math.cos(p)))) ), 'foot.R': dict(f=a*.3*-R),
            'upper_arm.L': dict(f=arm_s*R-5, o=10), 'forearm.L': dict(f=elbow+10*lift(-1)), 'hand.L': dict(f=5),
            'upper_arm.R': dict(f=arm_s*.4*L+22, o=26, t=-10), 'forearm.R': dict(f=46), 'hand.R': dict(f=-10)}
    return pose
w = stride(30, 55, 28, 38, 5, .05, 5); r = stride(52, 100, 65, 85, 16, .09, 8)
n = 8
clip('walk', [(i*3, w(i/n*math.tau)) for i in range(n+1)])
n = 8
clip('run', [(i*2, r(i/n*math.tau)) for i in range(n+1)])

# --- jump: crouch -> launch stretch -> rise (tuck) ; fall ; land ---
crouch = {'hips': dict(dz=-.22, f=10), 'spine': dict(f=18), 'chest': dict(f=8), 'head': dict(f=-12), 'thigh.L': dict(f=48), 'shin.L': dict(f=-80), 'foot.L': dict(f=-16), 'thigh.R': dict(f=40), 'shin.R': dict(f=-76), 'foot.R': dict(f=-14),
          'upper_arm.L': dict(f=-35, o=18), 'forearm.L': dict(f=20), 'upper_arm.R': dict(f=-28, o=20), 'forearm.R': dict(f=30)}
stretch = {'hips': dict(dz=.06, f=-4), 'spine': dict(f=-6), 'chest': dict(f=-4), 'head': dict(f=6), 'thigh.L': dict(f=-6), 'shin.L': dict(f=-4), 'foot.L': dict(f=-35), 'thigh.R': dict(f=-4), 'shin.R': dict(f=-4), 'foot.R': dict(f=-35),
           'upper_arm.L': dict(f=150, o=25), 'forearm.L': dict(f=8), 'upper_arm.R': dict(f=165, o=18), 'forearm.R': dict(f=10)}
rise = {'hips': dict(dz=.0, f=8), 'spine': dict(f=8), 'chest': dict(f=4), 'head': dict(f=-4), 'thigh.L': dict(f=62), 'shin.L': dict(f=-95), 'foot.L': dict(f=-10), 'thigh.R': dict(f=18), 'shin.R': dict(f=-55), 'foot.R': dict(f=-20),
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
clip('land', [(0, fall), (3, land), (9, land), (16, idle(0, 0))])

# --- attacks: sword slash a/b, plus a kick-style heavy ---
slash_a = [(0, idle(0, 0)),
 (5, {'hips': dict(dz=-.06, z=-14), 'spine': dict(f=-8, z=-12), 'chest': dict(z=-14), 'head': dict(z=10, f=-4), 'upper_arm.R': dict(f=150, o=45, t=-30), 'forearm.R': dict(f=70), 'hand.R': dict(f=-30),
       'upper_arm.L': dict(f=40, o=40), 'forearm.L': dict(f=40), 'thigh.L': dict(f=-22, o=10), 'shin.L': dict(f=-8), 'thigh.R': dict(f=28), 'shin.R': dict(f=-34)}),
 (9, {'hips': dict(dz=-.1, z=16, f=6), 'spine': dict(f=22, z=14), 'chest': dict(f=8, z=14), 'head': dict(z=-10, f=-8), 'upper_arm.R': dict(f=62, o=-4, t=20), 'forearm.R': dict(f=12), 'hand.R': dict(f=5),
       'upper_arm.L': dict(f=-30, o=60), 'forearm.L': dict(f=25), 'thigh.L': dict(f=50), 'shin.L': dict(f=-50), 'thigh.R': dict(f=-30, o=8), 'shin.R': dict(f=-10)}),
 (15, {'hips': dict(dz=-.08, z=14, f=5), 'spine': dict(f=20, z=12), 'chest': dict(f=6, z=12), 'head': dict(z=-8, f=-6), 'upper_arm.R': dict(f=58, o=-4, t=20), 'forearm.R': dict(f=10), 'upper_arm.L': dict(f=-30, o=60), 'forearm.L': dict(f=25),
       'thigh.L': dict(f=48), 'shin.L': dict(f=-48), 'thigh.R': dict(f=-28), 'shin.R': dict(f=-10)}),
 (22, idle(0, 0))]
clip('slash_a', slash_a)
slash_b = [(0, idle(0, 0)),
 (5, {'hips': dict(z=18), 'spine': dict(f=4, z=16), 'chest': dict(z=18), 'head': dict(z=-12), 'upper_arm.R': dict(f=20, o=-50, t=30), 'forearm.R': dict(f=40), 'upper_arm.L': dict(f=60, o=30), 'forearm.L': dict(f=50),
       'thigh.L': dict(f=-10), 'thigh.R': dict(f=18), 'shin.R': dict(f=-22)}),
 (9, {'hips': dict(dz=-.1, z=-18), 'spine': dict(f=16, z=-16), 'chest': dict(f=4, z=-16), 'head': dict(z=12), 'upper_arm.R': dict(f=82, o=70, t=-20), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=-10, o=50), 'forearm.L': dict(f=30),
       'thigh.L': dict(f=40), 'shin.L': dict(f=-40), 'thigh.R': dict(f=-28), 'shin.R': dict(f=-8)}),
 (15, {'hips': dict(dz=-.08, z=-16), 'spine': dict(f=14, z=-14), 'chest': dict(z=-14), 'head': dict(z=10), 'upper_arm.R': dict(f=78, o=64), 'forearm.R': dict(f=8), 'upper_arm.L': dict(f=-10, o=50),
       'thigh.L': dict(f=38), 'shin.L': dict(f=-38), 'thigh.R': dict(f=-26)}),
 (22, idle(0, 0))]
clip('slash_b', slash_b)

# --- hurt, guard (sword crossed in front), block, knockdown pose ---
hurt = {'hips': dict(dz=-.05, f=-8), 'spine': dict(f=-16), 'chest': dict(f=-12), 'head': dict(f=-22, z=8), 'upper_arm.L': dict(f=-20, o=50), 'forearm.L': dict(f=30), 'upper_arm.R': dict(f=0, o=60), 'forearm.R': dict(f=30),
        'thigh.L': dict(f=-12), 'shin.L': dict(f=-18), 'thigh.R': dict(f=16), 'shin.R': dict(f=-30)}
clip('hurt', [(0, idle(0, 0)), (3, hurt), (10, hurt), (18, idle(0, 0))])
guard = {'hips': dict(dz=-.08, f=6), 'spine': dict(f=10), 'chest': dict(f=4), 'head': dict(f=-6), 'upper_arm.L': dict(f=88, o=-10), 'forearm.L': dict(f=88), 'hand.L': dict(f=10), 'upper_arm.R': dict(f=96, o=-10, t=-20), 'forearm.R': dict(f=90),
         'thigh.L': dict(f=26, o=8), 'shin.L': dict(f=-34), 'thigh.R': dict(f=-12, o=8), 'shin.R': dict(f=-18)}
clip('guard', [(0, idle(0, 0)), (4, guard), (12, guard)])

# --- export ---
bpy.ops.object.mode_set(mode='OBJECT')
arm.animation_data.action = bpy.data.actions['idle']
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'hongfan_anim.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'hongfan.glb'), export_format='GLB', export_apply=False, export_yup=True,
                          export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True, export_skins=True, export_all_influences=False,
                          export_optimize_animation_size=True)
print('exported')
