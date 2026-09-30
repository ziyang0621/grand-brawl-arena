// Character rigs: every roster member shares the same joints (body, arms, legs, weapon)
// so animation code stays generic while silhouettes and colors stay distinct.
import * as THREE from './vendor/three.module.js';
import {CHARACTERS,SLOT_COLORS,SLOT_LABELS} from './arena-roster.js';
import {box,sphere,cylinder,cone,mesh,fxMesh,label,ink} from './arena-gfx.js';

// ---- Proportions: a taller, longer-legged figure than the old chibi (about three heads tall) ----
const HEAD_Y=2.28,HEAD_R=.45,SHOULDER_Y=1.68,HIP_Y=.9;
const dk=(hex,k)=>{const c=new THREE.Color(hex);c.multiplyScalar(k);return '#'+c.getHexString();};

// Hero body: tapered chest, waist, neck; the shapes are shared, each character dresses them differently.
function torso(body,c,{chest=.5,waist=.34,color=c.color,z=.7,height=.98,neck=true,skinChest=false}={}){
  const t=cylinder(chest,waist,height,color,body,0,HIP_Y+height/2,0,18);t.scale.z=z;
  if(skinChest){const s=cylinder(chest*.6,waist*.7,height*.92,c.skin,body,0,HIP_Y+height/2+.03,.05,14);s.scale.z=z;}
  const hips=cylinder(waist+.05,waist+.08,.3,dk(color,.7),body,0,HIP_Y+.02,0,16);hips.scale.z=z+.05;
  if(neck)cylinder(.14,.16,.28,c.skin,body,0,SHOULDER_Y+.22,.02,10);
  return t;
}
// Limbs: two-segment arms and legs on the same joints the animation drives (body -> arm/leg groups).
function limbs(body,c,{sleeve=c.color,pants='#2a3144',shoes='#3b2a22',bareArms=false,glove=null,boot=null,thigh=null,legW=1,armW=1,shoulder=.62,shoulderColor=null,cuff=null}={}){
  const legs=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.21,HIP_Y-.02,0);body.add(leg);
    cylinder(.19*legW,.155*legW,.5,thigh||pants,leg,0,-.26,0,12);sphere(.155*legW,thigh||pants,leg,0,-.52,0,10);
    cylinder(.17*legW,.19*legW,.4,boot||pants,leg,0,-.7,0,12);
    if(cuff)cylinder(.2*legW,.2*legW,.07,cuff,leg,0,-.5,0,12);
    box(.31*legW,.15,.5,shoes,leg,0,-.84,.08);sphere(.16*legW,shoes,leg,0,-.81,.26,8).scale.set(1,.7,.8);legs.push(leg);
  }
  const arms=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*shoulder,SHOULDER_Y-.03,0);body.add(arm);arm.userData.side=side;
    sphere(.23*armW,shoulderColor||sleeve,arm,0,-.02,0,12);
    cylinder(.135*armW,.115*armW,.52,sleeve,arm,0,-.3,0,10);sphere(.115*armW,bareArms?c.skin:sleeve,arm,0,-.57,0,8);
    cylinder(.11*armW,.095*armW,.46,bareArms?c.skin:sleeve,arm,0,-.82,0,10);
    if(cuff)cylinder(.13*armW,.13*armW,.08,cuff,arm,0,-1.03,0,10);
    sphere(glove?.17*armW:.145*armW,glove||c.skin,arm,0,-1.1,.05,12);arms.push(arm);
  }
  return {legs,arms};
}
function weaponMount(arm){const g=new THREE.Group();g.position.set(.02,-1.1,.16);g.rotation.set(1.15,0,-.35);arm.add(g);return g;}

