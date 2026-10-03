"""Read-only rig diagnostics; run with Blender --background --python."""
import bpy
from pathlib import Path
from mathutils import Vector
root = Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'models/tripo-pirate/tripo-out/tripo-pirate-rig-ebbdda11/model.glb'))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
def xyz(v): return tuple(round(x, 4) for x in v)
print('ARM MATRIX', arm.matrix_world)
for b in arm.data.bones:
    if b.name.startswith('tripo::'):
        print('BONE', b.name, 'head', xyz(b.head_local), 'tail', xyz(b.tail_local),
              'axes', [xyz(b.matrix_local.to_3x3() @ Vector(a)) for a in [(1,0,0),(0,1,0),(0,0,1)]])
for ob in bpy.context.scene.objects:
    if ob.type == 'MESH':
        print('MESH', ob.name, 'bounds', [xyz(ob.matrix_world @ Vector(c)) for c in ob.bound_box])
        if ob.name.startswith('tripo'):
            adjacency=[[] for v in ob.data.vertices]
            coincident={}
            for v in ob.data.vertices:
                key=tuple(round(c,5) for c in v.co)
                if key in coincident:
                    other=coincident[key];adjacency[v.index].append(other);adjacency[other].append(v.index)
                else: coincident[key]=v.index
            for e in ob.data.edges:
                a,b=e.vertices;adjacency[a].append(b);adjacency[b].append(a)
            seen=set();parts=[]
            for i in range(len(adjacency)):
                if i in seen: continue
                stack=[i];seen.add(i);part=[]
                while stack:
                    a=stack.pop();part.append(a)
                    for b in adjacency[a]:
                        if b not in seen: seen.add(b);stack.append(b)
                if len(part)>15:
                    vs=[ob.matrix_world @ ob.data.vertices[k].co for k in part]
                    parts.append((len(part),xyz(Vector([min(v[a] for v in vs) for a in range(3)])),xyz(Vector([max(v[a] for v in vs) for a in range(3)]))))
            print('COMPONENTS',sorted(parts,reverse=True)[:30])
            for lo,hi in [(0,.2),(.2,.4),(.4,.6),(.6,.8),(.8,1.1)]:
                vs=[ob.matrix_world @ v.co for v in ob.data.vertices if (ob.matrix_world @ v.co).x>-.065 and lo<(ob.matrix_world @ v.co).z<hi]
                if vs: print('FRONT',lo,hi,len(vs),[xyz(Vector([fn(v[a] for v in vs) for a in range(3)])) for fn in [min,max]])
