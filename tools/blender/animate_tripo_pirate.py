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

RIGHT_FOREARM='tripo::0_Right_Limb_1'
LEFT_FOREARM='tripo::0_Left_Limb_1'
CUFF_SLIDE=.025
SCABBARD_PIVOT=Vector((-.09,.14,.53))
SCABBARD_TILT=0
SCABBARD_OUT=Vector((0,.035,.05))
FINGER_CURL=(18,28)  # degrees for palm-side joints / finger joints

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
    seen=set();remove=set();blade_parts=0;grips=[];cuffs=[]
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
            # Scabbard, grips and chape are one rigid prop; raised and bound to the waist below.
            grips.append(part)
        elif len(part)<400 and .58<lo.z and hi.z<.72 and (.27<lo.y and hi.y<.40 or -.40<lo.y and hi.y<-.27):
            cuffs.append((part,RIGHT_FOREARM if lo.y>0 else LEFT_FOREARM))
        elif len(part)>500 and hi.z<.26:
            for i,v in zip(part,coords):
                prefix=RL if v.y>0 else LL
                blend=max(0,min(1,(.19-v.z)/.065))
                weights(i,prefix+'1')
                if blend: weights(i,prefix+'2',blend)
    # Gold cuffs were weighted ~40/60 between forearm and hand, so a turning wrist stretched them
    # into wedges. Make each a rigid bracer on its forearm and slide it off the wrist joint.
    assert len(cuffs)==2,'Expected two cuff components'
    for part,name in cuffs:
        bone=arm.data.bones[name];along=(bone.tail_local-bone.head_local).normalized()
        for i in part:
            v=ob.data.vertices[i];v.co=v.co-along*CUFF_SLIDE
            weights(i,name)
    # The belt prop used to hang rigidly from the root and pass through the swinging thigh.
    # Tilt it up and out (pivot on the belt) and let the waist bones carry it.
    world=ob.matrix_world;back=world.inverted();tilt=Matrix.Rotation(math.radians(SCABBARD_TILT),3,'Y')
    for part in grips:
        for i in part:
            v=ob.data.vertices[i];p=SCABBARD_PIVOT+tilt@(world@v.co-SCABBARD_PIVOT)+SCABBARD_OUT
            v.co=back@p
            weights(i,'tripo::Spine_0',.6)
    assert len(grips)==4,'Scabbard components changed; inspect before moving them'
    assert blade_parts==1 and len(remove)==159, 'Source topology changed; inspect before removing the old blade'
    bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.verts[i] for i in remove],context='VERTS')
    bm.to_mesh(ob.data);bm.free();ob.data.update()
    print('CLEANED old blade vertices',len(remove))

clean_scan()


def redden_coat():
    """The scan's jacket is painted blue; Red Sail should wear red. Rotate the blue hues of the colour texture to red
    and leave skin, hair, metal and the teal trim alone."""
    import numpy as np
    ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('tripo'))
    image = None
    for m in ob.data.materials:
        for link in m.node_tree.links:
            if link.to_socket.name == 'Base Color' and link.from_node.type == 'TEX_IMAGE': image = link.from_node.image
    px = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
    rgb = px[:, :3]; mx = rgb.max(1); d = rgb.max(1) - rgb.min(1) + 1e-9
    h = np.where(mx == rgb[:, 0], ((rgb[:, 1] - rgb[:, 2]) / d) % 6, np.where(mx == rgb[:, 1], (rgb[:, 2] - rgb[:, 0]) / d + 2, (rgb[:, 0] - rgb[:, 1]) / d + 4)) / 6
    s = d / (mx + 1e-9)
    blue = (s > .3) & (mx > .05) & (h > .565) & (h < .75)
    nh = np.where(blue, (h - .625 + 1.0) % 1.0, h)          # blue 0.625 -> red 0.0
    sat = np.where(blue, np.minimum(1, s * 1.1), s)
    c = mx * sat; x = c * (1 - np.abs((nh * 6) % 2 - 1)); m0 = mx - c
    z = np.zeros_like(c); i = (nh * 6).astype(int) % 6
    r = np.choose(i, [c, x, z, z, x, c]); g = np.choose(i, [x, c, c, x, z, z]); b = np.choose(i, [z, z, x, c, c, x])
    out = np.stack([r + m0, g + m0, b + m0], 1)
    px[blue, :3] = out[blue]
    image.pixels.foreach_set(px.ravel()); image.update(); image.pack()
    print('REDDENED', int(blue.sum()))


redden_coat()

