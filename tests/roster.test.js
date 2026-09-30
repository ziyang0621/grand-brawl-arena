import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,attack,heavy,skill} from '../arena-core.js';
import {CHARACTERS,CHARACTER_IDS,STAGE_IDS} from '../arena-roster.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const duel=(chars,options={})=>{const w=createWorld({chars,...options});w.training=true;w.crates=[];return w;};

test('roster has six distinct characters and three stages',()=>{
  assert.equal(CHARACTER_IDS.length,6);assert.equal(STAGE_IDS.length,3);
  assert.equal(new Set(CHARACTER_IDS.map(id=>CHARACTERS[id].skill)).size,6);
  assert.equal(new Set(CHARACTER_IDS.map(id=>CHARACTERS[id].name)).size,6);
  assert.equal(new Set(CHARACTER_IDS.map(id=>CHARACTERS[id].moveAttack)).size,4,'four attack styles, shared by the two ranged and two dash fighters');
});
test('default world keeps the original swordsman vs guardian pairing',()=>{
  const w=createWorld();assert.deepEqual(w.fighters.map(p=>p.char),['swordsman','guardian']);assert.equal(w.bestOf,1);assert.equal(w.intro,0);
});
test('gunner move attack fires a projectile that hits at range',()=>{
  const w=duel(['gunner','guardian']);const [p,q]=w.fighters;Object.assign(p,{x:-4,z:2,fx:1,fz:0});Object.assign(q,{x:2,z:2});
  attack(w,p,{x:1});assert.equal(p.attackType,'shot');advance(w,.2);assert.equal(w.shots.length,1);
  advance(w,.4);assert.ok(q.hp<100);assert.equal(w.shots.length,0);assert.ok(w.events.some(e=>e.type==='shotHit'));
});
test('a guarded shot is reduced from behind too and never passes through',()=>{
  const damageTaken=guard=>{const w=duel(['gunner','guardian']);w.online=true;w.remoteInput={x:0,z:0,guard};w.nextCannonTick=w.nextWaveTick=1e9;
    const [a,b]=w.fighters;Object.assign(a,{x:-4,z:2,fx:1,fz:0});Object.assign(b,{x:0,z:2,fx:1,fz:0});
    attack(w,a,{x:1});advance(w,.6);assert.equal(w.shots.length,0);return 100-b.hp;};
  assert.ok(damageTaken(true)<damageTaken(false));
});
test('brawler rush lunges forward and hits harder than a first jab',()=>{
  const w=duel(['brawler','guardian']);const [p,q]=w.fighters;Object.assign(p,{x:0,z:2,fx:1,fz:0});Object.assign(q,{x:2.4,z:2});
  attack(w,p,{x:1});assert.equal(p.attackType,'rush');assert.ok(p.vx>8);advance(w,.3,{x:1});assert.ok(100-q.hp>=13);
});
test('only the guardian turns move+U into a shield bash',()=>{
  for(const [char,type] of [['guardian','shieldBash'],['brawler','heavy'],['gunner','heavy'],['swordsman','heavy']]){
    const w=duel([char,'swordsman']);heavy(w,w.fighters[0],{x:1});assert.equal(w.fighters[0].attackType,type);
  }
});
test('brawler special lands ahead of the caster, gunner barrage lands on the target',()=>{
  const w=duel(['brawler','guardian']);const [p,q]=w.fighters;Object.assign(p,{x:0,z:2,fx:1,fz:0});Object.assign(q,{x:1.6,z:2});
  skill(w,p,1);assert.ok(Math.abs(p.pendingSkill.cx-1.6)<.01);advance(w,.5);assert.ok(q.hp<=76);
  const g=duel(['gunner','guardian']);const [a,b]=g.fighters;Object.assign(a,{x:-5,z:2,fx:1,fz:0});Object.assign(b,{x:3,z:2});
  skill(g,a,1);assert.ok(Math.abs(g.fighters[0].pendingSkill.cx-3)<.01);advance(g,.6);assert.ok(b.hp<100);
});
test('barrage can be dodged by leaving the marked target circle',()=>{
  const g=duel(['gunner','guardian']);const [a,b]=g.fighters;Object.assign(a,{x:-5,z:2,fx:1,fz:0});Object.assign(b,{x:3,z:2});
  skill(g,a,1);b.x=8;advance(g,.6);assert.equal(b.hp,100);
});
test('best-of-three: K.O. awards a round, freezes, then restarts with an intro',()=>{
  const w=createWorld({bestOf:3,roundTime:99});w.crates=[];const [p,q]=w.fighters;q.hp=1;Object.assign(p,{x:0,z:2,fx:1});Object.assign(q,{x:1.5,z:2});
  attack(w,p);advance(w,.3);assert.equal(w.ended,false);assert.deepEqual(w.wins,[1,0]);assert.ok(w.roundOver>0);
  assert.ok(w.events.some(e=>e.type==='ko'&&e.winner===0));
  advance(w,3);assert.equal(w.roundNo,2);assert.equal(w.fighters[1].hp,100);assert.ok(w.intro>0);assert.equal(w.time,99);
  const beforeIntro=w.fighters[0].attackTime;attack(w,w.fighters[0]);assert.equal(w.fighters[0].attackTime,beforeIntro);
  advance(w,2);assert.equal(w.intro,0);assert.ok(w.events.some(e=>e.type==='fight'));
  // The CPU now fights back in round two, so shield the player from it for the instant of this scripted strike.
  w.fighters[1].hp=1;Object.assign(w.fighters[0],{x:0,z:2,fx:1,invuln:1,stun:0,knocked:0,attackCD:0});Object.assign(w.fighters[1],{x:1.5,z:2,attackTime:0,stun:0});attack(w,w.fighters[0]);advance(w,.3);
  assert.deepEqual(w.wins,[2,0]);assert.equal(w.ended,false);advance(w,2.6);assert.equal(w.ended,true);assert.equal(w.winner,0);
});
test('time-up awards the round to the healthier fighter',()=>{
  const w=createWorld({bestOf:3,roundTime:1});w.crates=[];w.fighters[0].hp=60;w.fighters[1].hp=70;w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  advance(w,1.1);assert.deepEqual(w.wins,[0,1]);assert.ok(w.events.some(e=>e.type==='ko'&&e.timeUp));
});

