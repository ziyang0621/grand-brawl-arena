import * as THREE from './vendor/three.module.js';
import {STEP,PLATFORMS,createWorld,step,jump,attack,heavy,grab,bomb,skill,dodge} from './arena-core.js';

const $=id=>document.getElementById(id);
const scene=new THREE.Scene();scene.background=new THREE.Color('#93d6dc');scene.fog=new THREE.Fog('#93d6dc',42,100);
const camera=new THREE.OrthographicCamera(-15,15,10,-10,.1,140);
camera.position.set(0,14,25);camera.lookAt(0,1,0);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true});}
catch(e){$('loading').textContent='3D 显示未能启动，请在支持 WebGL 的浏览器中打开。';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
$('arena').appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight('#fff4d2','#6d8b9b',1.5));
const sun=new THREE.DirectionalLight('#fff1cb',2);sun.position.set(-10,20,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-18;sun.shadow.camera.right=18;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;sun.shadow.normalBias=.035;scene.add(sun);
const materials=new Map();
function mat(color){if(!materials.has(color))materials.set(color,new THREE.MeshToonMaterial({color}));return materials.get(color);}
function mesh(geometry,color,parent=scene,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
const box=(w,h,d,color,parent,x,y,z)=>mesh(new THREE.BoxGeometry(w,h,d),color,parent,x,y,z);
const sphere=(r,color,parent,x,y,z)=>mesh(new THREE.SphereGeometry(r,16,12),color,parent,x,y,z);
const cylinder=(rt,rb,h,color,parent,x,y,z)=>mesh(new THREE.CylinderGeometry(rt,rb,h,12),color,parent,x,y,z);
function label(text,color='#fff4cf',size=64){const c=document.createElement('canvas');c.width=512;c.height=128;const cx=c.getContext('2d');cx.font=`900 ${size}px sans-serif`;cx.textAlign='center';cx.textBaseline='middle';cx.lineWidth=9;cx.strokeStyle='#153346';cx.strokeText(text,256,64);cx.fillStyle=color;cx.fillText(text,256,64);const texture=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));s.scale.set(3.4,.85,1);return s;}
function fxMesh(geometry,color,parent,x,y,z,opacity=.75,additive=true){const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=false;parent.add(m);return m;}

// The same deck definitions drive both visuals and landing collision.
box(30,1,18,'#785747',scene,0,-.52,0);
for(let i=0;i<39;i++)box(.75,.12,17.8,i%3===0?'#bda075':'#caaf80',scene,-14.5+i*.76,.01,0);
for(const z of [-9,9])box(30,.2,.15,'#493d39',scene,0,.1,z);
for(const deck of PLATFORMS){
  const g=new THREE.Group();g.position.set(deck.x,0,deck.z);scene.add(g);
  box(deck.w,.32,deck.d,'#5f4938',g,0,deck.top-.16,0);
  for(let i=0;i<5;i++)box(deck.w/5-.025,.09,deck.d,'#6c9d70',g,-deck.w/2+(i+.5)*deck.w/5,deck.top-.045,0);
  for(const x of [-deck.w/2+.2,deck.w/2-.2])for(const z of [-deck.d/2+.2,deck.d/2-.2])cylinder(.12,.16,deck.top,'#635043',g,x,deck.top/2,z);
  for(const x of [-.7,.7]){const rung=box(.08,deck.top+.1,.08,'#e2ba7a',g,x,deck.top/2,deck.d/2+.12);rung.rotation.x=.15;}
  for(let y=.3;y<deck.top;y+=.35)box(1.5,.07,.08,'#e2ba7a',g,0,y,deck.d/2+.16);
}
const sea=box(200,.3,200,'#54b5c4',scene,0,-1.5,0);sea.receiveShadow=false;
for(let i=0;i<65;i++){const x=Math.sin(i*7.1)*37,z=Math.cos(i*2.3)*32;if(Math.abs(x)<12&&Math.abs(z)<8)continue;const foam=box(1+(i%4),.015,.06,'#b6e7df',scene,x,-1.32,z);foam.castShadow=false;}
for(const x of [-14,14])for(const z of [-8,0,8]){cylinder(.18,.22,1.3,'#615044',scene,x,.55,z);cylinder(.23,.23,.16,'#e5c58d',scene,x,1,z);}
// Quayside buildings, sails and palms give the arena a pirate-port silhouette.
for(const [x,w,h,c] of [[-8,4.8,3.7,'#e9d69f'],[-2.5,4.5,4.7,'#d79172'],[4,5,3.3,'#e9c58b'],[9,3.2,4,'#b8cfb2']]){
  box(w,h,2.6,c,scene,x,h/2,-10.5);
  const roof=mesh(new THREE.ConeGeometry(w*.77,1.65,4),'#475f72',scene,x,h+.65,-10.5);roof.rotation.y=Math.PI/4;roof.scale.z=.8;
  for(const off of [-.8,.8]){box(.7,1.1,.06,'#355466',scene,x+off,h*.55,-9.15);box(.08,1.15,.08,'#eddbac',scene,x+off,h*.55,-9.09);}
}
function palm(x,z){const trunk=cylinder(.19,.33,5,'#8c7154',scene,x,1.8,z);trunk.rotation.z=-.13;for(let i=0;i<7;i++){const leaf=sphere(1,'#4f8972',scene,x-.3,4.4,z);leaf.scale.set(.45,.13,2.6);leaf.rotation.y=i*Math.PI*2/7;leaf.rotation.z=.18;}}
palm(-12,-4);palm(12,-6);
const mast=cylinder(.1,.16,9,'#775e48',scene,-13,3,-14);
const sail=box(5.5,4.4,.08,'#fff0c3',scene,-13,4,-14);sail.rotation.z=.05;
const portSign=label('WINDWARD PORT','#f7e6ae',40);portSign.position.set(.3,3.7,-8.9);portSign.scale.set(5,1.2,1);scene.add(portSign);

