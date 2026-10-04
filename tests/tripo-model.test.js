// Exercise the actual exported skin/animation data, without a browser or GPU.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/addons/GLTFLoader.js';
import {instantiate} from '../arena-glb.js';
import {configureTripo,tossFrame,TOSS_RELEASE_FRAME,tripoExpression,tripoCarryHeight,TRIPO_CARRY_BOTTOM,TRIPO_MESH_OFFSET,TRIPO_SCALE} from '../arena-tripo.js';

const THIGH_CLEARANCE=0.1;
const file=new URL('../models/tripo-pirate-animated.glb',import.meta.url);
async function model(){
  const input=fs.readFileSync(file),size=input.readUInt32LE(12);
  const json=JSON.parse(input.subarray(20,20+size));
  // Textures are irrelevant to skeleton tests; keep geometry and animation
  // bytes unchanged and remove only image loading from the in-memory copy.
  json.materials=json.materials.map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1]}}));
  const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
  const tail=input.subarray(20+size),buffer=Buffer.alloc(20+padded.length+tail.length);
  input.copy(buffer,0,0,20);buffer.writeUInt32LE(buffer.length,8);buffer.writeUInt32LE(padded.length,12);padded.copy(buffer,20);tail.copy(buffer,20+padded.length);
  const parsed=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'',resolve,reject));
  const g=instantiate({scene:parsed.scene,clips:parsed.animations},{ink:0,preserveMaterials:true});configureTripo(g);
  const parent=new THREE.Group();parent.add(g.root);
  const bone=suffix=>Object.values(g.bones).find(b=>b.name.endsWith(suffix));
  const pose=(name,time)=>{g.mixer.stopAllAction();const a=g.actions[name];a.reset().play();a.paused=true;a.time=time;g.mixer.update(0);parent.updateMatrixWorld(true);g.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});};
  return {g,parent,bone,pose};
}

test('Tripo exported character faces the movement direction, including left/right',{skip:!fs.existsSync(file)},async()=>{
  const {g,parent,pose}=await model();pose('idle',0);
  for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){
    parent.rotation.y=Math.atan2(x,z);parent.updateMatrixWorld(true);
    const forward=new THREE.Vector3(1,0,0).transformDirection(g.root.matrixWorld);
    assert.ok(forward.distanceTo(new THREE.Vector3(x,0,z))<1e-6);
  }
});

test('cutlass grip stays at the wrist and the blade swings with the attack',{skip:!fs.existsSync(file)},async()=>{
  const {g,parent,bone,pose}=await model(),wrist=bone('0_Right_Limb_2');
  const parts=[];g.root.getObjectByName('TripoCutlass').traverse(o=>{if(o.isSkinnedMesh)parts.push(o);});
  assert.ok(parts.length>=3,'blade, guard and grip must be exported');
  const grip=parts.find(o=>o.material.name==='TripoLeather'),blade=parts.find(o=>o.material.name==='TripoSteel');
  function vertex(mesh,i){return mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);}
  let reference,initialTip,maxMovement=0;
  for(const [clip,time] of [['idle',0],['attack_a',5/24],['attack_a',9/24],['attack_b',9/24],['heavy',9/24],['walk',.5]]){
    pose(clip,time);
    parent.rotation.y=.7;parent.updateMatrixWorld(true);parts.forEach(o=>o.skeleton.update());
    const local=wrist.worldToLocal(vertex(grip,0));
    if(reference)assert.ok(local.distanceTo(reference)<1e-5,'grip must never drift off the hand');else reference=local.clone();
    const center=new THREE.Vector3();for(let i=0;i<grip.geometry.attributes.position.count;i++)center.add(vertex(grip,i));center.divideScalar(grip.geometry.attributes.position.count);
    assert.ok(center.distanceTo(wrist.getWorldPosition(new THREE.Vector3()))<.3,'hilt must be inside the palm area');
    const tip=vertex(blade,0);if(!initialTip)initialTip=tip.clone();else maxMovement=Math.max(maxMovement,tip.distanceTo(initialTip));
  }
  assert.ok(maxMovement>.6,'sword must visibly move with attack poses');
});