test('flame kick burns and knocks back whoever stands in front of the cook',()=>{
  const w=duel(['cook','guardian']);const [p,q]=w.fighters;
  Object.assign(p,{x:0,z:3,fx:1,fz:0,energy:3});Object.assign(q,{x:1.8,z:3});
  skill(w,p,1);advance(w,.8);
  assert.ok(q.hp<100);assert.ok(q.burnTime>0||w.events.some(e=>e.type==='hit'&&e.id===q.id));
  assert.ok(w.events.some(e=>e.type==='skillCharge'&&e.kind==='flameKick'));
});
test('thunder strikes the targeted area and slows opponents that are not guarding',()=>{
  const w=duel(['stormcaller','swordsman']);const [p,q]=w.fighters;
  Object.assign(p,{x:0,z:3,fx:1,fz:0,energy:3});Object.assign(q,{x:5,z:3});
  skill(w,p,1);advance(w,.9);
  assert.ok(q.hp<100);assert.ok(q.slowTime>0);
  const g=duel(['stormcaller','swordsman']);Object.assign(g.fighters[0],{x:0,z:3,fx:1,fz:0,energy:3});Object.assign(g.fighters[1],{x:5,z:3});
  skill(g,g.fighters[0],1);advance(g,.6,{});g.fighters[1].blocking=false;
});
test('the storm caller fires slower, weaker bolts that slow on hit',()=>{
  const w=duel(['stormcaller','swordsman']);const [p,q]=w.fighters;
  Object.assign(p,{x:0,z:3,fx:1,fz:0});Object.assign(q,{x:6,z:3});
  attack(w,p,{x:1});advance(w,.2);
  const shot=w.shots[0];assert.ok(shot);assert.equal(shot.style,'bolt');assert.ok(Math.hypot(shot.vx,shot.vz)<15);
  advance(w,.8);assert.ok(q.hp<100);assert.ok(q.slowTime>0);
  const g=createWorld({chars:['gunner','swordsman']});g.training=true;g.crates=[];Object.assign(g.fighters[0],{x:0,z:3,fx:1,fz:0});attack(g,g.fighters[0],{x:1});advance(g,.2);
  assert.ok(Math.hypot(g.shots[0].vx,g.shots[0].vz)>Math.hypot(shot.vx,shot.vz),'gunner bullets are faster');
});
test('every pairing of the six fighters finishes a match without invalid state',()=>{
  for(const a of CHARACTER_IDS)for(const b of CHARACTER_IDS){
    const w=createWorld({chars:[a,b],stage:'port'});w.autoplay=true;let t=0;while(!w.ended&&t<110){step(w);t+=STEP;}
    assert.ok(w.ended,`${a} vs ${b}`);for(const p of w.fighters)assert.ok(Number.isFinite(p.hp+p.x+p.z),`${a} vs ${b}`);
  }
});

