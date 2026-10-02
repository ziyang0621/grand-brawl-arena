"""Spec-driven character builder. build(spec) creates meshes + armature in the current Blender scene; face parts get shape keys
(blink / squint / mouth open / shut / wide / brow angry / sad / up) that the game drives from the fight state."""
import sys, math, random, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from lib import *
from rig import *
from face_builder import build_face

def shape(o, name, pivot=(0,0,0), scale=(1,1,1), move=(0,0,0), rot_y=0.0):
    """Add a shape key that scales / rotates (about Y) / moves the vertices around `pivot`."""
    me = o.data
    if not me.shape_keys: o.shape_key_add(name='Basis')
    k = o.shape_key_add(name=name); P = Vector(pivot); c, s = math.cos(rot_y), math.sin(rot_y)
    for v in me.vertices:
        d = v.co - P; d = Vector((d.x*scale[0], d.y*scale[1], d.z*scale[2]))
        d = Vector((d.x*c + d.z*s, d.y, -d.x*s + d.z*c))
        k.data[v.index].co = P + d + Vector(move)

def palette(spec):
    base = {'skin': ('#f2c08f', .7), 'white': ('#ffffff', .4), 'black': ('#111118', .4), 'mouth': ('#6b1d22', .6), 'sole': ('#2a1a14', .9),
            'steel': ('#dfe6ee', .3), 'brow': ('#15151d', .7), 'gold': ('#ffd24a', .4), 'lip': ('#a8434a', .6), 'tongue': ('#e8707a', .6), 'blush': ('#f2a090', .8), 'iris': ('#2b1d16', .5)}
    for k, v in spec['colors'].items(): base[k] = (v, .75)
    return {k: mat(k, c, r) for k, (c, r) in base.items()}