test('walk has forward-bending knees, alternating foot lift and a seamless cycle',{skip:!fs.existsSync(file)},async()=>{
  const {g,bone,pose}=await model();
  const pos=s=>bone(s).getWorldPosition(new THREE.Vector3());
  const feet=[];
  for(const t of [0,.25,.5,.75,1]){
    pose('walk',t);
    const r=pos('1_Right_Limb_2'),l=pos('1_Left_Limb_2');feet.push([r,l]);
    for(const side of ['Right','Left']){
      const hip=pos('1_'+side+'_Limb_0'),knee=pos('1_'+side+'_Limb_1'),ankle=pos('1_'+side+'_Limb_2');
      const segment=ankle.clone().sub(hip),k=knee.clone().sub(hip),onLine=hip.clone().addScaledVector(segment,k.dot(segment)/segment.lengthSq());
      assert.ok(knee.z>=onLine.z-.015,'both knees bend toward game +Z');
    }
  }
  assert.ok(feet[0][0].distanceTo(feet[4][0])<1e-4,'loop boundary must not snap');
  assert.ok(feet[1][0].y<feet[1][1].y-.1,'left foot lifts during its swing');
  assert.ok(feet[3][0].y>feet[3][1].y+.1,'right foot lifts during its swing');
});

// The scan's gold cuffs and belt prop are rigid objects; auto-weights used to smear them.
function jointShare(mesh,joint){
  const idx=mesh.geometry.attributes.skinIndex,wt=mesh.geometry.attributes.skinWeight,out=new Float32Array(idx.count);
  for(let i=0;i<idx.count;i++)for(let k=0;k<4;k++)if(idx.getComponent(i,k)===joint)out[i]+=wt.getComponent(i,k);
  return out;
}
const bodyMesh=g=>{let found;g.root.traverse(o=>{if(o.isSkinnedMesh&&o.name!=='TripoCutlass'&&!o.parent?.name?.includes('Cutlass')&&(!found||o.geometry.attributes.position.count>found.geometry.attributes.position.count))found=o;});return found;};
const clips=[['idle',0],['walk',.25],['run',.1],['attack_a',9/24],['attack_b',9/24],['heavy',9/24],['dash',9/24],['skill',9/24],['hurt',.2],['guard',.2],['jump',.3]];

