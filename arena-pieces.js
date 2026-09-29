// Models for the destructible stage set pieces (masts, pillars, ice columns).
import * as THREE from './vendor/three.module.js';
import {box,cylinder,cone,sphere,ink} from './arena-gfx.js';

const FALL=.7,QUARTER=Math.PI/2;
const up=new THREE.Vector3();
function cracks(parent,h,color){
  const g=new THREE.Group();
  for(const [y,rz,len] of [[.28,.5,1.1],[.5,-.6,.9],[.7,.3,.7]]){const c=box(.06,len,.06,color,g,0,h*y,0);c.position.z=.52;c.rotation.z=rz;c.castShadow=false;c.userData.noInk=true;}
  g.visible=false;parent.add(g);return g;
}
const BUILDERS={
  mast(pivot,pc){
    cylinder(.26,.34,pc.h,'#9a6a3c',pivot,0,pc.h/2,0);
    box(2.6,.2,.2,'#7a4f2c',pivot,0,pc.h*.8,0);
    box(2.1,1.5,.06,'#f4ead0',pivot,.1,pc.h*.62,.12);
    box(.9,.5,.05,'#d4462f',pivot,-.5,pc.h+.05,0);
    cylinder(.6,.7,.5,'#6a4c34',pivot,0,.25,0);
    return {crack:'#3a2418'};
  },
  pillar(pivot,pc){
    cylinder(.62,.7,pc.h*.86,'#e0c38a',pivot,0,pc.h*.43,0,16);
    for(const y of [.25,.55,.8])cylinder(.68,.68,.14,'#c9a566',pivot,0,pc.h*y,0,16);
    box(1.9,.5,1.9,'#d1b077',pivot,0,pc.h*.86+.25,0);
    box(1.6,.32,1.6,'#c9a566',pivot,0,.16,0);
    return {crack:'#5a4224'};
  },
  ice(pivot,pc){
    cone(.85,pc.h,'#bdeaff',pivot,0,pc.h/2,0,7);
    cone(.5,pc.h*.7,'#d9f4ff',pivot,.6,pc.h*.35,.3,6).rotation.z=-.22;
    cone(.45,pc.h*.6,'#a4dcf8',pivot,-.55,pc.h*.3,-.25,6).rotation.z=.25;
    cylinder(.9,1,.3,'#f1fbff',pivot,0,.15,0,10);
    return {crack:'#4a8bb0'};
  }
};
export function buildPiece(pc){
  const root=new THREE.Group(),pivot=new THREE.Group();root.add(pivot);
  const {crack}=BUILDERS[pc.kind](pivot,pc);
  ink(pivot,.04);
  const crackA=cracks(pivot,pc.h*.5,crack),crackB=cracks(pivot,pc.h*.9,crack);crackB.rotation.y=2.2;
  root.position.set(pc.x,0,pc.z);
  return {root,pivot,crackA,crackB,kind:pc.kind,radius:pc.kind==='ice'?0:pc.kind==='pillar'?.7:.3};
}
export function updatePiece(m,pc,tick){
  const left=pc.hp/pc.maxHp;
  m.crackA.visible=left<.66;m.crackB.visible=left<.33;
  if(pc.state==='standing'){
    m.pivot.quaternion.identity();m.root.position.set(pc.x,0,pc.z);m.pivot.visible=true;
    if(pc.hurt>0){const k=pc.hurt/.2;m.root.position.x+=Math.sin(tick*1.7)*.09*k;m.root.position.z+=Math.cos(tick*2.3)*.09*k;}
    return;
  }
  const burst=pc.fall==='burst';
  if(pc.state==='falling'){
    const t=Math.min(1,pc.fallT/(burst?FALL*.5:FALL));
    if(burst){m.pivot.quaternion.identity();m.pivot.scale.setScalar(1+t*.25);m.root.position.set(pc.x+Math.sin(tick*3)*.1,0,pc.z);return;}
    m.pivot.quaternion.setFromAxisAngle(up.set(pc.dir.z,0,-pc.dir.x),t*t*QUARTER);return;
  }
  // down: a mast or pillar stays lying where it fell, ice leaves nothing but a burst
  if(burst){m.pivot.visible=false;return;}
  m.pivot.scale.setScalar(1);m.pivot.quaternion.setFromAxisAngle(up.set(pc.dir.z,0,-pc.dir.x),QUARTER);m.root.position.set(pc.x,m.radius*.9,pc.z);
}
export function disposePiece(m,scene){scene.remove(m.root);m.root.traverse(o=>{if(o.isMesh&&!o.userData.ink)o.geometry?.dispose();});}
