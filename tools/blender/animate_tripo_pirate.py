"""Bake Tripo armature-space IK poses and a wrist-skinned cutlass.

This scan faces Blender +X, with +Y to its right, +Z up. In Three.js its
exported root must turn -pi/2 around Y to face game +Z. Bone rolls differ;
use armature-space IK rather than guessing mirrored local Euler angles.
Run: Blender -b --factory-startup --python tools/blender/animate_tripo_pirate.py
"""
from pathlib import Path
import math
import bpy
import bmesh
from mathutils import Vector, Quaternion, Matrix

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'models/tripo-pirate/tripo-out/tripo-pirate-rig-ebbdda11/model.glb'
OUTPUT = ROOT / 'models/tripo-pirate-animated.glb'
BLEND = ROOT / 'models/tripo-pirate-animated.blend'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
rest = {b.name: b.matrix_local.copy() for b in arm.data.bones}
pb = arm.pose.bones
for b in pb: b.rotation_mode = 'QUATERNION'
arm.animation_data_create()
bpy.context.scene.render.fps = 24
R = 'tripo::0_Right_Limb_'
L = 'tripo::0_Left_Limb_'
RL = 'tripo::1_Right_Limb_'
LL = 'tripo::1_Left_Limb_'
HAND = R + '2'
ROOT_BONE = 'tripo::Root'
UP = Vector((0, 0, 1))
READY_BLADE = Vector((.68, -.12, .73)).normalized()
hand_ready = None

def clean_scan():
    """Find components across UV seams, without welding away the texture UVs."""
    ob=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('tripo'))
    adjacency=[[] for v in ob.data.vertices];coincident={}
    for v in ob.data.vertices:
        key=tuple(round(c,5) for c in v.co)
        if key in coincident:
            j=coincident[key];adjacency[v.index].append(j);adjacency[j].append(v.index)
        else: coincident[key]=v.index
    for edge in ob.data.edges:
        a,b=edge.vertices;adjacency[a].append(b);adjacency[b].append(a)
    seen=set();remove=set();blade_parts=0
    def weights(index,target,blend=1):
        v=ob.data.vertices[index];old=[(g.group,g.weight) for g in v.groups]
        for group,value in old:
            ob.vertex_groups[group].remove([index])
            if blend<1: ob.vertex_groups[group].add([index],value*(1-blend),'REPLACE')
        group=ob.vertex_groups.get(target) or ob.vertex_groups.new(name=target)
        group.add([index],blend,'ADD')
    for start in range(len(adjacency)):
        if start in seen: continue
        stack=[start];seen.add(start);part=[]
        while stack:
            i=stack.pop();part.append(i)
            for j in adjacency[i]:
                if j not in seen: seen.add(j);stack.append(j)
        coords=[ob.matrix_world@ob.data.vertices[i].co for i in part]
        lo=Vector([min(v[a] for v in coords) for a in range(3)])
        hi=Vector([max(v[a] for v in coords) for a in range(3)])
        if hi.x>.30 and hi.z<.50:
            remove.update(part);blade_parts+=1
        elif lo.y>.09 and lo.z>.42 and hi.z<.60:
            # The two decorative scabbard grips stay rigidly on the belt.
            for i in part: weights(i,ROOT_BONE)
        elif len(part)>500 and hi.z<.26:
            for i,v in zip(part,coords):
                prefix=RL if v.y>0 else LL
                blend=max(0,min(1,(.19-v.z)/.065))
                weights(i,prefix+'1')
                if blend: weights(i,prefix+'2',blend)
    assert blade_parts==1 and len(remove)==159, 'Source topology changed; inspect before removing the old blade'
    bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.verts[i] for i in remove],context='VERTS')
    bm.to_mesh(ob.data);bm.free();ob.data.update()
    print('CLEANED old blade vertices',len(remove))

clean_scan()

def update(): bpy.context.view_layer.update()
def smooth(x): return x*x*(3-2*x)
def mix(a,b,t): return Vector(a).lerp(Vector(b),t)
def orient(name, q):
    b = pb[name]
    b.matrix = Matrix.Translation(b.head) @ q.to_matrix().to_4x4()
    update()

def point(name, direction):
    basis = rest[name].to_quaternion()
    old = basis @ Vector((0,1,0))
    orient(name, old.rotation_difference(direction.normalized()) @ basis)

