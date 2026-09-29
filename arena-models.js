// Character rigs: every roster member shares the same joints (body, arms, legs, weapon)
// so animation code stays generic while silhouettes and colors stay distinct.
import * as THREE from './vendor/three.module.js';
import {CHARACTERS,SLOT_COLORS,SLOT_LABELS} from './arena-roster.js';
import {box,sphere,cylinder,cone,mesh,fxMesh,label,ink} from './arena-gfx.js';

function animeFace(body,c,eyeColor='#1c2230'){
  const head=sphere(.56,c.skin,body,0,2.07,.03,20);head.scale.set(1,1.02,.94);
  for(const side of [-1,1]){
    const white=sphere(.13,'#ffffff',body,side*.2,2.06,.43,12);white.scale.set(.85,1.25,.45);white.userData.noInk=true;
    const iris=sphere(.085,eyeColor,body,side*.19,2.05,.49,10);iris.scale.set(.85,1.2,.4);iris.userData.noInk=true;
    const shine=sphere(.03,'#ffffff',body,side*.17,2.1,.53,6);shine.userData.noInk=true;
    const brow=box(.2,.045,.05,c.hair,body,side*.2,2.26,.47);brow.rotation.z=side*.2;brow.userData.noInk=true;
    sphere(.1,c.skin,body,side*.55,2.04,0,8);
  }
  const mouth=box(.17,.035,.03,'#7a2f2c',body,0,1.84,.51);mouth.userData.noInk=true;
  return head;
}
function limbs(body,c,{sleeve=c.color,pants='#2a3144',shoes='#3b2a22',bareArms=false}={}){
  const legs=[];
  for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.24,.67,0);body.add(leg);cylinder(.2,.17,.42,pants,leg,0,-.19,0);box(.36,.24,.56,shoes,leg,0,-.52,.1);legs.push(leg);}
  const arms=[];
  for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.54,1.47,0);body.add(arm);sphere(.24,sleeve,arm,0,-.08,0);cylinder(.14,.13,.44,bareArms?c.skin:sleeve,arm,0,-.34,0);sphere(.18,c.skin,arm,0,-.61,.06);arms.push(arm);}
  return {legs,arms};
}
function weaponMount(arm){const g=new THREE.Group();g.position.set(0,-.57,.14);g.rotation.x=1.15;arm.add(g);return g;}

