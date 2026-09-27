import test from 'node:test';
import assert from 'node:assert/strict';
import {STEP,createWorld,step,skill,attack,jump,dodge} from '../arena-core.js';

function duel(casterId=0){
  const w=createWorld();w.training=true;w.online=true;w.crates=[];
  const p=w.fighters[casterId],q=w.fighters[1-casterId];
  Object.assign(p,{x:0,z:5});Object.assign(q,{x:2,z:5});
  return {w,p,q};
}
function advance(w,seconds,input={}){for(let i=0;i<Math.round(seconds/STEP);i++)step(w,input);}

test('each special level warns before damage and spends energy only once',()=>{
  for(const level of [1,2,3]){
    const {w,p,q}=duel();p.energy=3;skill(w,p,level);skill(w,p,level);
    assert.equal(p.energy,3-level);assert.equal(q.hp,100);
    assert.equal(w.events.filter(e=>e.type==='skillCharge').length,1);
    advance(w,p.skillWindup-.05);assert.equal(q.hp,100);
    advance(w,.1);assert.equal(q.hp,100-(12+level*10));
    advance(w,.6);assert.equal(w.events.filter(e=>e.type==='skill').length,1);
  }
});
test('a defender can leave the warned radius before the special releases',()=>{
  const {w,p,q}=duel();w.remoteInput={x:1};skill(w,p);advance(w,.5);
  assert.ok(q.x>3.4);assert.equal(q.hp,100);
});
test('jumping after seeing shield quake avoids its damage',()=>{
  const {w,p,q}=duel(1);skill(w,p);advance(w,.2);jump(q);advance(w,.25);
  assert.ok(q.y>1.2);assert.equal(q.hp,100);assert.ok(w.events.some(e=>e.type==='skill'));
});
test('a correctly timed dodge avoids a special even inside the warned radius',()=>{
  const {w,p,q}=duel(1);skill(w,p);advance(w,.3);q.fx=0;q.fz=1;dodge(q);advance(w,.12);
  assert.ok(Math.hypot(q.x-p.x,q.z-p.z)<4.1);assert.equal(q.hp,100);
});
test('a melee hit interrupts charging and no delayed damage survives',()=>{
  const {w,p,q}=duel();skill(w,p);attack(w,q);advance(w,.3);
  assert.ok(p.hp<100);assert.equal(p.pendingSkill,null);assert.equal(p.skillTime,0);
  advance(w,.8);assert.equal(q.hp,100);assert.equal(w.events.some(e=>e.type==='skill'),false);
  assert.ok(w.events.some(e=>e.type==='skillCancel'));assert.ok(p.energy<1);
});
test('charging cannot be moved, guarded or jumped out of by the caster',()=>{
  const {w,p}=duel();skill(w,p);jump(p);advance(w,.2,{x:1,z:-1,guard:true});
  assert.equal(p.x,0);assert.equal(p.z,5);assert.equal(p.y,0);assert.equal(p.blocking,false);assert.equal(p.invuln,0);
});
test('a lost life cancels the special rather than firing after respawn',()=>{
  const {w,p,q}=duel();w.stock=true;p.lives=3;skill(w,p);p.hp=0;advance(w,1.2);
  assert.equal(p.pendingSkill,null);assert.equal(p.hp,100);assert.equal(p.lives,2);assert.equal(q.hp,100);
  assert.equal(w.events.some(e=>e.type==='skill'),false);
});
test('charge timing and resolution survive the JSON snapshot used for multiplayer',()=>{
  const {w,p}=duel(1);skill(w,p);advance(w,.2);
  const copy=JSON.parse(JSON.stringify(w));assert.ok(copy.fighters[1].pendingSkill);
  advance(w,.4);advance(copy,.4);assert.deepEqual(copy,w);
});
test('guard chips low-level specials but level three breaks it',()=>{
  for(const level of [1,3]){
    const {w,p,q}=duel();p.energy=3;w.remoteInput={guard:true};q.guardPrev=true;
    skill(w,p,level);advance(w,.8);
    assert.equal(q.hp,level===1?94:58);
    assert.equal(w.events.some(e=>e.type==='guardBreak'),level===3);
  }
});
