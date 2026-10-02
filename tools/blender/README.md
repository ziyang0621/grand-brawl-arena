# Blender character pipeline

Characters can be authored in Blender and loaded by the game as skinned, animated glTF (`models/*.glb`).
Everything is scripted, so a character is regenerated (not hand-edited) and the scripts are the source of truth.

```sh
python3.11 -m venv venv && ./venv/bin/pip install bpy==4.2.0 numpy      # headless Blender, ~500 MB download
./venv/bin/python hongfan.py     # builds the meshes + armature  -> out/hongfan_rig.blend
./venv/bin/python animate.py     # keys the clips and exports    -> out/hongfan.glb   (copy to ../../models/)
# optional preview renders (Cycles, CPU):
./venv/bin/python render.py -- out/hongfan_anim.blend out/pose 40 9 slash_a      # file, prefix, camera angles, frame, action
```

- `lib.py` — small bmesh helpers (lofted torso, tubes, spheres, cones, boxes, materials).
- `hongfan.py` — Hongfan (红帆), an original pirate swordsman. Z up, faces -Y (exports to glTF +Z). Same units as the game: feet at 0, hips at 1.3. 17 bones; every part is weighted by height (smooth bends at shoulder / elbow / hip / knee) or rigid to one bone (head, hands, feet, face).
- `animate.py` — clips `idle walk run jump fall land slash_a slash_b guard hurt`, posed with a small armature-space helper (`f` forward, `o` outward, `t` twist, in degrees) and exported with sampling.

In the game (`arena-glb.js`, `driveGlb()` in `arena.js`): materials become the game's toon material, a skinned ink outline is added, and the game picks the clip and the exact time from its own state (attack phase, walk phase, landing timer ...), so animation stays in step with the simulation. Opt in with the header button or `?glb=1`.
`glb-study.html` is a viewer: clip buttons, angles and an auto-cycle.
