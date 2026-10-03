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
export function tripoCarryHeight(rootScale){return (TRIPO_CARRY_BOTTOM+TRIPO_MESH_OFFSET)*rootScale;}
export function configureTripo(g){
  g.root.scale.setScalar(TRIPO_SCALE);
  g.root.rotation.y=-Math.PI/2;
  // Center the scan's hips (source X=-.19) over the gameplay origin.
  g.root.position.z=.19*TRIPO_SCALE;
  g.tripo=true;
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
