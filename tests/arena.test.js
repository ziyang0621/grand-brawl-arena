import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,PLATFORMS,CANNON_WARN,createWorld,createFighter,stepFighter,step,jump,attack,heavy,grab,bomb,skill,dodge,toggleAim} from '../arena-core.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const cast=(w,p,level=1)=>{skill(w,p,level);advance(w,.25+level*.15+STEP);};
test('assisted dash velocity and sword face the same nearby opponent',()=>{
  const w=createWorld();w.training=true;w.crates=[];const [p,q]=w.fighters;
  Object.assign(p,{x:0,z:3,fx:-1,fz:0});Object.assign(q,{x:2,z:3});
  attack(w,p,{x:1});assert.ok(p.fx>.99);assert.ok(p.vx>0);advance(w,.3,{x:1});assert.ok(q.hp<100);
});
test('free aim preserves an intentional attack away from the enemy',()=>{
  const w=createWorld();w.training=true;w.crates=[];const [p,q]=w.fighters;
  Object.assign(p,{x:0,z:3,fx:-1,fz:0});Object.assign(q,{x:2,z:3});toggleAim(p);
  attack(w,p);advance(w,.3);assert.equal(p.fx,-1);assert.equal(q.hp,100);toggleAim(p);assert.equal(p.aimAssist,true);
});
test('nearby loot container takes priority over automatic enemy facing',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;
  Object.assign(p,{x:0,z:4,fx:-1,fz:0});Object.assign(q,{x:3,z:4});w.crates=[{id:0,kind:'crate',x:-1,z:4,y:0,hp:1,heldBy:null,falling:false}];
  attack(w,p);advance(w,.3);assert.equal(p.fx,-1);assert.equal(w.crates[0].hp,0);assert.equal(q.hp,100);
});
test('airborne knockback travels and bounces off the visible boundary once',()=>{
  const w=createWorld();w.training=true;w.crates=[];const p=w.fighters[0];
  Object.assign(p,{x:14.2,z:5,y:1,grounded:false,knocked:1,vx:10,vy:3,vz:0});advance(w,.2);
  assert.ok(p.vx<0);assert.ok(p.x<14.2);assert.equal(w.events.filter(e=>e.type==='wallBounce').length,1);
});
test('knockback can smash a container without consuming its loot immediately',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];
  Object.assign(p,{x:0,z:5,y:.4,grounded:false,knocked:1,vx:9,vy:4,vz:0,item:'bomb'});
  w.crates=[{id:0,kind:'barrel',x:1.1,z:5,y:0,hp:1,heldBy:null,falling:false}];advance(w,.15);
  assert.equal(w.crates[0].hp,0);assert.equal(w.pickups.length,1);assert.ok(w.events.some(e=>e.type==='bodyCrash'));
});
test('a hit drops a red-held crate intact rather than breaking it in the hands',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;const c=w.crates[0];
  Object.assign(p,{x:c.x,z:c.z});grab(w,p);Object.assign(q,{x:p.x+1,z:p.z});cast(w,q);
  assert.equal(c.hp,1);assert.equal(c.heldBy,null);assert.equal(c.falling,true);assert.equal(p.carrying,null);
});
for(const holderId of [0,1])test(`player ${holderId} carries and throws straight along the depth axis`,()=>{
  const w=createWorld();w.training=true;w.online=true;w.crates=[];const p=w.fighters[holderId],q=w.fighters[1-holderId];
  Object.assign(p,{x:0,z:3,fx:0,fz:1});Object.assign(q,{x:0,z:4.2});grab(w,p);advance(w,.3);
  assert.equal(q.grabbedBy,p.id);const controls={z:1};if(holderId===1)w.remoteInput=controls;advance(w,.4,holderId===0?controls:{});
  assert.ok(Math.abs(q.z-p.z-.72)<.001);assert.ok(Math.abs(q.x-p.x)<.001);assert.ok(q.y>p.y+1);
  attack(w,p);assert.equal(q.vx,0);assert.ok(q.vz>0);assert.equal(p.grabbedTarget,null);assert.equal(q.grabbedBy,null);
});
test('enemy cannot steal a crate already held by player zero',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters,c=w.crates[0];Object.assign(p,{x:c.x,z:c.z});grab(w,p);Object.assign(q,{x:c.x+1,z:c.z});grab(w,q);
  assert.equal(c.heldBy,p.id);assert.equal(q.carrying,null);assert.deepEqual(p.carrying,{kind:'crate',id:c.id});
});
test('being hit releases a held fighter and both actors fall normally',()=>{
  const w=createWorld();w.training=true;w.crates=[];const [p,q]=w.fighters;Object.assign(p,{x:0,z:4});Object.assign(q,{x:1.2,z:4});grab(w,p);advance(w,.4);
  w.bombs.push({id:0,owner:1,kind:'bomb',x:p.x,y:.1,z:p.z,vx:0,vy:0,vz:0,life:.01});step(w);
  assert.equal(p.grabbedTarget,null);assert.equal(q.grabbedBy,null);advance(w,2);assert.equal(p.y,0);assert.equal(q.y,0);
});
test('losing a stock while carrying releases the opponent before respawn',()=>{
  const w=createWorld();w.training=true;w.stock=true;w.crates=[];const [p,q]=w.fighters;p.lives=3;Object.assign(p,{x:0,z:4});Object.assign(q,{x:1.2,z:4});grab(w,p);advance(w,.4);p.hp=0;step(w);
  assert.equal(q.grabbedBy,null);assert.equal(p.grabbedTarget,null);advance(w,1.5);assert.equal(p.hp,100);assert.equal(p.lives,2);assert.equal(q.y,0);
});
test('held actors cannot jump, use a bottle or shield while struggling remains available',()=>{
  const w=createWorld();w.training=true;w.crates=[];const [p,q]=w.fighters;Object.assign(p,{x:0,z:4});Object.assign(q,{x:1.2,z:4});grab(w,p);advance(w,.4);
  for(const f of [p,q]){f.item='bomb';jump(f);bomb(w,f);assert.equal(f.jumpBuffer,0);assert.equal(f.item,'bomb');}
  advance(w,.1,{guard:true});assert.equal(p.blocking,false);assert.equal(w.bombs.length,0);for(let i=0;i<3;i++)attack(w,q);assert.equal(q.grabbedBy,null);
});
test('a knocked-down fighter cannot lift a crate',()=>{
  const w=createWorld(),p=w.fighters[0],c=w.crates[0];Object.assign(p,{x:c.x,z:c.z,knocked:.5});grab(w,p);assert.equal(p.carrying,null);assert.equal(c.heldBy,null);
});
test('guardian special trades damage for range and stronger knockback',()=>{
  for(const id of [0,1]){const w=createWorld();w.training=true;const p=w.fighters[id],q=w.fighters[1-id];Object.assign(p,{x:0,z:5});Object.assign(q,{x:3.8,z:5});cast(w,p);
    assert.equal(q.hp,id===1?82:100);if(id===1){assert.ok(q.vx>=15);assert.ok(w.events.some(e=>e.type==='skill'&&e.kind==='shieldQuake'));}}
});
test('jump height avoids shield quake but not sword whirlwind',()=>{
  for(const id of [0,1]){const w=createWorld();w.training=true;const p=w.fighters[id],q=w.fighters[1-id];Object.assign(p,{x:0,z:5});Object.assign(q,{x:2,z:5,y:1.6,vy:6,grounded:false});cast(w,p);assert.equal(q.hp,id===1?100:78);}
});
test('holding or being held prevents dodge and special exploitation',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;Object.assign(p,{x:0,z:4});Object.assign(q,{x:1.2,z:4});grab(w,p);advance(w,.3);
  for(const f of [p,q]){const energy=f.energy;dodge(f);skill(w,f);assert.equal(f.dodgeTime,0);assert.equal(f.skillTime,0);assert.equal(f.energy,energy);}
});
for(const deck of PLATFORMS)test(`single jump lands and stays on ${deck.id}`,()=>{
  const p=createFighter(0,deck.x,deck.z);jump(p);let apex=0;
  for(let i=0;i<240;i++){stepFighter(p,{},STEP);apex=Math.max(apex,p.y);}
  assert.ok(apex>deck.top+.8);assert.equal(p.support,deck.id);assert.equal(p.y,deck.top);assert.equal(p.grounded,true);
});
test('jump while moving sideways reaches the left green deck',()=>{
  const p=createFighter(0,-3,0);jump(p);
  for(let i=0;i<70;i++)stepFighter(p,{x:-1},STEP);
  for(let i=0;i<180;i++)stepFighter(p,{},STEP);
  assert.equal(p.support,'deck-left');assert.equal(p.y,1.6);
});
test('walking off a deck falls; no stale grounded state',()=>{
  const p=createFighter(0,-6,0);p.y=1.6;p.support='deck-left';
  for(let i=0;i<240;i++)stepFighter(p,{x:1},STEP);
  assert.equal(p.y,0);assert.equal(p.support,'ground');
});
test('second jump fires in midair; third jump is rejected',()=>{
  const p=createFighter(0,-3,3);jump(p);
  for(let i=0;i<60;i++)stepFighter(p,{},STEP);
  jump(p);stepFighter(p,{},STEP);assert.equal(p.jumps,2);assert.ok(p.vy>12);
  for(let i=0;i<20;i++)stepFighter(p,{},STEP);
  const before=p.vy;jump(p);stepFighter(p,{},STEP);assert.ok(p.vy<before);
});
test('ladder carries the fighter from the dock onto a green deck',()=>{
  const p=createFighter(0,-6,1.7);for(let i=0;i<80;i++)stepFighter(p,{z:-1},STEP);assert.equal(p.y,1.6);assert.ok(p.support==='ladder-top'||p.support==='deck-left');
});
test('ladder can also carry the fighter back down after walking onto the deck',()=>{
  const p=createFighter(0,-6,1.7);for(let i=0;i<80;i++)stepFighter(p,{z:-1},STEP);for(let i=0;i<80;i++)stepFighter(p,{z:1},STEP);assert.equal(p.y,0);assert.equal(p.support,'ground');
});
test('sword causes one hit with knockback and does not damage at long range',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;q.x=1.7;
  attack(w,p);advance(w,.4);assert.equal(q.hp,91);assert.ok(q.x>1.7);
  q.x=9;advance(w,1);attack(w,p);advance(w,.4);assert.equal(q.hp,91);
});
test('sword cannot hit an opponent on another height',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;q.x=0;p.z=q.z=-2.2;q.y=2.2;q.support='deck-center';
  attack(w,p);advance(w,.25);assert.equal(q.hp,100);
});
test('bomb explodes, damages an opponent, and respects cooldown',()=>{
  const w=createWorld();w.training=true;w.crates=[];const [p,q]=w.fighters;p.x=-3;p.z=3;q.x=3;q.z=3;
  p.item='bomb';
  bomb(w,p);bomb(w,p);assert.equal(w.bombs.length,1);advance(w,1.5);assert.equal(w.bombs.length,0);assert.equal(q.hp,80);assert.equal(p.hp,100);assert.ok(p.energy>1);assert.ok(Number.isFinite(p.energy));
});
test('poison and virus bottles create lingering clouds instead of bomb explosions',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=-3;p.z=3;p.item='poison';bomb(w,p);advance(w,1.5);assert.equal(w.bombs.length,0);assert.equal(w.clouds.length,1);assert.ok(w.events.some(e=>e.type==='cloud'));assert.equal(w.events.some(e=>e.type==='explosion'),false);
  const w2=createWorld();w2.training=true;const p2=w2.fighters[0];p2.x=-3;p2.z=3;p2.item='virus';bomb(w2,p2);advance(w2,1.5);assert.equal(w2.clouds[0].kind,'virus');assert.ok(w2.clouds[0].radius>2.2);
});
test('ice bottle creates a blue slow cloud instead of a bomb explosion',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=-3;p.z=3;q.x=-1.8;q.z=3;p.item='slow';bomb(w,p);advance(w,1.5);assert.equal(w.bombs.length,0);assert.equal(w.clouds.length,1);assert.equal(w.clouds[0].kind,'slow');assert.equal(w.events.some(e=>e.type==='explosion'),false);assert.ok(q.slowTime>0);
});
test('a fighter can be hurt by their own nearby bomb and poison cloud',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=0;p.z=0;p.item='bomb';bomb(w,p);Object.assign(w.bombs[0],{x:0,y:.1,z:0});advance(w,.05);assert.ok(p.hp<100);assert.equal(p.hurtKind,'bomb');assert.ok(p.burnTime>0);
  const w2=createWorld();w2.training=true;const p2=w2.fighters[0];p2.x=0;p2.z=0;p2.item='poison';bomb(w2,p2);Object.assign(w2.bombs[0],{x:0,y:.1,z:0});advance(w2,.05);assert.ok(p2.poisonTime>0);assert.equal(p2.hurtKind,'poison');
});
test('virus status has its own visible duration and temporary status timers expire',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];w.clouds.push({id:0,owner:1,kind:'virus',x:p.x,y:0,z:p.z,life:.05,radius:2.8,tick:0});step(w);assert.ok(p.virusTime>0);assert.ok(p.slowTime>0);
  w.clouds.length=0;p.burnTime=.1;p.virusTime=.1;advance(w,.2);assert.equal(p.burnTime,0);assert.equal(p.virusTime,0);
});
test('holding guard reduces sword damage without negating it',()=>{
  const w=createWorld();w.training=true;w.online=true;w.remoteInput={x:0,z:0,guard:true};const [p,q]=w.fighters;p.x=0;q.x=1.7;
  q.guardPrev=true;attack(w,p);advance(w,.4);assert.equal(q.hp,98);assert.ok(q.hp>91);assert.ok(w.events.some(e=>e.type==='guard'||e.type==='parry'));
});
test('skill deals area damage once and obeys cooldown',()=>{
  const w=createWorld();w.training=true;w.fighters[0].x=0;w.fighters[1].x=2;
  skill(w,w.fighters[0]);skill(w,w.fighters[0]);assert.equal(w.fighters[1].hp,100);assert.equal(w.fighters[0].skillCD,1.35);assert.ok(w.fighters[0].energy<1);advance(w,.45);assert.equal(w.fighters[1].hp,78);assert.equal(w.events.filter(e=>e.type==='skill').length,1);
});
test('heavy attack breaks guard and knocks down',()=>{
  const w=createWorld();w.training=true;w.online=true;w.remoteInput={x:0,z:0,guard:true};const [p,q]=w.fighters;p.x=0;q.x=1.7;
  heavy(w,p);advance(w,.6);assert.ok(q.hp<100);assert.equal(q.blocking,false);assert.ok(q.knocked>0);assert.ok(w.events.some(e=>e.type==='guardBreak'));
});
test('heavy hit does not report guard break against an unguarded fighter',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;q.x=1.7;heavy(w,p);advance(w,.35);assert.ok(q.hp<100);assert.equal(w.events.some(e=>e.type==='guardBreak'),false);
});
test('air light attack can hit an opponent on a nearby level',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;p.y=1.6;p.grounded=false;q.x=1.8;q.y=0;attack(w,p);advance(w,.2);assert.ok(q.hp<100);assert.ok(w.events.some(e=>e.type==='slash'&&e.attackType==='air'));
});
test('air heavy attack becomes a falling slam and knocks down',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;p.y=1.6;p.grounded=false;q.x=1.8;heavy(w,p);advance(w,.4);assert.ok(q.hp<100);assert.ok(q.knocked>0);assert.ok(w.events.some(e=>e.type==='slash'&&e.attackType==='slam'));
});
test('strong sword gives a longer melee reach',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;q.x=3;p.weapon='sword';p.attackBoost=1.35;p.attackBoostTime=10;attack(w,p);advance(w,.4);assert.ok(q.hp<100);
});
test('grab beats guard and produces a throw hit',()=>{
  const w=createWorld();w.training=true;w.online=true;w.remoteInput={x:0,z:0,guard:true};const [p,q]=w.fighters;p.x=0;q.x=1.2;
  grab(w,p);advance(w,.3);assert.ok(q.hp<100);assert.equal(p.grabbedTarget,q.id);attack(w,p);assert.ok(w.events.some(e=>e.type==='throwHit'));
});
test('knockdown cancels queued actions and falls normally before wakeup',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;q.x=1.7;q.y=1.4;q.grounded=false;heavy(w,p);advance(w,.35);assert.ok(q.knocked>0);const height=q.y;attack(w,q);jump(q);assert.equal(q.attackTime,0);assert.equal(q.jumpBuffer,0);advance(w,1);assert.ok(q.y<height);assert.ok(w.events.some(e=>e.type==='wakeup'));
});
test('directional inputs create dash and uppercut attacks',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];attack(w,p,{x:1,z:0});assert.equal(p.attackType,'dash');advance(w,.5);heavy(w,p,{x:0,z:-1});assert.equal(p.attackType,'upper');assert.ok(w.events.some(e=>e.type==='slash'&&e.attackType==='upper'));
});
test('light attacks buffer and chain into a three-hit combo',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];attack(w,p);advance(w,.1);attack(w,p);advance(w,.3);assert.equal(p.combo,1);attack(w,p);advance(w,.3);assert.equal(p.combo,2);
});
test('red dash and blue shield bash are distinct character moves',()=>{
  const w=createWorld();w.training=true;const [red,blue]=w.fighters;attack(w,red,{x:1});assert.equal(red.attackType,'dash');attack(w,blue,{x:-1});assert.equal(blue.attackType,'shieldBash');assert.ok(w.events.some(e=>e.type==='shieldBash'&&e.id===blue.id));
});
test('a grabbed opponent can be carried while walking and actively thrown',()=>{
  const w=createWorld();w.training=true;const [holder,target]=w.fighters;holder.x=0;holder.z=0;target.x=1.2;target.z=0;grab(w,holder);advance(w,.3);assert.equal(holder.grabbedTarget,target.id);const start=holder.x;advance(w,.4,{x:1});assert.ok(holder.x>start+.5);assert.ok(Math.abs(Math.hypot(holder.x-target.x,holder.z-target.z)-.72)<.1);heavy(w,holder);assert.equal(holder.grabbedTarget,null);assert.ok(w.events.some(e=>e.type==='throwHit'&&e.id===target.id&&e.high));
});
test('a grabbed fighter can mash attacks to escape',()=>{
  const w=createWorld();w.training=true;const [holder,target]=w.fighters;holder.x=0;holder.z=0;target.x=1.2;target.z=0;grab(w,holder);advance(w,.3);attack(w,target);attack(w,target);attack(w,target);assert.equal(target.grabbedBy,null);assert.equal(holder.grabbedTarget,null);assert.ok(w.events.some(e=>e.type==='grabEscape'&&e.id===target.id));
});
test('nearby containers can be lifted and thrown forward or upward',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0],c=w.crates[0];p.x=c.x;p.z=c.z;grab(w,p);assert.deepEqual(p.carrying,{kind:'crate',id:c.id});assert.equal(c.heldBy,p.id);attack(w,p);assert.equal(p.carrying,null);assert.equal(w.props.length,1);assert.ok(w.props[0].vx!==0);
  const c2=w.crates[1];p.x=c2.x;p.z=c2.z;grab(w,p);heavy(w,p);assert.equal(w.props.length,2);assert.ok(w.props[1].vy>=12);
});
test('three special levels spend matching energy and scale damage',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.energy=3;p.x=0;q.x=2;cast(w,p,3);assert.ok(p.energy<1);assert.equal(p.skillLevel,3);assert.equal(q.hp,58);assert.ok(w.events.some(e=>e.type==='skill'&&e.level===3));
});
test('container classes use separate loot pools',()=>{
  const pools={barrel:['bomb','poison','virus','slow'],crate:['meat','beer','bomb'],chest:['sword','beer','meat']};for(const kind of Object.keys(pools)){const w=createWorld();w.training=true;const p=w.fighters[0],c=w.crates[0];c.kind=kind;p.x=c.x;p.z=c.z;cast(w,p);assert.ok(pools[kind].includes(w.events.find(e=>e.type==='break').item));}
});
test('port stage schedules cannon fire and a warning before the wave',()=>{
  const w=createWorld();w.nextCannonTick=1;w.nextWaveTick=1;step(w);assert.equal(w.cannonballs.length,1);assert.ok(w.waveWarning>0);assert.ok(w.events.some(e=>e.type==='hazardWarn'&&e.kind==='cannon'),'winds up first');assert.equal(w.events.some(e=>e.type==='cannon'),false,'not fired yet');assert.ok(w.events.some(e=>e.type==='waveWarning'));
  advance(w,CANNON_WARN+.05);assert.ok(w.events.some(e=>e.type==='cannon'),'fires after the warning');
});
test('the expanded dock has more walkable space',()=>{
  const p=createFighter(0,0,0);for(let i=0;i<5000;i++)stepFighter(p,{x:1},STEP);assert.ok(p.x>12);assert.ok(p.x<=14.5);
});
test('successful hits build energy for another special',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.energy=0;p.x=0;q.x=1.7;attack(w,p);advance(w,.4);assert.ok(p.energy>0);assert.ok(p.energy<=p.energyMax);
});
test('crate releases a random pickup that can be collected',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=-6;p.z=3;p.hp=60;
  cast(w,p);assert.ok(w.crates[0].hp<=0);const item=w.events.find(e=>e.type==='break').item;assert.equal(w.pickups.length,0);if(item==='meat')assert.equal(p.hp,80);else if(item==='beer')assert.ok(p.attackBoostTime>0);else assert.equal(p.item,item);
});
test('one nearby sword attack opens a crate and pickup remains available',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=-6;p.z=3;p.hp=60;attack(w,p);advance(w,.4);assert.equal(w.crates[0].hp,0);assert.equal(w.pickups.length,0);assert.ok(p.item||p.hp===80||p.attackBoostTime>0);
});
test('broken crate respawns as a falling crate after a slower random delay',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=-6;p.z=3;
  cast(w,p);assert.equal(w.crates[0].hp,0);advance(w,9);assert.equal(w.crates[0].hp,0);advance(w,9);assert.equal(w.crates[0].hp,1);assert.ok(w.crates[0].y>=.48);assert.ok(w.events.some(e=>e.type==='crateDrop'||e.type==='crateLand'));
});
test('beer temporarily increases sword damage',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;q.x=1.7;p.item='beer';bomb(w,p);attack(w,p);advance(w,.4);assert.ok(q.hp<91);assert.ok(p.attackBoostTime>0);
});
test('beer pickup auto-activates and does not block the next item',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=0;p.z=0;w.pickups.push({type:'beer',x:0,z:0,y:0,life:10});advance(w,.05);assert.equal(p.item,null);assert.ok(p.attackBoostTime>0);w.pickups.push({type:'bomb',x:0,z:0,y:0,life:10});advance(w,.05);assert.equal(p.item,'bomb');
});
test('poison damage ticks and slow reduces movement',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.poisonTime=2;p.poisonTick=0;p.slowTime=2;const before=p.x;advance(w,1.05,{x:1});assert.equal(p.hp,96);assert.ok(p.x-before<5);
});
test('poison and ice status disable dodge until they wear off',()=>{
  const p=createFighter(0,0,0);p.poisonTime=1;dodge(p);assert.equal(p.dodgeTime,0);p.poisonTime=0;p.slowTime=1;dodge(p);assert.equal(p.dodgeTime,0);p.slowTime=0;dodge(p);assert.ok(p.dodgeTime>0);
});
test('strong sword and beer have different attack boosts and durations',()=>{
  const sword=createWorld();const beer=createWorld();const p=sword.fighters[0],b=beer.fighters[0];p.item='sword';b.item='beer';bomb(sword,p);bomb(beer,b);assert.equal(p.attackBoost,1.35);assert.equal(p.attackBoostTime,10);assert.equal(b.attackBoost,1.55);assert.equal(b.attackBoostTime,8);
});
test('three-life mode respawns after losing a life',()=>{
  const w=createWorld();w.stock=true;w.fighters[0].lives=3;w.fighters[0].hp=0;w.fighters[0].knocked=.8;w.fighters[0].attackTime=.3;step(w);assert.equal(w.fighters[0].lives,2);assert.ok(w.fighters[0].respawnTimer>0);advance(w,1);assert.equal(w.fighters[0].hp,100);assert.equal(w.fighters[0].respawnTimer,0);assert.equal(w.fighters[0].knocked,0);assert.equal(w.fighters[0].attackTime,0);
});
test('AI approaches and can damage the player; zero health ends round',()=>{
  const w=createWorld();advance(w,8);assert.ok(w.fighters[0].hp<100);
  w.fighters[0].hp=0;step(w);assert.equal(w.ended,true);assert.equal(w.winner,1);
});
