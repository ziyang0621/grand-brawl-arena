import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,PLATFORMS,createWorld,createFighter,stepFighter,step,jump,attack,heavy,grab,bomb,skill,dodge} from '../arena-core.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
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
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=-3;p.z=3;q.x=3;q.z=3;
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
  skill(w,w.fighters[0]);skill(w,w.fighters[0]);assert.equal(w.fighters[1].hp,78);assert.equal(w.fighters[0].skillCD,1.35);assert.ok(w.fighters[0].energy<1);
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
  grab(w,p);advance(w,.8);assert.ok(q.hp<100);assert.ok(w.events.some(e=>e.type==='throwHit'));
});
test('knockdown cancels queued actions and falls normally before wakeup',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.x=0;q.x=1.7;q.y=1.4;q.grounded=false;heavy(w,p);advance(w,.35);assert.ok(q.knocked>0);const height=q.y;attack(w,q);jump(q);assert.equal(q.attackTime,0);assert.equal(q.jumpBuffer,0);advance(w,1);assert.ok(q.y<height);assert.ok(w.events.some(e=>e.type==='wakeup'));
});
test('directional inputs create dash and uppercut attacks',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];attack(w,p,{x:1,z:0});assert.equal(p.attackType,'dash');advance(w,.5);heavy(w,p,{x:0,z:-1});assert.equal(p.attackType,'upper');assert.ok(w.events.some(e=>e.type==='slash'&&e.attackType==='upper'));
});
test('nearby containers can be lifted and thrown forward or upward',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0],c=w.crates[0];p.x=c.x;p.z=c.z;grab(w,p);assert.deepEqual(p.carrying,{kind:'crate',id:c.id});assert.equal(c.heldBy,p.id);attack(w,p);assert.equal(p.carrying,null);assert.equal(w.props.length,1);assert.ok(w.props[0].vx!==0);
  const c2=w.crates[1];p.x=c2.x;p.z=c2.z;grab(w,p);heavy(w,p);assert.equal(w.props.length,2);assert.ok(w.props[1].vy>=12);
});
test('three special levels spend matching energy and scale damage',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.energy=3;p.x=0;q.x=2;skill(w,p,3);assert.ok(p.energy<1);assert.equal(p.skillLevel,3);assert.equal(q.hp,58);assert.ok(w.events.some(e=>e.type==='skill'&&e.level===3));
});
test('container classes use separate loot pools',()=>{
  const pools={barrel:['bomb','poison','virus','slow'],crate:['meat','beer','bomb'],chest:['sword','beer','meat']};for(const kind of Object.keys(pools)){const w=createWorld();w.training=true;const p=w.fighters[0],c=w.crates[0];c.kind=kind;p.x=c.x;p.z=c.z;skill(w,p);assert.ok(pools[kind].includes(w.pickups[0].type));}
});
test('port stage schedules cannon fire and a warning before the wave',()=>{
  const w=createWorld();w.nextCannonTick=1;w.nextWaveTick=1;step(w);assert.equal(w.cannonballs.length,1);assert.ok(w.waveWarning>0);assert.ok(w.events.some(e=>e.type==='cannon'));assert.ok(w.events.some(e=>e.type==='waveWarning'));
});
test('the expanded dock has more walkable space',()=>{
  const p=createFighter(0,0,0);for(let i=0;i<5000;i++)stepFighter(p,{x:1},STEP);assert.ok(p.x>12);assert.ok(p.x<=14.5);
});
test('successful hits build energy for another special',()=>{
  const w=createWorld();w.training=true;const [p,q]=w.fighters;p.energy=0;p.x=0;q.x=1.7;attack(w,p);advance(w,.4);assert.ok(p.energy>0);assert.ok(p.energy<=p.energyMax);
});
test('crate releases a random pickup that can be collected',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=-6;p.z=3;p.hp=60;
  skill(w,p);assert.ok(w.crates[0].hp<=0);assert.equal(w.pickups.length,1);const item=w.pickups[0].type;advance(w,.05);assert.equal(w.pickups.length,0);if(item==='meat')assert.equal(p.hp,80);else if(item==='beer')assert.ok(p.attackBoostTime>0);else assert.equal(p.item,item);
});
test('one nearby sword attack opens a crate and pickup remains available',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=-6;p.z=3;p.hp=60;attack(w,p);advance(w,.4);assert.equal(w.crates[0].hp,0);assert.equal(w.pickups.length,0);assert.ok(p.item||p.hp===80||p.attackBoostTime>0);
});
test('broken crate respawns as a falling crate after a slower random delay',()=>{
  const w=createWorld();w.training=true;const p=w.fighters[0];p.x=-6;p.z=3;
  skill(w,p);assert.equal(w.crates[0].hp,0);advance(w,9);assert.equal(w.crates[0].hp,0);advance(w,9);assert.equal(w.crates[0].hp,1);assert.ok(w.crates[0].y>=.48);assert.ok(w.events.some(e=>e.type==='crateDrop'||e.type==='crateLand'));
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
