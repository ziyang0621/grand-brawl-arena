import * as THREE from './vendor/three.module.js';
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
  swordsman:{url:'models/tripo-pirate.glb',scale:3.7,hipX:-.19,...LEG(1),carryBottom:.44,look:{head:'Head_2',neck:'Head_1',neckShare:.45},sway:{hair:.8,cloth:.8}},
  brawler:{url:'models/tripo-brawler-animated.glb',scale:3.4,hipX:.026,...LEG(.5545),carryBottom:.3,look:{head:'bone_5',neck:'bone_4',neckShare:.45},sway:{hair:.9,cloth:.7}},
  guardian:{url:'models/tripo-guardian-animated.glb',scale:3.7,hipX:-.007,...LEG(1.0334),carryBottom:.52,look:{head:'Head_1',neck:'Head_0',neckShare:.45},sway:{hair:.8,cloth:1.2}},
  gunner:{url:'models/tripo-gunner-animated.glb',scale:3.5,hipX:.061,...LEG(.8436),carryBottom:.4,look:{head:'Head_3',neck:'Head_2',neckShare:.45},sway:{hair:.7,cloth:.8}},
  cook:{url:'models/tripo-cook-animated.glb',scale:3.8,hipX:.014,...LEG(1.0986),carryBottom:.58,look:{head:'Head_0',neck:'Spine_1',neckShare:.2},sway:{hair:.6,cloth:.9}},
  stormcaller:{url:'models/tripo-stormcaller-animated.glb',scale:3.7,hipX:.033,...LEG(.985),carryBottom:.45,look:{head:'Head_1',neck:'Head_0',neckShare:.45},sway:{hair:1.2,cloth:.9}},
};
export function tripoStride(cfg){const w=2*cfg.walk.amp*cfg.scale/cfg.walk.duty;return {walk:w,carry_walk:w,run:2*cfg.run.amp*cfg.scale/cfg.run.duty};}
export function configureTripo(g,cfg=TRIPO_CHARS.swordsman){
  g.root.scale.setScalar(cfg.scale);
  g.root.rotation.y=-Math.PI/2;
  // Center the scan's hips over the gameplay origin (pirate: source X=-.19).
  g.root.position.z=-cfg.hipX*cfg.scale;
  g.tripo=true;g.tripoCfg=cfg;g.stride=tripoStride(cfg);
  attachSway(g,cfg);
  g.tripoSwordMaterials=[];g.tripoAuraMaterials=[];
  // The power-up glows on whatever this character holds (cutlass blade, pistol barrel, staff). A bare-handed fighter
  // (brawler, cook) glows all over, softly, instead.
  let armed=false;
  for(const name of ['TripoCutlass','TripoPistol','TripoStaff'])g.root.getObjectByName(name)?.traverse(o=>{
    if(!o.isMesh||o.userData.ink)return;
    o.material=o.material.clone();armed=true;
    if(/^Tripo(Steel|Gunmetal)$/.test(o.material.name)||name==='TripoStaff')g.tripoSwordMaterials.push(o.material);
  });
  if(!armed)g.root.traverse(o=>{
    if(!o.isMesh||o.userData.ink||/^Tripo/.test(o.name)||!o.material?.emissive)return;
    o.material=o.material.clone();g.tripoAuraMaterials.push(o.material);
  });
  // Where the comic symbols (anger, sweat, star) float: just above this model's head.
  g.markY=Math.max(3.45,cfg.scale*.97);
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

// Phones and tablets (or ?lite=1) load the lite builds: the same models with halved textures. ?lite=0 forces the full ones.
export const TRIPO_LITE=(()=>{try{const q=new URLSearchParams(location.search).get('lite');if(q!==null)return q!=='0';return (navigator.maxTouchPoints||0)>0&&matchMedia('(pointer:coarse)').matches;}catch{return false;}})();
export const tripoUrl=cfg=>TRIPO_LITE?cfg.url.replace(/(-animated)?\.glb$/,'-animated-lite.glb'):cfg.url;


// ---- Secondary motion and the head look-at (render only; nothing here touches the simulation) ----
// Hair and loose cloth are moved in the vertex shader: the body mesh carries two weights per vertex (`_hair`, `_cloth`, painted by tools/blender/tripo_sway.py) and
// a spring-damper 'follower' point trails each anchor (the head bone for hair, the root bone for cloth). Every vertex is pushed by (follower - anchor) x weight,
// so hair streams behind a running fighter and swings on after a stop, a hit or a turn. The outline shell is patched the same way so the ink line follows.
const FOLLOW={hair:{k:120,c:10,max:.42},cloth:{k:80,c:9,max:.36}};
// Eyes: the pupils are painted into the texture, so 'looking' means sliding the texture under the eye window. Near an eye centre (bind-pose position `vRest`)
// the texture is sampled at uv + J * gaze, where J (uv per unit of surface) comes from the screen-space derivatives of vRest and the uv, so the shift is a real
// movement along the face in the direction `uGaze` whatever the uv layout is. The window feathers out so the lids and the skin around it stay put.
const EYE_FRAGMENT=THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','texture2D( map, vMapUv + eyeShift )');
const EYE_PREP=`
  vec2 eyeShift = vec2(0.0);
  #ifdef USE_MAP
  if (uEyeR > 0.0) {
    float eyeMask = max(1.0 - smoothstep(uEyeR * 0.75, uEyeR * 1.55, distance(vRest, uEyeA)), 1.0 - smoothstep(uEyeR * 0.75, uEyeR * 1.55, distance(vRest, uEyeB)));
    if (eyeMask > 0.001) {
      vec3 dp1 = dFdx(vRest), dp2 = dFdy(vRest); vec2 du1 = dFdx(vMapUv), du2 = dFdy(vMapUv);
      float d11 = dot(dp1, dp1), d12 = dot(dp1, dp2), d22 = dot(dp2, dp2), det = d11 * d22 - d12 * d12;
      if (abs(det) > 1e-14) {
        float r1 = dot(dp1, uGaze), r2 = dot(dp2, uGaze);
        eyeShift = ((d22 * r1 - d12 * r2) * du1 + (d11 * r2 - d12 * r1) * du2) / det * eyeMask;
      }
    }
  }
  #endif
`;
function patchSway(material,uniforms,previous,eye){
  material.onBeforeCompile=(shader,renderer)=>{
    previous?.(shader,renderer);
    shader.uniforms.uSwayHair=uniforms.hair;shader.uniforms.uSwayCloth=uniforms.cloth;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float _hair;\nattribute float _cloth;\nuniform vec3 uSwayHair;\nuniform vec3 uSwayCloth;\nvarying vec3 vRest;')
      .replace('#include <skinning_vertex>','#include <skinning_vertex>\n vRest = position;\n transformed += uSwayHair * (_hair * _hair) + uSwayCloth * (_cloth * _cloth);   // squared: strands stay rooted at the scalp and swing most at the tips');
    if(eye){
      shader.uniforms.uEyeA=eye.a;shader.uniforms.uEyeB=eye.b;shader.uniforms.uEyeR=eye.r;shader.uniforms.uGaze=eye.gaze;
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vRest;\nuniform vec3 uEyeA;\nuniform vec3 uEyeB;\nuniform float uEyeR;\nuniform vec3 uGaze;')
        .replace('#include <map_fragment>',EYE_PREP+EYE_FRAGMENT);
    }
  };
  const key=material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey=()=>(key?key():'')+'sway';
}
const boneByName=(g,name)=>name?Object.values(g.bones).find(b=>b.name.endsWith(name)):null;
export function attachSway(g,cfg){
  let body=null;g.root.traverse(o=>{if(o.isSkinnedMesh&&!o.userData.ink&&o.geometry.attributes._hair&&(!body||o.geometry.attributes.position.count>body.geometry.attributes.position.count))body=o;});
  g.tripoLook={head:boneByName(g,cfg.look?.head),neck:boneByName(g,cfg.look?.neck),neckShare:cfg.look?.neckShare??.45,w:0,yaw:0,pitch:0};
  if(!body){g.tripoSway=null;return;}
  const uniforms={hair:{value:new THREE.Vector3()},cloth:{value:new THREE.Vector3()}};
  // eye windows: the centres of the two 'hurt eye' decals (they sit on the painted eyes, in the same bind space as the body mesh)
  const eyes=[];g.root.traverse(o=>{if(o.isMesh&&!o.userData.ink&&/^TripoEyesHurt/.test(o.name)){o.geometry.computeBoundingBox();eyes.push(o.geometry.boundingBox);}});
  let eye=null;
  if(eyes.length>=2){const a=eyes[0].getCenter(new THREE.Vector3()),b=eyes[1].getCenter(new THREE.Vector3()),sz=eyes[0].getSize(new THREE.Vector3());
    eye={a:{value:a},b:{value:b},r:{value:Math.max(sz.x,sz.y,sz.z)*.5},gaze:{value:new THREE.Vector3()},lateral:b.clone().sub(a).normalize()};}
  body.material=body.material.clone();patchSway(body.material,uniforms,null,eye);
  const shell=body.parent.children.find(o=>o.userData.ink&&o.geometry===body.geometry);
  if(shell){const old=shell.material,m=new THREE.MeshBasicMaterial({color:old.color.clone(),side:THREE.BackSide}),oldKey=old.customProgramCacheKey?.();   // the shared outline material cannot carry per-fighter uniforms, so this fighter gets its own
    patchSway(m,uniforms,old.onBeforeCompile);m.customProgramCacheKey=()=>'ink-sway'+(oldKey||'');shell.material=m;}
  g.tripoSway={body,eye,eyeX:0,eyeY:0,uniforms,anchors:{hair:g.tripoLook.head,cloth:boneByName(g,'Root')},amp:{hair:cfg.sway?.hair??1,cloth:cfg.sway?.cloth??1},
    f:{hair:{p:new THREE.Vector3(),v:new THREE.Vector3(),on:false},cloth:{p:new THREE.Vector3(),v:new THREE.Vector3(),on:false}},tmp:new THREE.Vector3(),m3:new THREE.Matrix3(),inv:new THREE.Matrix4()};
}
export function updateSway(g,dt,time){
  const s=g.tripoSway;if(!s)return;
  dt=Math.min(dt,1/30);if(dt<=0)return;
  s.body.updateWorldMatrix(true,false);s.inv.copy(s.body.matrixWorld).invert();s.m3.setFromMatrix4(s.inv);
  for(const kind of ['hair','cloth']){
    const a=s.anchors[kind],f=s.f[kind],P=FOLLOW[kind];if(!a)continue;
    a.getWorldPosition(s.tmp);
    if(!f.on||f.p.distanceToSquared(s.tmp)>9){f.p.copy(s.tmp);f.v.set(0,0,0);f.on=true;}   // first frame, a respawn or a teleport
    for(let t=0;t<dt;t+=1/120){const h=Math.min(1/120,dt-t);
      f.v.x+=(P.k*(s.tmp.x-f.p.x)-P.c*f.v.x)*h;f.v.y+=(P.k*(s.tmp.y-f.p.y)-P.c*f.v.y)*h;f.v.z+=(P.k*(s.tmp.z-f.p.z)-P.c*f.v.z)*h;
      f.p.addScaledVector(f.v,h);}
    // the offset the vertices get (world units): the follower's lag, a little idle drift, capped
    const o=s.uniforms[kind].value;o.copy(f.p).sub(s.tmp).multiplyScalar(s.amp[kind]);
    o.x+=Math.sin(time*2.1+(kind==='hair'?0:1.7))*.012*s.amp[kind];o.z+=Math.cos(time*1.7)*.012*s.amp[kind];
    if(o.length()>P.max)o.setLength(P.max);
    o.applyMatrix3(s.m3);
  }
}
const UP=new THREE.Vector3(0,1,0),_q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_v=new THREE.Vector3(),_f=new THREE.Vector3(),_r=new THREE.Vector3();
// Turn the head (and a share of the neck) towards a world point. `facing` is the fighter's yaw; `weight` 0..1 eases the whole effect in and out.
// Undo last frame's turn. Clips leave bones they do not animate (often the neck and head) alone, so without this the turn piles up frame after
// frame and the head spins like a fan. Call before the mixer updates.
export function releaseLook(g){
  const L=g.tripoLook;if(!L?.saved)return;
  for(const [bone,q] of L.saved)bone.quaternion.copy(q);
  L.saved.length=0;
}
export function lookAt(g,dt,target,facing,weight){
  const L=g.tripoLook;if(!L?.head)return;
  L.saved??=[];L.saved.length=0;
  L.w+=(weight-L.w)*(1-Math.exp(-dt*7));
  if(L.w<.01||!target){if(g.tripoSway?.eye)g.tripoSway.eye.gaze.value.multiplyScalar(.8);return;}
  L.head.getWorldPosition(_v);
  const dx=target.x-_v.x,dz=target.z-_v.z,dy=target.y-_v.y,flat=Math.hypot(dx,dz)||1;
  let yaw=Math.atan2(dx,dz)-facing;yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));
  const yawFull=yaw,pitchFull=Math.atan2(dy,flat);
  yaw=Math.max(-.85,Math.min(.85,yaw));const pitch=Math.max(-.3,Math.min(.3,pitchFull));
  const k=1-Math.exp(-dt*9);L.yaw+=(yaw-L.yaw)*k;L.pitch+=(pitch-L.pitch)*k;
  _f.set(Math.sin(facing),0,Math.cos(facing));_r.set(Math.cos(facing),0,-Math.sin(facing));
  // the eyes cover what the head does not: the rest of the angle, quickly
  const S=g.tripoSway;if(S?.eye){
    const resY=Math.max(-1,Math.min(1,(yawFull-L.yaw*L.w)/.55)),resP=Math.max(-1,Math.min(1,(pitchFull-L.pitch*L.w)/.4)),k2=1-Math.exp(-dt*20);
    S.eyeX+=(resY-S.eyeX)*k2;S.eyeY+=(resP-S.eyeY)*k2;
    S.tmp.set(S.eye.lateral.x,S.eye.lateral.y,S.eye.lateral.z).applyMatrix3(S.m3.setFromMatrix4(S.body.matrixWorld)).normalize();
    const sign=Math.sign(S.tmp.x*Math.cos(facing)-S.tmp.z*Math.sin(facing))||1;
    S.eye.gaze.value.copy(S.eye.lateral).multiplyScalar(sign*S.eyeX*S.eye.r.value*.42*L.w);S.eye.gaze.value.y+=S.eyeY*S.eye.r.value*.32*L.w;
  }
  for(const [bone,share] of [[L.neck,L.neckShare],[L.head,1-L.neckShare]]){
    if(!bone||!bone.parent)continue;
    L.saved.push([bone,bone.quaternion.clone()]);
    _q.setFromAxisAngle(UP,L.yaw*L.w*share);
    _q2.setFromAxisAngle(_r,-L.pitch*L.w*share);if(_f.clone().applyQuaternion(_q2).y*L.pitch<0)_q2.invert();
    bone.parent.updateWorldMatrix(true,false);bone.updateWorldMatrix(false,false);
    const world=bone.getWorldQuaternion(new THREE.Quaternion());
    world.premultiply(_q2).premultiply(_q);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    bone.updateWorldMatrix(false,true);
  }
}