const BUILDERS={
  swordsman(body,c){
    cylinder(.42,.5,.82,c.color,body,0,1.13,0);box(.44,.6,.1,'#f6ecd2',body,0,1.2,.42);
    cylinder(.51,.5,.16,c.accent,body,0,.78,0);
    const tails=box(.7,.7,.08,c.color,body,0,.62,-.42);tails.rotation.x=.22;
    const rig=limbs(body,c);animeFace(body,c);
    const hair=sphere(.58,c.hair,body,0,2.24,-.06,16);hair.scale.set(1,.72,.95);
    for(let i=0;i<5;i++){const spike=cone(.14,.42,c.hair,body,-.36+i*.18,2.5,.18,6);spike.rotation.x=.9;spike.rotation.z=(i-2)*-.25;}
    const band=cylinder(.6,.6,.14,c.color,body,0,2.3,0,16);band.scale.z=.97;
    for(const side of [-1,1]){const knot=box(.08,.34,.06,c.color,body,side*.1,2.14,-.62);knot.rotation.z=side*.5;}
    const sword=weaponMount(rig.arms[1]);
    cylinder(.06,.06,.34,'#352a24',sword,0,0,0);cylinder(.15,.15,.05,c.accent,sword,0,.18,0);
    const blade=box(.12,1.3,.05,'#eef6f8',sword,0,.86,0);blade.rotation.z=-.04;
    const tip=cone(.08,.22,'#eef6f8',sword,-.03,1.62,0,4);tip.rotation.y=.8;
    return {...rig,weapon:sword,glowSize:[.32,1.6],glowY:.86};
  },
  guardian(body,c){
    cylinder(.44,.5,.82,c.color,body,0,1.13,0);box(.48,.64,.1,'#f2f4f6',body,0,1.16,.44);
    for(let i=0;i<3;i++)sphere(.045,c.accent,body,0,1.34-i*.18,.5,6);
    for(const side of [-1,1]){const pad=box(.34,.14,.42,c.accent,body,side*.5,1.6,0);pad.rotation.z=side*-.25;}
    cylinder(.51,.5,.16,'#1b2a3a',body,0,.78,0);
    const rig=limbs(body,c,{pants:'#e8edf2',shoes:'#1c2433'});animeFace(body,c,'#1d3a5c');
    const hair=sphere(.58,c.hair,body,0,2.18,-.07,16);hair.scale.set(1,.72,.95);
    const cap=cylinder(.6,.62,.3,'#f4f6f8',body,0,2.52,0,16);const brim=cylinder(.62,.62,.06,'#1b2a3a',body,0,2.39,.18,16);brim.scale.z=.9;
    sphere(.1,c.accent,body,0,2.56,.58,8);cap.userData.hat=true;
    const buckler=new THREE.Group();buckler.position.set(0,-.4,.2);rig.arms[0].add(buckler);
    const rim=cylinder(.58,.58,.14,c.accent,buckler,0,0,0,20);rim.rotation.x=Math.PI/2;
    const plate=cylinder(.5,.5,.16,c.color,buckler,0,0,.02,20);plate.rotation.x=Math.PI/2;sphere(.16,'#f1e3b5',buckler,0,0,.14,10);
    const blade=weaponMount(rig.arms[1]);
    cylinder(.07,.07,.3,'#3b3027',blade,0,0,0);box(.46,.09,.14,c.accent,blade,0,.15,0);box(.2,.9,.07,'#e3eef2',blade,0,.62,0);
    return {...rig,weapon:blade,glowSize:[.38,1.1],glowY:.62};
  },
  brawler(body,c){
    const chest=cylinder(.5,.46,.86,c.color,body,0,1.15,0);chest.scale.set(1.1,1,.95);
    box(.2,.5,.08,'#ffffff',body,0,1.2,.47);
    cylinder(.52,.5,.18,'#3a2a20',body,0,.76,0);box(.24,.18,.06,c.accent,body,0,.76,.5);
    const rig=limbs(body,c,{sleeve:c.color,bareArms:true,pants:'#4a5a78',shoes:'#2a1d18'});
    rig.arms.forEach(arm=>{arm.children[0].scale.setScalar(1.15);const glove=sphere(.29,c.accent,arm,0,-.66,.08,14);glove.scale.set(1,.95,1.1);cylinder(.2,.2,.12,'#ffffff',arm,0,-.47,.05);});
    animeFace(body,c,'#2b4b24');
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2,spike=cone(.17,.62,c.hair,body,Math.cos(a)*.34,2.42+Math.sin(a*2)*.05,Math.sin(a)*.3-.05,6);spike.rotation.set(Math.sin(a)*-.9-.2,0,Math.cos(a)*-.9);}
    sphere(.5,c.hair,body,0,2.3,-.05,14).scale.set(1,.6,.95);
    const band=cylinder(.59,.59,.13,c.accent,body,0,2.26,0,16);band.scale.z=.97;
    const fist=weaponMount(rig.arms[1]);
    return {...rig,weapon:fist,glowSize:[.7,.7],glowY:-.05};
  },
  gunner(body,c){
    cylinder(.42,.48,.8,c.color,body,0,1.13,0);box(.46,.6,.1,'#3a2a4a',body,0,1.18,.42);
    const strap=box(.12,1,.06,'#5a3a22',body,0,1.16,.46);strap.rotation.z=.7;
    for(let i=0;i<4;i++)cylinder(.04,.04,.12,'#f0c040',body,-.28+i*.18,1.16-(-.28+i*.18)*.84,.5,6);
    cylinder(.49,.48,.15,'#3a2a4a',body,0,.78,0);
    const scarf=box(.9,.18,.5,c.accent,body,0,1.6,.02);scarf.scale.z=1;
    const tail=box(.18,.6,.06,c.accent,body,.25,1.35,-.4);tail.rotation.z=-.3;
    const rig=limbs(body,c,{pants:'#5b4636',shoes:'#2b221c'});animeFace(body,c,'#5a2d12');
    const hair=sphere(.6,c.hair,body,0,2.24,-.05,16);hair.scale.set(1.06,.8,1);
    for(let i=0;i<6;i++){const curl=sphere(.17,c.hair,body,Math.cos(i)*.45,2.45+Math.sin(i*3)*.08,-.1-Math.sin(i)*.3,8);curl.userData.noInk=true;}
    const strapHead=cylinder(.61,.61,.08,'#2b2233',body,0,2.3,0,16);strapHead.scale.z=.97;
    for(const side of [-1,1]){const goggle=cylinder(.15,.15,.1,'#a8e8ff',body,side*.19,2.4,.46,12);goggle.rotation.x=Math.PI/2-.4;const rim=cylinder(.18,.18,.08,'#2b2233',body,side*.19,2.4,.44,12);rim.rotation.x=Math.PI/2-.4;}
    const gun=weaponMount(rig.arms[1]);
    box(.14,.32,.16,'#5a3a22',gun,0,0,0);const barrel=cylinder(.07,.08,.9,'#39404a',gun,0,.46,.02,10);
    cylinder(.1,.1,.08,'#f0c040',gun,0,.9,.02,10);box(.08,.14,.08,'#39404a',gun,0,.2,-.08);barrel.userData.muzzle=true;
    return {...rig,weapon:gun,glowSize:[.3,1],glowY:.46};
  },
};

