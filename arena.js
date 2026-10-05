import * as THREE from './vendor/three.module.js';
import {createCloudVisual,updateCloudVisual} from './arena-clouds.js';
import {STEP,createWorld,step,jump,attack,heavy,grab,bomb,skill,dodge,sprint,toggleAim,predictBomb} from './arena-core.js';
import {CHARACTERS,CHARACTER_IDS,STAGES,STAGE_IDS,SLOT_COLORS,SLOT_LABELS,characterOf} from './arena-roster.js';
import {createTouchControls,isTouchDevice} from './arena-touch.js';
import {ConnectionAttempt,InputLease,cleanInput,neutralInput,sameRound,voteRematch} from './arena-session.js';
import {mesh,box,sphere,cylinder,cone,fxMesh,label,ink,starSprite,sfxSprite,isSharedMaterial} from './arena-gfx.js';
import {buildFighter,disposeFighter,renderPortraits,STATURE} from './arena-models.js';
import {createAudio} from './arena-audio.js';
import {crewMate,poseCannonCrew,poseSnowCrew} from './arena-crew.js';
import {freezeSkinnedGeometry} from './arena-tailoring.js';
import {poseCombat,poseStance,attackPhase} from './arena-posing.js';
import {loadGlbModel,instantiate,principalAxis} from './arena-glb.js';
import {configureTripo,TRIPO_CHARS,tripoUrl,tossFrame,tripoExpression,tripoCarryHeight} from './arena-tripo.js';
import {updateGuard} from './arena-guards.js';
import {buildStage,disposeStage,THEMES} from './arena-stage.js';
import {buildPiece,updatePiece,disposePiece} from './arena-pieces.js';