def limb(prefix, target, pole):
    """Two-bone IK; both knee poles point forward, not opposite directions."""
    a,b = pb[prefix+'0'], pb[prefix+'1']
    start = a.head.copy()
    v = target-start
    d = min(max(v.length, abs(a.length-b.length)+.0001), a.length+b.length-.0001)
    axis = v.normalized()
    bend = Vector(pole)-axis*Vector(pole).dot(axis)
    bend.normalize()
    along = (a.length*a.length-b.length*b.length+d*d)/(2*d)
    elbow = start+axis*along+bend*math.sqrt(max(0,a.length*a.length-along*along))
    end = start+axis*d
    point(a.name, elbow-start)
    point(b.name, end-pb[b.name].head)

def sample(keys,t):
    for (t0,v0),(t1,v1) in zip(keys,keys[1:]):
        if t<=t1: return mix(v0,v1,smooth(max(0,(t-t0)/(t1-t0))))
    return Vector(keys[-1][1])

def pose(name,t):
    global hand_ready
    for b in pb: b.matrix_basis.identity()
    phase=t*math.tau
    drop=-.045
    yaw=0
    right=Vector((.145,.025,-.155))
    left=Vector((.075,-.035,-.19))
    blade=READY_BLADE.copy()
    feet=[Vector((-.19,.135,-.4191)),Vector((-.19,-.135,-.4191))]
    if name in ('walk','run'):
        running=name=='run'
        amplitude=.23 if running else .18
        duty=.48 if running else .6
        drop=-.065 if running else -.052
        for i in range(2):
            u=(t+i*.5)%1
            if u<duty:
                feet[i].x+=amplitude*(1-2*u/duty)
            else:
                swing=(u-duty)/(1-duty)
                feet[i].x+=amplitude*(-1+2*smooth(swing))
                feet[i].z+=math.sin(math.pi*swing)*(.105 if running else .075)
        left.x+=math.sin(phase)*(.08 if running else .05)
        right.x-=math.sin(phase)*.018
    elif name in ('attack_a','attack_b','heavy','dash','shoot','skill','grab'):
        side=-1 if name=='attack_b' else 1
        right=sample([(0,right),(.23,(-.055,.16*side,.005)),(.41,(.23,-.025,-.045)),(.7,(.12,-.165*side,-.08)),(1,right)],t)
        blade=sample([(0,blade),(.23,(-.1,.88*side,.65)),(.41,(1,-.16*side,.08)),(.7,(.1,-1*side,.3)),(1,blade)],t).normalized()
        yaw=math.radians(18)*math.sin(t*math.tau)*side
        left=Vector((.045,-.06,-.17))
        if name in ('heavy','skill'):
            right=sample([(0,(.145,.025,-.155)),(.23,(.06,.05,.22)),(.41,(.235,.005,-.03)),(.7,(.15,-.08,-.17)),(1,(.145,.025,-.155))],t)
            blade=sample([(0,READY_BLADE),(.23,(-.4,0,.92)),(.41,(1,0,-.1)),(.7,(.6,0,-.65)),(1,READY_BLADE)],t).normalized()
    elif name=='guard':
        right=Vector((.15,-.065,-.01));left=Vector((.15,.045,-.015));blade=Vector((.12,.4,.9)).normalized()
    elif name=='carry':
        right=Vector((.075,.015,.21));left=Vector((.075,-.015,.21))
    elif name in ('jump','fall'):
        tuck=math.sin(min(1,t)*math.pi)*.095 if name=='jump' else .055
        feet[0].x+=.07;feet[0].z+=tuck+.035
        feet[1].x-=.055;feet[1].z+=tuck*.7
        left=Vector((.02,-.08,-.16))
    elif name=='land':
        drop-=.07*(1-t)
    elif name=='hurt':
        yaw=math.radians(-12)*math.sin(t*math.pi)
        right=Vector((.02,.09,-.16));left=Vector((.015,-.1,-.16))
    else:
        right.z+=math.sin(phase)*.002
        left.z+=math.sin(phase)*.002
    pb[ROOT_BONE].location=rest[ROOT_BONE].to_3x3().inverted() @ Vector((0,0,drop))
    update()
    orient('tripo::Spine_1',Quaternion(UP,yaw) @ rest['tripo::Spine_1'].to_quaternion())
    for prefix,target in zip((RL,LL),feet):
        limb(prefix,target,(1,0,.05))
        orient(prefix+'2',rest[prefix+'2'].to_quaternion())
    turn=Quaternion(UP,yaw)
    limb(R,pb[R+'0'].head+turn@right,turn@Vector((-.15,1,-.2)))
    limb(L,pb[L+'0'].head+turn@left,turn@Vector((-.15,-1,-.2)))
    if hand_ready is None: hand_ready=pb[HAND].matrix.to_quaternion().copy()
    orient(HAND,READY_BLADE.rotation_difference(blade) @ hand_ready)
    # Curl toward the palm in bind-space, transformed into each joint's actual
    # local axes. Local X is not the finger hinge on this generated skeleton.
    for wrist,sign in [(HAND,-1),(L+'2',1)]:
        for b in pb[wrist].children_recursive:
            axis=rest[b.name].to_quaternion().inverted() @ Vector((0,0,sign))
            angle=32 if 'Limb' in b.name or b.name in ('bone_26','bone_27','bone_28') else 52
            b.rotation_quaternion=Quaternion(axis,math.radians(angle))
    update()

