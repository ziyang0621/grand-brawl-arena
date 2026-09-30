// One guard per character. R no longer raises the same see-through disc for everyone:
//  swordsman  crossed-blade slash barrier with a spinning red crescent
//  guardian   a solid navy tower shield with a gold anchor crest
//  brawler    crossed orange fists inside a pulsing flame aura
//  gunner     a ring of orbiting cartridges around a purple hex plate
//  cook       a spinning ring of fire at knee height, one leg raised
//  stormcaller a wind-and-lightning ring with cloud puffs
// Every guard is opaque or nearly so (no more glass), and flashes when it takes a hit.
import * as THREE from './vendor/three.module.js';
import {box,sphere,cylinder,cone,ink,fxMesh} from './arena-gfx.js';

const solid=(color,opacity=1)=>new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity>=1,side:THREE.DoubleSide});
const arc=(inner,outer,start,len,color,opacity=.95)=>{const m=new THREE.Mesh(new THREE.RingGeometry(inner,outer,28,1,start,len),solid(color,opacity));return m;};
function bolt(parent,color,len=.9){
  const g=new THREE.Group(),pts=[[0,0],[.12,-len*.25],[-.1,-len*.45],[.13,-len*.7],[0,-len]];
  for(let i=0;i<pts.length-1;i++){const [x0,y0]=pts[i],[x1,y1]=pts[i+1],l=Math.hypot(x1-x0,y1-y0),seg=new THREE.Mesh(new THREE.PlaneGeometry(.05,l+.04),solid(color));seg.position.set((x0+x1)/2,(y0+y1)/2,0);seg.rotation.z=Math.atan2(x1-x0,-(y1-y0))*-1;g.add(seg);}
  parent.add(g);return g;
}

