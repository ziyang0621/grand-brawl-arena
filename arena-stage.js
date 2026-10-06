// Themed arenas. Decks and terrain zones come from STAGES in arena-roster.js, the same
// data the simulation collides with, so what you see is what you stand on.
import {addCrowd} from './arena-crew.js';
import * as THREE from './vendor/three.module.js';
import {stageOf,laddersOf,ventState} from './arena-roster.js';
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
// Stylised sea: stepped colour bands with white contour lines that drift, and foam pulses lapping at the arena edge.
function toonWater(g,anim,{deep,shallow,foam,fog,speed=1,lines=.85,edge=true,ripple=false}){
  const uniforms={time:{value:0},deep:{value:new THREE.Color(deep)},shallow:{value:new THREE.Color(shallow)},foam:{value:new THREE.Color(foam)},fogColor:{value:new THREE.Color(fog)},lines:{value:lines},edge:{value:edge?1:0},ripple:{value:ripple?1:0},speed:{value:speed}};
  const m=new THREE.ShaderMaterial({uniforms,fog:false,
    vertexShader:'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader:`uniform float time;uniform vec3 deep;uniform vec3 shallow;uniform vec3 foam;uniform vec3 fogColor;uniform float lines;uniform float edge;uniform float ripple;uniform float speed;varying vec3 vW;
      float wave(vec2 p){return sin(p.x)+sin(p.y*1.3+p.x*.5)+sin((p.x+p.y)*.7);}
      void main(){
        float t=time*speed;vec2 p=vW.xz*(ripple>.5?vec2(.09,.32):vec2(.15));
        float a=wave(p+vec2(t*.35,t*.2))*.5+wave(p*1.7-vec2(t*.25,-t*.3))*.35;
        float v=a*1.4+2.0;float band=floor(v)/3.0;
        vec3 col=mix(deep,shallow,clamp(band*.8+.2,0.,1.));
        float fr=fract(v);float line=smoothstep(.0,.035,fr)*(1.-smoothstep(.035,.075,fr));
        col=mix(col,foam,line*lines*.55);
        if(edge>.5){vec2 q=abs(vW.xz)-vec2(15.2,9.2);float d=length(max(q,0.))+min(max(q.x,q.y),0.);
          float ring=smoothstep(.0,.25,d)*(1.-smoothstep(.7,1.5,d));float pulse=.5+.5*sin(d*4.-time*2.2);
          col=mix(col,foam,ring*(.45+.4*pulse));float band2=smoothstep(2.4,2.6,d)*(1.-smoothstep(2.6,2.9,d))*(.5+.5*sin(time*1.4-d));col=mix(col,foam,band2*.6);}
        float dist=length(vW.xz-cameraPosition.xz);col=mix(col,fogColor,smoothstep(60.,170.,dist));
        gl_FragColor=vec4(col,1.);}`});
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(240,240),m);sea.rotation.x=-Math.PI/2;sea.position.y=-1.45;sea.receiveShadow=false;sea.userData.noInk=true;g.add(sea);
  anim.push(time=>{uniforms.time.value=time;});
  return sea;
}
// Soft sun glow in the sky plus a few slow-breathing light shafts angled across the arena.
function sunGlow(g,anim,{color='#fff2c0',pos=[-46,44,-90],shafts=.10}={}){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  const grad=x.createRadialGradient(128,128,4,128,128,128);grad.addColorStop(0,'#ffffff');grad.addColorStop(.18,color);grad.addColorStop(.5,color+'55');grad.addColorStop(1,color+'00');x.fillStyle=grad;x.fillRect(0,0,256,256);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const sun=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));sun.position.set(...pos);sun.scale.set(70,70,1);sun.renderOrder=-9;g.add(sun);
  const shaftMats=[];
  for(let i=0;i<4;i++){
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,fog:false,uniforms:{op:{value:shafts},col:{value:new THREE.Color(color)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform float op;uniform vec3 col;varying vec2 vUv;void main(){float across=1.-abs(vUv.x-.5)*2.;float along=smoothstep(0.,.25,vUv.y)*(1.-smoothstep(.55,1.,vUv.y));gl_FragColor=vec4(col,pow(across,1.6)*along*op);}'});
    const shaft=new THREE.Mesh(new THREE.PlaneGeometry(3.4+i*.9,46),mat);shaft.position.set(-16+i*9,14,-9-i*2);shaft.rotation.set(0,0,.5+i*.05);shaft.renderOrder=-5;g.add(shaft);shaftMats.push(mat);
  }
  anim.push(time=>shaftMats.forEach((m,i)=>{m.uniforms.op.value=shafts*(.65+.35*Math.sin(time*.5+i*1.7));}));
}
function puffCloud(parent,x,y,z,scale){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);parent.add(g);for(const [px,py,r] of [[0,0,1.6],[1.5,-.2,1.2],[-1.5,-.3,1.1],[.6,.8,1.1],[-.7,.6,1]])sphere(r,'#ffffff',g,px,py,0,12).castShadow=false;return g;}
function palm(parent,x,z,h=5){const trunk=cylinder(.19,.33,h,'#8c6a48',parent,x,h/2-.4,z,8);trunk.rotation.z=-.1;for(let i=0;i<7;i++){const leaf=sphere(1,'#3f9a55',parent,x-.25,h-.5,z,10);leaf.scale.set(.42,.12,2.4);leaf.rotation.y=i*Math.PI*2/7;leaf.rotation.z=.2;}}
function pine(parent,x,z,s=1){cylinder(.16*s,.22*s,1.2*s,'#5a3a26',parent,x,.5*s,z,8);for(let i=0;i<3;i++){cone((1.3-i*.32)*s,1.5*s,'#2f6b4f',parent,x,(1.4+i*.85)*s,z,8);cone((1.3-i*.32)*s*.92,.5*s,'#f6fbff',parent,x,(1.95+i*.85)*s,z,8);}}

// ---- Ladders: rope on the ship, carved footholds on stone, wooden rungs elsewhere ----
const LADDER_LOOK={ship:{rail:'#d9c08a',rung:'#a8783f'},stone:{rail:'#c9964f',rung:'#e9d6a6'},snow:{rail:'#6c4b3a',rung:'#e6c07e'},classic:{rail:'#e6c07e',rung:'#e6c07e'}};
function addLadders(g,deck,look){
  const c=LADDER_LOOK[look]||LADDER_LOOK.classic;
  for(const l of laddersOf({platforms:[deck]})){
    const lg=new THREE.Group();lg.position.set(l.x,0,l.z);lg.rotation.y=l.side==='left'||l.side==='right'?Math.PI/2:0;g.add(lg);
    for(const x of [-.7,.7]){const rail=box(.09,deck.top+.1,.09,c.rail,lg,x,deck.top/2,0);rail.rotation.x=.15;}
    for(let y=.3;y<deck.top;y+=.35)box(1.5,.08,.09,c.rung,lg,0,y,.04).userData.noInk=true;
  }
}
const trim=(parent,w,d,top,color,over=.14)=>{const m=box(w+over,.16,d+over,color,parent,0,top-.06,0);m.userData.noInk=true;return m;};
const DECKS={
  // the original four-legged table deck (kept for the hidden test stage)
  table(d,t,deck){
    box(deck.w,.34,deck.d,t.deckSide,d,0,deck.top-.17,0);
    for(let i=0;i<5;i++)box(deck.w/5-.03,.1,deck.d,t.deckTop,d,-deck.w/2+(i+.5)*deck.w/5,deck.top-.04,0).userData.noInk=true;
    for(const x of [-deck.w/2+.2,deck.w/2-.2])for(const z of [-deck.d/2+.2,deck.d/2-.2])cylinder(.13,.17,deck.top,t.post,d,x,deck.top/2,z,8);
  },
  // raised stern of the ship: solid hull block, gold trim, rail, helm and lanterns
  ship(d,t,deck){
    box(deck.w,deck.top,deck.d,'#7a4a2a',d,0,deck.top/2,0);
    for(let i=0;i<Math.round(deck.w/1.2);i++){const p=box(1.14,.06,deck.d-.1,i%2?'#a8763f':'#9c6c38',d,-deck.w/2+.6+i*1.2,deck.top+.005,0);p.userData.noInk=true;}
    trim(d,deck.w,deck.d,deck.top+.1,'#f0c040',.1);
    for(let i=0;i<Math.round(deck.w/2);i++)box(.9,.5,.06,'#5a3622',d,-deck.w/2+1+i*2,deck.top*.6,deck.d/2+.02).userData.noInk=true;
    for(let x=-deck.w/2+.4;x<=deck.w/2-.3;x+=1.6)cylinder(.07,.07,.9,'#5a3622',d,x,deck.top+.5,-deck.d/2+.15,6);
    box(deck.w,.1,.1,'#5a3622',d,0,deck.top+.95,-deck.d/2+.15);
    const helm=new THREE.Group();helm.position.set(-5,deck.top+.95,-.2);d.add(helm);
    cylinder(.09,.09,.9,'#5a3622',helm,0,-.45,0,6);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.55,.07,6,16),new THREE.MeshToonMaterial({color:'#8a5a32'}));wheel.position.y=.1;helm.add(wheel);
    for(let i=0;i<4;i++){const sp=box(.07,1.15,.07,'#8a5a32',helm,0,.1,0);sp.rotation.z=i*Math.PI/4;}
    for(const x of [-deck.w/2+.6,deck.w/2-.6]){cylinder(.05,.05,1.2,'#3a2a20',d,x,deck.top+.6,deck.d/2-.3,6);const lamp=sphere(.2,'#ffd66e',d,x,deck.top+1.3,deck.d/2-.3,10);lamp.userData.noInk=true;}
  },
  // crow's nest: a mast stub and a railed barrel platform above the stern
  nest(d,t,deck){
    cylinder(.26,.32,deck.top,'#6a4028',d,0,deck.top/2,0,8);
    box(deck.w,.24,deck.d,'#8a5a32',d,0,deck.top-.12,0);
    for(let i=0;i<4;i++)box(deck.w/4-.05,.05,deck.d,i%2?'#c89358':'#bd8850',d,-deck.w/2+(i+.5)*deck.w/4,deck.top+.01,0).userData.noInk=true;
    for(const [x,z] of [[-1,-1],[1,-1],[-1,1],[1,1]])cylinder(.06,.06,.9,'#5a3622',d,x*(deck.w/2-.15),deck.top+.45,z*(deck.d/2-.15),6);
    box(deck.w-.3,.08,.08,'#5a3622',d,0,deck.top+.85,-deck.d/2+.15);
    cylinder(.05,.05,1.6,'#5a3622',d,0,deck.top+.8,0,6);box(.9,.5,.05,'#1d1f26',d,.5,deck.top+1.35,0);
  },
  // stacked cargo: crates, barrels and rope
  crates(d,t,deck){
    box(deck.w,deck.top*.55,deck.d,'#b98a52',d,0,deck.top*.275,0);
    box(deck.w*.72,deck.top*.5,deck.d*.72,'#c89a5c',d,0,deck.top*.55+deck.top*.25,0);
    box(deck.w+.06,.14,deck.d+.06,'#5e4636',d,0,deck.top*.55,0).userData.noInk=true;
    for(const x of [-deck.w/2+.05,deck.w/2-.05])box(.1,deck.top*.55,deck.d+.05,'#6b4a33',d,x,deck.top*.275,0).userData.noInk=true;
    const slat=box(deck.w*.9,.12,.06,'#ecc080',d,0,deck.top*.3,deck.d/2+.03);slat.rotation.z=.6;
    const top=box(deck.w*.72+.05,.08,deck.d*.72+.05,'#d9aa6a',d,0,deck.top-.02,0);top.userData.noInk=true;
    cylinder(deck.w*.16,deck.w*.16,.55,'#a86a3c',d,deck.w*.3,deck.top+.25,deck.d*.15,10);
  },
  // sandstone ziggurat tier: banded block, carved lintel, torch bowls on the lowest step
  stone(d,t,deck){
    box(deck.w,deck.top,deck.d,'#e4c98f',d,0,deck.top/2,0);
    for(let y=.4;y<deck.top-.1;y+=.55){const band=box(deck.w+.04,.06,deck.d+.04,'#c9a566',d,0,y,0);band.userData.noInk=true;}
    trim(d,deck.w,deck.d,deck.top,'#f1dba4',.2);
    const top=box(deck.w-.1,.06,deck.d-.1,'#dcbd80',d,0,deck.top+.02,0);top.userData.noInk=true;
    for(let x=-deck.w/2+.7;x<=deck.w/2-.6;x+=1.4){const glyph=box(.3,.5,.05,'#a9793a',d,x,deck.top*.5,deck.d/2+.03);glyph.userData.noInk=true;}
  },
  // broken temple block: chipped slab with column stubs
  ruin(d,t,deck){
    box(deck.w,deck.top,deck.d,'#d6b57c',d,0,deck.top/2,0);
    for(let y=.5;y<deck.top-.1;y+=.6)box(deck.w+.05,.07,deck.d+.05,'#b98c4e',d,0,y,0).userData.noInk=true;
    trim(d,deck.w,deck.d,deck.top,'#ecd29a',.16);
    for(const [x,h] of [[-.5,1.7],[.6,.9]]){cylinder(.34,.4,h,'#e8cf9c',d,x*deck.w*.35,deck.top+h/2,-deck.d*.18,10);}
    box(.8,.35,.7,'#c9a566',d,deck.w*.25,deck.top+.18,deck.d*.2).rotation.y=.5;
  },
  // snowy mound: rocky base, thick white cap, pines on the shoulder
  hill(d,t,deck){
    const base=cylinder(deck.w*.46,deck.w*.62,deck.top,'#8d9fb8',d,0,deck.top/2,0,9);base.scale.z=deck.d/deck.w;
    const snow=cylinder(deck.w*.5,deck.w*.5,.32,'#ffffff',d,0,deck.top-.12,0,9);snow.scale.z=deck.d/deck.w;
    const drift=cylinder(deck.w*.56,deck.w*.62,.5,'#eef5ff',d,0,deck.top*.62,0,9);drift.scale.z=deck.d/deck.w;drift.userData.noInk=true;
    pine(d,-deck.w*.3,deck.d*.32,.7);pine(d,deck.w*.34,-deck.d*.3,.6);
    for(const [x,z,r] of [[.22,.28,.5],[-.05,.32,.35]])sphere(r,'#f6fbff',d,x*deck.w,deck.top+.05,z*deck.d,8).scale.y=.5;
  },
  // igloo: ice-brick drum with a dark doorway
  igloo(d,t,deck){
    cylinder(deck.w*.48,deck.w*.52,deck.top,'#f1f7ff',d,0,deck.top/2,0,14);
    for(let y=.3;y<deck.top;y+=.4)cylinder(deck.w*.5,deck.w*.5,.04,'#b7cde6',d,0,y,0,14).userData.noInk=true;
    box(1,.9,.3,'#243447',d,0,.45,deck.d/2-.05).userData.noInk=true;
    cylinder(deck.w*.42,deck.w*.42,.16,'#ffffff',d,0,deck.top+.02,0,14);
  },
  // ice block: glassy top with crystals around the rim
  ice(d,t,deck){
    box(deck.w,deck.top,deck.d,'#a9def6',d,0,deck.top/2,0);
    const top=box(deck.w-.1,.1,deck.d-.1,'#d5f2ff',d,0,deck.top+.02,0);top.userData.noInk=true;
    for(const [x,z,h] of [[-.42,-.4,1.1],[.4,-.42,.7],[.35,.4,.5]])cone(.28,h,'#c3ecff',d,x*deck.w,deck.top+h/2,z*deck.d,5);
  },
};
function buildDecks(g,t,layout){
  for(const deck of layout.platforms){
    const d=new THREE.Group();d.position.set(deck.x,0,deck.z);g.add(d);
    (DECKS[deck.style]||DECKS.table)(d,t,deck);
    addLadders(g,deck,layout.look);
  }
}

// ---- Arena floors: each look has its own ground and boundary ----
function classicFloor(g,t){
  box(30,1,18,t.post,g,0,-.52,0).userData.noInk=true;
  for(let i=0;i<39;i++){const plank=box(.75,.12,17.8,i%3===0?t.plankAlt:t.plank,g,-14.5+i*.76,.01,0);plank.userData.noInk=true;}
  for(const z of [-8.95,8.95])box(30,.14,.14,t.rail,g,0,.85,z);
  for(const x of [-14.95,14.95])box(.14,.14,18,t.rail,g,x,.85,0);
  for(const x of [-14.95,-10,-5,0,5,10,14.95])for(const z of [-8.95,8.95])box(.18,1,.18,t.post,g,x,.5,z);
  for(const x of [-14.95,14.95])for(const z of [-4.5,0,4.5])box(.18,1,.18,t.post,g,x,.5,z);
}
// Ship: dark hull, caulked planks, solid bulwark, a row of cannons on each flank.
function shipFloor(g,t,anim){
  box(30,1.4,18,'#4b2f1e',g,0,-.72,0).userData.noInk=true;
  for(let i=0;i<40;i++){const plank=box(.72,.12,17.8,i%2?'#b57d47':'#a86f3d',g,-14.6+i*.75,.01,0);plank.userData.noInk=true;}
  for(let i=0;i<40;i+=1){const seam=box(.03,.02,17.8,'#3c2415',g,-14.6+i*.75+.37,.075,0);seam.userData.noInk=true;seam.castShadow=false;}
  for(let x=-13;x<=13;x+=2.6)box(.05,.02,17.6,'#3c2415',g,x,.08,0).userData.noInk=true;
  for(const z of [-8.95,8.95]){box(30.2,.9,.32,'#6b4128',g,0,.45,z);box(30.4,.14,.5,'#f0c040',g,0,.95,z).userData.noInk=true;}
  for(const x of [-14.95,14.95]){box(.32,.9,18,'#6b4128',g,x,.45,0);box(.5,.14,18.2,'#f0c040',g,x,.95,0).userData.noInk=true;}
  // cannons on both flanks, muzzles facing the deck
  for(const side of [-1,1])for(const z of [-3.2,1.2,5.4]){
    const c=new THREE.Group();c.position.set(side*14.2,.6,z);c.rotation.y=side>0?-Math.PI/2:Math.PI/2;g.add(c);
    const barrel=cylinder(.26,.34,1.5,'#2b2f36',c,0,.1,.3,10);barrel.rotation.x=Math.PI/2;
    cylinder(.32,.32,.16,'#3a3f48',c,0,.1,1.05,10).rotation.x=Math.PI/2;
    for(const wx of [-.4,.4]){const wheel=cylinder(.32,.32,.12,'#6b4128',c,wx,-.15,.2,12);wheel.rotation.z=Math.PI/2;}
    box(.7,.22,1.1,'#5a3622',c,0,-.15,.2);
  }
  // rope coils and barrels at the rail keep the deck busy without blocking it
  for(const [x,z] of [[-13.2,-7.9],[13.3,-7.8],[-13.4,7.9],[13.3,8]]){cylinder(.42,.44,.8,'#a86a3c',g,x,.4,z,10);cylinder(.45,.45,.08,'#3d4650',g,x,.62,z,10);}
}
// Ziggurat court: checkered sandstone, a raised parapet with fire bowls at the corners.
function stoneFloor(g,t,anim){
  box(30,1.2,18,'#b98a4e',g,0,-.62,0).userData.noInk=true;
  for(let ix=0;ix<15;ix++)for(let iz=0;iz<9;iz++){const tile=box(1.96,.1,1.96,(ix+iz)%2?'#ecd09a':'#e0bf84',g,-14+ix*2+.0,.01,-8+iz*2+.0);tile.userData.noInk=true;tile.castShadow=false;}
  const mosaic=new THREE.Mesh(new THREE.RingGeometry(2.2,2.5,40),new THREE.MeshBasicMaterial({color:'#a9793a'}));mosaic.rotation.x=-Math.PI/2;mosaic.position.set(0,.09,3.4);g.add(mosaic);
  const star=new THREE.Mesh(new THREE.RingGeometry(0,1.5,8),new THREE.MeshBasicMaterial({color:'#c9964f'}));star.rotation.x=-Math.PI/2;star.position.set(0,.085,3.4);g.add(star);
  for(const z of [-8.95,8.95])box(30.2,.7,.5,'#d8b878',g,0,.35,z);
  for(const x of [-14.95,14.95])box(.5,.7,18,'#d8b878',g,x,.35,0);
  const flames=[];
  for(const x of [-14.95,-7.5,0,7.5,14.95])for(const z of [-8.95,8.95]){box(.8,1.2,.8,'#c9a566',g,x,.6,z);}
  for(const [x,z] of [[-14.6,-8.6],[14.6,-8.6],[-14.6,8.6],[14.6,8.6]]){
    cylinder(.55,.3,.5,'#6a4a2a',g,x,1.45,z,10);
    const fl=new THREE.Mesh(new THREE.ConeGeometry(.38,.9,8),new THREE.MeshBasicMaterial({color:'#ff9a2a',transparent:true,opacity:.9}));fl.position.set(x,2.15,z);g.add(fl);
    const core=new THREE.Mesh(new THREE.ConeGeometry(.2,.6,8),new THREE.MeshBasicMaterial({color:'#ffe27a'}));core.position.set(x,2.05,z);g.add(core);flames.push([fl,core]);
  }
  anim.push(time=>flames.forEach(([a,b],i)=>{const k=1+Math.sin(time*9+i*1.7)*.18;a.scale.set(1,k,1);b.scale.set(1,1+Math.sin(time*13+i)*.25,1);}));
}
// Snow island: white ground, ice patches under the zones, soft banks and a stake fence at the back.
function snowFloor(g,t,anim){
  box(30,1.1,18,'#dfe9f5',g,0,-.57,0).userData.noInk=true;
  const ground=box(30,.12,18,'#f6fbff',g,0,.0,0);ground.userData.noInk=true;
  for(let i=0;i<26;i++){const x=Math.sin(i*5.3)*13.5,z=Math.cos(i*3.1)*7.6;const patch=box(1.4+(i%3)*.5,.02,.8+(i%2)*.5,'#e2edf9',g,x,.075,z);patch.rotation.y=i;patch.userData.noInk=true;patch.castShadow=false;}
  for(let i=0;i<5;i++){const crack=box(2.2,.015,.05,'#a7c3df',g,-9+i*4.4,.08,-1+((i*7)%5)*1.4);crack.rotation.y=.6+i*.5;crack.userData.noInk=true;crack.castShadow=false;}
  for(let x=-14.5;x<=14.5;x+=1.5){const bank=sphere(.9+((x*7)%3+3)%3*.15,'#ffffff',g,x,.15,9.2,10);bank.scale.set(1.2,.55,.9);bank.castShadow=false;const back=sphere(.9,'#f4f9ff',g,x+.6,.15,-9.2,10);back.scale.set(1.2,.6,.9);}
  for(const x of [-14.95,14.95])for(let z=-8;z<=8;z+=1.8){const bank=sphere(.85,'#ffffff',g,x,.15,z,10);bank.scale.set(.9,.55,1.2);}
  for(let x=-13.5;x<=13.5;x+=3){cylinder(.09,.11,1.2,'#6c4b3a',g,x,.7,-8.9,6);cone(.13,.25,'#f6fbff',g,x,1.4,-8.9,6);}
  box(28,.09,.09,'#6c4b3a',g,0,1.05,-8.9);box(28,.09,.09,'#6c4b3a',g,0,.65,-8.9);
}
function arenaFloor(g,t,layout,anim){
  const look=layout.look;
  if(look==='ship')shipFloor(g,t,anim);else if(look==='stone')stoneFloor(g,t,anim);else if(look==='snow')snowFloor(g,t,anim);else classicFloor(g,t);
  buildDecks(g,t,layout);
}

// Terrain: quicksand swirls, glossy ice sheets and springboard nets.
// Flame vents: a stone grate that glows and spits embers during the warning, then a column of fire. Driven by the sim tick.
function buildVents(g,layout){
  const vents=(layout.vents||[]).map(v=>{
    const grp=new THREE.Group();grp.position.set(v.x,.1,v.z);g.add(grp);
    cylinder(v.r+.25,v.r+.3,.16,'#6f6a63',grp,0,.04,0,24);
    const plate=cylinder(v.r,v.r,.06,'#2a2523',grp,0,.12,0,24);plate.userData.noInk=true;
    for(let i=0;i<4;i++){const bar=box(v.r*2,.05,.1,'#3d3632',grp,0,.17,0);bar.rotation.y=i*Math.PI/4;bar.userData.noInk=true;}
    const glow=new THREE.Mesh(new THREE.CircleGeometry(v.r*.95,24),new THREE.MeshBasicMaterial({color:'#ff7a1c',transparent:true,opacity:0,depthWrite:false}));glow.rotation.x=-Math.PI/2;glow.position.y=.2;glow.userData.noInk=true;grp.add(glow);
    const flame=new THREE.Group();grp.add(flame);
    for(const [r,h,c,o] of [[.9,3.6,'#ff5a1a',.85],[.62,3.1,'#ffa526',.9],[.34,2.4,'#fff1a0',.95]]){const m=new THREE.Mesh(new THREE.ConeGeometry(v.r*r,h,10,1,true),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false,side:THREE.DoubleSide}));m.position.y=h/2;m.userData.noInk=true;flame.add(m);}
    flame.visible=false;
    const embers=[];for(let i=0;i<8;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.07,6,5),new THREE.MeshBasicMaterial({color:'#ffb347',transparent:true,opacity:0,depthWrite:false}));m.userData.noInk=true;grp.add(m);embers.push({m,a:i*.8,ph:i/8});}
    return {v,glow,flame,embers};
  });
  return (tick,time)=>{
    for(const {v,glow,flame,embers} of vents){
      const s=ventState(v,tick);
      glow.material.opacity=s.phase==='warn'?.25+.5*s.k*Math.abs(Math.sin(time*(6+s.k*16))):s.phase==='erupt'?.9:0;
      flame.visible=s.phase==='erupt';
      if(flame.visible){const k=s.k,rise=Math.min(1,k*5),fade=1-Math.max(0,(k-.7)/.3);flame.scale.set(.8+.25*Math.sin(time*40),rise*fade,.8+.25*Math.cos(time*37));}
      for(const e of embers){const on=s.phase!=='idle',c=(time*.9+e.ph)%1;e.m.material.opacity=on?(1-c)*.9:0;e.m.position.set(Math.cos(e.a+time)*v.r*.6*c,.25+c*(s.phase==='erupt'?3:1.1),Math.sin(e.a+time)*v.r*.6*c);}
    }
  };
}
// A quicksand pit: a rim, a darker bed, swirling arcs and an eye. Built for the stage's pits and for pits that appear during a match (a thrown trap, a new sinkhole).
function makePit(g,z,anim){
  const pit=new THREE.Group();pit.position.set(z.x,.1,z.z);g.add(pit);
  const rim=cylinder(z.r,z.r,.04,'#c98c45',pit,0,0,0,32);rim.userData.noInk=true;rim.castShadow=false;
  const bed=cylinder(z.r*.8,z.r*.8,.05,'#a4692d',pit,0,.006,0,32);bed.userData.noInk=true;bed.castShadow=false;
  const swirl=new THREE.Group();pit.add(swirl);
  for(let i=0;i<3;i++){const arc=new THREE.Mesh(new THREE.TorusGeometry(z.r*(.28+i*.2),.035,6,40,Math.PI*1.3),new THREE.MeshBasicMaterial({color:'#8a5a28'}));arc.rotation.x=-Math.PI/2;arc.rotation.z=i*2.1;arc.position.y=.04;swirl.add(arc);}
  const eye=cylinder(z.r*.18,z.r*.18,.06,'#7a4c1f',pit,0,.01,0,20);eye.userData.noInk=true;
  anim.push(time=>{swirl.rotation.y=-time*.9;});
  return pit;
}
// A hole through the floor into the sea (a deck blown open, an ice sheet cracked): water, a foam rim and a few broken boards or ice shards around it.
function makeHole(g,z,theme,anim){
  const grp=new THREE.Group();grp.position.set(z.x,.13,z.z);g.add(grp);
  const w=z.w,d=z.d;
  const rim=box(w+.5,.05,d+.5,theme.plankAlt||'#c29258',grp,0,-.02,0);rim.userData.noInk=true;rim.castShadow=false;
  const water=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:theme.water}));water.rotation.x=-Math.PI/2;water.position.y=.03;water.userData.noInk=true;grp.add(water);
  const deep=new THREE.Mesh(new THREE.PlaneGeometry(w*.7,d*.7),new THREE.MeshBasicMaterial({color:'#1b6f9e',transparent:true,opacity:.65}));deep.rotation.x=-Math.PI/2;deep.position.y=.04;deep.userData.noInk=true;grp.add(deep);
  const foam=new THREE.Mesh(new THREE.PlaneGeometry(w*.9,d*.9),new THREE.MeshBasicMaterial({color:theme.foam,transparent:true,opacity:.4,depthWrite:false}));foam.rotation.x=-Math.PI/2;foam.position.y=.05;foam.userData.noInk=true;grp.add(foam);
  for(let i=0;i<14;i++){
    const side=i%4,t=(i*.37)%1,px=side<2?(t-.5)*w:(side===2?-1:1)*(w/2+.15),pz=side<2?(side===0?-1:1)*(d/2+.15):(t-.5)*d;
    const plank=box(.55+(i%3)*.2,.07,.16,theme.plank,grp,px,.08,pz);plank.rotation.y=i*1.3;plank.rotation.z=(i%3-1)*.35;plank.userData.noInk=true;
  }
  anim.push(time=>{foam.material.opacity=.3+.15*Math.sin(time*2.3+z.x);deep.scale.setScalar(1+.04*Math.sin(time*1.7));});
  return grp;
}
function terrain(g,layout,anim){
  const springs=[],pits=new Map();
  for(const [zi,z] of layout.zones.entries()){
    if(z.kind==='quicksand'){
      pits.set('z'+zi,{pit:makePit(g,z,anim),r0:z.r});
    }else if(z.kind==='ice'){
      const sheet=box(z.w,.05,z.d,'#b4e4ff',g,z.x,.1,z.z);sheet.userData.noInk=true;sheet.castShadow=false;
      const edge=box(z.w+.14,.03,z.d+.14,'#f4fbff',g,z.x,.085,z.z);edge.userData.noInk=true;edge.castShadow=false;
      for(let i=0;i<4;i++){const shine=box(z.w*.35,.01,.07,'#ffffff',g,z.x-z.w*.25+i*z.w*.17,.13,z.z-z.d*.3+i*z.d*.2);shine.rotation.y=.6;shine.userData.noInk=true;shine.castShadow=false;}
    }else if(z.kind==='hotspring'){
      const pool=new THREE.Group();pool.position.set(z.x,0,z.z);g.add(pool);
      cylinder(z.r+.35,z.r+.45,.28,'#8d96a6',pool,0,.14,0,24);
      const water=cylinder(z.r,z.r,.05,'#62dccb',pool,0,.29,0,28);water.userData.noInk=true;water.castShadow=false;
      const glow=cylinder(z.r*.62,z.r*.62,.05,'#b8fff0',pool,0,.31,0,24);glow.userData.noInk=true;glow.castShadow=false;
      for(let i=0;i<7;i++){const a=i/7*Math.PI*2;sphere(.22+(i%3)*.06,i%2?'#a8b0bd':'#9aa3b2',pool,Math.cos(a)*(z.r+.55),.2,Math.sin(a)*(z.r+.55),8);}
      const steam=[];for(let i=0;i<9;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.4,depthWrite:false}));m.userData.noInk=true;m.castShadow=false;pool.add(m);steam.push({m,ph:i/9,a:i*2.4});}
      anim.push(time=>{glow.scale.setScalar(.92+.08*Math.sin(time*2));for(const {m,ph,a} of steam){const c=(time*.28+ph)%1;m.position.set(Math.cos(a)*z.r*.5*(1-c*.3)+Math.sin(time+a)*.12,.4+c*2.4,Math.sin(a)*z.r*.5*(1-c*.3));m.scale.setScalar(.2+c*.55);m.material.opacity=.38*Math.sin(c*Math.PI);}});
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
  return {springs,pits};
}

const DRESSING={
  port(g,t,anim){
    toonWater(g,anim,{deep:'#2596cc',shallow:'#48c0e8',foam:'#f4fdff',fog:t.fog,speed:.8,lines:.6});sunGlow(g,anim,{color:'#fff0b8',shafts:.11});
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
    toonWater(g,anim,{deep:'#e6bb76',shallow:'#f0cc8c',foam:'#f8e6bc',fog:t.fog,speed:.25,lines:.3,edge:false,ripple:true});sunGlow(g,anim,{color:'#ffe6a0',shafts:.13});
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
    toonWater(g,anim,{deep:'#3a72b4',shallow:'#5f9bd8',foam:'#eaf5ff',fog:t.fog,speed:.5,lines:.55});sunGlow(g,anim,{color:'#e8f2ff',shafts:.07});
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
  arenaFloor(g,t,layout,anim);
  const {springs,pits}=terrain(g,layout,anim);
  const dynZones=new Map();   // zones that appear during a match (holes, trap pits, new pits), by id
  (DRESSING[stageId]||DRESSING.port)(g,t,anim);
  const crowd=addCrowd(g,stageId,anim);
  const ventFx=buildVents(g,layout);
  ink(g,.07,'#1a1d24',.25);
  // Keep the meshes in step with the world's live zones: pits grow with their radius, new holes and pits appear, expired ones go away.
  function syncZones(zones){
    const live=new Set();
    for(const z of zones||[]){
      live.add(z.id);
      const base=pits.get(z.id);
      if(base){base.pit.scale.setScalar(z.r/base.r0);continue;}
      let d=dynZones.get(z.id);
      if(!d){
        const grp=z.kind==='water'?makeHole(g,z,t,anim):z.kind==='quicksand'?makePit(g,z,anim):null;
        if(!grp)continue;
        d={grp,r0:z.r,w0:z.w,d0:z.d};dynZones.set(z.id,d);ink(grp,.05,'#1a1d24',.25);d.born=performance.now();
      }
      const pop=Math.min(1,(performance.now()-d.born)/350),e=1-Math.pow(1-pop,3);
      if(z.kind==='water'){d.grp.scale.set(z.w/d.w0*e,1,z.d/d.d0*e);}
      else d.grp.scale.setScalar(z.r/(d.r0||z.r)*e);
    }
    for(const [id,d] of dynZones)if(!live.has(id)){g.remove(d.grp);d.grp.traverse(o=>{if(o.isMesh){if(!o.userData.ink)o.geometry.dispose();}});dynZones.delete(id);}
  }
  return {group:g,theme:t,ventFx,crowd,syncZones,update(time,dt){for(const f of anim)f(time,dt);},bounce(x,z){const s=springs.find(s=>Math.hypot(s.x-x,s.z-z)<1.6);if(s)s.squash=1;}};
}
export function disposeStage(stage){
  stage.group.parent?.remove(stage.group);
  stage.group.traverse(o=>{if((o.isMesh||o.isPoints)&&!o.userData.ink)o.geometry.dispose();if(o.material&&!o.userData.ink&&!isSharedMaterial(o.material)){o.material.map?.dispose();o.material.dispose();}});
}
