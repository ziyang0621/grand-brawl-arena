import * as THREE from './vendor/three.module.js';
import {createCloudVisual,updateCloudVisual} from './arena-clouds.js';
import {STEP,createWorld,step,jump,attack,heavy,grab,bomb,skill,dodge,sprint,toggleAim} from './arena-core.js';
import {CHARACTERS,CHARACTER_IDS,STAGES,STAGE_IDS,SLOT_COLORS,SLOT_LABELS,characterOf} from './arena-roster.js';
import {createTouchControls,isTouchDevice} from './arena-touch.js';
import {ConnectionAttempt,InputLease,cleanInput,neutralInput,sameRound,voteRematch} from './arena-session.js';
import {mesh,box,sphere,cylinder,fxMesh,label,ink,starSprite,isSharedMaterial} from './arena-gfx.js';
import {buildFighter,disposeFighter,renderPortraits} from './arena-models.js';
import {buildStage,disposeStage,THEMES} from './arena-stage.js';

const $=id=>document.getElementById(id);
const combatNumber=value=>Number(value.toFixed(1));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const scene=new THREE.Scene();scene.background=new THREE.Color('#7fc6ec');scene.fog=new THREE.Fog('#b9e4f7',60,170);
// Perspective, low three-quarter camera like PS2 arena brawlers; it frames both fighters.
const camera=new THREE.PerspectiveCamera(34,innerWidth/innerHeight,.1,400);
camera.position.set(0,9,20);camera.lookAt(0,1.2,0);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true});}
catch(e){$('loading').textContent='3D 显示未能启动，请在支持 WebGL 的浏览器中打开。';throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
$('arena').appendChild(renderer.domElement);
const hemi=new THREE.HemisphereLight('#fff6dc','#5f8aa0',1.5);scene.add(hemi);
const sun=new THREE.DirectionalLight('#fff3d6',2.1);sun.position.set(-10,22,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:14,bottom:-14});sun.shadow.normalBias=.035;scene.add(sun);

const portraits=renderPortraits();
const selection=(()=>{const fallback={p1:'swordsman',p2:'guardian',stage:'port'};try{const s=JSON.parse(localStorage.getItem('gb-selection')||'{}');return {p1:CHARACTERS[s.p1]?s.p1:fallback.p1,p2:CHARACTERS[s.p2]?s.p2:fallback.p2,stage:STAGES[s.stage]?s.stage:fallback.stage};}catch(_){return fallback;}})();
function saveSelection(){try{localStorage.setItem('gb-selection',JSON.stringify(selection));}catch(_){}}
let guestChar='guardian';

// ---- Stage and fighter models follow the authoritative world (also on the guest). ----
let stage=null;
const waveMesh=new THREE.Mesh(new THREE.BoxGeometry(34,1.4,19),new THREE.MeshBasicMaterial({color:'#77dded',transparent:true,opacity:0,depthWrite:false}));waveMesh.position.y=.25;waveMesh.visible=false;scene.add(waveMesh);
function ensureStage(){
  const id=STAGES[world.stage]?world.stage:'port';if(stage?.id===id)return;
  if(stage)disposeStage(stage);stage=buildStage(id);stage.id=id;scene.add(stage.group);
  const t=THEMES[id];scene.background.set(t.skyBottom);scene.fog.color.set(t.fog);hemi.color.set(t.hemiSky);hemi.groundColor.set(t.hemiGround);sun.color.set(t.sun);waveMesh.material.color.set(t.wave);
  for(const m of cannonModels.values())scene.remove(m);cannonModels.clear();
}
const models=[null,null,null,null];
function ensureModels(){
  world.fighters.forEach((p,i)=>{
    if(models[i]?.char===p.char)return;
    if(models[i])disposeFighter(models[i]);models[i]=buildFighter(p.char,i,scene);models[i].body.rotation.order='YXZ';
    const c=CHARACTERS[p.char];
    if(i<2){const k=i?'p2':'p1';$(k+'Name').textContent=c.name;$(k+'Portrait').src=portraits[p.char]||'';}
  });
  // Leaving brawl mode: drop the extra fighters' models.
  for(let i=world.fighters.length;i<models.length;i++)if(models[i]){disposeFighter(models[i]);models[i]=null;}
}
const CHARGE_TEXT={whirlwind:'旋风蓄力！快离开',shieldQuake:'震盾蓄力！跳起来',fistStorm:'连打蓄力！拉开距离',barrage:'弹幕锁定！离开红圈'};
const CHARGE_COLORS=['#ffb448','#69dfff','#ff8fd0','#9dff8a'];
const chargeModels=[0,1,2,3].map(i=>{
  const root=new THREE.Group();scene.add(root);
  const color=CHARGE_COLORS[i];
  const edge=fxMesh(new THREE.RingGeometry(.94,1,64),color,root,0,.09,0,.9,false);edge.rotation.x=-Math.PI/2;edge.material.side=THREE.DoubleSide;
  const fill=fxMesh(new THREE.CircleGeometry(1,64),color,root,0,.08,0,.2,false);fill.rotation.x=-Math.PI/2;fill.material.side=THREE.DoubleSide;
  const tags={};for(const [kind,text] of Object.entries(CHARGE_TEXT)){const tag=label(text,kind==='barrage'?'#ff8a6a':color,42);tag.position.y=3.8;tag.scale.set(3.8,.65,1);tag.visible=false;root.add(tag);tags[kind]=tag;}
  root.visible=false;return {root,edge,fill,tags};
});