# The rigid sword is skinned 100% to the wrist, with its bind coordinates
# computed from the ready pose. It cannot float away from the swinging hand.
pose('idle',0)
verts=[];faces=[];material_ids=[]
def prism(poly,depth,material):
    start=len(verts);n=len(poly)
    verts.extend((x,y,z) for y in (-depth/2,depth/2) for x,z in poly)
    faces.extend([tuple(start+i for i in range(n-1,-1,-1)),tuple(start+n+i for i in range(n))])
    material_ids.extend([material,material])
    for i in range(n):
        k=(i+1)%n;faces.append((start+i,start+k,start+n+k,start+n+i));material_ids.append(material)
prism([(-.016,.035),(.019,.035),(.025,.25),(.005,.39),(-.025,.30)],.012,0)
prism([(-.057,.017),(.057,.017),(.057,.035),(-.057,.035)],.032,1)
prism([(-.012,-.055),(.012,-.055),(.012,.022),(-.012,.022)],.026,2)
prism([(-.019,-.065),(.019,-.065),(.019,-.05),(-.019,-.05)],.032,1)
hand=pb[HAND]
grip=hand.head+(hand.tail-hand.head).normalized()*.035
placement=Matrix.Translation(grip) @ Vector((0,0,1)).rotation_difference(READY_BLADE).to_matrix().to_4x4()
bind=rest[HAND] @ hand.matrix.inverted() @ placement
mesh=bpy.data.meshes.new('TripoCutlassMesh')
mesh.from_pydata([bind@Vector(v) for v in verts],[],faces);mesh.update()
sword=bpy.data.objects.new('TripoCutlass',mesh);bpy.context.collection.objects.link(sword)
sword.parent=arm;sword.matrix_parent_inverse=Matrix.Identity(4)
for name,color,metal in [('Steel',(.64,.82,.92,1),.7),('Gold',(.95,.55,.09,1),.7),('Leather',(.11,.035,.018,1),0)]:
    mat=bpy.data.materials.new('Tripo'+name);mat.diffuse_color=color;mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=color
    shader.inputs['Metallic'].default_value=metal;shader.inputs['Roughness'].default_value=.3
    mesh.materials.append(mat)
for poly,i in zip(mesh.polygons,material_ids): poly.material_index=i
sword.vertex_groups.new(name=HAND).add(list(range(len(verts))),1,'REPLACE')
sword.modifiers.new('Wrist skin','ARMATURE').object=arm

durations={'idle':96,'walk':24,'run':16,'attack_a':22,'attack_b':22,'heavy':22,'dash':22,'shoot':22,'skill':28,'guard':12,'hurt':10,'jump':18,'fall':22,'land':16,'carry':12,'grab':22}
for name,duration in durations.items():
    action=bpy.data.actions.new(name=name);arm.animation_data.action=action
    for frame in range(duration+1):
        pose(name,frame/duration)
        for b in pb:
            b.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=b.name)
            if b.name==ROOT_BONE: b.keyframe_insert(data_path='location',frame=frame,group=b.name)
    action.use_fake_user=True
    print('BAKED',name,duration)

arm.animation_data.action=bpy.data.actions['idle']
bpy.context.scene.frame_set(0)
bpy.context.scene.frame_start=0;bpy.context.scene.frame_end=96
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True);sword.select_set(True)
for ob in bpy.context.scene.objects:
    if ob.type=='MESH' and ob.name.startswith('tripo'): ob.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
    export_skins=True,export_all_influences=False,export_optimize_animation_size=True,export_yup=True)
print('EXPORTED',OUTPUT)
