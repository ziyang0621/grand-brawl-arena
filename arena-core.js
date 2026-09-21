// Deterministic gameplay shared by the browser and headless regression tests.
export const STEP = 1 / 120;
export const GRAVITY = 22;
export const JUMP_SPEED = 12.5;
export const PLATFORMS = [
  {id:'deck-left',x:-6,z:0,w:4,d:3,top:1.6},
  {id:'deck-center',x:0,z:-2.2,w:4,d:3,top:2.2},
  {id:'deck-right',x:6,z:0,w:4,d:3,top:1.6},
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const CRATE_SPAWNS=[[-11,-6],[-7,-4],[-2,3],[4,-4],[8,4],[11,-6],[0,5],[-4,-6]];
const LADDERS=[{x:-6,z:1.62,top:1.6},{x:0,z:-.58,top:2.2},{x:6,z:1.62,top:1.6}];
export function supported(x,z,p,r=0){return Math.abs(x-p.x)<=p.w/2+r&&Math.abs(z-p.z)<=p.d/2+r;}
export function createFighter(id,x,z){return {id,x,y:0,z,spawnX:x,spawnZ:z,vx:0,vy:0,vz:0,respawnTimer:0,lives:1,climbing:false,fx:id===0?1:-1,fz:0,hp:100,grounded:true,jumps:0,jumpBuffer:0,coyote:0,attackTime:0,attackCD:0,attackType:'light',combo:0,comboWindow:0,hitDone:false,skillTime:0,skillLevel:1,skillCD:0,energy:1,energyMax:3,bombCD:0,dodgeCD:0,dodgeTime:0,stun:0,invuln:0,hurtTime:0,hurtKind:'melee',burnTime:0,virusTime:0,blocking:false,guardPrev:false,parryWindow:0,knocked:0,grabbed:0,grabbedBy:null,grabThrow:'forward',carrying:null,item:null,weapon:null,attackBoost:1,attackBoostTime:0,poisonTime:0,poisonTick:0,slowTime:0,walk:0,support:'ground'};}
export function createWorld(){return {time:120,tick:0,hitStop:0,training:false,online:false,stock:false,ended:false,winner:null,remoteInput:{x:0,z:0,guard:false},fighters:[createFighter(0,-3.4,2),createFighter(1,3.4,2)],bombs:[],clouds:[],props:[],cannonballs:[],events:[],pickups:[],crates:[{id:0,kind:'barrel',x:-6,z:3,y:0,hp:1,falling:false,heldBy:null,respawnTick:0},{id:1,kind:'crate',x:6,z:3,y:0,hp:1,falling:false,heldBy:null,respawnTick:0},{id:2,kind:'chest',x:0,z:-5,y:0,hp:1,falling:false,heldBy:null,respawnTick:0}],nextBomb:0,nextCloud:0,nextProp:0,nextCannon:0,nextCannonTick:900,nextWaveTick:2400,waveWarning:0,waveTime:0,waveDir:1,wavePending:false};}
function emit(w,type,data){w.events.push({type,...data});}
export function jump(p){if(p.hp<=0||p.knocked>0||p.stun>0)return;p.jumpBuffer=.14;}
function faceTarget(p,q){const d=distance(p,q);if(d>0.001){p.fx=(q.x-p.x)/d;p.fz=(q.z-p.z)/d;}}
function gainEnergy(w,p,amount){if(!p||!Number.isFinite(p.energy)||!Number.isFinite(p.energyMax))return;const before=p.energy;p.energy=Math.min(p.energyMax,p.energy+amount);if(p.energy!==before)emit(w,'energy',{id:p.id,energy:p.energy,max:p.energyMax});}
function hit(w,p,q,damage,force,options={}){
  if(q.hp<=0||q.invuln>0)return false;
  if(q.blocking&&q.parryWindow>0&&!options.grab&&!options.guardBreak){w.hitStop=Math.max(w.hitStop,.035);p.stun=.48;p.vx*=-.35;p.vz*=-.35;q.invuln=.18;emit(w,'parry',{x:q.x,y:q.y+1.4,z:q.z,id:q.id});return true;}
  if(q.blocking&&!options.guardBreak&&!options.grab){const reducedDamage=Math.max(1,Math.round(damage*.25));q.hp=Math.max(0,q.hp-reducedDamage);q.hurtTime=.16;q.hurtKind='guard';w.hitStop=Math.max(w.hitStop,.025);q.vx*=.2;q.vz*=.2;q.stun=.04;q.invuln=.08;emit(w,'guard',{x:q.x,y:q.y+1.4,z:q.z,id:q.id,damage:reducedDamage});emit(w,'impact',{x:q.x,y:q.y+1.1,z:q.z,force:1,kind:'guard'});emit(w,'hit',{x:q.x,y:q.y+1.2,z:q.z,damage:reducedDamage,id:q.id});return true;}
  const d=Math.max(.01,distance(p,q));const fx=d>.02?(q.x-p.x)/d:p.fx||1,fz=d>.02?(q.z-p.z)/d:p.fz||0;
  const brokeGuard=Boolean(q.blocking&&options.guardBreak);if(brokeGuard){q.blocking=false;emit(w,'guardBreak',{x:q.x,y:q.y+1.4,z:q.z,id:q.id});}
  q.attackTime=0;q.skillTime=0;q.hitDone=true;q.jumpBuffer=0;
  q.hp=Math.max(0,q.hp-damage);q.hurtTime=.45;q.hurtKind=options.kind||'melee';if(options.kind==='bomb')q.burnTime=1.25;q.vx=fx*force;q.vz=fz*force;q.vy=force*.45;q.grounded=false;q.support=null;q.stun=brokeGuard?.52:.28;q.invuln=.25;
  w.hitStop=Math.max(w.hitStop,options.grab?.08:force>=8?.075:.055);emit(w,'impact',{x:q.x,y:q.y+1.1,z:q.z,force,kind:options.kind||'melee'});
  if(options.grab){q.grabbed=.42;q.grabbedBy=p.id;q.knocked=.95;q.stun=.65;q.vx=0;q.vz=0;q.vy=0;}
  else if(force>=8||damage>=18){q.knocked=.82;emit(w,'knockdown',{x:q.x,y:q.y+1.1,z:q.z,id:q.id});}
  const attacker=p.owner===undefined?p:w.fighters.find(f=>f.id===p.owner);if(attacker!==q){gainEnergy(w,attacker,.22);gainEnergy(w,q,.08);}
  emit(w,'hit',{x:q.x,y:q.y+1.2,z:q.z,damage,id:q.id});return true;
}
function beginAttack(w,p,type){
  if(w.ended||p.hp<=0||p.knocked>0||p.stun>0||p.blocking||p.attackCD>0||p.skillTime>0)return;
  const actual=!p.grounded&&type==='heavy'?'slam':!p.grounded&&type==='light'?'air':type;p.attackType=actual;p.combo=actual==='light'?(p.comboWindow>0?(p.combo+1)%3:0):0;p.comboWindow=actual==='light'?.9:0;p.attackTime=actual==='slam'||actual==='heavy'||actual==='upper'?.5:actual==='grab'?.42:actual==='dash'?.38:.34;p.attackCD=actual==='slam'?.55:actual==='grab'?.65:actual==='upper'?.5:p.id===0?.24:.3;p.hitDone=false;if(actual==='slam')p.vy=-14;if(actual==='upper')p.vy=5.5;if(actual==='dash'){p.vx=p.fx*(p.id===0?11:9);p.vz=p.fz*(p.id===0?11:9);}
  const q=w.fighters.find(q=>q.id!==p.id);if(q&&distance(p,q)<3.3)faceTarget(p,q);
  emit(w,['light','air','slam','dash','upper'].includes(actual)?'slash':actual,{id:p.id,x:p.x,y:p.y+1.1,z:p.z,fx:p.fx,fz:p.fz,combo:p.combo,attackType:actual,weapon:p.weapon});
}
function carriedObject(w,p){if(!p.carrying)return null;return p.carrying.kind==='crate'?w.crates.find(c=>c.id===p.carrying.id):w.props.find(c=>c.id===p.carrying.id);}
function throwCarried(w,p,high=false){const held=carriedObject(w,p);if(!held){p.carrying=null;return false;}let prop=held;if(p.carrying.kind==='crate'){held.hp=0;held.heldBy=null;held.respawnTick=w.tick+Math.round((10+Math.random()*7)/STEP);prop={id:w.nextProp++,kind:held.kind,owner:p.id,x:p.x+p.fx*.8,y:p.y+2,z:p.z+p.fz*.8,vx:0,vy:0,vz:0,life:3,heldBy:null};w.props.push(prop);}else prop.heldBy=null;prop.owner=p.id;prop.life=3;prop.x=p.x+p.fx*.8;prop.y=p.y+2;prop.z=p.z+p.fz*.8;prop.hitIds=[];prop.vx=p.fx*(high?4.5:10);prop.vz=p.fz*(high?4.5:10);prop.vy=high?12:5;p.carrying=null;emit(w,'propThrow',{id:p.id,kind:prop.kind,x:prop.x,y:prop.y,z:prop.z,high});return true;}
export function attack(w,p,input={}){if(p.carrying){throwCarried(w,p,false);return;}const moving=Math.hypot(input.x||0,input.z||0)>.5;beginAttack(w,p,p.grounded&&moving?'dash':'light');}
export function heavy(w,p,input={}){if(p.carrying){throwCarried(w,p,true);return;}beginAttack(w,p,p.grounded&&(input.z||0)<-.5?'upper':'heavy');}
export function grab(w,p,input={}){if(p.carrying){throwCarried(w,p,(input.z||0)<-.2);return;}const prop=w.props.find(o=>!o.heldBy&&distance(p,o)<1.6&&Math.abs(p.y+1-o.y)<1.5);if(prop){prop.heldBy=p.id;prop.vx=prop.vy=prop.vz=0;p.carrying={kind:'prop',id:prop.id};emit(w,'lift',{id:p.id,kind:prop.kind,x:p.x,y:p.y+2,z:p.z});return;}const c=w.crates.find(c=>c.hp>0&&!c.falling&&!c.heldBy&&distance(p,c)<1.65&&Math.abs(p.y-c.y)<1.4);if(c){c.heldBy=p.id;p.carrying={kind:'crate',id:c.id};emit(w,'lift',{id:p.id,kind:c.kind,x:p.x,y:p.y+2,z:p.z});return;}p.grabThrow=(input.z||0)<-.5?'high':'forward';beginAttack(w,p,'grab');}
export function bomb(w,p){
  if(w.ended||p.hp<=0||p.knocked>0||p.stun>0||!p.item)return;
  if(p.item==='meat'){p.hp=Math.min(100,p.hp+20);emit(w,'heal',{id:p.id,x:p.x,y:p.y+1,z:p.z});p.item=null;return;}
  if(p.item==='beer'){p.attackBoost=1.55;p.attackBoostTime=8;emit(w,'power',{id:p.id,item:p.item,x:p.x,y:p.y+1,z:p.z});p.item=null;return;}
  if(p.item==='sword'){p.attackBoost=1.35;p.attackBoostTime=10;p.weapon='sword';emit(w,'ready',{id:p.id,item:p.item});p.item=null;return;}
  const kind=p.item;p.item=null;const bottle=kind==='poison'||kind==='virus'||kind==='slow',speed=kind==='slow'?6.2:5.8,arc=kind==='slow'?5.2:4.6;w.bombs.push({id:w.nextBomb++,owner:p.id,kind,x:p.x+p.fx*.8,y:p.y+1.3,z:p.z+p.fz*.8,vx:p.fx*(bottle?speed:7.5),vy:bottle?arc:6.5,vz:p.fz*(bottle?speed:7.5),life:bottle?1.05:1.2});emit(w,'throw',{id:p.id,kind});
}
export function skill(w,p,requestedLevel=1){
  const level=clamp(Math.floor(requestedLevel)||1,1,3);if(w.ended||p.hp<=0||p.knocked>0||p.stun>0||p.skillCD>0||p.energy<level)return;
  const radius=3.4+(level-1)*.8,damage=12+level*10,force=8+level*2;p.energy-=level;p.skillLevel=level;p.skillCD=1.1+level*.25;p.skillTime=.5+level*.18;p.invuln=p.skillTime;emit(w,'energy',{id:p.id,energy:p.energy,max:p.energyMax});
  emit(w,'skill',{id:p.id,x:p.x,y:p.y+.7,z:p.z,level,radius});
  for(const q of w.fighters)if(q!==p&&distance(p,q)<radius&&Math.abs(p.y-q.y)<2.5)hit(w,p,q,damage,force,{guardBreak:level===3});
  for(const c of w.crates)if(c.hp>0&&distance(p,c)<radius)breakCrate(w,c,2);
}
export function dodge(p){if(p.dodgeCD>0||p.knocked>0||p.stun>0||p.hp<=0||p.poisonTime>0||p.slowTime>0)return;p.dodgeCD=1.2;p.dodgeTime=.18;p.invuln=.24;p.vx=p.fx*12;p.vz=p.fz*12;}
const LOOT={barrel:['bomb','bomb','poison','virus','slow'],crate:['meat','meat','beer','bomb'],chest:['sword','beer','meat','sword']};
function dropLoot(w,kind,x,z){const types=LOOT[kind]||LOOT.crate,item=types[Math.floor(Math.random()*types.length)];emit(w,'break',{x,y:.7,z,item,kind});w.pickups.push({type:item,x,y:0,z,life:24});return item;}
function breakCrate(w,c,n){if(c.hp<=0||c.falling||c.heldBy)return;c.hp=Math.max(0,c.hp-n);if(c.hp<=0){dropLoot(w,c.kind,c.x,c.z);c.respawnTick=w.tick+Math.round((10+Math.random()*7)/STEP);}}
function updateCrates(w,dt){for(const c of w.crates){if(c.heldBy!==null){const p=w.fighters.find(p=>p.id===c.heldBy);if(p){c.x=p.x+p.fx*.3;c.z=p.z+p.fz*.3;c.y=p.y+2.15;}continue;}if(c.hp<=0&&!c.falling&&c.respawnTick&&w.tick>=c.respawnTick){const [x,z]=CRATE_SPAWNS[Math.floor(Math.random()*CRATE_SPAWNS.length)];c.x=x;c.z=z;c.y=9;c.kind=['barrel','crate','chest'][Math.floor(Math.random()*3)];c.hp=1;c.falling=true;c.dropSpeed=0;emit(w,'crateDrop',{id:c.id,x,z,kind:c.kind});}if(c.falling){c.dropSpeed=(c.dropSpeed||0)+24*dt;c.y-=c.dropSpeed*dt;if(c.y<=.48){c.y=.48;c.falling=false;emit(w,'crateLand',{id:c.id,x:c.x,y:c.y,z:c.z,kind:c.kind});}}}}
function ai(w,p,q){
  if(w.training)return {x:0,z:0};
  const d=distance(p,q);faceTarget(p,q);
  if(q.y>p.y+.6&&p.grounded)jump(p);
  if(d<2.3&&Math.abs(p.y-q.y)<1.4&&w.tick>180&&w.tick%110===0)attack(w,p);
  if(d>4&&d<8&&w.tick%420===0)bomb(w,p);
  const move=d>1.8?1:d<1.3?-.5:0;return {x:p.fx*move,z:p.fz*move};
}
export function stepFighter(p,input,dt){
  for(const key of ['attackCD','comboWindow','bombCD','skillCD','skillTime','dodgeCD','dodgeTime','stun','invuln','parryWindow'])p[key]=Math.max(0,p[key]-dt);
  p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);p.coyote=p.grounded?.09:Math.max(0,p.coyote-dt);
  const wantsGuard=Boolean(input.guard);if(wantsGuard&&!p.guardPrev&&p.stun<=0&&p.attackTime<=0)p.parryWindow=.16;p.guardPrev=wantsGuard;
  p.blocking=wantsGuard&&p.stun<=0&&p.attackTime<=0&&p.dodgeTime<=0;
  let ix=input.x||0,iz=input.z||0;const len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len;}
  if(p.stun<=0&&p.dodgeTime<=0){
    const slow=p.slowTime>0?.55:1;const speed=p.blocking?1.2:(p.attackTime>0?2:p.carrying?5.4:7.6)*slow,accel=p.blocking?18:14;
    p.vx+=(ix*speed-p.vx)*Math.min(1,accel*dt);p.vz+=(iz*speed-p.vz)*Math.min(1,accel*dt);
    if(len===0){p.vx*=Math.pow(.001,dt);p.vz*=Math.pow(.001,dt);}
    if(len>0&&p.attackTime<=0&&!p.blocking){p.fx=ix/Math.hypot(ix,iz);p.fz=iz/Math.hypot(ix,iz);p.walk+=dt*14;}
    if(!p.blocking&&p.jumpBuffer>0&&(p.grounded||p.coyote>0||p.jumps<2)){
      if(!p.grounded&&p.coyote<=0&&p.jumps===0)p.jumps=1;
      p.vy=JUMP_SPEED;p.jumps++;p.grounded=false;p.coyote=0;p.jumpBuffer=0;
    }
  }
  const oldY=p.y;
  p.x=clamp(p.x+p.vx*dt,-14.5,14.5);p.z=clamp(p.z+p.vz*dt,-8.5,8.5);
  p.climbing=false;
  const ladder=LADDERS.find(l=>Math.abs(p.x-l.x)<.72&&Math.abs(p.z-l.z)<1.8);
  const climbUp=ladder&&p.y<ladder.top-.02&&(iz<-.1);
  const climbDown=ladder&&p.y>0.02&&iz>.1;
  if(climbUp||climbDown){p.climbing=true;p.x+=(ladder.x-p.x)*Math.min(1,18*dt);p.z+=(ladder.z-p.z)*Math.min(1,12*dt);p.y=clamp(p.y+(climbUp?3.8:-3.8)*dt,0,ladder.top);p.vx=0;p.vz=0;p.vy=0;p.grounded=p.y<=.001||p.y>=ladder.top-.001;p.support=p.y>=ladder.top-.001?'ladder-top':'ladder';if(p.y>=ladder.top-.001){p.y=ladder.top;p.support='ladder-top';}return;}
  p.vy-=GRAVITY*dt;p.y+=p.vy*dt;p.grounded=false;p.support=null;
  if(p.vy<=0){
    let top=0,id='ground';
    for(const deck of PLATFORMS)if(supported(p.x,p.z,deck,.28)&&oldY>=deck.top-.45&&p.y<=deck.top&&deck.top>top){top=deck.top;id=deck.id;}
    if(p.y<=top){p.y=top;p.vy=0;p.grounded=true;p.jumps=0;p.support=id;}
  }
}
export function step(w,input={},dt=STEP){
  if(w.ended)return;
  if(w.hitStop>0){w.hitStop=Math.max(0,w.hitStop-dt);return;}
  w.tick++;if(!w.training)w.time=Math.max(0,w.time-dt);
  updateCrates(w,dt);
  for(const p of w.fighters){
    if(p.respawnTimer>0){p.respawnTimer=Math.max(0,p.respawnTimer-dt);if(p.respawnTimer===0){p.hp=100;p.x=p.spawnX;p.y=0;p.z=p.spawnZ;p.vx=0;p.vy=0;p.vz=0;p.grounded=true;p.support='ground';p.invuln=1.5;p.hurtTime=0;p.burnTime=0;p.virusTime=0;p.poisonTime=0;p.slowTime=0;p.knocked=0;p.grabbed=0;p.grabbedBy=null;p.carrying=null;p.weapon=null;p.stun=0;p.attackTime=0;p.skillTime=0;p.jumpBuffer=0;p.blocking=false;p.guardPrev=false;p.parryWindow=0;emit(w,'respawn',{id:p.id,x:p.x,y:1,z:p.z});}else continue;}
    p.attackBoostTime=Math.max(0,p.attackBoostTime-dt);if(p.attackBoostTime===0){p.attackBoost=1;p.weapon=null;}
    p.slowTime=Math.max(0,p.slowTime-dt);p.poisonTime=Math.max(0,p.poisonTime-dt);p.virusTime=Math.max(0,p.virusTime-dt);p.burnTime=Math.max(0,p.burnTime-dt);p.hurtTime=Math.max(0,p.hurtTime-dt);p.poisonTick+=dt;
    if(p.poisonTime>0&&p.poisonTick>=1){p.poisonTick=0;p.hp=Math.max(0,p.hp-4);p.hurtTime=.35;p.hurtKind='poison';emit(w,'dot',{id:p.id,x:p.x,y:p.y+1.2,z:p.z,damage:4});}
    if(p.grabbed>0){p.grabbed=Math.max(0,p.grabbed-dt);const holder=w.fighters.find(f=>f.id===p.grabbedBy);if(holder&&holder.hp>0){p.x=holder.x+holder.fx*.72;p.z=holder.z+holder.fz*.72;p.y=holder.y+1.05;}p.vx=0;p.vy=0;p.vz=0;p.grounded=false;p.blocking=false;p.attackTime=0;p.skillTime=0;if(p.grabbed===0){const high=holder?.grabThrow==='high';p.grabbedBy=null;p.knocked=.95;p.vx=(holder?.fx||1)*(high?4.5:10);p.vz=(holder?.fz||0)*(high?4.5:10);p.vy=high?12:7.8;emit(w,'throwHit',{x:p.x,y:p.y+1.1,z:p.z,id:p.id,high});}continue;}
    if(p.knocked>0){const was=p.knocked;p.knocked=Math.max(0,p.knocked-dt);p.attackTime=0;p.skillTime=0;stepFighter(p,{x:0,z:0,guard:false},dt);p.blocking=false;if(p.knocked===0&&!p.grounded)p.knocked=.01;else if(was>0&&p.knocked===0){p.invuln=.35;emit(w,'wakeup',{id:p.id,x:p.x,y:p.y+1,z:p.z});}continue;}
    const controls=p.id===0?input:(w.online?w.remoteInput:ai(w,p,w.fighters[0]));
    stepFighter(p,controls,dt);
    if(p.attackTime>0){
      p.attackTime=Math.max(0,p.attackTime-dt);
      const active=p.attackType==='slam'?.27:p.attackType==='heavy'||p.attackType==='upper'?.29:p.attackType==='grab'?.25:p.attackType==='air'||p.attackType==='dash'?.24:.22;
      if(!p.hitDone&&p.attackTime<active){
        p.hitDone=true;
        if(p.attackType==='grab'){
          for(const q of w.fighters){const d=distance(p,q);if(q===p||Math.abs(p.y-q.y)>1.5)continue;const dot=((q.x-p.x)*p.fx+(q.z-p.z)*p.fz)/Math.max(.01,d);if(d<1.85&&(dot>-.25||d<.8)){const before=q.hp;hit(w,p,q,12*p.attackBoost,8,{grab:true});if(q.hp<before||q.blocking){q.blocking=false;q.knocked=Math.max(q.knocked,.92);q.stun=.55;}}
          }
        }else for(const q of w.fighters){const d=distance(p,q);const vertical=['slam','air','upper'].includes(p.attackType)?2.4:1.5;if(q===p||Math.abs(p.y-q.y)>vertical)continue;
          const dot=((q.x-p.x)*p.fx+(q.z-p.z)*p.fz)/Math.max(.01,d);
          const reach=p.weapon==='sword'?3.25:p.attackType==='slam'?2.9:p.attackType==='heavy'?2.85:p.attackType==='upper'?2.55:p.attackType==='dash'?3:p.attackType==='air'?2.7:2.6;
          if(d<reach&&(dot>-.15||d<.8)){const baseDamage=p.attackType==='slam'?21:p.attackType==='heavy'?18:p.attackType==='upper'?16:p.attackType==='dash'?12:p.attackType==='air'?11:(p.combo===2?15:9),baseForce=p.attackType==='slam'?12:p.attackType==='heavy'?10:p.attackType==='upper'?9:p.attackType==='dash'?7:p.attackType==='air'?5.5:(p.combo===2?9:4),styleBoost=p.id===0&&['dash','air'].includes(p.attackType)?1.1:p.id===1&&['heavy','upper','slam'].includes(p.attackType)?1.2:1;hit(w,p,q,baseDamage*styleBoost*p.attackBoost,baseForce*(p.id===1&&styleBoost>1?1.12:1),{guardBreak:p.attackType==='heavy'||p.attackType==='slam',kind:p.attackType});}
        }
        if(p.attackType!=='grab')for(const c of w.crates)if(c.hp>0&&distance(p,c)<2.5&&p.y<1.7)breakCrate(w,c,1);
      }
    }
  }
  const [a,b]=w.fighters,d=distance(a,b);
  if(d<.85&&Math.abs(a.y-b.y)<1.6){const nx=d>.001?(b.x-a.x)/d:1,nz=d>.001?(b.z-a.z)/d:0,push=(.85-d)/2;a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;}
  for(let i=w.bombs.length-1;i>=0;i--){
    const s=w.bombs[i],oldY=s.y;s.life-=dt;s.vy-=16*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;
    const ground=s.y<.22||PLATFORMS.some(p=>supported(s.x,s.z,p)&&s.vy<0&&oldY>=p.top+.22&&s.y<=p.top+.22);
    const contact=w.fighters.some(p=>distance(p,s)<.65&&Math.abs(p.y+1-s.y)<1);
    if(ground||contact||s.life<=0){
      if(s.kind==='poison'||s.kind==='virus'||s.kind==='slow'){
        const radius=s.kind==='virus'?2.8:s.kind==='slow'?2.4:2.2;const life=s.kind==='virus'?7:s.kind==='slow'?4:5;w.clouds.push({id:w.nextCloud++,owner:s.owner,kind:s.kind,x:s.x,y:Math.max(.2,s.y),z:s.z,life,radius,tick:0});emit(w,'cloud',{x:s.x,y:Math.max(.2,s.y),z:s.z,kind:s.kind});
      }else{
        emit(w,'explosion',{x:s.x,y:s.y,z:s.z,kind:s.kind});
        for(const p of w.fighters)if(distance(p,s)<3&&Math.abs(p.y+1-s.y)<2.8){const blocked=p.blocking;const damage=s.kind==='slow'?7:20;const connected=hit(w,s,p,damage,s.kind==='slow'?5:10,{kind:s.kind});if(connected&&!blocked&&s.kind==='slow'){p.slowTime=5;emit(w,'slow',{id:p.id,x:p.x,y:p.y+1,z:p.z});}}
        for(const c of w.crates)if(c.hp>0&&distance(c,s)<3)breakCrate(w,c,2);
      }
      w.bombs.splice(i,1);
    }
  }
  for(let i=w.props.length-1;i>=0;i--){const o=w.props[i];if(o.heldBy!==null){const p=w.fighters.find(p=>p.id===o.heldBy);if(p){o.x=p.x+p.fx*.3;o.z=p.z+p.fz*.3;o.y=p.y+2.15;}continue;}const oldY=o.y;o.life-=dt;o.age=(o.age||0)+dt;o.vy-=GRAVITY*dt;o.x+=o.vx*dt;o.y+=o.vy*dt;o.z+=o.vz*dt;const target=w.fighters.find(p=>p.id!==o.owner&&distance(p,o)<.8&&Math.abs(p.y+1-o.y)<1.2);const ground=o.y<.35||PLATFORMS.some(p=>supported(o.x,o.z,p)&&o.vy<0&&oldY>=p.top+.35&&o.y<=p.top+.35);if(target){hit(w,o,target,o.kind==='chest'?20:o.kind==='barrel'?17:14,o.kind==='chest'?11:8,{kind:'prop'});emit(w,'propBreak',{x:o.x,y:o.y,z:o.z,kind:o.kind});dropLoot(w,o.kind,o.x,o.z);w.props.splice(i,1);}else if(ground||o.life<=0){emit(w,'propBreak',{x:o.x,y:Math.max(.3,o.y),z:o.z,kind:o.kind});dropLoot(w,o.kind,o.x,o.z);w.props.splice(i,1);}}
  if(!w.training&&w.tick>=w.nextCannonTick){const target=w.fighters[Math.floor(Math.random()*w.fighters.length)],side=Math.random()<.5?-1:1;w.cannonballs.push({id:w.nextCannon++,owner:-1,x:side*15,y:1.2,z:target.z,vx:-side*11,vy:1.8,vz:(target.z-target.z)*0,life:3});w.nextCannonTick=w.tick+840;emit(w,'cannon',{x:side*14,y:1.2,z:target.z,side});}
  for(let i=w.cannonballs.length-1;i>=0;i--){const c=w.cannonballs[i];c.life-=dt;c.vy-=5*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;const target=w.fighters.find(p=>distance(p,c)<.75&&Math.abs(p.y+1-c.y)<1.2);if(target){hit(w,c,target,14,9,{kind:'cannon'});emit(w,'explosion',{x:c.x,y:c.y,z:c.z,kind:'cannon'});w.cannonballs.splice(i,1);}else if(c.life<=0||Math.abs(c.x)>17||c.y<0){w.cannonballs.splice(i,1);}}
  if(!w.training&&w.tick>=w.nextWaveTick&&!w.wavePending&&w.waveTime<=0){w.waveWarning=2;w.wavePending=true;w.waveDir=Math.random()<.5?-1:1;w.nextWaveTick=w.tick+3600;emit(w,'waveWarning',{dir:w.waveDir});}if(w.waveWarning>0){w.waveWarning=Math.max(0,w.waveWarning-dt);if(w.waveWarning===0&&w.wavePending){w.wavePending=false;w.waveTime=2.2;emit(w,'waveStart',{dir:w.waveDir});for(const p of w.fighters)if(p.y<.5)hit(w,{owner:-1,x:p.x-w.waveDir,z:p.z,fx:w.waveDir,fz:0},p,7,6,{kind:'wave'});}}if(w.waveTime>0){w.waveTime=Math.max(0,w.waveTime-dt);for(const p of w.fighters)if(p.y<.7){p.vx+=w.waveDir*11*dt;p.x=clamp(p.x,-14.5,14.5);}}
  for(let i=w.clouds.length-1;i>=0;i--){const c=w.clouds[i];c.life-=dt;c.tick-=dt;if(c.tick<=0){c.tick=.7;for(const p of w.fighters)if(distance(p,c)<c.radius&&Math.abs(p.y+1-c.y)<2.8){if(p.blocking){emit(w,'guard',{x:p.x,y:p.y+1.3,z:p.z,id:p.id});continue;}if(c.kind==='slow'){p.slowTime=4;emit(w,'slow',{id:p.id,x:p.x,y:p.y+1,z:p.z});continue;}const damage=c.kind==='virus'?4:2;p.hp=Math.max(0,p.hp-damage);p.hurtTime=.35;p.hurtKind=c.kind;p.invuln=.18;emit(w,'dot',{id:p.id,x:p.x,y:p.y+1.2,z:p.z,damage});if(c.kind==='virus'){p.virusTime=2.6;p.slowTime=2;emit(w,'slow',{id:p.id,x:p.x,y:p.y+1,z:p.z});}else{p.poisonTime=3;p.poisonTick=0;emit(w,'poison',{id:p.id,x:p.x,y:p.y+1,z:p.z});}}}if(c.life<=0)w.clouds.splice(i,1);}
  for(let i=w.pickups.length-1;i>=0;i--){const h=w.pickups[i];h.life-=dt;const p=w.fighters.find(p=>p.y<1.2&&distance(p,h)<1.8&&(!p.item||h.type==='meat'||h.type==='beer'));if(p){if(h.type==='meat'){p.hp=Math.min(100,p.hp+20);emit(w,'heal',{id:p.id,x:p.x,y:1,z:p.z});}else if(h.type==='beer'){p.attackBoost=1.55;p.attackBoostTime=8;emit(w,'power',{id:p.id,item:h.type,x:p.x,y:p.y+1,z:p.z});}else{p.item=h.type;emit(w,'pickup',{id:p.id,item:h.type,x:p.x,y:p.y+1,z:p.z});}}if(p||h.life<=0)w.pickups.splice(i,1);}
  if(w.stock)for(const p of w.fighters)if(p.hp<=0&&p.respawnTimer<=0&&p.lives>1){p.lives--;p.respawnTimer=.9;p.item=null;p.weapon=null;p.blocking=false;p.knocked=0;p.attackTime=0;p.skillTime=0;emit(w,'lifeLost',{id:p.id,lives:p.lives,x:p.x,y:p.y+1,z:p.z});}
  const defeated=w.fighters.some(p=>p.hp<=0&&p.respawnTimer<=0&&(!w.stock||p.lives<=1));
  if(defeated||w.time<=0){w.ended=true;w.winner=a.lives===b.lives?(a.hp===b.hp?null:a.hp>b.hp?0:1):a.lives>b.lives?0:1;emit(w,'end',{winner:w.winner});}
}