const $=id=>document.getElementById(id);
const combatNumber=value=>Number(value.toFixed(1));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const scene=new THREE.Scene();scene.background=new THREE.Color('#7fc6ec');scene.fog=new THREE.Fog('#b9e4f7',60,170);
// Perspective, low three-quarter camera like PS2 arena brawlers; it frames both fighters.
const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.1,400);
camera.position.set(0,9,20);camera.lookAt(0,1.2,0);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true});}
catch(e){$('loading').textContent='3D 显示未能启动，请在支持 WebGL 的浏览器中打开。';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
$('arena').appendChild(renderer.domElement);
const hemi=new THREE.HemisphereLight('#fff6dc','#5f8aa0',1.5);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff3d6',2.1);sun.position.set(-10,22,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:14,bottom:-14});sun.shadow.normalBias=.035;scene.add(sun);

const portraits=renderPortraits();
const selection=(()=>{const fallback={p1:'swordsman',p2:'guardian',p3:'brawler',p4:'gunner',stage:'port'};try{const s=JSON.parse(localStorage.getItem('gb-selection')||'{}');const pick=k=>CHARACTERS[s[k]]?s[k]:fallback[k];return {p1:pick('p1'),p2:pick('p2'),p3:pick('p3'),p4:pick('p4'),stage:STAGES[s.stage]?s.stage:fallback.stage};}catch(_){return fallback;}})();
function saveSelection(){try{localStorage.setItem('gb-selection',JSON.stringify(selection));}catch(_){}}
let guestChar='guardian';

// ---- Stage and fighter models follow the authoritative world (also on the guest). ----
let stage=null;
const waveMesh=new THREE.Mesh(new THREE.BoxGeometry(34,1.4,19),new THREE.MeshBasicMaterial({color:'#77dded',transparent:true,opacity:0,depthWrite:false}));waveMesh.position.y=.25;waveMesh.visible=false;scene.add(waveMesh);
function ensureStage(){
  const id=STAGES[world.stage]?world.stage:'port';if(stage?.id===id)return;
  if(stage)disposeStage(stage);stage=buildStage(id);stage.id=id;scene.add(stage.group);
  const t=THEMES[id];scene.background.set(t.skyBottom);scene.fog.color.set(t.fog);hemi.color.set(t.hemiSky);hemi.groundColor.set(t.hemiGround);sun.color.set(t.sun);waveMesh.material.color.set(t.wave);
  for(const m of cannonModels.values())scene.remove(m);cannonModels.clear();
  clearPieceModels();
}
const pieceModels=new Map();
function clearPieceModels(){for(const m of pieceModels.values())disposePiece(m,scene);pieceModels.clear();}
function syncPieces(){
  const live=new Set();
  for(const pc of world.pieces||[]){
    live.add(pc.id);let m=pieceModels.get(pc.id);
    if(!m||m.kind!==pc.kind){if(m)disposePiece(m,scene);m=buildPiece(pc);scene.add(m.root);pieceModels.set(pc.id,m);}
    updatePiece(m,pc,world.tick);
  }
  for(const [id,m] of pieceModels)if(!live.has(id)){disposePiece(m,scene);pieceModels.delete(id);}
}
const TEAM_COLORS=['#ff6a4a','#4aa8ff'],TEAM_NAMES=['红队','蓝队'];
const teamColorOf=p=>world.teamMode?TEAM_COLORS[p.team]||null:null;
const models=[null,null,null,null];
// Characters authored in Blender (models/<id>.glb, see tools/blender/) replace the procedural bodies. The header button (or ?glb=0 / ?glb=1) switches back.
// Blender characters are modelled big; this keeps them in proportion with the arena.
const GLB_SCALE=.84;
const GLB_CHARS=Object.fromEntries(['swordsman','guardian','brawler','gunner','cook','stormcaller'].map(id=>[id,`models/${id}.glb`]));
// Opt-in Tripo integration preview. Keep the generated character isolated to
// the swordsman slot while its Blender-authored motion is being tuned.
// Tripo models are the default look; ?tripo=0 (or the header button) switches to the older Blender/procedural bodies.
const TRIPO_PREVIEW=(()=>{const q=new URLSearchParams(location.search).get('tripo');if(q!==null)return q!=='0';try{return localStorage.getItem('gb-tripo')!=='0';}catch{return true;}})();
// Tripo mode shows the Tripo models' own busts (tools/blender/render_tripo_portraits.py) in the HUD, cards, VS screen and cut-ins.
if(TRIPO_PREVIEW)for(const id of Object.keys(TRIPO_CHARS))portraits[id]=`models/portraits/tripo-${id==='swordsman'?'pirate':id}.png`;
const useGlb=(()=>{const q=new URLSearchParams(location.search).get('glb');if(q!==null)return q!=='0';try{return localStorage.getItem('gb-glb')!=='0';}catch{return true;}})();
function attachGlb(m,charId){
  const tripoCfg=TRIPO_PREVIEW?TRIPO_CHARS[charId]:null,tripo=Boolean(tripoCfg),url=tripo?tripoUrl(tripoCfg):GLB_CHARS[charId];if((!useGlb&&!tripo)||!url)return;
  loadGlbModel(url).then(model=>{
    if(m.root.parent===null||m.glb)return;
    const g=instantiate(model,{ink:tripo?.002:.022,preserveMaterials:tripo,inkSkip:n=>/^Tripo(Eyes|Blush|Brow|Mouth|Tear)/.test(n)}),st=STATURE[charId]||[1,1,1];g.root.scale.set(st[0]*GLB_SCALE,st[1]*GLB_SCALE,st[2]*GLB_SCALE);if(tripo)configureTripo(g,tripoCfg);m.body.add(g.root);m.tag.position.y=tripo?4.05:m.tag.position.y*(GLB_SCALE+.06);g.state='';g.t=0;g.blinkAt=2+Math.random()*3;g.blink=0;
    for(const child of m.silhouette.children)if(child!==m.guard.root)child.visible=false;
    // weapon effects ride on the new weapon: glow, trail and sparks are re-created in a frame aligned with its long axis
    const weapon=[];g.root.traverse(o=>{if(o.isSkinnedMesh&&(o.name==='Weapon'||tripo&&/^Tripo(Steel|Gunmetal|Wood)$/.test(o.material?.name)))weapon.push(o);});
    for(const old of [m.weaponGlow,m.swordTrail,...m.swordSparks])old.visible=false;
    if(weapon[0]&&tripo){
      // Glow and trail are inflated copies of the steel blade skinned to the same skeleton, so they
      // can never drift off the sword the way a separately placed box did.
      const steel=weapon[0],shell=(inflate,color)=>{const geo=steel.geometry.clone(),pos=geo.attributes.position,nor=geo.attributes.normal;
        for(let i=0;i<pos.count;i++)pos.setXYZ(i,pos.getX(i)+nor.getX(i)*inflate,pos.getY(i)+nor.getY(i)*inflate,pos.getZ(i)+nor.getZ(i)*inflate);
        const s=new THREE.SkinnedMesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
        s.bind(steel.skeleton,steel.bindMatrix);s.frustumCulled=false;s.renderOrder=2;steel.parent.add(s);return s;};
      m.weaponGlow=shell(.007,'#ffd84e');m.swordTrail=shell(.02,'#ffae28');m.swordSparks=[];
    }
    else if(weapon[0]){
      const w=weapon[0],pa=principalAxis(w),bone=tripo?Object.values(g.bones).find(b=>b.name.endsWith('0_Right_Limb_2')):g.bones['handR']||g.bones['hand.R'];g.root.updateMatrixWorld(true);
      const up=pa.axis.clone();if(up.y<0&&Math.abs(up.y)>Math.abs(up.x))up.negate();
      const base=pa.center.clone().addScaledVector(pa.axis,pa.min),holder=new THREE.Group();
      const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),pa.axis);holder.quaternion.copy(q);holder.position.copy(base);holder.scale.setScalar(pa.length/1.45);
      const inv=new THREE.Matrix4().copy(bone.matrixWorld).invert(),hm=new THREE.Matrix4().compose(holder.position,holder.quaternion,holder.scale);if(tripo)hm.premultiply(w.matrixWorld);hm.premultiply(inv);
      hm.decompose(holder.position,holder.quaternion,holder.scale);bone.add(holder);
      const glow=fxMesh(new THREE.BoxGeometry(.32,1.6,.16),'#ffd84e',holder,0,.86,.01,0),trail=fxMesh(new THREE.PlaneGeometry(.7,1.9),'#ffbf28',holder,-.1,.86,-.08,0);
      const sparks=[];for(let i=0;i<5;i++){const s=fxMesh(new THREE.SphereGeometry(.055+(i%2)*.025,8,6),i%2?'#fff3a0':'#ffbe2e',holder,0,.25+i*.25,.12,0);s.userData={phase:i*.23};sparks.push(s);}
      m.weaponGlow=glow;m.swordTrail=trail;m.swordSparks=sparks;
    }
    // The Tripo guard clip already holds the real blade up in front; the prop's crossed blades would overlap it.
    if(tripo){g.tripoMarks=Object.fromEntries(['anger','sweat','star'].map(k=>{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:markTexture(k),transparent:true,depthTest:false}));s.renderOrder=12;s.visible=false;m.body.add(s);return [k,s];}));
      g.tripoFace=Object.fromEntries(TRIPO_FACE.map(([k])=>[k,[]]));g.root.traverse(o=>{if(!o.isMesh||o.userData.ink)return;const hit=TRIPO_FACE.find(([,re])=>re.test(o.name));if(hit){o.visible=false;o.castShadow=false;o.receiveShadow=false;o.material=o.material.clone();o.material.transparent=true;o.material.depthWrite=false;g.tripoFace[hit[0]].push(o);}});}
    if(tripo&&m.guard?.parts?.cross)m.guard.parts.cross.visible=false;
    m.glb=g;
  }).catch(err=>console.warn('glb load failed',err));
}
// Expression decals painted onto the scan's face (see tools/blender/animate_tripo_pirate.py add_face).
const TRIPO_FACE=[['hurt',/^TripoEyesHurt/],['closed',/^TripoEyesClosed/],['blush',/^TripoBlush/],['angry',/^TripoBrowAngry/],['sad',/^TripoBrowSad/],['shout',/^TripoMouthShout/],['grit',/^TripoMouthGrit/],['grin',/^TripoMouthGrin/],['frown',/^TripoMouthFrown/],['tear',/^TripoTear/]];
// Comic symbols drawn on a canvas, shown as sprites beside a Tripo fighter's head (see tripoExpression().mark).
function markTexture(kind){
  const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.lineCap='round';x.lineJoin='round';
  const outline=(w,color,draw)=>{x.lineWidth=w;x.strokeStyle=color;draw();x.stroke();};
  if(kind==='anger'){   // four curved wedges around a gap, the manga "cross-popped vein"
    for(const [dx,dy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){const p=()=>{x.beginPath();x.moveTo(64+dx*12,64+dy*50);x.quadraticCurveTo(64+dx*12,64+dy*12,64+dx*50,64+dy*12);};outline(22,'#15171c',p);outline(11,'#ff3b2a',p);}
  }else if(kind==='sweat'){
    const drop=()=>{x.beginPath();x.moveTo(64,10);x.bezierCurveTo(96,52,104,70,64,114);x.bezierCurveTo(24,70,32,52,64,10);x.closePath();};
    drop();x.fillStyle='#7fd6ff';x.fill();outline(9,'#15171c',drop);x.beginPath();x.ellipse(52,74,6,14,.3,0,Math.PI*2);x.fillStyle='#fff';x.fill();
  }else{
    const star=()=>{x.beginPath();for(let i=0;i<8;i++){const r=i%2?16:56,a=i*Math.PI/4-Math.PI/2;x.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r);}x.closePath();};
    star();x.fillStyle='#ffe14a';x.fill();outline(8,'#15171c',star);
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
const HELD_BODY_CENTRE=1.55,HELD_BODY_THICKNESS=.9;   // a fighter's middle above his feet, and how deep he is lying down
const FR24=1/24,WALK_DUR=24*FR24,RUN_DUR=16*FR24;const CLIMB_RISE=2.2;
const ATTACK_CLIP=a=>['heavy','upper','slam'].includes(a)?'heavy':['dash','rush','shieldBash'].includes(a)?'dash':a==='shot'?'shoot':a==='grab'?'grab':null;
function driveGlb(m,p,dt,walking){
  const g=m.glb;if(!g)return;
  // Guests only receive 20 Hz snapshots, so positions arrive in jumps; advancing the stride from
  // velocity keeps the legs smooth instead of stepping 20 times a second.
  const travelled=netRole==='guest'?Math.hypot(p.vx||0,p.vz||0)*dt:g.lastXZ?Math.hypot(p.x-g.lastXZ[0],p.z-g.lastXZ[1]):0;
  g.lastXZ=[p.x,p.z];
  let name='idle',time=0;
  const enter=n=>{if(g.state!==n){g.state=n;g.t=0;}g.t+=dt;return g.t;};
  const hurtish=p.grabbedBy!==null||p.knocked>0||p.stun>0||p.hurtTime>0;
  if(p.hp<=0){name='hurt';enter(name);time=10*FR24;}
  else if(g.tripo&&p.knocked>0&&!p.grounded&&p.grabbedBy===null){name='knock';time=enter(name)%(16*FR24);}   // blown through the air: flail
  else if(hurtish){name='hurt';time=Math.min(enter(name)*2,10*FR24);}
  else if(g.tripo&&p.mantle&&g.actions.climbTop){   // ledge pull-up
    name='climbTop';enter(name);time=Math.min(1,1-p.mantle.t/p.mantle.T)*12*FR24;}
  else if(g.tripo&&p.climbing&&g.actions.climbTop&&Math.min(p.y,(p.ladderTop||9)-p.y)<.55){
    // stepping on at the bottom or off at the top: the same clip, played by distance to the nearest end (frame 12 = standing)
    name='climbTop';enter(name);time=Math.min(1,Math.max(0,1-Math.min(p.y,(p.ladderTop||9)-p.y)/.55))*12*FR24;}
  else if(g.tripo&&p.climbing&&g.actions.climb){   // one cycle (two steps) per CLIMB_RISE of height, so climbing down plays it backwards
    name='climb';enter(name);const ph=((p.y/CLIMB_RISE)%1+1)%1;time=ph*24*FR24;}
  else if(g.tripo&&p.tossTime>0){name=p.tossTwo?'toss':'throw';enter(name);time=tossFrame(p.tossTime)*FR24;}   // item / crate throw
  else if(p.pendingSkill){name='skill';const held=enter(name);
    // Tripo: crouch and raise the blade over the first quarter second, then hold the charge pose.
    time=g.tripo?Math.min(held/.25,1)*8*FR24:0;}
  else if(p.skillTime>0){name='skill';const held=enter(name);
    if(g.tripo){const k=clamp(1-p.skillTime/.4,0,1);time=(k<.8?11+k/.8*10:21+(k-.8)/.2*7)*FR24;}   // release -> spin pose -> settle
    else time=(held*30*FR24)%(g.actions.skill.getClip().duration||.33);}
  else if(p.attackTime>0){
    name=(p.attackType==='heavy'&&CHARACTERS[p.char].heavy?.projectile&&['gunner','stormcaller'].includes(p.char)?'shoot':ATTACK_CLIP(p.attackType))||(p.combo%2===1?'attack_b':'attack_a');enter(name);
    const {phase,contact}=attackPhase(p);time=(phase<contact?9*phase/contact:9+13*(phase-contact)/(1-contact))*FR24;
  }
  else if(p.blocking){name='guard';time=Math.min(enter(name),12*FR24);}
  else if(p.carrying||p.grabbedTarget!==null){
    if(g.tripo&&walking){   // legs keep walking while the load (or the opponent) stays overhead
      name='carry_walk';enter(name);g.stridePhase=((g.stridePhase||0)+(travelled<2?travelled:0)/g.stride[name])%1;time=g.stridePhase*WALK_DUR;
    }else{name='carry';time=Math.min(enter(name)*1.5,12*FR24);}
  }
  else if(!p.grounded){
    if(p.jumps!==g.lastJumps&&p.jumps>=2){g.state='';}
    if(p.vy>2||g.state==='jump'&&g.t<.3){name='jump';const jt=enter(name);time=Math.min((jt/.34)*18*FR24,18*FR24);}
    else{name='fall';time=enter(name)%(22*FR24);}
  }
  else if((p.landTime||0)>0){name='land';enter(name);time=Math.min((.2-p.landTime)*80,16)*FR24;}
  else if(walking){name=p.running?'run':'walk';enter(name);const dur=p.running?RUN_DUR:WALK_DUR;if(g.tripo){g.stridePhase=((g.stridePhase||0)+(travelled<2?travelled:0)/g.stride[name])%1;time=g.stridePhase*dur;}else time=(((p.walk/(Math.PI*2))%1)+1)%1*dur;}
  else{enter(name);time=g.t%(96*FR24);}
  g.lastJumps=p.jumps;
  g.set(name,time,{fade:g.tripo&&(p.attackTime>0||hurtish)?.045:.12});
  // face: blink now and then; shout when striking, grit when guarding, wince when hit, grin when the round is won
  g.blinkAt-=dt;if(g.blinkAt<=0){g.blink=.14;g.blinkAt=2.4+Math.random()*3.2;}g.blink=Math.max(0,g.blink-dt);
  const f={blink:g.blink>0?1:0},won=world.roundOver>0&&world.roundWinner===p.id&&p.hp>0;
  if(p.hp<=0){f.blink=1;f.sad=.6;f.open=.3;}
  else if(hurtish){f.sad=1;f.squint=.8;f.open=1;f.blink=0;}
  else if(p.attackTime>0||p.skillTime>0||p.pendingSkill){f.angry=1;f.open=.7;f.wide=.4;}
  else if(p.blocking){f.angry=.7;f.grit=1;}
  else if(won){f.squint=.85;f.open=.7;f.up=1;f.blink=0;}
  else if(p.hp<25){f.sad=.5;}
  g.setFace(f,dt);
  if(g.tripoFace){
    const e=tripoExpression({dead:p.hp<=0,hurt:hurtish,striking:p.attackTime>0||p.skillTime>0||Boolean(p.pendingSkill),skill:p.skillTime>0||Boolean(p.pendingSkill),attackTime:p.attackTime,guarding:p.blocking,straining:p.carrying||p.grabbedTarget!==null,won,lowHp:p.hp<25,blink:f.blink>.5,flush:p.attackBoostTime>0&&p.weapon!=='sword'}),F=g.tripoFace;
    const show=(k,on)=>F[k].forEach(o=>o.visible=on);
    show('hurt',e.eyes==='hurt');show('closed',e.eyes==='closed');show('angry',e.brows==='angry');show('sad',e.brows==='sad');
    for(const k of ['shout','grit','grin','frown'])show(k,e.mouth===k);
    show('tear',e.tear);show('blush',e.blush);
    F.blush.forEach(o=>{o.material.opacity=.72+.18*Math.sin(world.tick*.1);});
    for(const [k,s] of Object.entries(g.tripoMarks)){   // pop in, float, vanish
      const on=k===e.mark;s.userData.t=on?Math.min(1,(s.userData.t||0)+dt*7):Math.max(0,(s.userData.t||0)-dt*10);
      s.visible=s.userData.t>0;const pop=s.userData.t<1?1.35-.35*s.userData.t:1;
      s.scale.setScalar(1.05*s.userData.t*pop*(1+.06*Math.sin(world.tick*.25)));s.position.set(.62,g.markY+.05*Math.sin(world.tick*.18),.1);
    }
  }
  g.update(dt);
}
function ensureModels(){
  world.fighters.forEach((p,i)=>{
    const key=p.char+'|'+(teamColorOf(p)||'');
    if(models[i]?.key===key)return;
    if(models[i])disposeFighter(models[i]);models[i]=buildFighter(p.char,i,scene,teamColorOf(p));models[i].key=key;models[i].body.rotation.order='YXZ';attachGlb(models[i],p.char);
    const c=CHARACTERS[p.char];
    if(i<2){const k=i?'p2':'p1';$(k+'Name').textContent=c.name;$(k+'Portrait').src=portraits[p.char]||'';}
  });
  // Leaving brawl mode: drop the extra fighters' models.
  for(let i=world.fighters.length;i<models.length;i++)if(models[i]){disposeFighter(models[i]);models[i]=null;}
}
const PIECE_FALL_TIME=.7;
const CHARGE_TEXT={whirlwind:'旋风蓄力！快离开',shieldQuake:'震盾蓄力！跳起来',fistStorm:'连打蓄力！拉开距离',barrage:'弹幕锁定！离开红圈',flameKick:'烈焰蓄力！拉开距离',thunder:'雷云聚集！离开红圈'};
const CHARGE_COLORS=['#ffb448','#69dfff','#ff8fd0','#9dff8a'];
const chargeModels=[0,1,2,3].map(i=>{
  const root=new THREE.Group();scene.add(root);
  const color=CHARGE_COLORS[i];
  const edge=fxMesh(new THREE.RingGeometry(.94,1,64),color,root,0,.09,0,.9,false);edge.rotation.x=-Math.PI/2;edge.material.side=THREE.DoubleSide;
  const fill=fxMesh(new THREE.CircleGeometry(1,64),color,root,0,.08,0,.2,false);fill.rotation.x=-Math.PI/2;fill.material.side=THREE.DoubleSide;
  const tags={};for(const [kind,text] of Object.entries(CHARGE_TEXT)){const tag=label(text,kind==='barrage'?'#ff8a6a':kind==='thunder'?'#ffe27a':color,42);tag.position.y=3.8;tag.scale.set(3.8,.65,1);tag.visible=false;root.add(tag);tags[kind]=tag;}
  root.visible=false;return {root,edge,fill,tags};
});

let world=createWorld({chars:[selection.p1,selection.p2],stage:selection.stage}),started=false,netRole='solo',netPeer=null,netConn=null,netRoom='',localPlayerId=0,netSendAcc=0,netBroadcastAcc=0,netEvents=[];
let peerLibPromise=null;
const NETWORK_INPUT_RATE=1/30,NETWORK_STATE_RATE=1/20;
const guestInput=new InputLease();
const connectionAttempt=new ConnectionAttempt();
let connectionTimer=null;
function beginConnection(){
  const token=connectionAttempt.begin();if(token===null)return null;
  started=false;keys.clear();acc=0;
  $('host3d').disabled=true;$('join3d').disabled=true;$('leave3d').classList.remove('hide');
  connectionTimer=setTimeout(()=>{if(connectionAttempt.current(token))closeNetwork('连接超时，请重试或检查网络',true);},20000);
  return token;
}
function finishConnection(token){
  if(!connectionAttempt.current(token))return;
  connectionAttempt.finish(token);clearTimeout(connectionTimer);connectionTimer=null;
}
function roomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}
function loadPeerJS(){
  if(window.Peer)return Promise.resolve();
  if(peerLibPromise)return peerLibPromise;
  const urls=['https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js','https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js'];
  peerLibPromise=new Promise((resolve,reject)=>{let i=0;const next=()=>{if(i>=urls.length){reject(new Error('PeerJS unavailable'));return;}const s=document.createElement('script');s.src=urls[i++];let done=false;const settle=ok=>{if(done)return;done=true;clearTimeout(timer);s.onload=s.onerror=null;if(ok&&window.Peer)resolve();else{s.remove();next();}};const timer=setTimeout(()=>settle(false),6000);s.onload=()=>settle(true);s.onerror=()=>settle(false);document.head.appendChild(s);};next();}).catch(error=>{peerLibPromise=null;throw error;});
  return peerLibPromise;
}
function networkStatus(text,error=false){$('netStatus').textContent=text;$('netStatus').style.color=error?'#ffad9d':'#ffd77f';}
function sendNet(data){if(netConn?.open)try{netConn.send(data);}catch(_){networkStatus('连接发送失败',true);}}
function snapshot(){return {t:'state',state:{...world,events:netEvents.splice(0)},started,paused:document.hidden};}
function sendSnapshot(){if(netRole==='host'&&netConn?.open)sendNet(snapshot());}
function closeNetwork(message='单人练习',error=false){
  connectionAttempt.cancel();clearTimeout(connectionTimer);connectionTimer=null;
  $('host3d').disabled=false;$('join3d').disabled=false;
  const conn=netConn,peer=netPeer;netConn=null;netPeer=null;netRole='solo';netRoom='';localPlayerId=0;
  try{conn?.close();}catch(_){}try{peer?.destroy();}catch(_){}
  guestInput.clear();world.remoteInput=neutralInput();world.online=false;started=false;acc=0;netSendAcc=0;netBroadcastAcc=0;netEvents.length=0;
  networkStatus(message,error);$('room3dLabel').textContent='';$('host3d').classList.remove('hide');$('join3d').classList.remove('hide');$('room3d').classList.remove('hide');$('leave3d').classList.add('hide');
  refreshSelect();
}
function serialInput(){return {x:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),z:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp')),guard:keys.has('KeyR')};}
function applyAction(p,code,data={}){if(world.intro>0||world.roundOver>0)return;const input=data.input||serialInput();if(code==='KeyQ')toggleAim(p);if(code==='Space')jump(p,input);if(code==='KeyJ')attack(world,p,input);if(code==='KeyU')heavy(world,p,input);if(code==='KeyI')grab(world,p,input);if(code==='KeyK')bomb(world,p);if(code==='KeyL')skill(world,p,data.level||1);if(code==='ShiftLeft'||code==='ShiftRight')dodge(p);if(code==='Sprint')sprint(p);}
function bindHostConnection(conn){
  if(netConn){conn.on('open',()=>{conn.send({t:'reject',reason:'房间已有玩家'});conn.close();});return;}
  netConn=conn;guestInput.clear();let welcomed=false;
  conn.on('data',data=>{
    if(netConn!==conn||!data||typeof data!=='object')return;
    if(data.t==='hello'&&!welcomed){welcomed=true;guestChar=CHARACTERS[data.char]?data.char:'guardian';world.online=true;world.training=false;networkStatus('朋友已加入 · 联机对战');$('room3dLabel').textContent='房间 '+netRoom;conn.send({t:'welcome',you:1,room:netRoom});hideSelect();reset();return;}
    if(!welcomed||!sameRound(world,data))return;
    if(data.t==='input'){guestInput.receive(data.input,performance.now());world.remoteInput=guestInput.read(performance.now());}
    else if(data.t==='action'&&data.code&&!world.ended&&!document.hidden)applyAction(world.fighters[1],data.code,{...data,input:cleanInput(data.input)});
    else if(data.t==='rematch'){if(voteRematch(world,1,data.round))reset();else sendSnapshot();}
  });
  conn.on('close',()=>{if(netRole==='host'&&netConn===conn){netConn=null;guestInput.clear();world.remoteInput=neutralInput();world.online=false;started=false;networkStatus('朋友已离开，等待重新加入');}});conn.on('error',()=>networkStatus('朋友连接异常',true));
}
async function create3DRoom(){
  if(netRole!=='solo')return;
  const token=beginConnection();if(token===null)return;
  networkStatus('正在创建房间…');
  try{
    await loadPeerJS();if(!connectionAttempt.current(token))return;
    netRole='host';netRoom=roomCode();
    const peer=new Peer('gb3d-room-'+netRoom,{host:'0.peerjs.com',port:443,path:'/',secure:true,debug:0});netPeer=peer;
    peer.on('open',()=>{if(netPeer!==peer)return;finishConnection(token);networkStatus('等待朋友加入');$('room3dLabel').textContent='房间 '+netRoom+' · 发给朋友';$('host3d').classList.add('hide');$('join3d').classList.add('hide');$('room3d').classList.add('hide');refreshSelect();});
    peer.on('connection',conn=>{if(netPeer===peer)bindHostConnection(conn);else conn.close();});
    peer.on('error',()=>{if(netPeer===peer)closeNetwork('房间创建失败，请重试',true);});
  }catch(_){if(connectionAttempt.current(token))closeNetwork('联机组件加载失败，请重试',true);}
}
async function join3DRoom(){
  if(netRole!=='solo')return;
  const room=$('room3d').value.trim().toUpperCase();if(!/^[A-Z2-9]{4}$/.test(room)){networkStatus('请输入四位房间码',true);return;}
  const token=beginConnection();if(token===null)return;
  networkStatus('正在加入 '+room+'…');
  try{
    await loadPeerJS();if(!connectionAttempt.current(token))return;netRole='guest';netRoom=room;localPlayerId=1;acc=0;refreshSelect();
    const peer=new Peer(undefined,{host:'0.peerjs.com',port:443,path:'/',secure:true,debug:0});netPeer=peer;
    peer.on('open',()=>{
      if(netPeer!==peer)return;
      const conn=peer.connect('gb3d-room-'+room,{reliable:true});netConn=conn;let receivedState=false;
      conn.on('open',()=>conn.send({t:'hello',char:selection.p1}));
      conn.on('data',data=>{
        if(netConn!==conn||!data||typeof data!=='object')return;
        if(data.t==='reject'){closeNetwork(data.reason||'房间无法加入',true);return;}
        if(data.t==='welcome'){world.online=true;started=false;networkStatus('联机 · 等待同步');$('room3dLabel').textContent='已加入房间 '+room;$('host3d').classList.add('hide');$('join3d').classList.add('hide');$('room3d').classList.add('hide');$('leave3d').classList.remove('hide');}
        else if(data.t==='state'&&data.state){
          finishConnection(token);
          const nextRound=data.state.round||0,oldRound=world.round||0;
          if(receivedState&&(nextRound<oldRound||(nextRound===oldRound&&data.state.tick<world.tick)))return;
          const newRound=!receivedState||nextRound!==oldRound,queued=newRound?[]:world.events;
          world=data.state;world.events=[...queued,...(data.state.events||[])];world.online=true;started=Boolean(data.started);receivedState=true;
          if(newRound){clearVisualEffects();$('result').close();keys.clear();acc=0;hideSelect();sendNet({t:'input',round:nextRound,input:neutralInput()});}
          networkStatus(data.paused?'房主切到后台 · 对局暂停':'联机 · 已连接');
        }
      });
      conn.on('close',()=>{if(netConn===conn)closeNetwork('房主已离开，可重新加入房间',true);});
      conn.on('error',()=>{if(netConn===conn)closeNetwork('连接异常，请重新加入',true);});
    });
    peer.on('error',()=>{if(netPeer===peer)closeNetwork('找不到房间，请检查房间码',true);});
  }catch(_){if(connectionAttempt.current(token))closeNetwork('联机组件加载失败，请重试',true);}
}
function networkAction(code,data){if(netRole==='guest'){sendNet({t:'action',round:world.round||0,code,...data});return false;}return true;}
$('host3d').onclick=create3DRoom;$('join3d').onclick=join3DRoom;$('leave3d').onclick=()=>{closeNetwork();reset();};

// ---- Props, effects and sound ----
function containerModel(){const g=new THREE.Group(),crate=new THREE.Group(),barrel=new THREE.Group(),chest=new THREE.Group(),keg=new THREE.Group();g.add(crate,barrel,chest,keg);cylinder(.46,.5,.95,'#a4352a',keg,0,.48,0);for(const y of [.14,.82])cylinder(.52,.52,.1,'#2c2f36',keg,y,y,0).position.set(0,y,0);sphere(.2,'#f4efe0',keg,0,.5,.44,8).scale.set(1,1.1,.3);sphere(.05,'#2c2f36',keg,-.07,.52,.55,5);sphere(.05,'#2c2f36',keg,.07,.52,.55,5);cylinder(.025,.025,.3,'#6a4a2a',keg,0,1.08,0,5);const fuse=sphere(.07,'#ffb347',keg,0,1.26,0,6);fuse.userData.fuse=true;box(.95,.95,.95,'#c08a50',crate,0,.48,0);for(const y of [.1,.85])box(1.02,.11,1.02,'#5e4636',crate,0,y,0);const slat=box(1.13,.12,.06,'#ecc080',crate,0,.5,.5);slat.rotation.z=.7;cylinder(.43,.48,.95,'#a86a3c',barrel,0,.48,0);for(const y of [.16,.78])cylinder(.48,.48,.09,'#3d4650',barrel,0,y,0);box(1.1,.72,.82,'#9a5f2e',chest,0,.38,0);const lid=box(1.14,.3,.86,'#e2a93c',chest,0,.88,0);lid.rotation.z=-.08;box(.2,.26,.08,'#fff0a0',chest,0,.51,.45);ink(g,.035);g.userData={crate,barrel,chest,keg,kind:''};return g;}
function setContainerKind(g,kind){if(g.userData.kind===kind)return;g.userData.kind=kind;g.userData.crate.visible=kind==='crate';g.userData.barrel.visible=kind==='barrel';g.userData.chest.visible=kind==='chest';g.userData.keg.visible=kind==='keg';}
const crateModels=world.crates.map(c=>{const g=containerModel();g.position.set(c.x,0,c.z);setContainerKind(g,c.kind);scene.add(g);return g;});
const bombModels=new Map(),cloudModels=new Map(),propModels=new Map(),cannonModels=new Map(),shotModels=new Map(),effects=[],pickupModels=[];
const particleGeo=new THREE.IcosahedronGeometry(.1,0);
function particles(e,color,count=18){for(let i=0;i<count;i++){const m=mesh(particleGeo,color,scene,e.x,e.y,e.z);const v=new THREE.Vector3((Math.random()-.5)*8,Math.random()*6,(Math.random()-.5)*8);effects.push({m,life:.45,max:.45,v,shared:true});}}
function ringEffect(e,color,radius=2.8,life=.4,delay=0){const m=new THREE.Mesh(new THREE.RingGeometry(radius*.8,radius,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(e.x,e.y,e.z);m.visible=delay<=0;scene.add(m);effects.push({m,life,max:life,grow:true,delay});}
// Comic star burst: the signature PS2-anime hit spark.
function starBurst(e,size=1.5,color='#ffffff',delay=0,life=.2){const s=starSprite(color);s.position.set(e.x+(Math.random()-.5)*.2,e.y,e.z+(Math.random()-.5)*.2);s.material.rotation=Math.random()*Math.PI;s.visible=delay<=0;scene.add(s);effects.push({m:s,life,max:life,star:size,delay});}
const dustGeo=new THREE.SphereGeometry(.22,8,6),streakGeo=new THREE.BoxGeometry(.07,.07,1.3);
function dust(x,y,z,count=6,spread=1){const color='#fff8ec';for(let i=0;i<count;i++){const m=fxMesh(dustGeo,color,scene,x+(Math.random()-.5)*spread*.6,y+.15,z+(Math.random()-.5)*spread*.6,.85,false);const a=Math.random()*Math.PI*2,sp=1.2+Math.random()*2*spread;effects.push({m,life:.45,max:.45,v:new THREE.Vector3(Math.cos(a)*sp,.8+Math.random()*1.4,Math.sin(a)*sp),puff:true,keepGeo:true});}}
// Speed lines trailing a fighter who was knocked flying.
function streak(p){for(let i=0;i<2;i++){const m=fxMesh(streakGeo,'#ffffff',scene,p.x+(Math.random()-.5)*.6,p.y+.6+Math.random()*1.2,p.z+(Math.random()-.5)*.6,.8,false);m.lookAt(m.position.x+p.vx,m.position.y+p.vy*.3,m.position.z+p.vz);effects.push({m,life:.2,max:.2,keepGeo:true});}}
// Two-layer crescent (color + white edge) that sweeps open; vertical for launchers and slams.
function slashArc(e,color,inner,outer,life=.2){const rot=-Math.atan2(e.fz,e.fx),vertical=e.attackType==='upper'||e.attackType==='slam';for(const [a,b,c,o] of [[inner,outer,color,.85],[outer-.14,outer+.06,'#ffffff',.95]]){const m=new THREE.Mesh(new THREE.RingGeometry(a,b,32,1,-1.25,2.5),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));if(vertical)m.rotation.set(0,rot,0);else m.rotation.set(-Math.PI/2,0,rot);m.position.set(e.x,e.y+(vertical?-.3:0),e.z);scene.add(m);effects.push({m,life,max:life,sweep:true});}}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;let shake=0;
function shakeCam(amount){if(!reduceMotion)shake=Math.max(shake,amount);}
const guardHits=new Set();
const comboState=[{count:0,tick:-1e9},{count:0,tick:-1e9}];
function comboHit(e){if(world.brawl||e.guarded||!(e.id===0||e.id===1))return;const a=1-e.id,s=comboState[a];s.count=world.tick-s.tick<130?s.count+1:1;s.tick=world.tick;if(s.count>=2){const el=$('combo'+a);el.querySelector('b').textContent=s.count;el.classList.remove('pop');void el.offsetWidth;el.classList.add('show','pop');}}
const fxState=[0,1,2,3].map(()=>({grounded:true,t:0}));
const audio=createAudio();
// Legacy beeps are replaced by the synthesised effects in eventSound(); tone() stays so old call sites are harmless.
function tone(){}
function unlockAudio(){audio.unlock();}
const SOUND_ZOOM=new Set(['skillCharge']);
function crowdReact(e){
  const c=stage?.crowd;if(!c)return;
  switch(e.type){
    case 'hit':if(!e.guarded){if(e.damage>=18)c.cheer(.7,1.2);else if((e.id===0||e.id===1)&&comboState[1-e.id].count>=3)c.cheer(.5+Math.min(.3,comboState[1-e.id].count*.04),1.4);}break;
    case 'parry':c.cheer(.6,1);break;
    case 'skill':c.cheer(e.level>=3?1:.8,e.level>=3?2.4:1.6);break;
    case 'spike':case 'launch':c.cheer(.55,1);break;
    case 'explosion':case 'pieceCrash':c.cheer(.65,1.2);break;
    case 'lifeLost':case 'eliminated':c.cheer(.9,2);break;
    case 'ko':c.cheer(1,3.2);break;
  }
}
const P2=(n,e)=>audio.play(n,{x:e.x});
function eventSound(e){
  crowdReact(e);
  const P=(n,o)=>audio.play(n,{x:e.x,...o});
  switch(e.type){
    case 'hit':{if(e.guarded)break;const lv=e.damage>=18?2:e.damage>=10?1:0,a=(e.id===0||e.id===1)?comboState[1-e.id]:null;P('hit',{level:lv,combo:a?.count||0});break;}
    case 'guard':P('block');break;
    case 'parry':P('parry');audio.dip(.5);break;
    case 'guardBreak':P('guardBreak');break;
    case 'slash':if(e.attackType==='light'||e.attackType==='air')P('jabSwing',{char:e.char});else P('whoosh',{heavy:['slam','heavy','upper'].includes(e.attackType)});break;
    case 'heavy':P(({swordsman:'slashWave',guardian:'shieldThrow',brawler:'rubber',gunner:'whoosh',cook:'whirl',stormcaller:'whoosh'})[e.char]||'whoosh',{heavy:true});break;
    case 'shieldBash':P('whoosh',{heavy:true});break;
    case 'launch':P('launch');break;
    case 'spike':P('spike');break;
    case 'groundBounce':P('land',{power:.9});break;
    case 'spring':P('bounce');break;
    case 'rockWarn':case 'hazardWarn':case 'waveWarning':P('warn',{k:1});break;
    case 'rockImpact':P('rock');break;
    case 'snowBurst':P('ice');break;
    case 'shotFire':if(e.style==='slash')P('slashWave');else if(e.style==='shield')P('shieldThrow');else if(e.char==='gunner'||e.heavy)P('sniper');else P(e.style==='bolt'?'zap':'shot',{bolt:e.style==='bolt'});break;
    case 'shieldCatch':P('shieldCatch');particles(e,'#8fc7ff',8);break;
    case 'shotHit':P('hit',{level:0});break;
    case 'grab':case 'lift':P('grab');break;
    case 'throwHit':P('hit',{level:2});break;
    case 'grabEscape':P('ui');break;
    case 'propThrow':P('throw');break;
    case 'explosion':P('explosion',{big:e.kind==='cannon'});break;
    case 'cannon':P('cannon');break;
    case 'waveStart':P('splash');break;
    case 'ventWarn':P('warn',{k:2});break;
    case 'ventBurst':P('flame');break;
    case 'skillCharge':P('charge',{level:e.level});break;
    case 'skill':P('skill',{level:e.level});audio.dip(e.level>=3?1.4:.6);break;
    case 'wallBounce':case 'bodyCrash':case 'propBreak':case 'break':P('wood');break;
    case 'pieceHit':P(e.kind==='ice'?'ice':'wood');break;
    case 'pieceFall':P('warn',{k:2});break;
    case 'pieceCrash':P('crash');break;
    case 'crateLand':P('land',{power:.5});break;
    case 'pickup':case 'heal':P('pickup');break;
    case 'ready':case 'power':P('power');break;
    case 'lifeLost':case 'eliminated':P('ko');audio.dip(1);break;
    case 'recovery':P('whoosh');break;
    case 'fight':P('fight');break;
    case 'ko':P('ko');audio.dip(2.2);setTimeout(()=>audio.play('cheer'),500);break;
  }
}
// ---- Presentation layer: banners, cut-ins, flashes, slow motion and camera focus ----
let calloutTime=0,timeScale=1,slowUntil=0,focusShot=null,bannerKey='';
function announce(s){$('callout').textContent=s;calloutTime=1.1;}
function banner(html,kind='',duration=1.1){const b=$('banner');b.innerHTML=html;b.className='';b.style.setProperty('--dur',duration+'s');void b.offsetWidth;b.className='show '+kind;}
function flash(strength=.25){const f=$('flash');f.style.transition='none';f.style.opacity=String(strength);void f.offsetWidth;f.style.transition='opacity .25s';f.style.opacity='0';}
// Manga speed lines burst from the middle of the screen (skipped when the player prefers reduced motion).
function speedLines(strength=.5,seconds=.32){
  if(reduceMotion)return;const el=$('speedlines');el.classList.remove('show');el.style.setProperty('--peak',String(strength));el.style.setProperty('--dur',seconds+'s');void el.offsetWidth;el.classList.add('show');
}
// A comic sound-effect word pops out of the impact and drifts up; at most three at a time keeps big fights readable.
const SFX_COLORS=['#ffe14a','#ffb03a','#ff6a3a','#7fe0ff'];
function sfx(e,word,color=SFX_COLORS[0],size=1){
  if(effects.filter(x=>x.pop).length>=3)return;
  const s=sfxSprite(word,color);s.material.rotation=(Math.random()-.5)*.5;
  s.position.set(e.x+(Math.random()-.5)*.9,e.y+1.3+Math.random()*.5,e.z+.6);scene.add(s);
  effects.push({m:s,life:.62,max:.62,pop:[2.9*size,1.16*size],v:new THREE.Vector3((Math.random()-.5)*.6,1.1,0),sprite:true,sfx:true});
}
const pick=list=>list[Math.floor(Math.random()*list.length)];
const GUARD_SPARK={swordsman:'#ff8a5a',guardian:'#9fdcff',brawler:'#ffb03a',gunner:'#f0c040',cook:'#ff9a3a',stormcaller:'#ffe27a'};
// ---- Ground effects for thrown and broken things: real debris, fireballs, splashes, scorch marks ----
const debrisGeo=new THREE.BoxGeometry(1,1,1),shardGeo=new THREE.TetrahedronGeometry(1,0),dropGeo=new THREE.SphereGeometry(1,6,5),smokeGeo=new THREE.SphereGeometry(1,10,8);
// Chunks that fly out, spin, hit the floor, bounce once and fade.
function debris(e,colors,count=10,{size=.2,speed=6,geo=debrisGeo,life=1.1,flat=false}={}){
  for(let i=0;i<count;i++){
    const m=fxMesh(geo,pick(colors),scene,e.x,e.y+.2,e.z,1,false);m.material.side=THREE.DoubleSide;
    const s=size*(.6+Math.random()*.9);m.scale.set(flat?s*2.4:s,flat?s*.5:s,s);
    const a=Math.random()*Math.PI*2,sp=speed*(.4+Math.random()*.8);
    effects.push({m,life,max:life,chunk:true,keepGeo:true,v:new THREE.Vector3(Math.cos(a)*sp,2+Math.random()*speed*.7,Math.sin(a)*sp),spin:new THREE.Vector3((Math.random()-.5)*14,(Math.random()-.5)*14,(Math.random()-.5)*14),floor:Math.max(0,e.y-.6)+.08});
  }
}
// Glass, liquid drops and a splat for a bottle that just shattered.
function splash(e,color,glow){
  debris(e,['#dff6ff','#ffffff',glow],7,{size:.11,speed:5.5,geo:shardGeo,life:.9});
  for(let i=0;i<14;i++){
    const m=fxMesh(dropGeo,color,scene,e.x,e.y+.15,e.z,.9,false);const s=.06+Math.random()*.08;m.scale.setScalar(s);
    const a=Math.random()*Math.PI*2,sp=2+Math.random()*4.5;
    effects.push({m,life:.8,max:.8,chunk:true,keepGeo:true,v:new THREE.Vector3(Math.cos(a)*sp,3+Math.random()*4,Math.sin(a)*sp),spin:new THREE.Vector3(),floor:Math.max(0,e.y-.6)+.05});
  }
}
// Small trail left by a thrown item in flight: fuse sparks and smoke, drips, spores or frost.
function trailBit(b){
  const kind=b.kind,spark=kind==='bomb';
  const color=spark?pick(['#ffd066','#ff8a2a','#fff2b0']):kind==='poison'?pick(['#72e889','#c6ffa8']):kind==='virus'?pick(['#b66cff','#efcfff']):pick(['#ffffff','#bfe6ff']);
  const m=fxMesh(spark||kind==='virus'?shardGeo:dropGeo,color,scene,b.x+(Math.random()-.5)*.15,b.y+(spark?.35:.05),b.z+(Math.random()-.5)*.15,.95,spark||kind==='slow');
  m.scale.setScalar(spark?.09+Math.random()*.06:.06+Math.random()*.06);
  effects.push({m,life:spark?.32:.5,max:spark?.32:.5,chunk:true,keepGeo:true,v:new THREE.Vector3((Math.random()-.5)*1.2,spark?1.2+Math.random():.4,(Math.random()-.5)*1.2),spin:new THREE.Vector3(5,7,3),floor:-5});
  if(spark&&Math.random()<.5){const puff=fxMesh(smokeGeo,'#5a5c66',scene,b.x,b.y+.25,b.z,.5,false);effects.push({m:puff,life:.6,max:.6,smoke:.3,keepGeo:true,v:new THREE.Vector3(0,.6,0)});}
}
// Each kind of loot gives off its own little effect while it waits on the floor.
function pickupAmbient(m,p,dt){
  const u=m.userData;u.emit-=dt;if(u.emit>0)return;u.emit=.16+Math.random()*.12;
  const x=p.x+(Math.random()-.5)*.5,z=p.z+(Math.random()-.5)*.5,y=(p.y||0)+.3;
  const bit=(geo,color,size,vel,life,additive=false,gravity=false)=>{const b=fxMesh(geo,color,scene,x,y,z,.9,additive);b.scale.setScalar(size);effects.push({m:b,life,max:life,chunk:gravity,smoke:gravity?0:size*1.2,keepGeo:true,v:vel,spin:new THREE.Vector3(3,4,2),floor:-5});};
  const t=p.type;
  if(t==='meat')bit(smokeGeo,'#ffffff',.14,new THREE.Vector3(0,.9,0),.9);
  else if(t==='beer')bit(dropGeo,'#fff0bd',.07+Math.random()*.05,new THREE.Vector3((Math.random()-.5)*.3,1.1,0),.8,false);
  else if(t==='sword')starBurst({x,y:y+.5+Math.random()*.4,z},.55,'#fffbe0',0,.28);
  else if(t==='bomb')bit(shardGeo,'#ffb03a',.08,new THREE.Vector3((Math.random()-.5)*.8,1.6,(Math.random()-.5)*.8),.4,true,true);
  else if(t==='poison')bit(dropGeo,'#7ee98f',.09,new THREE.Vector3(0,.9,0),.9);
  else if(t==='virus')bit(shardGeo,'#c084ff',.09,new THREE.Vector3((Math.random()-.5)*.6,.6,(Math.random()-.5)*.6),.9,true);
  else if(t==='slow')bit(shardGeo,'#ffffff',.08,new THREE.Vector3((Math.random()-.5)*.4,-.2,(Math.random()-.5)*.4),1,true);
}
// A flat mark burned into the floor that fades slowly.
const scorchGeo=(()=>{const s=new THREE.Shape(),n=34;for(let i=0;i<=n;i++){const a=i/n*Math.PI*2,r=.75+.25*Math.sin(a*5)+.12*Math.sin(a*9+1);const x=Math.cos(a)*r,y=Math.sin(a)*r;i?s.lineTo(x,y):s.moveTo(x,y);}const g=new THREE.ShapeGeometry(s);g.rotateX(-Math.PI/2);return g;})();
function scorch(e,radius=1.7,life=7){
  const m=new THREE.Mesh(scorchGeo,new THREE.MeshBasicMaterial({color:'#15161a',transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide}));
  m.scale.set(radius,1,radius);m.rotation.y=Math.random()*6;m.position.set(e.x,Math.max(.045,e.y-.65+.045),e.z);scene.add(m);effects.push({m,life,max:life,op:.6,keepGeo:true,fadeSlow:true});
}
// Fireball, rising flames, a column of smoke and flying scrap.
function blast(e,scale=1,dark=false){
  const fire=fxMesh(new THREE.SphereGeometry(1,16,12),'#ff8a2a',scene,e.x,e.y+.2,e.z,.95,false);
  effects.push({m:fire,life:.36,max:.36,fireball:1.9*scale});
  const core=fxMesh(new THREE.SphereGeometry(1,12,10),'#fff2b0',scene,e.x,e.y+.2,e.z,1,false);effects.push({m:core,life:.22,max:.22,fireball:1.1*scale});
  for(let i=0;i<9;i++){
    const a=i/9*Math.PI*2+Math.random(),cone=fxMesh(new THREE.ConeGeometry(.35,1.4,6),i%2?'#ffb03a':'#ff5a1f',scene,e.x+Math.cos(a)*.7*scale,e.y+.1,e.z+Math.sin(a)*.7*scale,.9,false);
    cone.visible=false;effects.push({m:cone,life:.5,max:.5,flame:scale,delay:.02+Math.random()*.08});
  }
  for(let i=0;i<7;i++){
    const puff=fxMesh(smokeGeo,dark?'#22242b':'#4a4c56',scene,e.x+(Math.random()-.5)*.8*scale,e.y+.3,e.z+(Math.random()-.5)*.8*scale,.65,false);
    effects.push({m:puff,life:1.3,max:1.3,smoke:(.5+Math.random()*.5)*scale,delay:i*.05,keepGeo:true,v:new THREE.Vector3((Math.random()-.5)*.8,1.4+Math.random()*.8,(Math.random()-.5)*.8)});puff.visible=false;
  }
  debris(e,dark?['#2b2e36','#4a4d58']:['#3a2f2a','#5a4638','#ff8a2a'],10,{size:.16,speed:8,life:1.2});
  scorch(e,1.6*scale);
}
// ---- Special moves: a charge aura that grows with the level, a letterbox for the level-3 ultimate, and one signature flourish per move ----
function letterbox(seconds){const el=$('letterbox');if(!el)return;el.classList.add('on');clearTimeout(letterbox.t);letterbox.t=setTimeout(()=>el.classList.remove('on'),seconds*1000);}
const AURA={whirlwind:'#ffd24a',shieldQuake:'#80dfff',fistStorm:'#ffcf5a',barrage:'#ff8a3c',flameKick:'#ff8a2a',thunder:'#ffe27a'};
function skillAura(p,m,dt){
  const ps=p.pendingSkill;if(!ps){m.auraT=0;return;}
  m.auraT=(m.auraT||0)+dt;const color=AURA[ps.kind]||'#ffe6a1',lvl=ps.level,at={x:p.x,y:p.y+.1,z:p.z};
  if(m.auraT>.12/(1+lvl*.4)){m.auraT=0;ringEffect(at,color,1.2+lvl*.5,.28);particles({x:p.x,y:p.y+.4+Math.random()*1.6,z:p.z},color,2+lvl);}
  if(ps.kind==='thunder'&&Math.random()<.12*lvl){const b=fxMesh(new THREE.CylinderGeometry(.03,.06,6,5),'#fff6b0',scene,p.x+(Math.random()-.5)*2,3,p.z+(Math.random()-.5)*2,.8);effects.push({m:b,life:.1,max:.1});}
  if(ps.kind==='flameKick'&&Math.random()<.5)particles({x:p.x+(Math.random()-.5)*.8,y:p.y+.2,z:p.z+(Math.random()-.5)*.8},'#ff7a2a',1);
}
function skillFinale(e,color){
  const lv=e.level,at={x:e.x,y:.15,z:e.z};
  if(e.kind==='whirlwind'){for(let j=0;j<3+lv;j++)ringEffect({...at,y:.3+j*.45},j%2?'#ffffff':'#ffd24a',e.radius*(.5+j*.18),.4+j*.06,j*.05);}
  else if(e.kind==='shieldQuake'){   // cracks run out of the shield's impact point
    const n=8+lv*3;for(let j=0;j<n;j++){const a=j/n*Math.PI*2+Math.random()*.2,len=e.radius*(.7+Math.random()*.4);const m=fxMesh(new THREE.BoxGeometry(.14,.05,len),'#e9fbff',scene,e.x+Math.cos(a)*len/2,.12,e.z+Math.sin(a)*len/2,.9);m.rotation.y=-a+Math.PI/2;effects.push({m,life:.7,max:.7});}
    shakeCam(.2+lv*.05);dust(e.x,.1,e.z,10,e.radius*.5);}
  else if(e.kind==='fistStorm'){shakeCam(.18+lv*.06);for(let j=0;j<2+lv;j++)ringEffect({...at,y:.2+j*.3},'#ff8a3c',e.radius*(.4+j*.2),.3,j*.08);}
  else if(e.kind==='barrage'){   // shells fall from the sky onto the target area
    for(let j=0;j<5+lv*3;j++){const a=Math.random()*Math.PI*2,r=Math.random()*e.radius,x=e.x+Math.cos(a)*r,z=e.z+Math.sin(a)*r;const m=fxMesh(new THREE.CylinderGeometry(.05,.18,3.2,6),'#ffb35a',scene,x,7,z,.9);effects.push({m,life:.25,max:.25,delay:(j+1)*.04,v:new THREE.Vector3(0,-26,0)});m.visible=false;}
    shakeCam(.12+lv*.04);}
  else if(e.kind==='flameKick'){for(let j=0;j<4+lv*2;j++){const a=Math.random()*Math.PI*2,r=Math.random()*e.radius*.8,x=e.x+Math.cos(a)*r,z=e.z+Math.sin(a)*r;const m=fxMesh(new THREE.CylinderGeometry(.35,.6,3+Math.random()*2,10),j%2?'#ffd34a':'#ff6a1a',scene,x,1.6,z,.7);effects.push({m,life:.5,max:.5,delay:(j+1)*.05});m.visible=false;}shakeCam(.1+lv*.04);}
  else if(e.kind==='thunder'){flash(.3);shakeCam(.2+lv*.05);for(let j=0;j<3;j++)ringEffect({...at,y:.1+j*.1},'#bff4ff',e.radius*(.5+j*.25),.35,j*.07);}
}
function cutin(e){const c=$('cutin'),ch=CHARACTERS[e.char]||characterOf(world.fighters[e.id]);c.className='';void c.offsetWidth;c.style.setProperty('--cut',ch.color);$('cutinPortrait').src=portraits[e.char]||'';$('cutinName').textContent=ch.skillName;$('cutinLevel').textContent=e.level===3?'LV 3 · 奥义':`LV ${e.level} · 必杀`;c.className='show'+(e.id%2===1?' right':'')+(e.level===3?' lv3':'');}
function slowMotion(scale,seconds){timeScale=scale;slowUntil=performance.now()+seconds*1000;}
function focusOn(x,y,z,dist,seconds){focusShot={x,y,z,dist,until:performance.now()+seconds*1000};}
const nameOf=id=>characterOf(world.fighters[id]).name;
function stageText(key){return STAGES[world.stage]?.[key]||STAGES.port[key];}

function events(){const batch=world.events.splice(0);if(netRole==='host')netEvents.push(...batch);for(const e of batch){
  eventSound(e);
  if(e.type==='skillCharge'){cutin(e);if(e.level===3)letterbox(1.6);announce(e.id===localPlayerId?`${e.level}级必杀蓄力！`:'对手正在蓄力！可闪避或抢先打断');tone(620,.18,'triangle');if(e.level===3){focusOn(e.x,1.4,e.z,11,.7);}}
  if(e.type==='skillCancel'){announce('必杀被打断！');starBurst(e,1.3,'#bfe6ff');particles(e,'#fff0bd',8);tone(130,.15,'triangle');}
  if(e.type==='flank'){announce(e.id===localPlayerId?'侧后方受击！转身再防御':'绕过防御！');}
  if(e.type==='shock'){particles(e,'#8fe0ff',14);starBurst(e,1.8,'#bff4ff');ringEffect(e,'#7fd0ff',2.2,.25);P2('zap',e);announce(e.id===localPlayerId?'触电！下一击伤害 +25%':'触电！下一击伤害 +25%');}
  if(e.type==='freeze'){starBurst(e,2.4,'#dff6ff');particles(e,'#cdefff',22);ringEffect(e,'#9fdcff',3,.35);P2('ice',e);announce('冰面导电：整个人被冻住！');}
  if(e.type==='electrify'){starBurst(e,2.4,'#fff6a0');particles(e,'#bff4ff',20);ringEffect(e,'#7fd0ff',3.2,.35);P2('zap',e);shakeCam(.1);announce('温泉导电：额外伤害！');}
  if(e.type==='pull'){speedLines(.6,.25);particles(e,'#ffb35a',10);ringEffect(e,'#ffb35a',2,.2);P2('rubber',e);}
  if(e.type==='hit'&&!e.guarded&&e.by){   // signature-move hit feel
    if(e.kind==='heavy'&&e.by==='brawler'){shakeCam(.22);flash(.2);starBurst(e,2.6,'#ffd266');ringEffect(e,'#ff8a3c',3,.25);speedLines(.7,.3);}
    else if(e.kind==='heavy'&&e.by==='cook'){shakeCam(.14);ringEffect(e,'#ffcf3a',3.2,.3);particles(e,'#ffcf3a',16);}
    else if(e.kind==='heavy'&&e.by==='swordsman'){starBurst(e,1.9,'#fff4c0');ringEffect(e,'#ffae3c',2,.18);}
    else if(e.kind==='shot'&&e.by==='swordsman'){particles(e,'#fff4c0',14);starBurst(e,1.5,'#ffd24a');}
    else if(e.kind==='shot'&&e.by==='guardian'){ringEffect(e,'#8fc7ff',2.4,.22);particles(e,'#8fc7ff',10);}
    else if(e.kind==='shot'&&e.by==='gunner'){shakeCam(.12);flash(.1);starBurst(e,2,'#ffe08a');particles(e,'#ff8a3c',12);}
    else if(e.kind==='shot'&&e.by==='stormcaller'){particles(e,'#8fe0ff',16);starBurst(e,1.6,'#bff4ff');ringEffect(e,'#7fd0ff',2,.2);}
  }
  if(e.type==='hit'){comboHit(e);if(e.damage>=18){shakeCam(.14);speedLines(.5,.3);focusOn(e.x,e.y,e.z,12.5,.22);}if(e.guarded)sfx(e,'铛!','#bfe6ff',.8);else sfx(e,e.damage>=18?pick(['轰!!','嘭嘭!!','砰!!!']):e.damage>=10?pick(['砰!!','嘭!','哐!']):pick(['啪!','咚!','砰!']),e.damage>=18?SFX_COLORS[2]:pick(SFX_COLORS.slice(0,2)),e.damage>=18?1.25:e.damage>=10?1:.8);starBurst(e,e.damage>=18?2.1:1.4);particles(e,'#ffe898',8);const tag=label(String(Math.round(e.damage)),e.damage>=18?'#ff6a3a':'#ffe14a',72);tag.position.set(e.x+.3,e.y+1,e.z);tag.scale.set(1.3,.5,1);scene.add(tag);effects.push({m:tag,life:.6,max:.6,v:new THREE.Vector3(0,2.2,0),sprite:true});tone(e.damage>=18?85:120,.1,'sawtooth');}
  if(e.type==='impact'){particles(e,e.kind==='bomb'?'#ff7048':e.force>=8?'#ffd266':'#fff0a6',e.force>=8?22:12);ringEffect(e,e.kind==='bomb'?'#ff7048':e.force>=8?'#ffd266':'#fff0a6',e.force>=8?2.2:1.5,.18);if(e.force>=10){flash(.18);shakeCam(.1);}}
  if(e.type==='slash'){
    const c=CHARACTERS[e.char]||characterOf(world.fighters[e.id]),color=e.attackType==='slam'?'#ffbd61':e.weapon==='sword'?'#ffd648':e.attackType==='rush'?'#ffb35a':c.accent;
    slashArc(e,color,e.attackType==='slam'?1.6:1.2,e.attackType==='slam'?2.8:2.4,e.attackType==='slam'?.26:.2);tone(e.attackType==='slam'?150:310,.06,'triangle');
    if(e.id===localPlayerId)announce(e.attackType==='slam'?'坠落重击！':e.attackType==='air'?'空中攻击！':e.attackType==='dash'?'冲刺斩！':e.attackType==='rush'?'突进铁拳！':e.attackType==='upper'?'上挑！':['一击！','二连！','三连终结！'][e.combo]);
    if(e.attackType==='air'&&e.airCombo)announce(e.airCombo===2?'空中终结！':'空中追击！');
  }
  if(e.type==='launch'){sfx(e,'嗖!','#fff2a0',1.1);speedLines(.45,.3);starBurst(e,2,'#fff6c0');ringEffect({...e,y:e.y-.9},'#ffe39a',1.4,.25);dust(e.x,e.y-1,e.z,6,1);announce('浮空！跳起连按 J 追击');tone(520,.12,'triangle');}
  if(e.type==='spike'){sfx(e,'轰隆!','#ff6a3a',1.35);speedLines(.65,.36);starBurst(e,2.6,'#ffffff');flash(.2);shakeCam(.2);announce('砸地！');tone(90,.2,'sawtooth');}
  if(e.type==='groundBounce'){sfx(e,'咚!','#ffb03a',1);dust(e.x,e.y,e.z,12,1.6);ringEffect(e,'#ffd27a',1.8,.3);starBurst({...e,y:e.y+.4},1.8,'#ffdc8a');shakeCam(.16);tone(70,.18,'triangle');}
  if(e.type==='spring'){dust(e.x,e.y,e.z,6,1);stage?.bounce(e.x,e.z);if(e.id===localPlayerId)announce('弹跳网！');tone(300,.2,'triangle');}
  if(e.type==='rockWarn'){ringEffect(e,'#ff4a2a',1.7,1.85);ringEffect({...e,y:.15},'#ff9a6a',1.1,1.85);announce('落石！快离开红圈');tone(200,.25,'square',.03);}
  if(e.type==='rockImpact'){dust(e.x,e.y,e.z,14,1.8);debris(e,['#8a6a48','#6f5238','#a3835c'],12,{size:.26,speed:7.5});scorch(e,1.3,6);starBurst({...e,y:.9},2.2,'#ffcf8a');shakeCam(.18);tone(55,.3,'sawtooth',.06);}
  if(e.type==='snowBurst'){debris(e,['#ffffff','#dff4ff','#c3e6ff'],14,{size:.2,speed:6.5,geo:dropGeo,life:.9});particles(e,'#ffffff',10);starBurst(e,1.6,'#e8f6ff');tone(160,.15,'triangle');}
  if(e.type==='shieldBash'){ringEffect(e,'#72dbff',1.6,.2);tone(200,.08,'triangle');}
  if(e.type==='shotFire'){const bolt=e.style==='bolt';starBurst({x:e.x+e.fx*.5,y:e.y,z:e.z+e.fz*.5},bolt?1.1:.8,bolt?'#bfeaff':'#ffcf6a',0,.1);tone(bolt?1300:900,.05,bolt?'sawtooth':'square',.03);}
  if(e.type==='shotHit'){const bolt=e.style==='bolt';sfx(e,bolt?'滋啦!':'砰!',bolt?'#7fe0ff':'#ffe14a',.75);starBurst(e,bolt?1.5:1.1,bolt?'#d8f4ff':'#ffd08a');particles(e,bolt?'#9fe0ff':'#ffb35a',6);}
  if(e.type==='heavy'){ringEffect(e,'#ffb45c',2.2,.22);particles(e,'#ffe19a',12);announce('重击！');tone(180,.12,'sawtooth');}
  if(e.type==='grab'){announce('擒抱！J 前投 / U 高投；被抓连按攻击挣脱');tone(260,.09,'square');}
  if(e.type==='throwHit'){ringEffect(e,'#ffcf72',1.5,.28);starBurst(e,1.8);announce('抓取投摔！');tone(100,.18,'sawtooth');}
  if(e.type==='grabEscape'){ringEffect(e,'#8ff3e7',1.4,.24);announce('挣脱擒抱！');tone(360,.1,'triangle');}
  if(e.type==='dropHeld'){particles(e,'#d6a564',8);announce('受击松手！');tone(180,.08,'triangle');}
  if(e.type==='explosion'&&e.kind==='keg'){debris(e,['#a4352a','#5e3a2a','#3d4650'],12,{size:.22,speed:7,flat:true});announce('火药桶爆炸！');}
  if(e.type==='explosion'){sfx(e,'轰!!','#ff6a3a',1.3);speedLines(.4,.28);blast(e,e.kind==='cannon'?.85:1,e.kind==='cannon');dust(e.x,Math.max(0,e.y-.5),e.z,10,2.4);starBurst(e,2.6,'#ffcf6a');flash(.15);tone(70,.24,'sawtooth',.06);}
  if(e.type==='ventWarn'){announce('地面发烫！喷火口马上喷发');for(let j=0;j<5;j++)particles({x:e.x+(Math.random()-.5)*e.r,y:.3,z:e.z+(Math.random()-.5)*e.r},'#ffb347',1);}
  if(e.type==='ventBurst'){ringEffect({x:e.x,y:.15,z:e.z},'#ff7a1c',e.r*1.6,.35);ringEffect({x:e.x,y:.2,z:e.z},'#fff1a0',e.r*.9,.25);particles({x:e.x,y:.6,z:e.z},'#ff8a2a',16);starBurst({x:e.x,y:1,z:e.z},2.2,'#ffd34a');dust(e.x,0,e.z,6,1.4);shakeCam(.12);}
  if(e.type==='cloud'){const color=e.kind==='slow'?'#8ab8ff':e.kind==='virus'?'#c084ff':'#83f09a',glow=e.kind==='slow'?'#ffffff':e.kind==='virus'?'#efcfff':'#c6ffa8';splash(e,color,glow);dust(e.x,e.y,e.z,5,1.4);announce(e.kind==='slow'?'冰雾扩散！':e.kind==='virus'?'病毒云扩散！':'毒雾扩散！');tone(e.kind==='virus'?150:190,.18,'sawtooth');}
  if(e.type==='skill'){
    const c=CHARACTERS[e.char]||characterOf(world.fighters[e.id]),kind=e.kind,color=kind==='shieldQuake'?'#80dfff':kind==='thunder'?'#ffe27a':kind==='flameKick'?'#ff8a2a':kind==='barrage'?'#ff8a3c':kind==='fistStorm'?'#ffcf5a':e.level===3?'#ffd84f':'#ffe6a1';
    if(kind==='shieldQuake'){ringEffect(e,color,e.radius,.5+e.level*.12);ringEffect({...e,y:e.y-.5},'#d4f6ff',e.radius*.6,.65);particles(e,color,24);}
    else if(kind==='fistStorm'){for(let j=0;j<6+e.level*3;j++){const a=Math.random()*Math.PI*2,r=Math.random()*e.radius*.8;starBurst({x:e.x+Math.cos(a)*r,y:e.y+.3+Math.random()*1.4,z:e.z+Math.sin(a)*r},1.2+Math.random()*.6,'#ffffff',j*.035,.16);}ringEffect(e,color,e.radius,.4);}
    else if(kind==='flameKick'){ringEffect(e,'#ff8a2a',e.radius,.45);for(let j=0;j<7+e.level*3;j++){const a=Math.random()*Math.PI*2,r=Math.random()*e.radius*.85;const p={x:e.x+Math.cos(a)*r,y:e.y+.2+Math.random()*1.2,z:e.z+Math.sin(a)*r};starBurst(p,1.2+Math.random()*.7,j%2?'#ffd34a':'#ff7a2a',j*.03,.18);particles(p,'#ff8a2a',3);}}
    else if(kind==='thunder'){for(let j=0;j<5+e.level*3;j++){const a=Math.random()*Math.PI*2,r=Math.random()*e.radius,p={x:e.x+Math.cos(a)*r,y:.4,z:e.z+Math.sin(a)*r};ringEffect(p,'#ffe27a',1.2,.25,j*.05);const bolt=fxMesh(new THREE.CylinderGeometry(.06,.14,9,6),'#fff6b0',scene,p.x,4.6,p.z,.95);effects.push({m:bolt,life:.16,max:.16,delay:j*.05});bolt.visible=false;starBurst({...p,y:.9},1.8,'#dff6ff',j*.05,.18);}ringEffect(e,'#8fe0ff',e.radius,.5);flash(.25);}
    else if(kind==='barrage'){for(let j=0;j<5+e.level*3;j++){const a=Math.random()*Math.PI*2,r=Math.random()*e.radius,p={x:e.x+Math.cos(a)*r,y:.4,z:e.z+Math.sin(a)*r};ringEffect(p,'#ff8a3c',1.1,.25,j*.05);starBurst({...p,y:.8},1.6,'#ffcf6a',j*.05,.18);}ringEffect(e,color,e.radius,.5);}
    else{for(let j=0;j<3;j++)ringEffect({...e,y:e.y+j*.6},color,e.radius*(1-j*.15),.35+j*.12);particles(e,color,18);}
    sfx({x:e.x,y:e.y+.6,z:e.z},e.level===3?'轰轰轰!':'轰!!',e.level===3?'#ffe14a':'#ff8a3a',e.level===3?1.6:1.3);if(e.level>=2)speedLines(.35+e.level*.1,.4);
    announce(`${e.level}级 · ${c.skillName}！`);tone(kind==='shieldQuake'?100:500,.3+e.level*.08,kind==='shieldQuake'?'sawtooth':'triangle');
    if(e.level>=2){flash(.2+e.level*.08);focusOn(e.x,1.2,e.z,12,.55);}
    skillFinale(e,color);
    if(e.level===3){letterbox(1.3);shakeCam(.3);}
  }
  if(e.type==='wallBounce'||e.type==='bodyCrash'){sfx(e,e.type==='wallBounce'?'哐!':'哗啦!','#ffb03a',1);particles(e,'#d6a564',16);starBurst(e,1.5,'#ffdc8a');announce(e.type==='wallBounce'?'撞栏反弹！':'撞碎箱子！');tone(85,.14,'triangle');}
  if(e.type==='lift'){announce(`举起${e.kind==='barrel'?'木桶':e.kind==='keg'?'火药桶（别让它碎在自己脚边！）':e.kind==='chest'?'宝箱':'木箱'} · J前投 / U高投`);tone(250,.1,'square');}
  if(e.type==='propThrow'){announce(e.high?'高抛！':'向前投掷！');tone(180,.1,'sawtooth');}
  if(e.type==='propBreak'){debris(e,e.kind==='chest'?['#9a5f2e','#e2a93c','#ffd45e']:e.kind==='barrel'?['#a86a3c','#7a4a2a','#3d4650']:['#c08a50','#a06a36','#5e4636'],13,{size:.24,speed:7,flat:true});if(e.kind==='chest')debris(e,['#ffd45e','#fff2a0'],7,{size:.12,speed:5.5,geo:shardGeo});dust(e.x,Math.max(0,e.y-.5),e.z,6,1.4);starBurst(e,1.4,'#fff2b0');}
  if(e.type==='hazardWarn')startHazardWarning(e);
  if(e.type==='cannon'){announce(e.kind==='snowball'?'滚地雪球来了！跳起来躲':`${stageText('cannon')}！注意两侧`);tone(80,.28,'sawtooth');}
  if(e.type==='waveWarning'){announce(`${stageText('wave')}将从${e.dir>0?'左':'右'}侧袭来！`);tone(140,.35,'triangle');}
  if(e.type==='waveStart'){announce(e.kind==='sandstorm'?'沙暴来袭！空中也会被吹走':`${stageText('wave')}来袭！跳上高台！`);tone(65,.45,'sawtooth');}
  if(e.type==='guard'){guardHits.add(e.id);ringEffect(e,GUARD_SPARK[world.fighters[e.id]?.char]||'#8bd8ff',1.5,.18);starBurst(e,1.2,'#ffffff');announce('挡住了！');tone(220,.08,'triangle');}
  if(e.type==='parry'){guardHits.add(e.id);sfx(e,'锵!','#fff2a0',1.1);ringEffect(e,'#fff1a0',1.7,.28);starBurst(e,1.6,'#fff6c0');announce('完美反击！');tone(760,.16,'triangle');}
  if(e.type==='guardBreak'){sfx(e,'咔嚓!','#ff6a3a',1.1);ringEffect(e,'#ff8b72',1.8,.3);starBurst(e,2,'#ffb0a0');announce('防御崩溃！');tone(90,.2,'sawtooth');}
  if(e.type==='knockdown'){ringEffect(e,'#ffb477',1.35,.25);}
  if(e.type==='wakeup'){ringEffect(e,'#b5f5ff',1.1,.25);}
  if(e.type==='recovery'){ringEffect(e,'#b5f5ff',1.1,.22);particles(e,'#e6faff',8);announce(e.id===localPlayerId?'受身成功！':'对手翻滚受身');tone(420,.1,'triangle');}
  if(e.type==='energy'&&e.id===localPlayerId)tone(500,.05,'triangle');
  if(e.type==='break'){debris(e,e.kind==='chest'?['#9a5f2e','#e2a93c']:e.kind==='barrel'?['#a86a3c','#7a4a2a','#3d4650']:['#c08a50','#a06a36'],9,{size:.2,speed:5.5,flat:true});announce(`箱子打开：${ITEM_NAMES[e.item]||'道具'}出现`);}
  if(e.type==='pickup'){announce(`捡到 ${ITEM_NAMES[e.item]||'道具'} · 按 K 使用`);tone(620,.12,'triangle');}
  if(e.type==='ready'){announce(`战意水晶：${WEAPON_NAMES[world.fighters[e.id]?.char]||'武器'}发光，攻击 +35%，持续 10 秒（不占道具栏）`);if(e.x!==undefined)ringEffect(e,'#ffd66e',1.5,.45);tone(520,.16,'triangle');}
  if(e.type==='power'){announce('啤酒增幅：攻击 +55%，持续 8 秒！');ringEffect(e,'#ffd66e',1.4,.45);tone(700,.16,'triangle');}
  if(e.type==='poison'){announce('中毒！持续掉血');particles(e,'#8dffac',12);}
  if(e.type==='slow'){announce('减速！');particles(e,'#8ab8ff',12);}
  if(e.type==='dot'){const tag=label(String(e.damage),'#9dffb0',58);tag.position.set(e.x,e.y+1,e.z);tag.scale.set(.9,.35,1);scene.add(tag);effects.push({m:tag,life:.45,max:.45,v:new THREE.Vector3(0,1,0),sprite:true});}
  if(e.type==='crateDrop'){announce('空投箱来了！');tone(180,.12,'triangle');}
  if(e.type==='crateLand'){particles(e,'#d6a564',10);tone(110,.12,'square');}
  if(e.type==='heal'){announce('恢复 +20');particles(e,'#98f8b5');}
  if(e.type==='lifeLost'){announce(`失去一条命！剩余 ${e.lives} 命`);ringEffect(e,'#ff9b78',1.8,.35);tone(120,.18,'sawtooth');}
  if(e.type==='respawn'){announce('重新登场！');ringEffect(e,'#9df5ff',1.6,.35);}
  if(e.type==='pieceHit'){const c=e.kind==='ice'?'#d6f4ff':e.kind==='pillar'?'#e6c98f':'#c08a50';particles(e,e.kind==='ice'?'#d6f4ff':e.kind==='pillar'?'#e6c98f':'#c08a50',8);starBurst(e,1.3,'#ffffff');tone(e.kind==='ice'?520:110,.09,e.kind==='ice'?'triangle':'square',.04);}
  if(e.type==='pieceFall'){
    announce(e.kind==='mast'?'桅杆要倒了！快离开倒塌方向':e.kind==='pillar'?'石柱要塌了！快离开':'冰柱要炸了！快离开');tone(160,.4,'sawtooth',.05);
    if(e.fall==='burst')ringEffect({x:e.x,y:.12,z:e.z},'#7fd6ff',e.length,PIECE_FALL_TIME);
    else{const strip=new THREE.PlaneGeometry(2.5,e.length),m=new THREE.Mesh(strip,new THREE.MeshBasicMaterial({color:'#ff4a2a',transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;const g=new THREE.Group();g.add(m);m.position.z=e.length/2;g.rotation.y=Math.atan2(e.dir.x,e.dir.z);g.position.set(e.x,.13,e.z);scene.add(g);effects.push({m:g,life:PIECE_FALL_TIME,max:PIECE_FALL_TIME,strip:true,keepGeo:false});}
  }
  if(e.type==='pieceCrash'){sfx({x:e.x,y:e.y+.6,z:e.z},e.fall==='burst'?'咔啦!':'轰隆隆!','#ffb03a',1.5);speedLines(.55,.4);
    const heavy=e.fall!=='burst',color=e.kind==='ice'?'#d6f4ff':e.kind==='pillar'?'#e6c98f':'#c08a50';
    particles(e,color,heavy?30:34);dust(e.x,0,e.z,heavy?14:10,heavy?2.4:2);ringEffect({...e,y:.15},color,heavy?2.6:e.length,.4);starBurst({...e,y:1},3,'#ffffff');
    for(let j=0;j<4&&heavy;j++)dust(e.baseX+e.dir.x*e.length*(j+1)/4,0,e.baseZ+e.dir.z*e.length*(j+1)/4,4,1.4);
    flash(.25);shakeCam(.3);announce(e.kind==='mast'?'桅杆倒下！':e.kind==='pillar'?'石柱崩塌！':'冰柱炸裂！');tone(55,.4,'sawtooth',.07);
  }
  if(e.type==='roundStart'){bannerKey='';}
  if(e.type==='eliminated'){starBurst(e,3,'#ffffff');flash(.3);shakeCam(.2);announce(e.left>1?`${nameOf(e.id)} 被淘汰！还剩 ${e.left} 人`:`${nameOf(e.id)} 被淘汰！`);tone(70,.4,'sawtooth',.06);if(e.left<=1){slowMotion(.35,1);focusOn(e.x,e.y,e.z,10,1.2);}}
  if(e.type==='fight'){banner('FIGHT!','fight',.9);tone(880,.25,'square',.05);}
  if(e.type==='ko'){
    if(e.timeUp)banner('TIME UP','ko',2);else{banner('K.O.','ko',2);speedLines(.8,.6);flash(.55);shakeCam(.3);slowMotion(.3,1.1);focusOn(e.x,e.y,e.z,9,1.6);starBurst(e,3.4,'#ffffff');}
    const who=e.winner===null?'平局':`${nameOf(e.winner)} 拿下第 ${e.roundNo} 回合`;announce(who);tone(60,.6,'sawtooth',.07);
  }
  if(e.type==='end'){if(world.brawl)banner(e.winner===null?'DRAW':'K.O.','ko',1.6);showResult(e.winner);release();}
}}
const WEAPON_NAMES={swordsman:'长剑',guardian:'盾牌',brawler:'拳套',gunner:'火枪',cook:'战靴',stormcaller:'法杖'};
const ITEM_NAMES={bomb:'炸弹',poison:'毒瓶',virus:'病毒瓶',meat:'肉块',beer:'啤酒',slow:'冰冻瓶',sword:'战意水晶'};
function showResult(winner){
  const multi=world.bestOf>1&&!world.stock&&!world.training;
  $('resultSub').textContent=world.teamMode?`${STAGES[world.stage]?.name||''} · 2v2 组队战`:world.brawl?`${STAGES[world.stage]?.name||''} · 四人乱斗`:multi?`${STAGES[world.stage]?.name||''} · 三局两胜`:STAGES[world.stage]?.name||'';
  $('resultTitle').textContent=winner===null?'DRAW':world.teamMode?`${TEAM_NAMES[world.winnerTeam]??''}获胜！`:`${nameOf(winner)} WIN!`;
  $('resultPortrait').src=winner===null?'':portraits[world.fighters[winner].char]||'';if(winner===null)$('resultPortrait').removeAttribute('src');
  $('resultQuote').textContent=winner===null?'':`「${CHARACTERS[world.fighters[winner].char].quote}」`;
  $('resultScore').textContent=(winner===null?'平局！':(world.teamMode?world.winnerTeam===world.fighters[localPlayerId].team:winner===localPlayerId)?'你赢了！':'再来挑战！')+(multi?` 回合比分 ${world.wins[0]} - ${world.wins[1]}`:'');
  const rank=$('resultRank');
  if(world.brawl&&world.ranking){rank.hidden=false;rank.innerHTML='';world.ranking.forEach((id,i)=>{const f=world.fighters[id],li=document.createElement('li');li.style.setProperty('--c',(teamColorOf(f)||SLOT_COLORS[id]));li.innerHTML=`<b>${i+1}</b><img alt="" src="${portraits[f.char]||''}"><span></span><em></em>`;li.querySelector('span').textContent=CHARACTERS[f.char].name;li.querySelector('em').textContent=id===localPlayerId?'YOU':world.teamMode&&f.team===world.fighters[localPlayerId].team?'ALLY':'CPU';rank.append(li);});}else rank.hidden=true;
  if(!$('result').open)$('result').showModal();
}
function fighterStatus(p){const states=[];let kind='';const add=(active,text,tone)=>{if(active){states.push(text);if(!kind)kind=tone;}};add(p.poisonTime>0,`中毒 ${p.poisonTime.toFixed(1)}s`,'poison');add(p.virusTime>0,`病毒感染 ${p.virusTime.toFixed(1)}s`,'virus');add(p.slowTime>0,`冻伤减速 ${p.slowTime.toFixed(1)}s`,'ice');add(p.burnTime>0,`炸伤 ${p.burnTime.toFixed(1)}s`,'burn');add(p.vulnTime>0,`触电 ${(p.vulnTime||0).toFixed(1)}s`,'shock');add(p.weapon==='sword',`战意水晶 ${p.attackBoostTime.toFixed(1)}s`,'sword');add(p.attackBoostTime>0&&p.weapon!=='sword',`啤酒强化 ${p.attackBoostTime.toFixed(1)}s`,'beer');return {text:states.join(' · '),kind};}
function updateStatusBadge(id,p){const el=$(id),status=fighterStatus(p);if(p.pendingSkill){status.text=`${p.skillLevel}级必杀蓄力 ${p.skillWindup.toFixed(1)}s${status.text?' · '+status.text:''}`;status.kind='charge';}if(p.respawnProtection>0){status.text=`重生保护 ${p.respawnProtection.toFixed(1)}s${status.text?' · '+status.text:''}`;}if(el.textContent!==status.text)el.textContent=status.text;el.hidden=!status.text;el.dataset.kind=status.kind;}

// ---- Input ----
const keys=new Set();
const moveCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
const DIRECTION={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'},lastTap={dir:'',time:0};
function action(code){const p=world.fighters[localPlayerId];if(!selectHidden()||connectionAttempt.pending||world.ended||world.intro>0||world.roundOver>0||(netRole!=='solo'&&(!netConn?.open||!world.online)))return;if(netRole!=='guest'&&[...moveCodes,'Space','KeyJ','KeyU','KeyI','KeyK','KeyL','ShiftLeft','ShiftRight','Sprint'].includes(code))started=true;const data={input:serialInput(),level:code==='KeyL'?(keys.has('KeyR')?3:keys.has('ShiftLeft')||keys.has('ShiftRight')?2:1):1};if(!networkAction(code,data))return;applyAction(p,code,data);}
addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,summary,.help-content'))return;
  if(!selectHidden()){selectKey(e);return;}
  if([...moveCodes,'Space','KeyJ','KeyU','KeyI','KeyK','KeyL','KeyR','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault();unlockAudio();keys.add(e.code);if(!e.repeat)action(e.code);
  // Double-tapping a direction starts a run, as in Grand Battle.
  if(!e.repeat&&moveCodes.includes(e.code)){const dir=DIRECTION[e.code],now=performance.now();if(lastTap.dir===dir&&now-lastTap.time<260){action('Sprint');lastTap.time=0;}else{lastTap.dir=dir;lastTap.time=now;}}
});
addEventListener('keyup',e=>keys.delete(e.code));
let touchControls=null;if(isTouchDevice())touchControls=createTouchControls({keys,action,unlock:unlockAudio});
function release(){touchControls?.release();keys.clear();world.fighters[localPlayerId].jumpBuffer=0;if(netRole==='guest')sendNet({t:'input',round:world.round||0,input:neutralInput()});else if(netRole==='host')sendSnapshot();}
addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{release();last=performance.now();acc=0;});
for(const [id,code] of [['jumpButton','Space'],['attackButton','KeyJ'],['heavyButton','KeyU'],['grabButton','KeyI'],['bombButton','KeyK'],['skillButton','KeyL']])$(id).onclick=()=>{unlockAudio();action(code);$(id).blur();};
renderer.domElement.addEventListener('pointerdown',()=>{unlockAudio();document.activeElement?.blur();});
function removeEffect(e){scene.remove(e.m);if(e.sfx){e.m.material.dispose();return;}if(e.strip){e.m.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});return;}if(e.sprite)e.m.material.map.dispose();if(e.star){e.m.material.dispose();return;}if(!e.shared){if(!e.keepGeo)e.m.geometry?.dispose();e.m.material.dispose();}}
function clearVisualEffects(){
  clearGhosts();clearWarnings();
  clearPieceModels();
  for(const map of [bombModels,cloudModels,propModels,cannonModels,shotModels]){for(const m of map.values()){scene.remove(m);m.traverse(o=>{if(!o.userData.ink)o.geometry?.dispose();if(o.material&&!isSharedMaterial(o.material)&&o.material.side!==THREE.BackSide)o.material.dispose();});}map.clear();}
  for(const e of effects)removeEffect(e);effects.length=0;
}

// ---- Match flow and select screen ----
// Brawl fills the four slots with the two picks plus the roster members not yet chosen.
function brawlRoster(){return [selection.p1,selection.p2,selection.p3,selection.p4];}
let brawlMode='';
function matchOptions(){const {training,stock,online}=world;if(brawlMode&&!training&&!stock&&!online)return {chars:brawlRoster(),teams:brawlMode==='team'?[0,1,0,1]:undefined,stage:selection.stage,bestOf:1,roundTime:120,intro:3.6};return {chars:[selection.p1,world.online?guestChar:selection.p2],stage:selection.stage,bestOf:training||stock?1:3,roundTime:training?120:99,intro:training?0:3.6};}
function reset(){
  if(netRole==='guest')return;
  const {training,online,stock}=world,round=(world.round||0)+1;world=createWorld(matchOptions());Object.assign(world,{training,online,stock,round,rematchVotes:[false,false]});
  world.bestOf=world.brawl||training||stock?1:3;world.intro=training?0:3.6;
  guestInput.clear();netEvents.length=0;acc=0;netSendAcc=0;netBroadcastAcc=0;bannerKey='';timeScale=1;focusShot=null;
  if(stock)world.fighters.forEach(p=>p.lives=3);started=online||(selectHidden()&&!training);if(training)world.fighters[1].x=-1.6;
  keys.clear();$('result').close();clearVisualEffects();if(selectHidden())announce(stock?'三命模式 · 还有三条命':training?'按 J / U / I 测试攻击':'');sendSnapshot();
}
function requestRematch(){
  if(netRole==='solo'){reset();return;}
  if(!world.ended)return;
  if(netRole==='guest'){sendNet({t:'rematch',round:world.round||0});return;}
  if(voteRematch(world,0,world.round||0))reset();else sendSnapshot();
}
const selectHidden=()=>$('select').hidden;
function hideSelect(){$('select').hidden=true;document.activeElement?.blur();}
function showSelect(){$('result').close();$('select').hidden=false;if(netRole==='solo')started=false;refreshSelect();$('startMatch').focus();}
function startMatch(){if(netRole==='guest')return;saveSelection();hideSelect();reset();}
function card(kind,id,title,sub,face){const b=document.createElement('button');b.className='card'+(kind==='stage'?' stage-card':'');b.dataset.id=id;b.innerHTML=`<span class="face">${face}</span><b></b><small></small>`;b.querySelector('b').textContent=title;b.querySelector('small').textContent=sub;return b;}
function buildSelect(){
  for(const [slot,list] of [['p1',$('p1Roster')],['p2',$('p2Roster')],['p3',$('p3Roster')],['p4',$('p4Roster')]])for(const id of CHARACTER_IDS){const c=CHARACTERS[id],b=card('char',id,`${c.name}`,`${c.title} · ${c.blurb}`,portraits[id]?`<img alt="" src="${portraits[id]}">`:'');b.style.setProperty('--c',c.color);b.onclick=()=>{selection[slot]=id;saveSelection();previewSelection();};list.appendChild(b);}
  for(const id of STAGE_IDS){const t=THEMES[id],s=STAGES[id],b=card('stage',id,s.name,s.sub,'');b.querySelector('.face').style.setProperty('--bg',`linear-gradient(180deg,${t.skyTop},${t.skyBottom} 55%,${t.floor} 56%,${t.deckTop})`);b.onclick=()=>{selection.stage=id;saveSelection();previewSelection();};$('stageList').appendChild(b);}
}
function refreshSelect(){
  for(const [slot,list] of [['p1',$('p1Roster')],['p2',$('p2Roster')],['p3',$('p3Roster')],['p4',$('p4Roster')]])for(const b of list.children)b.setAttribute('aria-pressed',String(b.dataset.id===selection[slot]));
  for(const row of document.querySelectorAll('.pick-row.extra'))row.hidden=!world.brawl;
  $('p3Hint').textContent=world.teamMode?'（你的队友）':'（对手）';$('p4Hint').textContent=world.teamMode?'（对手）':'';
  for(const id of ['p3Roster','p4Roster'])for(const b of $(id).children)b.disabled=netRole==='guest'||world.online;
  for(const b of $('stageList').children)b.setAttribute('aria-pressed',String(b.dataset.id===selection.stage));
  const guest=netRole==='guest';
  for(const b of [...$('p2Roster').children,...$('stageList').children,$('randomRival')])b.disabled=guest||world.online;
  for(const b of $('p1Roster').children)b.disabled=guest;
  $('startMatch').disabled=guest;$('startMatch').textContent=guest?'等待房主开始…':world.online?'开始联机对战 ▶':'开始对战 ▶';
  $('ruleLabel').textContent=world.teamMode?'2v2 组队战 · 队友不会误伤 · 消灭对方全队获胜 · 120 秒':world.brawl?'四人乱斗 · 最后站着的人获胜 · 120 秒':world.training?'练习模式 · 不限时间':world.stock?'三命制 · 一局定胜负':'三局两胜 · 每局 99 秒';
}
// While browsing the menu the arena behind shows the current picks.
function previewSelection(){refreshSelect();if(netRole==='solo'&&!selectHidden())reset();}
function selectKey(e){
  const cycle=(list,value,dir)=>list[(list.indexOf(value)+dir+list.length)%list.length];
  if(['ArrowLeft','KeyA','ArrowRight','KeyD'].includes(e.code)&&netRole!=='guest'){e.preventDefault();selection.p1=cycle(CHARACTER_IDS,selection.p1,e.code==='ArrowLeft'||e.code==='KeyA'?-1:1);previewSelection();}
  else if(['ArrowUp','KeyW','ArrowDown','KeyS'].includes(e.code)&&netRole==='solo'){e.preventDefault();selection.stage=cycle(STAGE_IDS,selection.stage,e.code==='ArrowUp'||e.code==='KeyW'?-1:1);previewSelection();}
  else if(e.code==='Enter'&&e.target===document.body){e.preventDefault();startMatch();}
}
buildSelect();
$('startMatch').onclick=startMatch;
$('randomRival').onclick=()=>{selection.p2=CHARACTER_IDS[Math.floor(Math.random()*CHARACTER_IDS.length)];previewSelection();};
 $('glbButton').textContent=TRIPO_PREVIEW?'角色模型：Tripo':useGlb?'角色模型：Blender':'角色模型：程序生成';
 $('glbButton').onclick=()=>{if(TRIPO_PREVIEW){try{localStorage.setItem('gb-tripo','0');}catch{}const u=new URL(location.href);u.searchParams.set('tripo','0');location.href=u.toString();return;}try{localStorage.setItem('gb-tripo','1');}catch{}const u=new URL(location.href);u.searchParams.set('tripo','1');location.href=u.toString();};
const muteLabel=()=>{$('muteButton').textContent=audio.muted?'声音：关':'声音：开';};
$('muteButton').onclick=()=>{audio.unlock();audio.setMuted(!audio.muted);muteLabel();$('muteButton').blur();};muteLabel();
addEventListener('keydown',e=>{if(e.code==='KeyM'&&!e.repeat){audio.unlock();audio.setMuted(!audio.muted);muteLabel();}});
$('menuButton').onclick=()=>{showSelect();$('menuButton').blur();};$('resultMenu').onclick=showSelect;
$('restart').onclick=()=>{if(world.ended&&netRole!=='solo')requestRematch();else reset();$('restart').blur();};$('playAgain').onclick=requestRematch;
$('aimButton').onclick=()=>{action('KeyQ');$('aimButton').blur();};
$('training').onclick=()=>{if(netRole!=='solo')return;brawlMode='';world.training=!world.training;$('training').textContent=world.training?'对手：静止练习':'对手：战斗 AI';reset();refreshSelect();};
$('livesMode').onclick=()=>{if(netRole==='guest')return;brawlMode='';world.stock=!world.stock;reset();refreshSelect();};
const pickBrawl=kind=>()=>{if(netRole!=='solo')return;brawlMode=brawlMode===kind?'':kind;if(brawlMode){world.training=false;world.stock=false;$('training').textContent='对手：战斗 AI';}reset();refreshSelect();};
$('brawlMode').onclick=pickBrawl('ffa');$('teamMode').onclick=pickBrawl('team');
$('platformPractice').onclick=()=>{if(netRole!=='solo')return;brawlMode='';world.training=true;$('training').textContent='对手：静止练习';hideSelect();reset();Object.assign(world.fighters[0],{x:0,z:-2.2});Object.assign(world.fighters[1],{x:6,z:3});announce('按空格 · 跳上中央高台');};

// ---- HUD ----
const hudCache=new Map();
let brawlCards=null;
function buildBrawlHud(){
  const root=$('brawlHud');root.innerHTML='';brawlCards=[];
  for(let i=0;i<4;i++){
    const el=document.createElement('div');el.className='bcard';el.style.setProperty('--c',SLOT_COLORS[i]);el.style.gridColumn=i<2?String(i+1):String(i+2);
    el.innerHTML=`<img alt=""><div class="bbody"><div class="bplate"><span></span><b></b></div><div class="bhp"><i class="blag"></i><i class="bfill"></i></div><div class="bfoot"><span class="bpips"><i></i><i></i><i></i></span><small></small></div></div>`;
    root.append(el);
    const q=s=>el.querySelector(s);
    brawlCards.push({el,img:q('img'),name:q('b'),tag:q('.bplate span'),fill:q('.bfill'),lag:q('.blag'),pips:[...q('.bpips').children],sub:q('small'),char:''});
  }
}
function updateBrawlHud(){
  if(!brawlCards)buildBrawlHud();
  world.fighters.forEach((p,i)=>{
    const c=brawlCards[i];if(!c)return;
    if(c.char!==p.char){c.char=p.char;c.name.textContent=CHARACTERS[p.char].name;c.img.src=portraits[p.char]||'';}
    const hp=clamp(p.hp,0,100),key='bc'+i;
    if(hudCache.get(key)!==hp){hudCache.set(key,hp);c.fill.style.width=hp+'%';c.lag.style.width=hp+'%';c.el.classList.toggle('low',hp>0&&hp<=30);c.el.classList.toggle('out',hp<=0);}
    const mate=world.teamMode&&p.team===world.fighters[localPlayerId].team,tag=i===localPlayerId?'YOU':mate?'ALLY':'CPU';if(c.tag.textContent!==tag)c.tag.textContent=tag;
    // Team mode groups each team on its own side of the clock.
    const color=teamColorOf(p)||SLOT_COLORS[i],col=world.teamMode?(p.team===0?1:4)+world.fighters.filter(f=>f.team===p.team&&f.id<p.id).length:(i<2?i+1:i+2),layout=color+col;
    if(c.layout!==layout){c.layout=layout;c.el.style.setProperty('--c',color);c.el.style.gridColumn=String(col);}
    c.pips.forEach((pip,j)=>pip.classList.toggle('on',p.energy>=j+1));
    const fs=fighterStatus(p),sub=hp<=0?'淘汰':p.pendingSkill?'蓄力中':fs.text?fs.text.split(' · ')[0]:p.item?ITEM_NAMES[p.item]:'';
    if(c.sub.textContent!==sub)c.sub.textContent=sub;
  });
}
function setHud(el,prop,value){const key=el.id+prop;if(hudCache.get(key)===value)return;hudCache.set(key,value);if(prop==='text')el.textContent=value;else if(prop==='html')el.innerHTML=value;else el.style.setProperty(prop,value);}
function updateHud(){
  const multi=world.bestOf>1&&!world.stock&&!world.training,need=Math.ceil((world.bestOf||1)/2);
  if(world.brawl)updateBrawlHud();
  else world.fighters.forEach((p,i)=>{
    const k=i?'p2':'p1',hp=clamp(p.hp,0,100);
    setHud($(k+'Fill'),'width',hp+'%');setHud($(k+'Lag'),'width',hp+'%');$(i?'rivalHP':'playerHP').toggleAttribute('data-low',hp>0&&hp<=30);
    const marks=multi?Array.from({length:need},(_,j)=>`<i class="${world.wins[i]>j?'on':''}"></i>`).join(''):world.stock?Array.from({length:3},(_,j)=>`<i class="${p.lives>j?'on':''}"></i>`).join(''):'';
    setHud($(k+'Wins'),'html',marks);
    setHud($(i?'rivalInfo':'playerInfo'),'text',`${combatNumber(hp)} · ${p.item?ITEM_NAMES[p.item]:'空手'}`);
    const cells=$(k+'Gauge').children;for(let j=0;j<3;j++){const f=clamp(p.energy-j,0,1);cells[j].style.setProperty('--f',(f*100).toFixed(0)+'%');cells[j].classList.toggle('full',f>=1);}
    setHud($(k+'Lv'),'text',String(Math.floor(p.energy)));
  });
  if(!world.brawl){updateStatusBadge('playerStatus',world.fighters[0]);updateStatusBadge('rivalStatus',world.fighters[1]);}
  document.body.classList.toggle('brawl',Boolean(world.brawl));$('brawlHud').hidden=!world.brawl;
  const t=$('time');setHud(t,'text',world.training?'∞':String(Math.ceil(world.time)));t.toggleAttribute('data-low',!world.training&&world.time<=10);
  const final=multi&&world.wins[0]===need-1&&world.wins[1]===need-1;
  setHud($('roundLabel'),'text',world.teamMode?'TEAM BATTLE':world.brawl?'FREE-FOR-ALL':world.training?'TRAINING':world.stock?'STOCK ×3':multi?(final?'FINAL ROUND':`ROUND ${world.roundNo}`):'1 ROUND');
  setHud($('p1Tag'),'text',localPlayerId===0?'YOU':'HOST');setHud($('p2Tag'),'text',localPlayerId===1?'YOU':world.online?'FRIEND':world.training?'DUMMY':'CPU');
  const local=world.fighters[localPlayerId],c=characterOf(local);
  setHud($('attackLabel'),'text',`连击 / 移动+J ${c.moveAttack==='shot'?'射击':c.moveAttack==='rush'?'突进拳':c.moveAttack==='shieldBash'?'盾冲':'冲刺斩'}`);
  setHud($('bombLabel'),'text',local.item?(local.item==='sword'?'装备战意水晶':`使用${ITEM_NAMES[local.item]}`):local.carrying?'正举着容器':'先打碎箱子');
  setHud($('skillLabel'),'text',local.pendingSkill?`蓄力 ${local.skillWindup.toFixed(1)}s`:local.energy<1?'能量不足':local.skillCD>0?`${local.skillCD.toFixed(1)}s`:c.skillName);
  $('skillButton').title=`${c.skillName}：L 一级 · Shift+L 二级 · R+L 三级`;
  const status=local.grabbedBy!==null?'被擒抱 · 连按 J/U/I 挣脱':local.grabbedTarget!==null?'已抱住对手 · J 前投 / U 高投':local.carrying?'举着容器 · J前投 / U高投':local.knocked>0?'倒地中':local.blocking?'防御中':local.climbing?'爬梯中':local.poisonTime>0?'中毒 · 禁止闪避':local.virusTime>0?'病毒感染 · 禁止闪避':local.slowTime>0?'冰冻减速 · 禁止闪避':local.terrain==='quicksand'?'陷入流沙 · 减速、跳不高':local.terrain==='ice'?'冰面 · 加速但会打滑':'';
  setHud($('movement'),'text',`${local.climbing?'梯子':local.grounded?(local.support==='ground'?'地面':'高台'):'空中'} · 二段跳 ${local.jumps}/2${status?' · '+status:''}`);
  setHud($('aimButton'),'text',`Q · 朝向辅助：${local.aimAssist===false?'关':'开'}`);
  touchControls?.setState({item:local.item?ITEM_NAMES[local.item]:local.carrying?'投掷':'',aimOn:local.aimAssist!==false,skill:local.pendingSkill?'蓄力中':local.energy<1?'能量不足':local.skillCD>0?'冷却中':'必杀'});
  const voted=world.rematchVotes?.[localPlayerId],otherVoted=world.rematchVotes?.[1-localPlayerId];
  $('playAgain').disabled=netRole!=='solo'&&Boolean(voted);
  setHud($('playAgain'),'text',netRole==='solo'?'再战':voted?'已准备 · 等待朋友':otherVoted?'朋友已准备 · 再战':'准备再战');
  $('restart').disabled=netRole==='guest'&&!world.ended;
  setHud($('livesMode'),'text',world.stock?'三命模式：开':'三命模式：关');setHud($('brawlMode'),'text',world.brawl&&!world.teamMode?'四人乱斗：开':'四人乱斗：关');setHud($('teamMode'),'text',world.teamMode?'2v2 组队：开':'2v2 组队：关');$('brawlMode').disabled=$('teamMode').disabled=netRole!=='solo';$('livesMode').disabled=netRole==='guest';$('training').disabled=netRole!=='solo';$('platformPractice').disabled=netRole!=='solo';
  // "ROUND n" is derived from state so the guest sees the same banner from snapshots.
  const vsOn=world.roundNo===1&&world.intro>1.9&&started&&selectHidden()&&!world.training&&!world.brawl,vs=$('vs');
  if(vsOn&&!vs.classList.contains('show')){world.fighters.forEach((p,i)=>{const c=CHARACTERS[p.char];$('vsP'+(i+1)).src=portraits[p.char]||'';$('vsName'+(i+1)).textContent=c.name;$('vsTitle'+(i+1)).textContent=c.title;});$('vsStage').textContent=`STAGE · ${STAGES[world.stage]?.name||''}`;vs.classList.add('show');tone(330,.3,'square',.04);}
  else if(!vsOn&&vs.classList.contains('show'))vs.classList.remove('show');
  comboState.forEach((c,i)=>{if(world.tick-c.tick>150||world.tick<c.tick)$('combo'+i).classList.remove('show');});
  const key=`${world.round}-${world.roundNo}`;
  if(world.intro>0&&world.intro<=1.85&&started&&selectHidden()&&bannerKey!==key){bannerKey=key;banner(world.teamMode?'TEAM BATTLE<small>READY…</small>':world.brawl?'BRAWL<small>READY…</small>':final?'FINAL ROUND<small>READY…</small>':`ROUND ${world.roundNo}<small>READY…</small>`,'',1.6);tone(440,.2,'triangle');}
}

// ---- Per-frame visuals ----
const tmpFocus=new THREE.Vector3(0,1.2,0);let camDist=20,camOrbit=0;
function updateCamera(dt){
  // Frame every fighter still standing (both in a duel).
  const aspect=innerWidth/innerHeight,live=world.fighters.filter(p=>p.hp>0),framed=live.length?live:world.fighters;
  const xs=framed.map(p=>p.x),zs=framed.map(p=>p.z),ys=framed.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),minY=Math.min(...ys),maxY=Math.max(...ys);
  let fx=(minX+maxX)/2,fz=(minZ+maxZ)/2,fy=1.2+Math.max(0,minY)*.35+Math.max(0,maxY)*.42;
  const spread=Math.hypot(maxX-minX,(maxZ-minZ)*.8);
  const halfH=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),halfW=halfH*aspect;
  let dist=clamp(Math.max((spread/2+5.5)/halfW,((maxZ-minZ)*.5+4.2+maxY*.6)/halfH,16.5),16.5,38);
  fx=clamp(fx,-10.5,10.5);fz=clamp(fz,-6,5);
  const intro=world.roundNo===1&&world.intro>1.8&&started?Math.min(1,(world.intro-1.8)/1.8):0;dist+=intro*9;fy+=intro*1.5;
  if(focusShot&&performance.now()<focusShot.until){fx=focusShot.x;fy=focusShot.y;fz=focusShot.z;dist=focusShot.dist;}else focusShot=null;
  const follow=1-Math.exp(-dt*(focusShot?5:3));tmpFocus.x+=(fx-tmpFocus.x)*follow;tmpFocus.y+=(fy-tmpFocus.y)*follow;tmpFocus.z+=(fz-tmpFocus.z)*follow;
  camDist+=(dist-camDist)*(1-Math.exp(-dt*(focusShot?5:2.4)));
  camOrbit+=(intro*1.25-camOrbit)*(1-Math.exp(-dt*4));
  camera.position.set(tmpFocus.x*.9+Math.sin(camOrbit)*camDist*.89,tmpFocus.y+camDist*.46,tmpFocus.z+Math.cos(camOrbit)*camDist*.89);camera.lookAt(tmpFocus.x,tmpFocus.y,tmpFocus.z-.4);
  if(shake>.002){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=Math.exp(-dt*14);}
}
function animateFighter(p,i,m,dt){
  const c=p.char,facing=Math.atan2(p.fx,p.fz),t=world.tick*STEP;
  const standoff=p.climbing?.4:0;   // the climber hangs a little away from the wall so the body does not sink into the deck
  m.root.position.set(p.x-p.fx*standoff,p.y,p.z-p.fz*standoff);
  let spin=p.skillTime>0&&!p.pendingSkill&&c==='swordsman'?(1-p.skillTime/.4)*Math.PI*4:0;
  // Tripo cook's U is a whirlwind kick: the WHOLE model turns once (the clip keeps the leg out and the torso square), because
  // spinning only the spine inside the clip twists the chest apart.
  if(m.glb?.tripo&&c==='cook'&&p.attackTime>0&&p.attackType==='heavy'){const {phase,contact}=attackPhase(p),k=clamp(phase/contact,0,1);spin=Math.PI*2*k*k*(3-2*k);}
  m.body.rotation.set(0,facing+spin,0);
  const walking=p.grounded&&Math.hypot(p.vx,p.vz)>1;
  m.legs.forEach((leg,j)=>leg.rotation.set(walking?Math.sin(p.walk+j*Math.PI)*.6:!p.grounded?-.4:-.045,0,p.grounded?(j?1:-1)*(walking?.025:c==='brawler'?.105:.065):0));
  const bend=(k,e)=>{m.legs.forEach((leg,j)=>{if(leg.userData.knee)leg.userData.knee.rotation.x=k[j];});m.arms.forEach((arm,j)=>{if(arm.userData.elbow)arm.userData.elbow.rotation.x=e[j];});};
  {const run0=p.running?1.5:.9;bend(walking?[0,1].map(j=>Math.max(0,-Math.cos(p.walk+j*Math.PI))*run0+.08):[.085,.085],walking?[0,1].map(j=>-(p.running?.95:.3)-Math.max(0,Math.sin(p.walk+j*Math.PI))*.25):[-.3,-.38]);}
  m.arms[0].rotation.set(walking?-Math.sin(p.walk)*.5:-.16,0,-.13);
  const ranged=CHARACTERS[c].moveAttack==='shot';
  m.arms[1].rotation.set(c==='brawler'?-.9:-.34,0,.14);
  if(c==='brawler'&&!walking){m.arms[0].rotation.x=-1;m.arms[0].rotation.z=.35;m.arms[1].rotation.z=-.35;}
  if(ranged&&!walking)m.arms[1].rotation.set(c==='gunner'?-1.1:-.8,0,-.1);
  if(p.running&&walking&&p.attackTime<=0){m.arms[0].rotation.set(.95,0,.25);m.arms[1].rotation.set(.95,0,-.25);m.legs.forEach((leg,j)=>leg.rotation.x=Math.sin(p.walk+j*Math.PI)*1.05);}
  if(!walking&&p.grounded&&p.knocked<=0&&p.hp>0)poseStance(m,c);
  poseCombat(m,p,world.tick);
  let bodyY=walking?Math.abs(Math.sin(p.walk))*.07:Math.sin(t*2.5+i)*.02,lean=walking?(p.running?-.4:-.12):0,roll=0,pitch=0,squash=1;
  if(p.grabbedBy!==null){const s=Math.sin(world.tick*.2)*.18;m.arms[0].rotation.x=-1.9+s;m.arms[1].rotation.x=-1.9-s;m.legs.forEach((leg,j)=>leg.rotation.x=(j===0?-.65:.65)+s);roll=1.15;}
  else{
    roll=p.knocked>0?-.9:p.hurtTime>0?-.2:p.stun>0?-.24:0;pitch=p.knocked>0?0:lean+(!p.grounded?-.08:0);
    squash=p.hurtTime>0?1.04+Math.sin(world.tick*.8)*.025:(p.landTime||0)>0?1-(p.landTime/.2)*.12:1;
    const air=(m.air??={pose:null,flip:0,jumps:0});
    if(p.jumps===2&&air.jumps!==2&&!p.grounded){air.flip=.001;ringEffect({x:p.x,y:p.y+.08,z:p.z},'#ffffff',1.15,.3);ringEffect({x:p.x,y:p.y+.14,z:p.z},'#bfe8ff',.7,.22);dust(p.x,p.y-.15,p.z,6,.9);}
    air.jumps=p.jumps;
    if(!p.grounded&&!p.attackTime&&!p.skillTime){
      // Pose targets per phase: takeoff stretch -> rising tuck -> apex float -> falling brace. Values are eased so nothing snaps.
      const vy=p.vy,rise=clamp(vy/9,-1,1),side=Math.sin(i*1.7)>0?1:-1;
      let T;
      if(vy>7)T=[-.25,.35,.15,.1,-.6*side,.3,-.6*side,-.3,-.25,-.25];             // stretch off the ground, arms swing up
      else if(vy>1.5)T=[-.95*side,.25*side,1.25,.7,-2.1,.55,-1.5,-.5,-.55,-.7];   // knee drive, one arm reaching up
      else if(vy>-2.5)T=[-.75,-.55,1.35,1.2,-.45,1.15,-.45,-1.15,-.7,-.7];        // apex: tucked, arms spread for balance
      else T=[-.3*side,.2*side,.25,.45,-.3,.95+Math.min(.5,-vy*.03),-.3,-.95-Math.min(.5,-vy*.03),-.35,-.35]; // falling: legs brace for the landing
      air.pose??=T.slice();
      const k=1-Math.exp(-dt*(vy>7?22:12));for(let n=0;n<T.length;n++)air.pose[n]+=(T[n]-air.pose[n])*k;
      const q=air.pose;
      m.legs[0].rotation.x=q[0];m.legs[1].rotation.x=q[1];
      m.arms[0].rotation.set(q[4],0,-q[5]);m.arms[1].rotation.set(q[6],0,-q[7]);
      bend([q[2],q[3]],[q[8],q[9]]);
      pitch+=rise*-.12;
    }else if(p.grounded){air.pose=null;air.flip=0;}
    // double jump: no somersault, just a second push off thin air - legs kick down then tuck, arms sweep down and back up
    if(air.flip>0&&!p.grounded&&p.knocked<=0){air.flip+=dt;const f=Math.min(1,air.flip/.32),push=Math.sin(Math.min(1,f*1.6)*Math.PI);if(!p.attackTime&&!p.skillTime){bend([.3+push*.9,.9-push*.5],[-.5,-.5]);m.legs[0].rotation.x=-.2-push*.5;m.legs[1].rotation.x=.25+push*.35;m.arms[0].rotation.set(.5-f*2.4,0,-.6);m.arms[1].rotation.set(.5-f*2.2,0,.6);}pitch+=Math.sin(f*Math.PI)*.12;if(air.flip>.32)air.flip=0;}
    // landing: absorb with the knees, drop the hips, arms come forward, then straighten
    if(p.grounded&&(p.landTime||0)>0&&!p.attackTime&&!p.skillTime&&!p.blocking){const k=Math.sin(clamp(p.landTime/.2,0,1)*Math.PI*.5);bend([1.2*k,1.05*k],[-.5*k,-.5*k]);m.legs[0].rotation.x=-.65*k;m.legs[1].rotation.x=-.5*k;m.arms[0].rotation.set(-.6*k,0,-.3*k);m.arms[1].rotation.set(-.5*k,0,.3*k);bodyY-=.34*k;pitch+=.16*k;}
  }
  if(p.throwTime>0){const follow=1-p.throwTime/.3;m.arms[0].rotation.x=m.arms[1].rotation.x=-2.65+follow*(p.throwHigh?1.1:2.3);roll=-Math.sin(follow*Math.PI)*.25;}
  if(p.pendingSkill){squash=.88;bodyY=-.04;m.arms[0].rotation.set(c==='guardian'?-1.5:-.9,0,.3);m.arms[1].rotation.set(-2.5,0,-.35);if(c==='gunner'||c==='stormcaller'){m.arms[1].rotation.set(-2.9,0,-.1);}}
  if(p.thrownTime>0&&!p.grounded&&p.grabbedBy===null){roll=-.9-(.65-p.thrownTime)*Math.PI*2;m.legs[0].rotation.x=-.8;m.legs[1].rotation.x=.7;}
  const beerActive=p.attackBoostTime>0&&p.weapon!=='sword';if(beerActive&&!p.recoveryTime)pitch+=Math.sin(t*3.4+i)*.035;
  // Round outcome poses: loser lies on the deck, winner raises a fist.
  if(p.hp<=0&&p.grounded){pitch=-1.45;roll=0;bodyY=.25;}
  else if(world.roundOver>0&&world.roundWinner===i&&p.grounded&&p.knocked<=0){m.arms[1].rotation.set(-2.9,0,-.25);m.arms[0].rotation.set(-.2,0,.5);bodyY=Math.abs(Math.sin(t*6))*.12;roll=0;pitch=0;}
  // ---- Life in the pose: breathing, wind-up and follow-through, jump stretch, trailing hair and cloth ----
  const speedNow=Math.hypot(p.vx,p.vz),calm=p.grounded&&p.attackTime<=0&&!p.blocking&&p.skillTime<=0&&!p.pendingSkill&&p.knocked<=0&&p.stun<=0&&p.grabbedBy===null&&!p.carrying&&p.grabbedTarget===null&&p.hp>0;
  if(calm&&!walking){
    const br=Math.sin(t*2.3+i*1.3);
    squash*=1+br*.013;m.arms[0].rotation.x+=br*.05;m.arms[1].rotation.x+=Math.sin(t*2.3+i*1.3+.6)*.05;m.arms[0].rotation.z+=Math.sin(t*1.7+i)*.03;
    roll+=Math.sin(t*.9+i*2)*.018;      // slow weight shift
  }
  let leanZ=0;
  if(p.attackTime>0&&['light','dash','air','rush','heavy','upper','slam','shieldBash'].includes(p.attackType)){
    const total=['heavy','slam','upper','shieldBash'].includes(p.attackType)?.5:p.attackType==='rush'?.4:p.attackType==='dash'?.38:.34,sw2=clamp(1-p.attackTime/total,0,1);
    // wind up (crouch back), snap forward, then hold the recovery a beat
    // The articulated waist supplies most of the strike motion. Keep grounded
    // feet steady instead of tipping the whole rig around its floor origin.
    const whole=p.grounded?.18:1;
    if(sw2<.3){const k=sw2/.3;pitch-=k*.16*whole;leanZ=-k*.16;squash*=1-k*.015;}
    else if(sw2<.62){const k=(sw2-.3)/.32;pitch+=Math.sin(k*Math.PI)*.3*whole;leanZ=-.16+k*.42;squash*=.985+k*.025;}
    else{const k=(sw2-.62)/.38;pitch+=(1-k)*.12*whole;leanZ=(1-k)*.26;}
  }
  if(!p.grounded&&p.knocked<=0&&p.grabbedBy===null){const st2=clamp(Math.abs(p.vy)*.0075,0,.09);squash*=p.vy>0?1+st2:1-st2*.4;}
  const xz=1/Math.sqrt(Math.max(.5,squash));
  const tremble=world.hitStop>0&&(p.hurtTime>0||p.knocked>0)&&p.hp>0?.05:0;
  m.body.rotation.x=pitch;m.body.rotation.z=roll;m.body.scale.set(xz,squash,xz);
  if(leanZ&&!p.recoveryTime)m.body.position.z=leanZ*.55;
  {
    const back=clamp(speedNow*.045,0,.55)+(!p.grounded?(p.vy>2?-.22:p.vy<-2?.3:0):0);
    for(const w of m.sway||[])w.o.rotation[w.ax]=w.base+Math.sin(t*(3+w.ph)+w.ph*2)*w.amp*(.55+Math.min(1,speedNow/6))+(w.ax==='x'?back*w.drag:0);
  }
  if(p.recoveryTime>0){const a=(1-p.recoveryTime/.22)*Math.PI*2;m.body.rotation.x=a;m.body.rotation.z=0;m.body.position.set(0,1.3*(1-Math.cos(a)),-1.3*Math.sin(a));}else m.body.position.set(tremble?(Math.random()-.5)*tremble*2:0,bodyY-(p.sink||0)*.45,tremble?(Math.random()-.5)*tremble*2:0);
  driveGlb(m,p,dt,walking);
  if(m.glb?.tripo){
    // IK already supplies hip compression and planted feet. Procedural whole-
    // body bobbing/squash would move those planted boots through the deck.
    if(p.grounded&&p.hp>0&&p.knocked<=0&&p.hurtTime<=0&&!p.recoveryTime){m.body.position.y=-(p.sink||0)*.45;m.body.scale.set(1,1,1);m.body.rotation.x=0;m.body.rotation.z=0;}
    // Picking the power-up up already warms the blade (pulsing); equipping it turns the whole blade molten gold.
    const swordEquipped=p.weapon==='sword',swordHeld=p.item==='sword',pulse=.5+.5*Math.sin(world.tick*.12);
    for(const material of m.glb.tripoSwordMaterials){material.emissive.set(swordEquipped?'#ffad12':swordHeld?'#ffd27a':'#000000');material.emissiveIntensity=swordEquipped?.75+.25*pulse:swordHeld?.25+.3*pulse:0;}
    const buckler=m.glb.root.getObjectByName('TripoBuckler');if(buckler)buckler.visible=!(world.shots||[]).some(sh=>sh.owner===p.id&&sh.style==='shield');   // the shield is in the air
    for(const material of m.glb.tripoAuraMaterials){material.emissive.set(swordEquipped||swordHeld?'#ff9a10':'#000000');material.emissiveIntensity=swordEquipped?.22+.08*pulse:swordHeld?.1+.1*pulse:0;}
  }
  // Held by a Tripo fighter: lie on his back across the holder's shoulders, resting on the head, like the
  // crate. The core keeps the opponent chest-high in front of the holder; this is a visual-only override.
  // The blend eases in when picked up and, importantly, eases OUT when thrown: the core launches the
  // opponent from chest height, so without it he would pop from the head to the chest as he flies off.
  const holderIndex=p.grabbedBy!==null&&p.hp>0?world.fighters.findIndex(q=>q.id===p.grabbedBy):-1;
  if(holderIndex>=0&&models[holderIndex]?.glb?.tripo)m.heldBy=holderIndex;
  const holderModel=m.heldBy!==undefined?models[m.heldBy]:null;
  m.heldBlend=holderIndex>=0&&holderModel?.glb?.tripo?Math.min(1,(m.heldBlend||0)+dt/.1):Math.max(0,(m.heldBlend||0)-dt/.22);
  if(m.heldBlend>0&&holderModel?.glb?.tripo){
    const h=world.fighters[m.heldBy],k=m.heldBlend*m.heldBlend*(3-2*m.heldBlend);
    const lying=new THREE.Euler(-Math.PI/2+Math.sin(world.tick*.2)*.05,Math.atan2(h.fx,h.fz)+Math.PI/2,Math.sin(world.tick*.17)*.06,'YXZ');
    const from=m.body.rotation.clone();
    m.body.rotation.set(from.x+(lying.x-from.x)*k,from.y+(lying.y-from.y)*k,from.z+(lying.z-from.z)*k);
    const centre=new THREE.Vector3(0,HELD_BODY_CENTRE,0).applyQuaternion(new THREE.Quaternion().setFromEuler(lying));
    const over=new THREE.Vector3(h.x-centre.x,h.y+tripoCarryHeight(holderModel.glb.root.scale.y,holderModel.glb.tripoCfg.carryBottom)+HELD_BODY_THICKNESS/2-centre.y,h.z-centre.z);
    m.root.position.lerp(over,k);
    m.body.position.multiplyScalar(1-k);
  }
  m.syncSurface();
  updateGuard(m.guard,p.blocking&&p.hp>0,t,dt,guardHits.delete(p.id));
  m.body.visible=!(p.invuln>0&&p.hp>0&&p.grabbedBy===null&&Math.floor(world.tick/6)%2===0);   // a held fighter keeps the grab's invulnerability but must not flicker
  m.poisonFx.visible=p.poisonTime>0;m.poisonBubbles.forEach((b,j)=>{b.position.x=Math.cos(b.userData.a+t*(1.5+j*.08))*b.userData.r;b.position.z=Math.sin(b.userData.a+t*(1.5+j*.08))*b.userData.r;b.position.y=.35+((b.userData.y+t*(.55+j*.04))%2.25);b.scale.setScalar(.8+Math.sin(t*7+j)*.25);});
  m.virusFx.visible=p.virusTime>0;m.virusFx.rotation.y=-t*2.2;m.virusNodes.forEach((n,j)=>{n.position.y=n.userData.y+Math.sin(t*9+j)*.13;n.rotation.x+=dt*(2+j*.2);n.rotation.y+=dt*3;n.scale.setScalar(.8+Math.abs(Math.sin(t*8+j))*.65);});
  m.iceFx.visible=p.slowTime>0;m.iceShards.forEach((s,j)=>{s.material.opacity=.55+Math.sin(t*6+j)*.2;s.scale.setScalar(.92+Math.sin(t*5+j)*.08);});
  m.faceFlush.material.opacity=beerActive?.15+Math.sin(t*5)*.035:0;m.blushCheeks.forEach((b,j)=>{b.material.opacity=beerActive?.48+Math.sin(t*6+j)*.1:0;});
  m.burnFx.visible=p.burnTime>0;m.smoke.forEach((s,j)=>{s.position.y=s.userData.y+((1.25-p.burnTime)*(.65+j*.05))%1.4;s.position.x=Math.cos(s.userData.a+t*1.8)*(.4+j*.025);s.material.opacity=Math.min(.8,p.burnTime*.65)*(j%2?.55:1);});
  const armed=p.item==='sword'||p.weapon==='sword',swordActive=p.weapon==='sword';m.weaponGlow.material.opacity=armed?(swordActive?.9:.3):0;m.swordTrail.material.opacity=swordActive?.34+Math.abs(Math.sin(t*10))*.24:0;m.swordSparks.forEach((s,j)=>{const travel=(t*.9+s.userData.phase)%1;s.position.y=.18+travel*1.25;s.position.x=Math.sin(t*12+j)*.13;s.material.opacity=swordActive?(1-travel)*.95:0;});
  m.ring.visible=p.hp>0;m.ring.scale.setScalar(1+Math.sin(t*6+i)*.05);m.tag.visible=p.hp>0;
  const st=fxState[i],speed=Math.hypot(p.vx,p.vz);
  if(p.grounded&&!st.grounded&&(p.landVy||0)<-7)dust(p.x,p.y,p.z,7,1.1);
  if(p.grounded&&!st.grounded&&(p.landVy||0)<-3.5&&p.hp>0)audio.play('land',{x:p.x,power:Math.min(1,-(p.landVy||0)/16)});
  if(!p.grounded&&st.grounded&&p.vy>4&&p.knocked<=0&&p.grabbedBy===null)audio.play(p.jumps>=2?'airJump':'jump',{x:p.x});
  st.grounded=p.grounded;st.t-=dt;
  if(p.terrain==='hotspring'&&p.hp>0&&p.hp<100){st.spa=(st.spa||0)-dt;if(st.spa<=0){st.spa=.3;particles({x:p.x+(Math.random()-.5)*.6,y:p.y+.4,z:p.z+(Math.random()-.5)*.6},'#9dffb0',1);}}
  if(st.t<=0){if(p.terrain==='quicksand'&&walking){dust(p.x,p.y,p.z,1,.4);st.t=.18;}else if(p.terrain==='ice'&&speed>4){particles({x:p.x,y:p.y+.1,z:p.z},'#e8f8ff',2);st.t=.07;}else if(p.running&&p.grounded&&speed>6){dust(p.x-p.fx*.4,p.y,p.z-p.fz*.4,2,.5);st.t=.09;}else if(p.knocked>0&&!p.grounded&&speed+Math.abs(p.vy)>7){streak(p);st.t=.04;}}
  // Afterimages while dashing, sprinting, dodging or being spiked: a fading silhouette of the current pose every few frames.
  st.ghost=(st.ghost||0)-dt;
  const rushing=(p.running&&p.grounded&&speed>6)||(p.attackTime>0&&['dash','rush','shieldBash'].includes(p.attackType)&&speed>7)||p.dodgeTime>0||p.spiked||(p.recoveryTime>0);
  if(rushing&&st.ghost<=0&&p.hp>0){st.ghost=.045;ghost(m,p);}
  updateFace(p,i,m,dt);
  const warning=chargeModels[i];warning.root.visible=Boolean(p.pendingSkill)&&!world.ended;
  if(p.pendingSkill){const s=p.pendingSkill,progress=1-p.skillWindup/s.windup,cx=s.cx??p.x,cz=s.cz??p.z,self=s.kind==='whirlwind'||s.kind==='shieldQuake';warning.root.position.set(self?p.x:cx,p.y,self?p.z:cz);warning.edge.scale.setScalar(s.radius);warning.fill.scale.setScalar(s.radius*Math.max(.05,progress));warning.fill.material.opacity=.12+progress*.16;for(const [kind,tag] of Object.entries(warning.tags))tag.visible=kind===s.kind;}
}
// ---- Telegraphing: lane warnings, visible launchers and edge alerts for shots that come from outside the arena ----
const warnings=[],alertsEl=()=>$('alerts');
const laneTextures=new Map();
function laneTexture(kind){
  if(laneTextures.has(kind))return laneTextures.get(kind);
  const c=document.createElement('canvas');c.width=128;c.height=64;const g=c.getContext('2d');
  g.strokeStyle=kind==='snowball'?'#ffffff':'#fff3a0';g.lineWidth=11;g.lineJoin='miter';g.beginPath();g.moveTo(88,8);g.lineTo(38,32);g.lineTo(88,56);g.stroke();
  const t=new THREE.CanvasTexture(c);t.wrapS=THREE.RepeatWrapping;t.repeat.set(9,1);t.colorSpace=THREE.SRGBColorSpace;laneTextures.set(kind,t);return t;
}
function cannonLauncher(side,z){
  const g=new THREE.Group();g.position.set(side*15.7,.95,z);g.rotation.y=side>0?-Math.PI/2:Math.PI/2;
  const barrel=cylinder(.4,.5,2.1,'#2b2f36',g,0,.1,.5);barrel.rotation.x=Math.PI/2;
  cylinder(.55,.55,.22,'#3a3f48',g,0,.1,-.55).rotation.x=Math.PI/2;
  for(const wx of [-.6,.6]){const wheel=cylinder(.55,.55,.18,'#6b4128',g,wx,-.35,0,14);wheel.rotation.z=Math.PI/2;}
  box(1.1,.3,1.6,'#5a3622',g,0,-.4,0);
  const glow=new THREE.Mesh(new THREE.SphereGeometry(.42,12,10),new THREE.MeshBasicMaterial({color:'#ff7a2a',transparent:true,opacity:0,depthWrite:false}));glow.position.set(0,.1,1.6);g.add(glow);
  ink(g,.05);scene.add(g);
  const crew=crewMate('sailor');crew.position.set(side*14.9,.15,z+2);crew.rotation.y=g.rotation.y;scene.add(crew);
  return {g,glow,barrel,crew};
}
function snowmanLauncher(side,z){
  const g=new THREE.Group();g.position.set(side*15.1,0,z);g.rotation.y=side>0?-Math.PI/2:Math.PI/2;
  const crew=crewMate('islander');crew.position.set(0,0,0);g.add(crew);
  const ball=sphere(1,'#ffffff',g,0,.75,1.5,14);
  ink(g,.05);scene.add(g);return {g,crew,lean:crew,ball};
}
function removeLauncher(l){
  for(const root of [l.g,l.crew])if(root&&root.parent===scene){scene.remove(root);root.traverse(o=>{if(!o.userData.ink){o.geometry?.dispose();}if(o.material&&!isSharedMaterial(o.material)&&o.material.side!==THREE.BackSide)o.material.dispose();});}
}
function startHazardWarning(e){
  const cannon=e.kind==='cannon',side=e.side,dir=-side;
  const lane=new THREE.Group();lane.position.set(0,.12,e.z);
  const base=new THREE.Mesh(new THREE.PlaneGeometry(31,2.5),new THREE.MeshBasicMaterial({color:cannon?'#ff4a2a':'#ff3b3b',transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));base.rotation.x=-Math.PI/2;lane.add(base);
  const tex=laneTexture(e.kind).clone();tex.needsUpdate=true;tex.wrapS=THREE.RepeatWrapping;tex.repeat.set(dir<0?9:-9,1);
  const chev=new THREE.Mesh(new THREE.PlaneGeometry(31,2.3),new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide}));chev.rotation.x=-Math.PI/2;chev.position.y=.01;lane.add(chev);
  for(const dz of [-1.25,1.25]){const edge=new THREE.Mesh(new THREE.PlaneGeometry(31,.09),new THREE.MeshBasicMaterial({color:'#ff3b2a',transparent:true,opacity:.9,depthWrite:false}));edge.rotation.x=-Math.PI/2;edge.position.set(0,.02,dz);lane.add(edge);}
  scene.add(lane);
  const launcher=cannon?cannonLauncher(side,e.z):snowmanLauncher(side,e.z);
  const el=document.createElement('div');el.className='alert '+(cannon?'':'snow ')+(side>0?'right':'left');el.innerHTML=`<b>!</b><span class="arrow">${side>0?'◀':'▶'}</span><span class="bar"><i></i></span>`;alertsEl().append(el);
  warnings.push({id:e.id,kind:e.kind,side,z:e.z,delay:e.delay,t:0,lane,base,chev,tex,launcher,el,beeps:0,fired:false,after:0,spark:0});
  announce(cannon?'船员点燃了大炮！这一条线要中弹，横向躲开或跳起来':'岛民在搓雪球要扔了！横向躲开或跳起来');tone(760,.12,'square',.05);
}
function updateWarnings(dt){
  for(let i=warnings.length-1;i>=0;i--){
    const w=warnings[i];w.t+=dt;const k=Math.min(1,w.t/w.delay),left=w.delay-w.t,cannon=w.kind==='cannon';
    // Fired: either the shot has left (event) or the timer ran out. The launcher hangs around a moment for its recoil.
    if(!w.fired&&(left<=0||!(world.cannonballs||[]).some(c=>c.id===w.id&&c.delay>0))){w.fired=true;w.after=0;w.el.remove();w.lane.visible=false;
      if(cannon){starBurst({x:w.side*14.2,y:1.2,z:w.z},2,'#ffe27a',0,.2);for(let j=0;j<5;j++){const puff=fxMesh(smokeGeo,'#6a6c76',scene,w.side*14+(Math.random()-.5)*.6,1.1,w.z+(Math.random()-.5)*.6,.6,false);effects.push({m:puff,life:.8,max:.8,smoke:.5,keepGeo:true,v:new THREE.Vector3(-w.side*1.5,.5,(Math.random()-.5)*.6)});}shakeCam(.12);}
      else{dust(w.side*14.6,0,w.z,8,1.6);particles({x:w.side*14.6,y:.8,z:w.z},'#ffffff',10);}}
    if(w.fired){
      w.after+=dt;const r=Math.min(1,w.after/.5);
      if(cannon){w.launcher.g.position.x=w.side*(15.7+Math.sin(r*Math.PI)*.7);poseCannonCrew(w.launcher.crew,1,world.tick*STEP,true,w.after);}
      else{w.launcher.ball.visible=false;poseSnowCrew(w.launcher.crew,1,world.tick*STEP,true,w.after);}
      if(w.after>1.5){removeLauncher(w.launcher);scene.remove(w.lane);w.lane.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});w.tex.dispose();warnings.splice(i,1);}
      continue;
    }
    // Lane: pulses faster as the shot gets close, chevrons run the way the shot will travel.
    w.tex.offset.x+=dt*(.8+k*2.2);
    w.base.material.opacity=.16+.16*Math.abs(Math.sin(w.t*(4+k*10)));w.chev.material.opacity=.45+.4*k;
    // Launcher winds up: cannon glows and trembles, the snowman leans back and rocks the ball.
    if(cannon){poseCannonCrew(w.launcher.crew,k,w.t,false,0);const shake=Math.sin(w.t*40)*.03*k;w.launcher.g.position.z=w.z+shake;w.launcher.glow.material.opacity=.25+.7*k*Math.abs(Math.sin(w.t*(6+k*14)));w.launcher.glow.scale.setScalar(.6+k*.7);
      w.spark-=dt;if(w.spark<=0){w.spark=.07;const m=fxMesh(shardGeo,'#ffd066',scene,w.side*16.4,1.4,w.z+(Math.random()-.5)*.3,1,true);m.scale.setScalar(.09);effects.push({m,life:.35,max:.35,chunk:true,keepGeo:true,v:new THREE.Vector3(-w.side*.6,1.6+Math.random(),(Math.random()-.5)),spin:new THREE.Vector3(4,6,2),floor:-5});}}
    else{poseSnowCrew(w.launcher.crew,k,w.t,false,0);w.launcher.ball.scale.setScalar(.3+.5*k);w.launcher.ball.rotation.z-=dt*6*(1+k*3);const lift=Math.max(0,(k-.7)/.3);w.launcher.ball.position.set(0,.3+.4*k+lift*1.9,1.5-lift*.9);}
    // Beeps quicken toward the launch.
    const marks=[.35,.6,.78,.9];while(w.beeps<marks.length&&k>=marks[w.beeps]){audio.play('warn',{k:w.beeps+1.5,x:w.side*14});w.beeps++;}
    // Edge alert follows the launcher on screen.
    const v=new THREE.Vector3(w.side*14.6,1.4,w.z).project(camera);
    let x=(v.x*.5+.5)*innerWidth,y=(-v.y*.5+.5)*innerHeight;
    x=clamp(x,58,innerWidth-58);y=clamp(y,110,innerHeight-Math.min(200,innerHeight*.3));
    const pulse=1+.12*Math.sin(w.t*(6+k*12));w.el.style.transform=`translate(${x.toFixed(0)}px,${y.toFixed(0)}px) scale(${(pulse*(1+k*.3)).toFixed(2)})`;
    w.el.classList.toggle('soon',left<.6);w.el.querySelector('.bar i').style.setProperty('--w',(100*(1-k)).toFixed(0)+'%');
  }
}
function clearWarnings(){for(const w of warnings){w.el.remove();removeLauncher(w.launcher);scene.remove(w.lane);}warnings.length=0;}
// ---- Where a thrown bomb or bottle is going to land: corner brackets shrink onto the spot ----
const landMarks=new Map();
function landMarker(kind){
  const g=new THREE.Group(),color=kind==='bomb'?'#ff5a3a':kind==='poison'?'#5fe07a':kind==='virus'?'#b66cff':'#6db9ff';
  const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide});
  for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,corner=new THREE.Group();corner.position.set(Math.cos(a),0,Math.sin(a));corner.rotation.y=-a+Math.PI/4;
    const h=new THREE.Mesh(new THREE.PlaneGeometry(.55,.12),mat),v=h.clone();h.rotation.x=v.rotation.x=-Math.PI/2;h.position.set(-.2,0,0);v.rotation.z=Math.PI/2;v.position.set(0,0,.2);corner.add(h);g.add(corner);}
  const cross=new THREE.Mesh(new THREE.PlaneGeometry(.75,.12),mat),cross2=cross.clone();cross.rotation.x=cross2.rotation.x=-Math.PI/2;cross.rotation.z=Math.PI/4;cross2.rotation.z=-Math.PI/4;g.add(cross,cross2);
  g.userData={mat};scene.add(g);return g;
}
function updateLandMarks(dt){
  const live=new Set();
  for(const b of world.bombs||[]){
    live.add(b.id);let g=landMarks.get(b.id);if(!g){g=landMarker(b.kind);landMarks.set(b.id,g);}
    const hit=predictBomb(world,b),radius=b.kind==='bomb'?3:b.kind==='virus'?2.8:b.kind==='slow'?2.4:2.2;
    g.position.set(hit.x,hit.y+.14,hit.z);const near=Math.max(0,Math.min(1,hit.time/1.2));g.scale.setScalar(radius*(.62+.38*near));g.rotation.y+=dt*1.6;
    g.userData.mat.opacity=.55+.4*Math.abs(Math.sin(world.tick*.25));
  }
  for(const [id,g] of landMarks)if(!live.has(id)){scene.remove(g);g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});g.userData.mat.dispose();landMarks.delete(id);}
}
// ---- Facial expressions: each state of the fight picks eyes, brows and mouth; eyes blink and follow the nearest rival ----
const faceStates=[0,1,2,3].map(()=>({blinkT:1+Math.random()*3,blinking:0}));
function updateFace(p,i,m,dt){
  if(!m.face)return;const fs=faceStates[i],base=m.expr||{};
  let eyes='open',mouth=base.mouth||'smile',lid=0,tilt=0,raise=0,sweat=false,vein=false,calm=false;
  const sick=p.poisonTime>0||p.virusTime>0||p.slowTime>0,winner=(world.roundOver>0&&world.roundWinner===i)||(world.ended&&world.winner===i&&world.winner!==null);
  const loser=((world.roundOver>0&&world.roundWinner!==null&&world.roundWinner!==i)||(world.ended&&world.winner!==null&&world.winner!==i))&&p.hp>0;
  if(p.hp<=0){eyes='ko';mouth='tongue';tilt=-.6;}
  else if(winner){eyes='happy';mouth='open';raise=1;}
  else if(p.grabbedBy!==null){eyes='hurt';mouth='shout';tilt=-.8;sweat=true;}
  else if(p.knocked>0&&!p.grounded){eyes='hurt';mouth='shout';tilt=-.7;}
  else if(p.knocked>0){eyes='daze';mouth='o';tilt=-.4;sweat=true;}
  else if(p.hurtTime>0||p.stun>.1){eyes='hurt';mouth=p.hurtKind==='bomb'||p.burnTime>0?'o':'shout';tilt=-.5;}
  else if(p.pendingSkill||p.skillTime>0){eyes='wide';mouth='grit';tilt=1;vein=true;}
  else if(p.blocking){lid=.28;mouth='grit';tilt=1;}
  else if(p.attackTime>0){lid=.3;tilt=1;mouth=p.attackTime<.2?'shout':'grit';}
  else if(p.dodgeTime>0||p.running){lid=.22;tilt=.5;mouth='flat';}
  else if(p.carrying||p.grabbedTarget!==null){lid=.2;tilt=.9;mouth='grit';}
  else if(sick){lid=.45;tilt=-.6;mouth='frown';sweat=true;}
  else if(loser){lid=.35;tilt=-.8;mouth='frown';sweat=true;}
  else if(p.hp<=30){tilt=-.5;mouth='frown';sweat=true;lid=.1;}
  else if(p.attackBoostTime>0&&p.weapon!=='sword'){lid=.4;mouth='open';raise=.4;}
  else{calm=true;raise=.15*Math.sin(world.tick*STEP*.6+i);}
  // blink now and then while the eyes are open
  fs.blinkT-=dt;if(fs.blinkT<=0&&fs.blinking<=0&&eyes==='open'){fs.blinking=.15;fs.blinkT=2+Math.random()*3.2;}
  if(fs.blinking>0){fs.blinking=Math.max(0,fs.blinking-dt);if(eyes==='open')lid=Math.max(lid,Math.sin(Math.PI*(1-fs.blinking/.15)));}
  // eyes follow the closest rival
  let gx=0,gy=0;
  if(calm||lid<.5){
    let foe=null,bd=1e9;for(const q of world.fighters){if(q===p||q.hp<=0||(world.teamMode&&q.team===p.team))continue;const d=Math.hypot(q.x-p.x,q.z-p.z);if(d<bd){bd=d;foe=q;}}
    if(foe&&bd>.01){const th=Math.atan2(p.fx,p.fz),dx=foe.x-p.x,dz=foe.z-p.z,rx=dx*Math.cos(th)-dz*Math.sin(th);gx=clamp(rx/Math.max(1.5,bd)*1.6,-1,1);gy=clamp((foe.y-p.y)/Math.max(1.5,bd)*2,-1,1);}
  }
  m.face.update({lid,tilt,raise,gx,gy,eyes,mouth,sweat,vein},dt);
}
// ---- Afterimage silhouettes ----
const ghosts=[];
function ghost(m,p){
  if(ghosts.length>=26)return;
  const color=CHARACTERS[p.char].accent,wrap=new THREE.Group();
  wrap.position.copy(m.root.position);
  const body=m.body.clone(true);
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.5,depthWrite:false});
  // A silhouette must keep the captured pose instead of sharing live limb bones.
  m.body.updateWorldMatrix(true,true);
  const sources=[],copies=[],baked=[];
  m.body.traverse(o=>{if(o.isSkinnedMesh&&!o.userData.ink)sources.push(o);});
  body.traverse(o=>{if(o.isSkinnedMesh&&!o.userData.ink)copies.push(o);});
  for(let i=0;i<sources.length;i++){
    const source=sources[i],copy=copies[i],geometry=freezeSkinnedGeometry(source);
    const fixed=new THREE.Mesh(geometry,material);fixed.position.copy(copy.position);fixed.quaternion.copy(copy.quaternion);fixed.scale.copy(copy.scale);copy.parent.add(fixed);copy.parent.remove(copy);baked.push(geometry);
  }
  body.traverse(o=>{if(o.isMesh){if(o.userData.ink||(o.material&&o.material.side===THREE.BackSide)){o.visible=false;return;}o.material=material;o.castShadow=false;}});
  body.visible=true;wrap.add(body);scene.add(wrap);ghosts.push({wrap,material,baked,life:.28,max:.28});
}
function updateGhosts(dt){
  for(let i=ghosts.length-1;i>=0;i--){const g=ghosts[i];g.life-=dt;if(g.life<=0){scene.remove(g.wrap);g.material.dispose();g.baked.forEach(x=>x.dispose());ghosts.splice(i,1);continue;}g.material.opacity=.42*g.life/g.max;g.wrap.scale.setScalar(1+(1-g.life/g.max)*.05);}
}
function clearGhosts(){for(const g of ghosts){scene.remove(g.wrap);g.material.dispose();g.baked.forEach(x=>x.dispose());}ghosts.length=0;}
function updateVisuals(dt){
  ensureStage();audio.music(started&&stage?stage.id:'menu');{const low=Math.min(...world.fighters.filter(f=>f.hp>0).map(f=>f.hp),100),clock=!world.training&&world.time<=15?(15-world.time)/15:0;audio.setTension(started&&!world.ended?Math.max(clock*.8,low<30?(30-low)/30*.9:0):0);}ensureModels();syncPieces();updateGhosts(dt);updateWarnings(dt);updateLandMarks(dt);
  world.fighters.forEach((p,i)=>animateFighter(p,i,models[i],dt));
  world.fighters.forEach((p,i)=>skillAura(p,models[i],dt));
  for(const b of world.bombs){let g=bombModels.get(b.id);if(!g){g=new THREE.Group();const bottle=b.kind==='poison'||b.kind==='virus'||b.kind==='slow';if(bottle){const color=b.kind==='virus'?'#8d55bd':b.kind==='slow'?'#4c9ee8':'#55a866';const glow=b.kind==='virus'?'#d19aff':b.kind==='slow'?'#bde8ff':'#a7f58c';cylinder(.18,.23,.48,color,g,0,0,0);sphere(.16,glow,g,0,.3,0);box(.16,.08,.16,'#e7d1a7',g,0,.28,0);}else{sphere(.26,'#29394b',g,0,0,0);const fuse=box(.055,.23,.055,'#ffd366',g,.06,.3,0);fuse.rotation.z=-.3;sphere(.07,'#fff1a2',g,.1,.42,0);}ink(g,.03);scene.add(g);bombModels.set(b.id,g);}g.position.set(b.x,b.y,b.z);g.rotation.z+=dt*(b.kind==='bomb'?6:3);g.userData.trail=(g.userData.trail||0)-dt;if(g.userData.trail<=0){g.userData.trail=.04;trailBit(b);}}
  for(const [id,m] of bombModels)if(!world.bombs.some(b=>b.id===id)){scene.remove(m);bombModels.delete(id);}
  for(const s of world.shots||[]){let g=shotModels.get(s.id);if(!g&&s.style==='slash'){g=new THREE.Group();   // Red Sail's flying slash: a bright crescent lying forward with a wider glow behind it
    const arc=(r,tube,color,op)=>{const m=fxMesh(new THREE.TorusGeometry(r,tube,6,28,Math.PI),color,g,0,0,0,op);m.rotation.x=Math.PI/2;return m;};arc(.95,.1,'#fff4c0',.95);arc(1.05,.22,'#ffae3c',.5);arc(.8,.05,'#ffffff',.9);scene.add(g);shotModels.set(s.id,g);}
  else if(!g&&s.style==='shield'){g=new THREE.Group();   // the guardian's boomerang shield: a spinning blue disc with a gold rim
    const disc=fxMesh(new THREE.CylinderGeometry(.62,.62,.12,24),'#4a86c8',g,0,0,0,1,false),rim=fxMesh(new THREE.TorusGeometry(.62,.07,8,28),'#e8d38e',g,0,0,0,1,false);rim.rotation.x=Math.PI/2;fxMesh(new THREE.SphereGeometry(.14,10,8),'#fff4c0',g,0,.1,0,1,false);disc.userData.spin=true;scene.add(g);shotModels.set(s.id,g);}
  if(!g){g=new THREE.Group();const bolt=s.style==='bolt';fxMesh(new THREE.SphereGeometry(bolt?.26:.18,10,8),bolt?'#fff6a0':'#ffe08a',g,0,0,0,1);if(bolt)fxMesh(new THREE.IcosahedronGeometry(.4,0),'#8fe0ff',g,0,0,0,.5);const trail=fxMesh(new THREE.CylinderGeometry(.02,.16,1.2,8),bolt?'#7fd0ff':'#ff8a3c',g,0,0,0,.7);trail.rotation.x=Math.PI/2;trail.position.z=-.6;scene.add(g);shotModels.set(s.id,g);}g.position.set(s.x,s.y,s.z);if(s.style==='shield'){g.rotation.y=world.tick*.5;g.rotation.x=.25;}else g.rotation.y=Math.atan2(s.vx,s.vz);}
  for(const [id,g] of shotModels)if(!(world.shots||[]).some(s=>s.id===id)){scene.remove(g);g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});shotModels.delete(id);}
  for(const c of world.clouds){let g=cloudModels.get(c.id);if(!g){g=createCloudVisual(c.kind);scene.add(g);cloudModels.set(c.id,g);}updateCloudVisual(g,c,world.tick*STEP);}
  for(const [id,m] of cloudModels)if(!world.clouds.some(c=>c.id===id)){scene.remove(m);m.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});cloudModels.delete(id);}
  while(crateModels.length<world.crates.length){const g=containerModel();scene.add(g);crateModels.push(g);}
  // A Tripo fighter holds the load overhead, resting on the head; everyone else keeps the core's chest-height spot.
  const carryOverhead=id=>{const f=world.fighters.findIndex(q=>q.id===id);return f>=0&&models[f]?.glb?.tripo?{p:world.fighters[f],h:tripoCarryHeight(models[f].glb.root.scale.y,models[f].glb.tripoCfg.carryBottom)}:null;};
  crateModels.forEach((m,i)=>{const c=world.crates[i];if(!c){m.visible=false;return;}m.visible=c.hp>0||c.falling||c.heldBy!==null;setContainerKind(m,c.kind);const over=c.heldBy!==null?carryOverhead(c.heldBy):null;if(over)m.position.set(over.p.x,over.p.y+over.h,over.p.z);else m.position.set(c.x,c.y||0,c.z);m.rotation.z=c.falling?Math.sin(world.tick*.12+i):0;});
  for(const p of world.props||[]){let g=propModels.get(p.id);if(!g){g=containerModel();scene.add(g);propModels.set(p.id,g);}setContainerKind(g,p.kind);const over=p.heldBy!==null?carryOverhead(p.heldBy):null;if(over){g.position.set(over.p.x,over.p.y+over.h,over.p.z);g.rotation.set(0,0,0);}else{g.position.set(p.x,p.y-.45,p.z);g.rotation.x+=dt*4;g.rotation.z+=dt*5;}}for(const [id,g] of propModels)if(!(world.props||[]).some(p=>p.id===id)){scene.remove(g);propModels.delete(id);}
  const theme=THEMES[stage.id];
  for(const c of world.cannonballs||[]){let g=cannonModels.get(c.id);if(!g){g=c.kind==='rock'?mesh(new THREE.DodecahedronGeometry(.8,0),'#8a6a48',scene,0,0,0):c.kind==='snowball'?sphere(.72,'#f6fbff',scene,0,0,0):sphere(.36,theme.cannon,scene,0,0,0);ink(g,.04);cannonModels.set(c.id,g);}g.visible=!(c.delay>0);g.position.set(c.x,c.y,c.z);if(c.kind==='snowball')g.rotation.z-=dt*(c.vx||0)/.72;else g.rotation.x+=dt*(c.kind==='rock'?3:7);}for(const [id,g] of cannonModels)if(!(world.cannonballs||[]).some(c=>c.id===id)){scene.remove(g);cannonModels.delete(id);}
  waveMesh.visible=(world.waveTime||0)>0;const sandstorm=stage.id==='desert';waveMesh.scale.set(sandstorm?1.2:1,sandstorm?4:stage.id==='snow'?1.7:1,1);document.body.classList.toggle('sandstorm',waveMesh.visible&&sandstorm);if(waveMesh.visible){waveMesh.material.opacity=(sandstorm?.18:.3)+Math.sin(world.tick*.2)*.06;waveMesh.position.x=-(world.waveDir||1)*10+(2.2-world.waveTime)*(world.waveDir||1)*10;}
  while(pickupModels.length<world.pickups.length){const g=new THREE.Group();
    const core=sphere(.28,'#29394b',g,0,.4,0);core.scale.x=1.25;
    const band=new THREE.Group();g.add(band);const flesh=sphere(.27,'#b9542e',band,-.1,.42,0);flesh.scale.set(1.25,1,1);cylinder(.05,.05,.5,'#fff4e0',band,.28,.42,0).rotation.z=Math.PI/2;sphere(.08,'#fff4e0',band,.52,.47,0);sphere(.08,'#fff4e0',band,.52,.37,0);
    const fuse=box(.055,.23,.055,'#ffd366',g,.06,.72,0);fuse.rotation.z=-.3;
    const poison=cylinder(.18,.23,.48,'#73d890',g,0,.42,0);poison.rotation.z=.12;
    const bubbles=sphere(.1,'#c9ffad',g,.2,.72,0);bubbles.scale.set(.8,1,.8);
    const virus=cylinder(.18,.23,.48,'#8d55bd',g,0,.42,0);virus.rotation.z=-.12;
    const virusGlow=sphere(.1,'#d19aff',g,.2,.72,0);virusGlow.scale.set(.8,1,.8);
    // Power-up crystal: generic on purpose, every fighter's own weapon (blade, fists, buckler, gun, boot, staff) gets the boost.
    const blade=new THREE.Mesh(new THREE.OctahedronGeometry(.34),new THREE.MeshToonMaterial({color:'#ffd84e'}));blade.scale.set(.8,1.35,.8);blade.position.y=.62;g.add(blade);
    const hilt=new THREE.Mesh(new THREE.TorusGeometry(.32,.045,8,20),new THREE.MeshToonMaterial({color:'#fff3a0'}));hilt.rotation.x=Math.PI/2.4;hilt.position.y=.62;g.add(hilt);
    const beer=cylinder(.2,.2,.5,'#d79a3b',g,0,.43,0);const foam=sphere(.22,'#fff0bd',g,0,.72,0);
    const slow=cylinder(.2,.2,.48,'#7faee8',g,0,.42,0);slow.rotation.z=-.12;const snow=sphere(.1,'#d9f2ff',g,.18,.72,0);
    ink(g,.03);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.36,.44,24),new THREE.MeshBasicMaterial({color:'#ffe17d',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.08;ring.visible=false;g.add(ring);
    // A faint column of light marks loot from far away instead of a ring on the floor.
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.14,.4,2.6,10,1,true),new THREE.MeshBasicMaterial({color:'#ffe17d',transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false}));beam.position.y=1.3;g.add(beam);
    g.userData={core,band,fuse,poison,bubbles,virus,virusGlow,blade,hilt,beer,foam,slow,snow,ring,beam,type:'',emit:0};scene.add(g);pickupModels.push(g);
  }
  pickupModels.forEach((m,i)=>{const p=world.pickups[i];m.visible=!!p;if(p){const u=m.userData;if(u.type!==p.type){u.type=p.type;u.core.visible=p.type==='bomb';u.band.visible=p.type==='meat';u.fuse.visible=p.type==='bomb';u.poison.visible=p.type==='poison';u.bubbles.visible=p.type==='poison';u.virus.visible=p.type==='virus';u.virusGlow.visible=p.type==='virus';u.blade.visible=p.type==='sword';u.hilt.visible=p.type==='sword';u.beer.visible=p.type==='beer';u.foam.visible=p.type==='beer';u.slow.visible=p.type==='slow';u.snow.visible=p.type==='slow';u.ring.material.color.set(p.type==='poison'?'#8dffac':p.type==='virus'?'#c084ff':p.type==='bomb'?'#ffcf68':p.type==='meat'?'#ff9b6b':p.type==='beer'?'#ffd66e':p.type==='slow'?'#8ab8ff':'#fff0a5');u.beam.material.color.copy(u.ring.material.color);}
    pickupAmbient(m,p,dt);m.position.set(p.x,(p.y||0)+.1+Math.sin(world.tick*.05)*.1,p.z);m.rotation.y+=dt;}});
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];if(e.delay>0){e.delay-=dt;if(e.delay<=0)e.m.visible=true;continue;}e.life-=dt;if(e.life<=0){removeEffect(e);effects.splice(i,1);continue;}const k=e.life/e.max;if(e.strip){e.m.children[0].material.opacity=.15+.3*Math.abs(Math.sin(k*18));continue;}if(e.v){e.m.position.addScaledVector(e.v,dt);if(e.puff)e.v.multiplyScalar(Math.exp(-dt*4));else if(!e.sprite)e.v.y-=dt*16;}if(e.chunk){e.v.y-=dt*22;e.m.position.addScaledVector(e.v,dt);e.m.rotation.x+=e.spin.x*dt;e.m.rotation.y+=e.spin.y*dt;e.m.rotation.z+=e.spin.z*dt;
      if(e.m.position.y<e.floor){e.m.position.y=e.floor;if(Math.abs(e.v.y)>2){e.v.y*=-.35;e.v.x*=.6;e.v.z*=.6;}else{e.v.set(0,0,0);e.spin.set(0,0,0);}}
      e.m.material.opacity=Math.min(1,k*2.5);continue;}
    if(e.fireball){const t=1-k;e.m.scale.setScalar(e.fireball*(.35+t*.9));e.m.material.opacity=Math.min(1,k*1.8);continue;}
    if(e.flame){const t=1-k;e.m.scale.set(1-t*.4,.4+t*2.2*e.flame,1-t*.4);e.m.position.y+=dt*2.2;e.m.material.opacity=Math.min(.9,k*2);continue;}
    if(e.smoke){const t=1-k;e.m.scale.setScalar(e.smoke*(.5+t*1.6));e.m.position.addScaledVector(e.v,dt);e.v.multiplyScalar(Math.exp(-dt*1.2));e.m.material.opacity=.65*Math.min(1,k*1.6)*(t<.12?t/.12:1);continue;}
    if(e.fadeSlow){e.m.material.opacity=e.op*Math.min(1,k*2.5);continue;}
    if(e.pop){const t=1-k,sc=t<.16?.35+t/.16*.95:1.3-(t-.16)*.3;e.m.scale.set(e.pop[0]*sc,e.pop[1]*sc,1);e.m.material.opacity=Math.min(1,k*3.2);continue;}if(e.puff){e.m.scale.setScalar(1+(1-k)*1.8);e.m.material.opacity=k*.8;continue;}if(e.sweep){e.m.scale.setScalar(.8+(1-k)*.4);e.m.material.opacity=k;continue;}if(e.star){e.m.scale.setScalar(e.star*(.45+(1-k)*.9));e.m.material.opacity=Math.min(1,k*1.6);continue;}if(e.grow)e.m.scale.setScalar(.5+(1-k)*.8);if(!e.shared)e.m.material.opacity=k*(e.op??1);else e.m.scale.setScalar(k);}
  calloutTime-=dt;$('callout').style.opacity=calloutTime>0?'1':'0';
  stage.update(performance.now()/1000,dt);stage.ventFx?.(world.tick,performance.now()/1000);
  updateHud();updateCamera(dt);
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<innerHeight?48:34;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);resize();
let last=performance.now(),acc=0;
function simulate(dt){
  const input=serialInput();
  if(netRole==='guest'){
    acc=0;netSendAcc+=dt;if(netSendAcc>=NETWORK_INPUT_RATE){netSendAcc=0;sendNet({t:'input',round:world.round||0,input});}
  }else{
    if(netRole==='host')world.remoteInput=guestInput.read(performance.now());
    if(timeScale<1&&performance.now()>slowUntil)timeScale=1;
    acc=Math.min(acc+dt*timeScale,.1);while(acc>=STEP){if(started&&!connectionAttempt.pending&&(netRole==='solo'||world.online))step(world,input);acc-=STEP;}
    if(netRole==='host'){netBroadcastAcc+=dt;if(netBroadcastAcc>=NETWORK_STATE_RATE){netBroadcastAcc=0;sendSnapshot();}}
  }
}
function frame(now){
  requestAnimationFrame(frame);const dt=clamp((now-last)/1000,0,.1);last=now;if(document.hidden)return;
  simulate(dt);events();updateVisuals(dt);renderer.render(scene,camera);
}
refreshSelect();reset();
$('loading').remove();requestAnimationFrame(frame);
// Headless verification hook (?debug): drive frames without requestAnimationFrame.
if(new URLSearchParams(location.search).has('debug'))window.__brawl={audio,get stage(){return stage;},get world(){return world;},get ghostCount(){return ghosts.length;},get models(){return models;},get cam(){return [tmpFocus.toArray(),camDist,focusShot];},camera,scene,renderer,selection,startMatch,action,keys,
  run(seconds,fps=60,draw=true){for(let t=0;t<seconds;t+=1/fps){simulate(1/fps);events();updateVisuals(1/fps);}if(draw)renderer.render(scene,camera);}};
