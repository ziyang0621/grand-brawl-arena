// Bottle hazards on the ground. Each kind looks and moves differently, and none of them is just a ring:
//  poison: a boiling green puddle with popping bubbles and rising mist tendrils
//  virus:  drifting spiked spores over a pulsing spore network
//  slow:   a frost patch that grows ice crystals while snow glitters down
// The dashed boundary stays (it is the true damage radius) but the fun is inside it.
import * as THREE from './vendor/three.module.js';

const PALETTE={
  poison:{main:'#72e889',dark:'#2c7d3f',mid:'#3fae5a',glow:'#c6ffa8'},
  virus:{main:'#b66cff',dark:'#54289a',mid:'#8a48d8',glow:'#efcfff'},
  slow:{main:'#6db9ff',dark:'#8cc3f0',mid:'#d6efff',glow:'#ffffff'}
};
const flat=(color,opacity,additive=false)=>new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
const rand=(seed,k=0)=>{const x=Math.sin(seed*127.1+k*311.7)*43758.5453;return x-Math.floor(x);};

// A wobbly puddle outline with radius < 1 so it stays inside the damage boundary.
function blob(seed,points=30,wobble=.16){
  const shape=new THREE.Shape();
  for(let i=0;i<=points;i++){
    const a=i/points*Math.PI*2,r=.84+wobble*Math.sin(a*3+seed)+wobble*.6*Math.sin(a*5+seed*2.1);
    const x=Math.cos(a)*r,y=Math.sin(a)*r;i?shape.lineTo(x,y):shape.moveTo(x,y);
  }
  const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);return g;
}
// Boundary drawn as dashes; the first dash starts at angle 0 so its outer edge touches the true radius on +x.
function dashedRing(segments=36,inner=.95){
  const pos=[],idx=[];
  for(let i=0;i<segments;i++){
    const a0=i/segments*Math.PI*2,a1=a0+Math.PI*2/segments*.62,base=pos.length/3;
    for(const [r,a] of [[inner,a0],[1,a0],[1,a1],[inner,a1]])pos.push(Math.cos(a)*r,0,Math.sin(a)*r);
    idx.push(base,base+1,base+2,base,base+2,base+3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);return g;
}

export function createCloudVisual(kind){
  const P=PALETTE[kind]||PALETTE.poison,root=new THREE.Group(),seed=kind==='virus'?7:kind==='slow'?3:1;
  const fog=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),flat(P.main,.2));fog.scale.y=.45;fog.material.side=THREE.FrontSide;
  const edge=new THREE.Mesh(dashedRing(),new THREE.MeshBasicMaterial({color:P.main,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));edge.position.y=.025;
  const puddle=new THREE.Mesh(blob(seed),flat(P.dark,.78));puddle.position.y=.03;
  const sheen=new THREE.Mesh(blob(seed+2,26,.2),flat(P.mid,.7));sheen.position.y=.036;sheen.scale.set(.7,1,.7);
  root.add(fog,puddle,sheen,edge);
  const parts=[];
  const add=(mesh,data)=>{mesh.userData.fx=data;root.add(mesh);parts.push(mesh);return mesh;};

  if(kind==='poison'){
    for(let i=0;i<16;i++){
      const b=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),flat(i%3?P.glow:P.main,.8,false));
      add(b,{t:'bubble',a:rand(i,1)*Math.PI*2,r:.15+rand(i,2)*.65,ph:rand(i,3),size:.07+rand(i,4)*.14,rate:.45+rand(i,5)*.5});
    }
    for(let i=0;i<4;i++){
      const w=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),flat(P.main,.22,true));
      add(w,{t:'wisp',a:i/4*Math.PI*2+.5,r:.35,ph:rand(i,6),size:.28});
    }
  }else if(kind==='virus'){
    for(let i=0;i<11;i++){
      const g=new THREE.Group();
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1,0),flat(P.main,.92)));
      for(let k=0;k<7;k++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.28,.75,5),flat(P.glow,.9));const a=k/7*Math.PI*2;spike.position.set(Math.cos(a)*1.05,Math.sin(a*2)*.6,Math.sin(a)*1.05);spike.lookAt(spike.position.clone().multiplyScalar(2));spike.rotateX(Math.PI/2);g.add(spike);}
      add(g,{t:'spore',a:rand(i,1)*Math.PI*2,r:.25+rand(i,2)*.6,ph:rand(i,3),size:.1+rand(i,4)*.08,h:.3+rand(i,5)*.9,speed:(rand(i,6)-.5)*1.2});
    }
    // spore network on the ground: nodes joined by thin pulsing links
    const nodes=[];for(let i=0;i<7;i++){const a=i/7*Math.PI*2+rand(i,9),r=i?.35+rand(i,10)*.4:0;nodes.push([Math.cos(a)*r,Math.sin(a)*r]);}
    for(let i=0;i<nodes.length;i++){
      const n=new THREE.Mesh(new THREE.CircleGeometry(1,10),flat(P.glow,.9,true));n.rotation.x=-Math.PI/2;
      add(n,{t:'node',x:nodes[i][0],z:nodes[i][1],size:.055+rand(i,11)*.03,ph:i});
      if(i){const [x0,z0]=nodes[i-1],[x1,z1]=nodes[i],len=Math.hypot(x1-x0,z1-z0),link=new THREE.Mesh(new THREE.PlaneGeometry(len,.035),flat(P.glow,.6,true));link.rotation.x=-Math.PI/2;link.rotation.z=-Math.atan2(z1-z0,x1-x0);link.position.set((x0+x1)/2,0,(z0+z1)/2);add(link,{t:'link',ph:i,x:(x0+x1)/2,z:(z0+z1)/2});}
    }
  }else{
    for(let i=0;i<11;i++){
      const shard=new THREE.Mesh(new THREE.ConeGeometry(1,1,5),flat(i%2?'#dff4ff':P.mid,.95));
      const a=rand(i,1)*Math.PI*2,r=.15+rand(i,2)*.68;
      add(shard,{t:'shard',a,r,ph:rand(i,3)*.35,h:.7+rand(i,4)*.95,w:.13+rand(i,5)*.12,lean:(rand(i,6)-.5)*.5});
    }
    for(let i=0;i<20;i++){
      const f=new THREE.Mesh(new THREE.OctahedronGeometry(1,0),flat('#ffffff',.9,true));
      add(f,{t:'flake',a:rand(i,1)*Math.PI*2,r:rand(i,2)*.9,ph:rand(i,3),size:.03+rand(i,4)*.035,rate:.25+rand(i,5)*.3});
    }
  }
  root.userData={fog,edge,puddle,sheen,parts,kind,born:undefined};
  return root;
}

