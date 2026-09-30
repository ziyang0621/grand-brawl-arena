// Character rigs: every roster member shares the same joints (body, arms, legs, weapon)
// so animation code stays generic while silhouettes and colors stay distinct.
import * as THREE from './vendor/three.module.js';
import {CHARACTERS,SLOT_COLORS,SLOT_LABELS} from './arena-roster.js';
import {box,sphere,cylinder,cone,mesh,fxMesh,label,ink} from './arena-gfx.js';
import {buildGuard,disposeGuard} from './arena-guards.js';
import {makeHead,lock,hairShellGeometry} from './arena-face.js';

// ---- Proportions: roughly five heads tall with long legs and a small head, like a PS2 anime brawler ----
// Head parts (face, hair, hats) are authored in "head space" (centre at HEAD_Y, radius HEAD_R) and shrunk
// as a group, so the whole face system scales together.
const HEAD_Y=2.28,HEAD_R=.45,HEAD_K=.86,HEAD_WORLD_Y=2.9,SHOULDER_Y=2.3,HIP_Y=1.3;
const dk=(hex,k)=>{const c=new THREE.Color(hex);c.multiplyScalar(k);return '#'+c.getHexString();};
function headGroup(body){const g=new THREE.Group();g.position.y=HEAD_WORLD_Y-HEAD_Y*HEAD_K;g.scale.setScalar(HEAD_K);body.add(g);return g;}
const capsule=(r,len,color,parent,x,y,z,seg=10)=>mesh(new THREE.CapsuleGeometry(r,len,4,seg),color,parent,x,y,z);

// Torso: a smooth lathe (hips, waist, chest, shoulders, neck) instead of a stack of cylinders.
function torso(body,c,{chest=.4,waist=.28,hip=.31,color=c.color,z=.74,skinChest=false,neckColor=c.skin}={}){
  const prof=[[hip*.92,0],[hip,.07],[(hip+waist)/2,.2],[waist,.36],[(waist+chest)/2,.6],[chest,.86],[chest*.9,.98],[.17,1.06],[.11,1.1]].map(([r,y])=>new THREE.Vector2(r,y));
  const t=mesh(new THREE.LatheGeometry(prof,22),color,body,0,HIP_Y,0);t.scale.z=z;
  if(skinChest){const sp=prof.map(v=>new THREE.Vector2(v.x*.62,v.y));const sk=mesh(new THREE.LatheGeometry(sp,16),c.skin,body,0,HIP_Y+.02,.05);sk.scale.z=z;}
  const hips=cylinder(hip+.02,hip+.04,.22,dk(color,.62),body,0,HIP_Y+.02,0,18);hips.scale.z=z+.06;
  cylinder(.11,.13,.3,neckColor,body,0,SHOULDER_Y+.14,.01,10);
  return t;
}
// Limbs with real knees and elbows. Each leg/arm group is the hip/shoulder; `userData.knee` / `userData.elbow`
// are child groups that bend, so jumps, landings and swings can fold the limb instead of swinging it stiffly.
function hand(parent,c,glove,armW){
  const col=glove||c.skin,g=new THREE.Group();g.position.set(0,-.53,.03);parent.add(g);
  const palm=sphere(.09*armW,col,g,0,0,0,10);palm.scale.set(1,1.05,.85);
  // four curled fingers and a thumb, so the fist reads as a hand and not a ball
  for(let i=0;i<4;i++){const f=capsule(.026*armW,.05,col,g,(i-1.5)*.038*armW,-.085,.045,6);f.rotation.x=.55;}
  const th=capsule(.03*armW,.04,col,g,-.085*armW,-.02,.05,6);th.rotation.z=.8;th.rotation.x=.4;
  return g;
}
function limbs(body,c,{sleeve=c.color,pants='#2a3144',shoes='#3b2a22',bareArms=false,glove=null,boot=null,thigh=null,legW=1.1,armW=1.14,shoulder=.5,shoulderColor=null,cuff=null}={}){
  const legs=[];
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.16,HIP_Y-.02,0);body.add(leg);
    capsule(.135*legW,.44,thigh||pants,leg,0,-.33,0,12);
    sphere(.128*legW,thigh||pants,leg,0,-.56,0,10);
    const knee=new THREE.Group();knee.position.set(0,-.57,0);leg.add(knee);
    capsule(.105*legW,.44,boot||pants,knee,0,-.26,0,12);
    if(boot)cylinder(.125*legW,.13*legW,.46,boot,knee,0,-.35,0,12);
    if(cuff)cylinder(.14*legW,.14*legW,.06,cuff,knee,0,-.05,0,12);
    box(.24*legW,.13,.4,shoes,knee,0,-.64,.08);sphere(.125*legW,shoes,knee,0,-.62,.24,8).scale.set(1,.65,.85);
    leg.userData.knee=knee;legs.push(leg);
  }
  const arms=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*shoulder,SHOULDER_Y-.06,0);body.add(arm);arm.userData.side=side;
    sphere(.15*armW,shoulderColor||sleeve,arm,0,-.02,0,12);
    capsule(.088*armW,.34,sleeve,arm,0,-.29,0);
    sphere(.084*armW,bareArms?c.skin:sleeve,arm,0,-.5,0,8);
    const fore=new THREE.Group();fore.position.set(0,-.5,0);arm.add(fore);
    capsule(.075*armW,.34,bareArms?c.skin:sleeve,fore,0,-.2,0);
    if(cuff)cylinder(.1*armW,.1*armW,.07,cuff,fore,0,-.43,0,10);
    hand(fore,c,glove,armW);
    arm.userData.elbow=fore;arms.push(arm);
  }
  return {legs,arms};
}
function weaponMount(arm){const g=new THREE.Group();g.position.set(.02,-.62,.14);g.rotation.set(.62,0,-.62);(arm.userData.elbow||arm).add(g);return g;}