function fighter(color,blue=false){
  const root=new THREE.Group(),body=new THREE.Group();root.add(body);scene.add(root);
  const skin='#efbe8f',dark='#283b4e';
  const torso=cylinder(.4,.48,.8,color,body,0,1.13,0);
  box(.46,.63,.44,'#f4dfa9',body,0,1.15,.09);
  for(const side of [-1,1])box(.21,.82,.5,color,body,side*.34,1.17,.04);
  cylinder(.49,.48,.15,dark,body,0,.78,0);box(.2,.16,.06,'#edc56e',body,0,.78,.49);
  const legs=[];
  for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.24,.67,0);body.add(leg);cylinder(.19,.17,.38,'#e5d3b0',leg,0,-.17,0);box(.38,.28,.58,dark,leg,0,-.51,.1);legs.push(leg);}
  cylinder(.16,.16,.2,skin,body,0,1.62,0);
  const head=sphere(.54,skin,body,0,2.05,.04);head.scale.set(1,1.05,.92);
  const hair=sphere(.55,dark,body,0,2.21,-.07);hair.scale.set(1,.8,.88);
  for(const side of [-1,1]){sphere(.1,skin,body,side*.53,2.02,0);box(.06,.115,.04,'#1b2d3d',body,side*.19,2.05,.52);const brow=box(.15,.04,.06,dark,body,side*.19,2.19,.5);brow.rotation.z=side*.17;}
  box(.2,.035,.025,'#934f46',body,0,1.84,.52);
  cylinder(.61,.61,.13,color,body,0,2.45,0);
  const hat=mesh(new THREE.ConeGeometry(.77,.52,3),dark,body,0,2.71,0);hat.rotation.y=Math.PI/3;
  sphere(.1,'#f3deb0',body,0,2.6,.49);
  const scarf=box(.24,.85,.08,color,body,.38,1.2,-.35);scarf.rotation.z=-.28;
  const arms=[];
  for(const side of [-1,1]){const arm=new THREE.Group();arm.position.set(side*.52,1.47,0);body.add(arm);sphere(.23,color,arm,0,-.08,0);cylinder(.14,.14,.44,skin,arm,0,-.34,0);sphere(.19,skin,arm,0,-.61,.06);arms.push(arm);}
  const sword=new THREE.Group();sword.position.set(0,-.57,.14);sword.rotation.x=1.15;arms[1].add(sword);
  cylinder(.07,.07,.32,'#594838',sword,0,0,0);box(.55,.09,.18,'#e9bb58',sword,0,.15,0);
  const blade=box(.2,1.14,.075,'#e8f4e9',sword,0,.73,0);blade.rotation.z=-.06;
  const tip=mesh(new THREE.ConeGeometry(.15,.25,3),'#e8f4e9',sword,-.04,1.41,0);tip.rotation.y=.5;
  const weaponGlow=fxMesh(new THREE.BoxGeometry(.38,1.48,.16),'#ffd84e',sword,0,.76,.01,0);weaponGlow.rotation.z=-.06;
  const swordTrail=fxMesh(new THREE.PlaneGeometry(.82,1.82),'#ffbf28',sword,-.1,.8,-.08,0);swordTrail.rotation.z=-.08;
  const swordSparks=[];for(let i=0;i<5;i++){const spark=fxMesh(new THREE.SphereGeometry(.055+(i%2)*.025,8,6),i%2?'#fff3a0':'#ffbe2e',sword,0,.25+i*.25,.12,0);spark.userData={phase:i*.23};swordSparks.push(spark);}
  // A visible bomb pouch on the off hand / hip.
  sphere(.22,'#2c3544',body,-.57,.79,-.18);box(.045,.15,.045,'#e9ba65',body,-.57,1.06,-.18);
  const ring=mesh(new THREE.RingGeometry(.55,.64,40),blue?'#70dbe4':'#ffd477',root,0,.035,0);ring.rotation.x=-Math.PI/2;ring.material.side=THREE.DoubleSide;ring.castShadow=false;
  const shield=new THREE.Mesh(new THREE.CircleGeometry(.86,32),new THREE.MeshBasicMaterial({color:'#87dfff',transparent:true,opacity:.42,side:THREE.DoubleSide,depthWrite:false}));shield.position.set(0,1.35,.72);shield.visible=false;body.add(shield);
  const poisonFx=new THREE.Group(),virusFx=new THREE.Group(),iceFx=new THREE.Group(),burnFx=new THREE.Group();root.add(poisonFx,virusFx,iceFx,burnFx);
  const poisonBubbles=[];for(let i=0;i<8;i++){const a=i*Math.PI*2/8,r=.48+(i%3)*.13,b=fxMesh(new THREE.SphereGeometry(.09+(i%2)*.035,10,8),i%2?'#78ff8c':'#c4ff75',poisonFx,Math.cos(a)*r,.45+(i%4)*.5,Math.sin(a)*r,.72);b.userData={a,y:b.position.y,r};poisonBubbles.push(b);}
  const virusNodes=[];for(let i=0;i<7;i++){const a=i*Math.PI*2/7,r=.55+(i%2)*.15,n=fxMesh(new THREE.IcosahedronGeometry(.12+(i%3)*.025,0),i%2?'#c26cff':'#7657ff',virusFx,Math.cos(a)*r,.55+(i%3)*.65,Math.sin(a)*r,.8);n.userData={a,y:n.position.y,r};virusNodes.push(n);}
  const iceShards=[];for(const [x,y,z,s] of [[-.42,.42,.18,.42],[.42,.42,.18,.42],[-.58,1.15,.1,.34],[.58,1.15,.1,.34],[-.34,1.78,.25,.28],[.34,1.78,.25,.28]]){const shard=fxMesh(new THREE.ConeGeometry(.17,s,4),'#a9e9ff',iceFx,x,y,z,.76);shard.rotation.z=x<0?.45:-.45;iceShards.push(shard);}
  const faceFlush=fxMesh(new THREE.SphereGeometry(.555,16,12),'#ef4b3f',body,0,2.05,.04,0,false);faceFlush.scale.set(1,1.05,.92);
  const blushCheeks=[-.25,.25].map(x=>fxMesh(new THREE.CircleGeometry(.12,16),'#ff5b53',body,x,1.99,.535,0,false));
  const smoke=[];for(let i=0;i<6;i++){const a=i*Math.PI*2/6,s=fxMesh(new THREE.SphereGeometry(.14+(i%3)*.035,10,8),i%2?'#26313a':'#ff7849',burnFx,Math.cos(a)*.48,.45+(i%3)*.6,Math.sin(a)*.48,i%2?.5:.8,i%2===0);s.userData={a,y:s.position.y};smoke.push(s);}
  for(const fx of [poisonFx,virusFx,iceFx,burnFx])fx.visible=false;
  const tag=label(blue?'CPU':'YOU',blue?'#97eff1':'#ffe68d',52);tag.scale.set(1.15,.29,1);tag.position.y=3.2;root.add(tag);
  return {root,body,arms,legs,sword,weaponGlow,swordTrail,swordSparks,ring,shield,poisonFx,poisonBubbles,virusFx,virusNodes,iceFx,iceShards,faceFlush,blushCheeks,burnFx,smoke,tag};
}
const models=[fighter('#c95e43'),fighter('#367c98',true)];
let world=createWorld(),started=false,netRole='solo',netPeer=null,netConn=null,netRoom='',localPlayerId=0,netSendAcc=0,netBroadcastAcc=0,netEvents=[];
let peerLibPromise=null;
const NETWORK_INPUT_RATE=1/30,NETWORK_STATE_RATE=1/20;
function roomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}
function loadPeerJS(){
  if(window.Peer)return Promise.resolve();
  if(peerLibPromise)return peerLibPromise;
  const urls=['https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js','https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js'];
  peerLibPromise=new Promise((resolve,reject)=>{let i=0;const next=()=>{if(i>=urls.length){reject(new Error('PeerJS unavailable'));return;}const s=document.createElement('script');s.src=urls[i++];s.onload=()=>window.Peer?resolve():next();s.onerror=next;document.head.appendChild(s);};next();});
  return peerLibPromise;
}
function networkStatus(text,error=false){$('netStatus').textContent=text;$('netStatus').style.color=error?'#ffad9d':'#ffd77f';}
function sendNet(data){if(netConn?.open)try{netConn.send(data);}catch(_){networkStatus('连接发送失败',true);}}
function snapshot(){return {t:'state',state:{...world,events:netEvents.splice(0)},started};}
function sendSnapshot(){if(netRole==='host'&&netConn?.open)sendNet(snapshot());}
function closeNetwork(){if(netConn){try{netConn.close();}catch(_){}}if(netPeer){try{netPeer.destroy();}catch(_){}}netConn=null;netPeer=null;netRole='solo';netRoom='';localPlayerId=0;world.online=false;started=false;netEvents.length=0;networkStatus('单人练习');$('room3dLabel').textContent='';$('host3d').classList.remove('hide');$('join3d').classList.remove('hide');$('room3d').classList.remove('hide');$('leave3d').classList.add('hide');}
function serialInput(){return {x:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),z:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp')),guard:keys.has('KeyR')};}
function applyAction(p,code){if(code==='Space')jump(p);if(code==='KeyJ')attack(world,p);if(code==='KeyU')heavy(world,p);if(code==='KeyI')grab(world,p);if(code==='KeyK')bomb(world,p);if(code==='KeyL')skill(world,p);if(code==='ShiftLeft'||code==='ShiftRight')dodge(p);}
function bindHostConnection(conn){
  if(netConn){conn.on('open',()=>{conn.send({t:'reject',reason:'房间已有玩家'});conn.close();});return;}
  netConn=conn;conn.on('data',data=>{if(!data||typeof data!=='object')return;if(data.t==='hello'){world.online=true;world.training=false;started=true;networkStatus('朋友已加入 · 3D 联机');$('room3dLabel').textContent='房间 '+netRoom;conn.send({t:'welcome',you:1,room:netRoom});sendSnapshot();}else if(data.t==='input'&&data.input)world.remoteInput={x:Number(data.input.x)||0,z:Number(data.input.z)||0,guard:Boolean(data.input.guard)};else if(data.t==='action'&&data.code)applyAction(world.fighters[1],data.code);});
  conn.on('close',()=>{if(netRole==='host'){netConn=null;world.online=false;started=false;networkStatus('朋友已离开，等待重新加入');}});conn.on('error',()=>networkStatus('朋友连接异常',true));
}
async function create3DRoom(){
  if(netRole!=='solo')return;networkStatus('正在创建房间…');try{await loadPeerJS();netRole='host';netRoom=roomCode();netPeer=new Peer('gb3d-room-'+netRoom,{host:'0.peerjs.com',port:443,path:'/',secure:true,debug:0});netPeer.on('open',()=>{networkStatus('等待朋友加入');$('room3dLabel').textContent='房间 '+netRoom+' · 发给朋友';$('host3d').classList.add('hide');$('join3d').classList.add('hide');$('room3d').classList.add('hide');$('leave3d').classList.remove('hide');});netPeer.on('connection',bindHostConnection);netPeer.on('error',()=>{networkStatus('房间创建失败，请重试',true);closeNetwork();});}catch(_){closeNetwork();networkStatus('联机组件加载失败',true);}}
async function join3DRoom(){
  if(netRole!=='solo')return;const room=$('room3d').value.trim().toUpperCase();if(!/^[A-Z2-9]{4}$/.test(room)){networkStatus('请输入四位房间码',true);return;}networkStatus('正在加入 '+room+'…');try{await loadPeerJS();netRole='guest';netRoom=room;localPlayerId=1;netPeer=new Peer(undefined,{host:'0.peerjs.com',port:443,path:'/',secure:true,debug:0});netPeer.on('open',()=>{netConn=netPeer.connect('gb3d-room-'+room,{reliable:true});netConn.on('open',()=>netConn.send({t:'hello'}));netConn.on('data',data=>{if(!data||typeof data!=='object')return;if(data.t==='welcome'){world.online=true;started=false;networkStatus('3D 联机 · 等待同步');$('room3dLabel').textContent='已加入房间 '+room;$('host3d').classList.add('hide');$('join3d').classList.add('hide');$('room3d').classList.add('hide');$('leave3d').classList.remove('hide');}else if(data.t==='state'&&data.state){world=data.state;world.online=true;started=Boolean(data.started);networkStatus('3D 联机 · 已连接');}});netConn.on('close',()=>{networkStatus('房主已离开',true);closeNetwork();});netConn.on('error',()=>networkStatus('连接异常，请重试',true));});netPeer.on('error',()=>{networkStatus('找不到房间，请检查房间码',true);closeNetwork();});}catch(_){closeNetwork();networkStatus('联机组件加载失败',true);}}
function networkAction(code){if(netRole==='guest'){sendNet({t:'action',code});started=true;return false;}return true;}
function bindNetworkUi(){const host=$('host3d'),join=$('join3d'),leave=$('leave3d');if(!host||!join||!leave){setTimeout(bindNetworkUi,0);return;}host.onclick=create3DRoom;join.onclick=join3DRoom;leave.onclick=()=>{closeNetwork();reset();};}
bindNetworkUi();
const crateModels=world.crates.map(c=>{const g=new THREE.Group();g.position.set(c.x,0,c.z);scene.add(g);box(.95,.95,.95,'#ae7d4c',g,0,.48,0);for(const y of [.1,.85])box(1.02,.11,1.02,'#5e5046',g,0,y,0);const slat=box(1.13,.12,.06,'#e1b479',g,0,.5,.5);slat.rotation.z=.7;return g;});
const bombModels=new Map(),cloudModels=new Map(),effects=[],pickupModels=[];
const particleGeo=new THREE.IcosahedronGeometry(.1,0);
function particles(e,color,count=18){for(let i=0;i<count;i++){const m=mesh(particleGeo,color,scene,e.x,e.y,e.z);const v=new THREE.Vector3((Math.random()-.5)*8,Math.random()*6,(Math.random()-.5)*8);effects.push({m,life:.45,max:.45,v,shared:true});}}
function ringEffect(e,color,radius=2.8,life=.4){const m=new THREE.Mesh(new THREE.RingGeometry(radius*.8,radius,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(e.x,e.y,e.z);scene.add(m);effects.push({m,life,max:life,grow:true});}
let sound=null;
function tone(frequency,duration=.08,type='square',volume=.035){if(!sound)return;const o=sound.createOscillator(),g=sound.createGain();o.type=type;o.frequency.setValueAtTime(frequency,sound.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,frequency/3),sound.currentTime+duration);g.gain.setValueAtTime(volume,sound.currentTime);g.gain.exponentialRampToValueAtTime(.001,sound.currentTime+duration);o.connect(g);g.connect(sound.destination);o.start();o.stop(sound.currentTime+duration);}
function unlockAudio(){if(!sound){const AC=window.AudioContext||window.webkitAudioContext;if(AC)sound=new AC();}sound?.resume();}
let shake=0,calloutTime=2;
function announce(s){$('callout').textContent=s;calloutTime=1.1;}
function events(){const batch=world.events.splice(0);if(netRole==='host')netEvents.push(...batch);for(const e of batch){
  if(e.type==='hit'){particles(e,'#ffe898');shake=e.damage>=18?.3:.16;const tag=label('-'+e.damage,'#ffecab',65);tag.position.set(e.x,e.y+1,e.z);tag.scale.set(1.4,.5,1);scene.add(tag);effects.push({m:tag,life:.6,max:.6,v:new THREE.Vector3(0,2,0),sprite:true});tone(e.damage>=18?85:120,.1,'sawtooth');}
  if(e.type==='impact'){particles(e,e.kind==='bomb'?'#ff7048':e.force>=8?'#ffd266':'#fff0a6',e.force>=8?28:16);ringEffect(e,e.kind==='bomb'?'#ff7048':e.force>=8?'#ffd266':'#fff0a6',e.force>=8?2.2:1.5,.18);}
  if(e.type==='slash'){
    const m=new THREE.Mesh(new THREE.RingGeometry(e.attackType==='slam'?1.8:1.4,e.attackType==='slam'?2.8:2.4,24,1,-1.1,2.2),new THREE.MeshBasicMaterial({color:e.attackType==='slam'?'#ffbd61':e.weapon==='sword'?'#ffd648':e.id===0?'#fff1a6':'#a7f4ff',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));m.rotation.set(-Math.PI/2,0,-Math.atan2(e.fz,e.fx));m.position.set(e.x,e.y,e.z);scene.add(m);effects.push({m,life:.2,max:.2});tone(e.attackType==='slam'?150:310,.06,'triangle');if(e.id===0)announce(e.attackType==='slam'?'坠落重击！':e.attackType==='air'?'空中斩！':['一斩！','二连斩！','重斩！'][e.combo]);
  }
  if(e.type==='heavy'){ringEffect(e,'#ffb45c',2.2,.22);particles(e,'#ffe19a',12);announce('重击！');tone(180,.12,'sawtooth');}
  if(e.type==='grab'){announce('擒抱！');tone(260,.09,'square');}
  if(e.type==='throwHit'){ringEffect(e,'#ffcf72',1.5,.28);announce('抓取投摔！');shake=.2;tone(100,.18,'sawtooth');}
  if(e.type==='explosion'){particles(e,e.kind==='poison'?'#83f09a':e.kind==='slow'?'#8ab8ff':'#ffab4c',32);ringEffect(e,e.kind==='poison'?'#8dffac':e.kind==='slow'?'#8ab8ff':'#ffdf76',3);shake=.28;tone(70,.24,'sawtooth',.06);}
  if(e.type==='cloud'){const color=e.kind==='virus'?'#c084ff':'#83f09a';particles(e,color,24);ringEffect(e,color,e.kind==='virus'?2.8:2.2,.55);announce(e.kind==='virus'?'病毒云扩散！':'毒雾扩散！');tone(e.kind==='virus'?150:190,.18,'sawtooth');}
  if(e.type==='skill'){ringEffect(e,'#7ef3e0',3.4,.6);particles(e,'#d8fff0',25);announce('旋风斩！');tone(480,.3,'triangle');}
  if(e.type==='guard'){ringEffect(e,'#8bd8ff',1.5,.18);announce('挡住了！');tone(220,.08,'triangle');}
  if(e.type==='parry'){ringEffect(e,'#fff1a0',1.7,.28);announce('完美反击！');shake=.18;tone(760,.16,'triangle');}
  if(e.type==='guardBreak'){ringEffect(e,'#ff8b72',1.8,.3);announce('防御崩溃！');tone(90,.2,'sawtooth');}
  if(e.type==='knockdown'){ringEffect(e,'#ffb477',1.35,.25);announce('倒地！');}
  if(e.type==='wakeup'){ringEffect(e,'#b5f5ff',1.1,.25);announce('起身！');}
  if(e.type==='energy'&&e.id===localPlayerId)tone(500,.05,'triangle');
  if(e.type==='break'){particles(e,'#d6a564');announce(`箱子打开：${ITEM_NAMES[e.item]||'道具'}出现`);}
  if(e.type==='pickup'){announce(`捡到 ${ITEM_NAMES[e.item]||'道具'} · 按 K 使用`);tone(620,.12,'triangle');}
  if(e.type==='ready'){announce('金色强化刀已装备：攻击 +35%，持续 10 秒！');tone(520,.16,'triangle');}
  if(e.type==='power'){announce('啤酒增幅：攻击 +55%，持续 8 秒！');ringEffect(e,'#ffd66e',1.4,.45);tone(700,.16,'triangle');}
  if(e.type==='poison'){announce('中毒！持续掉血');particles(e,'#8dffac',12);}
  if(e.type==='slow'){announce('减速！');particles(e,'#8ab8ff',12);}
  if(e.type==='dot'){const tag=label('-'+e.damage,'#9dffb0',58);tag.position.set(e.x,e.y+1,e.z);tag.scale.set(.9,.35,1);scene.add(tag);effects.push({m:tag,life:.45,max:.45,v:new THREE.Vector3(0,1,0),sprite:true});}
  if(e.type==='crateDrop'){announce('空投箱来了！');tone(180,.12,'triangle');}
  if(e.type==='crateLand'){particles(e,'#d6a564',10);tone(110,.12,'square');}
  if(e.type==='heal'){announce('恢复 +20');particles(e,'#98f8b5');}
  if(e.type==='lifeLost'){announce(`失去一条命！剩余 ${e.lives} 命`);ringEffect(e,'#ff9b78',1.8,.35);tone(120,.18,'sawtooth');}
  if(e.type==='respawn'){announce('重新登场！');ringEffect(e,'#9df5ff',1.6,.35);}
  if(e.type==='end'){$('resultTitle').textContent=e.winner===null?'平局！':e.winner===0?'你赢了！':'再来挑战！';$('result').showModal();keys.clear();}
}}
const ITEM_NAMES={bomb:'炸弹',poison:'毒瓶',virus:'病毒瓶',meat:'肉块',beer:'啤酒',slow:'冰冻瓶',sword:'强化木刀'};
function fighterStatus(p){const states=[];let kind='';const add=(active,text,tone)=>{if(active){states.push(text);if(!kind)kind=tone;}};add(p.poisonTime>0,`中毒 ${p.poisonTime.toFixed(1)}s`,'poison');add(p.virusTime>0,`病毒感染 ${p.virusTime.toFixed(1)}s`,'virus');add(p.slowTime>0,`冻伤减速 ${p.slowTime.toFixed(1)}s`,'ice');add(p.burnTime>0,`炸伤 ${p.burnTime.toFixed(1)}s`,'burn');add(p.weapon==='sword',`金色强化刀 ${p.attackBoostTime.toFixed(1)}s`,'sword');add(p.attackBoostTime>0&&p.weapon!=='sword',`啤酒强化 ${p.attackBoostTime.toFixed(1)}s`,'beer');return {text:states.join(' · '),kind};}
function updateStatusBadge(id,p){const el=$(id),status=fighterStatus(p);el.textContent=status.text;el.hidden=!status.text;el.dataset.kind=status.kind;}
const keys=new Set();
const moveCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
function action(code){const p=world.fighters[localPlayerId];if(world.ended)return;if([...moveCodes,'Space','KeyJ','KeyU','KeyI','KeyK','KeyL','ShiftLeft','ShiftRight'].includes(code))started=true;if(!networkAction(code))return;applyAction(p,code);}
addEventListener('keydown',e=>{if(e.target.matches('input,textarea'))return;if([...moveCodes,'Space','KeyJ','KeyU','KeyI','KeyK','KeyL','KeyR','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault();unlockAudio();keys.add(e.code);if(!e.repeat)action(e.code);});
addEventListener('keyup',e=>keys.delete(e.code));
function release(){keys.clear();world.fighters[0].jumpBuffer=0;}
addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{release();last=performance.now();acc=0;});
for(const [id,code] of [['jumpButton','Space'],['attackButton','KeyJ'],['heavyButton','KeyU'],['grabButton','KeyI'],['bombButton','KeyK'],['skillButton','KeyL']])$(id).onclick=()=>{unlockAudio();action(code);$(id).blur();};
renderer.domElement.addEventListener('pointerdown',()=>{unlockAudio();document.activeElement?.blur();});
function removeEffect(e){scene.remove(e.m);if(e.sprite)e.m.material.map.dispose();if(!e.shared){e.m.geometry?.dispose();e.m.material.dispose();}}
function reset(){if(netRole==='guest')return;const training=world.training,online=world.online,stock=world.stock;world=createWorld();world.training=training;world.online=online;world.stock=stock;if(stock)world.fighters.forEach(p=>p.lives=3);started=online;if(training)world.fighters[1].x=-1.6;release();$('result').close();for(const m of bombModels.values()){scene.remove(m);m.traverse(o=>o.geometry?.dispose());}bombModels.clear();for(const m of cloudModels.values()){scene.remove(m);m.traverse(o=>o.geometry?.dispose());}cloudModels.clear();for(const e of effects)removeEffect(e);effects.length=0;announce(stock?'三命模式 · 还有三条命':training?'按 J / U / I 测试攻击':online?'等待朋友同步':'移动或攻击，开始乱斗！');if(netRole==='host')sendSnapshot();}
$('restart').onclick=reset;$('playAgain').onclick=reset;
$('training').onclick=()=>{if(netRole!=='solo')return;world.training=!world.training;$('training').textContent=world.training?'对手：静止练习':'对手：战斗 AI';reset();};
$('livesMode').onclick=()=>{if(netRole==='guest')return;world.stock=!world.stock;$('livesMode').textContent=world.stock?'三命模式：开':'三命模式：关';reset();};
$('platformPractice').onclick=()=>{if(netRole!=='solo')return;world.training=true;$('training').textContent='对手：静止练习';reset();Object.assign(world.fighters[0],{x:0,z:-2.2});Object.assign(world.fighters[1],{x:6,z:3});announce('按空格 · 跳上中央绿色甲板');};
function updateVisuals(dt){
  world.fighters.forEach((p,i)=>{
    const m=models[i];m.root.position.set(p.x,p.y,p.z);const facing=Math.atan2(p.fx,p.fz);
    m.body.rotation.y=facing+(p.skillTime>0?(1-p.skillTime/.6)*Math.PI*4:0);
    const walking=p.grounded&&Math.hypot(p.vx,p.vz)>1;
    m.body.position.y=walking?Math.abs(Math.sin(p.walk))*.065:Math.sin(world.tick*.025)*.015;
    m.legs.forEach((leg,j)=>leg.rotation.x=walking?Math.sin(p.walk+j*Math.PI)*.5:!p.grounded?-.4:0);
    m.arms[0].rotation.x=walking?-Math.sin(p.walk)*.4:-.25;
    m.arms[1].rotation.x=-.5;
    m.arms[1].rotation.z=-.25;
    if(p.attackTime>0){const total=(p.attackType==='heavy'||p.attackType==='slam')?.5:p.attackType==='grab'?.42:.34,swing=Math.max(0,Math.min(1,1-p.attackTime/total)),arc=Math.sin(swing*Math.PI);if(p.attackType==='grab'){m.arms[0].rotation.x=-.45-arc*1.15;m.arms[1].rotation.x=-.45-arc*1.15;m.arms[0].rotation.z=.25;m.arms[1].rotation.z=-.25;}else if(p.attackType==='slam'){m.arms[1].rotation.x=-2.3+arc*3.4;m.arms[1].rotation.z=-.6+arc*1.4;}else{m.arms[1].rotation.x=-1.5+arc*(p.attackType==='heavy'?3.1:2.6);m.arms[1].rotation.z=-.8+arc*(p.attackType==='heavy'?2.15:1.8);}}
    if(p.skillTime>0){m.arms[0].rotation.z=1.2;m.arms[1].rotation.z=-1.3;}else if(p.blocking){m.arms[0].rotation.x=-1.25;m.arms[0].rotation.z=.62;m.arms[1].rotation.x=-1.25;m.arms[1].rotation.z=-.62;}else m.arms[0].rotation.z=.16;
    if(p.blocking){m.arms[0].rotation.x=-1.25;m.arms[1].rotation.x=-1.25;m.shield.position.z=.88;}else m.shield.position.z=.72;
    m.shield.visible=p.blocking;m.shield.material.opacity=.3+Math.sin(world.tick*.12)*.08;
    m.body.rotation.z=p.knocked>0?-.9:p.stun>0?-.24:0;m.body.scale.setScalar(p.hurtTime>0?1.04+Math.sin(world.tick*.8)*.025:1);m.body.visible=!(p.invuln>0&&Math.floor(world.tick/6)%2===0);
    const t=world.tick*STEP,pulse=1+Math.sin(t*9+i)*.12;
    m.ring.material.color.set(i===0?'#ffd477':'#70dbe4');
    m.poisonFx.visible=p.poisonTime>0;m.poisonBubbles.forEach((b,j)=>{b.position.x=Math.cos(b.userData.a+t*(1.5+j*.08))*b.userData.r;b.position.z=Math.sin(b.userData.a+t*(1.5+j*.08))*b.userData.r;b.position.y=.35+((b.userData.y+t*(.55+j*.04))%2.25);b.scale.setScalar(.8+Math.sin(t*7+j)*.25);});
    m.virusFx.visible=p.virusTime>0;m.virusFx.rotation.y=-t*2.2;m.virusNodes.forEach((n,j)=>{n.position.y=n.userData.y+Math.sin(t*9+j)*.13;n.rotation.x+=dt*(2+j*.2);n.rotation.y+=dt*3;n.scale.setScalar(.8+Math.abs(Math.sin(t*8+j))*.65);});
    m.iceFx.visible=p.slowTime>0;m.iceShards.forEach((s,j)=>{s.material.opacity=.55+Math.sin(t*6+j)*.2;s.scale.setScalar(.92+Math.sin(t*5+j)*.08);});
    const beerActive=p.attackBoostTime>0&&p.weapon!=='sword';m.faceFlush.material.opacity=beerActive?.15+Math.sin(t*5)*.035:0;m.blushCheeks.forEach((c,j)=>{c.material.opacity=beerActive?.48+Math.sin(t*6+j)*.1:0;c.scale.setScalar(beerActive?.95+Math.sin(t*5+j)*.08:1);});m.body.rotation.x=beerActive?Math.sin(t*3.4+i)*.035:0;
    m.burnFx.visible=p.burnTime>0;m.smoke.forEach((s,j)=>{s.position.y=s.userData.y+((1.25-p.burnTime)*(.65+j*.05))%1.4;s.position.x=Math.cos(s.userData.a+t*1.8)*(.4+j*.025);s.material.opacity=Math.min(.8,p.burnTime*.65)*(j%2?.55:1);s.scale.setScalar(.8+(1.25-p.burnTime)*.35);});
    const armed=p.item==='sword'||p.weapon==='sword',swordActive=p.weapon==='sword';m.weaponGlow.material.opacity=armed?(swordActive?.94:.32):0;m.weaponGlow.scale.set(swordActive?1.28:1,swordActive?1.24:1,1);m.swordTrail.material.opacity=swordActive?.34+Math.abs(Math.sin(t*10))*.24:0;m.swordTrail.scale.setScalar(swordActive?1.08+Math.sin(t*8)*.08:1);m.swordSparks.forEach((s,j)=>{const travel=(t*.9+s.userData.phase)%1;s.position.y=.18+travel*1.25;s.position.x=Math.sin(t*12+j)*.13;s.material.opacity=swordActive?(1-travel)*.95:0;s.scale.setScalar(swordActive?.8+(1-travel)*.8:1);});
    m.ring.position.y=.035;m.tag.position.y=3.15;
  });
  for(const b of world.bombs){let g=bombModels.get(b.id);if(!g){g=new THREE.Group();const bottle=b.kind==='poison'||b.kind==='virus'||b.kind==='slow';if(bottle){const color=b.kind==='virus'?'#8d55bd':b.kind==='slow'?'#4c9ee8':'#55a866';const glow=b.kind==='virus'?'#d19aff':b.kind==='slow'?'#bde8ff':'#a7f58c';cylinder(.18,.23,.48,color,g,0,0,0);sphere(.16,glow,g,0,.3,0);box(.16,.08,.16,'#e7d1a7',g,0,.28,0);}else{sphere(.26,'#29394b',g,0,0,0);const fuse=box(.055,.23,.055,'#ffd366',g,.06,.3,0);fuse.rotation.z=-.3;sphere(.07,'#fff1a2',g,.1,.42,0);}scene.add(g);bombModels.set(b.id,g);}g.position.set(b.x,b.y,b.z);g.rotation.z+=dt*(b.kind==='bomb'?6:3);}
  for(const [id,m] of bombModels)if(!world.bombs.some(b=>b.id===id)){scene.remove(m);m.traverse(o=>o.geometry?.dispose());bombModels.delete(id);}
  for(const c of world.clouds){let g=cloudModels.get(c.id);if(!g){g=new THREE.Group();const color=c.kind==='virus'?'#b66cff':c.kind==='slow'?'#6db9ff':'#72e889';const fog=new THREE.Mesh(new THREE.SphereGeometry(1,18,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.28,depthWrite:false}));fog.scale.set(1.5,.45,1.5);g.add(fog);const ring=new THREE.Mesh(new THREE.RingGeometry(.85,1.1,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;g.add(ring);scene.add(g);cloudModels.set(c.id,g);}g.position.set(c.x,c.y,c.z);g.scale.setScalar(.75+(1-c.life/(c.kind==='virus'?7:c.kind==='slow'?4:5))*.35);}
  for(const [id,m] of cloudModels)if(!world.clouds.some(c=>c.id===id)){scene.remove(m);m.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});cloudModels.delete(id);}
  crateModels.forEach((m,i)=>{const c=world.crates[i];m.visible=c.hp>0||c.falling;m.position.set(c.x,c.y||0,c.z);m.rotation.z=c.falling?Math.sin(world.tick*.12+i):0;});
  while(pickupModels.length<world.pickups.length){const g=new THREE.Group();
    const core=sphere(.28,'#29394b',g,0,.4,0);core.scale.x=1.25;
    const band=box(.7,.08,.08,'#f4ddb0',g,0,.4,0);
    const fuse=box(.055,.23,.055,'#ffd366',g,.06,.72,0);fuse.rotation.z=-.3;
    const poison=cylinder(.18,.23,.48,'#73d890',g,0,.42,0);poison.rotation.z=.12;
    const bubbles=sphere(.1,'#c9ffad',g,.2,.72,0);bubbles.scale.set(.8,1,.8);
    const virus=cylinder(.18,.23,.48,'#8d55bd',g,0,.42,0);virus.rotation.z=-.12;
    const virusGlow=sphere(.1,'#d19aff',g,.2,.72,0);virusGlow.scale.set(.8,1,.8);
    const blade=box(.12,.9,.06,'#eff8eb',g,0,.65,0);blade.rotation.z=-.1;
    const hilt=box(.5,.08,.12,'#e9bb58',g,0,.25,0);
    const beer=cylinder(.2,.2,.5,'#d79a3b',g,0,.43,0);const foam=sphere(.22,'#fff0bd',g,0,.72,0);
    const slow=cylinder(.2,.2,.48,'#7faee8',g,0,.42,0);slow.rotation.z=-.12;const snow=sphere(.1,'#d9f2ff',g,.18,.72,0);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.36,.44,24),new THREE.MeshBasicMaterial({color:'#ffe17d',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.08;g.add(ring);
    g.userData={core,band,fuse,poison,bubbles,virus,virusGlow,blade,hilt,beer,foam,slow,snow,ring,type:''};scene.add(g);pickupModels.push(g);
  }
  pickupModels.forEach((m,i)=>{const p=world.pickups[i];m.visible=!!p;if(p){const u=m.userData;if(u.type!==p.type){u.type=p.type;u.core.visible=p.type==='bomb';u.band.visible=p.type==='meat';u.fuse.visible=p.type==='bomb';u.poison.visible=p.type==='poison';u.bubbles.visible=p.type==='poison';u.virus.visible=p.type==='virus';u.virusGlow.visible=p.type==='virus';u.blade.visible=p.type==='sword';u.hilt.visible=p.type==='sword';u.beer.visible=p.type==='beer';u.foam.visible=p.type==='beer';u.slow.visible=p.type==='slow';u.snow.visible=p.type==='slow';u.ring.material.color.set(p.type==='poison'?'#8dffac':p.type==='virus'?'#c084ff':p.type==='bomb'?'#ffcf68':p.type==='meat'?'#ff9b6b':p.type==='beer'?'#ffd66e':p.type==='slow'?'#8ab8ff':'#fff0a5');}m.position.set(p.x,.1+Math.sin(world.tick*.05)*.1,p.z);m.rotation.y+=dt;}});
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;if(e.life<=0){removeEffect(e);effects.splice(i,1);continue;}if(e.v){e.m.position.addScaledVector(e.v,dt);if(!e.sprite)e.v.y-=dt*16;}if(e.grow)e.m.scale.setScalar(.5+(1-e.life/e.max)*.8);if(!e.shared)e.m.material.opacity=e.life/e.max;else e.m.scale.setScalar(e.life/e.max);}
  calloutTime-=dt;$('callout').style.opacity=calloutTime>0?'1':'0';
  const [a,b]=world.fighters;const local=world.fighters[localPlayerId],other=world.fighters[localPlayerId===0?1:0];$('livesMode').textContent=world.stock?'三命模式：开':'三命模式：关';$('playerHP').value=local.hp;$('rivalHP').value=other.hp;const livesText=world.stock?` · ${local.lives}命`:'';$('playerInfo').textContent=`${local.hp} / 100${livesText} · ${local.item?ITEM_NAMES[local.item]:'空手'}`;$('rivalInfo').textContent=`${other.hp} / 100${world.stock?` · ${other.lives}命`:''} · ${world.online?'朋友':'战斗 AI'}`;updateStatusBadge('playerStatus',local);updateStatusBadge('rivalStatus',other);$('time').textContent=Math.ceil(world.time);document.querySelector('.red span').textContent=localPlayerId===0?'YOU':'HOST';document.querySelector('.blue span').textContent=localPlayerId===1?'YOU':'CPU';
  $('bombLabel').textContent=local.item?(local.item==='sword'?'装备强化木刀':`使用${ITEM_NAMES[local.item]}`):'先打碎箱子';$('skillLabel').textContent=local.energy<1?'能量不足':local.skillCD>0?`${local.skillCD.toFixed(1)}s`:'旋风斩';if($('energy')){$('energy').value=local.energy;$('energyLabel').textContent=`能量 ${local.energy.toFixed(1)} / ${local.energyMax}`;}
  const status=local.knocked>0?'倒地中':local.blocking?'防御中':local.climbing?'爬楼梯中':local.poisonTime>0?`中毒 ${local.poisonTime.toFixed(1)}s · 禁止闪避`:local.virusTime>0?`病毒感染 ${local.virusTime.toFixed(1)}s · 禁止闪避`:local.slowTime>0?`冰冻减速 ${local.slowTime.toFixed(1)}s · 禁止闪避`:local.burnTime>0?`炸伤冒烟 ${local.burnTime.toFixed(1)}s`:local.weapon==='sword'?`强化刀 ${local.attackBoostTime.toFixed(1)}s`:local.attackBoostTime>0?`啤酒力量 ${local.attackBoostTime.toFixed(1)}s`:'';$('movement').textContent=`${local.climbing?'楼梯':local.grounded?(local.support==='ground'?'地面':'已站稳绿色甲板'):'空中'} · 高度 ${local.y.toFixed(2)} · 二段跳 ${local.jumps}/2${status?' · '+status:''}`;
  const focus=world.fighters[localPlayerId]||world.fighters[0],focusX=Math.max(-5,Math.min(5,focus.x*.45)),focusZ=Math.max(-2,Math.min(2,focus.z*.24));camera.position.x=focusX;camera.position.z=25+focusZ*.18;camera.lookAt(focusX,1,focusZ);if(shake>0){shake=Math.max(0,shake-dt);camera.position.x+= (Math.random()-.5)*shake*.8;}
}
function resize(){const aspect=innerWidth/innerHeight;const halfH=Math.max(8.5,12.8/aspect);camera.left=-halfH*aspect;camera.right=halfH*aspect;camera.top=halfH;camera.bottom=-halfH;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);resize();
let last=performance.now(),acc=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.1);last=now;if(document.hidden)return;acc+=dt;const input=serialInput();if(netRole==='guest'){netSendAcc+=dt;if(netSendAcc>=NETWORK_INPUT_RATE){netSendAcc=0;sendNet({t:'input',input});}}else{while(acc>=STEP){if(started)step(world,input);acc-=STEP;}if(netRole==='host'){netBroadcastAcc+=dt;if(netBroadcastAcc>=NETWORK_STATE_RATE){netBroadcastAcc=0;sendSnapshot();}}}events();updateVisuals(dt);renderer.render(scene,camera);}
$('loading').remove();requestAnimationFrame(frame);
