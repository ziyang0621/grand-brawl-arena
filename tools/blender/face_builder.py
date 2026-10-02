"""Face: eyes with sclera / iris / pupil / two catch-lights / thick upper lid, tapered brows, soft nose, a proper mouth (cavity, tongue, teeth,
lips) laid on the real head surface (ray-cast), cheeks and marks. Everything the game animates carries shape keys:
blink squint (eyes) · open shut wide grit (mouth) · angry sad up (brows)."""
import math, bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from lib import *

def shape(o, name, pivot=(0,0,0), scale=(1,1,1), move=(0,0,0), rot_y=0.0):
    me = o.data
    if not me.shape_keys: o.shape_key_add(name='Basis')
    k = o.shape_key_add(name=name); P = Vector(pivot); c, s = math.cos(rot_y), math.sin(rot_y)
    for v in me.vertices:
        d = v.co - P; d = Vector((d.x*scale[0], d.y*scale[1], d.z*scale[2]))
        d = Vector((d.x*c + d.z*s, d.y, -d.x*s + d.z*c))
        k.data[v.index].co = P + d + Vector(move)

MOUTHS = {   # w half-width, h opening height, smile corner lift, tilt one corner higher
    'grin': dict(w=.205, h=.088, smile=.034, tilt=0), 'shark': dict(w=.23, h=.105, smile=.03, tilt=0), 'small': dict(w=.085, h=.04, smile=.014, tilt=0),
    'smirk': dict(w=.13, h=.016, smile=.016, tilt=.034), 'cat': dict(w=.1, h=.042, smile=-.012, tilt=0), 'flat': dict(w=.1, h=.012, smile=0, tilt=0)}
VARIANTS = {   # (width x, height x, smile x)
    'base': (1, 1, 1), 'open': (.95, 1.55, .6), 'shut': (1.02, .12, 1.2), 'wide': (1.28, 1.15, 1.5), 'grit': (1.12, .55, .8)}