// ---- Faces: big two-tone eyes with lids, brows, mouths and reaction marks, all driven by one expression state ----
const noInk=m=>{m.userData.noInk=true;m.castShadow=false;return m;};
const arcGeo=(r,tube,arc=Math.PI)=>new THREE.TorusGeometry(r,tube,6,14,arc);
function makeFace(body,c,{iris='#2a2f3c',irisLow='#5a6a88',lash='thin',brow=1,jaw=1,cute=false,browColor=c.hair,lidColor=c.skin,eye=1}={}){
  const HY=HEAD_Y,R=HEAD_R;
  const head=sphere(R,c.skin,body,0,HY,.02,26);head.scale.set(jaw,1.08,.96);
  const faceZ=.41;
  // ears and nose
  for(const side of [-1,1])sphere(.085,c.skin,body,side*R*.98,HY-.02,-.02,8);
  noInk(cone(.04,.1,dk(c.skin,.93),body,0,HY-.09,faceZ+.03,8)).rotation.x=Math.PI/2;
  const eyes=[];
  for(const side of [-1,1]){
    const g=new THREE.Group();g.position.set(side*.185,HY-.005,faceZ);g.rotation.y=side*.12;g.scale.setScalar(eye);body.add(g);
    const white=noInk(sphere(.125,'#ffffff',g,0,0,0,14));white.scale.set(.92,1.32,.3);
    const irisG=new THREE.Group();g.add(irisG);
    const ir=noInk(sphere(.1,iris,irisG,0,-.005,.03,14));ir.scale.set(.96,1.28,.3);
    const low=noInk(sphere(.07,irisLow,irisG,0,-.045,.045,12));low.scale.set(1,.8,.25);
    const pupil=noInk(sphere(.048,'#0d0f14',irisG,0,-.005,.055,10));pupil.scale.set(1,1.25,.25);
    noInk(sphere(.032,'#ffffff',irisG,-.035,.055,.07,8)).scale.set(1,1.1,.3);
    noInk(sphere(.018,'#ffffff',irisG,.04,-.06,.07,6));
    // upper lid line (the strong anime eyelash) and lower lid
    const upper=noInk(box(.25,.032,.04,'#14161c',g,side*.005,.165,.05));upper.rotation.z=-side*.12;
    const flick=noInk(box(.1,.03,.04,'#14161c',g,side*.14,.15,.05));flick.rotation.z=-side*.55;
    const lashes=[];
    if(lash==='long'){for(let k=0;k<3;k++){const l=noInk(box(.1,.03,.04,'#14161c',g,side*(.13+k*.045),.17-k*.035,.05));l.rotation.z=-side*(.5+k*.3);lashes.push(l);}}
    if(cute)noInk(box(.2,.02,.03,'#8a5a4a',g,0,-.16,.05));
    // eyelid: a skin-coloured cap that slides down to close the eye
    const lid=noInk(sphere(.15,lidColor,g,0,.3,.012,14));lid.scale.set(1.16,1.1,.17);
    // alternative eye shapes
    const happy=noInk(new THREE.Mesh(arcGeo(.085,.026),new THREE.MeshBasicMaterial({color:'#14161c'})));happy.position.set(0,-.03,.05);happy.visible=false;g.add(happy);
    const hurt=new THREE.Group();hurt.visible=false;g.add(hurt);
    for(const s of [-1,1]){const bar=noInk(box(.16,.036,.04,'#14161c',hurt,0,s*.045,.06));bar.rotation.z=-s*side*.42;bar.position.x=-side*.02;}
    const ko=new THREE.Group();ko.visible=false;g.add(ko);
    for(const s of [-1,1]){const bar=noInk(box(.2,.04,.04,'#14161c',ko,0,0,.06));bar.rotation.z=s*.75;}
    const daze=noInk(new THREE.Mesh(new THREE.TorusGeometry(.075,.02,6,14),new THREE.MeshBasicMaterial({color:'#14161c'})));daze.position.z=.07;daze.visible=false;g.add(daze);
    const dazeIn=noInk(new THREE.Mesh(new THREE.TorusGeometry(.038,.018,6,12),new THREE.MeshBasicMaterial({color:'#14161c'})));dazeIn.position.z=.07;dazeIn.visible=false;g.add(dazeIn);
    // eyebrow on its own pivot so it can frown, worry and rise
    const bg=new THREE.Group();bg.position.set(side*.19,HY+.22,faceZ+.03);body.add(bg);
    const bw=noInk(box(.24,.05*brow,.05,browColor,bg,0,0,0));
    eyes.push({side,g,white,irisG,lid,upper,flick,lashes,happy,hurt,ko,daze,dazeIn,bg,bw,ir,low,pupil});
  }
  // mouths: only one is visible at a time
  const mg=new THREE.Group();mg.position.set(0,HY-.235,faceZ+.04);body.add(mg);
  const dark='#6a2626',mouths={};
  const mk=(name,fn)=>{const gp=new THREE.Group();gp.visible=false;mg.add(gp);fn(gp);mouths[name]=gp;};
  mk('smile',gp=>{const a=noInk(new THREE.Mesh(arcGeo(.075,.018),new THREE.MeshBasicMaterial({color:dark})));a.rotation.z=Math.PI;a.position.y=.05;gp.add(a);});
  mk('flat',gp=>{noInk(box(.15,.03,.03,dark,gp,0,0,0));});
  mk('smirk',gp=>{const a=noInk(new THREE.Mesh(arcGeo(.07,.018,Math.PI*.8),new THREE.MeshBasicMaterial({color:dark})));a.rotation.z=Math.PI*1.08;a.position.set(.03,.045,0);gp.add(a);});
  mk('open',gp=>{const m=noInk(sphere(.11,'#3a1212',gp,0,-.02,0,12));m.scale.set(1.05,.85,.28);noInk(box(.16,.035,.03,'#ffffff',gp,0,.03,.02));noInk(sphere(.055,'#e8607a',gp,0,-.06,.02,8)).scale.set(1.3,.55,.3);});
  mk('shout',gp=>{const m=noInk(sphere(.13,'#3a1212',gp,0,-.03,0,12));m.scale.set(1.15,1.1,.28);noInk(box(.2,.04,.03,'#ffffff',gp,0,.05,.02));noInk(sphere(.07,'#e8607a',gp,0,-.09,.02,8)).scale.set(1.4,.6,.3);});
  mk('grit',gp=>{noInk(box(.27,.11,.03,'#14161c',gp,0,0,0));noInk(box(.24,.085,.03,'#ffffff',gp,0,0,.01));for(const x of [-.06,0,.06])noInk(box(.012,.09,.03,'#b8b8c4',gp,x,0,.02));});
  mk('o',gp=>{const m=noInk(sphere(.055,'#3a1212',gp,0,-.02,0,10));m.scale.set(1,1.25,.3);});
  mk('frown',gp=>{const a=noInk(new THREE.Mesh(arcGeo(.07,.018),new THREE.MeshBasicMaterial({color:dark})));a.position.y=-.03;gp.add(a);});
  mk('tongue',gp=>{const m=noInk(sphere(.1,'#3a1212',gp,0,-.02,0,10));m.scale.set(1.1,.7,.28);const t=noInk(sphere(.06,'#ee6f88',gp,0,-.1,.02,8));t.scale.set(1,1.6,.3);});
  // reaction marks
  const sweat=new THREE.Group();sweat.position.set(.34,HY+.12,.28);sweat.visible=false;body.add(sweat);
  noInk(sphere(.055,'#8fd8ff',sweat,0,0,0,8)).scale.set(1,1.15,.7);noInk(cone(.04,.09,'#8fd8ff',sweat,0,.08,0,6));
  const vein=new THREE.Group();vein.position.set(-.3,HY+.3,.3);vein.visible=false;body.add(vein);
  for(const [x,y,rz] of [[-.03,.03,.3],[.03,.03,-.3],[-.03,-.03,-.3],[.03,-.03,.3]]){const bar=noInk(box(.07,.022,.02,'#e0352c',vein,x,y,0));bar.rotation.z=rz;}
  const state={lid:0,tilt:0,raise:0,gx:0,gy:0,eyes:'open',mouth:null};
  // Ease numbers toward the target and swap the discrete parts.
  function update(target,dt){
    const k=1-Math.exp(-dt*18);
    state.lid+=(target.lid-state.lid)*k;state.tilt+=(target.tilt-state.tilt)*k;state.raise+=(target.raise-state.raise)*k;
    state.gx+=(target.gx-state.gx)*k;state.gy+=(target.gy-state.gy)*k;
    for(const e of eyes){
      const open=target.eyes==='open'||target.eyes==='wide';
      e.white.visible=e.ir.visible=e.low.visible=e.pupil.visible=e.irisG.visible=target.eyes==='open'||target.eyes==='wide';
      e.lid.visible=open&&state.lid>.03;e.happy.visible=target.eyes==='happy';e.hurt.visible=target.eyes==='hurt';e.ko.visible=target.eyes==='ko';
      e.daze.visible=e.dazeIn.visible=target.eyes==='daze';e.white.visible=e.white.visible||target.eyes==='daze';
      e.upper.visible=e.flick.visible=open||target.eyes==='daze';for(const l of e.lashes)l.visible=open;
      e.lid.position.y=.3-state.lid*.3+(target.eyes==='wide'?.06:0);
      e.upper.position.y=.17-state.lid*.085;e.flick.position.y=.15-state.lid*.08;
      e.irisG.position.set(state.gx*.03,state.gy*.03,0);
      const wide=target.eyes==='wide';e.irisG.scale.setScalar(wide?.82:1);
      // eyebrows: tilt>0 frowns (inner ends down), <0 worries; raise lifts them
      e.bg.rotation.z=-e.side*state.tilt*.55;e.bg.position.y=HY+.21+state.raise*.05-state.tilt*.012+ (wide?.03:0);
      if(target.eyes==='daze'){e.daze.rotation.z+=dt*6;e.dazeIn.rotation.z-=dt*9;}
    }
    if(state.mouth!==target.mouth){for(const m of Object.values(mouths))m.visible=false;(mouths[target.mouth]||mouths.smile).visible=true;state.mouth=target.mouth;}
    sweat.visible=!!target.sweat;vein.visible=!!target.vein;
    state.eyes=target.eyes;
  }
  update({lid:0,tilt:0,raise:0,gx:0,gy:0,eyes:'open',mouth:'smile'},1);
  return {head,eyes,mouths,sweat,vein,update,state};
}
// Secondary motion: parts that trail behind the body (hair, coat tails, scarves, ribbons).
const swayer=list=>(o,amp,ph=0,drag=.5,ax='x')=>{list.push({o,ax,amp,ph,drag,base:o.rotation[ax]});return o;};
// Hair helpers so every haircut is built from the same kind of pieces.
const HY=HEAD_Y;
function hairCap(body,color,{scale=1,lift=.11,back=-.06}={}){const h=sphere(HEAD_R+.05,color,body,0,HY+lift,back,18);h.scale.set(1.02*scale,.8,1.04*scale);return h;}
function spike(body,color,x,y,z,len,rx,rz,w=.12){const sp=cone(w,len,color,body,x,y,z,6);sp.rotation.set(rx,0,rz);return sp;}
function bang(body,color,x,y,len=.36,tilt=0,w=.11,z=.36){const b=cone(w,len,color,body,x,y,z,6);b.rotation.set(Math.PI-.25,0,tilt);return b;}