// Status effect decorations are identical for every character.
function statusFx(root,body){
  const poisonFx=new THREE.Group(),virusFx=new THREE.Group(),iceFx=new THREE.Group(),burnFx=new THREE.Group();root.add(poisonFx,virusFx,iceFx,burnFx);
  const poisonBubbles=[];for(let i=0;i<8;i++){const a=i*Math.PI*2/8,r=.48+(i%3)*.13,b=fxMesh(new THREE.SphereGeometry(.09+(i%2)*.035,10,8),i%2?'#78ff8c':'#c4ff75',poisonFx,Math.cos(a)*r,.45+(i%4)*.5,Math.sin(a)*r,.72);b.userData={a,y:b.position.y,r};poisonBubbles.push(b);}
  const virusNodes=[];for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=.55+(i%2)*.15,n=fxMesh(new THREE.IcosahedronGeometry(.12+(i%3)*.025,0),i%2?'#c26cff':'#7657ff',virusFx,Math.cos(a)*r,.55+(i%3)*.65,Math.sin(a)*r,.8);n.userData={a,y:n.position.y,r};virusNodes.push(n);}
  const iceShards=[];for(const [x,y,z,s] of [[-.42,.42,.18,.42],[.42,.42,.18,.42],[-.58,1.15,.1,.34],[.58,1.15,.1,.34],[-.34,1.78,.25,.28],[.34,1.78,.25,.28]]){const shard=fxMesh(new THREE.ConeGeometry(.17,s,4),'#a9e9ff',iceFx,x,y,z,.76);shard.rotation.z=x<0?.45:-.45;iceShards.push(shard);}
  const faceFlush=fxMesh(new THREE.SphereGeometry(.57,16,12),'#ef4b3f',body,0,2.07,.03,0,false);faceFlush.scale.set(1,1.02,.94);
  const blushCheeks=[-.27,.27].map(x=>fxMesh(new THREE.CircleGeometry(.12,16),'#ff5b53',body,x,1.95,.52,0,false));
  const smoke=[];for(let i=0;i<6;i++){const a=i*Math.PI*2/6,s=fxMesh(new THREE.SphereGeometry(.14+(i%3)*.035,10,8),i%2?'#26313a':'#ff7849',burnFx,Math.cos(a)*.48,.45+(i%3)*.6,Math.sin(a)*.48,i%2?.5:.8,i%2===0);s.userData={a,y:s.position.y};smoke.push(s);}
  for(const fx of [poisonFx,virusFx,iceFx,burnFx])fx.visible=false;
  return {poisonFx,poisonBubbles,virusFx,virusNodes,iceFx,iceShards,faceFlush,blushCheeks,burnFx,smoke};
}