let world=createWorld({chars:[selection.p1,selection.p2],stage:selection.stage}),started=false,netRole='solo',netPeer=null,netConn=null,netRoom='',localPlayerId=0,netSendAcc=0,netBroadcastAcc=0,netEvents=[];
let peerLibPromise=null;
const NETWORK_INPUT_RATE=1/30,NETWORK_STATE_RATE=1/20;
const guestInput=new InputLease();
const connectionAttempt=new ConnectionAttempt();
let connectionTimer=null;
function beginConnection(){
  const token=connectionAttempt.begin();if(token===null)return null;
  started=false;keys.clear();acc=0;
  $('host3d').disabled=true;$('join3d').disabled=true;$('leave3d').classList.remove('hide');
  connectionTimer=setTimeout(()=>{if(connectionAttempt.current(token))closeNetwork('连接超时，请重试或检查网络',true);},20000);
  return token;
}
function finishConnection(token){
  if(!connectionAttempt.current(token))return;
  connectionAttempt.finish(token);clearTimeout(connectionTimer);connectionTimer=null;
}
function roomCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:4},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}
function loadPeerJS(){
  if(window.Peer)return Promise.resolve();
  if(peerLibPromise)return peerLibPromise;
  const urls=['https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js','https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js'];
  peerLibPromise=new Promise((resolve,reject)=>{let i=0;const next=()=>{if(i>=urls.length){reject(new Error('PeerJS unavailable'));return;}const s=document.createElement('script');s.src=urls[i++];let done=false;const settle=ok=>{if(done)return;done=true;clearTimeout(timer);s.onload=s.onerror=null;if(ok&&window.Peer)resolve();else{s.remove();next();}};const timer=setTimeout(()=>settle(false),6000);s.onload=()=>settle(true);s.onerror=()=>settle(false);document.head.appendChild(s);};next();}).catch(error=>{peerLibPromise=null;throw error;});
  return peerLibPromise;
}
function networkStatus(text,error=false){$('netStatus').textContent=text;$('netStatus').style.color=error?'#ffad9d':'#ffd77f';}
function sendNet(data){if(netConn?.open)try{netConn.send(data);}catch(_){networkStatus('连接发送失败',true);}}
function snapshot(){return {t:'state',state:{...world,events:netEvents.splice(0)},started,paused:document.hidden};}
function sendSnapshot(){if(netRole==='host'&&netConn?.open)sendNet(snapshot());}
function closeNetwork(message='单人练习',error=false){
  connectionAttempt.cancel();clearTimeout(connectionTimer);connectionTimer=null;
  $('host3d').disabled=false;$('join3d').disabled=false;
  const conn=netConn,peer=netPeer;netConn=null;netPeer=null;netRole='solo';netRoom='';localPlayerId=0;
  try{conn?.close();}catch(_){}try{peer?.destroy();}catch(_){}
  guestInput.clear();world.remoteInput=neutralInput();world.online=false;started=false;acc=0;netSendAcc=0;netBroadcastAcc=0;netEvents.length=0;
  networkStatus(message,error);$('room3dLabel').textContent='';$('host3d').classList.remove('hide');$('join3d').classList.remove('hide');$('room3d').classList.remove('hide');$('leave3d').classList.add('hide');
  refreshSelect();
}
function serialInput(){return {x:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),z:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp')),guard:keys.has('KeyR')};}
function applyAction(p,code,data={}){if(world.intro>0||world.roundOver>0)return;const input=data.input||serialInput();if(code==='KeyQ')toggleAim(p);if(code==='Space')jump(p,input);if(code==='KeyJ')attack(world,p,input);if(code==='KeyU')heavy(world,p,input);if(code==='KeyI')grab(world,p,input);if(code==='KeyK')bomb(world,p);if(code==='KeyL')skill(world,p,data.level||1);if(code==='ShiftLeft'||code==='ShiftRight')dodge(p);if(code==='Sprint')sprint(p);}
function bindHostConnection(conn){
  if(netConn){conn.on('open',()=>{conn.send({t:'reject',reason:'房间已有玩家'});conn.close();});return;}
  netConn=conn;guestInput.clear();let welcomed=false;
  conn.on('data',data=>{
    if(netConn!==conn||!data||typeof data!=='object')return;
    if(data.t==='hello'&&!welcomed){welcomed=true;guestChar=CHARACTERS[data.char]?data.char:'guardian';world.online=true;world.training=false;networkStatus('朋友已加入 · 联机对战');$('room3dLabel').textContent='房间 '+netRoom;conn.send({t:'welcome',you:1,room:netRoom});hideSelect();reset();return;}
    if(!welcomed||!sameRound(world,data))return;
    if(data.t==='input'){guestInput.receive(data.input,performance.now());world.remoteInput=guestInput.read(performance.now());}
    else if(data.t==='action'&&data.code&&!world.ended&&!document.hidden)applyAction(world.fighters[1],data.code,{...data,input:cleanInput(data.input)});
    else if(data.t==='rematch'){if(voteRematch(world,1,data.round))reset();else sendSnapshot();}
  });
  conn.on('close',()=>{if(netRole==='host'&&netConn===conn){netConn=null;guestInput.clear();world.remoteInput=neutralInput();world.online=false;started=false;networkStatus('朋友已离开，等待重新加入');}});conn.on('error',()=>networkStatus('朋友连接异常',true));
}
async function create3DRoom(){
  if(netRole!=='solo')return;
  const token=beginConnection();if(token===null)return;
  networkStatus('正在创建房间…');
  try{
    await loadPeerJS();if(!connectionAttempt.current(token))return;
    netRole='host';netRoom=roomCode();
    const peer=new Peer('gb3d-room-'+netRoom,{host:'0.peerjs.com',port:443,path:'/',secure:true,debug:0});netPeer=peer;
    peer.on('open',()=>{if(netPeer!==peer)return;finishConnection(token);networkStatus('等待朋友加入');$('room3dLabel').textContent='房间 '+netRoom+' · 发给朋友';$('host3d').classList.add('hide');$('join3d').classList.add('hide');$('room3d').classList.add('hide');refreshSelect();});
    peer.on('connection',conn=>{if(netPeer===peer)bindHostConnection(conn);else conn.close();});
    peer.on('error',()=>{if(netPeer===peer)closeNetwork('房间创建失败，请重试',true);});
  }catch(_){if(connectionAttempt.current(token))closeNetwork('联机组件加载失败，请重试',true);}
}
async function join3DRoom(){
  if(netRole!=='solo')return;
  const room=$('room3d').value.trim().toUpperCase();if(!/^[A-Z2-9]{4}$/.test(room)){networkStatus('请输入四位房间码',true);return;}
  const token=beginConnection();if(token===null)return;
  networkStatus('正在加入 '+room+'…');
  try{
    await loadPeerJS();if(!connectionAttempt.current(token))return;netRole='guest';netRoom=room;localPlayerId=1;acc=0;refreshSelect();
    const peer=new Peer(undefined,{host:'0.peerjs.com',port:443,path:'/',secure:true,debug:0});netPeer=peer;
    peer.on('open',()=>{
      if(netPeer!==peer)return;
      const conn=peer.connect('gb3d-room-'+room,{reliable:true});netConn=conn;let receivedState=false;
      conn.on('open',()=>conn.send({t:'hello',char:selection.p1}));
      conn.on('data',data=>{
        if(netConn!==conn||!data||typeof data!=='object')return;
        if(data.t==='reject'){closeNetwork(data.reason||'房间无法加入',true);return;}
        if(data.t==='welcome'){world.online=true;started=false;networkStatus('联机 · 等待同步');$('room3dLabel').textContent='已加入房间 '+room;$('host3d').classList.add('hide');$('join3d').classList.add('hide');$('room3d').classList.add('hide');$('leave3d').classList.remove('hide');}
        else if(data.t==='state'&&data.state){
          finishConnection(token);
          const nextRound=data.state.round||0,oldRound=world.round||0;
          if(receivedState&&(nextRound<oldRound||(nextRound===oldRound&&data.state.tick<world.tick)))return;
          const newRound=!receivedState||nextRound!==oldRound,queued=newRound?[]:world.events;
          world=data.state;world.events=[...queued,...(data.state.events||[])];world.online=true;started=Boolean(data.started);receivedState=true;
          if(newRound){clearVisualEffects();$('result').close();keys.clear();acc=0;hideSelect();sendNet({t:'input',round:nextRound,input:neutralInput()});}
          networkStatus(data.paused?'房主切到后台 · 对局暂停':'联机 · 已连接');
        }
      });
      conn.on('close',()=>{if(netConn===conn)closeNetwork('房主已离开，可重新加入房间',true);});
      conn.on('error',()=>{if(netConn===conn)closeNetwork('连接异常，请重新加入',true);});
    });
    peer.on('error',()=>{if(netPeer===peer)closeNetwork('找不到房间，请检查房间码',true);});
  }catch(_){if(connectionAttempt.current(token))closeNetwork('联机组件加载失败，请重试',true);}
}
function networkAction(code,data){if(netRole==='guest'){sendNet({t:'action',round:world.round||0,code,...data});return false;}return true;}
$('host3d').onclick=create3DRoom;$('join3d').onclick=join3DRoom;$('leave3d').onclick=()=>{closeNetwork();reset();};

// ---- Props, effects and sound ----
function containerModel(){const g=new THREE.Group(),crate=new THREE.Group(),barrel=new THREE.Group(),chest=new THREE.Group();g.add(crate,barrel,chest);box(.95,.95,.95,'#c08a50',crate,0,.48,0);for(const y of [.1,.85])box(1.02,.11,1.02,'#5e4636',crate,0,y,0);const slat=box(1.13,.12,.06,'#ecc080',crate,0,.5,.5);slat.rotation.z=.7;cylinder(.43,.48,.95,'#a86a3c',barrel,0,.48,0);for(const y of [.16,.78])cylinder(.48,.48,.09,'#3d4650',barrel,0,y,0);box(1.1,.72,.82,'#9a5f2e',chest,0,.38,0);const lid=box(1.14,.3,.86,'#e2a93c',chest,0,.88,0);lid.rotation.z=-.08;box(.2,.26,.08,'#fff0a0',chest,0,.51,.45);ink(g,.035);g.userData={crate,barrel,chest,kind:''};return g;}
function setContainerKind(g,kind){if(g.userData.kind===kind)return;g.userData.kind=kind;g.userData.crate.visible=kind==='crate';g.userData.barrel.visible=kind==='barrel';g.userData.chest.visible=kind==='chest';}
const crateModels=world.crates.map(c=>{const g=containerModel();g.position.set(c.x,0,c.z);setContainerKind(g,c.kind);scene.add(g);return g;});
const bombModels=new Map(),cloudModels=new Map(),propModels=new Map(),cannonModels=new Map(),shotModels=new Map(),effects=[],pickupModels=[];
const particleGeo=new THREE.IcosahedronGeometry(.1,0);
function particles(e,color,count=18){for(let i=0;i<count;i++){const m=mesh(particleGeo,color,scene,e.x,e.y,e.z);const v=new THREE.Vector3((Math.random()-.5)*8,Math.random()*6,(Math.random()-.5)*8);effects.push({m,life:.45,max:.45,v,shared:true});}}
function ringEffect(e,color,radius=2.8,life=.4,delay=0){const m=new THREE.Mesh(new THREE.RingGeometry(radius*.8,radius,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.85,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(e.x,e.y,e.z);m.visible=delay<=0;scene.add(m);effects.push({m,life,max:life,grow:true,delay});}
// Comic star burst: the signature PS2-anime hit spark.
function starBurst(e,size=1.5,color='#ffffff',delay=0,life=.2){const s=starSprite(color);s.position.set(e.x+(Math.random()-.5)*.2,e.y,e.z+(Math.random()-.5)*.2);s.material.rotation=Math.random()*Math.PI;s.visible=delay<=0;scene.add(s);effects.push({m:s,life,max:life,star:size,delay});}
const dustGeo=new THREE.SphereGeometry(.22,8,6),streakGeo=new THREE.BoxGeometry(.07,.07,1.3);
function dust(x,y,z,count=6,spread=1){const color='#fff8ec';for(let i=0;i<count;i++){const m=fxMesh(dustGeo,color,scene,x+(Math.random()-.5)*spread*.6,y+.15,z+(Math.random()-.5)*spread*.6,.85,false);const a=Math.random()*Math.PI*2,sp=1.2+Math.random()*2*spread;effects.push({m,life:.45,max:.45,v:new THREE.Vector3(Math.cos(a)*sp,.8+Math.random()*1.4,Math.sin(a)*sp),puff:true,keepGeo:true});}}
// Speed lines trailing a fighter who was knocked flying.
function streak(p){for(let i=0;i<2;i++){const m=fxMesh(streakGeo,'#ffffff',scene,p.x+(Math.random()-.5)*.6,p.y+.6+Math.random()*1.2,p.z+(Math.random()-.5)*.6,.8,false);m.lookAt(m.position.x+p.vx,m.position.y+p.vy*.3,m.position.z+p.vz);effects.push({m,life:.2,max:.2,keepGeo:true});}}
// Two-layer crescent (color + white edge) that sweeps open; vertical for launchers and slams.
function slashArc(e,color,inner,outer,life=.2){const rot=-Math.atan2(e.fz,e.fx),vertical=e.attackType==='upper'||e.attackType==='slam';for(const [a,b,c,o] of [[inner,outer,color,.85],[outer-.14,outer+.06,'#ffffff',.95]]){const m=new THREE.Mesh(new THREE.RingGeometry(a,b,32,1,-1.25,2.5),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));if(vertical)m.rotation.set(0,rot,0);else m.rotation.set(-Math.PI/2,0,rot);m.position.set(e.x,e.y+(vertical?-.3:0),e.z);scene.add(m);effects.push({m,life,max:life,sweep:true});}}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;let shake=0;
function shakeCam(amount){if(!reduceMotion)shake=Math.max(shake,amount);}
const comboState=[{count:0,tick:-1e9},{count:0,tick:-1e9}];
function comboHit(e){if(world.brawl||e.guarded||!(e.id===0||e.id===1))return;const a=1-e.id,s=comboState[a];s.count=world.tick-s.tick<130?s.count+1:1;s.tick=world.tick;if(s.count>=2){const el=$('combo'+a);el.querySelector('b').textContent=s.count;el.classList.remove('pop');void el.offsetWidth;el.classList.add('show','pop');}}
const fxState=[0,1,2,3].map(()=>({grounded:true,t:0}));
let sound=null;
function tone(frequency,duration=.08,type='square',volume=.035){if(!sound)return;const o=sound.createOscillator(),g=sound.createGain();o.type=type;o.frequency.setValueAtTime(frequency,sound.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(30,frequency/3),sound.currentTime+duration);g.gain.setValueAtTime(volume,sound.currentTime);g.gain.exponentialRampToValueAtTime(.001,sound.currentTime+duration);o.connect(g);g.connect(sound.destination);o.start();o.stop(sound.currentTime+duration);}
function unlockAudio(){if(!sound){const AC=window.AudioContext||window.webkitAudioContext;if(AC)sound=new AC();}sound?.resume();}

// ---- Presentation layer: banners, cut-ins, flashes, slow motion and camera focus ----
let calloutTime=0,timeScale=1,slowUntil=0,focusShot=null,bannerKey='';
function announce(s){$('callout').textContent=s;calloutTime=1.1;}
function banner(html,kind='',duration=1.1){const b=$('banner');b.innerHTML=html;b.className='';b.style.setProperty('--dur',duration+'s');void b.offsetWidth;b.className='show '+kind;}
function flash(strength=.25){const f=$('flash');f.style.transition='none';f.style.opacity=String(strength);void f.offsetWidth;f.style.transition='opacity .25s';f.style.opacity='0';}
function cutin(e){const c=$('cutin'),ch=CHARACTERS[e.char]||characterOf(world.fighters[e.id]);c.className='';void c.offsetWidth;c.style.setProperty('--cut',ch.color);$('cutinPortrait').src=portraits[e.char]||'';$('cutinName').textContent=ch.skillName;$('cutinLevel').textContent=e.level===3?'LV 3 · 奥义':`LV ${e.level} · 必杀`;c.className='show'+(e.id%2===1?' right':'')+(e.level===3?' lv3':'');}
function slowMotion(scale,seconds){timeScale=scale;slowUntil=performance.now()+seconds*1000;}
function focusOn(x,y,z,dist,seconds){focusShot={x,y,z,dist,until:performance.now()+seconds*1000};}
const nameOf=id=>characterOf(world.fighters[id]).name;
function stageText(key){return STAGES[world.stage]?.[key]||STAGES.port[key];}

function events(){const batch=world.events.splice(0);if(netRole==='host')netEvents.push(...batch);for(const e of batch){
  if(e.type==='skillCharge'){cutin(e);announce(e.id===localPlayerId?`${e.level}级必杀蓄力！`:'对手正在蓄力！可闪避或抢先打断');tone(620,.18,'triangle');if(e.level===3){focusOn(e.x,1.4,e.z,11,.7);}}
  if(e.type==='skillCancel'){announce('必杀被打断！');starBurst(e,1.3,'#bfe6ff');particles(e,'#fff0bd',8);tone(130,.15,'triangle');}
  if(e.type==='flank'){announce(e.id===localPlayerId?'侧后方受击！转身再防御':'绕过防御！');}
  if(e.type==='hit'){comboHit(e);if(e.damage>=18)shakeCam(.14);starBurst(e,e.damage>=18?2.1:1.4);particles(e,'#ffe898',8);const tag=label(String(Math.round(e.damage)),e.damage>=18?'#ff6a3a':'#ffe14a',72);tag.position.set(e.x+.3,e.y+1,e.z);tag.scale.set(1.3,.5,1);scene.add(tag);effects.push({m:tag,life:.6,max:.6,v:new THREE.Vector3(0,2.2,0),sprite:true});tone(e.damage>=18?85:120,.1,'sawtooth');}
  if(e.type==='impact'){particles(e,e.kind==='bomb'?'#ff7048':e.force>=8?'#ffd266':'#fff0a6',e.force>=8?22:12);ringEffect(e,e.kind==='bomb'?'#ff7048':e.force>=8?'#ffd266':'#fff0a6',e.force>=8?2.2:1.5,.18);if(e.force>=10){flash(.18);shakeCam(.1);}}
  if(e.type==='slash'){
    const c=CHARACTERS[e.char]||characterOf(world.fighters[e.id]),color=e.attackType==='slam'?'#ffbd61':e.weapon==='sword'?'#ffd648':e.attackType==='rush'?'#ffb35a':c.accent;
    slashArc(e,color,e.attackType==='slam'?1.6:1.2,e.attackType==='slam'?2.8:2.4,e.attackType==='slam'?.26:.2);tone(e.attackType==='slam'?150:310,.06,'triangle');
    if(e.id===localPlayerId)announce(e.attackType==='slam'?'坠落重击！':e.attackType==='air'?'空中攻击！':e.attackType==='dash'?'冲刺斩！':e.attackType==='rush'?'突进铁拳！':e.attackType==='upper'?'上挑！':['一击！','二连！','三连终结！'][e.combo]);
    if(e.attackType==='air'&&e.airCombo)announce(e.airCombo===2?'空中终结！':'空中追击！');
  }
  if(e.type==='launch'){starBurst(e,2,'#fff6c0');ringEffect({...e,y:e.y-.9},'#ffe39a',1.4,.25);dust(e.x,e.y-1,e.z,6,1);announce('浮空！跳起连按 J 追击');tone(520,.12,'triangle');}
  if(e.type==='spike'){starBurst(e,2.6,'#ffffff');flash(.2);shakeCam(.2);announce('砸地！');tone(90,.2,'sawtooth');}
  if(e.type==='groundBounce'){dust(e.x,e.y,e.z,12,1.6);ringEffect(e,'#ffd27a',1.8,.3);starBurst({...e,y:e.y+.4},1.8,'#ffdc8a');shakeCam(.16);tone(70,.18,'triangle');}
  if(e.type==='spring'){dust(e.x,e.y,e.z,6,1);stage?.bounce(e.x,e.z);if(e.id===localPlayerId)announce('弹跳网！');tone(300,.2,'triangle');}
  if(e.type==='rockWarn'){ringEffect(e,'#ff4a2a',1.7,1.85);ringEffect({...e,y:.15},'#ff9a6a',1.1,1.85);announce('落石！快离开红圈');tone(200,.25,'square',.03);}
  if(e.type==='rockImpact'){dust(e.x,e.y,e.z,14,1.8);particles(e,'#8a6a48',18);starBurst({...e,y:.9},2.2,'#ffcf8a');shakeCam(.18);tone(55,.3,'sawtooth',.06);}
  if(e.type==='snowBurst'){particles(e,'#ffffff',22);starBurst(e,1.6,'#e8f6ff');tone(160,.15,'triangle');}
  if(e.type==='shieldBash'){ringEffect(e,'#72dbff',1.6,.2);tone(200,.08,'triangle');}
  if(e.type==='shotFire'){starBurst({x:e.x+e.fx*.5,y:e.y,z:e.z+e.fz*.5},.8,'#ffcf6a',0,.1);tone(900,.05,'square',.03);}
  if(e.type==='shotHit'){starBurst(e,1.1,'#ffd08a');particles(e,'#ffb35a',6);}
  if(e.type==='heavy'){ringEffect(e,'#ffb45c',2.2,.22);particles(e,'#ffe19a',12);announce('重击！');tone(180,.12,'sawtooth');}
  if(e.type==='grab'){announce('擒抱！J 前投 / U 高投；被抓连按攻击挣脱');tone(260,.09,'square');}
  if(e.type==='throwHit'){ringEffect(e,'#ffcf72',1.5,.28);starBurst(e,1.8);announce('抓取投摔！');tone(100,.18,'sawtooth');}
  if(e.type==='grabEscape'){ringEffect(e,'#8ff3e7',1.4,.24);announce('挣脱擒抱！');tone(360,.1,'triangle');}
  if(e.type==='dropHeld'){particles(e,'#d6a564',8);announce('受击松手！');tone(180,.08,'triangle');}
  if(e.type==='explosion'){particles(e,e.kind==='poison'?'#83f09a':e.kind==='slow'?'#8ab8ff':'#ffab4c',28);ringEffect(e,e.kind==='poison'?'#8dffac':e.kind==='slow'?'#8ab8ff':'#ffdf76',3);starBurst(e,2.6,'#ffcf6a');flash(.15);tone(70,.24,'sawtooth',.06);}
  if(e.type==='cloud'){const color=e.kind==='slow'?'#8ab8ff':e.kind==='virus'?'#c084ff':'#83f09a';particles(e,color,24);ringEffect(e,color,e.kind==='virus'?2.8:2.2,.55);announce(e.kind==='slow'?'冰雾扩散！':e.kind==='virus'?'病毒云扩散！':'毒雾扩散！');tone(e.kind==='virus'?150:190,.18,'sawtooth');}
  if(e.type==='skill'){
    const c=CHARACTERS[e.char]||characterOf(world.fighters[e.id]),kind=e.kind,color=kind==='shieldQuake'?'#80dfff':kind==='barrage'?'#ff8a3c':kind==='fistStorm'?'#ffcf5a':e.level===3?'#ffd84f':'#ffe6a1';
    if(kind==='shieldQuake'){ringEffect(e,color,e.radius,.5+e.level*.12);ringEffect({...e,y:e.y-.5},'#d4f6ff',e.radius*.6,.65);particles(e,color,24);}
    else if(kind==='fistStorm'){for(let j=0;j<6+e.level*3;j++){const a=Math.random()*Math.PI*2,r=Math.random()*e.radius*.8;starBurst({x:e.x+Math.cos(a)*r,y:e.y+.3+Math.random()*1.4,z:e.z+Math.sin(a)*r},1.2+Math.random()*.6,'#ffffff',j*.035,.16);}ringEffect(e,color,e.radius,.4);}
    else if(kind==='barrage'){for(let j=0;j<5+e.level*3;j++){const a=Math.random()*Math.PI*2,r=Math.random()*e.radius,p={x:e.x+Math.cos(a)*r,y:.4,z:e.z+Math.sin(a)*r};ringEffect(p,'#ff8a3c',1.1,.25,j*.05);starBurst({...p,y:.8},1.6,'#ffcf6a',j*.05,.18);}ringEffect(e,color,e.radius,.5);}
    else{for(let j=0;j<3;j++)ringEffect({...e,y:e.y+j*.6},color,e.radius*(1-j*.15),.35+j*.12);particles(e,color,18);}
    announce(`${e.level}级 · ${c.skillName}！`);tone(kind==='shieldQuake'?100:500,.3+e.level*.08,kind==='shieldQuake'?'sawtooth':'triangle');
    if(e.level>=2){flash(.2+e.level*.08);focusOn(e.x,1.2,e.z,12,.55);}
  }
  if(e.type==='wallBounce'||e.type==='bodyCrash'){particles(e,'#d6a564',16);starBurst(e,1.5,'#ffdc8a');announce(e.type==='wallBounce'?'撞栏反弹！':'撞碎箱子！');tone(85,.14,'triangle');}
  if(e.type==='lift'){announce(`举起${e.kind==='barrel'?'木桶':e.kind==='chest'?'宝箱':'木箱'} · J前投 / U高投`);tone(250,.1,'square');}
  if(e.type==='propThrow'){announce(e.high?'高抛！':'向前投掷！');tone(180,.1,'sawtooth');}
  if(e.type==='propBreak'){particles(e,e.kind==='chest'?'#ffd45e':'#d6a564',18);ringEffect(e,'#ffd27a',1.25,.2);}
  if(e.type==='cannon'){announce(e.kind==='snowball'?'滚地雪球来了！跳起来躲':`${stageText('cannon')}！注意两侧`);tone(80,.28,'sawtooth');}
  if(e.type==='waveWarning'){announce(`${stageText('wave')}将从${e.dir>0?'左':'右'}侧袭来！`);tone(140,.35,'triangle');}
  if(e.type==='waveStart'){announce(e.kind==='sandstorm'?'沙暴来袭！空中也会被吹走':`${stageText('wave')}来袭！跳上高台！`);tone(65,.45,'sawtooth');}
  if(e.type==='guard'){ringEffect(e,'#8bd8ff',1.5,.18);announce('挡住了！');tone(220,.08,'triangle');}
  if(e.type==='parry'){ringEffect(e,'#fff1a0',1.7,.28);starBurst(e,1.6,'#fff6c0');announce('完美反击！');tone(760,.16,'triangle');}
  if(e.type==='guardBreak'){ringEffect(e,'#ff8b72',1.8,.3);starBurst(e,2,'#ffb0a0');announce('防御崩溃！');tone(90,.2,'sawtooth');}
  if(e.type==='knockdown'){ringEffect(e,'#ffb477',1.35,.25);}
  if(e.type==='wakeup'){ringEffect(e,'#b5f5ff',1.1,.25);}
  if(e.type==='recovery'){ringEffect(e,'#b5f5ff',1.1,.22);particles(e,'#e6faff',8);announce(e.id===localPlayerId?'受身成功！':'对手翻滚受身');tone(420,.1,'triangle');}
  if(e.type==='energy'&&e.id===localPlayerId)tone(500,.05,'triangle');
  if(e.type==='break'){particles(e,'#d6a564');announce(`箱子打开：${ITEM_NAMES[e.item]||'道具'}出现`);}
  if(e.type==='pickup'){announce(`捡到 ${ITEM_NAMES[e.item]||'道具'} · 按 K 使用`);tone(620,.12,'triangle');}
  if(e.type==='ready'){announce('金色强化刀：攻击 +35%，持续 10 秒！');tone(520,.16,'triangle');}
  if(e.type==='power'){announce('啤酒增幅：攻击 +55%，持续 8 秒！');ringEffect(e,'#ffd66e',1.4,.45);tone(700,.16,'triangle');}
  if(e.type==='poison'){announce('中毒！持续掉血');particles(e,'#8dffac',12);}
  if(e.type==='slow'){announce('减速！');particles(e,'#8ab8ff',12);}
  if(e.type==='dot'){const tag=label(String(e.damage),'#9dffb0',58);tag.position.set(e.x,e.y+1,e.z);tag.scale.set(.9,.35,1);scene.add(tag);effects.push({m:tag,life:.45,max:.45,v:new THREE.Vector3(0,1,0),sprite:true});}
  if(e.type==='crateDrop'){announce('空投箱来了！');tone(180,.12,'triangle');}
  if(e.type==='crateLand'){particles(e,'#d6a564',10);tone(110,.12,'square');}
  if(e.type==='heal'){announce('恢复 +20');particles(e,'#98f8b5');}
  if(e.type==='lifeLost'){announce(`失去一条命！剩余 ${e.lives} 命`);ringEffect(e,'#ff9b78',1.8,.35);tone(120,.18,'sawtooth');}
  if(e.type==='respawn'){announce('重新登场！');ringEffect(e,'#9df5ff',1.6,.35);}
  if(e.type==='roundStart'){bannerKey='';}
  if(e.type==='eliminated'){starBurst(e,3,'#ffffff');flash(.3);shakeCam(.2);announce(e.left>1?`${nameOf(e.id)} 被淘汰！还剩 ${e.left} 人`:`${nameOf(e.id)} 被淘汰！`);tone(70,.4,'sawtooth',.06);if(e.left<=1){slowMotion(.35,1);focusOn(e.x,e.y,e.z,10,1.2);}}
  if(e.type==='fight'){banner('FIGHT!','fight',.9);tone(880,.25,'square',.05);}
  if(e.type==='ko'){
    if(e.timeUp)banner('TIME UP','ko',2);else{banner('K.O.','ko',2);flash(.55);shakeCam(.3);slowMotion(.3,1.1);focusOn(e.x,e.y,e.z,9,1.6);starBurst(e,3.4,'#ffffff');}
    const who=e.winner===null?'平局':`${nameOf(e.winner)} 拿下第 ${e.roundNo} 回合`;announce(who);tone(60,.6,'sawtooth',.07);
  }
  if(e.type==='end'){if(world.brawl)banner(e.winner===null?'DRAW':'K.O.','ko',1.6);showResult(e.winner);release();}
}}
const ITEM_NAMES={bomb:'炸弹',poison:'毒瓶',virus:'病毒瓶',meat:'肉块',beer:'啤酒',slow:'冰冻瓶',sword:'强化木刀'};
function showResult(winner){
  const multi=world.bestOf>1&&!world.stock&&!world.training;
  $('resultSub').textContent=world.brawl?`${STAGES[world.stage]?.name||''} · 四人乱斗`:multi?`${STAGES[world.stage]?.name||''} · 三局两胜`:STAGES[world.stage]?.name||'';
  $('resultTitle').textContent=winner===null?'DRAW':`${nameOf(winner)} WIN!`;
  $('resultPortrait').src=winner===null?'':portraits[world.fighters[winner].char]||'';if(winner===null)$('resultPortrait').removeAttribute('src');
  $('resultQuote').textContent=winner===null?'':`「${CHARACTERS[world.fighters[winner].char].quote}」`;
  $('resultScore').textContent=(winner===null?'平局！':winner===localPlayerId?'你赢了！':'再来挑战！')+(multi?` 回合比分 ${world.wins[0]} - ${world.wins[1]}`:'');
  if(!$('result').open)$('result').showModal();
}
function fighterStatus(p){const states=[];let kind='';const add=(active,text,tone)=>{if(active){states.push(text);if(!kind)kind=tone;}};add(p.poisonTime>0,`中毒 ${p.poisonTime.toFixed(1)}s`,'poison');add(p.virusTime>0,`病毒感染 ${p.virusTime.toFixed(1)}s`,'virus');add(p.slowTime>0,`冻伤减速 ${p.slowTime.toFixed(1)}s`,'ice');add(p.burnTime>0,`炸伤 ${p.burnTime.toFixed(1)}s`,'burn');add(p.weapon==='sword',`强化刀 ${p.attackBoostTime.toFixed(1)}s`,'sword');add(p.attackBoostTime>0&&p.weapon!=='sword',`啤酒强化 ${p.attackBoostTime.toFixed(1)}s`,'beer');return {text:states.join(' · '),kind};}
function updateStatusBadge(id,p){const el=$(id),status=fighterStatus(p);if(p.pendingSkill){status.text=`${p.skillLevel}级必杀蓄力 ${p.skillWindup.toFixed(1)}s${status.text?' · '+status.text:''}`;status.kind='charge';}if(p.respawnProtection>0){status.text=`重生保护 ${p.respawnProtection.toFixed(1)}s${status.text?' · '+status.text:''}`;}if(el.textContent!==status.text)el.textContent=status.text;el.hidden=!status.text;el.dataset.kind=status.kind;}

// ---- Input ----
const keys=new Set();
const moveCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
const DIRECTION={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'},lastTap={dir:'',time:0};
function action(code){const p=world.fighters[localPlayerId];if(!selectHidden()||connectionAttempt.pending||world.ended||world.intro>0||world.roundOver>0||(netRole!=='solo'&&(!netConn?.open||!world.online)))return;if(netRole!=='guest'&&[...moveCodes,'Space','KeyJ','KeyU','KeyI','KeyK','KeyL','ShiftLeft','ShiftRight','Sprint'].includes(code))started=true;const data={input:serialInput(),level:code==='KeyL'?(keys.has('KeyR')?3:keys.has('ShiftLeft')||keys.has('ShiftRight')?2:1):1};if(!networkAction(code,data))return;applyAction(p,code,data);}
addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,summary,.help-content'))return;
  if(!selectHidden()){selectKey(e);return;}
  if([...moveCodes,'Space','KeyJ','KeyU','KeyI','KeyK','KeyL','KeyR','ShiftLeft','ShiftRight'].includes(e.code))e.preventDefault();unlockAudio();keys.add(e.code);if(!e.repeat)action(e.code);
  // Double-tapping a direction starts a run, as in Grand Battle.
  if(!e.repeat&&moveCodes.includes(e.code)){const dir=DIRECTION[e.code],now=performance.now();if(lastTap.dir===dir&&now-lastTap.time<260){action('Sprint');lastTap.time=0;}else{lastTap.dir=dir;lastTap.time=now;}}
});
addEventListener('keyup',e=>keys.delete(e.code));
let touchControls=null;if(isTouchDevice())touchControls=createTouchControls({keys,action,unlock:unlockAudio});
function release(){touchControls?.release();keys.clear();world.fighters[localPlayerId].jumpBuffer=0;if(netRole==='guest')sendNet({t:'input',round:world.round||0,input:neutralInput()});else if(netRole==='host')sendSnapshot();}
addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{release();last=performance.now();acc=0;});
for(const [id,code] of [['jumpButton','Space'],['attackButton','KeyJ'],['heavyButton','KeyU'],['grabButton','KeyI'],['bombButton','KeyK'],['skillButton','KeyL']])$(id).onclick=()=>{unlockAudio();action(code);$(id).blur();};
renderer.domElement.addEventListener('pointerdown',()=>{unlockAudio();document.activeElement?.blur();});
function removeEffect(e){scene.remove(e.m);if(e.sprite)e.m.material.map.dispose();if(e.star){e.m.material.dispose();return;}if(!e.shared){if(!e.keepGeo)e.m.geometry?.dispose();e.m.material.dispose();}}
function clearVisualEffects(){
  for(const map of [bombModels,cloudModels,propModels,cannonModels,shotModels]){for(const m of map.values()){scene.remove(m);m.traverse(o=>{if(!o.userData.ink)o.geometry?.dispose();if(o.material&&!isSharedMaterial(o.material)&&o.material.side!==THREE.BackSide)o.material.dispose();});}map.clear();}
  for(const e of effects)removeEffect(e);effects.length=0;
}

