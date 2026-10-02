import sys, math, bpy
from mathutils import Vector
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
blend, out = args[0], args[1]; angles = [float(a) for a in args[2].split(',')]; frame = int(args[3]) if len(args) > 3 else None
action = args[4] if len(args) > 4 else None; view = args[5] if len(args) > 5 else 'full'
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 12; sc.cycles.device = 'CPU'; sc.cycles.use_denoising = False
sc.render.resolution_x = 520; sc.render.resolution_y = 700 if view == 'full' else 520; sc.render.film_transparent = False
sc.view_settings.view_transform = 'Standard'
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.72,.76,.8,1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.1; sc.world = w
sun = bpy.data.lights.new('sun','SUN'); sun.energy = 3.2; so = bpy.data.objects.new('sun', sun); so.rotation_euler = (math.radians(50), 0, math.radians(-35)); bpy.context.collection.objects.link(so)
fill = bpy.data.lights.new('fill','SUN'); fill.energy = 1.0; fo = bpy.data.objects.new('fill', fill); fo.rotation_euler = (math.radians(70), 0, math.radians(140)); bpy.context.collection.objects.link(fo)
arm = bpy.data.objects['Hongfan']
if action:
    arm.animation_data_create(); arm.animation_data.action = bpy.data.actions[action]
if frame is not None: sc.frame_set(frame)
cam = bpy.data.cameras.new('c'); cam.lens = 50 if view == 'full' else 85; co = bpy.data.objects.new('c', cam); bpy.context.collection.objects.link(co); sc.camera = co
target = Vector((0,0,1.75)) if view == 'full' else Vector((0,-.3,3.2))
dist = 8.0 if view == 'full' else 6.0
for a in angles:
    r = math.radians(a)
    co.location = target + Vector((math.sin(r)*dist, -math.cos(r)*dist, .3 if view == 'full' else .1))
    d = target - co.location; co.rotation_euler = d.to_track_quat('-Z','Y').to_euler()
    sc.render.filepath = f'{out}_{int(a)}.png'; bpy.ops.render.render(write_still=True)