def build(spec):
    reset()
    M = palette(spec); arm = make_armature(spec['id']); sk = Skin(arm)
    cw, cd, aw, lw = spec.get('chest_w', 1), spec.get('chest_d', 1), spec.get('arm_w', 1), spec.get('leg_w', 1)
    jacket = spec.get('jacket'); G = spec.get('gender', 'm')
    # ---- torso: bare skin / shirt, then jacket or vest over it ----
    shirt_mat = M['shirt'] if 'shirt' in M else M['skin']
    shirt = loft([(1.2,.4*cw,.28*cd,0,0),(1.5,.35*cw,.25*cd,0,0),(1.95,.47*cw,.3*cd,0,0),(2.3,.58*cw,.28*cd,0,0),(2.46,.22,.2,0,0)], 24)
    o = obj_from_bm('shirt', shirt, shirt_mat, subsurf=1); sk.zstops(o, TORSO)
    if spec.get('muscle'):
        for s in (1, -1):
            o = obj_from_bm('pec', sphere_bm(.24, (1.15,.7,.8), (s*.22*cw, -.24*cd, 2.05), 12, 9), M['skin'], subsurf=0); sk.zstops(o, TORSO)
        for i in range(3):
            for s in (1, -1):
                o = obj_from_bm('abs', sphere_bm(.1, (1.1,.6,.8), (s*.1, -.27*cd, 1.78-i*.17), 8, 6), M['skin'], subsurf=0); sk.zstops(o, TORSO)
    if jacket:
        hem, open_w = jacket.get('hem', .98), jacket.get('open_w', .1)
        top = jacket.get('top', 2.44)
        jr = [(hem,.54*cw,.38*cd,0,0),(1.3,.47*cw,.33*cd,0,0),(1.65,.42*cw,.3*cd,0,0),(2.0,.55*cw,.34*cd,0,0),(2.3,jacket.get('shoulder',.67)*cw,.33*cd,0,0),(top,.34,.26,0,0)]
        jr = [r for r in jr if r[0] >= hem - .001]
        jb = loft(jr, 28, cap_top=False, cap_bottom=False)
        dele = [f for f in jb.faces if f.calc_center_median().y < -.05 and abs(f.calc_center_median().x) < (open_w + (f.calc_center_median().z - 1.0)*jacket.get('open_flare', .05))]
        bmesh.ops.delete(jb, geom=dele, context='FACES')
        o = obj_from_bm('jacket', jb, M['jacket'], subsurf=1)
        md = o.modifiers.new('solid', 'SOLIDIFY'); md.thickness = .03; md.offset = 1
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid'); sk.zstops(o, TORSO)
        if jacket.get('collar', True):
            collar = loft([(2.42,.3,.25,0,0),(2.58,.27,.22,0,0)], 20, cap_top=False, cap_bottom=False)
            o = obj_from_bm('collar', collar, M[jacket.get('collar_mat', 'jacket')], subsurf=0)
            md = o.modifiers.new('solid', 'SOLIDIFY'); md.thickness = .04; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid')
            sk.bind(o, lambda co: {'neck': .5, 'chest': .5})
    if spec.get('vest'):                     # sleeveless open vest: panels either side of a bare chest
        for s in (1, -1):
            panel = loft([(1.35,.2,.3,s*.36*cw,0),(1.7,.2,.3,s*.34*cw,0),(2.05,.22,.31,s*.4*cw,0),(2.3,.16,.28,s*.42*cw,0)], 12)
            o = obj_from_bm('vest', panel, M['vest'], subsurf=1); sk.zstops(o, TORSO)
    # ---- pelvis, belt ----
    pel = loft([(.95,.46*lw,.32,0,0),(1.3,.44*lw,.3,0,0),(1.5,.4,.28,0,0)], 24)
    o = obj_from_bm('pelvis', pel, M['pants'], subsurf=1); sk.rigid(o, 'hips')
    belt = loft([(1.38,.455,.315,0,0),(1.5,.425,.29,0,0)], 24, cap_top=False, cap_bottom=False)
    o = obj_from_bm('belt', belt, M['belt'] if 'belt' in M else M['sole'], subsurf=0)
    md = o.modifiers.new('solid', 'SOLIDIFY'); md.thickness = .05; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid'); sk.rigid(o, 'hips')
    o = obj_from_bm('buckle', box_bm((.2,.04,.16), (0,-.33,1.44)), M['gold'], smooth=False); sk.rigid(o, 'hips')
    if spec.get('skirt'):
        sc = spec['skirt']
        sk_loft = loft([(1.5,.42,.3,0,0),(1.25,.58,.42,0,0),(sc.get('hem',.98),.74,.52,0,0)], 28, cap_top=False, cap_bottom=False)
        o = obj_from_bm('skirt', sk_loft, M['skirt'], subsurf=1)
        md = o.modifiers.new('solid', 'SOLIDIFY'); md.thickness = .03; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid')
        sk.bind(o, lambda co: interp_weights(co.z, [(1.5, {'hips': 1}), (1.2, {'hips': .75, 'thigh.L': .125, 'thigh.R': .125}), (.9, {'hips': .6, 'thigh.L': .2, 'thigh.R': .2})]))
    # ---- arms ----
    sleeve_mat = M['jacket'] if spec.get('sleeves', 'long') == 'long' else M['skin']
    for suffix, s in (('L', 1), ('R', -1)):
        UA, FA, HA = f'upper_arm.{suffix}', f'forearm.{suffix}', f'hand.{suffix}'
        stops = [(2.45, {'chest': .6, UA: .4}), (2.2, {UA: 1}), (1.95, {UA: 1}), (1.72, {UA: .5, FA: .5}), (1.55, {FA: 1}), (1.42, {FA: 1}), (1.32, {FA: .5, HA: .5})]
        ra = lambda r: r*aw
        sleeve = tube([((s*.64,0,2.34),ra(.22),(1,.95)), ((s*.7,0,2.1),ra(.2),(1,.95)), ((s*.76,0,1.82),ra(.17)), ((s*.8,0,1.6),ra(.16)), ((s*.84,0,1.38),ra(.15)), ((s*.845,0,1.34),ra(.17)+.02)], 14)
        o = obj_from_bm(f'sleeve.{suffix}', sleeve, sleeve_mat, subsurf=1); sk.bind(o, lambda co, st=stops: interp_weights(co.z, st))
        if spec.get('cuff'):
            cuff = tube([((s*.84,0,1.44),ra(.185)),((s*.845,0,1.33),ra(.19))], 14)
            o = obj_from_bm(f'cuff.{suffix}', cuff, M[spec['cuff']], subsurf=0); sk.rigid(o, FA)
        if spec.get('wrap'):
            wrap = tube([((s*.835,0,1.62),ra(.172)),((s*.845,0,1.36),ra(.175))], 14)
            o = obj_from_bm(f'wrap.{suffix}', wrap, M[spec['wrap']], subsurf=0); sk.rigid(o, FA)
        if spec.get('pad'):
            pad = sphere_bm(.2, (1,1,.6), (s*.66,0,2.4), 14, 10)
            o = obj_from_bm(f'pad.{suffix}', pad, M[spec['pad']], subsurf=0); sk.bind(o, lambda co, UA=UA: {UA: .6, 'chest': .4})
        hs = spec.get('hand_scale', 1); hx = s*.855; hb = []
        glove = spec.get('glove')
        hb.append(sphere_bm(.13*hs, (1,.95,1.05), (hx,-.02,1.2), 12, 9))
        for i in range(4):
            hb.append(sphere_bm(.058*hs, (1,1,1.05), (hx+(i-1.5)*.052*hs, -.12*hs, 1.15), 8, 6))
            hb.append(sphere_bm(.05*hs, (1,1,1), (hx+(i-1.5)*.052*hs, -.1*hs, 1.07), 8, 6))
        hb.append(sphere_bm(.055*hs, (1,1,1.2), (hx - s*.1*hs, -.1*hs, 1.2), 8, 6))
        o = obj_from_bm(f'hand.{suffix}', merge(hb), M[glove] if glove else M['skin'], subsurf=0); sk.rigid(o, HA)
    # ---- legs ----
    boot_top = spec.get('boot_top', .5)
    for suffix, s in (('L', 1), ('R', -1)):
        TH, SH, FT = f'thigh.{suffix}', f'shin.{suffix}', f'foot.{suffix}'
        stops = [(1.4, {'hips': 1}), (1.25, {'hips': .4, TH: .6}), (1.1, {TH: 1}), (.86, {TH: 1}), (.6, {SH: 1}), (.3, {SH: 1}), (.18, {SH: .5, FT: .5}), (.1, {FT: 1})]
        rl = lambda r: r*lw
        leg = tube([((s*.26,0,1.34),rl(.27)), ((s*.265,-.01,1.0),rl(.235)), ((s*.27,-.02,.74),rl(.2)), ((s*.27,0,boot_top),rl(.185))], 14)
        leg_mat = M['legs'] if 'legs' in M else M['pants']
        o = obj_from_bm(f'trouser.{suffix}', leg, leg_mat, subsurf=1); sk.bind(o, lambda co, st=stops: interp_weights(co.z, st))
        boot = tube([((s*.27,0,boot_top),rl(.2)), ((s*.27,0,boot_top*.68),rl(.185)), ((s*.27,0,.17),rl(.2))], 14)
        o = obj_from_bm(f'boot.{suffix}', boot, M['boots'], subsurf=1); sk.bind(o, lambda co, st=stops: interp_weights(co.z, st))
        if spec.get('boot_cuff'):
            cuff = tube([((s*.27,0,boot_top+.06),rl(.215)), ((s*.27,0,boot_top-.03),rl(.205))], 14)
            o = obj_from_bm(f'bootcuff.{suffix}', cuff, M[spec['boot_cuff']], subsurf=0); sk.rigid(o, SH)
        foot = merge([sphere_bm(.2*lw, (1,1.35,.62), (s*.27,-.14,.15), 14, 9), sphere_bm(.18*lw, (1,1.1,.7), (s*.27,-.34,.13), 12, 8)])
        o = obj_from_bm(f'foot.{suffix}', foot, M['boots'], subsurf=0); sk.rigid(o, FT)
        sole = box_bm((.36*lw,.7,.06), (s*.27,-.2,.03)); o = obj_from_bm(f'sole.{suffix}', sole, M['sole'], smooth=False, subsurf=0); sk.rigid(o, FT)
    # ---- neck accessories ----
    if spec.get('scarf'):
        sc = loft([(2.36,.3,.27,0,0),(2.52,.28,.25,0,0)], 20, cap_top=False, cap_bottom=False)
        o = obj_from_bm('scarf', sc, M['scarf'], subsurf=1)
        md = o.modifiers.new('solid','SOLIDIFY'); md.thickness = .06; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid'); sk.bind(o, lambda co: {'neck': .5, 'chest': .5})
        o = obj_from_bm('scarftail', box_bm((.16,.05,.55), (.2,-.3,2.1), (0,0,.1)), M['scarf'], smooth=False, subsurf=0); sk.bind(o, lambda co: {'chest': 1})
    if spec.get('tie'):
        o = obj_from_bm('tie', merge([box_bm((.1,.04,.12), (0,-.3,2.32)), box_bm((.14,.04,.5), (0,-.31,2.0)), cone_bm((0,-.31,1.72), (0,-.31,1.55), .09, 4)]), M['tie'], smooth=False, subsurf=0); sk.zstops(o, TORSO)

    # ---- head ----
    HC = Vector((0,-.02,3.22)); hsp = spec.get('head', {})
    jaw = hsp.get('jaw', .36)
    hd = sphere_bm(.5, (hsp.get('w',1.0),.97,1.03), tuple(HC), 28, 20)
    for v in hd.verts:
        dz = (HC.z - .08) - v.co.z
        if dz > 0:
            t = min(1, dz/.5); t = t*t*(3-2*t)
            v.co.x *= 1 - jaw*t; v.co.y = HC.y + (v.co.y-HC.y)*(1 - .1*t) - .05*t*(1 if v.co.y < HC.y else 0)
    o = obj_from_bm('head', hd, M['skin'], subsurf=1); sk.rigid(o, 'head')
    neck = tube([((0,0,2.42),.17*(1.4 if spec.get('muscle') else 1)),((0,0,2.8),.16*(1.35 if spec.get('muscle') else 1))], 12); o = obj_from_bm('neck', neck, M['skin'], subsurf=1); sk.rigid(o, 'neck')
    build_face(spec, sk, M, o, HC)
    # ---- hair and headwear ----
    HAIR = M['hair']; hair = spec['hair']; rnd = random.Random(hair.get('seed', 7)); st = hair['style']
    def dome(low_z=3.4, back_z=2.95, side=True, r=.545, cz=3.26, sx=1.03):
        cap = sphere_bm(r, (sx,1.02,1.06), (0,.05,cz), 24, 16)
        bmesh.ops.delete(cap, geom=[v for v in cap.verts if not (v.co.z > low_z or (v.co.y > -.1 and v.co.z > back_z) or (side and abs(v.co.x) > .33 and v.co.y > -.32 and v.co.z > 3.02))], context='VERTS')
        o = obj_from_bm('hair', cap, HAIR, subsurf=1); sk.rigid(o, 'head'); return o
    spikes = []
    if st in ('spiky', 'tall_spiky'):
        dome(); n = hair.get('n', 15); L = hair.get('len', .46)
        for i in range(n):
            a = (i/n)*math.tau + rnd.uniform(-.12,.12); ring = rnd.choice([.3,.4,.5])
            bx = math.cos(a)*(.18+ring*.34); by = .05 + math.sin(a)*(.2+ring*.3); bz = 3.5 + (1-ring)*.12
            tip = Vector((bx*1.55, by*1.25 + .28, bz + L + rnd.uniform(0,.22) + (.1 if ring<.4 else 0)))
            spikes.append(cone_bm((bx,by,bz-.12), tip, hair.get('thick', .15), 7))
        for i in range(6):
            a = math.radians(95 + i*34); bx = math.cos(a)*.5; by = .1+math.sin(a)*.1+.05; bz = 3.2-(i%3)*.12
            spikes.append(cone_bm((bx,by,bz), (bx*1.5, by+.42, bz-.1-(i%2)*.1), .13, 7))
        for i, x in enumerate((-.34,-.17,.0,.17,.34)):
            spikes.append(cone_bm((x,-.34,3.7), (x*1.25,-.5, 3.43 - abs(x)*.25 - (.05 if i%2 else 0)), .1, 6))
    elif st == 'neat':
        dome(low_z=3.36, side=True)
        for i, x in enumerate((-.36,-.2,-.04,.12,.28,.4)):
            spikes.append(cone_bm((x,-.36,3.66), (x*1.1+.05,-.5, 3.46 - abs(x-.04)*.2), .09, 5))
    elif st == 'curly':
        dome(low_z=3.42)
        for i in range(22):
            a = rnd.uniform(0, math.tau); h = rnd.uniform(0, 1)
            bx = math.cos(a)*(.25+.28*(1-h)); by = .06 + math.sin(a)*(.22+.25*(1-h)); bz = 3.4 + h*.3
            spikes.append(sphere_bm(.17 + rnd.uniform(0,.05), (1,1,.95), (bx,by,bz), 8, 6))
        for x in (-.32,-.1,.12,.32): spikes.append(sphere_bm(.12, (1,.9,.9), (x,-.34,3.6-abs(x)*.15), 8, 6))
    elif st == 'swept':
        dome(low_z=3.38)
        for i in range(8):
            a = math.radians(40+i*35); bx = math.cos(a)*.38; by = .1+math.sin(a)*.3; spikes.append(cone_bm((bx,by,3.5), (bx*1.15,by+.18,3.9+(i%2)*.1), .12, 6))
        # a long fringe that falls over one eye
        side = hair.get('fringe_side', 1)
        spikes.append(cone_bm((side*.05,-.36,3.72), (side*.24,-.5,3.12), .17, 6)); spikes.append(cone_bm((side*.2,-.34,3.7), (side*.34,-.46,3.2), .12, 6)); spikes.append(cone_bm((-side*.08,-.36,3.7), (-side*.12,-.5,3.42), .1, 6))
    elif st == 'long':
        dome(low_z=3.38)
        for i, x in enumerate((-.34,-.2,-.06,.08,.22,.36)): spikes.append(cone_bm((x,-.35,3.7), (x*1.05,-.52,3.36), .1, 6))
        for s in (1, -1):    # side locks
            spikes.append(cone_bm((s*.46,-.05,3.42), (s*.5,-.12,2.75), .13, 7)); spikes.append(cone_bm((s*.42,-.2,3.4), (s*.46,-.28,2.95), .1, 6))
        # long hair down the back, hanging behind the shoulders
        back = tube([((0,.42,3.45),.3,(1.25,.6)), ((0,.54,3.0),.34,(1.3,.55)), ((0,.5,2.5),.32,(1.2,.55)), ((0,.42,2.0),.26,(1,.5)), ((0,.4,1.6),.05,(.5,.4))], 10)
        o = obj_from_bm('longhair', back, HAIR, subsurf=1); sk.rigid(o, 'head')
    if spikes:
        o = obj_from_bm('spikes', merge(spikes), HAIR, smooth=(st != 'curly'), subsurf=0); sk.rigid(o, 'head')
    hw = spec.get('headwear')
    if hw in ('band', 'bandana'):
        rb = bmesh.new(); rows = []
        for (zz, rr) in ((3.44,.535),(3.55,.535)):
            rows.append([rb.verts.new((math.cos(i/36*math.tau)*rr*1.02, .03+math.sin(i/36*math.tau)*rr*.99, zz + (math.sin(i/36*math.tau)*-.04))) for i in range(36)])
        for i in range(36): rb.faces.new((rows[0][i], rows[0][(i+1)%36], rows[1][(i+1)%36], rows[1][i]))
        o = obj_from_bm('headband', rb, M['band'], subsurf=0)
        md = o.modifiers.new('solid','SOLIDIFY'); md.thickness = .03; bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='solid'); sk.rigid(o, 'head')
        tails = merge([box_bm((.08,.03,.3), (-.07,.62,3.38), (.3,0,.2)), box_bm((.08,.03,.26), (.09,.64,3.36), (.25,0,-.25))])
        o = obj_from_bm('bandtails', tails, M['band'], smooth=False, subsurf=0); sk.rigid(o, 'head')
    elif hw == 'sailor_cap':
        crown = loft([(3.55,.54,.54,0,.04),(3.7,.55,.55,0,.04),(3.86,.5,.5,0,.04),(3.9,.48,.48,0,.04)], 24)
        o = obj_from_bm('cap', crown, M['cap'], subsurf=1); sk.rigid(o, 'head')
        o = obj_from_bm('capband', loft([(3.52,.565,.565,0,.04),(3.62,.565,.565,0,.04)], 24, cap_top=False, cap_bottom=False), M['capband'], subsurf=0); sk.rigid(o, 'head')
        brim = bmesh.new(); rows = [[brim.verts.new((math.cos(a)*r, -.1 + math.sin(a)*r*1.0 - (.1 if math.sin(a) < 0 else 0)*0, 3.52)) for a in [i/20*math.pi + math.pi for i in range(21)]] for r in (.52,)]
        o = obj_from_bm('capbrim', box_bm((.9,.38,.05), (0,-.42,3.55), (-.12,0,0)), M['capband'], smooth=False, subsurf=0); sk.rigid(o, 'head')
        o = obj_from_bm('badge', merge([sphere_bm(.08, (1,.4,1), (0,-.55,3.68), 10, 7)]), M['gold'], subsurf=0); sk.rigid(o, 'head')
    elif hw == 'goggles':
        strap = loft([(3.48,.55,.55,0,.04),(3.58,.55,.55,0,.04)], 24, cap_top=False, cap_bottom=False)
        o = obj_from_bm('gstrap', strap, M['strap'], subsurf=0); sk.rigid(o, 'head')
        for s in (1, -1):
            frame = tube([((s*.22,-.5,3.55),.17,(1,1)), ((s*.22,-.62,3.56),.17,(1,1))], 14)
            o = obj_from_bm('gframe', frame, M['gold'], subsurf=0); sk.rigid(o, 'head')
            lens = sphere_bm(.15, (1,.35,1), (s*.22,-.63,3.56), 12, 8)
            o = obj_from_bm('glens', lens, M['lens'], subsurf=0); sk.rigid(o, 'head')
    elif hw == 'bow':
        o = obj_from_bm('bow', merge([sphere_bm(.1, (1.6,.7,1), (.3,-.1,3.78), 10, 7), sphere_bm(.1, (1.6,.7,1), (.5,-.1,3.74), 10, 7), sphere_bm(.07, (1,1,1), (.4,-.1,3.76), 8, 6)]), M['band'], subsurf=0); sk.rigid(o, 'head')
    if spec.get('goatee'):
        o = obj_from_bm('goatee', cone_bm((0,-.42,2.78), (0,-.46,2.52), .09, 6), M['hair'], smooth=False, subsurf=0); sk.rigid(o, 'head')
    if spec.get('curl_brow'):
        o = obj_from_bm('curlbrow', merge([sphere_bm(.045, (1,.5,1), (.3 if spec['curl_brow'] > 0 else -.3, -.4, 3.47), 8, 6)]), M['brow'], subsurf=0); sk.rigid(o, 'head')

    # ---- weapon ----
    wp = spec.get('weapon')
    if wp:
        kind = wp['kind']; col = M[wp.get('mat', 'steel')]
        if kind == 'sword':
            L = wp.get('len', 1.35)
            sw = merge([box_bm((.07,.03,L), (0,0,.1+L/2)), cone_bm((0,0,.1+L), (0,0,.1+L+.27), .05, 4), box_bm((.4,.08,.07), (0,0,.1)), box_bm((.06,.06,.3), (0,0,-.08)), sphere_bm(.07, (1,1,1), (0,0,-.24), 8, 6)])
            rot = (math.radians(88), 0, math.radians(-45))
        elif kind == 'gun':
            sw = merge([box_bm((.13,.13,.62), (0,0,.42)), box_bm((.18,.2,.34), (0,0,.1)), box_bm((.1,.14,.3), (0,.1,-.12), (.35,0,0)), box_bm((.16,.16,.08), (0,0,.76)), sphere_bm(.07, (1,1,1), (0,-.12,.18), 6, 5)])
            col = M['gunmetal'] if 'gunmetal' in M else M['black']; rot = (math.radians(88), 0, math.radians(-25))
        elif kind == 'staff':
            sw = merge([tube([((0,0,-.9),.045),((0,0,1.3),.045)], 8), sphere_bm(.14, (1,1,1), (0,0,1.42), 10, 8), sphere_bm(.09, (1,1,1), (.17,0,1.25), 8, 6), sphere_bm(.09, (1,1,1), (-.17,0,1.25), 8, 6), tube([((0,0,1.18),.12),((0,0,1.3),.12)], 10)])
            col = M['wood'] if 'wood' in M else M['sole']; rot = (math.radians(30), 0, math.radians(-10))
        sword = obj_from_bm('Weapon', sw, col, smooth=False, subsurf=0)
        if kind == 'staff':   # the orbs are a different colour: separate object
            pass
        sword.location = (-.855,-.04,1.2); sword.rotation_euler = rot
        bpy.context.view_layer.objects.active = sword; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        sk.rigid(sword, 'hand.R')
        if kind == 'staff':
            orbs = obj_from_bm('WeaponOrbs', merge([sphere_bm(.1, (1,1,1), (0,0,1.42), 10, 8), sphere_bm(.07, (1,1,1), (.17,0,1.25), 8, 6), sphere_bm(.07, (1,1,1), (-.17,0,1.25), 8, 6)]), M['orb'], smooth=True, subsurf=0)
            orbs.location = (-.855,-.04,1.2); orbs.rotation_euler = rot
            bpy.context.view_layer.objects.active = orbs; bpy.ops.object.transform_apply(location=True, rotation=True, scale=True); sk.rigid(orbs, 'hand.R')
        if wp.get('buckler'):
            r = wp.get('buckler_r', .42)
            disc = tube([((.98,-.04,1.58),r),((1.05,-.04,1.58),r*.94)], 22)
            o = obj_from_bm('Buckler', disc, M['shield'], subsurf=1); sk.rigid(o, 'forearm.L')
            rim = tube([((.97,-.04,1.58),r*1.04),((1.0,-.04,1.58),r*1.04)], 22)
            o = obj_from_bm('BucklerRim', rim, M['gold'], subsurf=0); sk.rigid(o, 'forearm.L')
            o = obj_from_bm('BucklerBoss', sphere_bm(.12, (.6,1,1), (1.09,-.04,1.58), 10, 8), M['gold'], subsurf=0); sk.rigid(o, 'forearm.L')
    # ---- scale the head group (bigger anime heads) ----
    P = Vector((0,-.02,2.85)); K = hsp.get('k', 1.2)
    for ho in sk.head_objs:
        for v in ho.data.vertices: v.co = P + (v.co - P)*K
        if ho.data.shape_keys:
            for kb in ho.data.shape_keys.key_blocks:
                for d in kb.data: d.co = P + (d.co - P)*K
    return arm
