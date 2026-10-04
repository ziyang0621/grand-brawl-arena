// Deterministic gameplay shared by the browser and headless regression tests.
import {ventState,CHARACTERS,DEFAULT_CHARS,characterOf,STAGES,stageOf,laddersOf,zoneAt} from './arena-roster.js';
export const STEP = 1 / 120;
export const GRAVITY = 22;
export const JUMP_SPEED = 12.5;
// Port decks stay the default layout; other stages bring their own (see arena-roster.js).
export const PLATFORMS=STAGES.classic.platforms;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
// Four-fighter free-for-all starts from the corners of the open floor, clear of decks and terrain zones.
const DUEL_SPAWNS=[[-3.4,2],[3.4,2]],BRAWL_SPAWNS=[[-4.5,2.5],[4.5,2.5],[-4.5,-3],[4.5,-3]];
const CRATE_SPAWNS=[[-11,-6],[-7,-4],[-2,3],[4,-4],[8,4],[11,-6],[0,5],[-4,-6]];
export function supported(x,z,p,r=0){return Math.abs(x-p.x)<=p.w/2+r&&Math.abs(z-p.z)<=p.d/2+r;}
export function createFighter(id,x,z,char=DEFAULT_CHARS[id===1?1:0]){return {id,team:id,char:CHARACTERS[char]?char:DEFAULT_CHARS[id===1?1:0],x,y:0,z,spawnX:x,spawnZ:z,vx:0,vy:0,vz:0,respawnTimer:0,lives:1,climbing:false,fx:x<=0?1:-1,fz:0,hp:100,grounded:true,jumps:0,jumpBuffer:0,coyote:0,attackTime:0,attackCD:0,attackType:'light',combo:0,comboWindow:0,comboQueued:false,comboInput:null,hitDone:false,landTime:0,skillTime:0,skillLevel:1,skillCD:0,energy:1,energyMax:3,bombCD:0,dodgeCD:0,dodgeTime:0,stun:0,invuln:0,hurtTime:0,hurtKind:'melee',burnTime:0,virusTime:0,blocking:false,guardPrev:false,parryWindow:0,knocked:0,grabbed:0,grabbedBy:null,grabbedTarget:null,grabEscape:0,grabThrow:'forward',grabHoldTime:0,carrying:null,item:null,weapon:null,attackBoost:1,attackBoostTime:0,poisonTime:0,poisonTick:0,slowTime:0,walk:0,support:'ground'};}
export function createWorld(options={}){const chars=options.chars||DEFAULT_CHARS,brawl=chars.length>2,teams=options.teams||chars.map((_,i)=>i),bestOf=options.bestOf||1,roundTime=options.roundTime||120;return {rngState:(Math.random()*4294967296)>>>0,brawl,teamMode:brawl&&new Set(teams).size<chars.length,teams,time:roundTime,roundTime,tick:0,hitStop:0,training:false,online:false,stock:false,ended:false,winner:null,stage:options.stage||'classic',bestOf,roundNo:1,wins:chars.map(()=>0),intro:options.intro||0,roundOver:0,roundWinner:null,remoteInput:{x:0,z:0,guard:false},fighters:chars.slice(0,4).map((c,i)=>Object.assign(createFighter(i,...(brawl?BRAWL_SPAWNS:DUEL_SPAWNS)[i],c),{team:teams[i]})),bombs:[],shots:[],nextShot:0,clouds:[],props:[],cannonballs:[],events:[],pickups:[],pieces:makePieces(stageOf(options.stage||'classic')),crates:makeCrates(stageOf(options.stage||'classic')),nextBomb:0,nextCloud:0,nextProp:0,nextCannon:0,nextCannonTick:900,nextWaveTick:2400,waveWarning:0,waveTime:0,waveDir:1,wavePending:false};}
function emit(w,type,data){w.events.push({type,...data});}
// ---- Destructible set pieces: masts, pillars and ice columns block movement until they are broken. ----
export const CANNON_WARN=1.5,SNOWBALL_WARN=1.6;
const PIECE_FALL=.7,PIECE_DAMAGE={light:6,dash:9,air:7,heavy:14,slam:16,upper:10,rush:10,shieldBash:12};
// Ground containers plus the chests sitting on top of decks (the reward for climbing).
export function makeCrates(stage){
  const ground=stage.crates.map(([x,z],id)=>({id,kind:['barrel','crate','chest'][id%3],x,z,y:0,hp:1,falling:false,heldBy:null,respawnTick:0}));
  const high=(stage.topLoot||[]).map((t,i)=>{const d=stage.platforms.find(p=>p.id===t.deck);return {id:ground.length+i,kind:t.kind||'chest',x:d.x+(t.dx||0),z:d.z+(t.dz||0),y:d.top+.48,floor:d.top+.48,home:{x:d.x+(t.dx||0),z:d.z+(t.dz||0)},deck:d.id,hp:1,falling:false,heldBy:null,respawnTick:0};});
  const kegs=(stage.kegs||[]).map(([x,z],i)=>({id:ground.length+high.length+i,kind:'keg',x,z,y:0,hp:1,home:{x,z},falling:false,heldBy:null,respawnTick:0}));
  return [...ground,...high,...kegs];
}
export function makePieces(stage){return (stage.pieces||[]).map((d,id)=>({id,...d,maxHp:d.hp,state:'standing',hurt:0,dir:{x:1,z:0},fallT:0,owner:-1}));}
const ownerOf=src=>src?(src.owner!==undefined?src.owner:src.id):-1;
function hurtPiece(w,pc,damage,src){
  if(pc.state!=='standing'||!(damage>0))return;
  pc.hp=Math.max(0,pc.hp-damage);pc.hurt=.2;
  emit(w,'pieceHit',{id:pc.id,kind:pc.kind,x:pc.x,y:1.4,z:pc.z,left:pc.hp/pc.maxHp});
  if(pc.hp>0)return;
  const dx=src&&src.x!==undefined?pc.x-src.x:Math.random()-.5,dz=src&&src.z!==undefined?pc.z-src.z:Math.random()-.5,l=Math.hypot(dx,dz)||1;
  Object.assign(pc,{state:'falling',fallT:0,dir:{x:dx/l,z:dz/l},owner:ownerOf(src)});
  emit(w,'pieceFall',{id:pc.id,kind:pc.kind,x:pc.x,z:pc.z,dir:pc.dir,length:pc.length,fall:pc.fall,owner:pc.owner});
}
function crushZone(pc,q){
  const rx=q.x-pc.x,rz=q.z-pc.z;
  if(pc.fall==='burst')return Math.hypot(rx,rz)<pc.length;
  const along=rx*pc.dir.x+rz*pc.dir.z,side=Math.abs(rx*pc.dir.z-rz*pc.dir.x);
  return along>-.4&&along<pc.length&&side<1.25;
}
function updatePieces(w,dt){
  for(const pc of w.pieces){
    pc.hurt=Math.max(0,pc.hurt-dt);
    if(pc.state!=='falling')continue;
    pc.fallT+=dt;if(pc.fallT<(pc.fall==='burst'?PIECE_FALL*.5:PIECE_FALL))continue;
    pc.state='down';
    const from={owner:pc.owner,x:pc.x-pc.dir.x,z:pc.z-pc.dir.z,fx:pc.dir.x,fz:pc.dir.z};
    for(const q of w.fighters){
      if(q.hp<=0||q.y>3||!crushZone(pc,q))continue;
      if(hit(w,pc.fall==='burst'?{owner:pc.owner,x:pc.x,z:pc.z,fx:0,fz:1}:from,q,pc.fall==='burst'?16:22,pc.fall==='burst'?9:8,{kind:'crush'})&&pc.fall==='burst'&&!q.blocking){q.slowTime=2.5;emit(w,'slow',{id:q.id,x:q.x,y:q.y+1,z:q.z});}
    }
    for(const c of w.crates)if(c.hp>0&&!c.falling&&c.heldBy===null&&crushZone(pc,c))breakCrate(w,c,2);
    const tip=pc.fall==='burst'?{x:pc.x,z:pc.z}:{x:pc.x+pc.dir.x*pc.length*.6,z:pc.z+pc.dir.z*pc.length*.6};
    emit(w,'pieceCrash',{id:pc.id,kind:pc.kind,fall:pc.fall,x:tip.x,y:.4,z:tip.z,baseX:pc.x,baseZ:pc.z,dir:pc.dir,length:pc.length});
    dropLoot(w,pc.fall==='burst'?'crate':'chest',pc.x,pc.z);
    w.hitStop=Math.max(w.hitStop,.06);
  }
}
// Fighters cannot walk through a standing piece; a hard body slam damages it.
function collidePieces(w){
  for(const pc of w.pieces){
    if(pc.state!=='standing')continue;
    for(const p of w.fighters){
      if(p.hp<=0||p.y>=pc.h-.3)continue;
      const dx=p.x-pc.x,dz=p.z-pc.z,d=Math.hypot(dx,dz),min=pc.r+.45;
      if(d>=min)continue;
      const nx=d>.001?dx/d:1,nz=d>.001?dz/d:0;
      const speed=Math.hypot(p.vx,p.vz);
      p.x=pc.x+nx*min;p.z=pc.z+nz*min;
      if(p.knocked>0&&speed>5){hurtPiece(w,pc,speed*1.6,{owner:p.id,x:pc.x-nx,z:pc.z-nz});p.vx=nx*speed*.4;p.vz=nz*speed*.4;p.wallImpact={x:p.x,y:p.y+1,z:p.z};}
      else{const into=p.vx*nx+p.vz*nz;if(into<0){p.vx-=nx*into;p.vz-=nz*into;}}
    }
  }
}
// Where a thrown bomb or bottle will land, for the on-screen marker (same physics as the update loop).
export function predictBomb(w,b){
  const stage=stageOf(w.stage);let {x,y,z,vx,vy,vz,life}=b;const dt=1/60;
  for(let t=0;t<3;t+=dt){
    const oldY=y;life-=dt;vy-=16*dt;x+=vx*dt;y+=vy*dt;z+=vz*dt;
    if(y<.22||stage.platforms.some(p=>supported(x,z,p)&&vy<0&&oldY>=p.top+.22&&y<=p.top+.22)||life<=0)return {x,z,y:Math.max(0,y),time:t};
  }
  return {x,z,y:Math.max(0,y),time:3};
}
export function jump(p,input={}){
  if(p.hp<=0||p.grabbedBy!==null||p.grabbedTarget!==null||p.carrying||p.skillTime>0)return;
  if(p.knocked>0){
    if(!p.grounded&&p.vy<0&&p.poisonTime<=0&&p.virusTime<=0&&p.slowTime<=0){
      const x=Number.isFinite(input.x)?input.x:0,z=Number.isFinite(input.z)?input.z:0,len=Math.hypot(x,z);
      p.recoveryBuffer=.16;p.recoveryDirection=len>0?{x:x/len,z:z/len}:{x:p.fx,z:p.fz};
    }
    return;
  }
  if(p.stun>0)return;p.jumpBuffer=.14;
}
// Nearest fighter still in the match; a duel always resolves to the other player.
function nearestFoe(w,p,maxY=Infinity){let best=null,bd=Infinity;for(const q of w.fighters){if(q===p||q.team===p.team||q.hp<=0||q.respawnTimer>0||Math.abs(p.y-q.y)>=maxY)continue;const d=distance(p,q);if(d<bd){bd=d;best=q;}}return best;}
// A CPU that was just hurt turns on whoever hit it, so ranged fighters cannot pick off a melee brawl for free.
// Otherwise it picks the closest foe, leaning toward healthy ones so nobody wins by dodging the crowd, and keeps that pick for a moment.
function aiTarget(w,p){
  const ok=f=>f&&f!==p&&f.team!==p.team&&f.hp>0&&f.respawnTimer<=0;
  const a=p.aggro!==undefined&&w.tick-(p.aggroTick||0)<420?w.fighters.find(f=>f.id===p.aggro):null;if(ok(a))return a;
  const kept=p.aiFoe!==undefined&&w.tick<p.aiFoeUntil?w.fighters.find(f=>f.id===p.aiFoe):null;if(ok(kept))return kept;
  let best=null,bs=Infinity;for(const f of w.fighters){if(!ok(f))continue;const sc=distance(p,f)-f.hp*.12;if(sc<bs){bs=sc;best=f;}}
  if(best){p.aiFoe=best.id;p.aiFoeUntil=w.tick+150+p.id*13;}return best;
}
function faceTarget(p,q){const d=distance(p,q);if(d>0.001){p.fx=(q.x-p.x)/d;p.fz=(q.z-p.z)/d;}}
// Aim only at a nearby, reachable rival; a closer container remains a valid target.
function assistAim(w,p,range=4.2){
  if(p.aimAssist===false)return;
  const q=nearestFoe(w,p,2.5);
  if(!q||distance(p,q)>range)return;
  const nearerCrate=w.crates.some(c=>c.hp>0&&!c.falling&&c.heldBy===null&&Math.abs(c.y-p.y)<1.4&&distance(p,c)<Math.min(2.5,distance(p,q)));
  if(!nearerCrate)faceTarget(p,q);
}
export function toggleAim(p){p.aimAssist=p.aimAssist===false;}
function gainEnergy(w,p,amount){if(!p||!Number.isFinite(p.energy)||!Number.isFinite(p.energyMax))return;const before=p.energy;p.energy=Math.min(p.energyMax,p.energy+amount);if(p.energy!==before)emit(w,'energy',{id:p.id,energy:p.energy,max:p.energyMax});}
function cancelRecovery(p){p.recoveryBuffer=0;p.recoveryDirection=null;p.recoveryTime=0;p.dodgeTime=0;}
function hit(w,p,q,damage,force,options={}){
  if(q.hp<=0||q.invuln>0||q.respawnProtection>0)return false;
  // Teammates are immune to each other's attacks, bombs and specials (but not their own).
  const striker=p.owner===undefined?p:(p.owner>=0?w.fighters[p.owner]:null);
  if(striker&&striker!==q&&striker.team!==undefined&&striker.team===q.team)return false;
  const melee=['light','dash','air','heavy','upper','slam','shieldBash','rush'].includes(options.kind);
  const separation=distance(p,q),front=separation<.3||((p.x-q.x)*q.fx+(p.z-q.z)*q.fz)/separation>=.25;
  const guarded=q.blocking&&(!melee||front);
  if(guarded&&q.parryWindow>0&&!options.grab&&!options.guardBreak){w.hitStop=Math.max(w.hitStop,.035);p.stun=.48;p.vx*=-.35;p.vz*=-.35;q.invuln=.18;emit(w,'parry',{x:q.x,y:q.y+1.4,z:q.z,id:q.id});return true;}
  if(guarded&&!options.guardBreak&&!options.grab){const reducedDamage=Math.max(1,Math.round(damage*.25));q.hp=Math.max(0,q.hp-reducedDamage);q.hurtTime=.16;q.hurtKind='guard';w.hitStop=Math.max(w.hitStop,.025);q.vx*=.2;q.vz*=.2;q.stun=.04;q.invuln=.08;emit(w,'guard',{x:q.x,y:q.y+1.4,z:q.z,id:q.id,damage:reducedDamage});emit(w,'impact',{x:q.x,y:q.y+1.1,z:q.z,force:1,kind:'guard'});emit(w,'hit',{x:q.x,y:q.y+1.2,z:q.z,damage:reducedDamage,id:q.id,guarded:true});return true;}
  const d=Math.max(.01,distance(p,q));const fx=d>.02?(q.x-p.x)/d:p.fx||1,fz=d>.02?(q.z-p.z)/d:p.fz||0;
  const brokeGuard=Boolean(guarded&&options.guardBreak);if(brokeGuard)emit(w,'guardBreak',{x:q.x,y:q.y+1.4,z:q.z,id:q.id});
  if(q.blocking&&melee&&!front)emit(w,'flank',{x:q.x,y:q.y+1.4,z:q.z,id:q.id});
  q.blocking=false;
  dropHeld(w,q);
  cancelRecovery(q);
  cancelSkill(w,q);
  if(q.grabbedBy!==null){const holder=w.fighters.find(f=>f.id===q.grabbedBy);if(holder)releaseGrab(w,holder,q,false,true);}
  q.attackTime=0;q.skillTime=0;q.hitDone=true;q.jumpBuffer=0;q.comboQueued=false;q.running=false;
  const wasAirborne=!q.grounded&&q.y>.3;
  // Juggle damage scaling keeps a full launcher combo around a third of the bar.
  if(wasAirborne&&(q.juggle||0)>0&&!options.grab)damage*=Math.max(.45,1-.17*q.juggle);
  q.hp=Math.max(0,q.hp-damage);q.hurtTime=.45;q.hurtKind=options.kind||'melee';if(options.kind==='bomb'||options.kind==='flameKick')q.burnTime=1.25;q.vx=fx*force;q.vz=fz*force;q.vy=force*.45;q.grounded=false;q.support=null;q.stun=brokeGuard?.52:.28;q.invuln=.25;
  w.hitStop=Math.max(w.hitStop,options.grab?.08:force>=8?.075:.055);emit(w,'impact',{x:q.x,y:q.y+1.1,z:q.z,force,kind:options.kind||'melee'});
  if(options.grab){q.grabbed=2.2;q.grabbedBy=p.id;q.grabEscape=0;q.knocked=0;q.stun=0;q.vx=0;q.vz=0;q.vy=0;p.grabbedTarget=q.id;p.grabHoldTime=2.2;p.grabThrow='forward';}
  else if(force>=8||damage>=18){q.knocked=.82;emit(w,'knockdown',{x:q.x,y:q.y+1.1,z:q.z,id:q.id});}
  // Launcher and air juggle: an upper pops the target straight up, air/light hits keep it
  // floating near the attacker, and the third air hit spikes it into a ground bounce.
  if(!options.grab&&options.kind==='upper'){q.vy=11;q.vx=fx*.7;q.vz=fz*.7;q.knocked=Math.max(q.knocked,.9);q.juggle=1;emit(w,'launch',{id:q.id,x:q.x,y:q.y+1,z:q.z});}
  else if(!options.grab&&wasAirborne&&(q.juggle||0)>0&&q.juggle<5&&['air','light'].includes(options.kind)){
    q.juggle++;const finisher=options.kind==='air'&&p.airCombo>=2;q.knocked=Math.max(q.knocked,.7);q.invuln=.12;
    if(finisher){q.vy=-14;q.vx=fx*3;q.vz=fz*3;q.spiked=true;emit(w,'spike',{id:q.id,x:q.x,y:q.y+1,z:q.z});}
    else{q.vy=5.2;q.vx=fx*.35;q.vz=fz*.35;}
    if(p.owner===undefined&&!p.grounded)p.vy=Math.max(p.vy,finisher?2:4.6);
  }
  const attacker=p.owner===undefined?p:w.fighters.find(f=>f.id===p.owner);if(attacker&&attacker!==q){gainEnergy(w,attacker,.22);gainEnergy(w,q,.08);q.aggro=attacker.id;q.aggroTick=w.tick;}
  if(p.attackType&&['light','dash','air'].includes(p.attackType))p.attackConnected=true;
  emit(w,'hit',{x:q.x,y:q.y+1.2,z:q.z,damage,id:q.id});return true;
}
function beginAttack(w,p,type){
  if(w.ended||w.intro>0||w.roundOver>0||p.hp<=0||p.knocked>0||p.stun>0||p.blocking||p.attackCD>0||p.skillTime>0)return;
  assistAim(w,p,type==='shot'?9:4.2);
  const actual=!p.grounded&&type==='heavy'?'slam':!p.grounded&&['light','rush','shot'].includes(type)?'air':type;const chained=p.comboWindow>0&&p.attackType==='air';p.attackType=actual;p.combo=actual==='light'?(p.comboWindow>0?(p.combo+1)%3:0):0;p.airCombo=actual==='air'?(chained?Math.min(2,(p.airCombo||0)+1):0):0;p.comboWindow=actual==='light'?.9:actual==='air'?.55:0;
  p.attackTime=['slam','heavy','upper','shieldBash'].includes(actual)?.5:actual==='grab'?.42:actual==='rush'?.4:actual==='dash'?.38:actual==='shot'?.32:.34;
  p.attackCD=actual==='slam'?.55:actual==='grab'?.65:['upper','shieldBash'].includes(actual)?.5:actual==='shot'?.45:actual==='rush'?.42:p.char==='swordsman'?.24:p.char==='brawler'?.22:p.char==='cook'?.26:.3;
  p.hitDone=false;p.attackConnected=false;if(actual==='slam')p.vy=-14;if(actual==='upper')p.vy=5.5;
  const lunge=(actual==='dash'?12:actual==='rush'?9.5:actual==='shieldBash'?7:actual==='heavy'?characterOf(p).heavy?.lunge||0:0)*(p.running?1.25:1);if(lunge){p.vx=p.fx*lunge;p.vz=p.fz*lunge;}p.running=false;
  emit(w,['light','air','slam','dash','upper','rush'].includes(actual)?'slash':actual,{id:p.id,char:p.char,x:p.x,y:p.y+1.1,z:p.z,fx:p.fx,fz:p.fz,combo:p.combo,airCombo:p.airCombo,attackType:actual,weapon:p.weapon});
}
function carriedObject(w,p){if(!p.carrying)return null;return p.carrying.kind==='crate'?w.crates.find(c=>c.id===p.carrying.id):w.props.find(c=>c.id===p.carrying.id);}
function throwCarried(w,p,high=false){const held=carriedObject(w,p);if(!held){p.carrying=null;return false;}let prop=held;if(p.carrying.kind==='crate'){held.hp=0;held.heldBy=null;held.respawnTick=w.tick+Math.round((10+Math.random()*7)/STEP);prop={id:w.nextProp++,kind:held.kind,owner:p.id,x:p.x+p.fx*.8,y:p.y+2,z:p.z+p.fz*.8,vx:0,vy:0,vz:0,life:3,heldBy:null};w.props.push(prop);}else prop.heldBy=null;prop.owner=p.id;prop.life=3;prop.x=p.x+p.fx*.8;prop.y=p.y+2;prop.z=p.z+p.fz*.8;prop.hitIds=[];prop.vx=p.fx*(high?4.5:10);prop.vz=p.fz*(high?4.5:10);prop.vy=high?12:5;p.carrying=null;p.tossTime=.32;p.tossTwo=true;emit(w,'propThrow',{id:p.id,kind:prop.kind,x:prop.x,y:prop.y,z:prop.z,high});return true;}
function releaseGrab(w,holder,target,high=false,escaped=false){
  if(!holder||!target)return;
  holder.grabbedTarget=null;holder.grabHoldTime=0;
  target.grabbed=0;target.grabbedBy=null;target.grabEscape=0;
  target.knocked=escaped?.2:.95;target.stun=escaped?0:.25;target.grounded=false;
  const length=Math.hypot(holder.fx,holder.fz),fx=length>.001?holder.fx/length:1,fz=length>.001?holder.fz/length:0;
  const speed=escaped?-4:high?4.5:10;
  target.vx=fx*speed;target.vz=fz*speed;target.vy=escaped?3:high?12:7.8;
  target.thrownTime=escaped?0:.65;
  if(!escaped){holder.throwTime=.3;holder.throwHigh=high;holder.attackTime=0;holder.attackCD=Math.max(holder.attackCD,.3);}
  emit(w,escaped?'grabEscape':'throwHit',{x:target.x,y:target.y+1.1,z:target.z,id:target.id,holder:holder.id,high});
}
// Shared cleanup for being hit, losing a life, or an invalid holder/target pair.
function dropHeld(w,p){
  if(p.grabbedTarget!==null){const target=w.fighters.find(q=>q.id===p.grabbedTarget);if(target)releaseGrab(w,p,target,false,true);else{p.grabbedTarget=null;p.grabHoldTime=0;}}
  const held=carriedObject(w,p);
  if(held){held.heldBy=null;held.x=clamp(p.x,-14,14);held.z=clamp(p.z,-8,8);held.y=p.y+1;
    if(p.carrying.kind==='crate'){held.falling=true;held.dropSpeed=0;}else{held.vx=0;held.vz=0;held.vy=0;held.life=3;}
    emit(w,'dropHeld',{id:p.id,x:held.x,y:held.y,z:held.z});}
  p.carrying=null;
}
function unableToAct(w,p){return w.ended||w.intro>0||w.roundOver>0||p.hp<=0||p.respawnTimer>0||p.knocked>0||p.stun>0||p.skillTime>0;}
function throwGrabbed(w,p,high=false){const target=w.fighters.find(q=>q.id===p.grabbedTarget);if(!target)return false;releaseGrab(w,p,target,high);return true;}
function struggle(w,p){if(p.grabbedBy===null)return false;p.grabEscape=(p.grabEscape||0)+1;if(p.grabEscape>=3){const holder=w.fighters.find(f=>f.id===p.grabbedBy);releaseGrab(w,holder,p,false,true);}return true;}
export function attack(w,p,input={}){if(p.grabbedBy!==null){struggle(w,p);return;}if(p.grabbedTarget!==null){throwGrabbed(w,p,false);return;}if(p.carrying){throwCarried(w,p,false);return;}if(p.comboWindow>0&&['light','dash','air'].includes(p.attackType)){p.comboQueued=true;p.comboInput={...input};return;}const moving=Math.hypot(input.x||0,input.z||0)>.5;beginAttack(w,p,p.grounded&&moving?characterOf(p).moveAttack:'light');}
export function heavy(w,p,input={}){if(p.grabbedBy!==null){struggle(w,p);return;}if(p.grabbedTarget!==null){throwGrabbed(w,p,true);return;}if(p.carrying){throwCarried(w,p,true);return;}beginAttack(w,p,p.grounded&&(input.z||0)<-.5?'upper':p.char==='guardian'&&Math.hypot(input.x||0,input.z||0)>.5?'shieldBash':'heavy');}
export function grab(w,p,input={}){
  if(w.ended||p.hp<=0||p.respawnTimer>0)return;
  if(p.grabbedBy!==null){struggle(w,p);return;}
  if(unableToAct(w,p))return;
  if(p.grabbedTarget!==null){throwGrabbed(w,p,(input.z||0)<-.2);return;}
  if(p.carrying){throwCarried(w,p,(input.z||0)<-.2);return;}
  if(p.blocking||p.attackTime>0||p.attackCD>0)return;
  const prop=w.props.find(o=>o.heldBy===null&&distance(p,o)<1.6&&Math.abs(p.y+1-o.y)<1.5);
  if(prop){prop.heldBy=p.id;prop.vx=prop.vy=prop.vz=0;p.carrying={kind:'prop',id:prop.id};emit(w,'lift',{id:p.id,kind:prop.kind,x:p.x,y:p.y+2,z:p.z});return;}
  const c=w.crates.find(c=>c.hp>0&&!c.falling&&c.heldBy===null&&distance(p,c)<1.65&&Math.abs(p.y-c.y)<1.4);
  if(c){c.heldBy=p.id;p.carrying={kind:'crate',id:c.id};emit(w,'lift',{id:p.id,kind:c.kind,x:p.x,y:p.y+2,z:p.z});return;}
  p.grabThrow=(input.z||0)<-.5?'high':'forward';beginAttack(w,p,'grab');
}
export function bomb(w,p){
  if(unableToAct(w,p)||p.grabbedBy!==null||p.grabbedTarget!==null||p.carrying||!p.item)return;
  if(p.item==='meat'){p.hp=Math.min(100,p.hp+20);emit(w,'heal',{id:p.id,x:p.x,y:p.y+1,z:p.z});p.item=null;return;}
  if(p.item==='beer'){p.attackBoost=1.55;p.attackBoostTime=8;emit(w,'power',{id:p.id,item:p.item,x:p.x,y:p.y+1,z:p.z});p.item=null;return;}
  if(p.item==='sword'){p.attackBoost=1.35;p.attackBoostTime=10;p.weapon='sword';emit(w,'ready',{id:p.id,item:p.item});p.item=null;return;}
  const kind=p.item;p.item=null;const bottle=kind==='poison'||kind==='virus'||kind==='slow',speed=kind==='slow'?6.2:5.8,arc=kind==='slow'?5.2:4.6;w.bombs.push({id:w.nextBomb++,owner:p.id,kind,x:p.x+p.fx*.8,y:p.y+1.3,z:p.z+p.fz*.8,vx:p.fx*(bottle?speed:7.5),vy:bottle?arc:6.5,vz:p.fz*(bottle?speed:7.5),life:bottle?1.05:1.2});p.tossTime=.32;p.tossTwo=false;emit(w,'throw',{id:p.id,kind});
}
// Each roster member keeps the shared 3-level gauge but owns a different area shape.
function skillSpec(w,p,level){
  const kind=characterOf(p).skill,l=level-1;
  if(kind==='shieldQuake')return {radius:4.1+l*.8,damage:18+l*10,force:15+l*2,height:1.2};
  if(kind==='fistStorm')return {radius:2.4+l*.5,damage:24+l*10,force:12+l*2,height:2,ahead:1.6};
  if(kind==='barrage')return {radius:2+l*.5,damage:15+l*9,force:9+l*2,height:3,targeted:true};
  if(kind==='flameKick')return {radius:2.5+l*.5,damage:18+l*9,force:12+l*2,height:2,ahead:1.8};
  if(kind==='thunder')return {radius:2.3+l*.45,damage:11+l*7,force:8+l*2,height:4,targeted:true};
  return {radius:3.4+l*.8,damage:22+l*10,force:10+l*2,height:2.5};
}
function skillCenter(w,p,spec){
  if(spec.ahead)return {cx:p.x+p.fx*spec.ahead,cz:p.z+p.fz*spec.ahead};
  if(spec.targeted){const q=nearestFoe(w,p);return q&&distance(p,q)<10?{cx:q.x,cz:q.z}:{cx:clamp(p.x+p.fx*4,-14,14),cz:clamp(p.z+p.fz*4,-8,8)};}
  return {cx:p.x,cz:p.z};
}
export function skill(w,p,requestedLevel=1){
  const level=clamp(Math.floor(requestedLevel)||1,1,3);if(w.ended||w.intro>0||w.roundOver>0||p.hp<=0||p.knocked>0||p.stun>0||p.grabbedBy!==null||p.grabbedTarget!==null||p.carrying||p.skillCD>0||p.energy<level)return;
  assistAim(w,p,6);
  const kind=characterOf(p).skill,spec=skillSpec(w,p,level),windup=(spec.targeted?.35:.25)+level*.15;
  p.pendingSkill={level,radius:spec.radius,damage:spec.damage,force:spec.force,height:spec.height,kind,windup,...skillCenter(w,p,spec)};
  p.energy-=level;p.skillLevel=level;p.skillCD=(kind==='shieldQuake'?1.45:1.1)+level*.25;
  p.skillWindup=windup;p.skillTime=windup+.4;p.invuln=0;p.dodgeTime=0;p.vx=0;p.vz=0;
  p.attackTime=0;p.comboWindow=0;p.comboQueued=false;p.jumpBuffer=0;p.blocking=false;p.parryWindow=0;
  emit(w,'energy',{id:p.id,energy:p.energy,max:p.energyMax});
  emit(w,'skillCharge',{id:p.id,char:p.char,x:p.x,y:p.y+.1,z:p.z,...p.pendingSkill});
}
function cancelSkill(w,p){
  if(!p.pendingSkill)return;
  p.pendingSkill=null;p.skillWindup=0;p.skillTime=0;
  emit(w,'skillCancel',{id:p.id,x:p.x,y:p.y+1,z:p.z});
}
function releaseSkill(w,p){
  const {level,radius,damage,force,kind,height}=p.pendingSkill,self=kind==='whirlwind'||kind==='shieldQuake';
  const center=self?{x:p.x,z:p.z}:{x:p.pendingSkill.cx,z:p.pendingSkill.cz},from=self?p:{...center,owner:p.id,fx:p.fx,fz:p.fz};
  p.pendingSkill=null;p.skillWindup=0;p.skillTime=.4;p.invuln=.18;
  emit(w,'skill',{id:p.id,char:p.char,x:center.x,y:p.y+.7,z:center.z,casterX:p.x,casterZ:p.z,level,radius,kind});
  for(const q of w.fighters)if(q!==p&&distance(center,q)<radius&&Math.abs(p.y-q.y)<height){const blocked=q.blocking;if(hit(w,from,q,damage,force,{guardBreak:level===3,kind})&&kind==='thunder'&&(!blocked||level===3)){q.slowTime=Math.max(q.slowTime,2.2);emit(w,'slow',{id:q.id,x:q.x,y:q.y+1,z:q.z});}}
  for(const c of w.crates)if(c.hp>0&&distance(center,c)<radius&&Math.abs(p.y-c.y)<2.5)breakCrate(w,c,2);
  for(const pc of w.pieces)if(pc.state==='standing'&&distance(center,pc)<radius+pc.r&&p.y<pc.h)hurtPiece(w,pc,damage*1.3,{owner:p.id,x:center.x,z:center.z});
}
export function sprint(p){if(p.hp<=0||!p.grounded||p.knocked>0||p.stun>0||p.blocking||p.carrying||p.grabbedTarget!==null||p.grabbedBy!==null||p.skillTime>0)return;p.running=true;}
export function dodge(p){if(p.dodgeCD>0||p.knocked>0||p.stun>0||p.hp<=0||p.grabbedBy!==null||p.grabbedTarget!==null||p.carrying||p.skillTime>0||p.poisonTime>0||p.virusTime>0||p.slowTime>0)return;const burst=p.terrain==='quicksand'?7:12;p.dodgeCD=1.2;p.dodgeTime=.18;p.invuln=.24;p.vx=p.fx*burst;p.vz=p.fz*burst;}
const LOOT={barrel:['bomb','bomb','poison','virus','slow'],crate:['meat','meat','beer','bomb'],chest:['sword','beer','meat','sword']};
// Loot lands on whatever floor is under the break: a deck top if the container was up there.
function floorAt(stage,x,z,y){let top=0;for(const d of stage.platforms)if(supported(x,z,d,-.1)&&d.top<=y+.5&&d.top>top)top=d.top;return top;}
// Powder keg: no loot, it just goes off. Neighbouring crates and kegs are caught in the blast, so they chain.
function kegBlast(w,x,y,z){
  const src={owner:-1,x,y,z,kind:'bomb'};emit(w,'explosion',{x,y:y+.4,z,kind:'keg'});
  for(const p of w.fighters)if(p.hp>0&&distance(p,src)<3&&Math.abs(p.y+1-y)<2.8)hit(w,src,p,18,10,{kind:'bomb'});
  for(const c of w.crates)if(c.hp>0&&!c.falling&&c.heldBy===null&&distance(c,src)<3.2)breakCrate(w,c,2);
  for(const pc of w.pieces)if(pc.state==='standing'&&distance(pc,src)<3+pc.r)hurtPiece(w,pc,40,{owner:-1,x,z});
}
function dropLoot(w,kind,x,z,fromY=0){
  if(kind==='keg'){kegBlast(w,x,fromY,z);return null;}
const types=LOOT[kind]||LOOT.crate,item=types[Math.floor(Math.random()*types.length)],y=floorAt(stageOf(w.stage),x,z,fromY);emit(w,'break',{x,y:y+.7,z,item,kind});w.pickups.push({type:item,x,y,z,life:24});return item;}
function breakCrate(w,c,n){if(c.hp<=0||c.falling||c.heldBy!==null)return;c.hp=Math.max(0,c.hp-n);if(c.hp<=0){dropLoot(w,c.kind,c.x,c.z,c.y);c.respawnTick=w.tick+Math.round((10+Math.random()*7)/STEP);}}
function updateCrates(w,dt){for(const c of w.crates){if(c.heldBy!==null){const p=w.fighters.find(p=>p.id===c.heldBy);if(p){c.x=p.x+p.fx*.3;c.z=p.z+p.fz*.3;c.y=p.y+2.15;}continue;}if(c.hp<=0&&!c.falling&&c.respawnTick&&w.tick>=c.respawnTick){const open=CRATE_SPAWNS.filter(([x,z])=>!stageOf(w.stage).platforms.some(d=>supported(x,z,d,.6))),[x,z]=c.home?[c.home.x,c.home.z]:(open[Math.floor(Math.random()*open.length)]||[0,5]);c.x=x;c.z=z;c.y=(c.floor??.48)+8.5;if(!c.home)c.kind=['barrel','crate','chest'][Math.floor(Math.random()*3)];c.hp=1;c.falling=true;c.dropSpeed=0;emit(w,'crateDrop',{id:c.id,x,z,kind:c.kind});}if(c.falling){c.dropSpeed=(c.dropSpeed||0)+24*dt;c.y-=c.dropSpeed*dt;if(c.y<=(c.floor??.48)){c.y=c.floor??.48;c.falling=false;emit(w,'crateLand',{id:c.id,x:c.x,y:c.y,z:c.z,kind:c.kind});}}}}
// CPU decisions fire on their own jittered timers (from a seeded stream) rather than a shared global beat,
// so no seat gets to act first in every exchange.
function rnd(w){w.rngState=(Math.imul(w.rngState||12345,1664525)+1013904223)>>>0;return w.rngState/4294967296;}
function due(w,p,period){
  p.aiClock??={};const k=period;
  if(p.aiClock[k]===undefined)p.aiClock[k]=w.tick+Math.floor(rnd(w)*period);
  if(w.tick<p.aiClock[k])return false;
  p.aiClock[k]=w.tick+Math.round(period*(.6+rnd(w)*.8));return true;
}
// ---- CPU vertical navigation: reach a deck by ladder or by (double) jumping at its edge ----
function deckUnder(stage,x,z,y){let best=null;for(const d of stage.platforms)if(supported(x,z,d,-.1)&&d.top<=y+.5&&(!best||d.top>best.top))best=d;return best;}
function edgeOf(d,x,z){return {x:clamp(x,d.x-d.w/2,d.x+d.w/2),z:clamp(z,d.z-d.d/2,d.z+d.d/2)};}
const onLadder=p=>p.climbing||String(p.support).startsWith('ladder');
// A deck too tall to jump onto directly is reached through a lower stepping deck (ground -> ziggurat tier -> top tier).
const STEP_UP=2.9;
function routeDeck(stage,p,D){
  if(D.top-p.y<=STEP_UP)return D;
  let best=D,bs=Infinity;
  for(const E of stage.platforms){
    if(E===D||E.top<=p.y+.4||E.top-p.y>STEP_UP||D.top-E.top>STEP_UP)continue;
    const e=edgeOf(E,p.x,p.z),sc=Math.hypot(e.x-p.x,e.z-p.z)+Math.hypot(E.x-D.x,E.z-D.z)*.5;
    if(sc<bs){bs=sc;best=E;}
  }
  return best;
}
// Returns a movement input toward deck D (and presses jump when a jump is the way up), or null when already there.
function climbTo(w,p,goal){
  const stage=stageOf(w.stage);stage._ladders??=laddersOf(stage);
  const D=routeDeck(stage,p,goal);
  if(p.y>=goal.top-.25&&supported(p.x,p.z,goal,.1))return null;
  const ladders=stage._ladders.filter(l=>l.deck===D.id);
  // Already on a ladder: finish a climb that began at its foot when it leads toward the goal; a CPU that stepped onto it from the deck rides it back down.
  if(!onLadder(p))p.aiLadderFrom=undefined;
  else{
    p.aiLadderFrom??=p.y;
    const l=stage._ladders.filter(l=>Math.hypot(l.x-p.x,l.z-p.z)<2).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
    if(l){const fromFoot=p.aiLadderFrom<l.top*.5,up=l.deck===D.id||l.deck===goal.id||(fromFoot&&D.top>l.top-.3);return up?{x:l.dx,z:l.dz}:{x:-l.dx,z:-l.dz};}
  }
  // Ladders for high decks (half the CPUs' choice, so they do not all take the same route); otherwise jump at the nearest edge.
  if(ladders.length&&D.top-p.y>2.4&&p.grounded&&p.id%2===0){
    const l=ladders.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0],dx=l.x-p.x,dz=l.z-p.z,d=Math.hypot(dx,dz);
    if(d>.5)return {x:dx/d,z:dz/d};return {x:l.dx,z:l.dz};
  }
  const e=edgeOf(D,p.x,p.z),dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz),rise=D.top-p.y;
  if(rise>.3){
    if(p.grounded&&d<1.5)jump(p);
    else if(!p.grounded&&p.vy<3&&p.jumps<2&&p.y<D.top-.2&&d<2.2)jump(p);
  }
  // Over the edge, aim at the deck's middle so the landing is on it.
  const cx=D.x-p.x,cz=D.z-p.z,cd=Math.hypot(cx,cz)||1;
  if(d<1.8)return {x:cx/cd,z:cz/cd};
  return {x:dx/(d||1),z:dz/(d||1)};
}
// The deck a CPU should run to when a wave is coming: the nearest one it can get onto.
function refuge(w,p){const stage=stageOf(w.stage);let best=null,bd=Infinity;for(const d of stage.platforms){if(d.top<1||d.top>4)continue;const e=edgeOf(d,p.x,p.z),dd=Math.hypot(e.x-p.x,e.z-p.z);if(dd<bd){bd=dd;best=d;}}return bd<11?best:null;}
function ai(w,p,q){
  if(w.training)return {x:0,z:0};
  // Each CPU keeps its own rhythm; identical timers would let the first fighter in the update order always win the trade.
  const beat=w.tick+p.id*41;
  const d=distance(p,q);faceTarget(p,q);
  const isRanged=characterOf(p).moveAttack==='shot';
  const hazards=[...w.clouds.filter(c=>c.life>0&&Math.abs(p.y+1-c.y)<2.8),
    ...w.bombs.filter(b=>b.kind==='bomb'&&b.life<.65&&Math.abs(p.y+1-b.y)<2.8).map(b=>({...b,radius:3})),
    ...w.cannonballs.filter(c=>c.kind==='rock').map(c=>({x:c.x,z:c.z,radius:1.8})),
    ...(stageOf(w.stage).vents||[]).filter(v=>ventState(v,w.tick).phase!=='idle'&&p.y<1.4).map(v=>({x:v.x,z:v.z,radius:v.r})),
    ...w.pieces.filter(pc=>pc.state==='falling').flatMap(pc=>pc.fall==='burst'?[{x:pc.x,z:pc.z,radius:pc.length}]:[.25,.55,.85].map(k=>({x:pc.x+pc.dir.x*pc.length*k,z:pc.z+pc.dir.z*pc.length*k,radius:1.9})))];
  const danger=hazards.some(h=>distance(p,h)<h.radius+.6);
  if(!danger)p.aiDangerSince=null;
  else{
    p.running=false;
    p.aiDangerSince??=w.tick;
    if(w.tick-p.aiDangerSince>=22){
      // Evaluate reachable directions, so an escape near the rail does not push into it.
      let best=null;
      for(let i=0;i<8;i++){
        const angle=i*Math.PI/4,x=Math.cos(angle),z=Math.sin(angle);
        const target={x:clamp(p.x+x*2,-14.3,14.3),z:clamp(p.z+z*2,-8.3,8.3)};
        const score=Math.min(...hazards.map(h=>distance(target,h)-h.radius))-.01*distance(target,q);
        if(!best||score>best.score)best={x,z,score};
      }
      return {x:best.x,z:best.z};
    }
  }
  // Wade out of quicksand unless the opponent is already in reach.
  const sand=p.terrain==='quicksand'?zoneAt(stageOf(w.stage),p.x,p.z):null;
  if(sand&&d>2.4){const dx=p.x-sand.x,dz=p.z-sand.z,l=Math.hypot(dx,dz)||1;return {x:dx/l,z:dz/l};}
  const stageDef=stageOf(w.stage);
  // Stage knowledge a human would use. Hot spring: retreat there to heal when hurt and nobody is on top of us.
  const spa=stageDef.zones.find(z=>z.kind==='hotspring');
  if(spa&&p.y<.5&&p.grounded&&p.attackTime<=0&&!p.blocking){
    const inSpa=p.terrain==='hotspring',dx=spa.x-p.x,dz=spa.z-p.z,sd=Math.hypot(dx,dz)||1;
    const beatingHim=q.hp<30&&q.hp<p.hp;
    if(p.hp<(inSpa?82:42)&&d>(inSpa?1.8:2.6)&&!beatingHim&&!(q.pendingSkill)){
      if(sd>spa.r*.45)return {x:dx/sd,z:dz/sd,running:p.hp<30&&sd>5};
      return {x:0,z:0};
    }
  }
  // Flame vents: keep clear while they glow, and do not chase a rival into one.
  const vents=(stageDef.vents||[]).filter(v=>ventState(v,w.tick).phase!=='idle');
  for(const v of vents){
    const dv=Math.hypot(p.x-v.x,p.z-v.z);
    if(p.y<1.4&&dv<v.r+.35){const l=dv||1;return {x:(p.x-v.x)/l||1,z:(p.z-v.z)/l};}
    if(q.y<1.4&&Math.hypot(q.x-v.x,q.z-v.z)<v.r+.4&&d>2.4&&d<7)return {x:0,z:0};
  }
  // Powder kegs: shoot or bomb one when the rival stands next to it and we are clear of the blast; never melee beside one.
  const kegs=w.crates.filter(k=>k.kind==='keg'&&k.hp>0&&!k.falling&&k.heldBy===null&&k.y<1);
  for(const k of kegs){
    const ownD=distance(p,k),foeD=distance(q,k);
    if(foeD<2.8&&ownD>3.5&&ownD<10&&Math.abs(p.y-k.y)<1.4&&Math.abs(q.y-k.y)<1.4){
      faceTarget(p,k);
      if(isRanged&&p.grounded&&due(w,p,40)){attack(w,p,{x:p.fx,z:p.fz});}
      else if(p.item&&p.item!=='meat'&&p.item!=='beer'&&p.item!=='sword'&&due(w,p,40))bomb(w,p);
    }
    if(ownD<2.2&&foeD>=2.8&&p.grounded&&d>1.8){const l=ownD||1;return {x:(p.x-k.x)/l,z:(p.z-k.z)/l};}
  }
  // A wound-up cannon or snowball has told us its lane: step out of it (after a human-like beat) or hop the snowball as it arrives.
  const lane=w.cannonballs.find(c=>(c.kind==='cannon'||c.kind==='snowball')&&Math.abs(c.z-p.z)<1.5&&p.y<1.5&&(c.delay>0?c.delay<(c.kind==='cannon'?CANNON_WARN:SNOWBALL_WARN)-.4:false));
  if(lane&&!p.blocking){const away=p.z>=lane.z?1:-1,tz=clamp(lane.z+away*2.4,-8.2,8.2);if(Math.abs(tz-p.z)>.3&&Math.abs(tz)<8.3)return {x:0,z:Math.sign(tz-p.z)};}
  // Roll or leap over a ground-level snowball heading our way.
  const ball=w.cannonballs.find(c=>c.kind==='snowball'&&Math.abs(c.z-p.z)<1.1&&Math.abs(c.x-p.x)<3.2&&(p.x-c.x)*c.vx>0);
  if(ball&&p.grounded&&p.y<.3)jump(p);
  // Tides and avalanches only reach the floor: climb to the nearest deck and wait there.
  if(stageDef.waveKind!=='sandstorm'&&(w.wavePending||w.waveTime>0)){
    if(p.y<.7){const D=refuge(w,p);if(D){const mv=climbTo(w,p,D);if(mv)return mv;}}
    else if(d>2.6)return {x:0,z:0};
  }
  // React to the same visible charge state as a human, after a short reaction delay.
  if(q.pendingSkill&&q.pendingSkill.windup-q.skillWindup>.18&&distance(p,{x:q.pendingSkill.cx??q.x,z:q.pendingSkill.cz??q.z})<q.pendingSkill.radius+.5){
    if(q.pendingSkill.kind==='shieldQuake'&&p.grounded)jump(p);
    const cx=q.pendingSkill.cx??q.x,cz=q.pendingSkill.cz??q.z,away=Math.max(.01,Math.hypot(p.x-cx,p.z-cz));
    return away>.05?{x:(p.x-cx)/away,z:(p.z-cz)/away}:{x:-p.fx,z:-p.fz};
  }
  // Raise the guard against some incoming shots (not all: a CPU should still be worth shooting).
  const incoming=w.shots.find(sh=>sh.owner!==p.id&&(sh.id+p.id)%5<2&&Math.abs(sh.y-(p.y+1.1))<1.2&&distance(sh,p)<5.5&&distance(sh,p)>1.2&&((p.x-sh.x)*sh.vx+(p.z-sh.z)*sh.vz)>0);
  if(incoming&&p.grounded&&p.attackTime<=0)return {x:0,z:0,guard:true};
  // Decisions use visible fighters/items only, and share the player's action rules.
  if(p.grabbedTarget!==null){if(p.grabHoldTime<1.6)attack(w,p);return {x:p.fx*.5,z:p.fz*.5};}
  if(p.item==='sword'||p.item==='beer'||(p.item==='meat'&&p.hp<80))bomb(w,p);
  if(d>3||p.hp<45){
    const loot=w.pickups.filter(h=>h.life>0&&distance(p,h)<7&&
      (h.type==='meat'?p.hp<80:h.type==='beer'||h.type==='sword'||!p.item))
      .sort((a,b)=>(distance(p,a)-(a.type==='meat'&&p.hp<45?3:0))-(distance(p,b)-(b.type==='meat'&&p.hp<45?3:0)))[0];
    if(loot&&Math.abs(p.y-(loot.y||0))<1.2){faceTarget(p,loot);return {x:p.fx,z:p.fz};}
    // Loot or a chest sitting on a deck: climb for it when nobody is on top of us.
    const highLoot=!isRanged&&!p.item&&d>6&&(loot&&(loot.y||0)>1?loot:w.crates.find(c=>c.kind!=='keg'&&c.hp>0&&!c.falling&&c.heldBy===null&&c.floor&&c.y>p.y+1&&distance(p,c)<9));
    if(highLoot){const D=deckUnder(stageDef,highLoot.x,highLoot.z,(highLoot.y||0)+.6);if(D){const mv=climbTo(w,p,D);if(mv)return mv;}}
    const crate=!p.item&&d>4&&w.crates.filter(c=>c.kind!=='keg'&&c.hp>0&&!c.falling&&c.heldBy===null&&Math.abs(p.y-c.y)<1.4&&distance(p,c)<5)
      .sort((a,b)=>distance(p,a)-distance(p,b))[0];
    if(crate){faceTarget(p,crate);if(distance(p,crate)<2&&due(w,p,36))attack(w,p);return distance(p,crate)>1.2?{x:p.fx,z:p.fz}:{x:0,z:0};}
  }
  if(d<3.5&&p.grounded&&w.tick>300&&due(w,p,480)&&p.energy>=1)skill(w,p,Math.min(3,Math.floor(p.energy)));
  // Follow a rival who is standing on a deck: ladder or jump at its edge. (Jumping only for a grounded target keeps two CPUs from mirroring each other's hops.)
  if(!isRanged&&q.y>p.y+.6&&q.grounded&&d>1.4){const D=deckUnder(stageDef,q.x,q.z,q.y);if(D){const mv=climbTo(w,p,D);if(mv)return mv;}}
  if(q.y>p.y+.6&&q.grounded&&p.grounded)jump(p);
  // Grand Battle CPUs press: chain the light string whenever the previous hit landed.
  if(p.comboWindow>0&&p.attackConnected&&!p.comboQueued&&p.attackType==='light'&&p.combo<2&&d<2.6)attack(w,p);
  // Chase a launched opponent: jump after it, then keep pressing air attacks.
  if((q.juggle||0)>0&&!q.grounded&&d<2.6){if(p.grounded&&q.y>1.2&&p.attackTime<=0)jump(p);else if(!p.grounded&&!p.comboQueued&&due(w,p,6))attack(w,p);}
  if(d<2.3&&Math.abs(p.y-q.y)<1.4&&w.tick>180&&due(w,p,20)){
    // Attack choice is rolled, not derived from the clock, so every seat mixes its moves the same way.
    const roll=rnd(w);
    if(!q.blocking&&roll<.14&&p.grounded)heavy(w,p,{z:-1});
    else if(q.blocking||roll<.42)heavy(w,p);
    else if(roll<.56)grab(w,p);
    else attack(w,p);
  }
  if(d>4&&d<8&&due(w,p,420))bomb(w,p);
  // Melee CPUs close a gap with their movement attack instead of walking into a stream of shots.
  const ranged=characterOf(p).moveAttack==='shot';
  if(!ranged&&d>3.2&&d<7&&p.grounded&&Math.abs(p.y-q.y)<1.4&&w.tick>120&&due(w,p,70)){
    if(p.char==='guardian')heavy(w,p,{x:p.fx,z:p.fz});else attack(w,p,{x:p.fx,z:p.fz});
  }
  if(ranged){
    if(d>3&&d<9&&Math.abs(p.y-q.y)<1.4&&w.tick>180&&due(w,p,100))attack(w,p,{x:p.fx,z:p.fz});
    const move=d>6.5?1:d<2.6?-.6:0;return {x:p.fx*move+(move===0?-p.fz*.5:0),z:p.fz*move+(move===0?p.fx*.5:0)};
  }
  if(!danger&&d>(characterOf(q).moveAttack==='shot'&&!ranged?3.6:7)&&p.grounded&&!p.running)sprint(p);
  const move=d>1.8?1:d<1.3?-.5:0;return {x:p.fx*move,z:p.fz*move};
}
export function stepFighter(p,input,dt,stage=STAGES.classic){
  // Terrain only applies on the ground floor: quicksand slows and drags, ice speeds up and slides.
  const zone=p.y<.05&&p.support==='ground'?zoneAt(stage,p.x,p.z):null,terrain=zone?.kind||null;p.terrain=terrain;
  if(terrain==='hotspring'&&p.hp>0){p.hp=Math.min(100,p.hp+dt*3.5);p.slowTime=Math.max(0,(p.slowTime||0)-dt*3);}
  p.sink=terrain==='quicksand'?Math.min(1,(p.sink||0)+dt*.8):Math.max(0,(p.sink||0)-dt*3);
  for(const key of ['attackCD','comboWindow','bombCD','skillCD','skillTime','dodgeCD','dodgeTime','stun','invuln','parryWindow'])p[key]=Math.max(0,p[key]-dt);
  p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);p.coyote=p.grounded?.09:Math.max(0,p.coyote-dt);
  const wantsGuard=Boolean(input.guard);if(wantsGuard&&!p.guardPrev&&p.stun<=0&&p.attackTime<=0)p.parryWindow=.16;p.guardPrev=wantsGuard;
  p.blocking=wantsGuard&&p.stun<=0&&p.attackTime<=0&&p.dodgeTime<=0&&p.grabbedTarget===null&&!p.carrying&&p.skillTime<=0;
  let ix=p.skillTime>0?0:input.x||0,iz=p.skillTime>0?0:input.z||0;const len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len;}
  if(p.stun<=0&&p.dodgeTime<=0&&p.knocked<=0){
    const slow=p.slowTime>0?.55:1;if(len===0||p.blocking||p.attackTime>0||p.carrying||!p.grounded&&p.vy<-2)p.running=false;
    const ground=terrain==='quicksand'?.45:terrain==='ice'?1.3:1,speed=p.blocking?1.2:(p.grabbedTarget!==null?4.8:p.attackTime>0?2:p.carrying?5.4:characterOf(p).speed*(p.running?1.6:1))*slow*ground,accel=terrain==='ice'?3:p.blocking?18:14;
    p.vx+=(ix*speed-p.vx)*Math.min(1,accel*dt);p.vz+=(iz*speed-p.vz)*Math.min(1,accel*dt);
    if(len===0){const friction=terrain==='ice'?.4:.001;p.vx*=Math.pow(friction,dt);p.vz*=Math.pow(friction,dt);}
    if(len>0&&(p.attackTime<=0||p.grabbedTarget!==null)&&!p.blocking){p.fx=ix/Math.hypot(ix,iz);p.fz=iz/Math.hypot(ix,iz);p.walk+=dt*14;}
    if(!p.blocking&&p.jumpBuffer>0&&(p.grounded||p.coyote>0||p.jumps<2)){
      if(!p.grounded&&p.coyote<=0&&p.jumps===0)p.jumps=1;
      p.vy=JUMP_SPEED*(terrain==='quicksand'&&p.grounded?.62:1);p.jumps++;p.grounded=false;p.coyote=0;p.jumpBuffer=0;
    }
  }
  const oldY=p.y;
  // Airborne knockback must survive until landing, rather than becoming walking friction.
  if(p.knocked>0){const drag=Math.exp(-(p.grounded?(terrain==='ice'?1.1:5):1.2)*dt);p.vx*=drag;p.vz*=drag;}
  p.wallImpact=null;
  if(p.knocked>0&&Math.hypot(p.vx,p.vz)>4){
    let bounced=false;
    if(Math.abs(p.x+p.vx*dt)>14.5){p.vx*=-.55;bounced=true;}
    if(Math.abs(p.z+p.vz*dt)>8.5){p.vz*=-.55;bounced=true;}
    if(bounced){p.wallImpact={x:p.x,y:p.y+1,z:p.z};p.vy=Math.max(p.vy,3);}
  }
  p.x=clamp(p.x+p.vx*dt,-14.5,14.5);p.z=clamp(p.z+p.vz*dt,-8.5,8.5);
  p.climbing=false;
  if(terrain==='quicksand'&&p.dodgeTime<=0){const dx=zone.x-p.x,dz=zone.z-p.z,d=Math.hypot(dx,dz);if(d>.05){const pull=Math.min(d,1.3*dt);p.x+=dx/d*pull;p.z+=dz/d*pull;}}
  stage._ladders??=laddersOf(stage);
  const ladder=stage._ladders.find(l=>l.dz!==0?Math.abs(p.x-l.x)<.72&&Math.abs(p.z-l.z)<1.8:Math.abs(p.z-l.z)<.72&&Math.abs(p.x-l.x)<1.8);
  const into=ladder?ix*ladder.dx+iz*ladder.dz:0;
  const climbUp=ladder&&p.knocked<=0&&p.stun<=0&&p.y<ladder.top-.02&&into>.1;
  const climbDown=ladder&&p.knocked<=0&&p.stun<=0&&p.y>0.02&&into<-.1;
  if(climbUp||climbDown){p.climbing=true;p.x+=(ladder.x-p.x)*Math.min(1,18*dt);p.z+=(ladder.z-p.z)*Math.min(1,12*dt);p.y=clamp(p.y+(climbUp?3.8:-3.8)*dt,0,ladder.top);p.vx=0;p.vz=0;p.vy=0;p.grounded=p.y<=.001||p.y>=ladder.top-.001;p.support=p.y>=ladder.top-.001?'ladder-top':'ladder';if(p.y>=ladder.top-.001){p.y=ladder.top;p.support='ladder-top';}return;}
  p.vy-=GRAVITY*dt;p.y+=p.vy*dt;p.grounded=false;p.support=null;
  if(p.vy<=0){
    let top=0,id='ground';
    for(const deck of stage.platforms)if(supported(p.x,p.z,deck,.28)&&oldY>=deck.top-.45&&p.y<=deck.top&&deck.top>top){top=deck.top;id=deck.id;}
    if(p.y<=top){p.y=top;p.landVy=p.vy;p.vy=0;p.grounded=true;p.jumps=0;p.airCombo=0;p.support=id;if(oldY>top+.12)p.landTime=.2;
      // Springboard nets throw anyone who touches them back into the air.
      if(id==='ground'&&p.grabbedBy===null&&zoneAt(stage,p.x,p.z)?.kind==='spring'){p.vy=17;p.grounded=false;p.support=null;p.jumps=1;p.sprung=true;}}
  }
}
// Grand Battle style match flow: READY/FIGHT intro, K.O. freeze, then the next round.
function settle(w,dt){
  for(const p of w.fighters){
    for(const key of ['hurtTime','attackTime','skillTime','throwTime','thrownTime','recoveryTime'])p[key]=Math.max(0,(p[key]||0)-dt);
    p.blocking=false;p.knocked=p.hp<=0?Math.max(p.knocked,.5):Math.max(0,p.knocked-dt);
    stepFighter(p,{x:0,z:0},dt,stageOf(w.stage));
  }
}
function nextRound(w){
  w.roundNo++;w.time=w.roundTime;w.roundWinner=null;w.hitStop=0;
  w.fighters=w.fighters.map(p=>{const n=createFighter(p.id,p.id===0?-3.4:3.4,2,p.char);n.team=p.team;n.energy=Math.max(1,p.energy);n.aimAssist=p.aimAssist;return n;});
  w.bombs=[];w.shots=[];w.clouds=[];w.props=[];w.cannonballs=[];w.ventCycle={};w.ventWarned={};w.pickups=[];w.pieces=makePieces(stageOf(w.stage));
  for(const c of w.crates)if(c.heldBy!==null){c.heldBy=null;c.falling=true;c.dropSpeed=0;}
  Object.assign(w,{nextCannonTick:w.tick+900,nextWaveTick:w.tick+2400,waveWarning:0,waveTime:0,wavePending:false,intro:1.8});
  emit(w,'roundStart',{roundNo:w.roundNo});
}
function duelWinner(w){const [a,b]=w.fighters;return a.lives===b.lives?(a.hp===b.hp?null:a.hp>b.hp?0:1):a.lives>b.lives?0:1;}
// Last fighter standing wins; on time-up the healthiest survivor does, and a tie is a draw.
function teamsAlive(w){return new Set(w.fighters.filter(p=>p.hp>0).map(p=>p.team)).size;}
// Team mode: the last team standing wins; on time-up the team with the most total health left does.
function teamWinner(w){
  const totals=new Map();for(const p of w.fighters)if(p.hp>0)totals.set(p.team,(totals.get(p.team)||0)+p.hp);
  if(!totals.size)return null;const top=Math.max(...totals.values()),best=[...totals].filter(([,v])=>v===top);
  if(best.length!==1)return null;const team=best[0][0];w.winnerTeam=team;
  return w.fighters.filter(p=>p.team===team&&p.hp>0).sort((a,b)=>b.hp-a.hp)[0].id;
}
function brawlWinner(w){if(w.teamMode)return teamWinner(w);const alive=w.fighters.filter(p=>p.hp>0);if(!alive.length)return null;const top=Math.max(...alive.map(p=>p.hp)),best=alive.filter(p=>p.hp===top);return best.length===1?best[0].id:null;}
// Final standing for a brawl: the winner (or winning team) first, then survivors by health, then the knocked-out in reverse order.
function rankBrawl(w,winner){
  const out=w.out||[];
  const score=p=>(w.teamMode&&winner!==null&&p.team===w.fighters[winner].team?1e6:0)+(p.hp>0?1e3+p.hp:Math.max(0,out.indexOf(p.id)));
  const ids=w.fighters.map(p=>p.id).filter(id=>id!==winner).sort((a,b)=>score(w.fighters[b])-score(w.fighters[a])||a-b);
  return winner===null?w.fighters.map(p=>p.id).sort((a,b)=>score(w.fighters[b])-score(w.fighters[a])||a-b):[winner,...ids];
}
function finishRound(w,defeated){
  const winner=w.brawl?brawlWinner(w):duelWinner(w);
  if(w.bestOf<=1||w.stock||w.training){w.ended=true;w.winner=winner;if(w.brawl)w.ranking=rankBrawl(w,winner);emit(w,'end',{winner,team:w.winnerTeam,ranking:w.ranking});return;}
  for(const p of w.fighters){cancelSkill(w,p);dropHeld(w,p);if(p.grabbedBy!==null){const holder=w.fighters.find(q=>q.id===p.grabbedBy);if(holder)releaseGrab(w,holder,p,false,true);}}
  if(winner!==null)w.wins[winner]++;
  const loser=winner===null?null:w.fighters[1-winner],need=Math.ceil(w.bestOf/2);
  w.roundWinner=winner;w.matchOver=w.wins.some(n=>n>=need)||w.roundNo>=w.bestOf+2;w.roundOver=w.matchOver?2.4:2.8;
  emit(w,'ko',{winner,roundNo:w.roundNo,timeUp:!defeated,matchOver:w.matchOver,wins:[...w.wins],x:loser?loser.x:0,y:loser?loser.y+1:1,z:loser?loser.z:0});
}
// Stage hazards: each map pairs a projectile hazard with a sweeping hazard.
//  port: side cannon + tide wave (damages low fighters) | desert: marked rockfall + sandstorm
//  (pushes everyone, even airborne, no damage) | snow: rolling snowball (chills) + avalanche.
function updateStageHazards(w,dt){
  const stage=stageOf(w.stage),kind=stage.cannonKind;
  if(!w.training&&w.tick>=w.nextCannonTick){
    const pool=w.fighters.filter(p=>p.hp>0),target=(pool.length?pool:w.fighters)[Math.floor(Math.random()*(pool.length||w.fighters.length))],side=Math.random()<.5?-1:1;
    if(kind==='rockfall'){const x=clamp(target.x+(Math.random()-.5)*1.5,-14,14),z=clamp(target.z+(Math.random()-.5)*1.5,-8,8);w.cannonballs.push({id:w.nextCannon++,owner:-1,kind:'rock',x,y:12,z,vx:0,vy:0,vz:0,life:4,delay:1.3});w.nextCannonTick=w.tick+620;emit(w,'rockWarn',{x,y:.14,z,delay:1.3});}
    // Off-screen launchers wind up first: a lane warning, a visible thrower and an edge alert give the players time to sidestep, jump or guard.
    else if(kind==='snowball'){const z=clamp(target.z,-7.6,7.6),id=w.nextCannon++;w.cannonballs.push({id,owner:-1,kind:'snowball',x:side*15,y:.75,z,vx:-side*9,vy:0,vz:0,life:3.6,delay:SNOWBALL_WARN,fire:{x:side*14,y:.75,z,side,kind:'snowball'}});w.nextCannonTick=w.tick+760;emit(w,'hazardWarn',{id,kind:'snowball',side,z,delay:SNOWBALL_WARN});}
    else{const z=clamp(target.z,-7.6,7.6),id=w.nextCannon++;w.cannonballs.push({id,owner:-1,kind:'cannon',x:side*15,y:1.2,z,vx:-side*11,vy:1.8,vz:0,life:3,delay:CANNON_WARN,fire:{x:side*14,y:1.2,z,side,kind:'cannon'}});w.nextCannonTick=w.tick+840;emit(w,'hazardWarn',{id,kind:'cannon',side,z,delay:CANNON_WARN});}
  }
  for(let i=w.cannonballs.length-1;i>=0;i--){
    const c=w.cannonballs[i];
    if(c.delay>0){c.delay=Math.max(0,c.delay-dt);if(c.delay===0&&c.fire)emit(w,'cannon',c.fire);continue;}
    c.life-=dt;
    if(c.kind==='rock'){
      c.vy-=40*dt;c.y+=c.vy*dt;
      const target=w.fighters.find(p=>p.hp>0&&distance(p,c)<.9&&c.y-p.y<2.4&&c.y-p.y>-.2);
      if(target||c.y<=.4){
        if(target)hit(w,c,target,18,9,{kind:'rock'});
        for(const p of w.fighters)if(p!==target&&p.y<.6&&distance(p,c)<1.7)hit(w,c,p,9,7,{kind:'rock'});
        for(const cr of w.crates)if(cr.hp>0&&distance(cr,c)<1.7)breakCrate(w,cr,2);
        for(const pc of w.pieces)if(pc.state==='standing'&&distance(pc,c)<1.7+pc.r)hurtPiece(w,pc,35,{owner:-1,x:c.x,z:c.z});
        emit(w,'rockImpact',{x:c.x,y:.3,z:c.z});w.cannonballs.splice(i,1);
      }
      continue;
    }
    if(c.kind==='snowball'){c.x+=c.vx*dt;const rolled=w.pieces.find(pc=>pc.state==='standing'&&distance(pc,c)<pc.r+.7);if(rolled){hurtPiece(w,rolled,20,{owner:-1,x:c.x,z:c.z});emit(w,'snowBurst',{x:c.x,y:c.y,z:c.z});w.cannonballs.splice(i,1);continue;}const target=w.fighters.find(p=>p.hp>0&&distance(p,c)<.95&&p.y<1.2);if(target){const blocked=target.blocking;if(hit(w,c,target,12,8,{kind:'snowball'})&&!blocked){target.slowTime=2.5;emit(w,'slow',{id:target.id,x:target.x,y:target.y+1,z:target.z});}emit(w,'snowBurst',{x:c.x,y:c.y,z:c.z});w.cannonballs.splice(i,1);}else if(c.life<=0||Math.abs(c.x)>17)w.cannonballs.splice(i,1);continue;}
    c.vy-=5*dt;c.x+=c.vx*dt;c.y+=c.vy*dt;const balled=w.pieces.find(pc=>pc.state==='standing'&&distance(pc,c)<pc.r+.5&&c.y<pc.h);if(balled){hurtPiece(w,balled,30,{owner:-1,x:c.x,z:c.z});emit(w,'explosion',{x:c.x,y:c.y,z:c.z,kind:'cannon'});w.cannonballs.splice(i,1);continue;}const target=w.fighters.find(p=>p.hp>0&&distance(p,c)<.75&&Math.abs(p.y+1-c.y)<1.2);if(target){hit(w,c,target,14,9,{kind:'cannon'});emit(w,'explosion',{x:c.x,y:c.y,z:c.z,kind:'cannon'});w.cannonballs.splice(i,1);}else if(c.life<=0||Math.abs(c.x)>17||c.y<0){w.cannonballs.splice(i,1);}
  }
  if(!w.training&&stage.vents){
    for(const [i,v] of stage.vents.entries()){
      const s=ventState(v,w.tick);w.ventCycle??={};w.ventWarned??={};
      if(s.phase==='warn'&&w.ventWarned[i]!==s.cycle){w.ventWarned[i]=s.cycle;emit(w,'ventWarn',{x:v.x,y:.1,z:v.z,r:v.r});}
      if(s.phase==='erupt'&&w.ventCycle[i]!==s.cycle){
        w.ventCycle[i]=s.cycle;emit(w,'ventBurst',{x:v.x,y:0,z:v.z,r:v.r});
        for(const p of w.fighters)if(p.hp>0&&p.y<1.4&&distance(p,v)<v.r+.3)hit(w,{owner:-1,x:v.x,y:0,z:v.z+.001},p,12,8,{kind:'vent'});
        for(const cr of w.crates)if(cr.hp>0&&!cr.falling&&cr.heldBy===null&&cr.y<1&&distance(cr,v)<v.r+.4)breakCrate(w,cr,2);
      }
    }
  }
  const wave=stage.waveKind;
  if(!w.training&&w.tick>=w.nextWaveTick&&!w.wavePending&&w.waveTime<=0){w.waveWarning=2;w.wavePending=true;w.waveDir=Math.random()<.5?-1:1;w.nextWaveTick=w.tick+(wave==='sandstorm'?3000:3600);emit(w,'waveWarning',{dir:w.waveDir,kind:wave});}
  if(w.waveWarning>0){w.waveWarning=Math.max(0,w.waveWarning-dt);if(w.waveWarning===0&&w.wavePending){
    w.wavePending=false;w.waveTime=wave==='sandstorm'?3.5:2.2;emit(w,'waveStart',{dir:w.waveDir,kind:wave});
    if(wave!=='sandstorm')for(const p of w.fighters)if(p.y<.5)hit(w,{owner:-1,x:p.x-w.waveDir,z:p.z,fx:w.waveDir,fz:0},p,wave==='avalanche'?10:7,wave==='avalanche'?7:6,{kind:'wave'});
  }}
  if(w.waveTime>0){
    w.waveTime=Math.max(0,w.waveTime-dt);
    const push=wave==='sandstorm'?8:wave==='avalanche'?13:11;
    for(const p of w.fighters)if(p.hp>0&&p.grabbedBy===null&&(wave==='sandstorm'||p.y<.7)){p.vx+=w.waveDir*push*dt;p.x=clamp(p.x+(wave==='sandstorm'?w.waveDir*1.2*dt:0),-14.5,14.5);}
  }
}
export function step(w,input={},dt=STEP){
  if(w.ended)return;
  if(w.hitStop>0){w.hitStop=Math.max(0,w.hitStop-dt);return;}
  if(w.intro>0){w.intro=Math.max(0,w.intro-dt);if(w.intro===0)emit(w,'fight',{roundNo:w.roundNo});return;}
  if(w.roundOver>0){
    w.tick++;settle(w,dt);w.roundOver=Math.max(0,w.roundOver-dt);
    if(w.roundOver===0){if(w.matchOver){w.ended=true;w.winner=w.wins[0]===w.wins[1]?null:w.wins[0]>w.wins[1]?0:1;emit(w,'end',{winner:w.winner});}else nextRound(w);}
    return;
  }
  w.tick++;if(!w.training)w.time=Math.max(0,w.time-dt);
  updateCrates(w,dt);
  // Alternate the update order each tick so neither seat always resolves its attacks first.
  for(const p of w.tick%2?[...w.fighters].reverse():w.fighters){
    p.respawnProtection=Math.max(0,(p.respawnProtection||0)-dt);
    if(p.respawnTimer>0){
      p.attackBoost=1;p.attackBoostTime=0;p.poisonTick=0;
      if(p.respawnTimer<=dt)p.respawnProtection=1.5;
    }
    p.throwTime=Math.max(0,(p.throwTime||0)-dt);p.tossTime=Math.max(0,(p.tossTime||0)-dt);p.thrownTime=Math.max(0,(p.thrownTime||0)-dt);p.recoveryTime=Math.max(0,(p.recoveryTime||0)-dt);
    if(p.knocked<=0||p.hp<=0||p.poisonTime>0||p.virusTime>0||p.slowTime>0)p.recoveryBuffer=0;
    if(p.hp<=0||p.respawnTimer>0||p.knocked>0||p.grabbedBy!==null)cancelSkill(w,p);
    if(p.hp<=0||p.respawnTimer>0){cancelRecovery(p);dropHeld(w,p);if(p.grabbedBy!==null){const holder=w.fighters.find(q=>q.id===p.grabbedBy);if(holder)releaseGrab(w,holder,p,false,true);}}
    if(p.respawnTimer>0){p.respawnTimer=Math.max(0,p.respawnTimer-dt);if(p.respawnTimer===0){p.hp=100;p.x=p.spawnX;p.y=0;p.z=p.spawnZ;p.vx=0;p.vy=0;p.vz=0;p.grounded=true;p.support='ground';p.invuln=1.5;p.hurtTime=0;p.burnTime=0;p.virusTime=0;p.poisonTime=0;p.slowTime=0;p.knocked=0;p.grabbed=0;p.grabbedBy=null;p.grabbedTarget=null;p.grabHoldTime=0;p.grabEscape=0;p.comboQueued=false;p.comboWindow=0;p.carrying=null;p.weapon=null;p.stun=0;p.attackTime=0;p.skillTime=0;p.jumpBuffer=0;p.blocking=false;p.guardPrev=false;p.parryWindow=0;emit(w,'respawn',{id:p.id,x:p.x,y:1,z:p.z});}else continue;}
    p.attackBoostTime=Math.max(0,p.attackBoostTime-dt);if(p.attackBoostTime===0){p.attackBoost=1;p.weapon=null;}
    p.slowTime=Math.max(0,p.slowTime-dt);p.poisonTime=Math.max(0,p.poisonTime-dt);p.virusTime=Math.max(0,p.virusTime-dt);p.burnTime=Math.max(0,p.burnTime-dt);p.hurtTime=Math.max(0,p.hurtTime-dt);p.poisonTick+=dt;
    if(p.poisonTime>0&&p.poisonTick>=1){p.poisonTick=0;p.hp=Math.max(0,p.hp-4);p.hurtTime=.35;p.hurtKind='poison';emit(w,'dot',{id:p.id,x:p.x,y:p.y+1.2,z:p.z,damage:4});}
    if(p.grabbed>0){const holder=w.fighters.find(f=>f.id===p.grabbedBy);if(!holder||holder.hp<=0||holder.grabbedTarget!==p.id){p.grabbed=0;p.grabbedBy=null;continue;}holder.grabHoldTime=Math.max(0,(holder.grabHoldTime||0)-dt);p.grabbed=holder.grabHoldTime;p.vx=0;p.vy=0;p.vz=0;p.grounded=false;p.blocking=false;p.attackTime=0;p.skillTime=0;if(holder.grabHoldTime<=0)releaseGrab(w,holder,p,holder.grabThrow==='high');continue;}
    if(w.brawl&&p.hp<=0){
      // Eliminated fighters stay down for the rest of the round; the survivors keep fighting.
      if(!p.eliminated){p.eliminated=true;(w.out??=[]).push(p.id);p.poisonTime=p.virusTime=p.slowTime=p.burnTime=0;emit(w,'eliminated',{id:p.id,x:p.x,y:p.y+1,z:p.z,left:w.fighters.filter(q=>q.hp>0).length});}
      p.attackTime=0;p.skillTime=0;p.knocked=1;stepFighter(p,{x:0,z:0,guard:false},dt,stageOf(w.stage));p.blocking=false;continue;
    }
    if(p.knocked>0){const wasAirborne=!p.grounded;p.attackTime=0;p.skillTime=0;stepFighter(p,{x:0,z:0,guard:false},dt,stageOf(w.stage));p.blocking=false;
      if(wasAirborne&&p.grounded&&p.spiked){p.spiked=false;p.juggle=0;p.vy=6.5;p.grounded=false;p.recoveryBuffer=0;p.invuln=Math.max(p.invuln,.45);p.knocked=Math.max(p.knocked,.6);w.hitStop=Math.max(w.hitStop,.05);emit(w,'groundBounce',{id:p.id,x:p.x,y:p.y+.2,z:p.z});continue;}
      if(p.grounded)p.juggle=0;
      if(wasAirborne&&p.grounded&&p.recoveryBuffer>0&&p.hp>0){
        const direction=p.recoveryDirection;p.knocked=0;p.stun=0;p.hurtTime=0;p.thrownTime=0;p.recoveryBuffer=0;
        p.recoveryTime=.22;p.stun=.22;p.dodgeTime=.22;p.dodgeCD=Math.max(p.dodgeCD,.7);p.invuln=Math.max(p.invuln,.25);
        p.fx=direction.x;p.fz=direction.z;p.vx=direction.x*8;p.vz=direction.z*8;p.jumpBuffer=0;
        emit(w,'recovery',{id:p.id,x:p.x,y:p.y+.12,z:p.z});continue;
      }
      p.recoveryBuffer=Math.max(0,(p.recoveryBuffer||0)-dt);
      if(p.wallImpact){emit(w,'wallBounce',{...p.wallImpact,id:p.id});w.hitStop=Math.max(w.hitStop,.045);p.wallImpact=null;}
      if(Math.hypot(p.vx,p.vz)>4)for(const c of w.crates)if(c.hp>0&&!c.falling&&c.heldBy===null&&distance(p,c)<1&&Math.abs(p.y-c.y)<1.2){breakCrate(w,c,1);emit(w,'bodyCrash',{id:p.id,x:c.x,y:c.y+.6,z:c.z});}
      p.knocked=Math.max(0,p.knocked-dt);if(p.knocked===0&&!p.grounded)p.knocked=.01;else if(p.knocked===0){p.invuln=.35;emit(w,'wakeup',{id:p.id,x:p.x,y:p.y+1,z:p.z});}continue;}
    const human=p.id===0&&!w.autoplay,foe=w.online||human?null:aiTarget(w,p),controls=human?input:(w.online?w.remoteInput:foe?ai(w,p,foe):{x:0,z:0});
    stepFighter(p,controls,dt,stageOf(w.stage));
    p.landTime=Math.max(0,(p.landTime||0)-dt);
    if(p.attackTime>0){
      p.attackTime=Math.max(0,p.attackTime-dt);
      const active=['heavy','upper','shieldBash'].includes(p.attackType)?.29:p.attackType==='slam'?.27:p.attackType==='grab'?.25:p.attackType==='rush'?.26:p.attackType==='shot'?.2:p.attackType==='air'||p.attackType==='dash'?.24:.22;
      if(!p.hitDone&&p.attackTime<active){
        p.hitDone=true;
        if(p.attackType==='shot'){
          const sh=characterOf(p).shot||{speed:17,damage:6,life:.62};
          w.shots.push({id:w.nextShot++,owner:p.id,x:p.x+p.fx*.7,y:p.y+1.25,z:p.z+p.fz*.7,vx:p.fx*sh.speed,vz:p.fz*sh.speed,fx:p.fx,fz:p.fz,life:sh.life,boost:p.attackBoost,damage:sh.damage,slow:sh.slow||0,style:sh.style||'ball'});
          emit(w,'shotFire',{id:p.id,x:p.x+p.fx*.7,y:p.y+1.25,z:p.z+p.fz*.7,fx:p.fx,fz:p.fz,style:sh.style||'ball'});
        }else if(p.attackType==='grab'){
          for(const q of w.fighters){const d=distance(p,q);if(q===p||Math.abs(p.y-q.y)>1.5)continue;const dot=((q.x-p.x)*p.fx+(q.z-p.z)*p.fz)/Math.max(.01,d);if(d<1.85&&(dot>-.25||d<.8))hit(w,p,q,12*(characterOf(p).boost.grab||1)*p.attackBoost,8,{grab:true});
          }
        }else for(const q of w.fighters){const d=distance(p,q);const vertical=['slam','air','upper'].includes(p.attackType)?2.4:1.5;if(q===p||Math.abs(p.y-q.y)>vertical)continue;
          const dot=((q.x-p.x)*p.fx+(q.z-p.z)*p.fz)/Math.max(.01,d);
          const hv=p.attackType==='heavy'?characterOf(p).heavy:null;   // each character's U has its own reach, arc, force and launch
          const reach=hv?.reach??(p.weapon==='sword'?3.25:p.attackType==='shieldBash'?2.8:p.attackType==='slam'?2.9:p.attackType==='heavy'?2.85:p.attackType==='upper'?2.55:p.attackType==='dash'?3:p.attackType==='rush'?2.7:p.attackType==='air'?2.7:2.6);
          if(d<reach&&(dot>(hv?.arc??-.15)||d<.8)){const baseDamage=hv?.damage??(p.attackType==='slam'?21:p.attackType==='heavy'?18:p.attackType==='upper'?16:p.attackType==='shieldBash'?15:p.attackType==='rush'?13:p.attackType==='dash'?12:p.attackType==='air'?(p.airCombo===2?14:9):(p.combo===2?15:p.combo===1?12:9)),baseForce=hv?.force??(p.attackType==='slam'?12:p.attackType==='heavy'?10:p.attackType==='upper'?9:p.attackType==='shieldBash'?11:p.attackType==='rush'?6.5:p.attackType==='dash'?7:p.attackType==='air'?5.5:(p.combo===2?9:p.combo===1?6:4)),styleBoost=characterOf(p).boost[p.attackType]||1;hit(w,p,q,baseDamage*styleBoost*p.attackBoost,baseForce*(p.char==='guardian'&&styleBoost>1?1.12:1),{guardBreak:p.attackType==='heavy'||p.attackType==='slam'||p.attackType==='shieldBash',kind:hv?.launch?'upper':p.attackType});}
        }
        if(p.attackType!=='grab'&&p.attackType!=='shot')for(const c of w.crates)if(c.hp>0&&distance(p,c)<2.5&&Math.abs(p.y+.48-c.y)<1.7)breakCrate(w,c,1);
        if(p.attackType!=='grab'&&p.attackType!=='shot')for(const pc of w.pieces){
          const d=distance(p,pc);if(pc.state!=='standing'||d>2.6+pc.r||p.y>=pc.h)continue;
          if(((pc.x-p.x)*p.fx+(pc.z-p.z)*p.fz)/Math.max(.01,d)>-.1)hurtPiece(w,pc,(PIECE_DAMAGE[p.attackType]||6)*p.attackBoost,p);
        }
      }
    }
    if(p.attackTime<=0&&p.comboQueued){const buffered=p.comboInput||{};p.comboQueued=false;p.attackCD=0;const moving=Math.hypot(buffered.x||0,buffered.z||0)>.5;beginAttack(w,p,p.grounded&&moving?characterOf(p).moveAttack:'light');}
  }
  // Resolve after both fighters moved, so either player can dodge/jump during the warning.
  for(const p of w.fighters)if(p.pendingSkill){
    if(p.hp<=0||p.stun>0||p.grabbedBy!==null)cancelSkill(w,p);
    else{p.skillWindup=Math.max(0,p.skillWindup-dt);if(p.skillWindup<=1e-8)releaseSkill(w,p);}
  }
  // Attach after both players moved: red and blue holders get identical positioning.
  for(const p of w.fighters)if(p.grabbedBy!==null){const holder=w.fighters.find(q=>q.id===p.grabbedBy);if(holder&&holder.grabbedTarget===p.id){
    const lift=clamp((2.2-holder.grabHoldTime)/.25,0,1),smooth=lift*lift*(3-2*lift);
    p.x=holder.x+holder.fx*.72;p.z=holder.z+holder.fz*.72;p.y=holder.y+.15+1.05*smooth;p.fx=holder.fx;p.fz=holder.fz;
  }}
  collidePieces(w);
  for(let i=0;i<w.fighters.length;i++)for(let j=i+1;j<w.fighters.length;j++){
    const a=w.fighters[i],b=w.fighters[j],d=distance(a,b),inGrab=a.grabbedTarget===b.id||b.grabbedTarget===a.id;
    if(w.brawl&&(a.hp<=0||b.hp<=0))continue;
    if(!inGrab&&d<.85&&Math.abs(a.y-b.y)<1.6){const nx=d>.001?(b.x-a.x)/d:1,nz=d>.001?(b.z-a.z)/d:0,push=(.85-d)/2;a.x-=nx*push;a.z-=nz*push;b.x+=nx*push;b.z+=nz*push;}
  }
  for(let i=w.bombs.length-1;i>=0;i--){
    const s=w.bombs[i],oldY=s.y;s.life-=dt;s.vy-=16*dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.z+=s.vz*dt;
    const ground=s.y<.22||stageOf(w.stage).platforms.some(p=>supported(s.x,s.z,p)&&s.vy<0&&oldY>=p.top+.22&&s.y<=p.top+.22);
    const contact=w.fighters.some(p=>p.hp>0&&distance(p,s)<.65&&Math.abs(p.y+1-s.y)<1);
    if(ground||contact||s.life<=0){
      if(s.kind==='poison'||s.kind==='virus'||s.kind==='slow'){
        const radius=s.kind==='virus'?2.8:s.kind==='slow'?2.4:2.2;const life=s.kind==='virus'?7:s.kind==='slow'?4:5;w.clouds.push({id:w.nextCloud++,owner:s.owner,kind:s.kind,x:s.x,y:Math.max(.2,s.y),z:s.z,life,radius,tick:0});emit(w,'cloud',{x:s.x,y:Math.max(.2,s.y),z:s.z,kind:s.kind});
      }else{
        emit(w,'explosion',{x:s.x,y:s.y,z:s.z,kind:s.kind});
        for(const p of w.fighters)if(distance(p,s)<3&&Math.abs(p.y+1-s.y)<2.8){const blocked=p.blocking;const damage=s.kind==='slow'?7:20;const connected=hit(w,s,p,damage,s.kind==='slow'?5:10,{kind:s.kind});if(connected&&!blocked&&s.kind==='slow'){p.slowTime=5;emit(w,'slow',{id:p.id,x:p.x,y:p.y+1,z:p.z});}}
        for(const c of w.crates)if(c.hp>0&&distance(c,s)<3)breakCrate(w,c,2);
        for(const pc of w.pieces)if(pc.state==='standing'&&distance(pc,s)<3+pc.r)hurtPiece(w,pc,s.kind==='slow'?10:45,{owner:s.owner,x:s.x,z:s.z});
      }
      w.bombs.splice(i,1);
    }
  }
  for(let i=w.shots.length-1;i>=0;i--){
    const s=w.shots[i];s.life-=dt;s.x+=s.vx*dt;s.z+=s.vz*dt;
    const target=w.fighters.find(q=>q.id!==s.owner&&q.team!==w.fighters[s.owner]?.team&&q.hp>0&&q.respawnTimer<=0&&distance(q,s)<.75&&Math.abs(q.y+1.1-s.y)<1.1);
    if(target){const blocked=target.blocking;if(hit(w,s,target,(s.damage??6)*s.boost,3.5,{kind:'shot'})&&s.slow&&!blocked){target.slowTime=Math.max(target.slowTime,s.slow);emit(w,'slow',{id:target.id,x:target.x,y:target.y+1,z:target.z});}emit(w,'shotHit',{x:s.x,y:s.y,z:s.z,style:s.style});w.shots.splice(i,1);continue;}
    const shotPiece=w.pieces.find(pc=>pc.state==='standing'&&distance(pc,s)<pc.r+.35&&s.y<pc.h);
    if(shotPiece){hurtPiece(w,shotPiece,4*s.boost,{owner:s.owner,x:s.x-s.vx*.05,z:s.z-s.vz*.05});emit(w,'shotHit',{x:s.x,y:s.y,z:s.z});w.shots.splice(i,1);continue;}
    const crate=w.crates.find(c=>c.hp>0&&!c.falling&&c.heldBy===null&&distance(c,s)<.75&&s.y<c.y+1.4);
    if(crate){breakCrate(w,crate,1);emit(w,'shotHit',{x:s.x,y:s.y,z:s.z});w.shots.splice(i,1);continue;}
    if(s.life<=0||Math.abs(s.x)>15||Math.abs(s.z)>9)w.shots.splice(i,1);
  }
  for(let i=w.props.length-1;i>=0;i--){const o=w.props[i];if(o.heldBy!==null){const p=w.fighters.find(p=>p.id===o.heldBy);if(p){o.x=p.x+p.fx*.3;o.z=p.z+p.fz*.3;o.y=p.y+2.15;}continue;}const oldY=o.y;o.life-=dt;o.age=(o.age||0)+dt;o.vy-=GRAVITY*dt;o.x+=o.vx*dt;o.y+=o.vy*dt;o.z+=o.vz*dt;const target=w.fighters.find(p=>p.hp>0&&p.id!==o.owner&&distance(p,o)<.8&&Math.abs(p.y+1-o.y)<1.2);const ground=o.y<.35||stageOf(w.stage).platforms.some(p=>supported(o.x,o.z,p)&&o.vy<0&&oldY>=p.top+.35&&o.y<=p.top+.35);const hitPiece=w.pieces.find(pc=>pc.state==='standing'&&distance(pc,o)<pc.r+.45&&o.y<pc.h+.5&&o.vx*o.vx+o.vz*o.vz>4);if(target){hit(w,o,target,o.kind==='chest'?20:o.kind==='barrel'?17:14,o.kind==='chest'?11:8,{kind:'prop'});emit(w,'propBreak',{x:o.x,y:o.y,z:o.z,kind:o.kind});dropLoot(w,o.kind,o.x,o.z,o.y);w.props.splice(i,1);}else if(hitPiece){hurtPiece(w,hitPiece,18,{owner:o.owner,x:o.x-o.vx*.05,z:o.z-o.vz*.05});emit(w,'propBreak',{x:o.x,y:o.y,z:o.z,kind:o.kind});dropLoot(w,o.kind,o.x,o.z,o.y);w.props.splice(i,1);}else if(ground||o.life<=0){emit(w,'propBreak',{x:o.x,y:Math.max(.3,o.y),z:o.z,kind:o.kind});dropLoot(w,o.kind,o.x,o.z,o.y);w.props.splice(i,1);}}
  for(const p of w.fighters)if(p.sprung){p.sprung=false;emit(w,'spring',{id:p.id,x:p.x,y:p.y,z:p.z});}
  updateStageHazards(w,dt);
  updatePieces(w,dt);
  for(let i=w.clouds.length-1;i>=0;i--){
    const c=w.clouds[i];c.life-=dt;c.tick-=dt;
    if(c.life<=0){w.clouds.splice(i,1);continue;}
    if(c.tick>0)continue;c.tick=.7;
    for(const p of w.fighters){
      if(p.hp<=0||p.respawnTimer>0||p.respawnProtection>0||distance(p,c)>=c.radius||Math.abs(p.y+1-c.y)>=2.8)continue;
      if(p.id!==c.owner&&w.fighters[c.owner]?.team===p.team)continue;
      if(p.blocking){emit(w,'guard',{x:p.x,y:p.y+1.3,z:p.z,id:p.id});continue;}
      if(c.kind==='slow'){p.slowTime=4;emit(w,'slow',{id:p.id,x:p.x,y:p.y+1,z:p.z});continue;}
      const damage=c.kind==='virus'?4:2;p.hp=Math.max(0,p.hp-damage);p.hurtTime=.35;p.hurtKind=c.kind;p.invuln=.18;
      emit(w,'dot',{id:p.id,x:p.x,y:p.y+1.2,z:p.z,damage});
      if(c.kind==='virus'){p.virusTime=2.6;p.slowTime=2;emit(w,'slow',{id:p.id,x:p.x,y:p.y+1,z:p.z});}
      else{p.poisonTime=3;p.poisonTick=0;emit(w,'poison',{id:p.id,x:p.x,y:p.y+1,z:p.z});}
    }
  }
  for(let i=w.pickups.length-1;i>=0;i--){
    const h=w.pickups[i];h.life-=dt;
    if(h.life<=0){w.pickups.splice(i,1);continue;}
    // Resolve after damage: food must not resurrect a defeated fighter or steal a stock.
    // Nearest eligible player wins; exact distance ties use stable player ID.
    const p=w.fighters.filter(p=>p.hp>0&&p.respawnTimer<=0&&Math.abs(p.y-(h.y||0))<1.2&&distance(p,h)<1.8&&
      (h.type==='meat'?p.hp<100:h.type==='beer'||h.type==='sword'||!p.item))
      .sort((a,b)=>distance(a,h)-distance(b,h)||a.id-b.id)[0];
    if(!p)continue;
    if(h.type==='meat'){p.hp=Math.min(100,p.hp+20);emit(w,'heal',{id:p.id,x:p.x,y:p.y+1,z:p.z});}
    else if(h.type==='beer'){p.attackBoost=1.55;p.attackBoostTime=8;emit(w,'power',{id:p.id,item:h.type,x:p.x,y:p.y+1,z:p.z});}
    // The power-up blade works like beer: it takes effect the moment it is picked up and never sits in the
    // item slot, so a fighter can still collect bombs and bottles while holding it.
    else if(h.type==='sword'){p.attackBoost=1.35;p.attackBoostTime=10;p.weapon='sword';emit(w,'ready',{id:p.id,item:h.type,x:p.x,y:p.y+1,z:p.z});}
    else{p.item=h.type;emit(w,'pickup',{id:p.id,item:h.type,x:p.x,y:p.y+1,z:p.z});}
    w.pickups.splice(i,1);
  }
  for(const p of w.fighters)if(p.hp<=0)cancelRecovery(p);
  if(w.stock)for(const p of w.fighters)if(p.hp<=0&&p.respawnTimer<=0&&p.lives>1){p.lives--;p.respawnTimer=.9;p.item=null;p.weapon=null;p.blocking=false;p.knocked=0;p.attackTime=0;p.skillTime=0;emit(w,'lifeLost',{id:p.id,lives:p.lives,x:p.x,y:p.y+1,z:p.z});}
  const defeated=w.brawl?teamsAlive(w)<=1:w.fighters.some(p=>p.hp<=0&&p.respawnTimer<=0&&(!w.stock||p.lives<=1));
  if(defeated||w.time<=0)finishRound(w,defeated);
}