export function updateCloudVisual(root,cloud,time=0){
  const u=root.userData,r=cloud.radius;
  root.position.set(cloud.x,cloud.y,cloud.z);
  // Only the flat parts are stretched to the damage radius; particles keep their real proportions.
  root.scale.set(1,1,1);
  u.born??=time;const age=Math.max(0,time-u.born),grow=Math.min(1,age/.35),ease=1-(1-grow)*(1-grow);
  const fade=Math.min(1,Math.max(0,cloud.life)/.7);
  u.fog.scale.set(r,.45*r/1.5,r);u.fog.material.opacity=.2*fade*(.6+.4*grow);
  // Keep the boundary readable until the hazard actually expires.
  u.edge.scale.set(r,1,r);u.edge.material.opacity=cloud.life>0?.5+.35*fade:0;
  u.puddle.scale.set(r*ease,1,r*ease);u.puddle.rotation.y=time*.05;u.puddle.material.opacity=.78*fade;
  const pulse=.7+.05*Math.sin(time*2.3);u.sheen.scale.set(r*pulse*ease,1,r*pulse*ease);u.sheen.rotation.y=-time*.15;u.sheen.material.opacity=.7*fade;
  for(const m of u.parts){
    const d=m.userData.fx;
    if(d.t==='bubble'){
      const c=((time*d.rate+d.ph)%1),h=c*1.15;
      m.position.set(Math.cos(d.a)*d.r*r,.06+h*.8,Math.sin(d.a)*d.r*r);
      const s=d.size*(c<.85?.4+c*.9:1.2+(c-.85)*8);m.scale.setScalar(Math.max(.001,s*(c>.97?.01:1)));m.material.opacity=.8*fade*(c>.9?(1-c)*10:1);
    }else if(d.t==='wisp'){
      const c=((time*.35+d.ph)%1);m.position.set(Math.cos(d.a+time*.3)*d.r*r+Math.sin(time*2+d.ph*6)*.12,.2+c*1.7,Math.sin(d.a+time*.3)*d.r*r);
      m.scale.set(d.size*(1+c),d.size*(1.6+c*1.5),d.size*(1+c));m.material.opacity=.22*fade*(1-c);
    }else if(d.t==='spore'){
      const a=d.a+time*d.speed;m.position.set(Math.cos(a)*d.r*r,.25+d.h+Math.sin(time*1.7+d.ph*6)*.18,Math.sin(a)*d.r*r);
      m.scale.setScalar(d.size*(1+.28*Math.sin(time*5+d.ph*9))*Math.min(1,grow*1.4));m.rotation.set(time*.9+d.ph,time*1.3,0);
      m.traverse(o=>{if(o.material)o.material.opacity=.92*fade;});
    }else if(d.t==='node'){
      m.position.set(d.x*r,.05,d.z*r);m.scale.setScalar(d.size*(1+.5*Math.sin(time*4+d.ph))*ease);m.material.opacity=.9*fade;
    }else if(d.t==='link'){
      m.position.set(d.x*r,.045,d.z*r);m.scale.set(r*ease,1,1);m.material.opacity=(.35+.3*Math.sin(time*3+d.ph))*fade;
    }else if(d.t==='shard'){
      const gr=Math.max(0,Math.min(1,(age-d.ph)/.4)),out=1-(1-gr)*(1-gr)*(1-gr),h=d.h*out*(cloud.life<.7?fade:1);
      m.position.set(Math.cos(d.a)*d.r*r,h/2,Math.sin(d.a)*d.r*r);m.scale.set(d.w,Math.max(.001,h),d.w);
      m.rotation.set(d.lean*Math.sin(d.a),0,d.lean*Math.cos(d.a));m.material.opacity=.95*fade;
    }else if(d.t==='flake'){
      const c=((time*d.rate+d.ph)%1);m.position.set(Math.cos(d.a+time*.2)*d.r*r+Math.sin(time*2+d.ph*9)*.1,1.5*(1-c)+.05,Math.sin(d.a+time*.2)*d.r*r);
      m.scale.setScalar(d.size*(.5+Math.abs(Math.sin(time*6+d.ph*9))));m.rotation.set(time*2,time*3,0);m.material.opacity=.9*fade;
    }
  }
}

export function disposeCloudVisual(root){root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
