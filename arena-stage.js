// Themed arenas. Decks and terrain zones come from STAGES in arena-roster.js, the same
// data the simulation collides with, so what you see is what you stand on.
import * as THREE from './vendor/three.module.js';
import {stageOf} from './arena-roster.js';
import {box,sphere,cylinder,cone,mesh,label,ink,isSharedMaterial} from './arena-gfx.js';

export const THEMES={
  port:{skyTop:'#2f8fe8',skyBottom:'#bfeaff',fog:'#b9e4f7',sun:'#fff3d6',hemiSky:'#fff6dc',hemiGround:'#5f8aa0',floor:'#b98a57',plank:'#d4a66a',plankAlt:'#c29258',rail:'#7a4a2c',post:'#5a3622',deckTop:'#5aa864',deckSide:'#6b4a33',water:'#2fa6d8',foam:'#e9fbff',wave:'#6fe0f5',cannon:'#20262e'},
  desert:{skyTop:'#3b8fd8',skyBottom:'#ffe2a8',fog:'#f3d7a0',sun:'#fff0c8',hemiSky:'#fff1d0',hemiGround:'#b08850',floor:'#e2b774',plank:'#eec98a',plankAlt:'#d9ad6c',rail:'#b07a45',post:'#8a5a32',deckTop:'#d27b3f',deckSide:'#a76a3c',water:'#e8c07a',foam:'#f7dfa8',wave:'#f0cf8a',cannon:'#7a5a3a'},
  snow:{skyTop:'#5a8fd0',skyBottom:'#e6f2ff',fog:'#dfeaf7',sun:'#f4f8ff',hemiSky:'#f4f8ff',hemiGround:'#8aa0bf',floor:'#cfd9e6',plank:'#eef4fb',plankAlt:'#dbe5f1',rail:'#6c4b3a',post:'#4d3326',deckTop:'#f7fbff',deckSide:'#5f6f86',water:'#3d77b8',foam:'#f4fbff',wave:'#f6fbff',cannon:'#f2f6fb'},
};

function skyDome(t){
  const g=new THREE.SphereGeometry(140,32,16),m=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{top:{value:new THREE.Color(t.skyTop)},bottom:{value:new THREE.Color(t.skyBottom)}},
    vertexShader:'varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying float h;void main(){float k=smoothstep(-.05,.55,h);gl_FragColor=vec4(mix(bottom,top,k),1.);}'});
  const s=new THREE.Mesh(g,m);s.renderOrder=-10;return s;
}
function puffCloud(parent,x,y,z,scale){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);for(const [px,py,r] of [[0,0,1.6],[1.5,-.2,1.2],[-1.5,-.3,1.1],[.6,.8,1.1],[-.7,.6,1]])sphere(r,'#ffffff',g,px,py,0,12).castShadow=false;return g;}
function palm(parent,x,z,h=5){const trunk=cylinder(.19,.33,h,'#8c6a48',parent,x,h/2-.4,z,8);trunk.rotation.z=-.1;for(let i=0;i<7;i++){const leaf=sphere(1,'#3f9a55',parent,x-.25,h-.5,z,10);leaf.scale.set(.42,.12,2.4);leaf.rotation.y=i*Math.PI*2/7;leaf.rotation.z=.2;}}
function pine(parent,x,z,s=1){cylinder(.16*s,.22*s,1.2*s,'#5a3a26',parent,x,.5*s,z,8);for(let i=0;i<3;i++){cone((1.3-i*.32)*s,1.5*s,'#2f6b4f',parent,x,(1.4+i*.85)*s,z,8);cone((1.3-i*.32)*s*.92,.5*s,'#f6fbff',parent,x,(1.95+i*.85)*s,z,8);}}

function arenaFloor(g,t,layout){
  box(30,1,18,t.post,g,0,-.52,0).userData.noInk=true;
  for(let i=0;i<39;i++){const plank=box(.75,.12,17.8,i%3===0?t.plankAlt:t.plank,g,-14.5+i*.76,.01,0);plank.userData.noInk=true;}
  for(const z of [-8.95,8.95])box(30,.14,.14,t.rail,g,0,.85,z);
  for(const x of [-14.95,14.95])box(.14,.14,18,t.rail,g,x,.85,0);
  for(const x of [-14.95,-10,-5,0,5,10,14.95])for(const z of [-8.95,8.95])box(.18,1,.18,t.post,g,x,.5,z);
  for(const x of [-14.95,14.95])for(const z of [-4.5,0,4.5])box(.18,1,.18,t.post,g,x,.5,z);
  for(const deck of layout.platforms){
    const d=new THREE.Group();d.position.set(deck.x,0,deck.z);g.add(d);
    box(deck.w,.34,deck.d,t.deckSide,d,0,deck.top-.17,0);
    for(let i=0;i<5;i++)box(deck.w/5-.03,.1,deck.d,t.deckTop,d,-deck.w/2+(i+.5)*deck.w/5,deck.top-.04,0).userData.noInk=true;
    for(const x of [-deck.w/2+.2,deck.w/2-.2])for(const z of [-deck.d/2+.2,deck.d/2-.2])cylinder(.13,.17,deck.top,t.post,d,x,deck.top/2,z,8);
    for(const x of [-.7,.7]){const rung=box(.09,deck.top+.1,.09,'#e6c07e',d,x,deck.top/2,deck.d/2+.12);rung.rotation.x=.15;}
    for(let y=.3;y<deck.top;y+=.35)box(1.5,.08,.09,'#e6c07e',d,0,y,deck.d/2+.16).userData.noInk=true;
  }
}

