"""python build_char.py <id> [...]  -> out/<id>.blend (rig + meshes). Then animate_char.py <id> keys the clips and exports models/<id>.glb."""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import bpy
from char_builder import build
from specs import SPECS
ids = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else sys.argv[1:]
OUT = os.path.join(HERE, 'out'); os.makedirs(OUT, exist_ok=True)
for cid in ids:
    build(SPECS[cid]); bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f'{cid}_rig.blend')); print('built', cid, len(bpy.data.objects))