// ---- Faces: big two-tone eyes with lids, brows, mouths and reaction marks, all driven by one expression state ----
const noInk=m=>{m.userData.noInk=true;m.castShadow=false;return m;};
const arcGeo=(r,tube,arc=Math.PI)=>new THREE.TorusGeometry(r,tube,6,14,arc);
function makeFace(body,c,{iris='#2a2f3c',irisLow='#5a6a88',lash='thin',brow=1,jaw=1,cute=false,browColor=c.hair,lidColor=c.skin,eye=1,nose=1}={}){
  const HY=HEAD_Y,R=HEAD_R;
  const head=sphere(R,c.skin,body,0,HY,.02,26);head.scale.set(jaw,1.08,.96);
  const faceZ=.41;
  // ears and nose
  for(const side of [-1,1])sphere(.085,c.skin,body,side*R*.98,HY-.02,-.02,8);
  noInk(cone(.04*Math.min(nose,1.3),.1*nose,dk(c.skin,.93),body,0,HY-.09,faceZ+.03+(nose>1.5?.06:0),8)).rotation.x=Math.PI/2;
  const eyes=[];
  for(const side of [-1,1]){
    const g=new THREE.Group();g.position.set(side*.185,HY-.005,faceZ);g.rotation.y=side*.12;g.scale.setScalar(eye*.86);body.add(g);
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
  // the wide open-mouthed grin that anime pirates wear
  mk('grin',gp=>{const m=noInk(new THREE.Mesh(new THREE.CircleGeometry(.17,16,Math.PI,Math.PI),new THREE.MeshBasicMaterial({color:'#3a1212',side:THREE.DoubleSide})));m.position.set(0,.06,0);m.scale.set(1.15,.95,1);gp.add(m);
    noInk(box(.3,.045,.03,'#ffffff',gp,0,.052,.02));const t=noInk(sphere(.075,'#e8607a',gp,0,-.06,.02,8));t.scale.set(1.4,.5,.3);
    const line=noInk(new THREE.Mesh(arcGeo(.19,.02,Math.PI),new THREE.MeshBasicMaterial({color:'#14161c'})));line.rotation.z=Math.PI;line.position.set(0,.13,.01);line.scale.set(1.15,.95,1);gp.add(line);});
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
// Hair mass: a shell over the crown and back of the head; the face is left open for the painted features.
function hairMass(hd,color,{scale=1.07,back=.08,up=.05}={}){const h=mesh(hairShellGeometry(HEAD_R*scale),color,hd,0,HY+up,-back+.02);h.scale.set(1.02,1,1.04);return h;}
// L: one tapered lock on the head that sways a little.
let swayList=null;
function L(hd,color,pts,r0,amp=.05,ph=0){const g=lock(hd,color,pts,r0*1.4,0,{cy:HY,flat:.45});if(swayList)swayList.push({o:g,ax:'z',amp,ph,drag:.25,base:0});return g;}
function hairCap(body,color,{scale=1,lift=.11,back=-.06}={}){const h=sphere(HEAD_R+.05,color,body,0,HY+lift,back,18);h.scale.set(1.02*scale,.8,1.04*scale);return h;}
function spike(body,color,x,y,z,len,rx,rz,w=.12){const sp=cone(w,len,color,body,x,y,z,6);sp.rotation.set(rx,0,rz);return sp;}
function bang(body,color,x,y,len=.36,tilt=0,w=.11,z=.36){const b=cone(w,len,color,body,x,y,z,6);b.rotation.set(Math.PI-.25,0,tilt);return b;}

const BUILDERS={
  swordsman(body,c){
    const sw=[],sway=swayer(sw),hd=headGroup(body);swayList=sw;
    torso(body,c,{chest:.42,waist:.29,color:'#f6ecd2'});
    // red coat worn open over a white shirt, gold piping, belt with buckle, sash
    for(const s of [-1,1]){const half=box(.2,.98,.15,c.color,body,s*.27,HIP_Y+.5,.1);half.rotation.z=s*.05;box(.04,.98,.05,c.accent,body,s*.15,HIP_Y+.5,.19).rotation.z=s*.05;}
    cylinder(.33,.33,.12,'#2a1c14',body,0,HIP_Y+.1,0,16).scale.z=.66;box(.12,.1,.05,c.accent,body,0,HIP_Y+.1,.24);
    const sash=sway(box(.2,.7,.05,'#f6ecd2',body,.24,HIP_Y-.3,.2),.14,0,1.1);sash.geometry.translate(0,-.3,0);sash.position.y=HIP_Y+.05;sash.rotation.x=.12;sw[0].base=.12;
    // captain's hat slung down his back on a cord
    const hat=new THREE.Group();hat.position.set(0,SHOULDER_Y-.2,-.32);hat.rotation.x=.55;body.add(hat);
    cylinder(.5,.54,.05,'#e9c66a',hat,0,0,0,20);cylinder(.24,.28,.22,'#e9c66a',hat,0,.12,0,16);cylinder(.28,.28,.06,c.color,hat,0,.08,0,16);sway(hat,.08,1.7,.6,'z');
    for(const sd of [-1,1])box(.02,.42,.02,'#8a6a3a',body,sd*.16,SHOULDER_Y-.02,.02).rotation.z=sd*.25;
    const rig=limbs(body,c,{sleeve:c.color,pants:'#232a3c',shoes:'#1c1614',boot:'#2a2a34',cuff:'#c9372c'});
    const face=makeHead(hd,c,{iris:'#4a2a16',irisLow:'#b0743a',brow:1.25,eye:.88,scar:true,eyeStyle:'sharp',browStyle:'angry',noseStyle:'dot',grinW:1.35,grinH:1.2,grinLines:true,jaw:1.05});
    hairMass(hd,c.hair);
    // messy spikes swept up and back from the crown
    for(let i=0;i<7;i++){const a=-1.2+i*.4,x=Math.sin(a)*.3;L(hd,c.hair,[[x,HY+.36,-.02],[x*1.5,HY+.6,-.2],[x*2,HY+.64,-.46]],.14,.07,i);}
    for(const [x,y] of [[-.42,HY+.1],[.42,HY+.1]])L(hd,c.hair,[[x*.8,y+.25,-.1],[x*1.15,y+.05,-.08],[x*1.2,y-.18,.02]],.1,.1,x*9);
    // jagged fringe that falls out under the headband
    for(const [x,t] of [[-.27,.9],[-.1,.3],[.07,-.2],[.24,-.8]])L(hd,c.hair,[[x,HY+.3,.3],[x+t*.04,HY+.22,.43],[x+t*.1,HY+.06,.47]],.1,.05,x*7);
    cylinder(HEAD_R+.05,HEAD_R+.06,.1,c.color,hd,0,HY+.24,-.02,20).scale.z=1.02;
    for(const side of [-1,1]){const t=sway(box(.09,.42,.05,c.color,hd,side*.1,HY+.1,-.55),.3,side+1.5,.6,'z');t.geometry.translate(0,-.2,0);t.position.y=HY+.3;t.rotation.z=side*.35;sw[sw.length-1].base=side*.35;}
    sphere(.035,c.accent,hd,HEAD_R*.93,HY-.14,-.03,6);
    const weapon=weaponMount(rig.arms[1]);
    cylinder(.06,.06,.34,'#352a24',weapon,0,0,0);cylinder(.15,.15,.05,c.accent,weapon,0,.18,0);
    const blade=box(.12,1.3,.05,'#eef6f8',weapon,0,.86,0);blade.rotation.z=-.04;
    cone(.08,.22,'#eef6f8',weapon,-.03,1.62,0,4).rotation.y=.8;
    return {...rig,face,head:hd,weapon,glowSize:[.32,1.6],glowY:.86,sway:sw,expr:{mouth:'grin'}};
  },
  guardian(body,c){
    const sw=[],sway=swayer(sw),hd=headGroup(body);swayList=sw;
    torso(body,c,{chest:.42,waist:.3,color:c.color});
    // buttoned navy jacket, white cross belts, epaulettes and a sash
    box(.36,.86,.05,'#f2f4f6',body,0,HIP_Y+.5,.22).userData.noInk=true;
    for(let i=0;i<4;i++)sphere(.035,c.accent,body,0,HIP_Y+.2+i*.2,.26,6).userData.noInk=true;
    for(const s of [-1,1]){const belt=box(.08,.98,.04,'#f8fafb',body,s*.05,HIP_Y+.55,.24);belt.rotation.z=s*.5;belt.userData.noInk=true;}
    cylinder(.33,.33,.12,'#1b2a3a',body,0,HIP_Y+.1,0,16).scale.z=.66;box(.11,.09,.05,c.accent,body,0,HIP_Y+.1,.24);
    const sash=sway(box(.16,.6,.05,c.accent,body,-.26,HIP_Y-.2,.2),.12,1,1);sash.geometry.translate(0,-.26,0);sash.position.y=HIP_Y+.02;
    for(const s of [-1,1]){box(.3,.07,.26,c.accent,body,s*.42,SHOULDER_Y-.02,0).rotation.z=s*-.16;}
    const rig=limbs(body,c,{sleeve:c.color,pants:'#e8edf2',shoes:'#141c2a',glove:'#f6f8fa',boot:'#1c2a3a',cuff:c.accent});
    const face=makeHead(hd,c,{iris:'#1d3f7a',irisLow:'#6aa8e8',eye:.86,eyeStyle:'stern',browStyle:'straight',noseStyle:'line',square:.7,chin:1.08,stubble:true,mole:true,mouthW:.85});
    hairMass(hd,c.hair,{back:.1});
    // neat side-parted fringe and sideburns under the cap
    for(const [x,t] of [[-.3,.5],[-.14,.3],[.02,.15],[.18,.1]])L(hd,c.hair,[[x,HY+.3,.3],[x+t*.06,HY+.24,.43],[x+t*.14,HY+.1,.46]],.1,.03,x*6);
    for(const side of [-1,1])L(hd,c.hair,[[side*.4,HY+.2,.02],[side*.44,HY-.02,.08],[side*.42,HY-.2,.12]],.08,.02,side);
    cylinder(HEAD_R+.07,HEAD_R+.09,.26,'#f4f6f8',hd,0,HY+.38,-.02,22).scale.z=1.02;
    cylinder(HEAD_R+.1,HEAD_R+.1,.05,'#141c2a',hd,0,HY+.27,.16,22).scale.z=.92;
    sphere(.09,c.accent,hd,0,HY+.39,HEAD_R+.07,8).scale.z=.4;
    const buckler=new THREE.Group();buckler.position.set(0,-.32,.2);rig.arms[0].userData.elbow.add(buckler);
    const rim=cylinder(.5,.5,.12,c.accent,buckler,0,0,0,22);rim.rotation.x=Math.PI/2;
    const plate=cylinder(.43,.43,.14,c.color,buckler,0,0,.02,22);plate.rotation.x=Math.PI/2;sphere(.14,'#f1e3b5',buckler,0,0,.12,10);
    const blade=weaponMount(rig.arms[1]);
    cylinder(.07,.07,.3,'#3b3027',blade,0,0,0);box(.46,.09,.14,c.accent,blade,0,.15,0);box(.2,.9,.07,'#e3eef2',blade,0,.62,0);
    return {...rig,face,head:hd,weapon:blade,glowSize:[.38,1.1],glowY:.62,sway:sw,expr:{mouth:'flat'}};
  },
  brawler(body,c){
    const sw=[],sway=swayer(sw),hd=headGroup(body);swayList=sw;
    torso(body,c,{chest:.52,waist:.36,hip:.38,color:c.color,skinChest:true,z:.78});
    // open green vest over a bare chest, orange sash, big buckle, star scar
    for(const s of [-1,1]){const half=box(.22,.98,.16,c.color,body,s*.36,HIP_Y+.52,.08);half.rotation.z=s*.08;}
    for(const r of [0,1.26,2.51,3.77,5.03]){const ray=noInk(box(.26,.03,.02,'#9a4a3a',body,0,HIP_Y+.66,.32));ray.rotation.z=r*.5+.3;}
    cylinder(.4,.4,.14,'#3a2a20',body,0,HIP_Y+.1,0,16).scale.z=.7;box(.18,.14,.05,c.accent,body,0,HIP_Y+.1,.29);
    const sash=sway(box(.18,.7,.05,c.accent,body,-.3,HIP_Y-.3,.2),.14,0,1.1);sash.geometry.translate(0,-.3,0);sash.position.y=HIP_Y+.05;
    const rig=limbs(body,c,{sleeve:c.skin,bareArms:true,pants:'#4a5a78',shoes:'#2a1d18',glove:c.accent,boot:'#3a2a20',legW:1.12,armW:1.3,shoulder:.56,shoulderColor:c.skin});
    for(const arm of rig.arms){const wrap=cylinder(.115,.115,.14,'#ffffff',arm.userData.elbow,0,-.44,0,10);wrap.scale.set(1.05,1,1.05);}
    const face=makeHead(hd,c,{iris:'#1f5a22',irisLow:'#78c060',eye:.8,plaster:true,eyeStyle:'fierce',browStyle:'bushy',noseStyle:'broad',teeth:'shark',square:1,jaw:.6,chin:1.12,cheek:1.08,cheekLines:true,grinW:1.5,grinH:1.3,eyeY:.02});
    hairMass(hd,c.hair,{scale:1.04});
    // wild spikes that stand straight up and flare out
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2,x=Math.cos(a)*.26,z=Math.sin(a)*.22-.06;L(hd,c.hair,[[x,HY+.34,z],[x*1.5,HY+.62,z*1.4],[x*2,HY+.9,z*1.8]],.16,.05,i);}
    for(const [x,t] of [[-.2,1],[.02,0],[.22,-1]])L(hd,c.hair,[[x,HY+.32,.28],[x+t*.05,HY+.24,.43],[x+t*.12,HY+.1,.47]],.13,.03,x*7);
    cylinder(HEAD_R+.05,HEAD_R+.06,.12,c.accent,hd,0,HY+.25,-.02,20).scale.z=1.02;
    const weapon=weaponMount(rig.arms[1]);
    return {...rig,face,head:hd,weapon,glowSize:[.7,.7],glowY:-.05,sway:sw,expr:{mouth:'grin'}};
  },
  gunner(body,c){
    const sw=[],sway=swayer(sw),hd=headGroup(body);swayList=sw;
    torso(body,c,{chest:.4,waist:.29,color:c.color});
    // gold jacket lined in purple, cartridge bandolier, scarf
    box(.34,.9,.05,'#3a2a4a',body,0,HIP_Y+.5,.21).userData.noInk=true;
    const strap=box(.12,1.15,.05,'#5a3a22',body,0,HIP_Y+.52,.25);strap.rotation.z=.68;strap.userData.noInk=true;
    for(let i=0;i<5;i++)cylinder(.035,.035,.13,'#f0c040',body,-.27+i*.135,HIP_Y+.85-(-.27+i*.135)*.9+.02,.29,6);
    cylinder(.33,.33,.12,'#3a2a4a',body,0,HIP_Y+.1,0,16).scale.z=.66;box(.11,.09,.05,'#f0c040',body,0,HIP_Y+.1,.24);
    box(.74,.18,.42,c.accent,body,0,SHOULDER_Y+.06,.01);
    const tail=box(.18,.66,.06,c.accent,body,.24,SHOULDER_Y-.24,-.3);tail.geometry.translate(0,-.3,0);tail.position.y=SHOULDER_Y+.04;tail.rotation.z=-.3;sway(tail,.28,0,1.4,'x');sway(tail,.15,2,0,'z');
    const rig=limbs(body,c,{sleeve:c.color,pants:'#5b4636',shoes:'#2b221c',glove:'#3a2a4a',boot:'#4a3628',cuff:'#3a2a4a',armW:.95});
    const face=makeHead(hd,c,{iris:'#5a2a10',irisLow:'#d49040',eye:.86,freckles:[[118,.7],[134,.74],[104,.75]],eyeStyle:'round',browStyle:'thin',noseStyle:'none',teeth:'buck',jaw:.7,chin:.92,cheek:1.06,spread:.9,eyeY:-.02,grinW:1.1});
    hairMass(hd,c.hair,{scale:1.1});
    // a long comic nose that sticks straight out
    {const n=cylinder(.035,.075,.4,c.skin,hd,0,HY-.08,.6,12);n.rotation.x=Math.PI/2;const tip=sphere(.052,'#f2b9a0',hd,0,HY-.08,.8,12);tip.scale.set(1,.9,1.1);}
    // curly mop: fat curls round the crown, short curled fringe
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const curl=sphere(.17,c.hair,hd,Math.cos(a)*.4,HY+.34+Math.sin(a*3)*.05,Math.sin(a)*.36-.1,10);sway(curl,.05,i,.2,'x');}
    for(const [x,t] of [[-.24,.8],[-.06,.2],[.14,-.4]])L(hd,c.hair,[[x,HY+.32,.28],[x+t*.05,HY+.26,.42],[x+t*.12,HY+.14,.44]],.11,.04,x*5);
    cylinder(HEAD_R+.07,HEAD_R+.07,.09,'#2b2233',hd,0,HY+.3,-.02,20).scale.z=1.02;
    for(const side of [-1,1]){const rim=cylinder(.16,.16,.09,'#2b2233',hd,side*.19,HY+.4,.34,14);rim.rotation.x=Math.PI/2-.7;const lens=cylinder(.125,.125,.1,'#a8e8ff',hd,side*.19,HY+.4,.35,14);lens.rotation.x=Math.PI/2-.7;lens.userData.noInk=true;}
    const weapon=weaponMount(rig.arms[1]);
    box(.14,.32,.16,'#5a3a22',weapon,0,0,0);const barrel=cylinder(.07,.08,.9,'#39404a',weapon,0,.46,.02,10);
    cylinder(.1,.1,.08,'#f0c040',weapon,0,.9,.02,10);box(.08,.14,.08,'#39404a',weapon,0,.2,-.08);barrel.userData.muzzle=true;
    return {...rig,face,head:hd,weapon,glowSize:[.3,1],glowY:.46,sway:sw,expr:{mouth:'grin'}};
  },
  cook(body,c){
    const sw=[],sway=swayer(sw),hd=headGroup(body);swayList=sw;
    torso(body,c,{chest:.4,waist:.28,hip:.3,color:c.color,z:.7});
    // black suit, white shirt, thin red tie
    box(.28,.9,.05,'#f6f6f2',body,0,HIP_Y+.5,.2).userData.noInk=true;
    for(const s of [-1,1]){const lapel=box(.12,.86,.05,'#20232b',body,s*.17,HIP_Y+.52,.21);lapel.rotation.z=s*-.09;}
    cylinder(.3,.3,.1,'#15171c',body,0,HIP_Y+.1,0,16).scale.z=.62;
    const tie=box(.09,.6,.05,'#c9372c',body,0,HIP_Y+.5,.24);tie.geometry.translate(0,-.26,0);tie.position.y=SHOULDER_Y+.04;sway(tie,.16,1,-.9,'x');
    const rig=limbs(body,c,{sleeve:c.color,pants:'#2b2f3a',shoes:'#0f1014',boot:'#2b2f3a',thigh:'#2b2f3a',legW:.92,armW:.9,shoulder:.44,cuff:'#f6f6f2'});
    const face=makeHead(hd,c,{iris:'#1f4f8a',irisLow:'#7cb8ec',browColor:'#b8952e',eye:.9,hideSide:1,eyeStyle:'cool',browStyle:'curl',noseStyle:'hook',jaw:1.2,chin:1.1,goatee:true,mouthX:-10});
    hairMass(hd,c.hair,{back:.09});
    // long swept fringe that falls across one eye, short on the other side
    for(const [x0,x1,x2,r] of [[-.14,.1,.26,.15],[-.02,.2,.34,.14],[-.26,-.02,.12,.12]])L(hd,c.hair,[[x0,HY+.36,.22],[x1,HY+.2,.46],[x2,HY-.1,.44]],r,.03,x1*6);
    for(const [x,t] of [[-.32,.4],[-.2,.2]])L(hd,c.hair,[[x,HY+.3,.3],[x+t*.05,HY+.22,.42],[x+t*.1,HY+.12,.45]],.09,.03,x*5);
    for(const side of [-1,1])L(hd,c.hair,[[side*.4,HY+.18,-.02],[side*.44,HY-.02,.02],[side*.4,HY-.18,.04]],.08,.02,side);
    cylinder(.018,.018,.3,'#f6f6f2',hd,-.2,HY-.27,.46,6).rotation.set(0,0,1.25);sphere(.08,'#ff6a9a',hd,-.36,HY-.31,.46,10);
    const weapon=weaponMount(rig.arms[1]);
    return {...rig,face,head:hd,weapon,glowSize:[.6,.6],glowY:-.05,sway:sw,expr:{mouth:'smirk'}};
  },
  stormcaller(body,c){
    const sw=[],sway=swayer(sw),hd=headGroup(body);swayList=sw;
    torso(body,c,{chest:.37,waist:.25,hip:.29,color:'#fff4e0',z:.68});
    // rose cropped jacket, white collar, belt and a short flared skirt
    for(const s of [-1,1]){const half=box(.2,.62,.14,c.color,body,s*.2,HIP_Y+.66,.08);half.rotation.z=s*.05;}
    box(.52,.09,.34,'#ffffff',body,0,SHOULDER_Y+.02,.04);
    cylinder(.28,.28,.09,'#3a2c44',body,0,HIP_Y+.14,0,16).scale.z=.6;box(.09,.08,.05,c.accent,body,0,HIP_Y+.14,.2);
    const skirt=cylinder(.3,.56,.42,'#3a2c44',body,0,HIP_Y-.1,0,18);skirt.scale.z=.95;
    const rig=limbs(body,c,{sleeve:'#fff4e0',pants:'#4a3a5a',thigh:c.skin,shoes:'#e8d3b0',boot:'#e8d3b0',legW:.84,armW:.82,shoulder:.42,shoulderColor:c.color,cuff:c.color});
    const face=makeHead(hd,c,{iris:'#7a3a10',irisLow:'#ffc860',lash:'long',cute:true,jaw:.95,chin:.95,browColor:'#d9761f',eye:1.02,eyeStyle:'cute',browStyle:'thin',noseStyle:'button',mouthW:.8,eyeY:.02});
    hairMass(hd,c.hair,{scale:1.08});
    // soft fringe, face-framing locks and long hair flowing down the back
    for(const [x,t] of [[-.3,.7],[-.15,.3],[0,0],[.15,-.3],[.3,-.7]])L(hd,c.hair,[[x,HY+.32,.28],[x+t*.04,HY+.24,.43],[x+t*.1,HY+.1,.47]],.1,.04,x*6);
    for(const side of [-1,1])L(hd,c.hair,[[side*.38,HY+.24,.12],[side*.47,HY-.05,.2],[side*.46,HY-.45,.14],[side*.4,HY-.75,.06]],.12,.1,side+1.5);
    for(let i=0;i<5;i++){const x=(i-2)*.16;L(hd,c.hair,[[x,HY+.2,-.3],[x*1.2,HY-.2,-.46],[x*1.35,HY-.8,-.42],[x*1.3,HY-1.25,-.34]],.15,.12,i);}
    const bow=new THREE.Group();bow.position.set(.28,HY+.42,-.1);bow.rotation.z=-.4;hd.add(bow);
    for(const sd of [-1,1])cone(.12,.28,c.accent,bow,sd*.14,0,0,4).rotation.z=sd*Math.PI/2;sphere(.06,c.accent,bow,0,0,0,8);
    for(const sd of [-1,1]){const star=cone(.06,.13,'#ffe27a',hd,sd*(HEAD_R+.02),HY-.2,-.02,5);star.rotation.z=Math.PI;}
    for(const arm of rig.arms)cylinder(.1,.1,.08,'#ffe27a',arm.userData.elbow,0,-.42,0,10);
    const staff=weaponMount(rig.arms[1]);
    cylinder(.045,.045,1.25,'#6b4a2a',staff,0,.55,0,8);sphere(.15,'#fff4b0',staff,0,1.24,0,10);
    for(const a of [0,2.1,4.2])sphere(.07,'#7fd8ff',staff,Math.cos(a)*.21,1.24,Math.sin(a)*.21,6);
    return {...rig,face,head:hd,weapon:staff,glowSize:[.36,1.3],glowY:.6,sway:sw,expr:{mouth:'cat'}};
  },
};