// Terrain: quicksand swirls, glossy ice sheets and springboard nets.
function terrain(g,layout,anim){
  const springs=[];
  for(const z of layout.zones){
    if(z.kind==='quicksand'){
      const pit=new THREE.Group();pit.position.set(z.x,.1,z.z);g.add(pit);
      const rim=cylinder(z.r,z.r,.04,'#c98c45',pit,0,0,0,32);rim.userData.noInk=true;rim.castShadow=false;
      const bed=cylinder(z.r*.8,z.r*.8,.05,'#a4692d',pit,0,.006,0,32);bed.userData.noInk=true;bed.castShadow=false;
      const swirl=new THREE.Group();pit.add(swirl);
      for(let i=0;i<3;i++){const arc=new THREE.Mesh(new THREE.TorusGeometry(z.r*(.28+i*.2),.035,6,40,Math.PI*1.3),new THREE.MeshBasicMaterial({color:'#8a5a28'}));arc.rotation.x=-Math.PI/2;arc.rotation.z=i*2.1;arc.position.y=.04;swirl.add(arc);}
      const eye=cylinder(z.r*.18,z.r*.18,.06,'#7a4c1f',pit,0,.01,0,20);eye.userData.noInk=true;
      anim.push(time=>{swirl.rotation.y=-time*.9;});
    }else if(z.kind==='ice'){
      const sheet=box(z.w,.05,z.d,'#b4e4ff',g,z.x,.1,z.z);sheet.userData.noInk=true;sheet.castShadow=false;
      const edge=box(z.w+.14,.03,z.d+.14,'#f4fbff',g,z.x,.085,z.z);edge.userData.noInk=true;edge.castShadow=false;
      for(let i=0;i<4;i++){const shine=box(z.w*.35,.01,.07,'#ffffff',g,z.x-z.w*.25+i*z.w*.17,.13,z.z-z.d*.3+i*z.d*.2);shine.rotation.y=.6;shine.userData.noInk=true;shine.castShadow=false;}
    }else if(z.kind==='spring'){
      const net=new THREE.Group();net.position.set(z.x,0,z.z);g.add(net);
      for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;cylinder(.06,.06,.4,'#5a3a26',net,Math.cos(a)*z.r*.85,.2,Math.sin(a)*z.r*.85,6);}
      const frame=new THREE.Mesh(new THREE.TorusGeometry(z.r,.09,8,28),new THREE.MeshToonMaterial({color:'#d8402f'}));frame.rotation.x=-Math.PI/2;frame.position.y=.42;net.add(frame);
      const bed=new THREE.Group();bed.position.y=.4;net.add(bed);
      for(let i=0;i<6;i++){const seg=new THREE.Mesh(new THREE.CircleGeometry(z.r*.95,16,i*Math.PI/3,Math.PI/3),new THREE.MeshToonMaterial({color:i%2?'#ffffff':'#e5483a',side:THREE.DoubleSide}));seg.rotation.x=-Math.PI/2;seg.userData.noInk=true;bed.add(seg);}
      springs.push({x:z.x,z:z.z,bed,squash:0});
    }
  }
  anim.push((time,dt)=>springs.forEach(s=>{s.squash=Math.max(0,s.squash-dt*3);s.bed.position.y=.4-Math.sin(s.squash*Math.PI)*.25;}));
  return springs;
}