const BUILDERS={
  swordsman(body,c){
    const sw=[],sway=swayer(sw);
    torso(body,c,{chest:.5,waist:.34,color:'#f6ecd2',height:1.0});
    // open red coat over a white shirt, gold trim, belt and sash
    for(const side of [-1,1]){const half=box(.3,.98,.2,c.color,body,side*.29,HIP_Y+.5,.12);half.rotation.z=side*.08;box(.05,.98,.06,c.accent,body,side*.16,HIP_Y+.5,.24).rotation.z=side*.08;}
    cylinder(.4,.4,.14,'#2a1c14',body,0,HIP_Y+.08,0,16).scale.z=.75;box(.14,.12,.06,c.accent,body,0,HIP_Y+.08,.32);
    const sash=sway(box(.22,.7,.05,'#f6ecd2',body,.3,HIP_Y-.3,.22),.14,0,1.1);sash.geometry.translate(0,-.3,0);sash.position.y=HIP_Y+.05;sash.rotation.x=.12;sw[0].base=.12;
    const rig=limbs(body,c,{sleeve:c.color,pants:'#232a3c',shoes:'#1c1614',bareArms:false,boot:'#2a2a34',cuff:'#c9372c',armW:1.02});
    const face=makeFace(body,c,{iris:'#3a2416',irisLow:'#a4682c',brow:1.25,eye:.88});
    // black spiky hair, forelock, side locks, red headband with trailing knot
    hairCap(body,c.hair);
    for(let i=0;i<7;i++){const a=-1.1+i*.37;sway(spike(body,c.hair,Math.sin(a)*.42,HY+.42+Math.cos(a)*.08,-.18-Math.cos(a)*.1,.55,-.9-Math.abs(a)*.2,-a*.5,.13),.08,i*.7,.35,'x');}
    for(const [x,t] of [[-.2,.25],[0,0],[.2,-.25]])sway(bang(body,c.hair,x,HY+.3,.34,t,.115),.05,x*9,.15,'z');
    for(const side of [-1,1]){const lock=sway(sphere(.11,c.hair,body,side*.42,HY-.08,.1,8),.12,side+1.2,.3,'z');lock.scale.set(.7,1.7,.7);}
    cylinder(HEAD_R+.06,HEAD_R+.06,.11,c.color,body,0,HY+.19,-.02,18).scale.z=1.02;
    for(const side of [-1,1]){const t=sway(box(.09,.42,.05,c.color,body,side*.1,HY+.1,-.55),.3,side+1.5,.6,'z');t.geometry.translate(0,-.2,0);t.position.y=HY+.28;t.rotation.z=side*.35;sw[sw.length-1].base=side*.35;}
    // scar and gold earring
    const scar=noInk(box(.12,.018,.012,'#b8605a',body,-.27,HY-.2,.4));scar.rotation.z=-.7;
    sphere(.035,c.accent,body,HEAD_R*.98+.02,HY-.14,-.02,6);
    const weapon=weaponMount(rig.arms[1]);
    cylinder(.06,.06,.34,'#352a24',weapon,0,0,0);cylinder(.15,.15,.05,c.accent,weapon,0,.18,0);
    const blade=box(.12,1.3,.05,'#eef6f8',weapon,0,.86,0);blade.rotation.z=-.04;
    const tip=cone(.08,.22,'#eef6f8',weapon,-.03,1.62,0,4);tip.rotation.y=.8;
    return {...rig,face,weapon,glowSize:[.32,1.6],glowY:.86,sway:sw,expr:{mouth:'smirk',browColor:c.hair}};
  },
  guardian(body,c){
    const sw=[],sway=swayer(sw);
    torso(body,c,{chest:.5,waist:.35,color:c.color,height:1.0});
    // jacket front: white cross belts, gold buttons, collar and epaulettes
    box(.42,.88,.05,'#f2f4f6',body,0,HIP_Y+.5,.29).userData.noInk=true;
    for(let i=0;i<4;i++)sphere(.04,c.accent,body,0,HIP_Y+.2+i*.2,.33,6).userData.noInk=true;
    for(const s of [-1,1]){const belt=box(.09,.98,.04,'#f8fafb',body,s*.06,HIP_Y+.55,.3);belt.rotation.z=s*.55;belt.userData.noInk=true;}
    cylinder(.4,.4,.13,'#1b2a3a',body,0,HIP_Y+.08,0,16).scale.z=.75;box(.12,.1,.06,c.accent,body,0,HIP_Y+.08,.32);
    box(.5,.09,.32,'#e8edf2',body,0,SHOULDER_Y+.08,.02).userData.noInk=true;
    const sash=sway(box(.18,.6,.05,c.accent,body,-.32,HIP_Y-.2,.22),.12,1,1);sash.geometry.translate(0,-.26,0);sash.position.y=HIP_Y+.02;
    for(const s of [-1,1]){box(.34,.08,.3,c.accent,body,s*.5,SHOULDER_Y+.05,0).rotation.z=s*-.18;for(let k=0;k<3;k++)cylinder(.014,.014,.1,c.accent,body,s*.5+(k-1)*.09,SHOULDER_Y-.03,.13,4).rotation.x=Math.PI/2;}
    const rig=limbs(body,c,{sleeve:c.color,pants:'#e8edf2',shoes:'#141c2a',glove:'#f6f8fa',boot:'#1c2a3a',cuff:c.accent,armW:1});
    const face=makeFace(body,c,{iris:'#2a5f9c',irisLow:'#78b8ee',brow:1.05,lash:'thin',eye:.88});
    // neat navy hair under a white officer's cap
    hairCap(body,c.hair,{lift:.04,back:-.08});
    for(const [x,t] of [[-.24,.18],[-.08,.05],[.08,-.05],[.24,-.18]])bang(body,c.hair,x,HY+.26,.3,t,.1,.37);
    for(const side of [-1,1]){const lock=sphere(.1,c.hair,body,side*.4,HY-.02,.1,8);lock.scale.set(.7,1.5,.75);}
    cylinder(HEAD_R+.09,HEAD_R+.11,.26,'#f4f6f8',body,0,HY+.34,-.02,20).scale.z=1.02;
    const brim=cylinder(HEAD_R+.12,HEAD_R+.12,.05,'#141c2a',body,0,HY+.24,.16,20);brim.scale.z=.92;
    sphere(.09,c.accent,body,0,HY+.35,HEAD_R+.09,8).scale.z=.4;
    const buckler=new THREE.Group();buckler.position.set(0,-.82,.22);rig.arms[0].add(buckler);
    const rim=cylinder(.58,.58,.14,c.accent,buckler,0,0,0,22);rim.rotation.x=Math.PI/2;
    const plate=cylinder(.5,.5,.16,c.color,buckler,0,0,.02,22);plate.rotation.x=Math.PI/2;sphere(.16,'#f1e3b5',buckler,0,0,.14,10);
    const blade=weaponMount(rig.arms[1]);
    cylinder(.07,.07,.3,'#3b3027',blade,0,0,0);box(.46,.09,.14,c.accent,blade,0,.15,0);box(.2,.9,.07,'#e3eef2',blade,0,.62,0);
    return {...rig,face,weapon:blade,glowSize:[.38,1.1],glowY:.62,sway:sw,expr:{mouth:'flat',browColor:c.hair}};
  },
  brawler(body,c){
    const sw=[],sway=swayer(sw);
    torso(body,c,{chest:.6,waist:.4,color:c.color,height:1.02,skinChest:true,z:.74});
    // open green vest over a bare chest with an orange sash and a big buckle
    for(const s of [-1,1]){const half=box(.24,.98,.2,c.color,body,s*.4,HIP_Y+.52,.1);half.rotation.z=s*.1;}
    cylinder(.46,.46,.16,'#3a2a20',body,0,HIP_Y+.08,0,16).scale.z=.78;box(.2,.16,.06,c.accent,body,0,HIP_Y+.08,.36);
    const sash=sway(box(.2,.7,.05,c.accent,body,-.34,HIP_Y-.3,.24),.14,0,1.1);sash.geometry.translate(0,-.3,0);sash.position.y=HIP_Y+.05;
    const rig=limbs(body,c,{sleeve:c.skin,bareArms:true,pants:'#4a5a78',shoes:'#2a1d18',glove:c.accent,boot:'#3a2a20',thigh:'#4a5a78',legW:1.14,armW:1.22,shoulder:.7,shoulderColor:c.skin});
    for(const arm of rig.arms){const wrap=cylinder(.15,.15,.16,'#ffffff',arm,0,-.98,0,10);wrap.scale.set(1.1,1,1.1);}
    const face=makeFace(body,c,{iris:'#2b6a2c',irisLow:'#7ac86a',brow:1.5,jaw:1.06,eye:.85});
    // wild pale spikes, headband, sideburns, cheek plaster
    hairCap(body,c.hair,{scale:1.03});
    for(let i=0;i<11;i++){const a=i/11*Math.PI*2,r=.4;sway(spike(body,c.hair,Math.cos(a)*r,HY+.36+Math.sin(a*2)*.05,Math.sin(a)*r*.85-.05,.6+(i%3)*.12,Math.sin(a)*-.9-.25,Math.cos(a)*-.9,.16),.07,i*.8,.3,'x');}
    for(const [x,t] of [[-.2,.3],[.02,0],[.22,-.3]])bang(body,c.hair,x,HY+.3,.32,t,.13);
    cylinder(HEAD_R+.06,HEAD_R+.06,.12,c.accent,body,0,HY+.2,-.02,18).scale.z=1.02;
    for(const s of [-1,1]){const burn=box(.07,.26,.05,c.hair,body,s*.4,HY-.08,.16);burn.rotation.z=s*.1;}
    const plaster=noInk(box(.14,.045,.02,'#f4e6c8',body,.26,HY-.14,.42));plaster.rotation.z=.5;noInk(box(.14,.045,.02,'#f4e6c8',body,.26,HY-.14,.42)).rotation.z=-.5;
    const weapon=weaponMount(rig.arms[1]);
    return {...rig,face,weapon,glowSize:[.7,.7],glowY:-.05,sway:sw,expr:{mouth:'grit',browColor:c.hair}};
  },
  gunner(body,c){
    const sw=[],sway=swayer(sw);
    torso(body,c,{chest:.48,waist:.34,color:c.color,height:1.0});
    // gold jacket with purple lining, a cartridge bandolier and a scarf
    box(.38,.9,.05,'#3a2a4a',body,0,HIP_Y+.5,.28).userData.noInk=true;
    const strap=box(.13,1.15,.05,'#5a3a22',body,0,HIP_Y+.52,.32);strap.rotation.z=.68;strap.userData.noInk=true;
    for(let i=0;i<5;i++)cylinder(.04,.04,.14,'#f0c040',body,-.3+i*.15,HIP_Y+.85-(-.3+i*.15)*.9+.02,.36,6);
    cylinder(.4,.4,.14,'#3a2a4a',body,0,HIP_Y+.08,0,16).scale.z=.75;box(.12,.1,.06,'#f0c040',body,0,HIP_Y+.08,.32);
    const scarf=box(.95,.2,.5,c.accent,body,0,SHOULDER_Y+.12,.02);scarf.userData.noInk=false;
    const tail=box(.2,.66,.06,c.accent,body,.26,SHOULDER_Y-.2,-.36);tail.geometry.translate(0,-.3,0);tail.position.y=SHOULDER_Y+.08;tail.rotation.z=-.3;sway(tail,.28,0,1.4,'x');sway(tail,.15,2,0,'z');
    const rig=limbs(body,c,{sleeve:c.color,pants:'#5b4636',shoes:'#2b221c',glove:'#3a2a4a',boot:'#4a3628',cuff:'#3a2a4a',armW:.96});
    const face=makeFace(body,c,{iris:'#7a3b14',irisLow:'#e0a04a',brow:1.05,eye:.92});
    // curly brown hair, goggles pushed up on the forehead
    hairCap(body,c.hair,{scale:1.06});
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const curl=sphere(.17,c.hair,body,Math.cos(a)*.42,HY+.36+Math.sin(a*3)*.05,Math.sin(a)*.4-.08,8);curl.userData.noInk=true;sway(curl,.05,i,.2,'x');}
    for(const [x,t] of [[-.22,.2],[0,0],[.22,-.2]])bang(body,c.hair,x,HY+.3,.26,t,.12);
    cylinder(HEAD_R+.06,HEAD_R+.06,.09,'#2b2233',body,0,HY+.24,-.02,18).scale.z=1.02;
    for(const side of [-1,1]){const rim=cylinder(.17,.17,.09,'#2b2233',body,side*.19,HY+.36,.34,14);rim.rotation.x=Math.PI/2-.6;const lens=cylinder(.135,.135,.1,'#a8e8ff',body,side*.19,HY+.36,.35,14);lens.rotation.x=Math.PI/2-.6;lens.userData.noInk=true;}
    const freckles=[-.09,0,.09].map(x=>noInk(sphere(.014,'#c47a52',body,.2+x,HY-.11+Math.abs(x)*.2,.43,4)));void freckles;
    const weapon=weaponMount(rig.arms[1]);
    box(.14,.32,.16,'#5a3a22',weapon,0,0,0);const barrel=cylinder(.07,.08,.9,'#39404a',weapon,0,.46,.02,10);
    cylinder(.1,.1,.08,'#f0c040',weapon,0,.9,.02,10);box(.08,.14,.08,'#39404a',weapon,0,.2,-.08);barrel.userData.muzzle=true;
    return {...rig,face,weapon,glowSize:[.3,1],glowY:.46,sway:sw,expr:{mouth:'smirk',browColor:c.hair}};
  },
  cook(body,c){
    const sw=[],sway=swayer(sw);
    torso(body,c,{chest:.46,waist:.32,color:c.color,height:1.0,z:.68});
    // black suit, white shirt, thin red tie
    box(.3,.9,.05,'#f6f6f2',body,0,HIP_Y+.5,.25).userData.noInk=true;
    for(const s of [-1,1]){const lapel=box(.13,.86,.06,'#20232b',body,s*.19,HIP_Y+.52,.27);lapel.rotation.z=s*-.09;}
    cylinder(.36,.36,.12,'#15171c',body,0,HIP_Y+.08,0,16).scale.z=.72;
    const tie=box(.1,.6,.05,'#c9372c',body,0,HIP_Y+.5,.29);tie.geometry.translate(0,-.26,0);tie.position.y=SHOULDER_Y+.06;sway(tie,.16,1,-.9,'x');
    const rig=limbs(body,c,{sleeve:c.color,pants:'#2b2f3a',shoes:'#0f1014',boot:'#2b2f3a',thigh:'#2b2f3a',legW:.9,armW:.9,shoulder:.58,cuff:'#f6f6f2'});
    const face=makeFace(body,c,{iris:'#3a6fa8',irisLow:'#8cc4f0',brow:.9,lash:'thin',browColor:'#c9a640',eye:.86});
    // blond swept hair with a long fringe over the left eye and a curled brow
    hairCap(body,c.hair,{scale:1.0});
    for(let i=0;i<5;i++){sway(spike(body,c.hair,-.25+i*.16,HY+.42,-.05,.36,-.6,(i-2)*-.25,.1),.08,i*.9,.3,'x');}
    const fringe=sphere(.3,c.hair,body,.17,HY+.02,.36,12);fringe.scale.set(.85,1.5,.36);fringe.rotation.z=.2;sway(fringe,.1,0,.5,'z');
    const fringe2=sphere(.2,c.hair,body,-.14,HY+.25,.36,10);fringe2.scale.set(.9,.8,.4);
    for(const side of [-1,1]){const lock=sphere(.1,c.hair,body,side*.4,HY-.04,.08,8);lock.scale.set(.7,1.5,.7);}
    const curl=noInk(new THREE.Mesh(new THREE.TorusGeometry(.04,.014,6,10,Math.PI*1.6),new THREE.MeshBasicMaterial({color:'#20232b'})));curl.position.set(-.3,HY+.2,.4);body.add(curl);
    const weapon=weaponMount(rig.arms[1]);
    return {...rig,face,weapon,glowSize:[.6,.6],glowY:-.05,sway:sw,expr:{mouth:'smirk',browColor:c.hair,hideLeftEye:true}};
  },
  stormcaller(body,c){
    const sw=[],sway=swayer(sw);
    torso(body,c,{chest:.44,waist:.3,color:'#fff4e0',height:.96,z:.66});
    // rose cropped jacket with a white collar, belt and a short flared skirt
    for(const s of [-1,1]){const half=box(.24,.62,.18,c.color,body,s*.23,HIP_Y+.66,.1);half.rotation.z=s*.06;}
    const collar=box(.6,.1,.4,'#ffffff',body,0,SHOULDER_Y+.04,.04);collar.userData.noInk=false;
    cylinder(.34,.34,.1,'#3a2c44',body,0,HIP_Y+.14,0,16).scale.z=.7;box(.1,.09,.05,c.accent,body,0,HIP_Y+.14,.28);
    const skirt=cylinder(.34,.6,.42,'#3a2c44',body,0,HIP_Y-.1,0,18);skirt.scale.z=.95;
    const rig=limbs(body,c,{sleeve:'#fff4e0',pants:'#4a3a5a',thigh:c.skin,shoes:'#e8d3b0',boot:'#e8d3b0',legW:.86,armW:.84,shoulder:.55,shoulderColor:c.color,cuff:c.color});
    const face=makeFace(body,c,{iris:'#a8561a',irisLow:'#ffcf6a',lash:'long',brow:.7,cute:true,jaw:.96,browColor:'#d9761f',eye:1.02});
    // long orange hair: swept fringe, twin tails with bows, hair falling behind the shoulders
    hairCap(body,c.hair,{scale:1.05});
    for(const [x,t,l] of [[-.26,.25,.34],[-.1,.1,.4],[.06,-.05,.38],[.22,-.2,.34]])sway(bang(body,c.hair,x,HY+.28,l,t,.12,.37),.05,x*10,.15,'z');
    for(const side of [-1,1]){
      const lock=sway(sphere(.12,c.hair,body,side*.43,HY-.06,.12,8),.14,side+1.5,.35,'z');lock.scale.set(.7,1.9,.7);
      const tailG=new THREE.Group();tailG.position.set(side*.45,HY+.2,-.12);body.add(tailG);
      for(let k=0;k<4;k++){const s=sphere(.17-k*.02,c.hair,tailG,side*k*.13,-k*.24,-.02*k,8);s.scale.set(.85,1.1,.85);}
      const bow=cone(.1,.24,c.accent,tailG,0,0,0,4);bow.rotation.z=Math.PI/2;cone(.1,.24,c.accent,tailG,0,0,0,4).rotation.z=-Math.PI/2;
      sway(tailG,.22,side+1,.5,'z');
    }
    const back=sway(sphere(.36,c.hair,body,0,HY-.2,-.28,10),.1,0,.6,'x');back.scale.set(1.1,1.5,.55);
    const staff=weaponMount(rig.arms[1]);
    cylinder(.045,.045,1.25,'#6b4a2a',staff,0,.55,0,8);sphere(.15,'#fff4b0',staff,0,1.24,0,10);
    for(const a of [0,2.1,4.2])sphere(.07,'#7fd8ff',staff,Math.cos(a)*.21,1.24,Math.sin(a)*.21,6);
    return {...rig,face,weapon:staff,glowSize:[.36,1.3],glowY:.6,sway:sw,expr:{mouth:'smile',browColor:'#d9761f'}};
  },
};

