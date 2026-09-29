import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,attack,heavy,skill} from '../arena-core.js';
import {CHARACTERS,CHARACTER_IDS,STAGE_IDS} from '../arena-roster.js';
const advance=(w,seconds,input={})=>{for(let t=0;t<seconds;t+=STEP)step(w,input);};
const duel=(chars,options={})=>{const w=createWorld({chars,...options});w.training=true;w.crates=[];return w;};

test('roster has four distinct characters and three stages',()=>{
  assert.equal(CHARACTER_IDS.length,4);assert.equal(STAGE_IDS.length,3);
  assert.equal(new Set(CHARACTER_IDS.map(id=>CHARACTERS[id].moveAttack)).size,4);
  assert.equal(new Set(CHARACTER_IDS.map(id=>CHARACTERS[id].skill)).size,4);
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
  w.fighters[1].hp=1;Object.assign(w.fighters[0],{x:0,z:2,fx:1});Object.assign(w.fighters[1],{x:1.5,z:2});attack(w,w.fighters[0]);advance(w,.3);
  assert.deepEqual(w.wins,[2,0]);assert.equal(w.ended,false);advance(w,2.6);assert.equal(w.ended,true);assert.equal(w.winner,0);
});
test('time-up awards the round to the healthier fighter',()=>{
  const w=createWorld({bestOf:3,roundTime:1});w.crates=[];w.fighters[0].hp=60;w.fighters[1].hp=70;w.nextCannonTick=1e9;w.nextWaveTick=1e9;
  advance(w,1.1);assert.deepEqual(w.wins,[0,1]);assert.ok(w.events.some(e=>e.type==='ko'&&e.timeUp));
});