const DRESSING={
  port(g,t,anim){
    const sea=box(220,.3,220,t.water,g,0,-1.5,0);sea.receiveShadow=false;sea.userData.noInk=true;
    const foam=[];for(let i=0;i<70;i++){const x=Math.sin(i*7.1)*40,z=Math.cos(i*2.3)*34;if(Math.abs(x)<16&&Math.abs(z)<10)continue;const f=box(1+(i%4),.02,.08,t.foam,g,x,-1.3,z);f.castShadow=false;f.userData.noInk=true;foam.push(f);}
    anim.push(time=>foam.forEach((f,i)=>{f.position.x+=Math.sin(time*.6+i)*.004;f.scale.x=1+Math.sin(time*1.3+i)*.25;}));
    for(const [x,w,h,c] of [[-9,4.8,3.9,'#f4e3b0'],[-3.2,4.4,5.2,'#e8866a'],[3.2,5,3.5,'#f6d08a'],[9,3.6,4.6,'#9fd0b8']]){
      box(w,h,2.6,c,g,x,h/2,-11);const roof=cone(w*.78,1.8,'#d24c3c',g,x,h+.7,-11,4);roof.rotation.y=Math.PI/4;roof.scale.z=.8;
      for(const off of [-.9,.9]){box(.7,1,.08,'#2f5a7a',g,x+off,h*.58,-9.66);box(.9,.1,.12,'#fff3d0',g,x+off,h*.58-.55,-9.62);}
    }
    const windmill=new THREE.Group();windmill.position.set(-13,0,-12.5);g.add(windmill);cylinder(.9,1.3,7,'#f7ecd6',windmill,0,3.5,0,10);cone(1.2,1.4,'#d24c3c',windmill,0,7.6,0,10);
    const blades=new THREE.Group();blades.position.set(0,6.4,1.15);windmill.add(blades);for(let i=0;i<4;i++){const b=box(.5,3.6,.08,'#fff8ea',blades,0,1.8,0);b.position.set(Math.sin(i*Math.PI/2)*1.8,Math.cos(i*Math.PI/2)*1.8,0);b.rotation.z=-i*Math.PI/2;}
    anim.push(time=>blades.rotation.z=time*.8);
    const ship=new THREE.Group();ship.position.set(16,-1.3,-20);ship.rotation.y=-.4;g.add(ship);
    const hull=box(9,2,3,'#7a4a2c',ship,0,1,0);hull.scale.y=1;box(9.4,.3,3.2,'#f0c040',ship,0,2,0);cylinder(.18,.22,9,'#6a4028',ship,0,6,0,8);
    const sail=box(5,4,.1,'#fbf6e6',ship,0,6,.1);const flag=box(1.2,.7,.05,'#1d1f26',ship,0,10.4,0);
    anim.push(time=>{ship.position.y=-1.3+Math.sin(time*.9)*.18;ship.rotation.z=Math.sin(time*.7)*.03;sail.scale.x=1+Math.sin(time*1.4)*.03;flag.rotation.y=Math.sin(time*3)*.3;});
    palm(g,-12,-5);palm(g,12.5,-6.5);palm(g,13,6);
    const sign=label('WINDMILL PORT','#fff2b8',46);sign.position.set(0,4.2,-9.4);sign.scale.set(5.2,1.3,1);sign.material.depthTest=true;sign.renderOrder=0;g.add(sign);
  },
  desert(g,t,anim){
    const sand=box(220,.3,220,t.water,g,0,-1.5,0);sand.receiveShadow=false;sand.userData.noInk=true;
    for(let i=0;i<14;i++){const a=i/14*Math.PI*2,r=34+(i%3)*8,dune=sphere(6+(i%4)*2,i%2?'#e9c07c':'#dcae68',g,Math.cos(a)*r,-2.5,Math.sin(a)*r-6,12);dune.scale.y=.35;dune.userData.noInk=true;}
    const palace=new THREE.Group();palace.position.set(0,0,-13);g.add(palace);
    box(16,5,3,'#f1d49a',palace,0,2.5,0);for(const x of [-6,-2,2,6])box(1.2,1.6,.1,'#7a4a2c',palace,x,1.6,1.55);
    for(const [x,h] of [[-8.5,8],[8.5,8],[0,9.5]]){cylinder(1.3,1.5,h,'#f6ddb0',palace,x,h/2,0,12);const dome=sphere(1.6,'#e7a33c',palace,x,h+.4,0,16);dome.scale.y=1.1;cone(.25,1,'#f0c040',palace,x,h+2.1,0,8);}
    for(let i=0;i<9;i++)box(1,.7,1,'#f1d49a',palace,-8+i*2,5.35,0);
    for(const x of [-13,13]){box(2.4,3,2.4,'#e9c890',g,x,1.5,-9.5);box(2.8,.35,2.8,'#c9964f',g,x,3.1,-9.5);}
    palm(g,-12,-6,5.5);palm(g,12,-5,5);palm(g,-13.5,6,4.5);palm(g,13.5,5,5.5);
    const flags=[];for(const x of [-8.5,8.5]){const f=box(1.4,.8,.05,'#c93a3a',palace,x+.7,11,0);flags.push(f);}
    anim.push(time=>flags.forEach((f,i)=>f.rotation.y=Math.sin(time*3+i)*.35));
    const sign=label('SAND KINGDOM','#fff2b8',46);sign.position.set(0,6.4,-11.3);sign.scale.set(5.2,1.3,1);sign.material.depthTest=true;sign.renderOrder=0;g.add(sign);
  },
  snow(g,t,anim){
    const sea=box(220,.3,220,t.water,g,0,-1.5,0);sea.receiveShadow=false;sea.userData.noInk=true;
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2,berg=cone(3+(i%3),5+(i%4)*2,'#eef6ff',g,Math.cos(a)*40,-1,Math.sin(a)*34-4,6);berg.rotation.y=i;}
    for(let i=0;i<3;i++){const R=10+i*3,H=18+i*4,h=6+i,x=-24+i*24,z=-38-i*3;cone(R,H,'#9fb3cf',g,x,-1,z,8).userData.noInk=true;cone(R*h/H*1.06,h,'#ffffff',g,x,-1+H/2-h/2+.05,z,8).userData.noInk=true;}
    for(const [x,w,h,c] of [[-8,4.4,3.4,'#b85c4c'],[-2.5,4.6,4.2,'#5c7fb0'],[4,4.8,3.2,'#c99a5a'],[9.5,3.6,3.8,'#7aa07a']]){
      box(w,h,2.6,c,g,x,h/2,-11);const roof=cone(w*.8,1.9,'#f7fbff',g,x,h+.75,-11,4);roof.rotation.y=Math.PI/4;roof.scale.z=.8;
      box(.9,1,.08,'#ffe79a',g,x,h*.55,-9.66);
    }
    pine(g,-12.5,-5.5,1.2);pine(g,12.5,-6,1.3);pine(g,-13,5.5,1);pine(g,13.2,5,1.1);pine(g,-16,-1,1.4);pine(g,16.5,1,1.3);
    // A pink tree gives the snow island a landmark silhouette.
    const trunk=cylinder(.35,.5,4,'#5a3a2a',g,-6,2,-14,8);trunk.rotation.z=.08;for(const [x,y,z,r] of [[-6,5,-14,2],[-7.4,4.4,-13.6,1.4],[-4.7,4.5,-14.2,1.5],[-6.2,6,-14.4,1.3]])sphere(r,'#f59ac0',g,x,y,z,12);
    const flakes=new THREE.BufferGeometry(),count=500,pos=new Float32Array(count*3);
    for(let i=0;i<count;i++){pos[i*3]=(Math.random()-.5)*50;pos[i*3+1]=Math.random()*18;pos[i*3+2]=(Math.random()-.5)*36;}
    flakes.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const snow=new THREE.Points(flakes,new THREE.PointsMaterial({color:'#ffffff',size:.14,transparent:true,opacity:.9,depthWrite:false}));g.add(snow);
    anim.push((time,dt)=>{const a=flakes.attributes.position.array;for(let i=0;i<count;i++){a[i*3+1]-=dt*(1.2+(i%5)*.2);a[i*3]+=Math.sin(time+i)*dt*.3;if(a[i*3+1]<0)a[i*3+1]=18;}flakes.attributes.position.needsUpdate=true;});
    const sign=label('BLOSSOM SNOW ISLE','#fff2b8',42);sign.position.set(0,4.1,-9.4);sign.scale.set(5.6,1.3,1);sign.material.depthTest=true;sign.renderOrder=0;g.add(sign);
  },
};