// Status effect decorations are identical for every character.
function statusFx(root,body){
  const poisonFx=new THREE.Group(),virusFx=new THREE.Group(),iceFx=new THREE.Group(),burnFx=new THREE.Group();root.add(poisonFx,virusFx,iceFx,burnFx);
  const poisonBubbles=[];for(let i=0;i<8;i++){const a=i*Math.PI*2/8,r=.48+(i%3)*.13,b=fxMesh(new THREE.SphereGeometry(.09+(i%2)*.035,10,8),i%2?'#78ff8c':'#c4ff75',poisonFx,Math.cos(a)*r,.45+(i%4)*.5,Math.sin(a)*r,.72);b.userData={a,y:b.position.y,r};poisonBubbles.push(b);}
  const virusNodes=[];for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=.55+(i%2)*.15,n=fxMesh(new THREE.IcosahedronGeometry(.12+(i%3)*.025,0),i%2?'#c26cff':'#7657ff',virusFx,Math.cos(a)*r,.55+(i%3)*.65,Math.sin(a)*r,.8);n.userData={a,y:n.position.y,r};virusNodes.push(n);}
  const iceShards=[];for(const [x,y,z,s] of [[-.42,.42,.18,.42],[.42,.42,.18,.42],[-.58,1.15,.1,.34],[.58,1.15,.1,.34],[-.34,1.78,.25,.28],[.34,1.78,.25,.28]]){const shard=fxMesh(new THREE.ConeGeometry(.17,s,4),'#a9e9ff',iceFx,x,y,z,.76);shard.rotation.z=x<0?.45:-.45;iceShards.push(shard);}
  const faceFlush=fxMesh(new THREE.SphereGeometry(.47,16,12),'#ef4b3f',body,0,HEAD_Y,.02,0,false);faceFlush.scale.set(1,1.08,.96);
  const blushCheeks=[-.26,.26].map(x=>fxMesh(new THREE.CircleGeometry(.1,16),'#ff5b53',body,x,HEAD_Y-.13,.43,0,false));
  const smoke=[];for(let i=0;i<6;i++){const a=i*Math.PI*2/6,s=fxMesh(new THREE.SphereGeometry(.14+(i%3)*.035,10,8),i%2?'#26313a':'#ff7849',burnFx,Math.cos(a)*.48,.45+(i%3)*.6,Math.sin(a)*.48,i%2?.5:.8,i%2===0);s.userData={a,y:s.position.y};smoke.push(s);}
  for(const fx of [poisonFx,virusFx,iceFx,burnFx])fx.visible=false;
  return {poisonFx,poisonBubbles,virusFx,virusNodes,iceFx,iceShards,faceFlush,blushCheeks,burnFx,smoke};
}