// Status effect decorations are identical for every character.
function statusFx(root,body,head){
  const poisonFx=new THREE.Group(),virusFx=new THREE.Group(),iceFx=new THREE.Group(),burnFx=new THREE.Group();root.add(poisonFx,virusFx,iceFx,burnFx);
  const poisonBubbles=[];for(let i=0;i<8;i++){const a=i*Math.PI*2/8,r=.48+(i%3)*.13,b=fxMesh(new THREE.SphereGeometry(.09+(i%2)*.035,10,8),i%2?'#78ff8c':'#c4ff75',poisonFx,Math.cos(a)*r,.45+(i%4)*.5,Math.sin(a)*r,.72);b.userData={a,y:b.position.y,r};poisonBubbles.push(b);}
  const virusNodes=[];for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=.55+(i%2)*.15,n=fxMesh(new THREE.IcosahedronGeometry(.12+(i%3)*.025,0),i%2?'#c26cff':'#7657ff',virusFx,Math.cos(a)*r,.55+(i%3)*.65,Math.sin(a)*r,.8);n.userData={a,y:n.position.y,r};virusNodes.push(n);}
  const iceShards=[];for(const [x,y,z,s] of [[-.42,.42,.18,.42],[.42,.42,.18,.42],[-.58,1.15,.1,.34],[.58,1.15,.1,.34],[-.34,1.78,.25,.28],[.34,1.78,.25,.28]]){const shard=fxMesh(new THREE.ConeGeometry(.17,s,4),'#a9e9ff',iceFx,x,y,z,.76);shard.rotation.z=x<0?.45:-.45;iceShards.push(shard);}
  const faceFlush=fxMesh(new THREE.SphereGeometry(.47,16,12),'#ef4b3f',head,0,HEAD_Y,.02,0,false);faceFlush.scale.set(1,1.08,.96);
  const blushCheeks=[-.26,.26].map(x=>fxMesh(new THREE.CircleGeometry(.1,16),'#ff5b53',head,x,HEAD_Y-.13,.43,0,false));
  const smoke=[];for(let i=0;i<6;i++){const a=i*Math.PI*2/6,s=fxMesh(new THREE.SphereGeometry(.14+(i%3)*.035,10,8),i%2?'#26313a':'#ff7849',burnFx,Math.cos(a)*.48,.45+(i%3)*.6,Math.sin(a)*.48,i%2?.5:.8,i%2===0);s.userData={a,y:s.position.y};smoke.push(s);}
  for(const fx of [poisonFx,virusFx,iceFx,burnFx])fx.visible=false;
  return {poisonFx,poisonBubbles,virusFx,virusNodes,iceFx,iceShards,faceFlush,blushCheeks,burnFx,smoke};
}

