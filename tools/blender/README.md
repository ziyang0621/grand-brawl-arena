# Blender character pipeline

Characters are authored in Blender by script and loaded by the game as skinned, animated glTF (`models/<id>.glb`).
Scripts are the source of truth: change a spec or a builder, rebuild, re-export.

```sh
python3.11 -m venv venv && ./venv/bin/pip install bpy==4.2.0 numpy            # headless Blender (~500 MB)
./venv/bin/python build_char.py swordsman guardian brawler gunner cook stormcaller   # meshes + rig  -> out/<id>_rig.blend
./venv/bin/python animate_char.py swordsman guardian brawler gunner cook stormcaller # clips + export -> ../../models/<id>.glb
./poses.sh guardian idle:0 attack_a:9 heavy:9                                  # contact sheet of poses (needs node + playwright for the sheet)
./venv/bin/python render.py -- out/guardian_anim.blend out/pic 25 9 attack_a  # Cycles preview: file, prefix, camera angles, frame, action
```

- `rig.py` — the ONE skeleton (17 bones, same rest pose for everybody), weight helpers. Because the rest pose is shared, clips are shared; a character is its meshes + a stature scale the game applies (`STATURE` in `arena-models.js`).
- `face_builder.py` — the face: eyes (sclera / iris / pupil / catch-lights / upper lid), tapered brows, nose, and a mouth ray-cast onto the real head surface (cavity, tongue, teeth, lips) with shape keys `blink squint open shut wide grit angry sad up`.
- `char_builder.py` — `build(spec)`: lofted torso, jacket / vest / suit / bolero, skirt, sleeves, hands, trousers, boots, head, face, hair styles (`spiky tall_spiky neat curly swept long`), headwear (`band sailor_cap goggles bow`), weapons (`sword gun staff`, buckler). The face parts carry **shape keys** `blink squint open shut wide angry sad up`.
- `specs.py` — one dict per character: colours, proportions, face, hair, weapon, and `style` (which clip set).
- `animate_char.py` — clips for every style (`sword swordshield fist gun kick staff`): `idle walk run jump fall land attack_a attack_b heavy dash shoot skill guard hurt carry grab`. Attack clips share one timeline (0 idle, 5 wind-up, 9 contact, 15 follow-through, 22 idle) so the game can scrub them by attack phase. Poses are written in armature space: `f` forward, `o` outward, `t` twist, in degrees.
- `lib.py` — bmesh helpers (loft, tube, sphere, cone, box, materials).

Game side: `arena-glb.js` (load, toon material, skinned ink outline, `set(name,time)` pose playback, `setFace`) and `driveGlb()` / `attachGlb()` in `arena.js` (which clip and which time from the fight state; expression from the fight state; weapon glow / trail / sparks re-created on the new weapon). `glb-study.html` is a viewer. The header button (or `?glb=0` / `?glb=1`) switches between these models and the older procedural ones.
