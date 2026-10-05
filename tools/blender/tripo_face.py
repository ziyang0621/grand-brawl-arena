"""Expression decals for a Tripo character's painted face (the roster counterpart of add_face() in animate_tripo_pirate.py).

The scans paint the eyes, brows and mouth into the texture, and the face mesh is far too sparse to deform them. So, as for the pirate,
skin-coloured decals with a different eye / brow / mouth drawn on them are projected onto the real face surface and skinned to the
head: '><' hurt eyes, closed arcs, angry / sad brows, four mouths, cheek blush and a tear. The runtime (arena.js TRIPO_FACE) shows one
set at a time. Positions are given as pixels in a front orthographic render of the rest pose (see `face` in tripo_specs.py) so they
can be read straight off a picture: +Y is image right, 0.0005 armature units per pixel, the picture centred on `centre`.
"""
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

PX = .0005
INK = (.07, .045, .045)
MOUTH = (.30, .035, .06)
TONGUE = (.88, .34, .42)
TEETH = (.98, .97, .94)


def build_face(bpy, arm, ob, face):
    """Create the decal objects; returns them so the caller can export them with the body."""
    me = ob.data
    me.calc_loop_triangles()
    toarm = arm.matrix_world.inverted() @ ob.matrix_world
    tomesh = toarm.inverted()
    cy, cz = face['centre']

    def at(px, py):
        return cy + (px - 400) * PX, cz - (py - 400) * PX
    image = None
    for m in me.materials:
        for link in m.node_tree.links:
            if link.to_socket.name == 'Base Color' and link.from_node.type == 'TEX_IMAGE':
                image = link.from_node.image
    W, H = image.size
    px_data = image.pixels[:]
    uvl = me.uv_layers.active.data
    tris = [[toarm @ me.vertices[v].co for v in t.vertices] for t in me.loop_triangles]
    bvh = BVHTree.FromPolygons([v for t in tris for v in t], [(3 * i, 3 * i + 1, 3 * i + 2) for i in range(len(tris))])

    def onface(p, hint=Vector((1, 0, 0)), lift=.0035):
        hit = bvh.ray_cast(p + hint * .3, -hint)
        loc, n = (hit[0], hit[1]) if hit[0] else bvh.find_nearest(p)[:2]
        if n.dot(hint) < 0:
            n = -n
        return loc + n * lift, n

    def texel(point):
        """Texture colour under a point of the face (nearest surface)."""
        ok, loc, nor, idx = ob.closest_point_on_mesh(tomesh @ point)
        poly = me.polygons[idx]
        verts = [me.vertices[v].co for v in poly.vertices]
        w = poly_3d_calc(verts, loc)
        u = sum((uvl[li].uv[0] * wi for li, wi in zip(poly.loop_indices, w)))
        v = sum((uvl[li].uv[1] * wi for li, wi in zip(poly.loop_indices, w)))
        i = (min(H - 1, max(0, int(v * H))) * W + min(W - 1, max(0, int(u * W)))) * 4
        return px_data[i:i + 3]

    samples = []
    for sx, sy in face['skin']:
        y, z = at(sx, sy)
        p, _ = onface(Vector((.3, y, z)), lift=0)
        samples.append(texel(p))
    skin = [sorted(c[i] for c in samples)[len(samples) // 2] for i in range(3)]
    print('FACE skin', [round(x, 3) for x in skin])

    def point(px, py):
        y, z = at(px, py)
        p, n = onface(Vector((.3, y, z)), lift=0)
        return p

    centre3 = point(*face.get('look', (400, 400)))
    face_pos = {v.index: toarm @ v.co for v in me.vertices}
    face_ids = [i for i, p in face_pos.items() if (p - centre3).length < .13 and p.x > centre3.x - .09]
    decals = []

    def texture(name, draw, size=128):
        img = bpy.data.images.new(name, size, size, alpha=True)
        buf = [0.0] * (size * size * 4)
        for y in range(size):
            for x in range(size):
                u, v = (x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1
                r = math.hypot(u * 1.05, v * 1.25)
                a = max(0, min(1, (1 - r) / .22))
                ink = draw(u, v)
                col = [skin[0] * (1 - ink), skin[1] * (1 - ink), skin[2] * (1 - ink)]
                i = (y * size + x) * 4
                buf[i:i + 4] = [col[0], col[1], col[2], max(a, ink * min(1, a * 4))]
        img.pixels = buf
        img.pack()
        return img

    def texture_ink(name, draw, size=128):
        """An eye drawn as ink only (no skin patch): for an eye that hair falls over, so the mark shows on the hair itself."""
        img = bpy.data.images.new(name, size, size, alpha=True)
        buf = [0.0] * (size * size * 4)
        for y in range(size):
            for x in range(size):
                u, v = (x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1
                ink = draw(u, v)
                i = (y * size + x) * 4
                buf[i:i + 4] = [INK[0], INK[1], INK[2], ink]
        img.pixels = buf
        img.pack()
        return img

    def seg(u, v, a, b, w):
        ax, ay = a
        bx, by = b
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
        d = math.hypot(u - ax - t * dx, v - ay - t * dy)
        return max(0, min(1, (w - d) / .05))

    def chevron(side):
        k = -side
        return lambda u, v: max(seg(u, v, (-.45 * k, .42), (.42 * k, 0), .12), seg(u, v, (.42 * k, 0), (-.45 * k, -.42), .12))

    def closed(u, v):
        return max(seg(u, v, (-.55, .05), (-.2, -.2), .11), seg(u, v, (-.2, -.2), (.2, -.2), .11), seg(u, v, (.2, -.2), (.55, .05), .11))

    def material(name, img=None, color=None, alpha=1):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        mat.blend_method = 'BLEND'
        nodes = mat.node_tree.nodes
        shader = nodes.get('Principled BSDF')
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
        mat.node_tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
        shader.inputs['Roughness'].default_value = .8
        return mat

    def decal(name, mat, centre, width, height, lift=.0045):
        pos, n = onface(centre)
        u = n.cross(Vector((0, 0, 1))).normalized()
        w = n.cross(u).normalized()
        if u.y < 0:
            u = -u
        if w.z < 0:
            w = -w
        verts, uvs, faces, armpts = [], [], [], []
        for j in range(5):
            for i in range(7):
                a, b = i / 6 * 2 - 1, j / 4 * 2 - 1
                p, _ = onface(pos + u * a * width / 2 + w * b * height / 2, n, lift)
                verts.append(tomesh @ p)
                uvs.append(((a + 1) / 2, (b + 1) / 2))
                armpts.append(p)
        for j in range(4):
            for i in range(6):
                k = j * 7 + i
                faces.append((k, k + 1, k + 8, k + 7))
        mesh = bpy.data.meshes.new(name + 'Mesh')
        mesh.from_pydata(verts, [], faces)
        mesh.materials.append(mat)
        layer = mesh.uv_layers.new()
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uvs[mesh.loops[li].vertex_index]
        dec = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(dec)
        dec.matrix_world = ob.matrix_world.copy()
        for k, p in enumerate(armpts):
            under = min(face_ids, key=lambda i: (face_pos[i] - p).length)
            for g in me.vertices[under].groups:
                gname = ob.vertex_groups[g.group].name
                (dec.vertex_groups.get(gname) or dec.vertex_groups.new(name=gname)).add([k], g.weight, 'REPLACE')
        dec.parent = arm
        dec.matrix_parent_inverse = arm.matrix_world.inverted()
        dec.modifiers.new('Head skin', 'ARMATURE').object = arm
        decals.append(dec)

    def paint(name, layers, fill=True, size=128):
        img = bpy.data.images.new(name, size, size, alpha=True)
        buf = [0.0] * (size * size * 4)
        for y in range(size):
            for x in range(size):
                u, v = (x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1
                edge = max(0, min(1, (1 - math.hypot(u * 1.02, v * 1.1)) / .2))
                rgb = list(skin)
                a = edge if fill else 0.0
                for layer in layers:
                    out = layer(u, v)
                    if out is None:
                        continue
                    r, g, b, c = out
                    c = max(0, min(1, c))
                    if c <= 0:
                        continue
                    rgb = [rgb[0] * (1 - c) + r * c, rgb[1] * (1 - c) + g * c, rgb[2] * (1 - c) + b * c]
                    a = max(a, c)
                i = (y * size + x) * 4
                buf[i:i + 4] = [rgb[0], rgb[1], rgb[2], a]
        img.pixels = buf
        img.pack()
        return img

    def ellipse(cx, cy, rx, ry, color, soft=.06):
        return lambda u, v: (color[0], color[1], color[2], (1 - math.hypot((u - cx) / rx, (v - cy) / ry)) / soft) if math.hypot((u - cx) / rx, (v - cy) / ry) < 1 else None

    def ring(cx, cy, rx, ry, width, color):
        def f(u, v):
            d = math.hypot((u - cx) / rx, (v - cy) / ry)
            return (color[0], color[1], color[2], (width - abs(d - 1)) / (width * .5)) if abs(d - 1) < width else None
        return f

    def stroke(points, width, color, taper=None):
        def f(u, v):
            best, tt = 9, 0
            for (ax, ay), (bx, by) in zip(points, points[1:]):
                dx, dy = bx - ax, by - ay
                t = max(0, min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
                d = math.hypot(u - ax - t * dx, v - ay - t * dy)
                if d < best:
                    best, tt = d, t
            w = width * (1 if not taper else taper[0] + (taper[1] - taper[0]) * tt)
            return (color[0], color[1], color[2], (w - best) / (w * .35)) if best < w else None
        return f

    def brow(side, kind):
        k = 1 if side > 0 else -1
        pts = [(.95 * k, .5), (.0, -.02), (-.9 * k, -.5)] if kind == 'angry' else [(.95 * k, -.5), (.0, .0), (-.9 * k, .5)]
        return paint('TripoBrow' + kind + str(side), [stroke(pts, .3, INK, taper=(.75, 1.15) if kind == 'angry' else (1.1, .75))])

    def mouth_shout():
        return paint('TripoMouthShout', [ellipse(0, -.05, .62, .75, MOUTH), ellipse(0, -.52, .4, .3, TONGUE),
                                         lambda u, v: (TEETH[0], TEETH[1], TEETH[2], (v - .28) / .05) if v > .28 and math.hypot(u / .62, (v + .05) / .75) < .93 else None,
                                         ring(0, -.05, .62, .75, .14, INK)])

    def mouth_grit():
        lines = [stroke([(x, -.38), (x, .38)], .05, (.4, .38, .36)) for x in (-.4, -.13, .14, .41)]
        return paint('TripoMouthGrit', [lambda u, v: (TEETH[0], TEETH[1], TEETH[2], (.86 - abs(u)) / .06) if abs(u) < .86 and abs(v) < .4 else None,
                                        stroke([(-.86, 0), (.86, 0)], .05, (.45, .42, .4))] + lines + [ring(0, 0, .9, .46, .16, INK)])

    def mouth_grin():
        def shape(u, v):
            if v < .35 and (u / .9) ** 2 + ((v - .35) / .95) ** 2 < 1:
                return (MOUTH[0], MOUTH[1], MOUTH[2], 1)
            return None
        return paint('TripoMouthGrin', [shape, lambda u, v: (TEETH[0], TEETH[1], TEETH[2], 1) if .12 < v < .35 and (u / .9) ** 2 + ((v - .35) / .95) ** 2 < .78 else None,
                                        ellipse(0, -.5, .4, .22, TONGUE), stroke([(-.9, .35), (.9, .35)], .12, INK), ring(0, .35, .9, .95, .1, INK)])

    def mouth_frown():
        return paint('TripoMouthFrown', [stroke([(-.8, -.45), (-.5, .0), (0, .2), (.5, .0), (.8, -.45)], .3, (.32, .06, .08))])

    def tear():
        return paint('TripoTear', [ellipse(0, -.12, .5, .78, (.55, .82, 1)), ellipse(-.14, .0, .14, .3, (1, 1, 1))], fill=False, size=64)

    blush_mat = material('TripoBlush', paint('TripoBlushTex', [lambda u, v: (1, .24, .32, max(0, 1 - math.hypot(u, v * 1.15)) * 1.6)], fill=False, size=64))
    closed_mat = material('TripoEyesClosed', texture('TripoEyesClosedTex', closed))
    for side, spec in face['eyes'].items():
        ex, ey, ew, eh = spec[:4]
        covered = len(spec) > 4 and spec[4] == 'ink'      # hair falls over this eye: ink marks only, drawn on the hair
        c = point(ex, ey)
        w, h = ew * PX, eh * PX
        if covered:
            decal('TripoEyesHurt', material('TripoEyesHurt' + ('R' if side > 0 else 'L'), texture_ink('TripoHurtTex' + str(side), chevron(side))), c, w, h, .006)
            decal('TripoEyesClosed', material('TripoEyesClosedInk' + str(side), texture_ink('TripoClosedInk' + str(side), closed)), c, w, h, .006)
            continue
        decal('TripoEyesHurt', material('TripoEyesHurt' + ('R' if side > 0 else 'L'), texture('TripoHurtTex' + str(side), chevron(side))), c, w, h)
        decal('TripoEyesClosed', closed_mat, c, w, h)
        decal('TripoBlush', blush_mat, point(ex + side * 10, ey + eh * .85), w * .85, h * .5, .005)
        decal('TripoTear', material('TripoTearM' + str(side), tear()), point(ex + side * 6, ey + eh * .6), w * .28, h * .9, .0048)
    for side, spec in face['brows'].items():
        bx, by, bw, bh = spec[:4]
        covered = len(spec) > 4 and spec[4] == 'ink'      # under a fringe: the brow is drawn over the hair, ink only
        for kind in ('angry', 'sad'):
            k = 1 if side > 0 else -1
            pts = [(.95 * k, .5), (.0, -.02), (-.9 * k, -.5)] if kind == 'angry' else [(.95 * k, -.5), (.0, .0), (-.9 * k, .5)]
            tex = paint('TripoBrow' + kind + str(side), [stroke(pts, .3, INK, taper=(.75, 1.15) if kind == 'angry' else (1.1, .75))], fill=not covered)
            decal('TripoBrow' + kind.capitalize(), material('TripoBrow' + kind + str(side), tex), point(bx, by), bw * PX, bh * PX, .006 if covered else .0045)
    mx, my, mw, mh = face['mouth']
    mc, w = point(mx, my), mw * PX
    for key, builder, fw, fh, hh in (('Shout', mouth_shout, 1.1, .75, 1.15), ('Grit', mouth_grit, 1.0, .32, 1.0), ('Grin', mouth_grin, 1.15, .5, 1.0), ('Frown', mouth_frown, 1.0, .4, 1.0)):
        decal('TripoMouth' + key, material('TripoMouthM' + key, builder()), mc, w * fw, max(mh * PX * hh, w * fh), .0045)
    print('FACE decals', len(decals))
    return decals
