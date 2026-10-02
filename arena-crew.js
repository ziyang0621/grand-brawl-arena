// Background crew: small original sailors / islanders who man the cannons and throw the snowballs,
// so a hazard coming from outside the arena has a visible culprit with a wind-up the player can read.
import * as THREE from './vendor/three.module.js';
import {mesh,box,sphere,cylinder,cone,fxMesh,ink} from './arena-gfx.js';

const LOOKS={
  sailor:{shirt:'#f4f1e6',stripe:'#2f6fb0',pants:'#2b3a55',skin:'#f0c49a',hair:'#3a2a1e',hat:'bandana',hatColor:'#d4462f'},
  islander:{shirt:'#d9455f',stripe:'#ffffff',pants:'#4a5568',skin:'#f5cda8',hair:'#6b4a2a',hat:'beanie',hatColor:'#6fb7e8'}
};
// Faces forward (+z). Pivots: body at the hips (lean / bounce), arms at the shoulders.
export function crewMate(kind='sailor'){
  const L=LOOKS[kind]||LOOKS.sailor,g=new THREE.Group(),legs=[],arms=[];
  for(const s of [-1,1]){const leg=new THREE.Group();leg.position.set(s*.2,.95,0);g.add(leg);cylinder(.15,.14,.95,L.pants,leg,0,-.45,0,8);box(.34,.16,.5,'#2a1d17',leg,0,-.95,.08);legs.push(leg);}
  const body=new THREE.Group();body.position.y=.95;g.add(body);
  cylinder(.36,.42,.95,L.shirt,body,0,.48,0,10);
  for(const y of [.2,.5,.8])cylinder(.385,.385,.09,L.stripe,body,0,y,0,10);
  const head=new THREE.Group();head.position.y=1.38;body.add(head);
  sphere(.47,L.skin,head,0,.14,0,14);
  for(const s of [-1,1]){sphere(.075,'#17120f',head,s*.17,.17,.42,6);sphere(.025,'#ffffff',head,s*.15,.2,.47,4);}
  const mouth=sphere(.07,'#8a2f2f',head,0,-.05,.44,6);mouth.scale.set(1.4,.6,.5);
  sphere(.5,L.hair,head,0,.3,-.04,12).scale.set(1,.82,1);
  if(L.hat==='bandana'){cylinder(.5,.5,.12,L.hatColor,head,0,.4,0,14);const knot=cone(.12,.4,L.hatColor,head,.1,.35,-.5,5);knot.rotation.x=-1.9;}
  else{sphere(.5,L.hatColor,head,0,.38,0,12).scale.set(1,.62,1);sphere(.14,'#ffffff',head,0,.8,0,8);cylinder(.52,.52,.1,'#ffffff',head,0,.28,0,14);}
  for(const s of [-1,1]){const arm=new THREE.Group();arm.position.set(s*.5,.82,0);body.add(arm);cylinder(.12,.11,.78,L.shirt,arm,0,-.38,0,8);sphere(.14,L.skin,arm,0,-.82,0,8);arms.push(arm);}
  // torch (held in the right hand when lighting a fuse) and a snowball slot
  const torch=new THREE.Group();torch.position.set(0,-.85,.12);arms[1].add(torch);torch.visible=false;
  cylinder(.04,.05,.7,'#6a4a2a',torch,0,.3,0,6);
  const flame=fxMesh(new THREE.SphereGeometry(.17,8,6),'#ff9a2a',torch,0,.75,0,.95);flame.scale.set(1,1.5,1);
  ink(g,.04);g.userData={body,head,legs,arms,torch,flame};return g;
}

// Cannon crew: lights the fuse as the wind-up fills (k 0..1), then hops back and cheers.
export function poseCannonCrew(c,k,t,fired,after){
  const {body,head,arms,legs,torch,flame}=c.userData;
  torch.visible=true;flame.scale.set(1+.15*Math.sin(t*30),1.5+.35*Math.sin(t*23),1);
  if(!fired){
    const reach=Math.min(1,k*1.4);
    body.rotation.x=.12+reach*.25;body.position.y=.95-reach*.08;head.rotation.x=-.15;head.rotation.y=Math.sin(t*3)*.1;
    arms[1].rotation.set(-1.1-reach*.6,0,-.15);arms[0].rotation.set(-.3+Math.sin(t*14)*.08*k,0,.35);
    legs[0].rotation.x=-.2;legs[1].rotation.x=.15;
  }else{
    const r=Math.min(1,after/.5),hop=Math.sin(Math.min(1,after/.45)*Math.PI);
    c.position.y=hop*.5;body.rotation.x=-.2*hop;torch.visible=false;
    arms[0].rotation.set(-2.9,0,.25);arms[1].rotation.set(-2.7+Math.sin(after*18)*.25,0,-.25);head.rotation.x=-.25;legs[0].rotation.x=legs[1].rotation.x=-.2*hop;
  }
}
// Snowball thrower: packs the ball (pats it, ball grows), winds back, then hurls it.
export function poseSnowCrew(c,k,t,fired,after){
  const {body,head,arms,legs}=c.userData;
  if(!fired){
    const pat=Math.sin(t*(10+k*8));
    body.rotation.x=.25+k*.15;head.rotation.x=.2;
    arms[0].rotation.set(-1.3+pat*.25,0,.2);arms[1].rotation.set(-1.3-pat*.25,0,-.2);
    // by the end the ball is lifted overhead for the throw
    const lift=Math.max(0,(k-.7)/.3);arms[0].rotation.x-=lift*1.3;arms[1].rotation.x-=lift*1.3;body.rotation.x-=lift*.5;
    legs[0].rotation.x=-.25;legs[1].rotation.x=.25;
  }else{
    const r=Math.min(1,after/.35),ease=1-(1-r)*(1-r);
    body.rotation.x=-.55+ease*1.0;head.rotation.x=-.1;
    arms[0].rotation.set(-2.6+ease*2.5,0,.15);arms[1].rotation.set(-2.6+ease*2.5,0,-.15);
    legs[0].rotation.x=-.5*ease;legs[1].rotation.x=.4*ease;
    if(after>.6){const cheer=Math.abs(Math.sin(after*8));arms[0].rotation.set(-2.9,0,.3);arms[1].rotation.set(-2.9,0,-.3);c.position.y=cheer*.18;}
  }
}