export function buildFighter(charId,slot,parent){
  const c=CHARACTERS[charId],root=new THREE.Group(),body=new THREE.Group();root.add(body);parent?.add(root);
  const rig=BUILDERS[charId](body,c);
  ink(body,.04);
  const sword=rig.weapon,[gw,gh]=rig.glowSize;
  const weaponGlow=fxMesh(new THREE.BoxGeometry(gw,gh,.16),'#ffd84e',sword,0,rig.glowY,.01,0);
  const swordTrail=fxMesh(new THREE.PlaneGeometry(gw*2.2,gh*1.2),'#ffbf28',sword,-.1,rig.glowY,-.08,0);
  const swordSparks=[];for(let i=0;i<5;i++){const spark=fxMesh(new THREE.SphereGeometry(.055+(i%2)*.025,8,6),i%2?'#fff3a0':'#ffbe2e',sword,0,.25+i*.25,.12,0);spark.userData={phase:i*.23};swordSparks.push(spark);}
  const ringColor=SLOT_COLORS[slot]||SLOT_COLORS[0];
  const ring=mesh(new THREE.RingGeometry(.58,.7,40),ringColor,root,0,.035,0);ring.rotation.x=-Math.PI/2;ring.material=new THREE.MeshBasicMaterial({color:ringColor,side:THREE.DoubleSide,transparent:true,opacity:.9});ring.castShadow=false;
  const shield=new THREE.Mesh(new THREE.CircleGeometry(.9,32),new THREE.MeshBasicMaterial({color:'#87dfff',transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}));shield.position.set(0,1.35,.74);shield.visible=false;body.add(shield);
  const tag=label(SLOT_LABELS[slot]||'1P',ringColor,60);tag.scale.set(1.5,.38,1);tag.position.y=3.4;root.add(tag);
  return {char:charId,root,body,...rig,sword,weaponGlow,swordTrail,swordSparks,ring,shield,tag,...statusFx(root,body)};
}
export function disposeFighter(m){
  m.root.parent?.remove(m.root);
  m.root.traverse(o=>{if(o.isMesh&&!o.userData.ink)o.geometry.dispose();if(o.material&&!o.material.isMeshToonMaterial&&o.material.side!==THREE.BackSide){o.material.map?.dispose();o.material.dispose();}});
}

// Portraits are rendered once from the real models so HUD, select screen and cut-ins match.
export function renderPortraits(){
  const out={};let r;
  try{r=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}catch(_){return out;}
  r.setSize(256,256,false);r.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#ffffff','#8a93a8',2.2));const key=new THREE.DirectionalLight('#ffffff',2.4);key.position.set(2,4,5);scene.add(key);
  const cam=new THREE.PerspectiveCamera(30,1,.1,20);cam.position.set(.55,2.25,3.2);cam.lookAt(0,2.02,0);
  for(const id of Object.keys(CHARACTERS)){const m=buildFighter(id,0,scene);m.ring.visible=m.tag.visible=false;m.body.rotation.y=.28;r.render(scene,cam);out[id]=r.domElement.toDataURL('image/png');disposeFighter(m);}
  r.dispose();r.forceContextLoss?.();
  return out;
}
