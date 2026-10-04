// Shared by the game and the isolated motion viewer. The scan faces +X;
// gameplay and the other characters face +Z. Keep this calibration in one place.
export const TRIPO_SCALE=3.7;
export const TRIPO_STRIDE={walk:2*.18*TRIPO_SCALE/.6,run:2*.23*TRIPO_SCALE/.48,carry_walk:2*.18*TRIPO_SCALE/.6};
// The projectile spawns the instant the throw button is pressed (see throw/propThrow in arena-core.js),
// but the throw clip releases at frame 8 of 18. Playing the clip from a few frames in puts the visible
// release a few hundredths of a second after the press, so hand and projectile leave together.
export const TOSS_DURATION=.32,TOSS_RELEASE_FRAME=8,TOSS_FIRST_FRAME=6,TOSS_LAST_FRAME=18;
export function tossFrame(timeLeft){const k=Math.min(1,Math.max(0,1-timeLeft/TOSS_DURATION));return TOSS_FIRST_FRAME+k*(TOSS_LAST_FRAME-TOSS_FIRST_FRAME);}
// A crate/barrel carried overhead rests on the head. Heights are in the rig's armature space (z, metres of
// the source scan) and are turned into game units with the model's own root scale.
export const TRIPO_CARRY_BOTTOM=.44,TRIPO_MESH_OFFSET=.499;
export function tripoCarryHeight(rootScale,bottom=TRIPO_CARRY_BOTTOM){return (bottom+TRIPO_MESH_OFFSET)*rootScale;}
// Every Tripo character: its model, game scale, where its hips sit in the rig (so they land on the gameplay origin),
// its stride (from tools/blender/animate_tripo_char.py: amplitude = .18 / .23 x leg scale) and the rig-space height
// at which a carried load rests. The scan faces +X; the root turns it to game +Z.
const LEG=r=>({walk:{amp:.18*r,duty:.6},run:{amp:.23*r,duty:.48}});
// scale: the root scale that makes the 1-unit-tall scan the character's game height (the pirate, 3.7, stands ~3.1 tall);
// hipX: where the hips sit in the rig along the forward axis (the root is shifted so they land on the gameplay origin).
// walk/run amplitudes come from tools/blender/animate_tripo_char.py (models/tripo-<id>-animated.json).
export const TRIPO_CHARS={
  swordsman:{url:'models/tripo-pirate.glb',scale:3.7,hipX:-.19,...LEG(1),carryBottom:.44},
  brawler:{url:'models/tripo-brawler-animated.glb',scale:3.4,hipX:.026,...LEG(.5545),carryBottom:.3},
  guardian:{url:'models/tripo-guardian-animated.glb',scale:3.7,hipX:-.007,...LEG(1.0334),carryBottom:.52},
  gunner:{url:'models/tripo-gunner-animated.glb',scale:3.5,hipX:.061,...LEG(.8436),carryBottom:.4},
  cook:{url:'models/tripo-cook-animated.glb',scale:3.8,hipX:.014,...LEG(1.0986),carryBottom:.58},
};
export function tripoStride(cfg){const w=2*cfg.walk.amp*cfg.scale/cfg.walk.duty;return {walk:w,carry_walk:w,run:2*cfg.run.amp*cfg.scale/cfg.run.duty};}
export function configureTripo(g,cfg=TRIPO_CHARS.swordsman){
  g.root.scale.setScalar(cfg.scale);
  g.root.rotation.y=-Math.PI/2;
  // Center the scan's hips over the gameplay origin (pirate: source X=-.19).
  g.root.position.z=-cfg.hipX*cfg.scale;
  g.tripo=true;g.tripoCfg=cfg;g.stride=tripoStride(cfg);
  g.tripoSwordMaterials=[];
  g.root.getObjectByName('TripoCutlass')?.traverse(o=>{
    if(!o.isMesh||o.userData.ink)return;
    o.material=o.material.clone();
    if(o.material.name==='TripoSteel')g.tripoSwordMaterials.push(o.material);
  });
}

// Pure: which decals show for a fighter state. Eyes, brows and mouth are chosen independently.
export function tripoExpression(s){
  const e={eyes:null,brows:null,mouth:null,tear:false,blush:s.flush,mark:null};   // mark: big comic symbol beside the head, readable at the default camera distance
  if(s.dead){e.eyes='closed';e.brows='sad';e.mouth='frown';}
  else if(s.hurt){e.eyes='hurt';e.mouth='shout';e.mark='sweat';}
  else if(s.striking){e.brows='angry';e.mouth=s.attackTime>0?'shout':'grit';if(s.skill)e.mark='anger';}
  else if(s.guarding){e.brows='angry';e.mouth='grit';}
  else if(s.straining){e.brows='angry';e.mouth='grit';e.mark='sweat';}
  else if(s.won){e.eyes='closed';e.mouth='grin';e.mark='star';}
  else if(s.lowHp){e.brows='sad';e.mouth='frown';e.tear=true;e.mark='sweat';}
  if(!e.eyes&&s.blink)e.eyes='closed';
  return e;
}
