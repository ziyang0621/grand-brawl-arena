// Stage monsters (render only): a sea-monster tentacle, a sandworm and a yeti's fist. The simulation (arena-core.js, updateMonsters) decides when and where
// they strike; this file only builds the models and poses them from a monster's phase: warn (a pulsing marker), strike (it bursts out), retreat (it sinks).
import * as THREE from './vendor/three.module.js';
import {box,sphere,cylinder,cone,mesh,fxMesh} from './arena-gfx.js';

function marker(group,r,color){
  const disc=new THREE.Mesh(new THREE.CircleGeometry(r,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.28,depthWrite:false}));
  disc.rotation.x=-Math.PI/2;disc.position.y=.12;disc.userData.noInk=true;group.add(disc);
  const ring=new THREE.Mesh(new THREE.RingGeometry(r*.94,r,40),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.14;ring.userData.noInk=true;group.add(ring);
  return {disc,ring};
}

export function createMonsterModel(kind,r){
  const g=new THREE.Group(),body=new THREE.Group();g.add(body);
  const parts={body,kind};
  if(kind==='tentacle'){
    const skin='#7b55bf',belly='#c8a6f0';
    parts.segments=[];
    for(let i=0;i<7;i++){
      const seg=new THREE.Group(),rad=.62-i*.07;
      cylinder(rad*.86,rad,.75,skin,seg,0,.38,0,12);
      for(const a of [0,2.1,4.2])sphere(.11,belly,seg,Math.cos(a)*rad,.42,Math.sin(a)*rad,6);   // suckers
      body.add(seg);parts.segments.push(seg);
    }
    parts.tip=sphere(.3,'#9b78d8',body,0,0,0,10);
    parts.marker=marker(g,r,'#8a4fd8');
  }else if(kind==='sandworm'){
    const skin='#d9a455',ring='#b8803a';
    parts.segments=[];
    for(let i=0;i<6;i++){
      const seg=new THREE.Group(),rad=.95-i*.08;
      sphere(rad,i%2?skin:ring,seg,0,0,0,14);
      body.add(seg);parts.segments.push(seg);
    }
    const head=new THREE.Group();body.add(head);parts.head=head;
    sphere(1.05,skin,head,0,0,0,16);
    const mouth=cylinder(.78,.62,.5,'#5a2218',head,0,.62,0,16);mouth.userData.noInk=true;
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2;const tooth=cone(.11,.38,'#fff7e0',head,Math.cos(a)*.7,.78,Math.sin(a)*.7,5);tooth.rotation.x=Math.sin(a)*.3;tooth.rotation.z=-Math.cos(a)*.3;}
    parts.marker=marker(g,r,'#e0a040');
  }else{   // yeti: a giant white fist on a furry arm, slamming down from above
    const fur='#f4f8ff',shade='#cfdcee';
    const arm=cylinder(.62,.8,3.6,fur,body,0,1.8,0,12);parts.arm=arm;
    sphere(1.1,fur,body,0,0,0,14).scale.set(1.2,.9,1.1);
    for(let i=0;i<4;i++)sphere(.34,shade,body,-.6+i*.4,-.35,.8,8);
    sphere(.45,shade,body,.8,-.1,.2,8);
    parts.marker=marker(g,r,'#7ec8ff');
  }
  return {group:g,parts};
}

// phase: warn | strike | retreat; t counts down within the phase (see updateMonsters)
export function poseMonster(model,m,time){
  const {group,parts}=model,{kind,body,marker:mk}=parts;
  group.position.set(m.x,0,m.z);
  const warn=m.phase==='warn',strike=m.phase==='strike',retreat=m.phase==='retreat';
  mk.disc.material.opacity=warn?.22+.22*Math.abs(Math.sin(time*11)):0;
  mk.ring.material.opacity=warn?.55+.4*Math.abs(Math.sin(time*11)):0;
  mk.ring.scale.setScalar(warn?1+.05*Math.sin(time*11):1);
  // how far out of the ground (0..1)
  const up=warn?0:strike?Math.min(1,(.9-m.t)/.14):retreat?Math.max(0,m.t/.5):0;
  body.visible=up>.001||(kind==='yeti'&&warn);
  if(kind==='tentacle'){
    const H=6.2*up;
    parts.segments.forEach((s,i)=>{const k=i/6,sway=Math.sin(time*3+i*.7)*.25*up;s.position.set(Math.sin(k*2.2)*.9*up+sway,k*H*.92,0);s.rotation.z=-.4*up*(1-k*.4);s.scale.setScalar(.35+.65*up);});
    parts.tip.position.set(Math.sin(2.2)*.9*up,H*.97,0);parts.tip.scale.setScalar(.4+up*.6);
    body.rotation.y=Math.atan2(m.x,-m.z)+Math.PI/2;
  }else if(kind==='sandworm'){
    const H=4.4*up;
    parts.segments.forEach((s,i)=>{const k=i/5;s.position.set(Math.sin(k*2.6)*.8*up,k*H*.9,0);s.scale.setScalar(.4+.6*up);});
    parts.head.position.set(Math.sin(2.7)*.8*up,H*.98,0);parts.head.rotation.z=-.5*up;parts.head.scale.setScalar(.5+.5*up);
    body.rotation.y=time*.6;
  }else{
    const y=warn?7:strike?7-6.6*Math.min(1,(.9-m.t)/.1):retreat?.4+m.t/.5*6.6:7;
    body.position.set(0,y,0);
  }
}
