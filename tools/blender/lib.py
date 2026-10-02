import bpy, bmesh, math
from mathutils import Vector, Quaternion, Euler, Matrix

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, color, rough=.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = [int(color[i:i+2],16)/255 for i in (1,3,5)]
    lin = [(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4) for x in c]
    b.inputs['Base Color'].default_value = (*lin,1)
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (*lin,1)
    return m

def obj_from_bm(name, bm, material, smooth=True, subsurf=0):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    me.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if subsurf:
        bpy.context.view_layer.objects.active = o
        md = o.modifiers.new('sub','SUBSURF'); md.levels = subsurf; md.render_levels = subsurf
        bpy.ops.object.modifier_apply(modifier='sub')
    return o

def loft(rings, segs=16, cap_top=True, cap_bottom=True):
    """rings: list of (z, rx, ry, cx, cy) -> closed lofted surface (Z up)."""
    bm = bmesh.new(); rows = []
    for (z, rx, ry, cx, cy) in rings:
        row = []
        for i in range(segs):
            a = i/segs*math.tau
            row.append(bm.verts.new((cx + math.cos(a)*rx, cy + math.sin(a)*ry, z)))
        rows.append(row)
    for r in range(len(rows)-1):
        for i in range(segs):
            bm.faces.new((rows[r][i], rows[r][(i+1)%segs], rows[r+1][(i+1)%segs], rows[r+1][i]))
    if cap_bottom: bm.faces.new(rows[0][::-1])
    if cap_top: bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def tube(path, segs=12, cap=True):
    """path: list of (point Vector, radius, optional (sx,sy) squash). Rings perpendicular to the segment direction."""
    bm = bmesh.new(); rows = []
    pts = [Vector(p[0]) for p in path]
    for k, item in enumerate(path):
        p = pts[k]; r = item[1]; sq = item[2] if len(item) > 2 else (1,1)
        d = (pts[min(k+1,len(pts)-1)] - pts[max(k-1,0)]).normalized()
        up = Vector((0,1,0)) if abs(d.y) < .9 else Vector((1,0,0))
        u = d.cross(up).normalized(); v = d.cross(u).normalized()
        row = []
        for i in range(segs):
            a = i/segs*math.tau
            row.append(bm.verts.new(p + u*math.cos(a)*r*sq[0] + v*math.sin(a)*r*sq[1]))
        rows.append(row)
    for r in range(len(rows)-1):
        for i in range(segs):
            bm.faces.new((rows[r][i], rows[r][(i+1)%segs], rows[r+1][(i+1)%segs], rows[r+1][i]))
    if cap:
        bm.faces.new(rows[0][::-1]); bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def sphere_bm(r=1, scale=(1,1,1), loc=(0,0,0), u=20, v=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    for vert in bm.verts:
        vert.co = Vector((vert.co.x*scale[0], vert.co.y*scale[1], vert.co.z*scale[2])) + Vector(loc)
    return bm

def cone_bm(base, tip, radius, segs=8, base_r2=0.0):
    bm = bmesh.new(); b = Vector(base); t = Vector(tip); d = (t-b); L = d.length; d.normalize()
    up = Vector((0,0,1)) if abs(d.z) < .9 else Vector((1,0,0))
    u = d.cross(up).normalized(); v = d.cross(u).normalized()
    ring = [bm.verts.new(b + u*math.cos(i/segs*math.tau)*radius + v*math.sin(i/segs*math.tau)*radius) for i in range(segs)]
    tipv = bm.verts.new(t)
    for i in range(segs): bm.faces.new((ring[i], ring[(i+1)%segs], tipv))
    bm.faces.new(ring[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def box_bm(size, loc=(0,0,0), rot=(0,0,0)):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    m = Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*size,1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    return bm

def merge(bms):
    out = bmesh.new()
    for bm in bms:
        me = bpy.data.meshes.new('t'); bm.to_mesh(me); bm.free(); out.from_mesh(me); bpy.data.meshes.remove(me)
    return out

def smoothstep(a, b, x):
    t = max(0, min(1, (x-a)/(b-a))) if b != a else (1 if x >= b else 0)
    return t*t*(3-2*t)
