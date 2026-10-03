"""Render isolated authored poses for visual QA without arena effects."""
from pathlib import Path
import bpy
import sys
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
source='--source' in sys.argv
if source:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/'models/tripo-pirate/tripo-out/tripo-pirate-rig-ebbdda11/model.glb'))
else:
    bpy.ops.wm.open_mainfile(filepath=str(root/'models/tripo-pirate-animated.blend'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
for o in bpy.context.scene.objects:
    if o.name.startswith(('TripoEyes','TripoBlush')):o.hide_render=True   # expression decals are toggled by the game
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12
scene.render.resolution_x=600;scene.render.resolution_y=680;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.world=bpy.data.worlds.new('Review world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.43,.5,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
for pos,power,size in [((2,-3,4),450,4),((-1,2,2),250,3)]:
    data=bpy.data.lights.new('Review light','AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new('Review light',data);scene.collection.objects.link(ob);ob.location=pos
    ob.rotation_euler=(Vector((-.1,0,.5))-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02))
mat=bpy.data.materials.new('Review floor');mat.diffuse_color=(.22,.27,.32,1);bpy.context.object.data.materials.append(mat)
cam=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));scene.collection.objects.link(cam)
cam.data.type='ORTHO';cam.data.ortho_scale=1.38;scene.camera=cam
# Reference crate for the overhead carry: same size and height the game uses (see tripoCarryBottom in arena-tripo.js).
CRATE=.31;CARRY_BOTTOM=.44
mesh=bpy.data.meshes.new('ref crate');import bmesh as _bm
_b=_bm.new();_bm.ops.create_cube(_b,size=CRATE);_b.to_mesh(mesh);_b.free()
crate=bpy.data.objects.new('ref crate',mesh);scene.collection.objects.link(crate);crate.location=(-.21,-.005,CARRY_BOTTOM+.499+CRATE/2)
cm=bpy.data.materials.new('crate');cm.diffuse_color=(.75,.5,.28,1);mesh.materials.append(cm)
crate.hide_render=True
out=root/'artifacts/tripo-review';out.mkdir(parents=True,exist_ok=True)
samples=[('source','',0,(2.5,1.5,1.35))] if source else [('ready','idle',0,(2.5,1.5,1.35)),('side','idle',0,(0,3,1.05)),('strike','attack_a',9,(2.5,1.5,1.35)),('stride','walk',18,(0,3,1.05)),('windup','attack_a',5,(2.5,1.5,1.35)),('follow','attack_a',15,(2.5,1.5,1.35)),('heavy','heavy',9,(0,3,1.05)),('run','run',4,(0,3,1.05)),('hurt','hurt',5,(2.5,1.5,1.35)),('walk_mid','walk',6,(0,3,1.05)),('walk_contact','walk',0,(0,3,1.05)),('guard','guard',8,(2.5,1.5,1.35)),('guard_side','guard',8,(0,3,1.05)),('skill_coil','skill',5,(2.5,1.5,1.35)),('skill_charge','skill',8,(2.5,1.5,1.35)),('skill_release','skill',11,(2.5,1.5,1.35)),('skill_spin','skill',16,(2.5,1.5,1.35)),('throw_wind','throw',4,(2.5,1.5,1.35)),('throw_rel','throw',8,(2.5,1.5,1.35)),('toss_rel','toss',8,(2.5,1.5,1.35)),('jump_up','jump',3,(0,3,1.05)),('jump_apex','jump',16,(0,3,1.05)),('fall','fall',6,(0,3,1.05)),('land','land',0,(0,3,1.05)),('walk_a','walk',3,(0,3,1.05)),('walk_front','walk',12,(3,0,1.05)),('carry','carry',0,(2.5,1.5,1.35)),('carry_side','carry',0,(0,3,1.05)),('toss_start','toss',0,(2.5,1.5,1.35)),('toss_rel','toss',8,(2.5,1.5,1.35)),('hold','hold',0,(2.5,1.5,1.35))]
for label,clip,frame,pos in samples:
    if not source: arm.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame)
    crate.hide_render=label not in ('carry','carry_side','toss_start')
    cam.location=pos;cam.rotation_euler=(Vector((-.09,0,.49))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/(label+'.png'));bpy.ops.render.render(write_still=True)
    print('RENDERED',label)