export function buildFighter(charId,slot,parent,teamColor=null){
  const c=CHARACTERS[charId],root=new THREE.Group(),body=new THREE.Group();root.add(body);parent?.add(root);
  const rig=BUILDERS[charId](body,c);
  rig.face.update({lid:0,tilt:0,raise:0,gx:0,gy:0,eyes:'open',mouth:rig.expr?.mouth||'smile'},1);
  ink(body,.03);
  const sword=rig.weapon,[gw,gh]=rig.glowSize;
  const weaponGlow=fxMesh(new THREE.BoxGeometry(gw,gh,.16),'#ffd84e',sword,0,rig.glowY,.01,0);
  const swordTrail=fxMesh(new THREE.PlaneGeometry(gw*2.2,gh*1.2),'#ffbf28',sword,-.1,rig.glowY,-.08,0);
  const swordSparks=[];for(let i=0;i<5;i++){const spark=fxMesh(new THREE.SphereGeometry(.055+(i%2)*.025,8,6),i%2?'#fff3a0':'#ffbe2e',sword,0,.25+i*.25,.12,0);spark.userData={phase:i*.23};swordSparks.push(spark);}
  const ringColor=teamColor||SLOT_COLORS[slot]||SLOT_COLORS[0];
  const ring=mesh(new THREE.RingGeometry(.58,.7,40),ringColor,root,0,.035,0);ring.rotation.x=-Math.PI/2;ring.material=new THREE.MeshBasicMaterial({color:ringColor,side:THREE.DoubleSide,transparent:true,opacity:.9});ring.castShadow=false;
  const guard=buildGuard(charId,body,c);
  const tag=label(SLOT_LABELS[slot]||'1P',ringColor,60);tag.scale.set(1.5,.38,1);tag.position.y=3.85;root.add(tag);
  return {char:charId,root,body,...rig,sword,weaponGlow,swordTrail,swordSparks,ring,guard,tag,...statusFx(root,body,rig.head)};
}
export function disposeFighter(m){
  m.root.parent?.remove(m.root);if(m.guard)disposeGuard(m.guard);
  m.root.traverse(o=>{if(o.isMesh&&!o.userData.ink)o.geometry.dispose();if(o.material&&!o.material.isMeshToonMaterial&&o.material.side!==THREE.BackSide){o.material.map?.dispose();o.material.dispose();}});
}

// Portraits are rendered once from the real models so HUD, select screen and cut-ins match.
export function renderPortraits(){
  const out={};let r;
  try{r=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});}catch(_){return out;}
  r.setSize(256,256,false);r.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#ffffff','#8a93a8',2.2));const key=new THREE.DirectionalLight('#ffffff',2.4);key.position.set(2,4,5);scene.add(key);
  const cam=new THREE.PerspectiveCamera(30,1,.1,20);cam.position.set(.5,2.95,3.35);cam.lookAt(0,2.66,0);
  for(const id of Object.keys(CHARACTERS)){const m=buildFighter(id,0,scene);m.ring.visible=m.tag.visible=false;m.body.rotation.y=.28;r.render(scene,cam);out[id]=r.domElement.toDataURL('image/png');disposeFighter(m);}
  r.dispose();r.forceContextLoss?.();
  return out;
}