export function buildStage(stageId){
  const t=THEMES[stageId]||THEMES.port,layout=stageOf(stageId),g=new THREE.Group(),anim=[];
  g.add(skyDome(t));
  const clouds=[];for(let i=0;i<9;i++)clouds.push(puffCloud(g,-60+i*15,14+(i%3)*4,-55-(i%2)*10,1.2+(i%3)*.5));
  anim.push((time,dt)=>clouds.forEach((c,i)=>{c.position.x+=dt*(.4+(i%3)*.15);if(c.position.x>70)c.position.x=-70;}));
  arenaFloor(g,t,layout);
  const springs=terrain(g,layout,anim);
  (DRESSING[stageId]||DRESSING.port)(g,t,anim);
  ink(g,.07,'#1a1d24',.25);
  return {group:g,theme:t,update(time,dt){for(const f of anim)f(time,dt);},bounce(x,z){const s=springs.find(s=>Math.hypot(s.x-x,s.z-z)<1.6);if(s)s.squash=1;}};
}
export function disposeStage(stage){
  stage.group.parent?.remove(stage.group);
  stage.group.traverse(o=>{if((o.isMesh||o.isPoints)&&!o.userData.ink)o.geometry.dispose();if(o.material&&!o.userData.ink&&!isSharedMaterial(o.material)){o.material.map?.dispose();o.material.dispose();}});
}