// Face rig: runs in Node with a stub DOM-free three.js scene.
import {buildFighter} from '../arena-models.js';
test('every character has a face whose mouth is visible on the first frame',()=>{
  globalThis.document??={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}}),set:()=>true}),width:0,height:0,style:{}})};
  for(const id of CHARACTER_IDS){
    const m=buildFighter(id,0,null);
    const visible=Object.entries(m.face.mouths).filter(([,g])=>g.visible).map(([k])=>k);
    assert.equal(visible.length,1,`${id}: ${visible}`);
    assert.equal(m.face.eyes.length,2);
  }
});
test('expressions swap eyes and mouths and never show two mouths at once',()=>{
  globalThis.document??={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}}),set:()=>true}),width:0,height:0,style:{}})};
  const m=buildFighter('swordsman',0,null);
  for(const [eyes,mouth] of [['happy','open'],['hurt','shout'],['ko','tongue'],['daze','o'],['wide','grit'],['open','frown']]){
    for(let i=0;i<20;i++)m.face.update({lid:0,tilt:.5,raise:0,gx:0,gy:0,eyes,mouth},1/60);
    assert.equal(Object.values(m.face.mouths).filter(g=>g.visible).length,1);
    assert.equal(m.face.mouths[mouth].visible,true,mouth);
    const e=m.face.eyes[0];
    assert.equal(e.happy.visible,eyes==='happy');assert.equal(e.hurt.visible,eyes==='hurt');assert.equal(e.ko.visible,eyes==='ko');assert.equal(e.daze.visible,eyes==='daze');
    assert.equal(e.white.visible,eyes==='open'||eyes==='wide'||eyes==='daze');
  }
});

import {updateGuard} from '../arena-guards.js';
test('each character has its own guard that only shows while blocking and flashes on a hit',()=>{
  globalThis.document??={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}}),set:()=>true}),width:0,height:0,style:{}})};
  const looks=new Set();
  for(const id of CHARACTER_IDS){
    const m=buildFighter(id,0,null),g=m.guard;
    assert.equal(g.root.visible,false,`${id} hidden by default`);
    for(let i=0;i<30;i++)updateGuard(g,true,i/60,1/60);
    assert.equal(g.root.visible,true);assert.ok(g.on>.9);
    updateGuard(g,true,1,1/60,true);assert.ok(g.flash>.9,'flash on hit');
    for(let i=0;i<120;i++)updateGuard(g,false,2+i/60,1/60);
    assert.equal(g.root.visible,false,`${id} hidden after release`);
    let meshes=0;g.root.traverse(o=>{if(o.isMesh)meshes++;});looks.add(g.pose+':'+Object.keys(g.parts).sort().join());
    assert.ok(meshes>=8,`${id} guard has real geometry (${meshes})`);
    g.root.traverse(o=>{if(o.isMesh&&o.material.transparent&&o.material.opacity<.5&&o.material.opacity>0&&!o.userData.ink)assert.fail(`${id} guard has a glass-like part`);});
  }
  assert.equal(looks.size,CHARACTER_IDS.length,'no two guards share a build');
});

import {lockGeometry,headGeometry} from '../arena-face.js';
test('hair locks taper to a point and heads narrow toward the chin',()=>{
  const g=lockGeometry([[0,0,0],[0,.3,-.1],[0,.6,-.3]],.12,0),p=g.attributes.position;
  const ring=i=>{let m=0;for(let j=0;j<9;j++){const k=i*9+j;m=Math.max(m,Math.hypot(p.getX(k)-p.getX(i*9),p.getZ(k)-p.getZ(i*9)));}return m;};
  assert.ok(ring(18)<ring(3)*.3,'tip is much thinner than the root');
  const h=headGeometry(.45),q=h.attributes.position;let chin=0,cheek=0;
  for(let i=0;i<q.count;i++){const y=q.getY(i),x=Math.abs(q.getX(i));if(y<-.4)chin=Math.max(chin,x);if(Math.abs(y)<.05)cheek=Math.max(cheek,x);}
  assert.ok(chin<cheek*.6,'pointed chin');
});