export function buildFighter(charId,slot,parent,teamColor=null){
  const c=CHARACTERS[charId],root=new THREE.Group(),body=new THREE.Group();root.add(body);parent?.add(root);
  const rig=BUILDERS[charId](body,c);
  rig.face.update({lid:0,tilt:0,raise:0,gx:0,gy:0,eyes:'open',mouth:rig.expr?.mouth||'smile'},1);
  ink(body,.04);
  const sword=rig.weapon,[gw,gh]=rig.glowSize;
  const weaponGlow=fxMesh(new THREE.BoxGeometry(gw,gh,.16),'#ffd84e',sword,0,rig.glowY,.01,0);
  const swordTrail=fxMesh(new THREE.PlaneGeometry(gw*2.2,gh*1.2),'#ffbf28',sword,-.1,rig.glowY,-.08,0);
  const swordSparks=[];for(let i=0;i<5;i++){const spark=fxMesh(new THREE.SphereGeometry(.055+(i%2)*.025,8,6),i%2?'#fff3a0':'#ffbe2e',sword,0,.25+i*.25,.12,0);spark.userData={phase:i*.23};swordSparks.push(spark);}
  const ringColor=teamColor||SLOT_COLORS[slot]||SLOT_COLORS[0];
  const ring=mesh(new THREE.RingGeometry(.58,.7,40),ringColor,root,0,.035,0);ring.rotation.x=-Math.PI/2;ring.material=new THREE.MeshBasicMaterial({color:ringColor,side:THREE.DoubleSide,transparent:true,opacity:.9});ring.castShadow=false;
  const shield=new THREE.Mesh(new THREE.CircleGeometry(.9,32),new THREE.MeshBasicMaterial({color:'#87dfff',transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}));shield.position.set(0,1.35,.74);shield.visible=false;body.add(shield);
  const tag=label(SLOT_LABELS[slot]||'1P',ringColor,60);tag.scale.set(1.5,.38,1);tag.position.y=3.5;root.add(tag);
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
  const cam=new THREE.PerspectiveCamera(30,1,.1,20);cam.position.set(.5,2.42,3.0);cam.lookAt(0,2.2,0);
  for(const id of Object.keys(CHARACTERS)){const m=buildFighter(id,0,scene);m.ring.visible=m.tag.visible=false;m.body.rotation.y=.28;r.render(scene,cam);out[id]=r.domElement.toDataURL('image/png');disposeFighter(m);}
  r.dispose();r.forceContextLoss?.();
  return out;
}