// ---- Match flow and select screen ----
// Brawl fills the four slots with the two picks plus the roster members not yet chosen.
function brawlRoster(){const list=[selection.p1,selection.p2];for(const id of CHARACTER_IDS)if(list.length<4&&!list.includes(id))list.push(id);while(list.length<4)list.push(CHARACTER_IDS[list.length%CHARACTER_IDS.length]);return list;}
let brawlMode=false;
function matchOptions(){const {training,stock,online}=world;if(brawlMode&&!training&&!stock&&!online)return {chars:brawlRoster(),stage:selection.stage,bestOf:1,roundTime:120,intro:3.6};return {chars:[selection.p1,world.online?guestChar:selection.p2],stage:selection.stage,bestOf:training||stock?1:3,roundTime:training?120:99,intro:training?0:3.6};}
function reset(){
  if(netRole==='guest')return;
  const {training,online,stock}=world,round=(world.round||0)+1;world=createWorld(matchOptions());Object.assign(world,{training,online,stock,round,rematchVotes:[false,false]});
  world.bestOf=world.brawl||training||stock?1:3;world.intro=training?0:3.6;
  guestInput.clear();netEvents.length=0;acc=0;netSendAcc=0;netBroadcastAcc=0;bannerKey='';timeScale=1;focusShot=null;
  if(stock)world.fighters.forEach(p=>p.lives=3);started=online||(selectHidden()&&!training);if(training)world.fighters[1].x=-1.6;
  keys.clear();$('result').close();clearVisualEffects();if(selectHidden())announce(stock?'三命模式 · 还有三条命':training?'按 J / U / I 测试攻击':'');sendSnapshot();
}
function requestRematch(){
  if(netRole==='solo'){reset();return;}
  if(!world.ended)return;
  if(netRole==='guest'){sendNet({t:'rematch',round:world.round||0});return;}
  if(voteRematch(world,0,world.round||0))reset();else sendSnapshot();
}
const selectHidden=()=>$('select').hidden;
function hideSelect(){$('select').hidden=true;document.activeElement?.blur();}
function showSelect(){$('result').close();$('select').hidden=false;if(netRole==='solo')started=false;refreshSelect();$('startMatch').focus();}
function startMatch(){if(netRole==='guest')return;saveSelection();hideSelect();reset();}
function card(kind,id,title,sub,face){const b=document.createElement('button');b.className='card'+(kind==='stage'?' stage-card':'');b.dataset.id=id;b.innerHTML=`<span class="face">${face}</span><b></b><small></small>`;b.querySelector('b').textContent=title;b.querySelector('small').textContent=sub;return b;}
function buildSelect(){
  for(const [slot,list] of [['p1',$('p1Roster')],['p2',$('p2Roster')]])for(const id of CHARACTER_IDS){const c=CHARACTERS[id],b=card('char',id,`${c.name}`,`${c.title} · ${c.blurb}`,portraits[id]?`<img alt="" src="${portraits[id]}">`:'');b.style.setProperty('--c',c.color);b.onclick=()=>{selection[slot]=id;saveSelection();previewSelection();};list.appendChild(b);}
  for(const id of STAGE_IDS){const t=THEMES[id],s=STAGES[id],b=card('stage',id,s.name,s.sub,'');b.querySelector('.face').style.setProperty('--bg',`linear-gradient(180deg,${t.skyTop},${t.skyBottom} 55%,${t.floor} 56%,${t.deckTop})`);b.onclick=()=>{selection.stage=id;saveSelection();previewSelection();};$('stageList').appendChild(b);}
}
function refreshSelect(){
  for(const [slot,list] of [['p1',$('p1Roster')],['p2',$('p2Roster')]])for(const b of list.children)b.setAttribute('aria-pressed',String(b.dataset.id===selection[slot]));
  for(const b of $('stageList').children)b.setAttribute('aria-pressed',String(b.dataset.id===selection.stage));
  const guest=netRole==='guest';
  for(const b of [...$('p2Roster').children,...$('stageList').children,$('randomRival')])b.disabled=guest||world.online;
  for(const b of $('p1Roster').children)b.disabled=guest;
  $('startMatch').disabled=guest;$('startMatch').textContent=guest?'等待房主开始…':world.online?'开始联机对战 ▶':'开始对战 ▶';
  $('ruleLabel').textContent=world.brawl?'四人乱斗 · 最后站着的人获胜 · 120 秒':world.training?'练习模式 · 不限时间':world.stock?'三命制 · 一局定胜负':'三局两胜 · 每局 99 秒';
}
// While browsing the menu the arena behind shows the current picks.
function previewSelection(){refreshSelect();if(netRole==='solo'&&!selectHidden())reset();}
function selectKey(e){
  const cycle=(list,value,dir)=>list[(list.indexOf(value)+dir+list.length)%list.length];
  if(['ArrowLeft','KeyA','ArrowRight','KeyD'].includes(e.code)&&netRole!=='guest'){e.preventDefault();selection.p1=cycle(CHARACTER_IDS,selection.p1,e.code==='ArrowLeft'||e.code==='KeyA'?-1:1);previewSelection();}
  else if(['ArrowUp','KeyW','ArrowDown','KeyS'].includes(e.code)&&netRole==='solo'){e.preventDefault();selection.stage=cycle(STAGE_IDS,selection.stage,e.code==='ArrowUp'||e.code==='KeyW'?-1:1);previewSelection();}
  else if(e.code==='Enter'&&e.target===document.body){e.preventDefault();startMatch();}
}
buildSelect();
$('startMatch').onclick=startMatch;
$('randomRival').onclick=()=>{selection.p2=CHARACTER_IDS[Math.floor(Math.random()*CHARACTER_IDS.length)];previewSelection();};
$('menuButton').onclick=()=>{showSelect();$('menuButton').blur();};$('resultMenu').onclick=showSelect;
$('restart').onclick=()=>{if(world.ended&&netRole!=='solo')requestRematch();else reset();$('restart').blur();};$('playAgain').onclick=requestRematch;
$('aimButton').onclick=()=>{action('KeyQ');$('aimButton').blur();};
$('training').onclick=()=>{if(netRole!=='solo')return;brawlMode=false;world.training=!world.training;$('training').textContent=world.training?'对手：静止练习':'对手：战斗 AI';reset();refreshSelect();};
$('livesMode').onclick=()=>{if(netRole==='guest')return;brawlMode=false;world.stock=!world.stock;reset();refreshSelect();};
$('brawlMode').onclick=()=>{if(netRole!=='solo')return;brawlMode=!brawlMode;if(brawlMode){world.training=false;world.stock=false;$('training').textContent='对手：战斗 AI';}reset();refreshSelect();};
$('platformPractice').onclick=()=>{if(netRole!=='solo')return;brawlMode=false;world.training=true;$('training').textContent='对手：静止练习';hideSelect();reset();Object.assign(world.fighters[0],{x:0,z:-2.2});Object.assign(world.fighters[1],{x:6,z:3});announce('按空格 · 跳上中央高台');};

