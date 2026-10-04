"""Close-ups of hands, cuffs and the belt scabbard for skinning QA.
Run: Blender -b --factory-startup --python tools/blender/render_tripo_closeup.py [-- --tag name]"""
from pathlib import Path
import sys
import bpy
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
tag=sys.argv[sys.argv.index('--tag')+1] if '--tag' in sys.argv else 'cu'
cid=sys.argv[sys.argv.index('--id')+1] if '--id' in sys.argv else 'pirate'
bpy.ops.wm.open_mainfile(filepath=str(root/('models/tripo-%s-animated.blend'%cid)))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=10
scene.render.resolution_x=520;scene.render.resolution_y=520
scene.world=bpy.data.worlds.new('w');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.4,.45,.5,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
for pos,power in [((2,-3,4),500),((-1,2,2),250),((-2,-2,2),250)]:
    d=bpy.data.lights.new('l','AREA');d.energy=power;d.size=4;o=bpy.data.objects.new('l',d);scene.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
for o in scene.objects:
    if o.name.startswith(('TripoEyes','TripoBlush','TripoBrow','TripoMouth','TripoTear')):o.hide_render=True
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c'));scene.collection.objects.link(cam);cam.data.type='ORTHO';scene.camera=cam
out=root/'artifacts/tripo-review';out.mkdir(parents=True,exist_ok=True)
# (label, clip, frame, focus bone, ortho scale, camera direction from the character)
WRIST={'pirate':'tripo::0_Right_Limb_2'}
import sys as _s
def find_wrist(side):
    # farthest-out bone with several children on the requested side
    best=None
    for b in arm.data.bones:
        if len(b.children)>=2 and b.head_local.y*side>.05:
            if best is None or abs(b.head_local.y)>abs(best.head_local.y):best=b
    return best.name
RW,LW=find_wrist(1),find_wrist(-1)
shots=[('handR_idle','idle',0,RW,.3,(.8,1.2,.7)),('handR_attack','attack_a',5,RW,.3,(.8,1.2,.7)),('handR_heavy','heavy',9,RW,.3,(.8,1.2,.7)),
       ('handL_attack','attack_a',9,LW,.3,(.6,-1.3,.5)),('handR_guard','guard',8,RW,.3,(.8,1.2,.7))]
for label,clip,frame,bone,scale,direction in shots:
    arm.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame);bpy.context.view_layer.update()
    target=arm.matrix_world@arm.pose.bones[bone].head
    cam.data.ortho_scale=scale;cam.location=target+Vector(direction).normalized()*3
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/f'{tag}_{label}.png');bpy.ops.render.render(write_still=True);print('RENDERED',label)
