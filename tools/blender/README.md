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

## Tripo pirate pipeline (separate rig, opt-in preview)

Run these commands from the repository root with the Blender executable on PATH (validated using Blender 5.2.2, not the older bpy environment above):

```sh
blender -b --factory-startup --python tools/blender/inspect_tripo_rig.py
blender -b --factory-startup --python tools/blender/animate_tripo_pirate.py
blender -b --factory-startup --python tools/blender/render_tripo_motion.py
blender -b --factory-startup --python tools/blender/render_tripo_closeup.py -- --tag after   # hands, cuffs, belt scabbard
node --test tests/tripo-model.test.js
npm test
npm start
```

On this Mac the Blender executable used was `/Volumes/Blender/Blender.app/Contents/MacOS/Blender`; this mounted-volume path is not portable. Use an installed Blender executable on another machine. Node 20+ is required.

- Input (kept unchanged): `models/tripo-pirate/tripo-out/tripo-pirate-rig-ebbdda11/model.glb`.
- Outputs: `models/tripo-pirate-animated.glb` and `models/tripo-pirate-animated.blend`. The script rebuilds these files; save manual Blender work separately before running it again.
- Review images: `artifacts/tripo-review/` (ignored by Git). Add `-- --source` to the render command to compare the original scan.
- Preview: `three-preview.html?tripo=1&v=83`; isolated viewer: `glb-study.html?m=tripo-pirate`. The server aliases `models/tripo-pirate.glb` to the exported animated GLB; static hosting must preserve that mapping.

### Details another AI must preserve

The source faces Blender +X, with right +Y and up +Z. `arena-tripo.js` rotates the exported model by -pi/2 about Y, scales it by 3.7 and offsets its source hip pivot; the outer fighter group handles gameplay facing. Do not add another rotation in the viewer or game.

`animate_tripo_pirate.py` solves arm and leg two-bone IK in armature space, then bakes quaternion clips. Knees bend toward source +X. Stance feet move linearly backwards; swing feet lift forwards half a cycle apart. The runtime advances these clips by actual distance using `TRIPO_STRIDE`; extra whole-body ground squash/bob is disabled for this model. Attack contact remains frame 9 on the common 22-frame timeline.

The original belt blade was wrongly skinned and produced spikes. The script removes its specific 159-vertex connected component, rigidly rebinds decorative grips, and adjusts boot weights. These topology-specific checks are valid only for the committed source: inspect and adapt them before replacing it. `TripoCutlass` is a new skinned mesh bound entirely to `tripo::0_Right_Limb_2`; its bind transform is calculated from the ready wrist pose. Keep the sword on that bone, not as a separately positioned game-space prop. Finger curl axes are converted into each finger's local bind coordinates. Only the blade steel material gets the upgraded golden emissive effect; preserve the scan textures elsewhere.

The model test parses the exported GLB and checks four-way facing, hilt/wrist invariance, blade movement, knee direction, alternating foot lifts and cycle continuity. It skips when the optional generated GLB is absent, so verify that none of these three tests are skipped when shipping the Tripo preview. Offline renders and data tests passed; browser gameplay, online visual synchronization and mobile performance still require manual review. Original finger/clothing weights can be refined further.

`models/tripo-treasure-chest/tripo-out/arena-treasure-chest-convert-f29af3fb/model.fbx` is a generated source asset only, not integrated into gameplay yet. CLI context, task JSON, Blender backup files and review renders are deliberately excluded from commits.

## Tripo roster pipeline (all characters)

```sh
blender -b --factory-startup --python tools/blender/animate_tripo_char.py -- brawler   # brawler | guardian | gunner | cook | stormcaller
```

- `tripo_specs.py` sets each character's source rig, attack style (`fist swordshield gun kick staff`), weapon, off-hand prop and optional `elbow_pole`.
- `tripo_rig.py` finds the bones by geometry (Tripo bone names are not reliable) and measures leg/arm scale. `has_foot` uses the forward reach of the last
  leg bone; a looser test misclassified brawler/gunner and stretched their fingers ~10x.
- J and U must look different: each style has its own `heavy` choreography. Never spin the spine 360 degrees inside a clip (it tears the chest);
  whole-body spins are applied by `arena.js` (Red Sail L, cook U).
- Foot targets in the pose code are absolute in the stance (floor at z = -.4191 in pirate units): add lifts, never assign bare heights.
- The pirate's jacket is recoloured blue to red by `redden_coat()` in `animate_tripo_pirate.py`.