test('gold cuffs are rigid bracers on the forearm bone in every pose',{skip:!fs.existsSync(file)},async()=>{
  const {g,parent,bone,pose}=await model(),mesh=bodyMesh(g);
  for(const side of ['Right','Left']){
    const forearm=bone('0_'+side+'_Limb_1'),joint=mesh.skeleton.bones.indexOf(forearm),share=jointShare(mesh,joint),rigid=[];
    for(let i=0;i<share.length;i++)if(share[i]>.999)rigid.push(i);
    assert.ok(rigid.length>=200,side+' cuff vertices must be fully bound to the forearm (found '+rigid.length+')');
    let reference;
    for(const [clip,time] of clips){
      pose(clip,time);parent.updateMatrixWorld(true);mesh.skeleton.update();
      const sample=rigid.filter((_,n)=>n%20===0).map(i=>forearm.worldToLocal(mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
      if(reference)sample.forEach((p,n)=>assert.ok(p.distanceTo(reference[n])<1e-4,side+' cuff deformed in '+clip));else reference=sample;
    }
  }
});

test('belt scabbard follows the waist and never enters the thigh meshes',{skip:!fs.existsSync(file)},async()=>{
  const {g,parent,bone,pose}=await model(),mesh=bodyMesh(g);
  const index=suffix=>mesh.skeleton.bones.indexOf(bone(suffix));
  const spine=jointShare(mesh,index('Spine_0')),root=jointShare(mesh,index('Root')),prop=[];
  for(let i=0;i<spine.length;i++)if(spine[i]>.5&&spine[i]<.7&&root[i]>.3)prop.push(i);
  assert.ok(prop.length>1500,'scabbard prop must be bound to waist bones (found '+prop.length+')');
  const thighs=['Right','Left'].map(side=>{const share=jointShare(mesh,index('1_'+side+'_Limb_0')),list=[];for(let i=0;i<share.length;i++)if(share[i]>.25)list.push(i);return list;});
  assert.ok(thighs.every(list=>list.length>100),'thigh meshes must be identifiable');
  const world=i=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  let nearest=Infinity,where='';
  for(const [clip,time] of clips){
    pose(clip,time);parent.rotation.y=0;parent.updateMatrixWorld(true);mesh.skeleton.update();
    const propPoints=prop.filter((_,n)=>n%15===0).map(world);
    thighs.forEach((list,side)=>{
      for(const i of list.filter((_,n)=>n%6===0)){
        const p=world(i);
        for(const q of propPoints){const d=p.distanceTo(q);if(d<nearest){nearest=d;where=clip+' '+(side?'left':'right');}}
      }
    });
  }
  assert.ok(nearest>THIGH_CLEARANCE,'scabbard came within '+nearest.toFixed(3)+' of a thigh vertex during '+where);
});

test('support leg stays nearly straight standing and walking (no permanent half-squat)',{skip:!fs.existsSync(file)},async()=>{
  const {bone,pose}=await model();
  const pos=s=>bone(s).getWorldPosition(new THREE.Vector3());
  const flexion=side=>{const hip=pos('1_'+side+'_Limb_0'),knee=pos('1_'+side+'_Limb_1'),ankle=pos('1_'+side+'_Limb_2');
    return {bend:THREE.MathUtils.radToDeg(Math.PI-hip.clone().sub(knee).angleTo(ankle.clone().sub(knee))),low:ankle.y};};
  // The leg being lifted in a stride is supposed to fold; the planted one should not.
  const worstSupport=(clip,times)=>Math.max(...times.map(time=>{pose(clip,time);const r=flexion('Right'),l=flexion('Left');return (r.low<=l.low?r:l).bend;}));
  const worstBoth=(clip,times)=>Math.max(...times.flatMap(time=>{pose(clip,time);return [flexion('Right').bend,flexion('Left').bend];}));
  assert.ok(worstBoth('idle',[0,.25,.5,.75])<8,'standing knees must be nearly straight (measured 2.5)');
  assert.ok(worstSupport('walk',Array.from({length:16},(_,i)=>i/16))<31,'planted walking leg must stay nearly straight (measured max 24)');
  assert.ok(worstSupport('run',Array.from({length:16},(_,i)=>i/16))<42,'planted running leg bend must stay reasonable (measured max 36)');
});

test('skill clip has a distinct coil pose, an arms-out spin pose and a clean return',{skip:!fs.existsSync(file)},async()=>{
  const {g,bone,pose}=await model();
  assert.ok(g.actions.skill,'skill clip must be exported');
  const wrist=(side)=>bone('0_'+side+'_Limb_2').getWorldPosition(new THREE.Vector3());
  const at=(time)=>{pose('skill',time);return {r:wrist('Right'),l:wrist('Left'),head:bone('Head_0').getWorldPosition(new THREE.Vector3())};};
  const ready=at(0),charge=at(8/24),spin=at(16/24),end=at(28/24);
  assert.ok(charge.r.y>ready.r.y+.25,'charge raises the blade hand overhead');
  assert.ok(spin.r.distanceTo(spin.l)>ready.r.distanceTo(ready.l)*2&&spin.r.distanceTo(spin.l)>2.2,'spin pose spreads both arms wide');
  assert.ok(end.r.distanceTo(ready.r)<.05&&end.l.distanceTo(ready.l)<.05,'skill returns to the ready pose');
});

test('throw, two-handed toss, jump, fall and land clips exist and start/end cleanly',{skip:!fs.existsSync(file)},async()=>{
  const {g,bone,pose}=await model();
  const wrists=()=>['Right','Left'].map(side=>bone('0_'+side+'_Limb_2').getWorldPosition(new THREE.Vector3()));
  const hips=()=>bone('1_Right_Limb_0').getWorldPosition(new THREE.Vector3()).y;
  for(const clip of ['throw','toss','jump','fall','land'])assert.ok(g.actions[clip],clip+' clip must be exported');
  pose('idle',0);const [idleR,idleL]=wrists(),idleHip=hips();
  // One-handed throw uses the free (left) hand: it travels, the sword hand barely moves.
  const left=[],right=[];for(const f of [0,4,8,13,18]){pose('throw',f/24);const [r,l]=wrists();right.push(r);left.push(l);}
  assert.ok(Math.max(...left.map(p=>p.distanceTo(idleL)))>.9,'throwing hand must wind up and release');
  assert.ok(Math.max(...right.map(p=>p.distanceTo(idleR)))<Math.max(...left.map(p=>p.distanceTo(idleL)))*.6,'sword hand stays mostly ready');
  assert.ok(left[4].distanceTo(idleL)<.05,'throw returns to ready');
  // Two-handed toss moves both hands.
  pose('toss',8/24);const [tr,tl]=wrists();assert.ok(tr.distanceTo(idleR)>.5&&tl.distanceTo(idleL)>.5,'toss uses both hands');
  // Jump crouches then springs; the air pose tucks the legs; landing starts low and returns to standing.
  pose('jump',0);const crouch=hips();pose('jump',8/24);const spring=hips();assert.ok(spring>crouch+.05,'jump springs up out of a crouch');
  pose('land',0);const impact=hips();pose('land',16/24);const settled=hips();assert.ok(impact<idleHip-.1&&Math.abs(settled-idleHip)<.05,'landing absorbs then recovers to standing height');
});

// Hand skinning: fingers must not stretch into thorns or tear at the webbing, in any pose.
function handEdgeStretch(g,parent,bone,pose,mesh,side,clip,frames){
  const hand=new Set();const wrist=bone('0_'+side+'_Limb_2');wrist.traverse(b=>{if(b.isBone)hand.add(mesh.skeleton.bones.indexOf(b));});
  const idx=mesh.geometry.attributes.skinIndex,wt=mesh.geometry.attributes.skinWeight,index=mesh.geometry.index,count=idx.count;
  const share=new Float32Array(count);for(let i=0;i<count;i++)for(let k=0;k<4;k++)if(hand.has(idx.getComponent(i,k)))share[i]+=wt.getComponent(i,k);
  const edges=[];const seen=new Set();
  for(let i=0;i<index.count;i+=3)for(let k=0;k<3;k++){const a=index.getX(i+k),b=index.getX(i+(k+1)%3),key=a<b?a*count+b:b*count+a;if(!seen.has(key)&&share[a]>.9&&share[b]>.9){seen.add(key);edges.push([a,b]);}}
  const at=()=>{const out=new Float32Array(count*3),v=new THREE.Vector3();for(const [a,b] of edges)for(const i of [a,b]){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);out.set([v.x,v.y,v.z],i*3);}return out;};
  g.mixer.stopAllAction();mesh.skeleton.pose();parent.updateMatrixWorld(true);mesh.skeleton.update();const rest=at();
  const length=(p,a,b)=>Math.hypot(p[a*3]-p[b*3],p[a*3+1]-p[b*3+1],p[a*3+2]-p[b*3+2]);
  let worst=0;
  for(const time of frames){pose(clip,time);parent.updateMatrixWorld(true);mesh.skeleton.update();const p=at();
    for(const [a,b] of edges){const r0=length(rest,a,b);if(r0<.012)continue;const r=length(p,a,b)/r0;if(r>worst)worst=r;}}
  return {worst,edges:edges.length};
}
test('finger skinning never stretches or tears the hand',{skip:!fs.existsSync(file)},async()=>{
  const {g,parent,bone,pose}=await model(),mesh=bodyMesh(g);
  for(const side of ['Right','Left'])for(const [clip,frames] of [['idle',[0]],['attack_a',[5/24,9/24,15/24]],['heavy',[5/24,9/24,15/24]],['skill',[8/24,16/24]],['throw',[4/24,8/24,13/24]],['toss',[8/24]],['guard',[.2]],['walk',[.25,.5]]]){
    const {worst,edges}=handEdgeStretch(g,parent,bone,pose,mesh,side,clip,frames);
    assert.ok(edges>2000,'hand edges must be found');
    assert.ok(worst<2.6,side+' hand edge stretched '+worst.toFixed(2)+'x in '+clip+' (scan weights gave up to 10x)');
  }
});

test('throw animation releases within a few frames of the projectile spawning',()=>{
  // Projectile spawns when tossTime is set to .32 (the first frame of the throw).
  const press=tossFrame(.32);
  assert.ok(TOSS_RELEASE_FRAME-press>=1&&TOSS_RELEASE_FRAME-press<=3,'release must follow the press by 1-3 frames, got '+(TOSS_RELEASE_FRAME-press));
  assert.equal(tossFrame(0),18,'the clip must finish at its last frame');
  assert.ok(tossFrame(.16)>tossFrame(.32)&&tossFrame(.16)<tossFrame(0),'frame advances monotonically');
});

test('expressions: eyes, brows and mouth follow the fight state, one mouth at a time',()=>{
  const base={dead:false,hurt:false,striking:false,skill:false,attackTime:0,guarding:false,straining:false,won:false,lowHp:false,blink:false,flush:false};
  const x=o=>tripoExpression({...base,...o});
  assert.deepEqual(x({}),{eyes:null,brows:null,mouth:null,tear:false,blush:false,mark:null},'a relaxed fighter has no overlay');
  assert.deepEqual([x({hurt:true}).eyes,x({hurt:true}).mouth],['hurt','shout'],'hit: >< eyes and an open mouth');
  assert.deepEqual([x({striking:true,attackTime:.2}).brows,x({striking:true,attackTime:.2}).mouth],['angry','shout'],'attacking: angry brows, shouting');
  assert.equal(x({striking:true,attackTime:0}).mouth,'grit','charging a special grits the teeth');
  assert.deepEqual([x({guarding:true}).brows,x({guarding:true}).mouth],['angry','grit']);
  assert.deepEqual([x({straining:true}).brows,x({straining:true}).mouth],['angry','grit'],'lifting or holding someone strains');
  assert.deepEqual([x({won:true}).eyes,x({won:true}).mouth],['closed','grin']);
  const low=x({lowHp:true});assert.deepEqual([low.brows,low.mouth,low.tear],['sad','frown',true]);
  assert.equal(x({hurt:true}).mark,'sweat','a hit shows a sweat drop');
  assert.equal(x({striking:true,skill:true,attackTime:0}).mark,'anger','charging or casting a special shows the anger mark');
  assert.equal(x({striking:true,attackTime:.2}).mark,null,'an ordinary swing does not spam symbols');
  assert.equal(x({straining:true}).mark,'sweat');assert.equal(x({won:true}).mark,'star');assert.equal(x({lowHp:true}).mark,'sweat');assert.equal(x({guarding:true}).mark,null);
  assert.equal(x({blink:true}).eyes,'closed','blinks close the eyes');
  assert.equal(x({hurt:true,blink:true}).eyes,'hurt','a hit wins over a blink');
  assert.equal(x({flush:true}).blush,true,'beer flushes the cheeks in every state');
  assert.equal(x({dead:true,hurt:true}).mouth,'frown','K.O. beats being hit');
});
test('exported face has every expression decal, skinned to the head',{skip:!fs.existsSync(file)},async()=>{
  const {g}=await model(),found={};
  g.root.traverse(o=>{if(o.isSkinnedMesh&&/^Tripo(Eyes|Blush|Brow|Mouth|Tear)/.test(o.name)){const k=o.name.replace(/\d+$/,'');found[k]=(found[k]||0)+1;}});
  for(const [k,n] of Object.entries({TripoEyesHurt:2,TripoEyesClosed:2,TripoBlush:2,TripoBrowAngry:2,TripoBrowSad:2,TripoTear:2,TripoMouthShout:1,TripoMouthGrit:1,TripoMouthGrin:1,TripoMouthFrown:1}))assert.equal(found[k],n,k+' decals');
});

test('carried loads rest on the head with both hands up at its sides',{skip:!fs.existsSync(file)},async()=>{
  const {g,bone,pose}=await model(),CRATE=.95/(3.1);   // a crate is .95 game units; the rig is scaled 3.1 in game
  const armZ=b=>b.getWorldPosition(new THREE.Vector3()).y/TRIPO_SCALE-TRIPO_MESH_OFFSET;
  assert.ok(g.actions.carry,'the overhead carry clip must exist (used for crates and for lifting an opponent)');
  assert.ok(!g.actions.hold&&!g.actions.hold_walk,'old chest-height hold clips are gone');
  pose('carry',0);
  const r=bone('0_Right_Limb_2'),l=bone('0_Left_Limb_2'),head=bone('Head_2'),rp=r.getWorldPosition(new THREE.Vector3()),lp=l.getWorldPosition(new THREE.Vector3());
  assert.ok(armZ(r)>armZ(head)+.12&&armZ(l)>armZ(head)+.12,'both hands are raised above the head');
  assert.ok(armZ(r)>=TRIPO_CARRY_BOTTOM-.02&&armZ(r)<=TRIPO_CARRY_BOTTOM+.11,'hands grip the lower sides of the load, not its top or the air below it');
  const gap=Math.hypot(rp.x-lp.x,rp.z-lp.z)/TRIPO_SCALE;assert.ok(Math.abs(gap-.37)<.1,'hands are a crate-width apart, got '+gap.toFixed(2));
  assert.ok(tripoCarryHeight(3.1)>2.8&&tripoCarryHeight(3.1)<3.1,'load bottom rests at the top of the head (hair tips are at 3.09 game units)');
  // the throw starts from the overhead pose
  pose('toss',0);assert.ok(armZ(bone('0_Right_Limb_2'))>armZ(head)+.1,'a crate toss starts overhead');
});

test('carrying a load or an opponent overhead keeps the legs walking',{skip:!fs.existsSync(file)},async()=>{
  const {g,bone,pose}=await model();
  const pos=s=>bone(s).getWorldPosition(new THREE.Vector3());
  const armZ=b=>b.getWorldPosition(new THREE.Vector3()).y/TRIPO_SCALE-TRIPO_MESH_OFFSET;
  for(const clip of ['carry_walk']){
    assert.ok(g.actions[clip],clip+' clip must be exported');
    const feet=[];
    for(const t of [0,.25,.5,.75,1]){
      pose(clip,t);feet.push([pos('1_Right_Limb_2'),pos('1_Left_Limb_2')]);
      const head=bone('Head_2'),r=bone('0_Right_Limb_2'),l=bone('0_Left_Limb_2');
      assert.ok(armZ(r)>armZ(head)+.1&&armZ(l)>armZ(head)+.1,'hands stay overhead at '+t);
    }
    assert.ok(feet[0][0].distanceTo(feet[4][0])<1e-4,clip+' loop boundary must not snap');
    assert.ok(feet[1][0].y<feet[1][1].y-.1&&feet[3][0].y>feet[3][1].y+.1,clip+': feet lift alternately');
    const reach=Math.max(...feet.map(([r,l])=>r.distanceTo(l)));assert.ok(reach>.9,clip+': legs actually stride (reach '+reach.toFixed(2)+')');
  }
});

// Rig-space box of a carried crate (.95 game units at the model's 3.1 scale, centred over the hips).
const CRATE_HALF=.95/3.1/2,CRATE_CENTRE=[-.19,0];
function bladeInsideCrate(g,parent,pose,clip,times){
  const steel=[];g.root.getObjectByName('TripoCutlass').traverse(o=>{if(o.isSkinnedMesh&&o.material.name==='TripoSteel')steel.push(o);});
  let worst=0;
  for(const time of times){
    pose(clip,time);parent.updateMatrixWorld(true);const v=new THREE.Vector3();
    for(const mesh of steel){mesh.skeleton.update();
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){
        mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);
        const bx=v.z/TRIPO_SCALE-.19,by=v.x/TRIPO_SCALE,bz=v.y/TRIPO_SCALE-TRIPO_MESH_OFFSET;
        const depth=Math.min(CRATE_HALF-Math.abs(bx-CRATE_CENTRE[0]),CRATE_HALF-Math.abs(by-CRATE_CENTRE[1]),bz-TRIPO_CARRY_BOTTOM,TRIPO_CARRY_BOTTOM+CRATE_HALF*2-bz);
        if(depth>worst)worst=depth;
      }}
  }
  return worst;
}
test('the cutlass never pokes into a carried crate',{skip:!fs.existsSync(file)},async()=>{
  const {g,parent,pose}=await model();
  for(const [clip,times] of [['carry',[0,.5]],['carry_walk',[0,.125,.25,.5,.75]]]){
    const depth=bladeInsideCrate(g,parent,pose,clip,times);
    assert.ok(depth<.004,clip+': blade vertices sink '+depth.toFixed(3)+' (rig units) into the crate');
  }
});

test('U chop keeps the rear foot planted and only steps the lead foot',{skip:!fs.existsSync(file)},async()=>{
  const {bone,pose}=await model(),feet=['1_Right_Limb_2','1_Left_Limb_2'].map(n=>bone(n));
  const y=b=>b.getWorldPosition(new THREE.Vector3()).y;
  pose('idle',0);const rest=feet.map(y);
  for(let f=0;f<=22;f++){pose('heavy',f/22);
    feet.forEach((b,i)=>{const lift=y(b)-rest[i];assert.ok(lift<(i===1?.3:.03),'foot '+b.name+' lifted '+lift.toFixed(3)+' at frame '+f);});}
});