FINGER_REACH=.05      # a vertex farther than this from every finger bone is forearm / glove cuff, left alone
FINGER_TIP=.7         # the scan's finger bones end ~1.2 cm short of the fingertips: extend leaf bones by this fraction
FINGER_SOFT=.0065     # softness of the hand-skinning falloff: ~ half a finger radius
def rebind_hands():
    """The scan's automatic hand weights leave fingertips on the wrong bone (the right thumb stretched
    into a thorn, finger webbing tore 10x). Re-skin every hand vertex by distance to the finger bone
    segments, so fingers move rigidly and the webbing between them blends smoothly."""
    ob=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('tripo'))
    toarm=arm.matrix_world.inverted()@ob.matrix_world;pos={v.index:toarm@v.co for v in ob.data.vertices}
    def seg_dist(p,a,b):
        ab=b-a;t=max(0,min(1,(p-a).dot(ab)/ab.length_squared));return (p-(a+ab*t)).length
    total=0
    for side in ('Right','Left'):
        wrist=arm.data.bones['tripo::0_%s_Limb_2'%side];fingers=[b for b in wrist.children_recursive]
        names={b.name for b in fingers}|{wrist.name}
        knuckles=[b.head_local for b in wrist.children]
        palm=(sum(knuckles,Vector())/len(knuckles))
        segs=[(b.name,b.head_local.copy(),b.tail_local+(b.tail_local-b.head_local)*(FINGER_TIP if not b.children else 0)) for b in fingers]+[(wrist.name,wrist.head_local.copy(),palm)]
        groups={g.name:g for g in ob.vertex_groups}
        for v in ob.data.vertices:
            p=pos[v.index]
            near=min(seg_dist(p,a,b) for n,a,b in segs if n!=wrist.name)
            if near>FINGER_REACH or (p-wrist.head_local).length>.2: continue
            old={ob.vertex_groups[g.group].name:g.weight for g in v.groups}
            hand_share=sum(w for n,w in old.items() if n in names)
            if hand_share<.5: continue          # mostly forearm / sleeve: not a hand vertex
            ds=[(seg_dist(p,a,b),n) for n,a,b in segs];dmin=min(d for d,_ in ds)
            raw={n:math.exp(-(d-dmin)/FINGER_SOFT) for d,n in ds};norm=sum(raw.values())
            for n in names:
                if n in groups: groups[n].remove([v.index])
            for n,w in raw.items():
                w=w/norm*hand_share
                if w>.02: (groups.get(n) or ob.vertex_groups.new(name=n)).add([v.index],w,'REPLACE')
            total+=1
    print('REBOUND hand vertices',total)
    assert total>500,'hand vertices not found; inspect the rig before rebinding'

rebind_hands()