// ---- HUD ----
const hudCache=new Map();
let brawlCards=null;
function buildBrawlHud(){
  const root=$('brawlHud');root.innerHTML='';brawlCards=[];
  for(let i=0;i<4;i++){
    const el=document.createElement('div');el.className='bcard';el.style.setProperty('--c',SLOT_COLORS[i]);el.style.gridColumn=i<2?String(i+1):String(i+2);
    el.innerHTML=`<img alt=""><div class="bbody"><div class="bplate"><span></span><b></b></div><div class="bhp"><i class="blag"></i><i class="bfill"></i></div><div class="bfoot"><span class="bpips"><i></i><i></i><i></i></span><small></small></div></div>`;
    root.append(el);
    const q=s=>el.querySelector(s);
    brawlCards.push({el,img:q('img'),name:q('b'),tag:q('.bplate span'),fill:q('.bfill'),lag:q('.blag'),pips:[...q('.bpips').children],sub:q('small'),char:''});
  }
}
function updateBrawlHud(){
  if(!brawlCards)buildBrawlHud();
  world.fighters.forEach((p,i)=>{
    const c=brawlCards[i];if(!c)return;
    if(c.char!==p.char){c.char=p.char;c.name.textContent=CHARACTERS[p.char].name;c.img.src=portraits[p.char]||'';}
    const hp=clamp(p.hp,0,100),key='bc'+i;
    if(hudCache.get(key)!==hp){hudCache.set(key,hp);c.fill.style.width=hp+'%';c.lag.style.width=hp+'%';c.el.classList.toggle('low',hp>0&&hp<=30);c.el.classList.toggle('out',hp<=0);}
    const tag=i===localPlayerId?'YOU':'CPU';if(c.tag.textContent!==tag)c.tag.textContent=tag;
    c.pips.forEach((pip,j)=>pip.classList.toggle('on',p.energy>=j+1));
    const fs=fighterStatus(p),sub=hp<=0?'淘汰':p.pendingSkill?'蓄力中':fs.text?fs.text.split(' · ')[0]:p.item?ITEM_NAMES[p.item]:'';
    if(c.sub.textContent!==sub)c.sub.textContent=sub;
  });
}
function setHud(el,prop,value){const key=el.id+prop;if(hudCache.get(key)===value)return;hudCache.set(key,value);if(prop==='text')el.textContent=value;else if(prop==='html')el.innerHTML=value;else el.style.setProperty(prop,value);}
function updateHud(){
  const multi=world.bestOf>1&&!world.stock&&!world.training,need=Math.ceil((world.bestOf||1)/2);
  if(world.brawl)updateBrawlHud();
  else world.fighters.forEach((p,i)=>{
    const k=i?'p2':'p1',hp=clamp(p.hp,0,100);
    setHud($(k+'Fill'),'width',hp+'%');setHud($(k+'Lag'),'width',hp+'%');$(i?'rivalHP':'playerHP').toggleAttribute('data-low',hp>0&&hp<=30);
    const marks=multi?Array.from({length:need},(_,j)=>`<i class="${world.wins[i]>j?'on':''}"></i>`).join(''):world.stock?Array.from({length:3},(_,j)=>`<i class="${p.lives>j?'on':''}"></i>`).join(''):'';
    setHud($(k+'Wins'),'html',marks);
    setHud($(i?'rivalInfo':'playerInfo'),'text',`${combatNumber(hp)} · ${p.item?ITEM_NAMES[p.item]:'空手'}`);
    const cells=$(k+'Gauge').children;for(let j=0;j<3;j++){const f=clamp(p.energy-j,0,1);cells[j].style.setProperty('--f',(f*100).toFixed(0)+'%');cells[j].classList.toggle('full',f>=1);}
    setHud($(k+'Lv'),'text',String(Math.floor(p.energy)));
  });
  if(!world.brawl){updateStatusBadge('playerStatus',world.fighters[0]);updateStatusBadge('rivalStatus',world.fighters[1]);}
  document.body.classList.toggle('brawl',Boolean(world.brawl));$('brawlHud').hidden=!world.brawl;
  const t=$('time');setHud(t,'text',world.training?'∞':String(Math.ceil(world.time)));t.toggleAttribute('data-low',!world.training&&world.time<=10);
  const final=multi&&world.wins[0]===need-1&&world.wins[1]===need-1;
  setHud($('roundLabel'),'text',world.brawl?'FREE-FOR-ALL':world.training?'TRAINING':world.stock?'STOCK ×3':multi?(final?'FINAL ROUND':`ROUND ${world.roundNo}`):'1 ROUND');
  setHud($('p1Tag'),'text',localPlayerId===0?'YOU':'HOST');setHud($('p2Tag'),'text',localPlayerId===1?'YOU':world.online?'FRIEND':world.training?'DUMMY':'CPU');
  const local=world.fighters[localPlayerId],c=characterOf(local);
  setHud($('attackLabel'),'text',`连击 / 移动+J ${c.moveAttack==='shot'?'射击':c.moveAttack==='rush'?'突进拳':c.moveAttack==='shieldBash'?'盾冲':'冲刺斩'}`);
  setHud($('bombLabel'),'text',local.item?(local.item==='sword'?'装备强化木刀':`使用${ITEM_NAMES[local.item]}`):local.carrying?'正举着容器':'先打碎箱子');
  setHud($('skillLabel'),'text',local.pendingSkill?`蓄力 ${local.skillWindup.toFixed(1)}s`:local.energy<1?'能量不足':local.skillCD>0?`${local.skillCD.toFixed(1)}s`:c.skillName);
  $('skillButton').title=`${c.skillName}：L 一级 · Shift+L 二级 · R+L 三级`;
  const status=local.grabbedBy!==null?'被擒抱 · 连按 J/U/I 挣脱':local.grabbedTarget!==null?'已抱住对手 · J 前投 / U 高投':local.carrying?'举着容器 · J前投 / U高投':local.knocked>0?'倒地中':local.blocking?'防御中':local.climbing?'爬梯中':local.poisonTime>0?'中毒 · 禁止闪避':local.virusTime>0?'病毒感染 · 禁止闪避':local.slowTime>0?'冰冻减速 · 禁止闪避':local.terrain==='quicksand'?'陷入流沙 · 减速、跳不高':local.terrain==='ice'?'冰面 · 加速但会打滑':'';
  setHud($('movement'),'text',`${local.climbing?'梯子':local.grounded?(local.support==='ground'?'地面':'高台'):'空中'} · 二段跳 ${local.jumps}/2${status?' · '+status:''}`);
  setHud($('aimButton'),'text',`Q · 朝向辅助：${local.aimAssist===false?'关':'开'}`);
  const voted=world.rematchVotes?.[localPlayerId],otherVoted=world.rematchVotes?.[1-localPlayerId];
  $('playAgain').disabled=netRole!=='solo'&&Boolean(voted);
  setHud($('playAgain'),'text',netRole==='solo'?'再战':voted?'已准备 · 等待朋友':otherVoted?'朋友已准备 · 再战':'准备再战');
  $('restart').disabled=netRole==='guest'&&!world.ended;
  setHud($('livesMode'),'text',world.stock?'三命模式：开':'三命模式：关');setHud($('brawlMode'),'text',world.brawl?'四人乱斗：开':'四人乱斗：关');$('brawlMode').disabled=netRole!=='solo';$('livesMode').disabled=netRole==='guest';$('training').disabled=netRole!=='solo';$('platformPractice').disabled=netRole!=='solo';
  // "ROUND n" is derived from state so the guest sees the same banner from snapshots.
  const vsOn=world.roundNo===1&&world.intro>1.9&&started&&selectHidden()&&!world.training&&!world.brawl,vs=$('vs');
  if(vsOn&&!vs.classList.contains('show')){world.fighters.forEach((p,i)=>{const c=CHARACTERS[p.char];$('vsP'+(i+1)).src=portraits[p.char]||'';$('vsName'+(i+1)).textContent=c.name;$('vsTitle'+(i+1)).textContent=c.title;});$('vsStage').textContent=`STAGE · ${STAGES[world.stage]?.name||''}`;vs.classList.add('show');tone(330,.3,'square',.04);}
  else if(!vsOn&&vs.classList.contains('show'))vs.classList.remove('show');
  comboState.forEach((c,i)=>{if(world.tick-c.tick>150||world.tick<c.tick)$('combo'+i).classList.remove('show');});
  const key=`${world.round}-${world.roundNo}`;
  if(world.intro>0&&world.intro<=1.85&&started&&selectHidden()&&bannerKey!==key){bannerKey=key;banner(world.brawl?'BRAWL<small>READY…</small>':final?'FINAL ROUND<small>READY…</small>':`ROUND ${world.roundNo}<small>READY…</small>`,'',1.6);tone(440,.2,'triangle');}
}