def build_face(spec, sk, M, head, HC):
    face = spec.get('face', {})
    tree = BVHTree.FromObject(head, bpy.context.evaluated_depsgraph_get())
    def surf(x, z, lift=0.0):
        hit = tree.ray_cast(Vector((x, -3, z)), Vector((0, 1, 0)))
        return (hit[0] + hit[1]*lift) if hit[0] is not None else Vector((x, -.46 - lift, z))
    def add(name, bm, mat, smooth=True, sub=0):
        o = obj_from_bm(name, bm, mat, smooth=smooth, subsurf=sub); sk.rigid(o, 'head'); return o
    eh, ew, pup = face.get('eye_h', 1.0), face.get('eye_w', 1.0), face.get('pupil', 1.0)
    brow_t, brow_w, tilt = face.get('brow_t', 1.0), face.get('brow_w', 1.0), face.get('brow_tilt', .34)
    EZ = 3.24
    # ---- eyes ----
    for s in (1, -1):
        add('ear', sphere_bm(.09, (.55,.8,1), (s*.49,0,3.2), 8, 6), M['skin'])
        ex = s*.2
        if face.get('hide_eye') != s:
            base = surf(ex, EZ); sy = base.y
            parts = [add('eyewhite', sphere_bm(.15*ew, (1,.3,1.2*eh), (ex, sy+.005, EZ), 16, 12), M['white'])]
            parts.append(add('iris', sphere_bm(.094*pup, (1,.34,1.38*eh), (ex - s*.012, sy-.03, EZ-.004), 14, 10), M['iris']))
            parts.append(add('pupil', sphere_bm(.052*pup, (1,.4,1.42*eh), (ex - s*.012, sy-.05, EZ-.004), 10, 8), M['black']))
            parts.append(add('shine', sphere_bm(.03*pup, (1,.5,1), (ex + s*.022, sy-.068, EZ+.05*eh), 8, 6), M['white']))
            parts.append(add('shine2', sphere_bm(.014*pup, (1,.5,1), (ex - s*.03, sy-.065, EZ-.045*eh), 6, 5), M['white']))
            # thick upper lid, heavier at the outer corner
            pts = []
            for i in range(9):
                t = i/8; x = ex + (t - .5)*.34*ew*(-s); z = EZ + .165*eh*math.sin(math.pi*t)**.75 - .01
                pts.append(((x, sy - .02 - .04*math.sin(math.pi*t), z), .012 + .014*(t if s < 0 else 1 - t)))
            parts.append(add('lid', tube(pts, 6, cap=True), M['brow'], sub=0))
            if face.get('lash'):
                ox = ex + s*.17*ew
                parts.append(add('lash', cone_bm((ox, sy-.02, EZ+.1*eh), (ox + s*.1, sy-.02, EZ+.2*eh), .018, 4), M['brow'], smooth=False))
                parts.append(add('lash2', cone_bm((ox, sy-.02, EZ+.02*eh), (ox + s*.09, sy-.02, EZ+.06*eh), .014, 4), M['brow'], smooth=False))
            for p_ in parts:
                shape(p_, 'blink', (ex, sy, EZ), scale=(1,1,.08), move=(0,0,-.012*eh)); shape(p_, 'squint', (ex, sy, EZ), scale=(1.04,1,.42), move=(0,0,-.03*eh))
        # tapered brows
        bz = EZ + .2*eh + .045; pts = []
        for i in range(6):
            t = i/5; x = ex + (t - .5)*.3*brow_w*(-s)*-1*-1; x = ex + (-s)*(.5 - t)*-.3*brow_w
            x = ex - s*.15*brow_w + s*.3*brow_w*t
            z = bz + .018*math.sin(math.pi*t) - tilt*.12*(1 - t)*0 + tilt*.1*(t - .5)*(-1)
            pts.append(((x, surf(x, z).y - .012, z), (.022 + .016*math.sin(math.pi*min(1, t*1.1)))*brow_t))
        br = add('brow', tube(pts, 6, cap=True), M['brow'])
        shape(br, 'angry', (ex, -.4, bz), rot_y=s*.34, move=(-s*.015, 0, -.045)); shape(br, 'sad', (ex, -.4, bz), rot_y=-s*.6, move=(0, 0, .035)); shape(br, 'up', (ex, -.4, bz), move=(0, 0, .07))
    # ---- nose ----
    nose = face.get('nose', 'dot')
    if nose == 'dot': add('nose', sphere_bm(.042, (1,.8,1.1), tuple(surf(0, 3.07, .016)), 8, 6), M['skin'])
    elif nose == 'long': add('nose', cone_bm(tuple(surf(0, 3.1, -.02)), (0,-.95,3.0), .085, 8), M['skin'], smooth=False)
    elif nose == 'hook': add('nose', merge([sphere_bm(.05, (1,1,1.3), tuple(surf(0, 3.1, .01)), 8, 6), cone_bm(tuple(surf(0, 3.12, .0)), (0,-.58,2.98), .045, 6)]), M['skin'], smooth=False)
    if nose == 'dot':   # a hint of nostrils
        for s in (1, -1): add('nostril', sphere_bm(.01, (1,.5,.8), tuple(surf(s*.022, 3.045, .035)), 5, 4), M['lip'])
    if face.get('plaster'): add('plaster', box_bm((.2,.02,.065), tuple(surf(0, 3.12, .012)), (0,0,.4)), M['white'], smooth=False)
    if face.get('scar'): add('scar', box_bm((.026,.016,.19), tuple(surf(.2, 3.12, .01)), (0,0,.4)), M['lip'], smooth=False)
    for (fx, fz) in face.get('freckles', []): add('freckle', sphere_bm(.014, (1,.5,1), tuple(surf(fx, fz, .004)), 5, 4), M['lip'])
    if face.get('blush'):
        for s in (1, -1): add('blush', sphere_bm(.075, (1,.14,.6), tuple(surf(s*.3, 2.98, -.002)), 10, 6), M['blush'])
    # ---- mouth ----
    mk = MOUTHS[face.get('mouth', 'grin')]; my = face.get('mouth_y', 2.9); mx = face.get('mouth_x', 0); teeth = face.get('teeth', 'row')
    def mxz(u, v, var):
        wx, hx, sx = VARIANTS[var]; w = mk['w']*wx; hh = mk['h']*hx*max(0.0, 1 - u*u)**.7
        zu = my + mk['smile']*sx*u*u + mk['tilt']*u
        return mx + u*w, zu - v*hh
    def gridbm(rows, cols, fn):
        bm = bmesh.new(); vs = [[bm.verts.new(fn(c/(cols-1)*2 - 1, r/(rows-1))) for c in range(cols)] for r in range(rows)]
        for r in range(rows - 1):
            for c in range(cols - 1): bm.faces.new((vs[r][c], vs[r][c+1], vs[r+1][c+1], vs[r+1][c]))
        return bm
    def lipbm(var):
        pts = []
        for i in range(17):
            u = -1 + i/8 if i <= 16 else 1
            if i > 8: break
        up = [mxz(-1 + i/12, 0, var) for i in range(25)]; lo = [mxz(1 - i/12, 1, var) for i in range(25)]
        path = [((tuple(surf(x, z, .008))), .0105) for (x, z) in up + lo[1:]]
        return tube(path, 6, cap=False)
    def part(name, make, mat, smooth=True, keys=('open','shut','wide','grit')):
        o = add(name, make('base'), mat, smooth=smooth)
        if mat is not None and keys:
            o.shape_key_add(name='Basis')
            for k in keys:
                bm = make(k); kb = o.shape_key_add(name=k)
                for i, v in enumerate(bm.verts): kb.data[i].co = v.co
                bm.free()
        return o
    part('mouth', lambda var: gridbm(5, 25, lambda u, v: surf(*mxz(u, v, var), .004)), M['mouth'])
    part('tongue', lambda var: gridbm(4, 15, lambda u, v: surf(*mxz(u*.62, .5 + v*.5, var), .0065)), M['tongue'])
    part('lips', lipbm, M['lip'])
    if teeth == 'row':
        part('teeth', lambda var: gridbm(3, 21, lambda u, v: surf(*mxz(u*.88, v*.34, var), .0075)), M['white'], smooth=False)
    elif teeth == 'buck':
        for sgn in (-1, 1):
            part('tooth', lambda var, g=sgn: gridbm(3, 3, lambda u, v: surf(*mxz(g*.1 + u*.075, v*.9, var), .0075)), M['white'], smooth=False)
    elif teeth == 'shark':
        def sharks(var):
            bm = bmesh.new()
            for i in range(7):
                u0 = -.84 + i*.28
                a = bm.verts.new(surf(*mxz(u0 - .1, 0, var), .0075)); b = bm.verts.new(surf(*mxz(u0 + .1, 0, var), .0075)); c = bm.verts.new(surf(*mxz(u0, .62, var), .008))
                bm.faces.new((a, b, c))
            for i in range(5):
                u0 = -.6 + i*.3
                a = bm.verts.new(surf(*mxz(u0 - .07, 1, var), .0075)); b = bm.verts.new(surf(*mxz(u0 + .07, 1, var), .0075)); c = bm.verts.new(surf(*mxz(u0, .5, var), .008))
                bm.faces.new((b, a, c))
            return bm
        part('teeth', sharks, M['white'], smooth=False)