def add_face():
    """The scan's eyes are painted into the texture and the face mesh is far too sparse to squash them.
    Instead, anime-style decals are projected onto the real face surface and skinned to the head:
    skin-coloured patches with '><' (hurt) or a closed arc (blink / K.O.) drawn on them, plus pink
    cheek blush. Eye and skin positions are measured from the texture, not hard-coded."""
    import random
    from mathutils.bvhtree import BVHTree
    ob=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('tripo'))
    me=ob.data;me.calc_loop_triangles();toarm=arm.matrix_world.inverted()@ob.matrix_world;tomesh=toarm.inverted()
    image=None
    for m in me.materials:
        for link in m.node_tree.links:
            if link.to_socket.name=='Base Color' and link.from_node.type=='TEX_IMAGE':image=link.from_node.image
    W,H=image.size;px=image.pixels[:];uv=me.uv_layers.active.data
    def rgb(u,v):
        i=(min(H-1,max(0,int(v*H)))*W+min(W-1,max(0,int(u*W))))*4;return px[i:i+3]
    random.seed(7);samples=[]
    for tri in me.loop_triangles:
        P=[toarm@me.vertices[v].co for v in tri.vertices]
        if not any(.32<p.z<.39 and abs(p.y)<.09 and p.x>-.14 for p in P):continue
        U=[uv[l].uv for l in tri.loops]
        for _ in range(60):
            a,b=random.random(),random.random()
            if a+b>1:a,b=1-a,1-b
            c=1-a-b;p=P[0]*c+P[1]*a+P[2]*b;q=U[0]*c+U[1]*a+U[2]*b
            if .32<p.z<.39 and abs(p.y)<.09 and p.x>-.14:samples.append((p,rgb(q.x,q.y)))
    lum=lambda c:.3*c[0]+.59*c[1]+.11*c[2]
    eyes={}
    for side in (1,-1):
        # sclera (white) and pupils/lashes (black) below the brow line
        sel=[p for p,c in samples if p.y*side>.01 and p.z<.362 and (lum(c)>.85 or lum(c)<.13)]
        assert len(sel)>60,'eye texels not found; inspect the face before building decals'
        eyes[side]=sum(sel,Vector())/len(sel)
    skin=[c for p,c in samples if .325<p.z<.34 and abs(p.y)<.05 and lum(c)>.6]
    skin=[sorted(c[i] for c in skin)[len(skin)//2] for i in range(3)]
    print('EYES',{k:[round(x,3) for x in v] for k,v in eyes.items()},'SKIN',[round(x,3) for x in skin])
    face_pos={v.index:toarm@v.co for v in me.vertices};face_ids=[i for i,p in face_pos.items() if .28<p.z<.42 and abs(p.y)<.12 and p.x>-.16]
    tris=[[toarm@me.vertices[v].co for v in t.vertices] for t in me.loop_triangles]
    bvh=BVHTree.FromPolygons([v for t in tris for v in t],[(3*i,3*i+1,3*i+2) for i in range(len(tris))])
    def onface(p,normal_hint=Vector((1,0,0)),lift=.0035):
        hit=bvh.ray_cast(p+normal_hint*.08,-normal_hint)
        loc,n=(hit[0],hit[1]) if hit[0] else bvh.find_nearest(p)[:2]
        if n.dot(normal_hint)<0:n=-n
        return loc+n*lift,n
    def texture(name,draw,size=128):
        img=bpy.data.images.new(name,size,size,alpha=True);buf=[0.0]*(size*size*4)
        for y in range(size):
            for x in range(size):
                u,v=(x+.5)/size*2-1,(y+.5)/size*2-1
                r=math.hypot(u*1.05,v*1.25);a=max(0,min(1,(1-r)/.22))       # feathered oval
                ink=draw(u,v);col=[skin[0]*(1-ink),skin[1]*(1-ink),skin[2]*(1-ink)]
                i=(y*size+x)*4;buf[i:i+4]=[col[0],col[1],col[2],max(a,ink*min(1,a*4))]
        img.pixels=buf;img.pack();return img
    def seg(u,v,a,b,w):
        ax,ay=a;bx,by=b;dx,dy=bx-ax,by-ay;t=max(0,min(1,((u-ax)*dx+(v-ay)*dy)/(dx*dx+dy*dy)))
        d=math.hypot(u-ax-t*dx,v-ay-t*dy);return max(0,min(1,(w-d)/.05))
    def chevron(side):  # '>' on the right eye, '<' on the left, as seen from the front
        k=-side
        return lambda u,v:max(seg(u,v,(-.45*k,.42),(.42*k,0),.12),seg(u,v,(.42*k,0),(-.45*k,-.42),.12))
    def closed(u,v):   # a happy/closed arc
        return max(seg(u,v,(-.55,.05),(-.2,-.2),.11),seg(u,v,(-.2,-.2),(.2,-.2),.11),seg(u,v,(.2,-.2),(.55,.05),.11))
    def material(name,img=None,color=None,alpha=1):
        mat=bpy.data.materials.new(name);mat.use_nodes=True;mat.blend_method='BLEND'
        nodes=mat.node_tree.nodes;shader=nodes.get('Principled BSDF')
        if img:
            tex=nodes.new('ShaderNodeTexImage');tex.image=img
            mat.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);mat.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
        else:
            shader.inputs['Base Color'].default_value=color;shader.inputs['Alpha'].default_value=alpha
        shader.inputs['Roughness'].default_value=.8
        return mat
    def decal(name,mat,centre,width,height,lift=.0045):
        # a 7x5 grid projected onto the face so it hugs the curvature
        pos,n=onface(centre);nearest=min(range(len(me.vertices)),key=lambda i:(toarm@me.vertices[i].co-pos).length)
        u=n.cross(Vector((0,0,1))).normalized();w=n.cross(u).normalized()
        if u.y<0:u=-u
        if w.z<0:w=-w
        verts=[];uvs=[];faces=[];armpts=[]
        for j in range(5):
            for i in range(7):
                a,b=i/6*2-1,j/4*2-1
                p,_=onface(pos+u*a*width/2+w*b*height/2,n,lift)
                verts.append(tomesh@p);uvs.append(((a+1)/2,(b+1)/2));armpts.append(p)
        for j in range(4):
            for i in range(6):k=j*7+i;faces.append((k,k+1,k+8,k+7))
        mesh=bpy.data.meshes.new(name+'Mesh');mesh.from_pydata(verts,[],faces);mesh.materials.append(mat)
        layer=mesh.uv_layers.new()
        for poly in mesh.polygons:
            for li in poly.loop_indices:layer.data[li].uv=uvs[mesh.loops[li].vertex_index]
        dec=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(dec);dec.matrix_world=ob.matrix_world.copy()
        # Each decal vertex copies the skin weights of the face vertex under it, so the decal bends with
        # the face when the head moves instead of sinking into it.
        for k,p in enumerate(armpts):
            under=min(face_ids,key=lambda i:(face_pos[i]-p).length)
            for g in me.vertices[under].groups:
                gname=ob.vertex_groups[g.group].name;(dec.vertex_groups.get(gname) or dec.vertex_groups.new(name=gname)).add([k],g.weight,'REPLACE')
        dec.parent=arm;dec.matrix_parent_inverse=arm.matrix_world.inverted();dec.modifiers.new('Head skin','ARMATURE').object=arm
        decals.append(dec)
    # ---- layered painter for brows / mouths / tears: each layer is f(u,v)->(r,g,b,coverage) or None
    def paint(name,layers,fill=True,size=128):
        img=bpy.data.images.new(name,size,size,alpha=True);buf=[0.0]*(size*size*4)
        for y in range(size):
            for x in range(size):
                u,v=(x+.5)/size*2-1,(y+.5)/size*2-1
                edge=max(0,min(1,(1-math.hypot(u*1.02,v*1.1))/.2))
                rgb=list(skin);a=edge if fill else 0.0
                for layer in layers:
                    out=layer(u,v)
                    if out is None:continue
                    r,g,b,c=out;c=max(0,min(1,c))
                    if c<=0:continue
                    rgb=[rgb[0]*(1-c)+r*c,rgb[1]*(1-c)+g*c,rgb[2]*(1-c)+b*c];a=max(a,c*(1 if fill else 1))
                i=(y*size+x)*4;buf[i:i+4]=[rgb[0],rgb[1],rgb[2],a]
        img.pixels=buf;img.pack();return img
    def ellipse(cx,cy,rx,ry,color,soft=.06):
        return lambda u,v:(color[0],color[1],color[2],(1-math.hypot((u-cx)/rx,(v-cy)/ry))/soft) if math.hypot((u-cx)/rx,(v-cy)/ry)<1 else None
    def ring(cx,cy,rx,ry,width,color):
        def f(u,v):
            d=math.hypot((u-cx)/rx,(v-cy)/ry);return (color[0],color[1],color[2],(width-abs(d-1))/(width*.5)) if abs(d-1)<width else None
        return f
    def stroke(points,width,color,taper=None):
        def f(u,v):
            best=9;tt=0
            for (ax,ay),(bx,by) in zip(points,points[1:]):
                dx,dy=bx-ax,by-ay;t=max(0,min(1,((u-ax)*dx+(v-ay)*dy)/(dx*dx+dy*dy)));d=math.hypot(u-ax-t*dx,v-ay-t*dy)
                if d<best:best=d;tt=t
            w=width*(1 if not taper else taper[0]+(taper[1]-taper[0])*tt)
            return (color[0],color[1],color[2],(w-best)/(w*.35)) if best<w else None
        return f
    INK=(.07,.045,.045);MOUTH=(.30,.035,.06);TONGUE=(.88,.34,.42);TEETH=(.98,.97,.94)
    def brow(side,kind):
        k=1 if side>0 else -1      # +u points outward on the right eye, inward on the left
        # angry: outer end high, inner end pressed down toward the nose. sad: the opposite.
        pts=[(.95*k,.5),(.0,-.02),(-.9*k,-.5)] if kind=='angry' else [(.95*k,-.5),(.0,.0),(-.9*k,.5)]
        return paint('TripoBrow'+kind+str(side),[stroke(pts,.3,INK,taper=(.75,1.15) if kind=='angry' else (1.1,.75))])
    mouth_c=Vector((eyes[1].x,(eyes[1].y+eyes[-1].y)/2,MOUTH_Z))
    def mouth_shout():return paint('TripoMouthShout',[ellipse(0,-.05,.62,.75,MOUTH),ellipse(0,-.52,.4,.3,TONGUE),lambda u,v:(TEETH[0],TEETH[1],TEETH[2],(v-.28)/.05) if v>.28 and math.hypot(u/.62,(v+.05)/.75)<.93 else None,ring(0,-.05,.62,.75,.14,INK)])
    def mouth_grit():
        lines=[stroke([(x,-.38),(x,.38)],.05,(.4,.38,.36)) for x in (-.4,-.13,.14,.41)]
        return paint('TripoMouthGrit',[lambda u,v:(TEETH[0],TEETH[1],TEETH[2],(.86-abs(u))/.06) if abs(u)<.86 and abs(v)<.4 else None,stroke([(-.86,0),(.86,0)],.05,(.45,.42,.4))]+lines+[ring(0,0,.9,.46,.16,INK)])
    def mouth_grin():
        def lower(u,v):return MOUTH+((v-.35)/-.9+(u/.9)**2<1 and (v<.35),) if False else None
        def shape(u,v):
            if v<.35 and (u/.9)**2+((v-.35)/.95)**2<1:return (MOUTH[0],MOUTH[1],MOUTH[2],1)
            return None
        return paint('TripoMouthGrin',[shape,lambda u,v:(TEETH[0],TEETH[1],TEETH[2],1) if .12<v<.35 and (u/.9)**2+((v-.35)/.95)**2<.78 else None,ellipse(0,-.5,.4,.22,TONGUE),stroke([(-.9,.35),(.9,.35)],.12,INK),ring(0,.35,.9,.95,.1,INK)])
    def mouth_frown():return paint('TripoMouthFrown',[stroke([(-.8,-.45),(-.5,.0),(0,.2),(.5,.0),(.8,-.45)],.3,(.32,.06,.08))])
    def tear():return paint('TripoTear',[ellipse(0,-.12,.5,.78,(.55,.82,1)),ellipse(-.14,.0,.14,.3,(1,1,1))],fill=False,size=64)
    blush_mat=material('TripoBlush',paint('TripoBlushTex',[lambda u,v:(1,.24,.32,max(0,1-math.hypot(u,v*1.15))*1.6)],fill=False,size=64))
    closed_mat=material('TripoEyesClosed',texture('TripoEyesClosedTex',closed))
    for side,c in eyes.items():
        decal('TripoEyesHurt',material('TripoEyesHurt'+('R' if side>0 else 'L'),texture('TripoHurtTex'+str(side),chevron(side))),c,.05,.036)
        decal('TripoEyesClosed',closed_mat,c,.05,.036)
        decal('TripoBlush',blush_mat,c+Vector((0,.012*side,-.03)),.042,.02,.005)
        for kind in ('angry','sad'):
            decal('TripoBrow'+kind.capitalize(),material('TripoBrow'+kind+str(side),brow(side,kind)),Vector((c.x,c.y,BROW_Z-.001)),.058,.019,.0045)
        decal('TripoTear',material('TripoTearM'+str(side),tear()),c+Vector((0,.006*side,-.02)),.014,.032,.0048)
    for key,builder,w,h in (('Shout',mouth_shout,.052,.03),('Grit',mouth_grit,.05,.016),('Grin',mouth_grin,.06,.032),('Frown',mouth_frown,.05,.02)):
        decal('TripoMouth'+key,material('TripoMouthM'+key,builder()),mouth_c,w,h,.0045)
decals=[]
MOUTH_Z=.303
BROW_Z=.369

def update(): bpy.context.view_layer.update()
def smooth(x): return x*x*(3-2*x)
add_face()
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

def cr(keys,t):
    """Catmull-Rom through (time,value) keys; floats or vectors. Zero velocity at both ends,
    continuous velocity at inner keys, so motion flows instead of stopping on every key."""
    vals=[v if isinstance(v,(int,float)) else Vector(v) for _,v in keys]
    ts=[k for k,_ in keys];n=len(keys);t=min(max(t,ts[0]),ts[-1])
    i=0
    while i<n-2 and t>ts[i+1]: i+=1
    h=ts[i+1]-ts[i];u=(t-ts[i])/h
    def tangent(j):
        if j==0 or j==n-1: return vals[j]*0
        return (vals[j+1]-vals[j-1])*(1/(ts[j+1]-ts[j-1]))
    p0,p1=vals[i],vals[i+1];m0,m1=tangent(i)*h,tangent(i+1)*h
    u2,u3=u*u,u*u*u
    return p0*(2*u3-3*u2+1)+m0*(u3-2*u2+u)+p1*(-2*u3+3*u2)+m1*(u3-u2)

SPINE_FRONT=Vector((0,1,0))
TOE_IN=21  # +Y rotation tips the chest forward (+X)
ATTACK_POWER={'attack_a':1,'attack_b':1,'heavy':1.5,'dash':1.15,'shoot':.6,'grab':.8}
# Thigh .266 + shin .177 = .443, but at the scan's rest height hip-to-ankle is only ~.423, so the knees
# are ~20 degrees bent at rest and every cm of pelvis drop adds ~7 more. A straight leg needs the hip
# ~2 cm ABOVE rest height: stand at +2 cm, and only sink where a foot reaches far ahead.
STAND=.02

def pose(name,t):
    global hand_ready
    for b in pb: b.matrix_basis.identity()
    phase=t*math.tau
    body=dict(yaw=0,lean=0,roll=0,dx=0,dy=0,dz=STAND,head_yaw=0,head_pitch=0)
    right=Vector((.145,.025,-.155))
    left=Vector((.075,-.035,-.19))
    blade=READY_BLADE.copy()
    feet=[Vector((-.19,.105,-.4191)),Vector((-.19,-.105,-.4191))]
    if name in ('walk','run','carry_walk'): feet[0].y=.085;feet[1].y=-.085   # feet nearly under the hips: no waddle
    if name=='idle':
        # Breathing, a slow weight shift and a loose sword arm. Every term is 0 at t=0
        # because the sword is bound to the t=0 pose.
        body.update(lean=1.6*math.sin(phase),roll=2.2*math.sin(phase),dy=.012*math.sin(phase),
                    dz=STAND+.004*math.sin(2*phase),yaw=2.5*math.sin(phase),head_yaw=-3*math.sin(phase),head_pitch=1.5*math.sin(2*phase))
        right.z+=.012*math.sin(phase);right.x+=.006*math.sin(2*phase)
        left.z+=.014*math.sin(phase);left.x-=.008*math.sin(phase)
    elif name in ('walk','run','carry_walk'):
        running=name=='run'
        amplitude=.23 if running else .18
        duty=.48 if running else .6
        for i in range(2):
            u=(t+i*.5)%1
            if u<duty:
                feet[i].x+=amplitude*(1-2*u/duty)
            else:
                swing=(u-duty)/(1-duty)
                feet[i].x+=amplitude*(-1+2*smooth(swing))
                feet[i].z+=math.sin(math.pi*swing)*(.12 if running else .095)
        # Pelvis lowest when both feet are down, highest passing over a planted leg.
        # Lowest at foot contact (long reach), highest passing over the planted leg.
        mid,contact=(.016,-.035) if running else (.02,-.01)
        body.update(dz=(mid+contact)/2-(mid-contact)/2*math.cos(4*math.pi*t),
                    dy=(.012 if running else .006)*math.sin(phase),   # a waddle is a big side-to-side hip shift
                    lean=14 if running else 9,
                    yaw=(14 if running else 11)*math.cos(phase),     # shoulders twist against the hips
                    roll=(2 if running else 1)*math.sin(phase),
                    head_yaw=-(8 if running else 6)*math.cos(phase))
        # At each foot contact the front foot is farther from the hip than the rear one; sliding the
        # pelvis forward there evens the two reaches so neither knee has to fold.
        body['dx']=(.045 if running else .03)*math.cos(4*math.pi*t)
        # Left arm swings with the *opposite* leg (right foot forward at t=0).
        # Elbows bent, hands pumping: the hand comes forward AND up, goes back AND down.
        left=Vector((.10,-.075,-.135))
        left.x+=math.cos(phase)*(.13 if running else .10)
        left.z+=math.cos(phase)*(.05 if running else .035)
        right.x-=math.cos(phase)*(.06 if running else .04)
        right.z+=math.cos(phase)*(.02 if running else .012)
    elif name in ATTACK_POWER:
        side=-1 if name=='attack_b' else 1
        p=ATTACK_POWER[name];heavy=name=='heavy'
        T=[0,.23,.41,.7,1]
        if heavy:
            right=cr(list(zip(T,[(.145,.025,-.155),(.06,.05,.22),(.235,.005,-.03),(.15,-.08,-.17),(.145,.025,-.155)])),t)
            blade=cr(list(zip(T,[READY_BLADE,(-.4,0,.92),(1,0,-.1),(.6,0,-.65),READY_BLADE])),t).normalized()
        else:
            right=cr(list(zip(T,[right,(-.055,.16*side,.005),(.23,-.025,-.045),(.12,-.165*side,-.08),right])),t)
            blade=cr(list(zip(T,[blade,(-.1,.88*side,.65),(1,-.16*side,.08),(.1,-1*side,.3),blade])),t).normalized()
        k=lambda vals:list(zip(T,[v*p for v in vals]))
        body.update(yaw=cr(k([0,25,-17,-23,0]),t)*side,       # coil, whip through, over-rotate
                    lean=cr(k([0,-9,14,9,0]),t)+(10 if name=='dash' else 0),
                    roll=cr(k([0,-3,5,3,0]),t)*side,
                    dx=cr(k([0,-.05,.11,.10,0]),t)*(.75 if heavy else 1),
                    dz=STAND+cr(k([0,-.015,-.04,-.025,0]),t),
                    head_yaw=cr(k([0,-9,7,7,0]),t)*side)
        # Lead (left) foot steps in, rear foot pivots back; both stay planted afterwards.
        feet[1].x+=cr(k([0,-.02,.13,.13,0]),t)
        feet[1].z+=max(0,cr([(0,0),(.23,0),(.32,.07*p),(.41,0),(1,0)],t))
        feet[0].x+=cr(k([0,0,-.07,-.07,0]),t)*(.45 if heavy else 1)   # the heavy's x1.5 power would overstretch the rear leg
        left=cr(list(zip(T,[(.075,-.035,-.19),(.09,-.085,-.1),(-.02,-.1,-.12),(-.03,-.09,-.14),(.075,-.035,-.19)])),t)
    elif name=='skill':
        # Whirlwind: coil low with the blade raised behind the head, release into a wide stance
        # with both arms out so the game's body spin sweeps the blade, then settle. Frames/28:
        # 0 ready, 5 coil, 8 charge (held while the circle fills), 11 release, 21 spin pose, 28 ready.
        T=[0,5/28,8/28,11/28,21/28,1]
        right=cr(list(zip(T,[right,(-.02,.09,.16),(-.05,.1,.2),(.02,.2,.04),(0,.23,0),right])),t)
        blade=cr(list(zip(T,[blade,(-.5,.5,.8),(-.6,.4,.7),(.3,.9,.1),(.25,1,.05),blade])),t).normalized()
        left=cr(list(zip(T,[left,(.05,-.06,-.1),(0,-.08,-.05),(0,-.2,.03),(0,-.23,.02),left])),t)
        wide=cr(list(zip(T,[0,.6,1,1,1,0])),t)
        feet[0].y+=.06*wide;feet[1].y-=.06*wide;feet[1].x+=.09*wide;feet[0].x-=.07*wide
        body.update(yaw=cr(list(zip(T,[0,30,34,0,0,0])),t),lean=cr(list(zip(T,[0,-10,-12,12,14,0])),t),
                    dz=STAND+cr(list(zip(T,[0,-.03,-.06,-.045,-.04,0])),t),roll=cr(list(zip(T,[0,-3,-4,0,0,0])),t),
                    head_yaw=cr(list(zip(T,[0,-12,-14,0,0,0])),t))
    elif name=='guard':
        right=Vector((.15,-.065,-.01));left=Vector((.15,.045,-.015));blade=Vector((.12,.4,.9)).normalized()
        body.update(dz=-.06,lean=7,yaw=10,head_yaw=-6)
    elif name=='carry':
        # A crate or barrel held overhead: both arms nearly straight up, hands at the crate's sides (the
        # crate is ~.31 wide in this rig's units, so hands sit at +-.185 from the midline), sword hand
        # still gripping the cutlass, which points up beside the load.
        right=Vector((.0,.07,.245));left=Vector((.0,-.07,.245));blade=Vector((.0,.6,.8)).normalized()
        body.update(lean=-4,dz=STAND-.012,head_pitch=3)
        feet[0].y=.1;feet[1].y=-.1
    elif name=='jump':
        # Crouch, spring (legs straight, arms swing up), then tuck while rising. Frames/18.
        T=[0,.2,.5,1]
        body.update(dz=cr(list(zip(T,[-.03,.01,.0,.0])),t),lean=cr(list(zip(T,[9,-4,5,8])),t),
                    head_pitch=cr(list(zip(T,[0,4,2,0])),t))
        right=cr(list(zip(T,[right,(.02,.09,.07),(.07,.14,.03),(.07,.15,.02)])),t)
        left=cr(list(zip(T,[left,(.03,-.12,.07),(.07,-.15,.04),(.07,-.16,.03)])),t)
        lift=max(0,cr([(0,0),(.2,0),(.5,.09),(1,.11)],t))
        feet[0].z+=lift;feet[0].x+=.07*min(1,lift/.09)
        feet[1].z+=lift*1.15;feet[1].x-=.05*min(1,lift/.09)
    elif name=='fall':
        # Arms out for balance, legs reaching down with knees soft, a slow flutter; loops cleanly.
        right=Vector((.07,.13,.03+.015*math.sin(phase)));left=Vector((.07,-.14,.03+.015*math.sin(phase+1.6)))
        feet[0].z+=.055+.02*math.sin(phase);feet[0].x+=.04
        feet[1].z+=.07+.02*math.sin(phase+math.pi);feet[1].x-=.03
        body.update(lean=10+2*math.sin(phase),dz=-.01,head_pitch=2*math.sin(phase))
    elif name=='land':
        # Absorb the impact: deep crouch with arms out, then rise. Driven by the game's landing timer.
        T=[0,.3,1]
        body.update(dz=cr(list(zip(T,[-.075,-.07,STAND])),t),lean=cr(list(zip(T,[16,14,0])),t),
                    head_pitch=cr(list(zip(T,[-8,-6,0])),t))
        right=cr(list(zip(T,[(.08,.13,-.07),(.07,.1,-.1),right])),t)
        left=cr(list(zip(T,[(.08,-.14,-.07),(.07,-.1,-.1),left])),t)
        wide=cr(list(zip(T,[1,.8,0])),t);feet[0].y+=.03*wide;feet[1].y-=.03*wide
    elif name in ('throw','toss'):
        # One-handed throw with the free (left) hand; the sword stays ready. 'toss' is the two-handed
        # shove for crates and barrels. Frames/18: 0 ready, 4 wind-up, 8 release, 13 follow-through.
        T=[0,4/18,8/18,13/18,1]
        two=name=='toss'
        if two:
            # Starts from the overhead 'carry' pose, leans back, then shoves forward and down.
            over_r,over_l=(.0,.07,.245),(.0,-.07,.245)
            right=cr(list(zip(T,[over_r,(-.03,.07,.27),(.19,.06,.15),(.17,.03,-.1),right])),t)
            left=cr(list(zip(T,[over_l,(-.03,-.07,.27),(.19,-.06,.15),(.17,-.03,-.1),left])),t)
            blade=cr(list(zip(T,[(.0,.6,.8),(-.1,.5,.85),(.5,.1,.8),(.4,.2,.6),blade])),t).normalized()
        else:
            left=cr(list(zip(T,[left,(-.06,-.13,.1),(.17,-.05,.12),(.14,-.02,-.12),left])),t)
            right=cr(list(zip(T,[right,(.12,.05,-.12),(.1,.04,-.14),(.13,.03,-.14),right])),t)
        sign=0 if two else 1
        body.update(yaw=cr(list(zip(T,[0,-22*sign,14*sign,10*sign,0])),t),lean=cr(list(zip(T,[0,-8,15,9,0])),t),
                    dz=STAND+cr(list(zip(T,[0,-.02,-.035,-.02,0])),t),dx=cr(list(zip(T,[0,-.03,.09,.07,0])),t),
                    head_yaw=cr(list(zip(T,[0,8*sign,-6*sign,-5*sign,0])),t))
        feet[0].x+=cr(list(zip(T,[0,0,.12,.12,0])),t);feet[1].x+=cr(list(zip(T,[0,0,-.04,-.04,0])),t)
        feet[0].z+=max(0,cr([(0,0),(4/18,0),(6/18,.05),(8/18,0),(1,0)],t))
    elif name=='knock':
        # Blown away (bombs, launchers): arms flung up and back, legs flailing, head thrown back. Loops.
        right=Vector((-.04,.15,.12+.03*math.sin(phase)));left=Vector((-.05,-.16,.11+.03*math.sin(phase+2)))
        blade=Vector((-.3,.6,.75)).normalized()
        feet[0].z+=.09+.04*math.sin(phase);feet[0].x+=.08+.05*math.sin(phase)
        feet[1].z+=.06+.04*math.sin(phase+math.pi);feet[1].x-=.06+.05*math.sin(phase+math.pi)
        body.update(lean=-28+4*math.sin(phase),roll=6*math.sin(phase*.5),dz=-.02,head_pitch=-16,yaw=8*math.sin(phase))
    elif name=='climb':
        # Ladder climb (see animate_tripo_char.py): alternating hands and feet, tied to height by the game.
        for i in range(2):
            ph=phase+(0 if i==0 else math.pi);lift=max(0,math.sin(ph))
            feet[i].x+=.02+.06*lift;feet[i].z+=.14*lift
        right=Vector((.08,.075,.11+.13*math.sin(phase)));left=Vector((.08,-.075,.11-.13*math.sin(phase)));blade=Vector((.15,-.05,-.98)).normalized()
        body.update(lean=7,dz=STAND-.035+.008*math.cos(2*phase),dx=.035,roll=3*math.sin(phase),yaw=4*math.sin(phase),head_pitch=-6)
    elif name=='climbTop':
        # Ladder top / bottom and ledge pull-up (see animate_tripo_char.py).
        T=[0,.3,.6,1]
        right=cr(list(zip(T,[(.08,.075,.11),(.11,.075,.0),(.12,.06,-.06),(.145,.025,-.155)])),t)
        left=cr(list(zip(T,[(.08,-.075,.11),(.11,-.075,.0),(.12,-.06,-.06),(.075,-.035,-.19)])),t)
        blade=Vector((.15,-.05,-.98)).normalized() if t<.6 else READY_BLADE.copy()
        feet[0].x+=cr(list(zip(T,[.02,.11,.04,0])),t);feet[0].z+=cr(list(zip(T,[0,.15,.05,0])),t)
        feet[1].x+=cr(list(zip(T,[.02,.02,.09,0])),t);feet[1].z+=cr(list(zip(T,[0,.02,.14,0])),t)
        body.update(lean=cr(list(zip(T,[7,14,10,0])),t),dz=STAND+cr(list(zip(T,[-.035,-.06,-.03,0])),t),dx=cr(list(zip(T,[.035,.05,.03,0])),t),head_pitch=cr(list(zip(T,[-6,-8,-3,0])),t))
    elif name=='hurt':
        # Snap back fast, then hold most of the recoil while stunned (the game blends out when it ends).
        pulse=min(1,t/.35)*(1-.35*max(0,(t-.35)/.65))
        right=Vector((.02,.09,-.16));left=Vector((.015,-.1,-.16))
        body.update(yaw=-14*pulse,lean=-18*pulse,roll=7*pulse,dx=-.07*pulse,dz=STAND-.03*pulse,head_pitch=-10*pulse,head_yaw=8*pulse)
    if name=='carry_walk':
        # Legs keep the walk cycle; the arms stay locked overhead on the load and the torso stays upright
        # (a load on the head swings less than free arms do).
        right=Vector((.0,.07,.245));left=Vector((.0,-.07,.245));blade=Vector((.0,.6,.8)).normalized()
        body.update(lean=-3,yaw=body['yaw']*.35,head_yaw=0,roll=body['roll']*.5)
    pb[ROOT_BONE].location=rest[ROOT_BONE].to_3x3().inverted() @ Vector((body['dx'],body['dy'],body['dz']))
    update()
    total=Quaternion(UP,math.radians(body['yaw'])) @ Quaternion(Vector((1,0,0)),math.radians(body['roll'])) @ Quaternion(SPINE_FRONT,math.radians(body['lean']))
    orient('tripo::Spine_0',Quaternion().slerp(total,.4) @ rest['tripo::Spine_0'].to_quaternion())
    orient('tripo::Spine_1',total @ rest['tripo::Spine_1'].to_quaternion())
    head=Quaternion(UP,math.radians(body['yaw']*.35+body['head_yaw'])) @ Quaternion(SPINE_FRONT,math.radians(body['lean']*.4+body['head_pitch']))
    orient('tripo::Head_0',head @ rest['tripo::Head_0'].to_quaternion())
    for prefix,target in zip((RL,LL),feet):
        limb(prefix,target,(1,0,.05))
        # The scan's boots splay ~29 degrees outward; turn them to ~8 degrees.
        orient(prefix+'2',Quaternion(UP,math.radians(TOE_IN*(-1 if prefix==RL else 1))) @ rest[prefix+'2'].to_quaternion())
    limb(R,pb[R+'0'].head+total@right,total@Vector((-.15,1,-.2)))
    limb(L,pb[L+'0'].head+total@left,total@Vector((-.15,-1,-.2)))
    if hand_ready is None: hand_ready=pb[HAND].matrix.to_quaternion().copy()
    orient(HAND,READY_BLADE.rotation_difference(blade) @ hand_ready)
    # Curl toward the palm in bind-space, transformed into each joint's actual
    # local axes. Local X is not the finger hinge on this generated skeleton.
    for wrist,sign in [(HAND,-1),(L+'2',1)]:
        # The thumb is the chain whose root is nearest the wrist. Bones are NOT named by role (the left
        # middle finger is called Left_Limb_3), and giving neighbours different curls tears the webbing.
        thumb=min(pb[wrist].children,key=lambda c:(c.head-pb[wrist].head).length)
        for b in pb[wrist].children_recursive:
            axis=rest[b.name].to_quaternion().inverted() @ Vector((0,0,sign))
            top=b
            while top.parent is not None and top.parent.name!=wrist: top=top.parent
            angle=FINGER_CURL[0] if top==thumb else FINGER_CURL[1]
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

durations={'climbTop':12,'climb':24,'carry_walk':24,'knock':16,'throw':18,'toss':18,'idle':96,'walk':24,'run':16,'attack_a':22,'attack_b':22,'heavy':22,'dash':22,'shoot':22,'skill':28,'guard':12,'hurt':10,'jump':18,'fall':22,'land':16,'carry':12,'grab':22}
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
for dec in decals: dec.select_set(True)
for ob in bpy.context.scene.objects:
    if ob.type=='MESH' and ob.name.startswith('tripo'): ob.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,
    export_skins=True,export_all_influences=False,export_optimize_animation_size=True,export_yup=True)
print('EXPORTED',OUTPUT)
# ---- lite build for phones: the same model with every big texture halved (2048 -> 1024), about a quarter of the texture memory
for img in bpy.data.images:
    if img.type == 'IMAGE' and img.size[0] >= 2048 and img.name not in ('Render Result', 'Viewer Node'):
        img.scale(1024, 1024)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT).replace('-animated.glb', '-animated-lite.glb'), export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_skins=True, export_all_influences=False, export_optimize_animation_size=True, export_yup=True)
print('EXPORTED LITE')