// ---- Per-frame visuals ----
const tmpFocus=new THREE.Vector3(0,1.2,0);let camDist=20,camOrbit=0;
function updateCamera(dt){
  // Frame every fighter still standing (both in a duel).
  const aspect=innerWidth/innerHeight,live=world.fighters.filter(p=>p.hp>0),framed=live.length?live:world.fighters;
  const xs=framed.map(p=>p.x),zs=framed.map(p=>p.z),ys=framed.map(p=>p.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),minY=Math.min(...ys),maxY=Math.max(...ys);
  let fx=(minX+maxX)/2,fz=(minZ+maxZ)/2,fy=1.2+Math.max(0,minY)*.35+Math.max(0,maxY)*.42;
  const spread=Math.hypot(maxX-minX,(maxZ-minZ)*.8);
  const halfH=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),halfW=halfH*aspect;
  let dist=clamp(Math.max((spread/2+5.5)/halfW,((maxZ-minZ)*.5+4.2+maxY*.6)/halfH,16.5),16.5,38);
  fx=clamp(fx,-10.5,10.5);fz=clamp(fz,-6,5);
  const intro=world.roundNo===1&&world.intro>1.8&&started?Math.min(1,(world.intro-1.8)/1.8):0;dist+=intro*9;fy+=intro*1.5;
  if(focusShot&&performance.now()<focusShot.until){fx=focusShot.x;fy=focusShot.y;fz=focusShot.z;dist=focusShot.dist;}else focusShot=null;
  const follow=1-Math.exp(-dt*(focusShot?5:3));tmpFocus.x+=(fx-tmpFocus.x)*follow;tmpFocus.y+=(fy-tmpFocus.y)*follow;tmpFocus.z+=(fz-tmpFocus.z)*follow;
  camDist+=(dist-camDist)*(1-Math.exp(-dt*(focusShot?5:2.4)));
  camOrbit+=(intro*1.25-camOrbit)*(1-Math.exp(-dt*4));
  camera.position.set(tmpFocus.x*.9+Math.sin(camOrbit)*camDist*.89,tmpFocus.y+camDist*.46,tmpFocus.z+Math.cos(camOrbit)*camDist*.89);camera.lookAt(tmpFocus.x,tmpFocus.y,tmpFocus.z-.4);
  if(shake>.002){camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;shake*=Math.exp(-dt*14);}
}
function animateFighter(p,i,m,dt){
  const c=p.char,facing=Math.atan2(p.fx,p.fz),t=world.tick*STEP;
  m.root.position.set(p.x,p.y,p.z);
  const spin=p.skillTime>0&&!p.pendingSkill&&c==='swordsman'?(1-p.skillTime/.4)*Math.PI*4:0;
  m.body.rotation.set(0,facing+spin,0);
  const walking=p.grounded&&Math.hypot(p.vx,p.vz)>1;
  m.legs.forEach((leg,j)=>leg.rotation.x=walking?Math.sin(p.walk+j*Math.PI)*.6:!p.grounded?-.4:0);
  m.arms[0].rotation.set(walking?-Math.sin(p.walk)*.5:-.25,0,.16);
  m.arms[1].rotation.set(c==='brawler'?-.9:-.5,0,-.25);
  if(c==='brawler'&&!walking){m.arms[0].rotation.x=-1;m.arms[0].rotation.z=.35;m.arms[1].rotation.z=-.35;}
  if(c==='gunner'&&!walking)m.arms[1].rotation.set(-1.1,0,-.1);
  if(p.running&&walking&&p.attackTime<=0){m.arms[0].rotation.set(.95,0,.25);m.arms[1].rotation.set(.95,0,-.25);m.legs.forEach((leg,j)=>leg.rotation.x=Math.sin(p.walk+j*Math.PI)*1.05);}
  if(p.attackTime>0){
    const total=['heavy','slam','upper','shieldBash'].includes(p.attackType)?.5:p.attackType==='grab'?.42:p.attackType==='rush'?.4:p.attackType==='dash'?.38:p.attackType==='shot'?.32:.34,swing=clamp(1-p.attackTime/total,0,1),arc=Math.sin(swing*Math.PI);
    if(p.attackType==='grab'){m.arms[0].rotation.set(-.45-arc*1.15,0,.25);m.arms[1].rotation.set(-.45-arc*1.15,0,-.25);}
    else if(p.attackType==='shot'){m.arms[1].rotation.set(-1.55+arc*.35,0,0);m.arms[0].rotation.set(-1.2,0,.4);}
    else if(c==='brawler'&&['light','rush','air'].includes(p.attackType)){const punch=p.combo===1||p.attackType==='rush'?0:1;m.arms[punch].rotation.set(-1.55,0,punch?-.1:.1);m.arms[punch].position.z=arc*.45;m.arms[1-punch].rotation.set(-.9,0,punch?.35:-.35);}
    else if(p.attackType==='slam'){m.arms[1].rotation.set(-2.3+arc*3.4,0,-.6+arc*1.4);}
    else if(p.attackType==='shieldBash'){m.arms[0].rotation.set(-1.3+arc*.7,0,.35);m.arms[1].rotation.set(-1.3+arc*.7,0,-.35);}
    else{const big=['heavy','upper'].includes(p.attackType),comboSwing=p.attackType==='light'?(p.combo===1?2.8:2.6):2.6;m.arms[1].rotation.set(-1.5+arc*(big?3.1:comboSwing),0,-.8+arc*(big?2.15:1.8));}
  }else m.arms.forEach(arm=>arm.position.z=0);
  if(p.skillTime>0&&!p.pendingSkill){
    if(c==='guardian'){m.arms[0].rotation.set(-1.7,0,.3);m.arms[1].rotation.set(-.8,0,-.4);}
    else if(c==='brawler'){const k=Math.floor(world.tick/4)%2;m.arms[k].rotation.set(-1.6,0,0);m.arms[k].position.z=.4;m.arms[1-k].rotation.set(-.8,0,0);m.arms[1-k].position.z=0;}
    else if(c==='gunner'){m.arms[0].rotation.set(-2.6,0,.2);m.arms[1].rotation.set(-2.7,0,-.2);}
    else{m.arms[0].rotation.z=1.2;m.arms[1].rotation.z=-1.3;}
  }else if(p.blocking){m.arms[0].rotation.set(-1.25,0,.62);m.arms[1].rotation.set(-1.25,0,-.62);}
  if(p.carrying||p.grabbedTarget!==null){const lift=p.carrying?1:Math.min(1,(2.2-p.grabHoldTime)/.25);m.arms[0].rotation.set(-1.1-lift*1.55,0,.18);m.arms[1].rotation.set(-1.1-lift*1.55,0,-.18);}
  let bodyY=walking?Math.abs(Math.sin(p.walk))*.07:Math.sin(t*2.5+i)*.02,lean=walking?(p.running?-.4:-.12):0,roll=0,pitch=0,squash=1;
  if(p.grabbedBy!==null){const s=Math.sin(world.tick*.2)*.18;m.arms[0].rotation.x=-1.9+s;m.arms[1].rotation.x=-1.9-s;m.legs.forEach((leg,j)=>leg.rotation.x=(j===0?-.65:.65)+s);roll=1.15;}
  else{
    roll=p.knocked>0?-.9:p.hurtTime>0?-.2:p.stun>0?-.24:0;pitch=p.knocked>0?0:lean+(!p.grounded?-.08:0);
    squash=p.hurtTime>0?1.04+Math.sin(world.tick*.8)*.025:(p.landTime||0)>0?1-(p.landTime/.2)*.12:1;
    if(!p.grounded&&!p.attackTime&&!p.skillTime){m.arms[0].rotation.x=-1.15;m.arms[1].rotation.x=-1.3;m.legs.forEach((leg,j)=>leg.rotation.x=j===0?-.7:.3);}
  }
  if(p.throwTime>0){const follow=1-p.throwTime/.3;m.arms[0].rotation.x=m.arms[1].rotation.x=-2.65+follow*(p.throwHigh?1.1:2.3);roll=-Math.sin(follow*Math.PI)*.25;}
  if(p.pendingSkill){squash=.88;bodyY=-.04;m.arms[0].rotation.set(c==='guardian'?-1.5:-.9,0,.3);m.arms[1].rotation.set(-2.5,0,-.35);if(c==='gunner'){m.arms[1].rotation.set(-2.9,0,-.1);}}
  if(p.thrownTime>0&&!p.grounded&&p.grabbedBy===null){roll=-.9-(.65-p.thrownTime)*Math.PI*2;m.legs[0].rotation.x=-.8;m.legs[1].rotation.x=.7;}
  const beerActive=p.attackBoostTime>0&&p.weapon!=='sword';if(beerActive&&!p.recoveryTime)pitch+=Math.sin(t*3.4+i)*.035;
  // Round outcome poses: loser lies on the deck, winner raises a fist.
  if(p.hp<=0&&p.grounded){pitch=-1.45;roll=0;bodyY=.25;}
  else if(world.roundOver>0&&world.roundWinner===i&&p.grounded&&p.knocked<=0){m.arms[1].rotation.set(-2.9,0,-.25);m.arms[0].rotation.set(-.2,0,.5);bodyY=Math.abs(Math.sin(t*6))*.12;roll=0;pitch=0;}
  m.body.rotation.x=pitch;m.body.rotation.z=roll;m.body.scale.set(1,squash,1);
  if(p.recoveryTime>0){const a=(1-p.recoveryTime/.22)*Math.PI*2;m.body.rotation.x=a;m.body.rotation.z=0;m.body.position.set(0,1.3*(1-Math.cos(a)),-1.3*Math.sin(a));}else m.body.position.set(0,bodyY-(p.sink||0)*.45,0);
  m.shield.position.z=p.blocking?.9:.74;m.shield.visible=p.blocking;m.shield.material.opacity=.3+Math.sin(world.tick*.12)*.08;
  m.body.visible=!(p.invuln>0&&p.hp>0&&Math.floor(world.tick/6)%2===0);
  m.poisonFx.visible=p.poisonTime>0;m.poisonBubbles.forEach((b,j)=>{b.position.x=Math.cos(b.userData.a+t*(1.5+j*.08))*b.userData.r;b.position.z=Math.sin(b.userData.a+t*(1.5+j*.08))*b.userData.r;b.position.y=.35+((b.userData.y+t*(.55+j*.04))%2.25);b.scale.setScalar(.8+Math.sin(t*7+j)*.25);});
  m.virusFx.visible=p.virusTime>0;m.virusFx.rotation.y=-t*2.2;m.virusNodes.forEach((n,j)=>{n.position.y=n.userData.y+Math.sin(t*9+j)*.13;n.rotation.x+=dt*(2+j*.2);n.rotation.y+=dt*3;n.scale.setScalar(.8+Math.abs(Math.sin(t*8+j))*.65);});
  m.iceFx.visible=p.slowTime>0;m.iceShards.forEach((s,j)=>{s.material.opacity=.55+Math.sin(t*6+j)*.2;s.scale.setScalar(.92+Math.sin(t*5+j)*.08);});
  m.faceFlush.material.opacity=beerActive?.15+Math.sin(t*5)*.035:0;m.blushCheeks.forEach((b,j)=>{b.material.opacity=beerActive?.48+Math.sin(t*6+j)*.1:0;});
  m.burnFx.visible=p.burnTime>0;m.smoke.forEach((s,j)=>{s.position.y=s.userData.y+((1.25-p.burnTime)*(.65+j*.05))%1.4;s.position.x=Math.cos(s.userData.a+t*1.8)*(.4+j*.025);s.material.opacity=Math.min(.8,p.burnTime*.65)*(j%2?.55:1);});
  const armed=p.item==='sword'||p.weapon==='sword',swordActive=p.weapon==='sword';m.weaponGlow.material.opacity=armed?(swordActive?.9:.3):0;m.swordTrail.material.opacity=swordActive?.34+Math.abs(Math.sin(t*10))*.24:0;m.swordSparks.forEach((s,j)=>{const travel=(t*.9+s.userData.phase)%1;s.position.y=.18+travel*1.25;s.position.x=Math.sin(t*12+j)*.13;s.material.opacity=swordActive?(1-travel)*.95:0;});
  m.ring.visible=p.hp>0;m.ring.scale.setScalar(1+Math.sin(t*6+i)*.05);m.tag.visible=p.hp>0;
  const st=fxState[i],speed=Math.hypot(p.vx,p.vz);
  if(p.grounded&&!st.grounded&&(p.landVy||0)<-7)dust(p.x,p.y,p.z,7,1.1);
  st.grounded=p.grounded;st.t-=dt;
  if(st.t<=0){if(p.terrain==='quicksand'&&walking){dust(p.x,p.y,p.z,1,.4);st.t=.18;}else if(p.terrain==='ice'&&speed>4){particles({x:p.x,y:p.y+.1,z:p.z},'#e8f8ff',2);st.t=.07;}else if(p.running&&p.grounded&&speed>6){dust(p.x-p.fx*.4,p.y,p.z-p.fz*.4,2,.5);st.t=.09;}else if(p.knocked>0&&!p.grounded&&speed+Math.abs(p.vy)>7){streak(p);st.t=.04;}}
  const warning=chargeModels[i];warning.root.visible=Boolean(p.pendingSkill)&&!world.ended;
  if(p.pendingSkill){const s=p.pendingSkill,progress=1-p.skillWindup/s.windup,cx=s.cx??p.x,cz=s.cz??p.z,self=s.kind==='whirlwind'||s.kind==='shieldQuake';warning.root.position.set(self?p.x:cx,p.y,self?p.z:cz);warning.edge.scale.setScalar(s.radius);warning.fill.scale.setScalar(s.radius*Math.max(.05,progress));warning.fill.material.opacity=.12+progress*.16;for(const [kind,tag] of Object.entries(warning.tags))tag.visible=kind===s.kind;}
}
function updateVisuals(dt){
  ensureStage();ensureModels();
  world.fighters.forEach((p,i)=>animateFighter(p,i,models[i],dt));
  for(const b of world.bombs){let g=bombModels.get(b.id);if(!g){g=new THREE.Group();const bottle=b.kind==='poison'||b.kind==='virus'||b.kind==='slow';if(bottle){const color=b.kind==='virus'?'#8d55bd':b.kind==='slow'?'#4c9ee8':'#55a866';const glow=b.kind==='virus'?'#d19aff':b.kind==='slow'?'#bde8ff':'#a7f58c';cylinder(.18,.23,.48,color,g,0,0,0);sphere(.16,glow,g,0,.3,0);box(.16,.08,.16,'#e7d1a7',g,0,.28,0);}else{sphere(.26,'#29394b',g,0,0,0);const fuse=box(.055,.23,.055,'#ffd366',g,.06,.3,0);fuse.rotation.z=-.3;sphere(.07,'#fff1a2',g,.1,.42,0);}ink(g,.03);scene.add(g);bombModels.set(b.id,g);}g.position.set(b.x,b.y,b.z);g.rotation.z+=dt*(b.kind==='bomb'?6:3);}
  for(const [id,m] of bombModels)if(!world.bombs.some(b=>b.id===id)){scene.remove(m);bombModels.delete(id);}
  for(const s of world.shots||[]){let g=shotModels.get(s.id);if(!g){g=new THREE.Group();fxMesh(new THREE.SphereGeometry(.18,10,8),'#ffe08a',g,0,0,0,1);const trail=fxMesh(new THREE.CylinderGeometry(.02,.16,1.2,8),'#ff8a3c',g,0,0,0,.7);trail.rotation.x=Math.PI/2;trail.position.z=-.6;scene.add(g);shotModels.set(s.id,g);}g.position.set(s.x,s.y,s.z);g.rotation.y=Math.atan2(s.vx,s.vz);}
  for(const [id,g] of shotModels)if(!(world.shots||[]).some(s=>s.id===id)){scene.remove(g);g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});shotModels.delete(id);}
  for(const c of world.clouds){let g=cloudModels.get(c.id);if(!g){g=createCloudVisual(c.kind);scene.add(g);cloudModels.set(c.id,g);}updateCloudVisual(g,c);}
  for(const [id,m] of cloudModels)if(!world.clouds.some(c=>c.id===id)){scene.remove(m);m.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});cloudModels.delete(id);}
  crateModels.forEach((m,i)=>{const c=world.crates[i];if(!c){m.visible=false;return;}m.visible=c.hp>0||c.falling||c.heldBy!==null;setContainerKind(m,c.kind);m.position.set(c.x,c.y||0,c.z);m.rotation.z=c.falling?Math.sin(world.tick*.12+i):0;});
  for(const p of world.props||[]){let g=propModels.get(p.id);if(!g){g=containerModel();scene.add(g);propModels.set(p.id,g);}setContainerKind(g,p.kind);g.position.set(p.x,p.y-.45,p.z);g.rotation.x+=dt*4;g.rotation.z+=dt*5;}for(const [id,g] of propModels)if(!(world.props||[]).some(p=>p.id===id)){scene.remove(g);propModels.delete(id);}
  const theme=THEMES[stage.id];
  for(const c of world.cannonballs||[]){let g=cannonModels.get(c.id);if(!g){g=c.kind==='rock'?mesh(new THREE.DodecahedronGeometry(.8,0),'#8a6a48',scene,0,0,0):c.kind==='snowball'?sphere(.72,'#f6fbff',scene,0,0,0):sphere(.36,theme.cannon,scene,0,0,0);ink(g,.04);cannonModels.set(c.id,g);}g.visible=!(c.delay>0);g.position.set(c.x,c.y,c.z);if(c.kind==='snowball')g.rotation.z-=dt*(c.vx||0)/.72;else g.rotation.x+=dt*(c.kind==='rock'?3:7);}for(const [id,g] of cannonModels)if(!(world.cannonballs||[]).some(c=>c.id===id)){scene.remove(g);cannonModels.delete(id);}
  waveMesh.visible=(world.waveTime||0)>0;const sandstorm=stage.id==='desert';waveMesh.scale.set(sandstorm?1.2:1,sandstorm?4:stage.id==='snow'?1.7:1,1);document.body.classList.toggle('sandstorm',waveMesh.visible&&sandstorm);if(waveMesh.visible){waveMesh.material.opacity=(sandstorm?.18:.3)+Math.sin(world.tick*.2)*.06;waveMesh.position.x=-(world.waveDir||1)*10+(2.2-world.waveTime)*(world.waveDir||1)*10;}
  while(pickupModels.length<world.pickups.length){const g=new THREE.Group();
    const core=sphere(.28,'#29394b',g,0,.4,0);core.scale.x=1.25;
    const band=new THREE.Group();g.add(band);const flesh=sphere(.27,'#b9542e',band,-.1,.42,0);flesh.scale.set(1.25,1,1);cylinder(.05,.05,.5,'#fff4e0',band,.28,.42,0).rotation.z=Math.PI/2;sphere(.08,'#fff4e0',band,.52,.47,0);sphere(.08,'#fff4e0',band,.52,.37,0);
    const fuse=box(.055,.23,.055,'#ffd366',g,.06,.72,0);fuse.rotation.z=-.3;
    const poison=cylinder(.18,.23,.48,'#73d890',g,0,.42,0);poison.rotation.z=.12;
    const bubbles=sphere(.1,'#c9ffad',g,.2,.72,0);bubbles.scale.set(.8,1,.8);
    const virus=cylinder(.18,.23,.48,'#8d55bd',g,0,.42,0);virus.rotation.z=-.12;
    const virusGlow=sphere(.1,'#d19aff',g,.2,.72,0);virusGlow.scale.set(.8,1,.8);
    const blade=box(.12,.9,.06,'#eff8eb',g,0,.65,0);blade.rotation.z=-.1;
    const hilt=box(.5,.08,.12,'#e9bb58',g,0,.25,0);
    const beer=cylinder(.2,.2,.5,'#d79a3b',g,0,.43,0);const foam=sphere(.22,'#fff0bd',g,0,.72,0);
    const slow=cylinder(.2,.2,.48,'#7faee8',g,0,.42,0);slow.rotation.z=-.12;const snow=sphere(.1,'#d9f2ff',g,.18,.72,0);
    ink(g,.03);
    const ring=new THREE.Mesh(new THREE.RingGeometry(.36,.44,24),new THREE.MeshBasicMaterial({color:'#ffe17d',transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.08;g.add(ring);
    g.userData={core,band,fuse,poison,bubbles,virus,virusGlow,blade,hilt,beer,foam,slow,snow,ring,type:''};scene.add(g);pickupModels.push(g);
  }
  pickupModels.forEach((m,i)=>{const p=world.pickups[i];m.visible=!!p;if(p){const u=m.userData;if(u.type!==p.type){u.type=p.type;u.core.visible=p.type==='bomb';u.band.visible=p.type==='meat';u.fuse.visible=p.type==='bomb';u.poison.visible=p.type==='poison';u.bubbles.visible=p.type==='poison';u.virus.visible=p.type==='virus';u.virusGlow.visible=p.type==='virus';u.blade.visible=p.type==='sword';u.hilt.visible=p.type==='sword';u.beer.visible=p.type==='beer';u.foam.visible=p.type==='beer';u.slow.visible=p.type==='slow';u.snow.visible=p.type==='slow';u.ring.material.color.set(p.type==='poison'?'#8dffac':p.type==='virus'?'#c084ff':p.type==='bomb'?'#ffcf68':p.type==='meat'?'#ff9b6b':p.type==='beer'?'#ffd66e':p.type==='slow'?'#8ab8ff':'#fff0a5');}m.position.set(p.x,.1+Math.sin(world.tick*.05)*.1,p.z);m.rotation.y+=dt;}});
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];if(e.delay>0){e.delay-=dt;if(e.delay<=0)e.m.visible=true;continue;}e.life-=dt;if(e.life<=0){removeEffect(e);effects.splice(i,1);continue;}const k=e.life/e.max;if(e.v){e.m.position.addScaledVector(e.v,dt);if(e.puff)e.v.multiplyScalar(Math.exp(-dt*4));else if(!e.sprite)e.v.y-=dt*16;}if(e.puff){e.m.scale.setScalar(1+(1-k)*1.8);e.m.material.opacity=k*.8;continue;}if(e.sweep){e.m.scale.setScalar(.8+(1-k)*.4);e.m.material.opacity=k;continue;}if(e.star){e.m.scale.setScalar(e.star*(.45+(1-k)*.9));e.m.material.opacity=Math.min(1,k*1.6);continue;}if(e.grow)e.m.scale.setScalar(.5+(1-k)*.8);if(!e.shared)e.m.material.opacity=k;else e.m.scale.setScalar(k);}
  calloutTime-=dt;$('callout').style.opacity=calloutTime>0?'1':'0';
  stage.update(performance.now()/1000,dt);
  updateHud();updateCamera(dt);
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<innerHeight?48:34;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);resize();
let last=performance.now(),acc=0;
function simulate(dt){
  const input=serialInput();
  if(netRole==='guest'){
    acc=0;netSendAcc+=dt;if(netSendAcc>=NETWORK_INPUT_RATE){netSendAcc=0;sendNet({t:'input',round:world.round||0,input});}
  }else{
    if(netRole==='host')world.remoteInput=guestInput.read(performance.now());
    if(timeScale<1&&performance.now()>slowUntil)timeScale=1;
    acc=Math.min(acc+dt*timeScale,.1);while(acc>=STEP){if(started&&!connectionAttempt.pending&&(netRole==='solo'||world.online))step(world,input);acc-=STEP;}
    if(netRole==='host'){netBroadcastAcc+=dt;if(netBroadcastAcc>=NETWORK_STATE_RATE){netBroadcastAcc=0;sendSnapshot();}}
  }
}
function frame(now){
  requestAnimationFrame(frame);const dt=clamp((now-last)/1000,0,.1);last=now;if(document.hidden)return;
  simulate(dt);events();updateVisuals(dt);renderer.render(scene,camera);
}
refreshSelect();reset();
$('loading').remove();requestAnimationFrame(frame);
// Headless verification hook (?debug): drive frames without requestAnimationFrame.
if(new URLSearchParams(location.search).has('debug'))window.__brawl={get world(){return world;},get cam(){return [tmpFocus.toArray(),camDist,focusShot];},camera,scene,renderer,selection,startMatch,action,keys,
  run(seconds,fps=60,draw=true){for(let t=0;t<seconds;t+=1/fps){simulate(1/fps);events();updateVisuals(1/fps);}if(draw)renderer.render(scene,camera);}};
