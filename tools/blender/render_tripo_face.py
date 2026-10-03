"""Face close-ups of the Tripo pirate: neutral, squint, blink, and with the cheek blush.
Run: Blender -b --factory-startup --python tools/blender/render_tripo_face.py"""
from pathlib import Path
import bpy
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(root/'models/tripo-pirate-animated.blend'))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');scene=bpy.context.scene
body=next(o for o in scene.objects if o.type=='MESH' and o.name.startswith('tripo'))
KINDS=('TripoBlush','TripoEyesHurt','TripoEyesClosed','TripoBrowAngry','TripoBrowSad','TripoMouthShout','TripoMouthGrit','TripoMouthGrin','TripoMouthFrown','TripoTear')
decals={k:[o for o in scene.objects if o.name.startswith(k)] for k in KINDS}
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=10;scene.render.resolution_x=scene.render.resolution_y=420
scene.world=bpy.data.worlds.new('w');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[1].default_value=1
for pos in [(2,-1,2),(2,1,1)]:
    d=bpy.data.lights.new('l','AREA');d.energy=300;d.size=3;o=bpy.data.objects.new('l',d);scene.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector((0,0,.88))-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c'));scene.collection.objects.link(cam);cam.data.type='ORTHO';cam.data.ortho_scale=.32;scene.camera=cam
arm.animation_data.action=bpy.data.actions['idle'];scene.frame_set(0)
target=arm.matrix_world@arm.pose.bones['tripo::Head_2'].tail;target.x+=.06
cam.location=target+Vector((2,.35,.15));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
out=root/'artifacts/tripo-review';out.mkdir(parents=True,exist_ok=True)
def aim(clip,frame):
    arm.animation_data.action=bpy.data.actions[clip];scene.frame_set(frame);bpy.context.view_layer.update()
    t=arm.matrix_world@arm.pose.bones['tripo::Head_2'].tail
    forward=(arm.matrix_world.to_3x3()@arm.pose.bones['tripo::Head_2'].matrix.to_3x3()@Vector((0,0,-1))).normalized()
    t=t+Vector((.06,0,0));cam.location=t+Vector((2,.35,.15));cam.rotation_euler=(t-cam.location).to_track_quat('-Z','Y').to_euler()
for label,show,clip,frame in [('face_hurt_pose',('TripoEyesHurt',),'hurt',5),('face_knock_pose',('TripoEyesHurt',),'knock',4),('face_beer_walk',('TripoBlush',),'walk',6)]:
    aim(clip,frame)
    for k,objs in decals.items():
        for o in objs:o.hide_render=k not in show
    scene.render.filepath=str(out/(label+'.png'));bpy.ops.render.render(write_still=True);print('RENDERED',label)
aim('idle',0)
aim('idle',0)
for label,show in [('x_angry_shout',('TripoBrowAngry','TripoMouthShout')),('x_angry_grit',('TripoBrowAngry','TripoMouthGrit')),('x_sad_cry',('TripoBrowSad','TripoMouthFrown','TripoTear')),('x_win',('TripoEyesClosed','TripoMouthGrin','TripoBlush'))]:
    for k,objs in decals.items():
        for o in objs:o.hide_render=k not in show
    scene.render.filepath=str(out/(label+'.png'));bpy.ops.render.render(write_still=True);print('RENDERED',label)