const BUILDERS={
  swordsman(g){
    // two blades crossed in front of the chest, and a red crescent that spins behind them
    const cross=new THREE.Group();cross.position.set(0,1.82,.85);g.add(cross);
    for(const s of [-1,1]){const b=box(.13,1.55,.05,'#eef6f8',cross,0,0,0);b.rotation.z=s*.9;const guard=box(.5,.09,.09,'#ffd24a',cross,Math.sin(s*.9)*.5,-Math.cos(.9)*.5,0);guard.rotation.z=s*.9;}
    const crescent=new THREE.Group();crescent.position.set(0,1.82,.7);g.add(crescent);
    crescent.add(arc(.72,.95,-1.2,2.4,'#e0432b'));crescent.add(arc(.9,1.02,-1.2,2.4,'#ffd24a'));
    const spark=[];for(let i=0;i<6;i++){const s=sphere(.06,'#fff2b0',g,0,0,0,6);s.userData.noInk=true;spark.push(s);}
    return {cross,crescent,spark,tick(t,k){crescent.rotation.z=t*3.5;cross.rotation.z=Math.sin(t*9)*.03;spark.forEach((s,i)=>{const a=t*4+i*1.05;s.position.set(Math.cos(a)*.95,1.82+Math.sin(a)*.95,.75);s.scale.setScalar(.8+.5*Math.sin(t*12+i));});}};
  },
  guardian(g){
    // a big solid tower shield: navy face, gold rim, white anchor crest and rivets
    const sh=new THREE.Group();sh.position.set(0,1.55,.95);sh.scale.setScalar(.82);g.add(sh);
    const rim=cylinder(.9,.9,.14,'#e8c060',sh,0,0,0,26);rim.rotation.x=Math.PI/2;
    const face=cylinder(.78,.78,.18,'#1d4f86',sh,0,0,.04,26);face.rotation.x=Math.PI/2;
    const boss=sphere(.2,'#f1e3b5',sh,0,0,.17,12);
    box(.12,.9,.05,'#f4f6f8',sh,0,.02,.14);box(.6,.11,.05,'#f4f6f8',sh,0,.22,.14);
    const anchor=new THREE.Mesh(new THREE.TorusGeometry(.22,.055,6,14,Math.PI),solid('#f4f6f8'));anchor.position.set(0,-.3,.14);anchor.rotation.z=Math.PI;sh.add(anchor);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;sphere(.05,'#e8c060',sh,Math.cos(a)*.66,Math.sin(a)*.66,.16,6);}
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.02,1.12,40),solid('#9fdcff',.0));ring.position.set(0,1.55,.98);g.add(ring);
    return {sh,ring,tick(t,k,flash){sh.position.y=1.55+Math.sin(t*3)*.02;sh.rotation.y=Math.sin(t*2)*.05;ring.material.opacity=Math.max(0,flash)*.9;ring.scale.setScalar(1+(1-flash)*.5);}};
  },
  brawler(g){
    // crossed fists guard the face; an orange flame aura pulses around the whole body
    const fists=new THREE.Group();fists.position.set(0,2.3,.8);g.add(fists);
    for(const s of [-1,1]){const arm=new THREE.Group();arm.rotation.z=s*.6;fists.add(arm);cylinder(.16,.14,.9,'#d99a6c',arm,0,-.25,0,10);const glove=sphere(.3,'#ff8a3c',arm,0,.3,0,12);glove.scale.set(1,.95,1.1);cylinder(.19,.19,.14,'#ffffff',arm,0,-.05,0,10);}
    const aura=new THREE.Group();aura.position.y=1.5;g.add(aura);const flames=[];
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2,c=cone(.22,1.1,i%2?'#ffb03a':'#ff5a1f',aura,Math.cos(a)*.85,0,Math.sin(a)*.85,6);c.userData.a=a;c.userData.noInk=true;flames.push(c);}
    const ring1=new THREE.Mesh(new THREE.RingGeometry(.9,1.0,36),solid('#ffb03a',.9));ring1.rotation.x=-Math.PI/2;ring1.position.y=.06;g.add(ring1);
    return {fists,aura,flames,ring1,tick(t,k,flash){flames.forEach((c,i)=>{c.scale.set(1,.7+.5*Math.abs(Math.sin(t*9+i*1.3))+flash*.5,1);});aura.rotation.y=t*1.6;ring1.scale.setScalar(1+.12*Math.sin(t*7)+flash*.25);fists.position.y=2.3+Math.sin(t*10)*.02;}};
  },
  gunner(g){
    // a hex plate of purple and gold, ringed by orbiting brass cartridges
    const plate=new THREE.Group();plate.position.set(0,1.6,.9);plate.scale.setScalar(.84);g.add(plate);
    const hex=cylinder(.8,.8,.1,'#4a2f6a',plate,0,0,0,6);hex.rotation.x=Math.PI/2;
    const trim=cylinder(.9,.9,.08,'#f0c040',plate,0,0,-.03,6);trim.rotation.x=Math.PI/2;
    const eye=cylinder(.28,.28,.12,'#f0c040',plate,0,0,.05,16);eye.rotation.x=Math.PI/2;cylinder(.13,.13,.14,'#2b1f3c',plate,0,0,.06,12).rotation.x=Math.PI/2;
    const orbit=new THREE.Group();orbit.position.y=1.65;g.add(orbit);const shells=[];
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2,s=new THREE.Group();s.position.set(Math.cos(a)*1.0,0,Math.sin(a)*1.0);s.rotation.y=-a;orbit.add(s);cylinder(.075,.075,.34,'#f0c040',s,0,0,0,8);cone(.075,.16,'#c48830',s,0,.25,0,8);shells.push(s);}
    return {plate,orbit,shells,tick(t,k,flash){orbit.rotation.y=t*3;plate.rotation.z=t*.4;plate.scale.setScalar(.84*(1+flash*.18));orbit.position.y=1.65+Math.sin(t*5)*.06;}};
  },
  cook(g){
    // a wheel of fire whirling round the legs; the sound of a kick boot on the pan
    const wheel=new THREE.Group();wheel.position.y=.95;g.add(wheel);const flames=[];
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2,c=cone(.24,1.2,i%3===0?'#ffe27a':i%3===1?'#ff8a2a':'#ff4a1a',wheel,Math.cos(a)*1.0,.4,Math.sin(a)*1.0,6);c.rotation.set(Math.sin(a)*.5,0,-Math.cos(a)*.5);c.userData.noInk=true;flames.push(c);}
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.0,.06,6,32),solid('#fff0a0'));ring.rotation.x=Math.PI/2;ring.position.y=.95;g.add(ring);
    const sparks=[];for(let i=0;i<7;i++){const s=box(.07,.07,.07,'#ffe27a',g,0,0,0);s.userData.noInk=true;sparks.push(s);}
    return {wheel,flames,ring,sparks,tick(t,k,flash){wheel.rotation.y=-t*5;flames.forEach((c,i)=>c.scale.set(1,.8+.45*Math.abs(Math.sin(t*11+i*1.7))+flash*.6,1));ring.scale.setScalar(1+.05*Math.sin(t*9)+flash*.2);sparks.forEach((s,i)=>{const c=(t*1.4+i/7)%1,a=t*3+i*2;s.position.set(Math.cos(a)*(.7+c*.5),.4+c*1.6,Math.sin(a)*(.7+c*.5));s.scale.setScalar(1-c);});}};
  },
  stormcaller(g){
    // two tilted wind rings, flickering lightning and a few white cloud puffs
    const rings=[];for(let i=0;i<2;i++){const r=new THREE.Mesh(new THREE.TorusGeometry(.95+i*.12,.055,6,36,Math.PI*1.5),solid(i?'#ffe27a':'#7fe0ff'));r.position.y=1.7;r.rotation.set(Math.PI/2+(i?.5:-.5),0,0);g.add(r);rings.push(r);}
    const bolts=[];for(let i=0;i<4;i++){const b=bolt(g,i%2?'#fff6b0':'#9fe6ff',1.1);b.position.set(Math.cos(i*1.57)*.95,2.9,Math.sin(i*1.57)*.95);bolts.push(b);}
    const puffs=[];for(let i=0;i<5;i++){const p=sphere(.24,'#ffffff',g,0,0,0,10);p.userData.noInk=false;puffs.push(p);}
    return {rings,bolts,puffs,tick(t,k,flash){rings.forEach((r,i)=>{r.rotation.z=t*(i?-4.5:3.5);r.scale.setScalar(1+flash*.25);});
      bolts.forEach((b,i)=>{b.visible=Math.sin(t*14+i*2.3)>-.35;b.position.set(Math.cos(t*2+i*1.57)*.95,2.9,Math.sin(t*2+i*1.57)*.95);});
      puffs.forEach((p,i)=>{const a=t*1.8+i*1.26;p.position.set(Math.cos(a)*1.05,1.15+Math.sin(t*3+i)*.1,Math.sin(a)*1.05);p.scale.set(1.1,.75,1.1);});}};
  }
};

export function buildGuard(charId,body,c){
  const root=new THREE.Group();root.visible=false;body.add(root);
  const parts=(BUILDERS[charId]||BUILDERS.swordsman)(root,c);
  ink(root,.03);
  return {root,parts,on:0,flash:0,pose:charId};
}
// on: is the player holding R; hit: a guard/parry event just landed on this fighter.
export function updateGuard(guard,on,t,dt,hit=false){
  guard.on+=((on?1:0)-guard.on)*Math.min(1,dt*(on?16:10));
  if(hit)guard.flash=1;guard.flash=Math.max(0,guard.flash-dt*3.4);
  const show=guard.on>.04;guard.root.visible=show;if(!show)return;
  const s=.55+.45*guard.on;guard.root.scale.setScalar(s);
  guard.parts.tick(t,guard.on,guard.flash);
  // a hit makes the whole guard swell and jolt back a little
  guard.root.position.z=-guard.flash*.12;guard.root.scale.multiplyScalar(1+guard.flash*.08);
}
export function disposeGuard(guard){guard.root.traverse(o=>{if(o.isMesh&&!o.userData.ink)o.geometry?.dispose();if(o.material&&o.material.side!==THREE.BackSide&&!o.material.isMeshToonMaterial)o.material.dispose();});}
