"""Print a rigged Tripo character: bone names/axes, mesh components, bounds, textures.
Run: Blender -b --factory-startup --python tools/blender/inspect_tripo_char.py -- <model.glb>"""
import sys,bpy
from mathutils import Vector
path=sys.argv[sys.argv.index('--')+1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
print('ARM',arm.name,'loc',[round(x,3) for x in arm.location],'scale',[round(x,3) for x in arm.scale],'rotq',[round(x,3) for x in arm.rotation_quaternion],'parent',arm.parent.name if arm.parent else None)
print('BONES',len(arm.data.bones))
def walk(b,d=0):
    print('  '*d+'BONE',b.name,'head',[round(x,3) for x in b.head_local],'tail',[round(x,3) for x in b.tail_local])
    for c in b.children:walk(c,d+1)
for b in arm.data.bones:
    if b.parent is None:walk(b)
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        vs=[o.matrix_world@v.co for v in o.data.vertices]
        lo=[round(min(v[i] for v in vs),3) for i in range(3)];hi=[round(max(v[i] for v in vs),3) for i in range(3)]
        print('MESH',o.name,'verts',len(vs),'bounds',lo,hi,'groups',len(o.vertex_groups),'mats',[m.name for m in o.data.materials],'parent',o.parent.name if o.parent else None)
